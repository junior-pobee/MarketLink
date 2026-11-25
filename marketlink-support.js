(() => {
  const backend = window.MarketLinkBackend;
  if (!backend?.configured) return;
  const db = backend.client;
  const css = document.createElement("style");
  css.textContent = "#ml-help-launch{position:fixed;left:18px;bottom:20px;z-index:190;background:#183b2b;color:#fff;border:0;border-radius:999px;padding:13px 16px;font-weight:800}#ml-help-box{position:fixed;left:15px;bottom:75px;z-index:191;width:min(420px,calc(100vw - 30px));max-height:78vh;overflow:auto;background:var(--panel,#fff);color:var(--text,#111);border:1px solid var(--line,#ddd);border-radius:18px;padding:16px;box-shadow:0 20px 50px #0003;display:none}#ml-help-box.open{display:block}#ml-help-box input,#ml-help-box textarea,#ml-help-box select{display:block;width:100%;padding:10px;margin:8px 0;border:1px solid #ccc;border-radius:10px;background:var(--surface,#fff);color:inherit}#ml-help-box button{padding:10px;border:0;border-radius:9px;background:#176b45;color:white;font-weight:700;margin:5px 0}";
  document.head.append(css);
  const launch=document.createElement("button");
  launch.id="ml-help-launch";
  launch.textContent="Help & Safety";
  const panel=document.createElement("section");
  panel.id="ml-help-box";
  panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center"><strong>MarketLink Help & Safety</strong><button id="ml-help-close">Close</button></div><div id="ml-help-content"></div>';
  document.body.append(launch,panel);
  const content=panel.querySelector("#ml-help-content");
  const escape=value=>String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function load(){
    const {data:{user}}=await db.auth.getUser();
    if(!user){content.innerHTML='<p>Sign in to submit a support request or report an issue.</p>';return;}
    content.innerHTML='<h3>Support</h3><form id="ml-ticket-form"><input name="subject" maxlength="160" required placeholder="Subject"><textarea name="body" minlength="10" maxlength="10000" required placeholder="Describe the issue"></textarea><button>Submit support ticket</button></form><h3>Report a user or product</h3><form id="ml-report-form"><input name="target" placeholder="User ID or product ID"><input name="reason" required maxlength="120" placeholder="Reason"><textarea name="details" required minlength="5" maxlength="5000" placeholder="Details"></textarea><button>Submit report</button></form><h3>Block account</h3><form id="ml-block-form"><input name="blocked" required placeholder="Account ID to block"><button>Block account</button></form><h3>Save search</h3><form id="ml-search-form"><input name="search" required maxlength="300" placeholder="Search term"><button>Save search</button></form><h3>Your support tickets</h3><div id="ml-ticket-list"></div><h3>Your saved searches</h3><div id="ml-saved-list"></div>';
    content.querySelector("#ml-ticket-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("marketlink_support_tickets").insert({user_id:user.id,subject:f.get("subject"),body:f.get("body")});if(error){alert(error.message);return;}e.target.reset();alert("Support request submitted.");await load();};
    content.querySelector("#ml-report-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const target=String(f.get("target")).trim();const product=target;const {error}=await db.from("marketlink_reports").insert({reporter_id:user.id,product_id:product||null,reason:f.get("reason"),details:f.get("details")});if(error){alert(error.message);return;}e.target.reset();alert("Report submitted.");};
    content.querySelector("#ml-block-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("marketlink_user_blocks").insert({blocker_id:user.id,blocked_id:f.get("blocked")});if(error){alert(error.message);return;}e.target.reset();alert("Account blocked in your block list. Messaging enforcement remains to be connected.");};
    content.querySelector("#ml-search-form").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);const {error}=await db.from("marketlink_saved_searches").insert({user_id:user.id,search_text:f.get("search")});if(error){alert(error.message);return;}e.target.reset();await load();};
    const tickets=await db.from("marketlink_support_tickets").select("subject,status,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20);
    content.querySelector("#ml-ticket-list").innerHTML=tickets.error?escape(tickets.error.message):(tickets.data||[]).map(t=>'<div>'+escape(t.subject)+' · '+escape(t.status)+'</div>').join("")||"No tickets yet.";
    const searches=await db.from("marketlink_saved_searches").select("search_text,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(20);
    content.querySelector("#ml-saved-list").innerHTML=searches.error?escape(searches.error.message):(searches.data||[]).map(s=>'<div>'+escape(s.search_text)+'</div>').join("")||"No saved searches.";
  }
  launch.onclick=async()=>{panel.classList.toggle("open");if(panel.classList.contains("open"))await load();};
  panel.querySelector("#ml-help-close").onclick=()=>panel.classList.remove("open");
})();