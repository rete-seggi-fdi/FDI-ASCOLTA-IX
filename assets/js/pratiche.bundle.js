/* FDI Ascolta IX 3.1.0-rc14 - bundle pagina: pratiche.html */

/* ===== assets/js/config.js ===== */
const CONFIG = Object.freeze({
  VERSION: "3.1.0-rc14",
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

  logout() {
    const session = this.getSession();
    const token = String(session && session.token || "");

    // Il logout locale deve essere immediato anche se Apps Script è lento.
    this.clearSession();

    // Revoca server best-effort senza aspettare redirect/CORS.
    if (token && navigator.sendBeacon) {
      try {
        const body = JSON.stringify({ action: "logout", authToken: token });
        const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
        navigator.sendBeacon(CONFIG.API_URL, blob);
      } catch (_) {}
    }

    location.replace("login.html");
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
  let delay = 240;
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
        const retryIndex = Math.max(0, Number(options._authRetryCount || 0));
        const retryDelays = [700, 1400, 2600, 4200];

        // Non espellere l'utente per un singolo miss transitorio subito dopo
        // il login o durante una rotazione ContentService.
        if (retryIndex < retryDelays.length) {
          await crmSleep(retryDelays[retryIndex]);
          return this.call(action, params, {
            ...options,
            _authRetryCount: retryIndex + 1
          });
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


/* ===== assets/js/pages/pratiche.js ===== */
Auth.requireAuth();
if(!Auth.isAdmin()){
  const title=document.querySelector('.panel-head h2');
  if(title&&title.textContent.includes('Elenco pratiche'))title.textContent='📋 Le mie pratiche';
}
const WORKFLOW=[['1','Segnalazione ricevuta','La segnalazione è stata registrata dal sistema FDI Ascolta IX.'],['2','Presa in carico dal Gruppo Consiliare','La pratica è stata presa in carico dal Gruppo Consiliare.'],['3','Assegnata al consigliere','La pratica è stata assegnata al consigliere competente.'],['4','Inviata dal consigliere all’ufficio municipale competente','La pratica è stata trasmessa all’ufficio municipale competente.'],['5','In attesa di risposta dall’ufficio municipale competente','La pratica è in attesa di riscontro da parte dell’ufficio competente.'],['6','Risposta ricevuta','È stata ricevuta una risposta relativa alla pratica.'],['7','In lavorazione','La pratica risulta in lavorazione.'],['8','Risolta','La criticità segnalata risulta risolta.'],['9','Archiviata','La pratica è stata archiviata.']];
let reports=[],filtered=[],referenti=[],uffici=[],selected=null,gMap=null,cMap=null,gMarkers=[];
async function get(action,params={}){
  return API.call(action,params);
}
async function post(payload){
  const {action,...params}=payload;
  return API.call(action,params);
}
function esc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[m]));
}

function safeHttpsUrl(value){
  try{const url=new URL(String(value||''),location.href);return url.protocol==='https:'?url.href:''}catch(_){return ''}
}

function valid(r){
  const a=Number(r.latitudine);
  const b=Number(r.longitudine);
  const bounds=CONFIG.COORD_BOUNDS;
  return Number.isFinite(a)&&Number.isFinite(b)&&
    a>=bounds.minLat&&a<=bounds.maxLat&&
    b>=bounds.minLng&&b<=bounds.maxLng;
}

function uniq(k){
  return [...new Set(reports.map(r=>r[k]).filter(Boolean))].sort();
}

function fill(id,vals,label){
  document.getElementById(id).innerHTML=
    '<option value="">'+label+'</option>'+
    vals.map(v=>`<option>${esc(v)}</option>`).join('');
}

function apply(){
  const query=q.value.toLowerCase();
  filtered=reports.filter(r=>{
    const t=[r.id,r.titolo,r.quartiere,r.categoria,r.stato,r.nome]
      .join(' ')
      .toLowerCase();

    return(!query||t.includes(query))&&
      (!fQuartiere.value||r.quartiere===fQuartiere.value)&&
      (!fCategoria.value||r.categoria===fCategoria.value)&&
      (!fStato.value||r.stato===fStato.value)&&
      (!fPriorita.value||r.priorita===fPriorita.value);
  });

  renderList();
  renderGeneralMap();
}

function renderList(){
  count.textContent=filtered.length;
  list.innerHTML=filtered.map(r=>`
    <button
      class="item ${selected&&selected.id===r.id?'active':''}"
      type="button"
      data-report-id="${esc(r.id)}">
      <b>${esc(r.id)}</b><br>
      ${esc(r.titolo)}<br>
      <small class="muted">
        ${esc(r.quartiere)} • ${esc(r.categoria)} • ${esc(r.stato)}
      </small>
    </button>
  `).join('')||'<p class="muted">Nessuna pratica.</p>';

  list.querySelectorAll('[data-report-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      openCase(button.dataset.reportId,true,true);
    });
  });
}

function detailUrl(reportId){
  const url=new URL(window.location.href);
  url.search='';
  url.searchParams.set('open',String(reportId||''));
  url.hash='case';
  return url.href;
}

function buildPracticePopup(report){
  const wrapper=document.createElement('div');

  const title=document.createElement('b');
  title.textContent=report.titolo||'Pratica';
  wrapper.appendChild(title);

  wrapper.appendChild(document.createElement('br'));

  const district=document.createElement('span');
  district.textContent=report.quartiere||'';
  wrapper.appendChild(district);

  wrapper.appendChild(document.createElement('br'));

  const link=document.createElement('a');
  link.className='popup-open';
  link.href=detailUrl(report.id);
  link.textContent='Apri pratica';

  link.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();

    if(gMap){
      gMap.closePopup();
    }

    openCase(report.id,true,true).catch(error=>{
      console.error(error);
      window.location.assign(detailUrl(report.id));
    });
  });

  wrapper.appendChild(link);

  if(typeof L!=='undefined'&&L.DomEvent){
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
  }

  return wrapper;
}

function renderGeneralMap(){
  if(!gMap){
    gMap=L.map('generalMap').setView([41.82,12.45],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(gMap);
  }

  gMarkers.forEach(marker=>marker.remove());
  gMarkers=[];

  filtered.filter(valid).forEach(report=>{
    const marker=L
      .marker([Number(report.latitudine),Number(report.longitudine)])
      .addTo(gMap)
      .bindPopup(buildPracticePopup(report));

    gMarkers.push(marker);
  });

  setTimeout(()=>gMap.invalidateSize(),200);
}

async function openCase(id, scrollToDetail=false, enterDetailMode=false){
  selected=reports.find(r=>String(r.id)===String(id));

  if(!selected){
    return false;
  }

  const currentUrl=new URL(window.location.href);
  currentUrl.searchParams.set('open',selected.id);
  currentUrl.hash='case';
  window.history.replaceState({reportId:selected.id},'',currentUrl);

  if(enterDetailMode){
    document.body.classList.add('detail-mode');
  }

  empty.classList.add('hidden');
  document.getElementById('case').classList.remove('hidden');
  activateTab('dati');

  caseStatus.textContent=selected.stato||'';
  caseTitle.textContent=selected.titolo||'Pratica';
  caseSub.textContent=[selected.quartiere,selected.categoria,selected.data].filter(Boolean).join(' • ');
  citNome.textContent=selected.nome||'-';
  citTel.textContent=selected.telefono||'-';
  citEmail.textContent=selected.email||'-';
  prio.textContent=selected.priorita||'-';
  addr.textContent=selected.indirizzo||'-';
  desc.textContent=selected.descrizione||'-';
  coords.textContent=valid(selected)?selected.latitudine+', '+selected.longitudine:'Coordinate non valide';
  refCurrent.textContent=selected.referenteNome||'Non assegnato';
  const safePhotoUrl=safeHttpsUrl(selected.fotoUrl);
  photo.innerHTML=safePhotoUrl
    ? `<a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="${esc(safePhotoUrl)}">Apri foto allegata</a>`
    : 'Nessuna foto.';

  renderCaseMap();
  renderWorkflow();
  renderRefs();
  renderUffici();
  renderList();

  if(scrollToDetail){
    const detail=document.getElementById('case');

    window.scrollTo({top:0,left:0,behavior:'auto'});

    window.setTimeout(()=>{
      detail.scrollIntoView({
        behavior:'smooth',
        block:'start'
      });
    },80);

    window.setTimeout(()=>{
      const top=Math.max(
        0,
        detail.getBoundingClientRect().top+window.scrollY-105
      );
      window.scrollTo({top,left:0,behavior:'auto'});
    },450);
  }

  renderTimeline().catch(error=>{
    console.error('Errore timeline:',error);
    timeline.innerHTML=
      '<p class="muted">Impossibile caricare la timeline.</p>';
  });

  return true;
}

window.openCase=openCase;

const backToOverview=document.getElementById('backToOverview');

backToOverview.addEventListener('click',()=>{
  document.body.classList.remove('detail-mode');

  const url=new URL(window.location.href);
  url.searchParams.delete('open');
  url.hash='';
  window.history.replaceState({},'',url);

  window.scrollTo({top:0,left:0,behavior:'smooth'});

  window.setTimeout(()=>{
    if(gMap){
      gMap.invalidateSize();
    }
  },250);
});

function renderCaseMap(){
  if(cMap){cMap.remove();cMap=null;}
  caseMapWrap.innerHTML=valid(selected)?'<div id="caseMap"></div>':'<p class="muted">Coordinate mancanti o non valide.</p>';
  if(!valid(selected))return;
  setTimeout(()=>{
    cMap=L.map('caseMap').setView([Number(selected.latitudine),Number(selected.longitudine)],17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(cMap);
    L.marker([Number(selected.latitudine),Number(selected.longitudine)]).addTo(cMap);
    setTimeout(()=>cMap.invalidateSize(),200);
  },80);
}
const fixLocation=document.getElementById('fixLocation');
async function correctSelectedLocation(){
  if(!selected)return alert('Seleziona una pratica');
  if(!selected.indirizzo)return alert('Indirizzo mancante');

  fixLocation.disabled=true;
  fixLocation.textContent='📍 Ricerca indirizzo...';
  try{
    const search=await API.geocodeAddress(selected.indirizzo,selected.quartiere||'');
    if(!search.ok)throw new Error(search.error||'Ricerca indirizzo non riuscita');
    const matches=Array.isArray(search.risultati)?search.risultati:[];
    if(!matches.length)throw new Error('Nessun indirizzo compatibile trovato nel Municipio IX');

    const choices=matches.map((item,index)=>(index+1)+'. '+item.indirizzo).join('\n');
    const answer=prompt('Scegli il risultato da usare:\n\n'+choices,'1');
    if(answer===null)return;
    const index=Number(answer)-1;
    if(!Number.isInteger(index)||!matches[index])throw new Error('Scelta non valida');
    const chosen=matches[index];

    const confirmed=confirm('Aggiornare la pratica con questa posizione?\n\n'+chosen.indirizzo);
    if(!confirmed)return;

    const result=await API.updateReportLocation({
      reportId:selected.id,
      latitudine:chosen.latitudine,
      longitudine:chosen.longitudine,
      indirizzoRisolto:chosen.indirizzo
    });
    if(!result.ok)throw new Error(result.error||'Aggiornamento posizione non riuscito');

    selected.latitudine=result.latitudine;
    selected.longitudine=result.longitudine;
    const row=reports.find(item=>item.id===selected.id);
    if(row){row.latitudine=result.latitudine;row.longitudine=result.longitudine;}
    coords.textContent=result.latitudine+', '+result.longitudine;
    renderCaseMap();
    renderGeneralMap();
    await renderTimeline();
    alert('Posizione aggiornata correttamente.');
  }catch(error){
    alert(error.message||'Errore durante la correzione della posizione');
  }finally{
    fixLocation.disabled=false;
    fixLocation.textContent='📍 Posiziona sulla via indicata';
  }
}
fixLocation.onclick=correctSelectedLocation;

function renderWorkflow(){workflow.innerHTML=WORKFLOW.map(w=>`<button class="btn secondary" type="button" data-workflow-phase="${esc(w[0])}">${w[0]}. ${esc(w[1])}</button>`).join('')}
workflow.addEventListener('click',event=>{const button=event.target.closest('[data-workflow-phase]');if(button)setStatus(button.dataset.workflowPhase)});
async function setStatus(f){
  if(!selected)return alert('Seleziona pratica');
  if(String(f)==='8'){openCloseModal();return;}
  const w=WORKFLOW.find(x=>x[0]===f);
  const res=await post({action:'updateReportStatus',reportId:selected.id,fase:w[0],stato:w[1],descrizione:w[2],visibileCittadino:'Sì',operatore:'Modulo Pratiche'});
  if(res.ok){
    selected.stato=w[1];
    reports.find(r=>r.id===selected.id).stato=w[1];
    apply();
    openCase(selected.id);
  }else alert(res.error||'Errore aggiornamento stato');
}
function renderRefs(){refSelect.innerHTML='<option value="">Seleziona consigliere</option>'+referenti.map(r=>`<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('')}function renderUffici(){const activeOffices=uffici.filter(u=>!/^(no|false|0)$/i.test(String(u.attivo||'Sì').trim()));uffSelect.innerHTML='<option value="">Seleziona ufficio</option>'+activeOffices.map(u=>`<option value="${esc(u.id)}">${esc(u.ufficio||u.nome)} — ${esc(u.settore||'')}</option>`).join('')}sendRef.onclick=async()=>{if(!selected)return alert('Seleziona pratica');if(!refSelect.value)return alert('Seleziona consigliere');const res=await post({action:'sendToReferente',reportId:selected.id,referenteId:refSelect.value,messaggio:refMsg.value});if(res.ok){alert('Inviata al consigliere');location.reload()}else alert(res.error)};sendUff.onclick=async()=>{if(!selected)return alert('Seleziona pratica');if(!uffSelect.value)return alert('Seleziona ufficio');const message=(uffMsg.value||'').trim();if(message.length<10)return alert('Inserisci un messaggio per l’ufficio di almeno 10 caratteri');const res=await post({action:'sendToUfficio',reportId:selected.id,ufficioId:uffSelect.value,messaggio:message});if(res.ok){selected.stato='In attesa di risposta dall’ufficio municipale competente';const item=reports.find(r=>r.id===selected.id);if(item)item.stato=selected.stato;uffMsg.value='';apply();await openCase(selected.id);alert('Pratica inoltrata. Ora è in attesa di risposta dall’ufficio.')}else alert(res.error||'Funzione sendToUfficio non disponibile')};async function renderTimeline(){const res=await get('getTimeline',{reportId:selected.id});const arr=res.ok?(res.timeline||[]):[];timeline.innerHTML=arr.map(t=>`<div><b>${esc(t.titolo)}</b><br><small>${esc(t.data)}</small><br>${esc(t.descrizione)}</div>`).join('')||'<p class="muted">Timeline non disponibile.</p>'}
const closeModal=document.getElementById('closeModal');
const closeModalX=document.getElementById('closeModalX');
const closeCancel=document.getElementById('closeCancel');
const closeConfirm=document.getElementById('closeConfirm');
const closeNotes=document.getElementById('closeNotes');
const closeMsg=document.getElementById('closeMsg');
const closeSendEmail=document.getElementById('closeSendEmail');
const closeArchive=document.getElementById('closeArchive');

function openCloseModal(){
  if(!selected)return alert('Seleziona pratica');
  closeNotes.value='';
  closeMsg.textContent='';
  closeSendEmail.checked=true;
  closeArchive.checked=Auth.isAdmin();
  const archiveRow=closeArchive.closest('label');if(archiveRow)archiveRow.hidden=!Auth.isAdmin();
  closeModal.classList.add('show');
  setTimeout(()=>closeNotes.focus(),80);
}
function closeCloseModal(){closeModal.classList.remove('show');}
async function confirmClosePractice(){
  if(!selected)return alert('Seleziona pratica');
  const outcomeEl=document.querySelector('input[name="closeOutcome"]:checked');
  const outcome=outcomeEl?outcomeEl.value:'Risolta';
  const notes=closeNotes.value.trim();
  if(!notes){closeMsg.textContent='Inserisci le note finali prima di chiudere la pratica.';closeNotes.focus();return;}
  closeConfirm.disabled=true;closeConfirm.textContent='Chiusura...';closeMsg.textContent='Aggiornamento pratica in corso...';
  try{
    const res=await post({action:'closeReport',reportId:selected.id,esito:outcome,noteFinali:notes,inviaEmail:closeSendEmail.checked,archivia:closeArchive.checked,operatore:'Modulo Pratiche'});
    if(!res.ok)throw new Error(res.error||'Errore chiusura pratica');
    const finalStatus=Auth.isAdmin()&&closeArchive.checked?'Archiviata':'Risolta';
    selected.stato=finalStatus;
    const found=reports.find(r=>r.id===selected.id);if(found)found.stato=finalStatus;
    closeCloseModal();apply();openCase(selected.id);alert('Pratica chiusa correttamente.');
  }catch(err){closeMsg.textContent=err.message;alert(err.message);}
  finally{closeConfirm.disabled=false;closeConfirm.textContent='Chiudi pratica';}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&closeModal.classList.contains('show'))closeCloseModal();});
closeModal.addEventListener('click',e=>{if(e.target===closeModal)closeCloseModal();});
closeModalX.onclick=closeCloseModal;
closeCancel.onclick=closeCloseModal;
closeConfirm.onclick=confirmClosePractice;

function activateTab(id){document.querySelectorAll('.tab,.tabpane').forEach(e=>e.classList.remove('active'));document.querySelector(`[data-tab="${id}"]`)?.classList.add('active');document.getElementById(id)?.classList.add('active');if(id==='mappaTab'&&cMap)setTimeout(()=>cMap.invalidateSize(),150)}document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));

if(!Auth.isAdmin()){
  document.body.classList.add('councillor-mode');
  document.querySelectorAll('[data-admin-only],#sendRef,#refSelect,#refMsg').forEach(el=>{
    const container=el.closest('.admin-tools')||el;
    container.style.display='none';
  });
}


const workStartNote=document.getElementById('workStartNote');
const takeChargeBtn=document.getElementById('takeChargeBtn');
const openOfficeTabBtn=document.getElementById('openOfficeTabBtn');
const officeResponseText=document.getElementById('officeResponseText');
const responseReceivedBtn=document.getElementById('responseReceivedBtn');
const resolveCouncillorBtn=document.getElementById('resolveCouncillorBtn');

async function startWorkWithRequiredNote(){
  if(!selected)return alert('Seleziona una pratica');
  const note=(workStartNote.value||'').trim();
  if(note.length<10){
    workStartNote.focus();
    return alert('La nota è obbligatoria e deve contenere almeno 10 caratteri.');
  }
  takeChargeBtn.disabled=true;
  takeChargeBtn.textContent='Aggiornamento...';
  try{
    const result=await API.startReportWork(selected.id,note);
    if(!result.ok)throw new Error(result.error||'Aggiornamento non riuscito');
    workStartNote.value='';
    selected.stato='In lavorazione';
    const item=reports.find(report=>report.id===selected.id);
    if(item)item.stato='In lavorazione';
    apply();
    await openCase(selected.id);
    alert('Pratica segnata in lavorazione.');
  }catch(error){
    alert(error.message||'Errore durante l’aggiornamento');
  }finally{
    takeChargeBtn.disabled=false;
    takeChargeBtn.textContent='Segna in lavorazione';
  }
}

async function saveOfficeResponse(){
  if(!selected)return alert('Seleziona una pratica');
  const response=(officeResponseText.value||'').trim();
  if(response.length<10){
    officeResponseText.focus();
    return alert('Inserisci la risposta ricevuta, almeno 10 caratteri.');
  }
  responseReceivedBtn.disabled=true;
  responseReceivedBtn.textContent='Salvataggio...';
  try{
    const result=await API.recordOfficeResponse(selected.id,response);
    if(!result.ok)throw new Error(result.error||'Risposta non salvata');
    officeResponseText.value='';
    selected.stato='Risposta ricevuta';
    const item=reports.find(report=>report.id===selected.id);
    if(item)item.stato='Risposta ricevuta';
    apply();
    await openCase(selected.id);
    alert('Risposta ricevuta registrata.');
  }catch(error){
    alert(error.message||'Errore durante il salvataggio');
  }finally{
    responseReceivedBtn.disabled=false;
    responseReceivedBtn.textContent='Salva risposta ricevuta';
  }
}

if(takeChargeBtn)takeChargeBtn.onclick=startWorkWithRequiredNote;
if(openOfficeTabBtn)openOfficeTabBtn.onclick=()=>{
  if(!selected)return alert('Seleziona una pratica');
  activateTab('ufficio');
  setTimeout(()=>uffSelect.focus(),80);
};
if(responseReceivedBtn)responseReceivedBtn.onclick=saveOfficeResponse;
if(resolveCouncillorBtn)resolveCouncillorBtn.onclick=openCloseModal;

let practicesLoading=false;

async function boot(preserveSelection=false){
  if(practicesLoading)return;
  practicesLoading=true;

  const previousId=preserveSelection&&selected?selected.id:'';
  refreshPractices.disabled=true;
  refreshPractices.textContent='↻ Aggiornamento...';

  try{
    const isAdminUser=Auth.isAdmin();
    const [r,ref,u]=await Promise.all([
      get('listReports'),
      isAdminUser
        ? get('listReferenti')
        : Promise.resolve({ok:true,referenti:[]}),
      get('listUffici').catch(()=>({ok:false,uffici:[]}))
    ]);

    if(!r.ok)throw new Error(r.error||'Errore caricamento pratiche');
    if(isAdminUser&&!ref.ok)throw new Error(ref.error||'Errore caricamento referenti');

    reports=Array.isArray(r.reports)?r.reports:[];
    referenti=Array.isArray(ref.referenti)?ref.referenti:[];
    uffici=Array.isArray(u.uffici)?u.uffici:[];

    fill('fQuartiere',uniq('quartiere'),'Quartiere');
    fill('fCategoria',uniq('categoria'),'Categoria');
    fill('fStato',uniq('stato'),'Stato');
    fill('fPriorita',uniq('priorita'),'Priorità');
    apply();

    const requestedId=preserveSelection
      ? ''
      : String(new URLSearchParams(window.location.search).get('open')||'').trim();

    const previousExists=previousId&&reports.some(item=>String(item.id)===String(previousId));
    const requestedExists=requestedId&&reports.some(item=>String(item.id)===requestedId);

    const nextId=previousExists
      ? previousId
      : requestedExists
        ? requestedId
        : (reports[0]?reports[0].id:'');

    if(nextId){
      await openCase(nextId,Boolean(requestedExists),Boolean(requestedExists));
    }else{
      selected=null;
      empty.classList.remove('hidden');
      document.getElementById('case').classList.add('hidden');
    }

    if(requestedId&&!requestedExists){
      console.warn('Pratica richiesta non trovata:',requestedId);
      document.getElementById('list').insertAdjacentHTML(
        'afterbegin',
        '<p class="muted" style="padding:10px">La pratica '+esc(requestedId)+' non è stata trovata.</p>'
      );
    }
  }catch(err){
    console.error(err);
    document.getElementById('list').innerHTML='<p class="muted">Errore caricamento: '+esc(err.message)+'</p>';
  }finally{
    practicesLoading=false;
    refreshPractices.disabled=false;
    refreshPractices.textContent='↻ Aggiorna';
  }
}

refreshPractices.onclick=()=>boot(true);
[q,fQuartiere,fCategoria,fStato,fPriorita].forEach(el=>{el.oninput=apply;el.onchange=apply});
boot(false);


/* ===== assets/js/pages/pratiche-2.js ===== */
function updateMiniKpis(){
  const countBy = fn => reports.filter(fn).length;
  miniNew.textContent=countBy(r=>/ricevuta|nuova/i.test(r.stato||''));
  miniWork.textContent=countBy(r=>/presa|assegnata|lavorazione/i.test(r.stato||''));
  miniWait.textContent=countBy(r=>/attesa|ufficio/i.test(r.stato||''));
  miniDone.textContent=countBy(r=>/risolta/i.test(r.stato||''));
  miniArch.textContent=countBy(r=>/archiviata/i.test(r.stato||''));
  mapCount.textContent=filtered.length+' pratiche';
}
const originalApply=apply;
apply=function(){originalApply();updateMiniKpis();};


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

