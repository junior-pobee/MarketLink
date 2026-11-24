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
      photoId: profile?.avatar_path || "",
      accountStatus: profile?.account_status || "active"
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
    const video = media.find(item => item.media_type === "video");
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
      videoUrl: video ? await signedMedia(video.storage_path) : "",
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
          emailRedirectTo: window.location.origin,
          data: { display_name: name, account_type: accountType }
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
      if (!data.session) throw new Error("Account was created, but instant sign-in is not active. Ask the platform administrator to check the Supabase email confirmation setting.");
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
    async loadCollections(userId) {
      const db = requireClient();
      const [{ data: cart, error: cartError }, { data: wishlist, error: wishlistError }, { data: notes, error: notesError }] = await Promise.all([
        db.from("carts").select("id").eq("user_id", userId).single(),
        db.from("wishlists").select("id").eq("user_id", userId).single(),
        db.from("notifications").select("id,title,body,kind,read_at,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50)
      ]);
      if (cartError) throw cartError;
      if (wishlistError) throw wishlistError;
      if (notesError) throw notesError;
      const [{ data: cartItems, error: cartItemsError }, { data: savedItems, error: savedError }] = await Promise.all([
        db.from("cart_items").select("product_id,quantity").eq("cart_id", cart.id),
        db.from("wishlist_items").select("product_id").eq("wishlist_id", wishlist.id)
      ]);
      if (cartItemsError) throw cartItemsError;
      if (savedError) throw savedError;
      return {
        cart: (cartItems || []).map(item => ({ productId: item.product_id, qty: item.quantity })),
        wishlist: (savedItems || []).map(item => item.product_id),
        notifications: (notes || []).map(note => ({
          id: note.id,
          title: note.title,
          message: note.body,
          icon: "✦",
          read: Boolean(note.read_at),
          createdAt: new Date(note.created_at).getTime()
        }))
      };
    },
    async loadOrders() {
      const { data, error } = await requireClient().from("orders")
        .select("*, order_items(*)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map(order => {
        const drop = order.shipping_address || {};
        return {
          id: order.id,
          orderNumber: order.order_number,
          buyerName: drop.name || "MarketLink buyer",
          createdAt: new Date(order.created_at).getTime(),
          status: order.status,
          paymentStatus: order.payment_status,
          paymentMethod: order.payment_method,
          total: Number(order.total),
          currency: order.currency,
          dropoff: {
            phone: drop.phone || "",
            address: drop.address || "",
            notes: drop.notes || "",
            lat: drop.latitude ?? null,
            lng: drop.longitude ?? null
          },
          items: (order.order_items || []).map(item => ({
            productId: item.product_id,
            title: item.product_title,
            price: Number(item.unit_price),
            qty: Number(item.quantity),
            sellerId: item.seller_id
          }))
        };
      });
    },
    async placeOrder(dropoff) {
      const { data, error } = await requireClient().rpc("marketlink_place_order", {
        p_phone: dropoff.phone,
        p_address: dropoff.address,
        p_notes: dropoff.notes || "",
        p_lat: dropoff.lat,
        p_lng: dropoff.lng
      });
      if (error) throw error;
      return data;
    },
    async markNotificationsRead(userId) {
      const { error } = await requireClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null);
      if (error) throw error;
    },
    subscribeProducts(callback) {
      return requireClient().channel("marketlink-products")
        .on("postgres_changes", { event: "*", schema: "public", table: "products" }, callback)
        .subscribe();
    },
    subscribeNotifications(userId, callback) {
      return requireClient().channel("marketlink-notifications-" + userId)
        .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: "user_id=eq." + userId }, callback)
        .subscribe();
    },
    async addCartItem(productId, quantity = 1) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in to use your cart.");
      const { data: cart, error: cartError } = await db.from("carts").select("id").eq("user_id", authData.user.id).single();
      if (cartError) throw cartError;
      const { data: product, error: productError } = await db.from("products").select("stock_quantity,status").eq("id", productId).single();
      if (productError) throw productError;
      if (product.status !== "published" || product.stock_quantity < quantity) throw new Error("This product is not available in the requested quantity.");
      const { data: existing, error: existingError } = await db.from("cart_items").select("id,quantity").eq("cart_id", cart.id).eq("product_id", productId).maybeSingle();
      if (existingError) throw existingError;
      const nextQuantity = (existing?.quantity || 0) + quantity;
      if (nextQuantity > product.stock_quantity) throw new Error("Your cart quantity exceeds available stock.");
      const result = existing
        ? await db.from("cart_items").update({ quantity: nextQuantity }).eq("id", existing.id)
        : await db.from("cart_items").insert({ cart_id: cart.id, product_id: productId, quantity: nextQuantity });
      if (result.error) throw result.error;
      return nextQuantity;
    },
    async setCartQuantity(productId, quantity) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in to update your cart.");
      const { data: cart, error: cartError } = await db.from("carts").select("id").eq("user_id", authData.user.id).single();
      if (cartError) throw cartError;
      if (quantity > 0) {
        const { data: product, error: productError } = await db.from("products").select("stock_quantity,status").eq("id", productId).single();
        if (productError) throw productError;
        if (product.status !== "published" || quantity > product.stock_quantity) throw new Error("The requested quantity is not available.");
      }
      const result = quantity > 0
        ? await db.from("cart_items").update({ quantity }).eq("cart_id", cart.id).eq("product_id", productId)
        : await db.from("cart_items").delete().eq("cart_id", cart.id).eq("product_id", productId);
      if (result.error) throw result.error;
    },
    async toggleWishlist(productId, saved) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in to save products.");
      const { data: wishlist, error: wishlistError } = await db.from("wishlists").select("id").eq("user_id", authData.user.id).single();
      if (wishlistError) throw wishlistError;
      const result = saved
        ? await db.from("wishlist_items").insert({ wishlist_id: wishlist.id, product_id: productId })
        : await db.from("wishlist_items").delete().eq("wishlist_id", wishlist.id).eq("product_id", productId);
      if (result.error) throw result.error;
    },
    async deleteProduct(productId) {
      const db = requireClient();
      const { data: media, error: mediaError } = await db.from("product_media").select("storage_path").eq("product_id", productId);
      if (mediaError) throw mediaError;
      const paths = (media || []).map(item => item.storage_path);
      if (paths.length) {
        const { error: storageError } = await db.storage.from("product-media").remove(paths);
        if (storageError) throw storageError;
      }
      const { error } = await db.from("products").delete().eq("id", productId);
      if (error) throw error;
    },
    async updateStock(productId, quantity) {
      const { error } = await requireClient().from("products").update({ stock_quantity: quantity }).eq("id", productId);
      if (error) throw error;
    },
    async startConversation(otherUserId, productId, message) {
      const db = requireClient();
      const { data: authData, error: authError } = await db.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in to contact a seller.");
      const { data: conversationId, error } = await db.rpc("marketlink_start_conversation", {
        p_recipient_id: otherUserId,
        p_product_id: productId || null,
        p_subject: "Product enquiry",
        p_message: message
      });
      if (error) throw error;
      return { id: conversationId };
    }
  };
})();
