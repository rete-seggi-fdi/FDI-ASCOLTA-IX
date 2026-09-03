/* FDI Ascolta IX 3.1.0-rc10 - bundle pagina: mappa.html */

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


/* ===== assets/js/pages/mappa.js ===== */
let reports=[];
let filtered=[];
let map;
let clusterLayer;
let heatLayer;
let selectedId=null;
let refreshTimer=null;
let clusterEnabled=true;
let heatEnabled=false;
let firstLoad=true;
const markerById=new Map();

function esc(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function uniq(field){
  return [...new Set(reports.map(r=>r[field]).filter(Boolean))]
    .sort((a,b)=>String(a).localeCompare(String(b),"it"));
}

function fill(id,values){
  const s=document.getElementById(id);
  const current=s.value;
  const first=s.options[0].outerHTML;
  s.innerHTML=first+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if([...s.options].some(o=>o.value===current)) s.value=current;
}

function statusGroup(s){
  const v=String(s||"").toLowerCase();
  if(v.includes("archiv")) return "arch";
  if(v.includes("risolt")) return "done";
  if(/presa|assegnata|attesa|ufficio|lavorazione|risposta/.test(v)) return "work";
  return "open";
}

function colorFor(s){
  return {open:"#c62828",work:"#ef6c00",done:"#159447",arch:"#667085"}[statusGroup(s)];
}

function iconFor(c){
  const v=String(c||"").toLowerCase();
  if(v.includes("buca")||v.includes("strad")) return "🕳";
  if(v.includes("verde")) return "🌳";
  if(v.includes("illumin")) return "💡";
  if(v.includes("rifiut")) return "🗑";
  if(v.includes("viabil")) return "🚧";
  if(v.includes("segnalet")) return "🚦";
  if(v.includes("scuol")) return "🏫";
  return "📍";
}

function markerIcon(r){
  return L.divIcon({
    className:"",
    html:`<div class="custom-marker" style="background:${colorFor(r.stato)}"><span>${iconFor(r.categoria)}</span></div>`,
    iconSize:[34,34],
    iconAnchor:[17,34],
    popupAnchor:[0,-30]
  });
}

function validCoords(r){
  const lat=Number(r.latitudine);
  const lng=Number(r.longitudine);
  const bounds=CONFIG.COORD_BOUNDS;

  return Number.isFinite(lat)&&
    Number.isFinite(lng)&&
    lat>=bounds.minLat&&lat<=bounds.maxLat&&
    lng>=bounds.minLng&&lng<=bounds.maxLng;
}

function reportDetailUrl(reportId){
  const url=new URL("pratiche.html",window.location.href);
  url.searchParams.set("open",String(reportId||""));
  return url.href;
}

function navigateToReport(reportId){
  const id=String(reportId||"").trim();

  if(!id){
    showToast("Codice pratica mancante.");
    return;
  }

  window.location.assign(reportDetailUrl(id));
}

function buildPopupNode(report){
  const wrapper=document.createElement("div");
  wrapper.className="popup";

  const title=document.createElement("h3");
  title.textContent=report.titolo||"Pratica";
  wrapper.appendChild(title);

  const idLine=document.createElement("p");
  const idStrong=document.createElement("b");
  idStrong.textContent=report.id||"";
  idLine.appendChild(idStrong);
  wrapper.appendChild(idLine);

  const address=document.createElement("p");
  address.textContent=report.indirizzo||report.quartiere||"Posizione non indicata";
  wrapper.appendChild(address);

  [
    ["Stato",report.stato||"—"],
    ["Priorità",report.priorita||"Media"],
    ["Referente",report.referenteNome||"Non assegnato"]
  ].forEach(([label,value])=>{
    const line=document.createElement("p");
    const strong=document.createElement("b");
    strong.textContent=label+": ";
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    wrapper.appendChild(line);
  });

  const actions=document.createElement("div");
  actions.className="popup-actions";

  const openButton=document.createElement("button");
  openButton.type="button";
  openButton.className="open-link";
  openButton.textContent="Apri dettaglio pratica";
  openButton.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();

    if(map){
      map.closePopup();
    }

    navigateToReport(report.id);
  });

  actions.appendChild(openButton);
  wrapper.appendChild(actions);

  // Evita che Leaflet intercetti il click del pulsante.
  if(typeof L!=="undefined"&&L.DomEvent){
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
  }

  return wrapper;
}

function initMap(){
  map=L.map("map").setView([41.79,12.47],12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:"&copy; OpenStreetMap"
  }).addTo(map);

  clusterLayer=L.markerClusterGroup({
    showCoverageOnHover:false,
    spiderfyOnMaxZoom:true,
    disableClusteringAtZoom:17,
    maxClusterRadius:54,
    iconCreateFunction(cluster){
      return L.divIcon({
        html:`<div class="cluster-bubble">${cluster.getChildCount()}</div>`,
        className:"cluster-icon",
        iconSize:[46,46]
      });
    }
  });

  heatLayer=L.heatLayer([],{
    radius:28,
    blur:22,
    maxZoom:16,
    minOpacity:.3
  });
}

function renderMap({fit=true}={}){
  clusterLayer.clearLayers();
  markerById.clear();

  if(map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
  if(map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

  const bounds=[];
  const heatPoints=[];

  filtered.filter(validCoords).forEach(r=>{
    const lat=Number(r.latitudine);
    const lng=Number(r.longitudine);
    const marker=L.marker([lat,lng],{icon:markerIcon(r)}).bindPopup(buildPopupNode(r));

    marker.on("click",()=>{
      selectedId=r.id;
      renderTable();
      const row=document.querySelector(`tr[data-id="${CSS.escape(String(r.id))}"]`);
      if(row) row.scrollIntoView({behavior:"smooth",block:"nearest"});
    });

    markerById.set(String(r.id),marker);
    clusterLayer.addLayer(marker);
    bounds.push([lat,lng]);

    const group=statusGroup(r.stato);
    const weight=group==="open"
      ? 1
      : group==="work"
        ? 0.8
        : group==="done"
          ? 0.45
          : 0.25;

    heatPoints.push([lat,lng,weight]);
  });

  heatLayer.setLatLngs(heatPoints);

  if(clusterEnabled) clusterLayer.addTo(map);
  if(heatEnabled) heatLayer.addTo(map);

  if(fit&&bounds.length){
    map.fitBounds(bounds,{padding:[30,30],maxZoom:15});
  }

  setTimeout(()=>map.invalidateSize(),100);
}

function renderTable(){
  tableBody.innerHTML=filtered.map(r=>`
    <tr data-id="${esc(r.id)}" class="${selectedId===r.id?"selected":""}">
      <td>${esc(r.id)}</td>
      <td>${esc(r.titolo||"—")}</td>
      <td>${esc(r.quartiere||"—")}</td>
      <td>${esc(r.categoria||"—")}</td>
      <td><span class="status ${statusGroup(r.stato)}">${esc(r.stato||"—")}</span></td>
      <td>${esc(r.priorita||"Media")}</td>
      <td>
        <button class="open-link" type="button"
                data-open-report="${esc(r.id)}">Apri dettaglio</button>
      </td>
    </tr>
  `).join("")||'<tr><td colspan="7">Nessuna pratica trovata.</td></tr>';

  tableCount.textContent=filtered.length;
  visibleCount.textContent=filtered.length;
}

function updateKpis(){
  const count=g=>reports.filter(r=>statusGroup(r.stato)===g).length;
  kpiOpen.textContent=count("open");
  kpiWork.textContent=count("work");
  kpiDone.textContent=count("done");
  kpiArch.textContent=count("arch");

  geoCount.textContent=reports.filter(validCoords).length;
  noGeoCount.textContent=reports.filter(r=>!validCoords(r)).length;
  neighborhoodCount.textContent=new Set(reports.map(r=>r.quartiere).filter(Boolean)).size;
  priorityCount.textContent=reports.filter(r=>/alta|urgente|critica/i.test(String(r.priorita||""))).length;

  renderCategoryBars();
}

function renderCategoryBars(){
  const counts={};
  reports.forEach(r=>{
    const key=String(r.categoria||"Altro").trim()||"Altro";
    counts[key]=(counts[key]||0)+1;
  });

  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max=top[0]?.[1]||1;

  categoryBars.innerHTML=top.length
    ? `<div style="font-weight:950;color:var(--blue);font-size:.82rem">Categorie principali</div>`+
      top.map(([name,count])=>`
        <div class="category-row">
          <div>
            <div class="category-label"><span>${esc(name)}</span><span>${count}</span></div>
            <div class="category-track"><div class="category-fill" style="width:${Math.round(count/max*100)}%"></div></div>
          </div>
          <div style="text-align:right;font-weight:900;color:var(--blue)">${iconFor(name)}</div>
        </div>
      `).join("")
    : '<div class="loading">Nessuna categoria disponibile.</div>';
}

function applyFilters({fit=true}={}){
  const query=q.value.trim().toLowerCase();

  filtered=reports.filter(r=>{
    const text=[
      r.id,r.titolo,r.indirizzo,r.quartiere,r.categoria,
      r.stato,r.priorita,r.referenteNome
    ].join(" ").toLowerCase();

    return (!query||text.includes(query)) &&
      (!fStato.value||r.stato===fStato.value) &&
      (!fCategoria.value||r.categoria===fCategoria.value) &&
      (!fQuartiere.value||r.quartiere===fQuartiere.value) &&
      (!fPriorita.value||r.priorita===fPriorita.value) &&
      (!fReferente.value||r.referenteNome===fReferente.value);
  });

  if(selectedId&&!filtered.some(r=>String(r.id)===String(selectedId))){
    selectedId=null;
  }

  renderMap({fit});
  renderTable();
}

function resetFilters(){
  q.value="";
  [fStato,fCategoria,fQuartiere,fPriorita,fReferente].forEach(s=>s.value="");
  applyFilters();
}

function focusReport(id){
  selectedId=id;
  const marker=markerById.get(String(id));
  const r=filtered.find(x=>String(x.id)===String(id));

  if(marker&&r){
    map.setView([Number(r.latitudine),Number(r.longitudine)],16);
    if(clusterEnabled) clusterLayer.zoomToShowLayer(marker,()=>marker.openPopup());
    else marker.openPopup();
  } else {
    showToast("Questa pratica non dispone di coordinate geografiche.");
  }

  renderTable();
}

function setSystemStatus(ok,message){
  systemStatus.classList.toggle("error",!ok);
  systemStatusText.textContent=message;
}

function showToast(message){
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000);
}

function updateRefreshLabel(){
  lastRefresh.textContent="Ultimo aggiornamento: "+new Intl.DateTimeFormat("it-IT",{
    hour:"2-digit",minute:"2-digit",second:"2-digit"
  }).format(new Date());
}

function configureAutoRefresh(){
  clearInterval(refreshTimer);
  const delay=Number(refreshInterval.value);
  if(delay>0){
    refreshTimer=setInterval(()=>loadReports(false),delay);
  }
}

async function loadReports(fit=true){
  refreshBtn.disabled=true;
  refreshBtn.textContent="Aggiornamento...";

  try{
    const result=await API.listReports();
    if(!result.ok) throw new Error(result.error||"Errore caricamento pratiche");

    const previousIds=new Set(reports.map(r=>String(r.id)));
    const nextReports=Array.isArray(result.reports)?result.reports:[];
    const newItems=firstLoad?[]:nextReports.filter(r=>!previousIds.has(String(r.id)));

    reports=nextReports;
    setSystemStatus(true,"Sistema operativo");

    fill("fStato",uniq("stato"));
    fill("fCategoria",uniq("categoria"));
    fill("fQuartiere",uniq("quartiere"));
    fill("fPriorita",uniq("priorita"));
    fill("fReferente",uniq("referenteNome"));

    updateKpis();
    applyFilters({fit:firstLoad?true:fit});
    updateRefreshLabel();

    if(newItems.length){
      showToast(`${newItems.length} nuova${newItems.length===1?" pratica":" pratiche"} rilevata${newItems.length===1?"":"e"}.`);
    }else if(!firstLoad){
      showToast("Dati aggiornati.");
    }

    firstLoad=false;
  }catch(e){
    console.error(e);
    setSystemStatus(false,"Connessione non disponibile");
    lastRefresh.textContent="Ultimo aggiornamento: errore";
    tableBody.innerHTML=`<tr><td colspan="7"><div class="error">${esc(e.message)}</div></td></tr>`;
    showToast("Aggiornamento non riuscito.");
  }finally{
    refreshBtn.disabled=false;
    refreshBtn.textContent="Aggiorna ora";
  }
}

function toggleCluster(){
  clusterEnabled=!clusterEnabled;
  clusterBtn.classList.toggle("active",clusterEnabled);
  clusterBtn.textContent=clusterEnabled?"Cluster attivi":"Cluster disattivi";
  renderMap({fit:false});
}

function toggleHeat(){
  heatEnabled=!heatEnabled;
  heatBtn.classList.toggle("active",heatEnabled);
  heatBtn.textContent=heatEnabled?"Heatmap attiva":"Heatmap";
  renderMap({fit:false});
}

q.addEventListener("input",()=>applyFilters({fit:false}));
[fStato,fCategoria,fQuartiere,fPriorita,fReferente].forEach(
  s=>s.addEventListener("change",()=>applyFilters())
);
applyBtn.addEventListener("click",()=>applyFilters());
resetBtn.addEventListener("click",resetFilters);
clusterBtn.addEventListener("click",toggleCluster);
heatBtn.addEventListener("click",toggleHeat);
refreshBtn.addEventListener("click",()=>loadReports(false));
refreshInterval.addEventListener("change",configureAutoRefresh);

tableBody.addEventListener("click",event=>{
  const openButton=event.target.closest("[data-open-report]");

  if(openButton){
    event.preventDefault();
    event.stopPropagation();
    navigateToReport(openButton.dataset.openReport);
    return;
  }

  const row=event.target.closest("tr[data-id]");
  if(row){
    focusReport(row.dataset.id);
  }
});

async function startSalaOperativa(){
  if(!Auth.requireAuth()){
    return;
  }

  if(typeof L==="undefined"||
     typeof L.markerClusterGroup!=="function"||
     typeof L.heatLayer!=="function"){
    setSystemStatus(false,"Librerie mappa non disponibili");
    tableBody.innerHTML=
      '<tr><td colspan="7"><div class="error">Impossibile caricare le librerie della mappa.</div></td></tr>';
    return;
  }

  initMap();
  await loadReports(true);
  configureAutoRefresh();
}

startSalaOperativa();


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

