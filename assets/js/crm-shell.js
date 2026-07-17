
(function(){
  const API_FALLBACK="https://script.google.com/macros/s/AKfycbydMX5t3F9r3sHQ3zM3tSH6edMBz_hqGnDiVvK_kisOrSz8kn1pbeoMG00fX_Ei6wd7HQ/exec";
  const page=(location.pathname.split("/").pop()||"dashboard.html").toLowerCase();
  const items=[
    ["dashboard.html","▦","Dashboard"],
    ["pratiche.html","▣","Pratiche"],
    ["mappa.html","🗺","Sala Operativa"],
    ["uffici.html","🏛","Uffici"],
    ["configurazione.html","⚙","Configurazione"]
  ];

  document.documentElement.classList.add("crm-shell-ready");

  function apiUrl(){
    if(typeof CONFIG!=="undefined"&&CONFIG.API_URL&&CONFIG.API_URL.includes("/macros/s/")) return CONFIG.API_URL;
    return API_FALLBACK;
  }
  async function getReports(){
    const u=new URL(apiUrl());u.searchParams.set("action","listReports");u.searchParams.set("_",Date.now());
    const r=await fetch(u,{cache:"no-store",redirect:"follow"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(!j.ok) throw new Error(j.error||"Errore API");
    return j.reports||[];
  }
  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
  function isOpen(s){const v=String(s||"").toLowerCase();return !v.includes("risolt")&&!v.includes("archiv")}

  const sidebar=document.createElement("aside");
  sidebar.className="crm-sidebar";
  sidebar.innerHTML=`
    <div class="crm-brand"><div class="crm-brand-title">FDI ASCOLTA IX</div><div class="crm-brand-sub">CRM Enterprise</div></div>
    <nav class="crm-nav">
      ${items.map(([href,icon,label])=>`<a href="${href}" class="${page===href?"active":""}"><span class="crm-nav-icon">${icon}</span><span>${label}</span>${href==="pratiche.html"?'<span class="crm-nav-badge" id="crmOpenBadge">—</span>':""}</a>`).join("")}
    </nav>
    <div class="crm-sidebar-footer">
      <div class="crm-user"><div class="crm-avatar">IX</div><div class="crm-user-meta"><b id="crmUserName">Operatore CRM</b><span>Municipio IX Roma</span></div></div>
    </div>`;
  document.body.prepend(sidebar);

  const mobile=document.createElement("button");
  mobile.className="crm-mobile-toggle";mobile.type="button";mobile.textContent="☰";
  mobile.onclick=()=>sidebar.classList.toggle("open");
  document.body.appendChild(mobile);

  const tools=document.createElement("div");
  tools.className="crm-top-tools";
  tools.innerHTML=`
    <button class="crm-tool-button" id="crmSearchBtn">⌕ <span class="crm-global-label">Ricerca globale</span></button>
    <button class="crm-tool-button icon" id="crmNotifyBtn" title="Notifiche">🔔<span class="crm-alert-dot"></span></button>`;
  document.body.appendChild(tools);

  const search=document.createElement("div");
  search.className="crm-search-overlay";
  search.innerHTML=`<div class="crm-search-dialog">
    <div class="crm-dialog-head"><input id="crmSearchInput" placeholder="Cerca codice, titolo, cittadino, indirizzo, quartiere..."><button class="crm-close" data-close="search">×</button></div>
    <div class="crm-results" id="crmSearchResults"><div class="crm-empty">Digita almeno 2 caratteri.</div></div>
  </div>`;
  document.body.appendChild(search);

  const notify=document.createElement("div");
  notify.className="crm-notify-overlay";
  notify.innerHTML=`<div class="crm-notify-dialog">
    <div class="crm-dialog-head"><strong style="flex:1;color:#082f6a">Centro notifiche</strong><button class="crm-close" data-close="notify">×</button></div>
    <div class="crm-notify-list" id="crmNotifyList"><div class="crm-empty">Caricamento...</div></div>
  </div>`;
  document.body.appendChild(notify);

  let cache=[];
  async function ensureData(){
    if(cache.length) return cache;
    cache=await getReports();
    return cache;
  }
  async function loadBadge(){
    try{const r=await ensureData();const el=document.getElementById("crmOpenBadge");if(el)el.textContent=r.filter(x=>isOpen(x.stato)).length}catch(e){}
  }
  async function renderNotifications(){
    const box=document.getElementById("crmNotifyList");
    try{
      const data=(await ensureData()).slice().sort((a,b)=>String(b.dataCreazione||b.timestamp||"").localeCompare(String(a.dataCreazione||a.timestamp||""))).slice(0,8);
      box.innerHTML=data.length?data.map(r=>`<div class="crm-notify-item"><b>${esc(r.id||"Nuova pratica")} · ${esc(r.stato||"Aggiornamento")}</b><p>${esc(r.titolo||r.categoria||"Segnalazione")} — ${esc(r.quartiere||r.indirizzo||"Municipio IX")}</p></div>`).join(""):'<div class="crm-empty">Nessuna notifica disponibile.</div>';
    }catch(e){box.innerHTML='<div class="crm-empty">Impossibile caricare le notifiche.</div>'}
  }
  function renderSearch(q){
    const box=document.getElementById("crmSearchResults");
    if(q.length<2){box.innerHTML='<div class="crm-empty">Digita almeno 2 caratteri.</div>';return}
    const matches=cache.filter(r=>[r.id,r.titolo,r.nome,r.cognome,r.email,r.indirizzo,r.quartiere,r.categoria,r.referenteNome].join(" ").toLowerCase().includes(q.toLowerCase())).slice(0,20);
    box.innerHTML=matches.length?matches.map(r=>`<a class="crm-result" href="pratiche.html?open=${encodeURIComponent(r.id)}"><div><b>${esc(r.id)} · ${esc(r.titolo||r.categoria||"Pratica")}</b><span>${esc(r.indirizzo||r.quartiere||"—")} · ${esc(r.referenteNome||"Non assegnata")}</span></div><span class="crm-result-status">${esc(r.stato||"—")}</span></a>`).join(""):'<div class="crm-empty">Nessun risultato.</div>';
  }

  document.getElementById("crmSearchBtn").onclick=async()=>{search.classList.add("open");document.getElementById("crmSearchInput").focus();try{await ensureData()}catch(e){}};
  document.getElementById("crmNotifyBtn").onclick=()=>{notify.classList.add("open");renderNotifications()};
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest(".crm-search-overlay,.crm-notify-overlay").classList.remove("open"));
  [search,notify].forEach(o=>o.addEventListener("click",e=>{if(e.target===o)o.classList.remove("open")}));
  document.getElementById("crmSearchInput").addEventListener("input",e=>renderSearch(e.target.value.trim()));
  document.addEventListener("keydown",e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();document.getElementById("crmSearchBtn").click()}
    if(e.key==="Escape"){search.classList.remove("open");notify.classList.remove("open");sidebar.classList.remove("open")}
  });

  try{
    const saved=JSON.parse(localStorage.getItem("fdiUser")||localStorage.getItem("user")||"null");
    const name=saved&&(saved.nome||saved.name||saved.email);
    if(name)document.getElementById("crmUserName").textContent=name;
  }catch(e){}
  loadBadge();
})();
