const API = (() => {
  const bridge = {
    iframe: null,
    ready: false,
    readyPromise: null,
    pending: new Map(),
    requestCounter: 0,
    listenerInstalled: false,

    isTrustedBridgeEvent(event) {
      if (!this.iframe || event.source !== this.iframe.contentWindow) return false;
      return event.origin === "https://script.googleusercontent.com" ||
        event.origin === "https://script.google.com";
    },

    installListener() {
      if (this.listenerInstalled) return;
      this.listenerInstalled = true;

      window.addEventListener("message", event => {
        if (!this.isTrustedBridgeEvent(event)) return;
        const data = event.data || {};

        if (data.type === "FDI_BRIDGE_READY") {
          this.ready = true;
          if (this._resolveReady) this._resolveReady(true);
          return;
        }

        if (data.type !== "FDI_API_RESPONSE" || !data.id) return;
        const pending = this.pending.get(data.id);
        if (!pending) return;

        this.pending.delete(data.id);
        window.clearTimeout(pending.timeoutId);

        if (data.error) {
          pending.reject(new Error(String(data.error)));
          return;
        }

        try {
          pending.resolve(JSON.parse(String(data.raw || "{}")));
        } catch (_) {
          pending.reject(new Error("Risposta non valida dal bridge Apps Script"));
        }
      });
    },

    ensureReady() {
      if (this.ready && this.iframe) return Promise.resolve(true);
      if (this.readyPromise) return this.readyPromise;

      this.installListener();
      this.readyPromise = new Promise((resolve, reject) => {
        this._resolveReady = resolve;

        const iframe = document.createElement("iframe");
        iframe.hidden = true;
        iframe.tabIndex = -1;
        iframe.setAttribute("aria-hidden", "true");
        iframe.referrerPolicy = "no-referrer";
        iframe.src = CONFIG.API_URL + "?action=bridge&v=" + encodeURIComponent(CONFIG.VERSION);
        this.iframe = iframe;
        document.body.appendChild(iframe);

        const timeoutId = window.setTimeout(() => {
          if (this.ready) return;
          this.readyPromise = null;
          reject(new Error(
            "Il bridge Apps Script non risponde. Verifica che la Web App sia distribuita come ‘Esegui come: me’ e accessibile a ‘Chiunque’."
          ));
        }, 15000);

        const originalResolve = this._resolveReady;
        this._resolveReady = value => {
          window.clearTimeout(timeoutId);
          originalResolve(value);
        };
      });

      return this.readyPromise;
    },

    async call(payload, timeoutMs) {
      await this.ensureReady();

      const id = "api_" + Date.now().toString(36) + "_" + (++this.requestCounter).toString(36);
      return new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          this.pending.delete(id);
          reject(new Error("Il server non ha risposto entro il tempo previsto"));
        }, timeoutMs);

        this.pending.set(id, { resolve, reject, timeoutId });

        try {
          this.iframe.contentWindow.postMessage({
            type: "FDI_API_REQUEST",
            id,
            payload
          }, "*");
        } catch (error) {
          this.pending.delete(id);
          window.clearTimeout(timeoutId);
          reject(error);
        }
      });
    }
  };

  const api = {
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

      let result;
      try {
        result = await bridge.call(payload, timeoutMs);
      } catch (error) {
        if (action === "createReport" && /tempo previsto|timeout|risponde/i.test(String(error && error.message))) {
          throw new Error(
            "L’invio sta richiedendo troppo tempo. Controlla se hai ricevuto l’email o se la pratica è comparsa prima di riprovare."
          );
        }
        throw error;
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
  };

  return Object.freeze(api);
})();
