window.MarketLinkBackend = (() => {
  const config = window.MARKETLINK_SUPABASE_CONFIG;
  const clientFactory = window.supabase?.createClient;
  const client = config && clientFactory ? clientFactory(config.url, config.publishableKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  }) : null;

  function requireClient() {
    if (!client) throw new Error("MarketLink cloud services are not configured.");
    return client;
  }

  function mapProfile(profile, authUser) {
    return {
      id: authUser.id,
      name: profile?.display_name || authUser.email?.split("@")[0] || "MarketLink user",
      email: authUser.email || "",
      role: profile?.account_type === "seller" || profile?.account_type === "both" ? "seller" : "buyer",
      whatsapp: profile?.whatsapp || "",
      phone: profile?.phone || "",
      location: [profile?.city, profile?.country_code].filter(Boolean).join(", "),
      website: profile?.website || "",
      bio: profile?.bio || "",
      shopName: "",
      shopType: "Individual seller",
      photoUrl: "",
      photoId: profile?.avatar_path || ""
    };
  }

  async function signedMedia(path) {
    if (!path) return "";
    const { data, error } = await requireClient().storage.from("product-media").createSignedUrl(path, 3600);
    if (error) return "";
    return data.signedUrl;
  }

  async function mapProduct(row) {
    const media = Array.isArray(row.product_media) ? [...row.product_media].sort((a, b) => a.sort_order - b.sort_order) : [];
    const image = media.find(item => item.media_type === "image");
    return {
      id: row.id,
      title: row.title,
      category: row.categories?.name || "Other",
      brand: row.brand || "",
      price: Number(row.price),
      oldPrice: 0,
      stock: Number(row.stock_quantity || 0),
      condition: row.condition || "new",
      sku: row.sku || "",
      location: [row.city, row.country_code].filter(Boolean).join(", "),
      delivery: "",
      description: row.description || "",
      emoji: "",
      sellerId: row.seller_id,
      sellerName: row.storefronts?.name || "Marketplace seller",
      whatsapp: row.storefronts?.whatsapp || "",
      createdAt: new Date(row.created_at).getTime(),
      imageId: image?.storage_path || null,
      imageUrl: image ? await signedMedia(image.storage_path) : "",
      status: row.status,
      demo: false
    };
  }

  return {
    client,
    get configured() {
      return Boolean(client);
    },
    async signUp({ email, password, name, accountType }) {
      const { data, error } = await requireClient().auth.signUp({
        email,
        password,
        options: {
          data: { display_name: name }
        }
      });
      if (error) throw error;
      if (data.session && data.user) {
        const { error: profileError } = await requireClient().from("profiles").upsert({
          id: data.user.id,
          display_name: name,
          account_type: accountType
        });
        if (profileError) throw profileError;
      }
      return data;
    },
    async signIn(email, password) {
      const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },
    async signOut() {
      const { error } = await requireClient().auth.signOut();
      if (error) throw error;
    },
    async getSession() {
      const { data, error } = await requireClient().auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async loadProfile(authUser) {
      const { data, error } = await requireClient().from("profiles").select("*").eq("id", authUser.id).maybeSingle();
      if (error) throw error;
      if (!data) {
        const { data: created, error: createError } = await requireClient().from("profiles").insert({
          id: authUser.id,
          display_name: authUser.user_metadata?.display_name || ""
        }).select().single();
        if (createError) throw createError;
        return mapProfile(created, authUser);
      }
      return mapProfile(data, authUser);
    },
    async updateProfile(userId, values) {
      const { data, error } = await requireClient().from("profiles").update(values).eq("id", userId).select().single();
      if (error) throw error;
      return data;
    },
    async loadProducts() {
      const { data, error } = await requireClient().from("products")
        .select("*, categories(name), storefronts(name,whatsapp), product_media(storage_path,media_type,sort_order)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return Promise.all((data || []).map(mapProduct));
    },
    async getCategoryId(name) {
      const { data, error } = await requireClient().from("categories").select("id,name").eq("name", name).maybeSingle();
      if (error) throw error;
      if (data) return data.id;
      const { data: fallback, error: fallbackError } = await requireClient().from("categories").select("id").eq("slug", "other").single();
      if (fallbackError) throw fallbackError;
      return fallback.id;
    },
    async saveProduct(input, file, existingId) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in before managing products.");
      const categoryId = await this.getCategoryId(input.category);
      const payload = {
        seller_id: authData.user.id,
        category_id: categoryId,
        title: input.title,
        description: input.description,
        brand: input.brand || null,
        sku: input.sku || null,
        condition: input.condition || "new",
        price: input.price,
        currency: input.currency || "GHS",
        city: input.city || null,
        stock_quantity: input.stock,
        status: "draft"
      };
      let product;
      if (existingId) {
        const { data, error } = await db.from("products").update(payload).eq("id", existingId).select().single();
        if (error) throw error;
        product = data;
      } else {
        const { data, error } = await db.from("products").insert(payload).select().single();
        if (error) throw error;
        product = data;
      }
      if (file) {
        const extension = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = authData.user.id + "/" + product.id + "/" + crypto.randomUUID() + "." + extension;
        const { error: uploadError } = await db.storage.from("product-media").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });
        if (uploadError) throw uploadError;
        const { error: mediaError } = await db.from("product_media").insert({
          product_id: product.id,
          owner_id: authData.user.id,
          storage_path: path,
          media_type: file.type.startsWith("video/") ? "video" : "image",
          alt_text: input.title
        });
        if (mediaError) throw mediaError;
      }
      const { data: complete, error: readError } = await db.from("products")
        .select("*, categories(name), storefronts(name,whatsapp), product_media(storage_path,media_type,sort_order)")
        .eq("id", product.id).single();
      if (readError) throw readError;
      return mapProduct(complete);
    },
    async saveStorefront(values) {
      const { data: authData, error: authError } = await requireClient().auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in before creating a storefront.");
      const slug = values.name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data, error } = await requireClient().from("storefronts").upsert({
        owner_id: authData.user.id,
        name: values.name,
        slug: slug + "-" + authData.user.id.slice(0, 6),
        description: values.description || "",
        country_code: values.countryCode || null,
        city: values.city || null,
        whatsapp: values.whatsapp || "",
        status: "draft"
      }, { onConflict: "owner_id" }).select().single();
      if (error) throw error;
      return data;
    },
    async startConversation(otherUserId, productId, message) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in to contact a seller.");
      const { data: conversation, error } = await db.from("conversations").insert({
        created_by: authData.user.id,
        product_id: productId || null,
        subject: "Product enquiry"
      }).select().single();
      if (error) throw error;
      const { error: memberError } = await db.from("conversation_members").insert([
        { conversation_id: conversation.id, user_id: authData.user.id },
        { conversation_id: conversation.id, user_id: otherUserId }
      ]);
      if (memberError) throw memberError;
      const { error: messageError } = await db.from("messages").insert({
        conversation_id: conversation.id,
        sender_id: authData.user.id,
        body: message
      });
      if (messageError) throw messageError;
      return conversation;
    }
  };
})();
