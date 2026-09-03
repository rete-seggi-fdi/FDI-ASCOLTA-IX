/* FDI Ascolta IX 3.1.0-rc10 - bundle pagina: notifiche.html */

/* ===== assets/js/config.js ===== */
const CONFIG = Object.freeze({
  VERSION: "3.1.0-rc10",
  API_URL: "https://script.google.com/macros/s/AKfycbyZuNSOT2SCW6YNp6gZ-bTO6gfm9wGI3-YAjvSmo5oelcqrUmARNzmd49hbjSn4ISh4Yg/exec",
  SESSION_KEY: "fdi_ascolta_ix_session_v3",
  CLIENT_ID_KEY: "fdi_ascolta_ix_client_v1",
  NOTIFICATION_READ_KEY: "fdi_crm_notifications_read_v3",
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  RECAPTCHA_REQUIRED: true,
  COORD_BOUNDS: Object.freeze({
    minLat: 41.65,
    maxLat: 42.05,
    minLng: 12.25,
    maxLng: 12.75
  })
});


/* ===== assets/js/auth.js ===== */
const Auth = Object.freeze({
  HANDOFF_KEY: "fdi_ascolta_ix_session_handoff_v1",

  getSession() {
    try {
      const direct = JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY) || "null");
      if (direct && direct.token) return direct;
    } catch (_) {}

    // Handoff monouso tra login e prima pagina CRM. Serve solo come rete di
    // sicurezza durante la navigazione e viene eliminato appena consumato.
    try {
      const raw = localStorage.getItem(this.HANDOFF_KEY);
      if (!raw) return null;
      const handoff = JSON.parse(raw);
      localStorage.removeItem(this.HANDOFF_KEY);
      if (!handoff || !handoff.token) return null;
      if (!handoff.createdAt || Date.now() - Number(handoff.createdAt) > 90000) return null;
      if (handoff.expiresAt && Number(handoff.expiresAt) <= Date.now()) return null;
      sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(handoff));
      return handoff;
    } catch (_) {
      try { localStorage.removeItem(this.HANDOFF_KEY); } catch (_) {}
      return null;
    }
  },

  saveSession(result) {
    if (!result || !result.token || !result.user) {
      throw new Error("Sessione non valida");
    }
    const expiresAt = Date.now() + Number(result.expiresInSeconds || 0) * 1000;
    const session = {
      token: result.token,
      user: result.user,
      mustChangePassword: Boolean(result.user.mustChangePassword),
      createdAt: Date.now(),
      expiresAt
    };
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    this.clearLegacyKeys();
  },

  getToken() {
    const session = this.getSession();
    if (!session || !session.token) return "";
    if (session.expiresAt && session.expiresAt <= Date.now()) {
      this.clearSession();
      return "";
    }
    return session.token;
  },

  getUser() {
    const session = this.getSession();
    return session && session.user ? session.user : null;
  },

  mustChangePassword() {
    const session = this.getSession();
    return Boolean(session && (session.mustChangePassword ||
      (session.user && session.user.mustChangePassword)));
  },

  getRole() {
    const user = this.getUser();
    return String(user && user.ruolo || "").trim().toLowerCase();
  },

  isAdmin() {
    return /amministratore|admin/.test(this.getRole());
  },

  isConsigliere() {
    return /consigliere/.test(this.getRole());
  },

  homeForRole() {
    if (this.isAdmin()) return "dashboard.html";
    if (this.isConsigliere()) return "pratiche.html";
    return "login.html";
  },

  canOpenPage(pageName) {
    const page = String(pageName || "").split("?")[0].toLowerCase();
    if (page === "cambia-password.html") return true;
    if (this.isAdmin()) return true;
    if (this.isConsigliere()) {
      return ["dashboard.html","pratiche.html","notifiche.html","cambia-password.html"].includes(page);
    }
    return false;
  },

  enforcePageAccess() {
    const page = (location.pathname.split("/").pop() || "dashboard.html").toLowerCase();
    if (this.mustChangePassword() && page !== "cambia-password.html") {
      location.replace("cambia-password.html");
      return false;
    }
    if (!this.mustChangePassword() && page === "cambia-password.html") {
      location.replace(this.homeForRole());
      return false;
    }
    if (!this.canOpenPage(page)) {
      const target = this.homeForRole();
      if (target === "login.html") this.clearSession();
      location.replace(target);
      return false;
    }
    return true;
  },

  clearLegacyKeys() {
    ["fdi_user", "fdi_ascolta_user", "fdi_ascolta_ix_user", "fdiUser", "user", "undefined"]
      .forEach(key => localStorage.removeItem(key));
  },

  clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    try { localStorage.removeItem(this.HANDOFF_KEY); } catch (_) {}
    this.clearLegacyKeys();
  },

  safeNext(value, fallback = "dashboard.html") {
    const candidate = String(value || "");
    return /^(dashboard|pratiche|mappa|analytics|notifiche|uffici|configurazione|cambia-password)\.html(?:\?[^#]*)?$/.test(candidate)
      ? candidate
      : fallback;
  },

  requireAuth() {
    if (!this.getToken()) {
      const next = encodeURIComponent(location.pathname.split("/").pop() + location.search);
      location.replace("login.html?next=" + next);
      return false;
    }
    return this.enforcePageAccess();
  },

  async logout() {
    try {
      if (typeof API !== "undefined" && this.getToken()) await API.logout();
    } catch (_) {
      // La sessione locale viene comunque rimossa.
    } finally {
      this.clearSession();
      location.replace("login.html");
    }
  }
});


/* ===== assets/js/api.js ===== */
function crmAsyncRequestId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function crmSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function crmSubmitHiddenPost(envelope) {
  const frameName = "fdiApiTransport_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  const iframe = document.createElement("iframe");
  iframe.name = frameName;
  iframe.title = "Trasporto API";
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  iframe.style.position = "fixed";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.border = "0";
  iframe.style.left = "-9999px";
  document.body.appendChild(iframe);

  const form = document.createElement("form");
  form.method = "POST";
  form.action = CONFIG.API_URL;
  form.target = frameName;
  form.enctype = "application/x-www-form-urlencoded";
  form.acceptCharset = "UTF-8";
  form.style.display = "none";

  const input = document.createElement("input");
  input.type = "hidden";
  input.name = "payload";
  input.value = JSON.stringify(envelope);
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();
  form.remove();

  return () => {
    try { iframe.remove(); } catch (_) {}
  };
}

async function crmReadAsyncResult(resultAction, requestId, timeoutMs) {
  const started = Date.now();
  let delay = 180;
  let lastError = null;

  while (Date.now() - started < timeoutMs) {
    await crmSleep(delay);
    delay = Math.min(1200, Math.round(delay * 1.45));
    const url = CONFIG.API_URL + "?action=" + encodeURIComponent(resultAction) +
      "&requestId=" + encodeURIComponent(requestId) + "&_=" + Date.now();
    try {
      const response = await fetch(url, {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        credentials: "omit",
        redirect: "follow"
      });
      if (response.status === 404) continue;
      if (!response.ok) {
        lastError = new Error("Backend temporaneamente non disponibile (HTTP " + response.status + ")");
        continue;
      }
      const data = await response.json();
      if (data && data.pending === true) continue;
      if (!data || data.ok === false) {
        throw new Error(data && data.error ? data.error : "Risposta API non valida");
      }
      if (data.pending === false) return data.result || {};
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Il server non ha risposto entro il tempo previsto");
}

async function crmAsyncTransport(kind, request, timeoutMs) {
  const requestId = crmAsyncRequestId();
  const isPrivate = kind === "private";
  const envelope = {
    action: isPrivate ? "privateAsync" : "publicAsync",
    requestId,
    request
  };
  const cleanup = crmSubmitHiddenPost(envelope);
  try {
    return await crmReadAsyncResult(
      isPrivate ? "privateAsyncResult" : "publicAsyncResult",
      requestId,
      timeoutMs
    );
  } finally {
    setTimeout(cleanup, 1000);
  }
}

async function crmPublicGet(action, params, timeoutMs) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set("action", action);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") return;
    url.searchParams.set(key, String(value));
  });
  url.searchParams.set("_", String(Date.now()));

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) throw new Error("Errore API HTTP " + response.status);
    return await response.json();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

const API = Object.freeze({
  async call(action, params = {}, options = {}) {
    const isPublic = Boolean(options.publicAction);
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || 45000));
    const payload = { action, ...params };

    if (!isPublic) {
      const token = Auth.getToken();
      if (!token) {
        Auth.requireAuth();
        throw new Error("Sessione non disponibile");
      }
      payload.authToken = token;
    }

    try {
      let result;
      const getSafe = new Set(["health", "getPublicConfig", "listQuartieri", "getPublicStats"]);
      if (isPublic && getSafe.has(action)) {
        result = await crmPublicGet(action, params, timeoutMs);
      } else {
        result = await crmAsyncTransport(isPublic ? "public" : "private", payload, timeoutMs);
      }

      if (result && result.authRequired && !isPublic) {
        if (!options._authRetry) {
          // Una sessione appena creata può richiedere qualche centinaio di ms
          // prima di risultare leggibile da una nuova esecuzione Apps Script.
          await crmSleep(650);
          return this.call(action, params, { ...options, _authRetry: true });
        }
        Auth.clearSession();
        Auth.requireAuth();
        throw new Error(result.error || "Sessione scaduta");
      }

      if (result && result.passwordChangeRequired && !isPublic) {
        location.replace("cambia-password.html");
        throw new Error(result.error || "Cambio password richiesto");
      }
      return result;
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("Il server non ha risposto entro il tempo previsto");
      }
      throw error;
    }
  },

  health() { return this.call("health", {}, { publicAction: true }); },
  getPublicConfig() { return this.call("getPublicConfig", {}, { publicAction: true }); },
  login(email, password) { return this.call("login", { email, password }, { publicAction: true }); },
  logout() { return this.call("logout"); },
  getClientId() {
    let id = localStorage.getItem(CONFIG.CLIENT_ID_KEY);
    if (!id) {
      if (globalThis.crypto && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else if (globalThis.crypto && crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
      } else {
        id = "client-" + Date.now();
      }
      localStorage.setItem(CONFIG.CLIENT_ID_KEY, id);
    }
    return id;
  },
  createReport(data) { return this.call("createReport", { ...data, clientId: this.getClientId() }, { publicAction: true, timeoutMs: 75000 }); },
  geocodeAddress(indirizzo, quartiere = "") { return this.call("geocodeAddress", { indirizzo, quartiere, clientId: this.getClientId() }, { publicAction: true }); },
  listQuartieri() { return this.call("listQuartieri", {}, { publicAction: true }); },
  getPublicStats() { return this.call("getPublicStats", {}, { publicAction: true }); },
  getPublicReport(code, email = "") { return this.call("getPublicReport", { code, email, clientId: this.getClientId() }, { publicAction: true }); },
  listReports() { return this.call("listReports"); },
  listReferenti() { return this.call("listReferenti"); },
  listUffici() { return this.call("listUffici"); },
  getTimeline(reportId) { return this.call("getTimeline", { reportId }); },
  getCommunications(reportId) { return this.call("getCommunications", { reportId }); },
  updateReportStatus(data) { return this.call("updateReportStatus", data); },
  updateReportLocation(data) { return this.call("updateReportLocation", data); },
  sendToReferente(data) { return this.call("sendToReferente", data); },
  sendToUfficio(data) { return this.call("sendToUfficio", data); },
  closeReport(data) { return this.call("closeReport", data); },
  getConfigurationData() { return this.call("getConfigurationData"); },
  saveConfigurationItem(itemType, item) { return this.call("saveConfigurationItem", { itemType, item }); },
  deactivateConfigurationItem(itemType, id) { return this.call("deactivateConfigurationItem", { itemType, id }); },
  listUsers() { return this.call("listUsers"); },
  saveUser(user) { return this.call("saveUser", { user }); },
  setUserActive(userId, active) { return this.call("setUserActive", { userId, active }); },
  resetUserPassword(userId) { return this.call("resetUserPassword", { userId }); },
  changeOwnPassword(currentPassword, newPassword) { return this.call("changeOwnPassword", { currentPassword, newPassword }); },
  addReportNote(reportId, note, visibileCittadino = false) { return this.call("addReportNote", { reportId, note, visibileCittadino }); },
  startReportWork(reportId, note) { return this.call("startReportWork", { reportId, note }); },
  recordOfficeResponse(reportId, response) { return this.call("recordOfficeResponse", { reportId, response }); }
});


/* ===== assets/js/pages/notifiche.js ===== */
if (!Auth.requireAuth()) {
  throw new Error("Sessione non disponibile");
}

const READ_KEY=CONFIG.NOTIFICATION_READ_KEY;
let reports=[],mode="all";

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function group(s){const v=String(s||"").toLowerCase();if(v.includes("archiv"))return"arch";if(v.includes("risolt"))return"done";if(/presa|assegnata|attesa|ufficio|lavorazione|risposta/.test(v))return"work";return"open"}
function isClosed(r){return["done","arch"].includes(group(r.stato))}
function readSet(){try{return new Set(JSON.parse(localStorage.getItem(READ_KEY)||"[]"))}catch(_){return new Set()}}
function saveRead(set){localStorage.setItem(READ_KEY,JSON.stringify([...set].slice(-500)))}
function nid(r){return[r.id||"",r.stato||"",r.ultimoAggiornamento||r.dataAggiornamento||r.timestamp||r.dataCreazione||""].join("|")}
function parseDate(value){
  if(!value)return null;
  if(value instanceof Date&&!isNaN(value))return value;
  const raw=String(value).trim();
  const italian=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(italian){
    const d=new Date(
      Number(italian[3]),Number(italian[2])-1,Number(italian[1]),
      Number(italian[4]||0),Number(italian[5]||0),Number(italian[6]||0)
    );
    return isNaN(d)?null:d;
  }
  const d=new Date(raw);
  return isNaN(d)?null:d;
}
function dateOf(r){
  for(const v of [r.ultimoAggiornamento,r.dataAggiornamento,r.timestamp,r.dataCreazione,r.data]){
    const d=parseDate(v);
    if(d)return d;
  }
  return null;
}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function fmtDate(d){return d?new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(d):"Data non disponibile"}

function fillStatus(){
  const vals=[...new Set(reports.map(r=>r.stato).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"it"));
  status.innerHTML='<option value="">Tutti gli stati</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")
}

function updateKpis(){
  const read=readSet(),today=new Date();
  kTotal.textContent=reports.length;
  kUnread.textContent=reports.filter(r=>!read.has(nid(r))).length;
  kActive.textContent=reports.filter(r=>!isClosed(r)).length;
  kToday.textContent=reports.filter(r=>sameDay(dateOf(r),today)).length;
}

function markRead(id){
  const set=readSet();set.add(id);saveRead(set);render()
}

function render(){
  const read=readSet(),q=search.value.trim().toLowerCase(),st=status.value;
  const data=reports.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0)).filter(r=>{
    const unread=!read.has(nid(r));
    const text=[r.id,r.titolo,r.quartiere,r.indirizzo,r.categoria,r.stato,r.referenteNome].join(" ").toLowerCase();
    return(!q||text.includes(q))&&(!st||r.stato===st)&&
      (mode==="all"||mode==="unread"&&unread||mode==="active"&&!isClosed(r)||mode==="closed"&&isClosed(r))
  });

  feed.innerHTML=data.length?data.map(r=>{
    const id=nid(r),unread=!read.has(id);
    return `<article class="notice ${unread?"unread":""}">
      <span class="dot"></span>
      <div>
        <h3>${esc(r.id||"Pratica")} · ${esc(r.stato||"Aggiornamento")}</h3>
        <p>${esc(r.titolo||r.categoria||"Segnalazione")} — ${esc(r.quartiere||r.indirizzo||"Municipio IX")}</p>
        <small>${fmtDate(dateOf(r))}${r.referenteNome?" · "+esc(r.referenteNome):""}</small>
      </div>
      <div class="notice-actions">
        ${unread?`<button class="link" type="button" data-read-id="${esc(id)}">Segna letta</button>`:""}
        <a class="link" href="pratiche.html?open=${encodeURIComponent(r.id||"")}" data-read-id="${esc(id)}">Apri pratica</a>
        <a class="link" href="tracking.html?id=${encodeURIComponent(r.id||"")}" data-read-id="${esc(id)}">Tracking</a>
      </div>
    </article>`
  }).join(""):'<div class="empty">Nessuna notifica corrisponde ai filtri.</div>';
  updateKpis()
}

feed.addEventListener("click", event=>{
  const target=event.target.closest("[data-read-id]");
  if(target) markRead(target.dataset.readId);
});

async function load(){
  refreshBtn.disabled=true;refreshBtn.textContent="Aggiornamento...";
  try{
    const result=await API.listReports();
    if(!result||!result.ok)throw new Error(result&&result.error?result.error:"Errore caricamento notifiche");
    reports=Array.isArray(result.reports)?result.reports:[];
    fillStatus();
    render();
  }catch(e){
    console.error(e);
    feed.innerHTML=`<div class="empty">Impossibile caricare le notifiche: ${esc(e.message)}</div>`;
    kTotal.textContent='0';kUnread.textContent='0';kActive.textContent='0';kToday.textContent='0';
  }finally{
    refreshBtn.disabled=false;refreshBtn.textContent="Aggiorna";
  }
}

document.querySelectorAll("[data-filter]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-filter]").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");mode=btn.dataset.filter;render()
});
search.oninput=render;status.onchange=render;refreshBtn.onclick=load;
readAllBtn.onclick=()=>{const set=readSet();reports.forEach(r=>set.add(nid(r)));saveRead(set);render()};
clearReadBtn.onclick=()=>{localStorage.removeItem(READ_KEY);render()};
load();setInterval(load,60000);


/* ===== assets/js/crm-shell.js ===== */

(function(){
  const page=(location.pathname.split("/").pop()||"dashboard.html").toLowerCase();
  const user=Auth.getUser()||{};
  const isAdmin=Auth.isAdmin();
  const items=isAdmin ? [
    ["dashboard.html","▦","Dashboard"],
    ["pratiche.html","▣","Pratiche"],
    ["mappa.html","🗺","Sala Operativa"],
    ["analytics.html","◔","Analytics"],
    ["notifiche.html","🔔","Notifiche"],
    ["uffici.html","🏛","Uffici"],
    ["configurazione.html","⚙","Configurazione"]
  ] : [
    ["dashboard.html","▦","Dashboard personale"],
    ["pratiche.html","▣","Le mie pratiche"],
    ["notifiche.html","🔔","Notifiche"]
  ];

  document.documentElement.classList.add("crm-shell-ready");

  async function getReports(){
    const result=await API.listReports();
    if(!result.ok) throw new Error(result.error||"Errore API");
    return result.reports||[];
  }

  function esc(v){
    return String(v??"").replace(/[&<>"']/g,c=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  function isOpen(s){
    const v=String(s||"").toLowerCase();
    return !v.includes("risolt")&&!v.includes("archiv");
  }

  const sidebar=document.createElement("aside");
  sidebar.className="crm-sidebar";
  sidebar.innerHTML=`
    <div class="crm-brand">
      <div class="crm-brand-title">FDI ASCOLTA IX</div>
      <div class="crm-brand-sub">CRM Enterprise</div>
    </div>
    <nav class="crm-nav">
      ${items.map(([href,icon,label])=>`
        <a href="${href}" class="${page===href?"active":""}">
          <span class="crm-nav-icon">${icon}</span>
          <span>${label}</span>
          ${href==="pratiche.html"?'<span class="crm-nav-badge" id="crmOpenBadge">—</span>':""}
        </a>`).join("")}
    </nav>
    <div class="crm-sidebar-footer">
      <div class="crm-user">
        <div class="crm-avatar">IX</div>
        <div class="crm-user-meta">
          <b id="crmUserName">${esc(user.nome||"Operatore CRM")}</b>
          <span>${esc(user.ruolo||"Municipio IX Roma")}</span>
        </div>
      </div>
      <button id="crmLogoutBtn" type="button" style="width:100%;margin-top:10px;border:1px solid rgba(255,255,255,.28);background:transparent;color:#fff;border-radius:10px;padding:9px;font-weight:900;cursor:pointer">Esci</button>
    </div>`;
  document.body.prepend(sidebar);
  document.getElementById("crmLogoutBtn").onclick=()=>Auth.logout();

  const mobile=document.createElement("button");
  mobile.className="crm-mobile-toggle";
  mobile.type="button";
  mobile.textContent="☰";
  mobile.title="Apri menu";
  mobile.onclick=()=>sidebar.classList.toggle("open");
  document.body.appendChild(mobile);

  const tools=document.createElement("div");
  tools.className="crm-top-tools";
  tools.innerHTML=`
    <button class="crm-tool-button" id="crmSearchBtn" type="button">
      ⌕ <span class="crm-global-label">Ricerca globale</span>
    </button>
    <button class="crm-tool-button icon" id="crmNotifyBtn" type="button" title="Notifiche">
      🔔<span class="crm-alert-dot"></span>
    </button>`;
  document.body.appendChild(tools);

  const search=document.createElement("div");
  search.className="crm-search-overlay";
  search.innerHTML=`
    <div class="crm-search-dialog">
      <div class="crm-dialog-head">
        <input id="crmSearchInput" placeholder="Cerca codice, titolo, cittadino, indirizzo, quartiere...">
        <button class="crm-close" data-close="search" type="button">×</button>
      </div>
      <div class="crm-results" id="crmSearchResults">
        <div class="crm-empty">Digita almeno 2 caratteri.</div>
      </div>
    </div>`;
  document.body.appendChild(search);

  const notify=document.createElement("div");
  notify.className="crm-notify-overlay";
  notify.innerHTML=`
    <div class="crm-notify-dialog">
      <div class="crm-dialog-head">
        <strong style="flex:1;color:#082f6a">Centro notifiche</strong>
        <button class="crm-close" data-close="notify" type="button">×</button>
      </div>
      <div class="crm-notify-list" id="crmNotifyList">
        <div class="crm-empty">Caricamento...</div>
      </div>
    </div>`;
  document.body.appendChild(notify);

  let cache=[];

  async function ensureData(){
    if(cache.length) return cache;
    cache=await getReports();
    return cache;
  }

  async function loadBadge(){
    try{
      const reports=await ensureData();
      const badge=document.getElementById("crmOpenBadge");
      if(badge) badge.textContent=reports.filter(r=>isOpen(r.stato)).length;
      updateNotifyBadge(reports);
    }catch(_){}
  }

  const NOTIFY_READ_KEY=CONFIG.NOTIFICATION_READ_KEY;

  function readSet(){
    try{return new Set(JSON.parse(localStorage.getItem(NOTIFY_READ_KEY)||"[]"))}
    catch(_){return new Set()}
  }

  function saveReadSet(set){
    localStorage.setItem(NOTIFY_READ_KEY,JSON.stringify([...set].slice(-500)));
  }

  function notificationId(r){
    return [
      r.id||"",
      r.stato||"",
      r.ultimoAggiornamento||r.dataAggiornamento||r.timestamp||r.dataCreazione||""
    ].join("|");
  }

  function notificationDate(r){
    const raw=r.ultimoAggiornamento||r.dataAggiornamento||r.timestamp||r.dataCreazione||r.data||"";
    const text=String(raw||"").trim();
    const match=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if(match){
      return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),Number(match[4]||0),Number(match[5]||0));
    }
    const d=new Date(text);
    return isNaN(d)?null:d;
  }

  function notificationItems(data){
    return data.slice().sort((a,b)=>{
      const da=notificationDate(a),db=notificationDate(b);
      return (db?db.getTime():0)-(da?da.getTime():0);
    });
  }

  function updateNotifyBadge(data){
    const read=readSet();
    const unread=notificationItems(data).filter(r=>!read.has(notificationId(r))).length;
    const dot=document.querySelector(".crm-alert-dot");
    if(dot){
      dot.style.display=unread?"block":"none";
      dot.title=unread+" notifiche non lette";
    }
    const sidebarLink=[...document.querySelectorAll(".crm-nav a")].find(a=>a.getAttribute("href")==="notifiche.html");
    if(sidebarLink){
      let badge=sidebarLink.querySelector(".crm-nav-badge");
      if(unread&&!badge){
        badge=document.createElement("span");
        badge.className="crm-nav-badge";
        sidebarLink.appendChild(badge);
      }
      if(badge){
        badge.textContent=unread>99?"99+":String(unread);
        badge.style.display=unread?"grid":"none";
      }
    }
    return unread;
  }

  async function renderNotifications(){
    const box=document.getElementById("crmNotifyList");
    try{
      const data=notificationItems(await ensureData()).slice(0,10);
      const read=readSet();
      updateNotifyBadge(cache);

      box.innerHTML=data.length
        ? data.map(r=>{
            const nid=notificationId(r);
            const unread=!read.has(nid);
            return `
              <a class="crm-notify-item" data-notification-id="${esc(nid)}"
                 href="pratiche.html?open=${encodeURIComponent(r.id||"")}"
                 style="display:block;text-decoration:none;background:${unread?"#f6f9ff":"#fff"}">
                <b>${unread?"● ":""}${esc(r.id||"Nuova pratica")} · ${esc(r.stato||"Aggiornamento")}</b>
                <p>${esc(r.titolo||r.categoria||"Segnalazione")} — ${esc(r.quartiere||r.indirizzo||"Municipio IX")}</p>
              </a>`;
          }).join("")+
          '<div style="padding:12px;text-align:center"><a href="notifiche.html" style="font-weight:900;color:#082f6a;text-decoration:none">Apri Centro Notifiche →</a></div>'
        : '<div class="crm-empty">Nessuna notifica disponibile.</div>';

      box.querySelectorAll("[data-notification-id]").forEach(link=>{
        link.addEventListener("click",()=>{
          const set=readSet();
          set.add(link.dataset.notificationId);
          saveReadSet(set);
        });
      });
    }catch(_){
      box.innerHTML='<div class="crm-empty">Impossibile caricare le notifiche.</div>';
    }
  }

  function renderSearch(query){
    const box=document.getElementById("crmSearchResults");

    if(query.length<2){
      box.innerHTML='<div class="crm-empty">Digita almeno 2 caratteri.</div>';
      return;
    }

    const q=query.toLowerCase();
    const matches=cache.filter(r=>[
      r.id,r.titolo,r.nome,r.cognome,r.email,r.indirizzo,
      r.quartiere,r.categoria,r.referenteNome
    ].join(" ").toLowerCase().includes(q)).slice(0,20);

    box.innerHTML=matches.length
      ? matches.map(r=>`
        <a class="crm-result" href="pratiche.html?open=${encodeURIComponent(r.id)}">
          <div>
            <b>${esc(r.id)} · ${esc(r.titolo||r.categoria||"Pratica")}</b>
            <span>${esc(r.indirizzo||r.quartiere||"—")} · ${esc(r.referenteNome||"Non assegnata")}</span>
          </div>
          <span class="crm-result-status">${esc(r.stato||"—")}</span>
        </a>`).join("")
      : '<div class="crm-empty">Nessun risultato.</div>';
  }

  document.getElementById("crmSearchBtn").onclick=async()=>{
    search.classList.add("open");
    document.getElementById("crmSearchInput").focus();
    try{await ensureData()}catch(_){}
  };

  document.getElementById("crmNotifyBtn").onclick=()=>{
    notify.classList.add("open");
    renderNotifications();
  };

  document.querySelectorAll("[data-close]").forEach(button=>{
    button.onclick=()=>button.closest(".crm-search-overlay,.crm-notify-overlay").classList.remove("open");
  });

  [search,notify].forEach(overlay=>{
    overlay.addEventListener("click",event=>{
      if(event.target===overlay) overlay.classList.remove("open");
    });
  });

  document.getElementById("crmSearchInput").addEventListener("input",event=>{
    renderSearch(event.target.value.trim());
  });

  document.addEventListener("keydown",event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
      event.preventDefault();
      document.getElementById("crmSearchBtn").click();
    }
    if(event.key==="Escape"){
      search.classList.remove("open");
      notify.classList.remove("open");
      sidebar.classList.remove("open");
    }
  });

  try{
    const saved=Auth.getUser();
    const name=saved&&(saved.nome||saved.name||saved.email);
    if(name) document.getElementById("crmUserName").textContent=name;
  }catch(_){}

  loadBadge();

  setInterval(async()=>{
    try{
      cache=await getReports();
      loadBadge();
    }catch(_){}
  },60000);
})();

