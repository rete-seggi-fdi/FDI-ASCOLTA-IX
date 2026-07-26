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

    let result;
    try {
      result = await response.json();
    } catch (_) {
      throw new Error("Risposta API non valida");
    }

    if (result && result.authRequired && typeof Auth !== "undefined") {
      Auth.clearSession();
      Auth.requireAuth();
      throw new Error(result.error || "Sessione scaduta");
    }

    return result;
  },

  login(email, password) {
    return this.call("login", { email, password }, { publicAction: true });
  },
  logout() { return this.call("logout"); },
  createReport(data) { return this.call("createReport", data, { publicAction: true }); },
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
  sendToReferente(data) { return this.call("sendToReferente", data); },
  sendToUfficio(data) { return this.call("sendToUfficio", data); },
  closeReport(data) { return this.call("closeReport", data); }
});
