(() => {
  const backend = window.MarketLinkBackend;
  if (!backend?.configured) return;
  const db = backend.client;
  const state = { user: null, activeConversation: null, channel: null, conversations: [] };
  const style = document.createElement("style");
  style.textContent = `
    #ml-global-launcher{position:fixed;right:22px;bottom:92px;z-index:180;background:#132c22;color:#fff;border:0;border-radius:999px;padding:14px 18px;font-weight:800;box-shadow:0 12px 35px #0003}
    #ml-global-panel{position:fixed;right:20px;bottom:154px;z-index:181;width:min(390px,calc(100vw - 28px));height:min(610px,calc(100vh - 190px));background:var(--panel,#fff);color:var(--text,#18231d);border:1px solid var(--line,#ddd);border-radius:20px;box-shadow:0 24px 70px #0004;display:none;overflow:hidden}
    #ml-global-panel.open{display:flex;flex-direction:column}
    #ml-global-panel header{padding:15px 17px;background:#173d2c;color:#fff;display:flex;justify-content:space-between;align-items:center}
    #ml-global-panel button{cursor:pointer}
    #ml-global-panel .ml-body{padding:13px;overflow:auto;flex:1}
    #ml-global-panel input,#ml-global-panel textarea,#ml-global-panel select{width:100%;padding:10px;border:1px solid var(--line,#ddd);border-radius:10px;background:var(--surface,#fff);color:inherit;margin:5px 0}
    #ml-global-panel .ml-action{border:0;border-radius:10px;padding:10px 13px;background:#19734c;color:#fff;font-weight:700}
    #ml-global-panel .ml-item{padding:11px;border:1px solid var(--line,#ddd);border-radius:12px;margin:7px 0;text-align:left;width:100%;background:transparent;color:inherit}
    #ml-global-panel .ml-row{display:flex;gap:7px;align-items:center}
    #ml-global-panel .ml-row>*{min-width:0}
    #ml-global-panel .ml-message{padding:9px 11px;border-radius:13px;background:var(--surface,#f2f4f2);margin:7px 0;max-width:88%;overflow-wrap:anywhere}
    #ml-global-panel .ml-message.mine{margin-left:auto;background:#d8f2df;color:#183b28}
    #ml-global-panel .ml-muted{opacity:.65;font-size:12px}
    #ml-global-admin{padding:18px;margin:18px 0;border:1px solid var(--line,#ddd);border-radius:16px;background:var(--panel,#fff);color:var(--text,#18231d)}
    #ml-global-admin input,#ml-global-admin textarea,#ml-global-admin select{display:block;width:100%;padding:11px;margin:8px 0;border:1px solid var(--line,#ddd);border-radius:9px;background:var(--surface,#fff);color:inherit}
    @media(max-width:600px){#ml-global-launcher{right:12px;bottom:80px}#ml-global-panel{right:10px;bottom:135px}}
  `;
  document.head.append(style);
  const launcher = document.createElement("button");
  launcher.id = "ml-global-launcher";
  launcher.textContent = "Messages";
  launcher.type = "button";
  const panel = document.createElement("section");
  panel.id = "ml-global-panel";
  panel.innerHTML = `
    <header><div><strong>MarketLink Messages</strong><div class="ml-muted" style="color:#d5e7dc">Buyer and seller inbox</div></div><button id="ml-close" aria-label="Close" style="background:transparent;border:0;color:white;font-size:24px">×</button></header>
    <div class="ml-body" id="ml-inbox">
      <div id="ml-plan-list"></div>
      <details style="margin:10px 0"><summary>Find a seller</summary><div id="ml-seller-directory"></div></details>
      <h3 style="margin:12px 0 4px">Your conversations</h3>
      <div id="ml-conversations"></div>
      <details style="margin-top:12px"><summary>Start a conversation</summary><input id="ml-recipient" placeholder="Recipient account ID"><input id="ml-subject" placeholder="Subject"><textarea id="ml-first-message" placeholder="Write your first message"></textarea><button class="ml-action" id="ml-start">Start chat</button></details>
    </div>
    <div class="ml-body" id="ml-thread" style="display:none">
      <button id="ml-back" class="ml-action" style="margin-bottom:10px">← Inbox</button>
      <h3 id="ml-thread-title"></h3><div id="ml-messages"></div>
      <form id="ml-send-form"><textarea id="ml-message-text" rows="2" placeholder="Write a message"></textarea><input id="ml-attachment" type="file"><div class="ml-row"><button class="ml-action" type="submit">Send</button><span class="ml-muted">Text and file attachments</span></div></form>
    </div>`;
  document.body.append(launcher, panel);
  const el = id => panel.querySelector("#" + id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
  const notify = message => {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.cssText = "position:fixed;z-index:9999;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 16px;background:#172b21;color:white;border-radius:12px;box-shadow:0 8px 30px #0003";
    document.body.append(toast);
    setTimeout(() => toast.remove(), 3200);
  };
  const currentUser = async () => {
    const { data, error } = await db.auth.getUser();
    if (error) throw error;
    state.user = data.user;
    return state.user;
  };
  async function loadPlans() {
    const { data, error } = await db.from("seller_subscription_catalog").select("plan_code,plan_name,monthly_fee,currency,category_limit").eq("active", true).order("monthly_fee");
    if (error) throw error;
    el("ml-plan-list").innerHTML = '<h3 style="margin:0 0 8px">Seller subscriptions</h3>' + (data || []).map(plan => `<div class="ml-item"><strong>${escapeHtml(plan.plan_name)}</strong><div style="font-size:20px;font-weight:800">GH₵${Number(plan.monthly_fee).toFixed(2)} / month</div><div class="ml-muted">${plan.category_limit === 1 ? "One product category" : "Multiple product categories"}</div></div>`).join("");
  }
  async function loadSellerDirectory() {
    const { data, error } = await db.from("storefronts")
      .select("owner_id,name,city,country_code")
      .eq("status", "active")
      .order("name")
      .limit(100);
    if (error) throw error;
    const directory = el("ml-seller-directory");
    directory.innerHTML = (data || []).map(store => `<button class="ml-item" data-seller="${store.owner_id}"><strong>${escapeHtml(store.name)}</strong><div class="ml-muted">${escapeHtml([store.city,store.country_code].filter(Boolean).join(", "))}</div></button>`).join("") || '<p class="ml-muted">No active storefronts are available yet.</p>';
    directory.querySelectorAll("[data-seller]").forEach(button => button.addEventListener("click", async () => {
      try {
        const { data: conversationId, error: startError } = await db.rpc("marketlink_start_conversation", {
          p_recipient_id: button.dataset.seller,
          p_product_id: null,
          p_subject: "Store enquiry",
          p_message: "Hello, I would like to know more about your store."
        });
        if (startError) throw startError;
        await loadInbox();
        await openConversation(conversationId);
      } catch (error) { notify(error.message || "Could not contact this seller."); }
    }));
  }
  async function loadInbox() {
    const user = await currentUser();
    await loadSellerDirectory();
    if (!user) {
      el("ml-conversations").innerHTML = '<p class="ml-muted">Sign in to use buyer–seller messaging.</p>';
      return;
    }
    const { data: memberships, error: memberError } = await db.from("conversation_members").select("conversation_id").eq("user_id", user.id);
    if (memberError) throw memberError;
    const ids = (memberships || []).map(row => row.conversation_id);
    if (!ids.length) {
      el("ml-conversations").innerHTML = '<p class="ml-muted">No conversations yet. Start one using a recipient account ID.</p>';
      return;
    }
    const { data: conversations, error } = await db.from("conversations").select("id,subject,updated_at").in("id", ids).order("updated_at", { ascending: false });
    if (error) throw error;
    state.conversations = conversations || [];
    el("ml-conversations").innerHTML = state.conversations.map(item => `<button class="ml-item" data-conversation="${item.id}"><strong>${escapeHtml(item.subject)}</strong><div class="ml-muted">${new Date(item.updated_at).toLocaleString()}</div></button>`).join("");
    el("ml-conversations").querySelectorAll("[data-conversation]").forEach(button => button.addEventListener("click", () => openConversation(button.dataset.conversation)));
  }
  async function openConversation(id) {
    state.activeConversation = id;
    const conversation = state.conversations.find(item => item.id === id);
    el("ml-thread-title").textContent = conversation?.subject || "Conversation";
    el("ml-inbox").style.display = "none";
    el("ml-thread").style.display = "block";
    await loadMessages();
    if (state.channel) db.removeChannel(state.channel);
    state.channel = db.channel("ml-thread-" + id).on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: "conversation_id=eq." + id }, loadMessages).subscribe();
  }
  async function loadMessages() {
    if (!state.activeConversation) return;
    const { data, error } = await db.from("messages").select("id,sender_id,body,attachment_path,attachment_type,created_at,deleted_at").eq("conversation_id", state.activeConversation).order("created_at", { ascending: true }).limit(200);
    if (error) throw error;
    const user = await currentUser();
    el("ml-messages").innerHTML = (data || []).map(message => `<div class="ml-message ${message.sender_id === user.id ? "mine" : ""}"><div>${message.deleted_at ? "<em>Message deleted</em>" : escapeHtml(message.body)}</div>${message.attachment_path && !message.deleted_at ? '<div class="ml-muted">Attachment: ' + escapeHtml(message.attachment_type || "file") + '</div>' : ""}<div class="ml-muted">${new Date(message.created_at).toLocaleString()}</div>${message.sender_id === user.id && !message.deleted_at ? '<button data-delete-message="' + message.id + '" style="border:0;background:transparent;color:#9b3333;font-size:11px">Delete for everyone</button>' : ""}</div>`).join("");
    el("ml-messages").querySelectorAll("[data-delete-message]").forEach(button => button.addEventListener("click", async () => {
      const { error: deleteError } = await db.from("messages").update({ body: "", deleted_at: new Date().toISOString() }).eq("id", button.dataset.deleteMessage).eq("sender_id", user.id);
      if (deleteError) notify(deleteError.message); else await loadMessages();
    }));
    el("ml-messages").scrollTop = el("ml-messages").scrollHeight;
    await db.from("conversation_members").update({ last_read_at: new Date().toISOString() }).eq("conversation_id", state.activeConversation).eq("user_id", user.id);
  }
  launcher.addEventListener("click", async () => {
    panel.classList.toggle("open");
    if (!panel.classList.contains("open")) return;
    try { await Promise.all([loadPlans(), loadInbox()]); }
    catch (error) { notify(error.message || "Could not load MarketLink services."); }
  });
  el("ml-close").addEventListener("click", () => panel.classList.remove("open"));
  el("ml-back").addEventListener("click", async () => {
    if (state.channel) db.removeChannel(state.channel);
    state.channel = null;
    state.activeConversation = null;
    el("ml-thread").style.display = "none";
    el("ml-inbox").style.display = "block";
    await loadInbox();
  });
  el("ml-start").addEventListener("click", async () => {
    try {
      const recipient = el("ml-recipient").value.trim();
      const message = el("ml-first-message").value.trim();
      const { data, error } = await db.rpc("marketlink_start_conversation", {
        p_recipient_id: recipient,
        p_product_id: null,
        p_subject: el("ml-subject").value.trim(),
        p_message: message
      });
      if (error) throw error;
      el("ml-recipient").value = "";
      el("ml-subject").value = "";
      el("ml-first-message").value = "";
      await loadInbox();
      await openConversation(data);
    } catch (error) { notify(error.message || "Conversation could not be started."); }
  });
  el("ml-send-form").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      const user = await currentUser();
      const text = el("ml-message-text").value.trim();
      const file = el("ml-attachment").files[0];
      if (!text && !file) return;
      let attachmentPath = null;
      if (file) {
        if (file.size > 20 * 1024 * 1024) throw new Error("Attachments must be 20 MB or smaller.");
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        attachmentPath = user.id + "/" + state.activeConversation + "/" + crypto.randomUUID() + "-" + safeName;
        const { error: uploadError } = await db.storage.from("message-attachments").upload(attachmentPath, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
      }
      const { error } = await db.from("messages").insert({
        conversation_id: state.activeConversation,
        sender_id: user.id,
        body: text || (file ? file.name : ""),
        attachment_path: attachmentPath,
        attachment_type: file?.type || null
      });
      if (error) throw error;
      el("ml-message-text").value = "";
      el("ml-attachment").value = "";
      await loadMessages();
    } catch (error) { notify(error.message || "Message could not be sent."); }
  });
  async function loadAdmin() {
    const { data, error } = await db.rpc("is_marketlink_admin");
    if (error || !data) return;
    const target = document.querySelector("#page-settings .settings-stack");
    if (!target || document.getElementById("ml-global-admin")) return;
    const admin = document.createElement("section");
    admin.id = "ml-global-admin";
    admin.innerHTML = `<h2>MarketLink CEO / Admin Console</h2><p>Publish platform-wide updates and moderate accounts.</p><form id="ml-announcement-form"><input id="ml-announcement-title" maxlength="140" required placeholder="Announcement title"><textarea id="ml-announcement-body" maxlength="5000" required placeholder="Announcement message"></textarea><select id="ml-announcement-audience"><option value="all">All users</option><option value="buyers">Buyers</option><option value="sellers">Sellers</option></select><button class="ml-action" type="submit">Publish announcement</button></form><hr><form id="ml-moderation-form"><input id="ml-target-user" required placeholder="User account UUID"><select id="ml-moderation-action"><option value="suspend">Suspend account</option><option value="ban">Ban account</option><option value="reinstate">Reinstate account</option></select><input id="ml-moderation-reason" required maxlength="500" placeholder="Reason"><button class="ml-action" type="submit">Apply moderation action</button></form>`;
    target.prepend(admin);
    admin.querySelector("#ml-announcement-form").addEventListener("submit", async event => {
      event.preventDefault();
      const { error: publishError } = await db.rpc("marketlink_publish_announcement", {
        p_title: admin.querySelector("#ml-announcement-title").value,
        p_body: admin.querySelector("#ml-announcement-body").value,
        p_audience: admin.querySelector("#ml-announcement-audience").value
      });
      if (publishError) return notify(publishError.message);
      event.target.reset();
      notify("Announcement sent to the selected users.");
    });
    admin.querySelector("#ml-moderation-form").addEventListener("submit", async event => {
      event.preventDefault();
      const { error: moderationError } = await db.rpc("marketlink_moderate_user", {
        p_target_user_id: admin.querySelector("#ml-target-user").value.trim(),
        p_action: admin.querySelector("#ml-moderation-action").value,
        p_reason: admin.querySelector("#ml-moderation-reason").value.trim()
      });
      if (moderationError) return notify(moderationError.message);
      event.target.reset();
      notify("Moderation action recorded.");
    });
  }
  async function boot() {
    db.auth.onAuthStateChange((_event, session) => {
      state.user = session?.user || null;
      if (state.user) loadAdmin().catch(error => console.error(error));
      else document.getElementById("ml-global-admin")?.remove();
    });
    try {
      const user = await currentUser();
      if (user) await loadAdmin();
    } catch (error) { console.error("MarketLink global services:", error); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();