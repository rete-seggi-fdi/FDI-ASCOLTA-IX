/* FDI Ascolta IX 3.1.0-rc10 - bundle pagina: cambia-password.html */

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


/* ===== assets/js/pages/cambia-password.js ===== */
if(!Auth.requireAuth()) throw new Error("Autenticazione richiesta");
const form=document.getElementById("passwordForm");
const message=document.getElementById("message");
const saveBtn=document.getElementById("saveBtn");
form.addEventListener("submit",async event=>{
  event.preventDefault();message.hidden=true;
  const current=document.getElementById("currentPassword").value;
  const next=document.getElementById("newPassword").value;
  const confirm=document.getElementById("confirmPassword").value;
  if(next!==confirm){message.textContent="Le nuove password non coincidono";message.hidden=false;return}
  if(next.length<12){
    message.textContent="La password deve contenere almeno 12 caratteri";
    message.hidden=false;return;
  }
  if(!/[A-Z]/.test(next)){
    message.textContent="Inserisci almeno una lettera maiuscola";
    message.hidden=false;return;
  }
  if(!/[a-z]/.test(next)){
    message.textContent="Inserisci almeno una lettera minuscola";
    message.hidden=false;return;
  }
  if(!/[0-9]/.test(next)){
    message.textContent="Inserisci almeno un numero";
    message.hidden=false;return;
  }
  if(!/[^A-Za-z0-9]/.test(next)){
    message.textContent="Inserisci almeno un carattere speciale";
    message.hidden=false;return;
  }
  saveBtn.disabled=true;saveBtn.textContent="Salvataggio...";
  try{
    const result=await API.changeOwnPassword(current,next);
    if(!result.ok)throw new Error(result.error||"Aggiornamento non riuscito");
    Auth.clearSession();
    alert("Password aggiornata. Ora accedi con la nuova password.");
    location.replace("login.html");
  }catch(error){message.textContent=error.message||"Errore";message.hidden=false}
  finally{saveBtn.disabled=false;saveBtn.textContent="Salva nuova password"}
});

