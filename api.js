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
        timeoutId = window.setTimeout(() => {
          reject(new Error("Il server non ha risposto entro il tempo previsto"));
        }, timeoutMs);
      });
    }

    try {
      const fetchPromise = fetch(CONFIG.API_URL, {
        method: "POST",
        cache: "no-store",
        redirect: "follow",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
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
        const looksLikeHtml = /<!doctype html|<html|accounts\.google\.com/i.test(rawResponse);
        if (looksLikeHtml) {
          throw new Error(
            "La Web App Apps Script non è pubblica, l’URL è errato oppure il deploy non è aggiornato"
          );
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
          throw new Error(
            "L’invio sta richiedendo troppo tempo. Controlla se hai ricevuto l’email o se la pratica è comparsa prima di riprovare."
          );
        }
        throw new Error("Il server non ha risposto entro il tempo previsto");
      }
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  },

  health() { return this.call("health", {}, { publicAction: true }); },
  getPublicConfig() { return this.call("getPublicConfig", {}, { publicAction: true }); },
  login(email, password) {
    return this.call("login", { email, password }, { publicAction: true });
  },
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
  createReport(data) {
    return this.call("createReport", { ...data, clientId: this.getClientId() }, { publicAction: true, timeoutMs: 75000 });
  },
  geocodeAddress(indirizzo, quartiere = "") {
    return this.call(
      "geocodeAddress",
      { indirizzo, quartiere, clientId: this.getClientId() },
      { publicAction: true }
    );
  },
  listQuartieri() { return this.call("listQuartieri", {}, { publicAction: true }); },
  getPublicStats() { return this.call("getPublicStats", {}, { publicAction: true }); },
  getPublicReport(code, email = "") {
    return this.call("getPublicReport", { code, email, clientId: this.getClientId() }, { publicAction: true });
  },
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
  saveConfigurationItem(itemType, item) {
    return this.call("saveConfigurationItem", { itemType, item });
  },
  deactivateConfigurationItem(itemType, id) {
    return this.call("deactivateConfigurationItem", { itemType, id });
  },
  listUsers() { return this.call("listUsers"); },
  saveUser(user) { return this.call("saveUser", { user }); },
  setUserActive(userId, active) { return this.call("setUserActive", { userId, active }); },
  resetUserPassword(userId) {
    return this.call("resetUserPassword", { userId });
  },
  changeOwnPassword(currentPassword, newPassword) {
    return this.call("changeOwnPassword", { currentPassword, newPassword });
  },
  addReportNote(reportId, note, visibileCittadino = false) {
    return this.call("addReportNote", { reportId, note, visibileCittadino });
  },
  startReportWork(reportId, note) {
    return this.call("startReportWork", { reportId, note });
  },
  recordOfficeResponse(reportId, response) {
    return this.call("recordOfficeResponse", { reportId, response });
  }
});
