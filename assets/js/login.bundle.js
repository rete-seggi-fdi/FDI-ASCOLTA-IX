/* FDI Ascolta IX 3.1.0-rc5 - bundle pagina: login.html */

/* ===== assets/js/config.js ===== */
const CONFIG = Object.freeze({
  VERSION: "3.1.0-rc5",
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
  getSession() {
    try {
      return JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  },

  saveSession(result) {
    if (!result || !result.token || !result.user) {
      throw new Error("Sessione non valida");
    }
    const expiresAt = Date.now() + Number(result.expiresInSeconds || 0) * 1000;
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
      token: result.token,
      user: result.user,
      mustChangePassword: Boolean(result.user.mustChangePassword),
      expiresAt
    }));
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


/* ===== login transport senza fetch POST/CORS ===== */
function decodeBase64UrlUtf8(value) {
  let normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

function consumeLoginRedirectResult() {
  const match = location.hash.match(/^#auth=([^&]+)$/);
  if (!match) return null;

  let result;
  try {
    result = JSON.parse(decodeBase64UrlUtf8(decodeURIComponent(match[1])));
  } catch (_) {
    result = { ok: false, error: 'Risposta di autenticazione non valida' };
  }

  history.replaceState(null, document.title, location.pathname + location.search);
  return result;
}

function loginViaForm(email, password) {
  const params = new URLSearchParams(location.search);
  const next = Auth.safeNext(params.get('next'), '');
  const payload = JSON.stringify({
    action: 'login',
    email: String(email || '').trim(),
    password: String(password || ''),
    responseMode: 'redirect',
    next: next
  });

  const form = document.createElement('form');
  form.method = 'POST';
  form.action = CONFIG.API_URL;
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 'payload';
  input.value = payload;
  form.appendChild(input);
  document.body.appendChild(form);
  form.submit();

  return new Promise(() => {});
}

/* ===== assets/js/api.js ===== */
const API = Object.freeze({
  async call(action, params = {}, options = {}) {
    const isPublic = Boolean(options.publicAction);
    const payload = { action, ...params };
    const timeoutMs = Math.max(5000, Number(options.timeoutMs || 45000));

    if (!isPublic) {
      if (typeof Auth === "undefined") throw new Error("Modulo autenticazione non caricato");
      const token = Auth.getToken();
      if (!token) {
        Auth.requireAuth();
        throw new Error("Sessione non disponibile");
      }
      payload.authToken = token;
    }

    const controller = typeof AbortController !== "undefined"
      ? new AbortController()
      : null;
    let timeoutId = null;
    let timeoutPromise = null;

    if (controller) {
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    } else {
      timeoutPromise = new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error("Il server non ha risposto entro il tempo previsto")), timeoutMs);
      });
    }

    try {
      const fetchPromise = fetch(CONFIG.API_URL, {
        method: "POST",
        mode: "cors",
        cache: "no-store",
        redirect: "follow",
        credentials: "omit",
        headers: {
          // text/plain è CORS-safelisted e non provoca il preflight OPTIONS
          // che le Web App Apps Script non gestiscono in modo affidabile.
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      });

      const response = timeoutPromise
        ? await Promise.race([fetchPromise, timeoutPromise])
        : await fetchPromise;

      if (!response.ok) throw new Error("Errore API HTTP " + response.status);

      const rawResponse = await response.text();
      let result;
      try {
        result = JSON.parse(rawResponse);
      } catch (_) {
        if (/<!doctype html|<html|accounts\.google\.com|ServiceLogin/i.test(rawResponse)) {
          throw new Error("La Web App Apps Script non è pubblica, l’URL è errato oppure il deploy non è aggiornato");
        }
        throw new Error("Risposta API non valida dal backend");
      }

      if (result && result.authRequired && typeof Auth !== "undefined") {
        Auth.clearSession();
        Auth.requireAuth();
        throw new Error(result.error || "Sessione scaduta");
      }

      if (result && result.passwordChangeRequired && typeof Auth !== "undefined") {
        location.replace("cambia-password.html");
        throw new Error(result.error || "Cambio password richiesto");
      }

      return result;
    } catch (error) {
      if (error && error.name === "AbortError") {
        if (action === "createReport") {
          throw new Error("L’invio sta richiedendo troppo tempo. Controlla se hai ricevuto l’email o se la pratica è comparsa prima di riprovare.");
        }
        throw new Error("Il server non ha risposto entro il tempo previsto");
      }
      if (error instanceof TypeError || /Failed to fetch|NetworkError|Load failed|CORS/i.test(String(error && error.message))) {
        throw new Error("Il browser non riesce a raggiungere il backend Apps Script. Verifica che la Web App sia pubblicata per ‘Chiunque’ e che il deploy sia aggiornato.");
      }
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  },

  health() { return this.call("health", {}, { publicAction: true }); },
  getPublicConfig() { return this.call("getPublicConfig", {}, { publicAction: true }); },
  login(email, password) { return loginViaForm(email, password); },
  logout() { return this.call("logout"); },
  getClientId() {
    let id = localStorage.getItem(CONFIG.CLIENT_ID_KEY);
    if (!id) {
      if (globalThis.crypto && crypto.randomUUID) {
        id = crypto.randomUUID();
      } else if (globalThis.crypto && crypto.getRandomValues) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        id = "client-" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
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


/* ===== assets/js/pages/login.js ===== */
const loginFormEl = document.getElementById("loginForm");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
const messageBoxEl = document.getElementById("messageBox");
const showPassEl = document.getElementById("showPass");

function destinationAfterLogin() {
  const params = new URLSearchParams(location.search);
  const requested = Auth.safeNext(params.get("next"), Auth.homeForRole());
  return Auth.canOpenPage(requested) ? requested : Auth.homeForRole();
}

const redirectedLoginResult = consumeLoginRedirectResult();
if (redirectedLoginResult) {
  if (redirectedLoginResult.ok) {
    try {
      Auth.saveSession(redirectedLoginResult);
      location.replace(redirectedLoginResult.user && redirectedLoginResult.user.mustChangePassword
        ? 'cambia-password.html'
        : Auth.safeNext(redirectedLoginResult.next, destinationAfterLogin()));
    } catch (error) {
      messageBoxEl.hidden = false;
      messageBoxEl.textContent = error && error.message ? error.message : 'Sessione di accesso non valida';
    }
  } else {
    messageBoxEl.hidden = false;
    messageBoxEl.textContent = redirectedLoginResult.error || 'Credenziali non valide o accesso negato';
  }
} else if (Auth.getToken()) {
  location.replace(destinationAfterLogin());
}

showPassEl.addEventListener("click", () => {
  passwordEl.type = passwordEl.type === "password" ? "text" : "password";
});

loginFormEl.addEventListener("submit", async event => {
  event.preventDefault();
  messageBoxEl.hidden = true;
  loginBtnEl.disabled = true;
  loginBtnEl.textContent = "Accesso in corso...";

  try {
    const result = await API.login(emailEl.value.trim(), passwordEl.value);
    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Credenziali non valide o accesso negato");
    }
    Auth.saveSession(result);
    location.replace(result.user && result.user.mustChangePassword
      ? "cambia-password.html"
      : destinationAfterLogin());
  } catch (error) {
    messageBoxEl.hidden = false;
    messageBoxEl.textContent = error && error.message
      ? error.message
      : "Impossibile accedere all’area riservata";
  } finally {
    loginBtnEl.disabled = false;
    loginBtnEl.textContent = "Entra nel CRM";
  }
});


// Diagnostica non bloccante: distingue subito credenziali errate da backend irraggiungibile.
API.health().then(result => {
  if (!result || !result.ok) throw new Error((result && result.error) || "Backend non disponibile");
}).catch(error => {
  messageBoxEl.hidden = false;
  messageBoxEl.textContent = error && error.message
    ? error.message
    : "Backend Apps Script non raggiungibile";
});

