const API = Object.freeze({
  async call(action, params = {}, options = {}) {
    const isPublic = Boolean(options.publicAction);
    const payload = { action, ...params };

    if (!isPublic) {
      if (typeof Auth === "undefined") throw new Error("Modulo autenticazione non caricato");
      const token = Auth.getToken();
      if (!token) {
        Auth.requireAuth();
        throw new Error("Sessione non disponibile");
      }
      payload.authToken = token;
    }

    const response = await fetch(CONFIG.API_URL, {
      method: "POST",
      cache: "no-store",
      redirect: "follow",
      body: JSON.stringify(payload)
    });

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

    return result;
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
      id = (globalThis.crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : "client-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      localStorage.setItem(CONFIG.CLIENT_ID_KEY, id);
    }
    return id;
  },
  createReport(data) {
    return this.call("createReport", { ...data, clientId: this.getClientId() }, { publicAction: true });
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
    return this.call("getPublicReport", { code, email }, { publicAction: true });
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
  }
});
