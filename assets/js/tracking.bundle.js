/* FDI Ascolta IX 3.1.0-rc5 - bundle pagina: tracking.html */

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


/* ===== assets/js/pages/tracking.js ===== */
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[char]));
  }

  const WORKFLOW = Object.freeze([
  "Segnalazione ricevuta",
  "Presa in carico dal Gruppo Consiliare",
  "Assegnata al consigliere",
  "Inviata dal consigliere all’ufficio municipale competente",
  "In attesa di risposta dall’ufficio municipale competente",
  "Risposta ricevuta",
  "In lavorazione",
  "Risolta",
  "Archiviata"
]);

function norm(value) {
    return String(value || "").trim().toLowerCase();
  }

  function statusIndex(status) {
    const value = norm(status);

    const exact = WORKFLOW.findIndex(item => norm(item) === value);
    if (exact >= 0) return exact;

    if (value.includes("archiv")) return 8;
    if (value.includes("risolt")) return 7;
    if (value.includes("lavorazione")) return 6;
    if (value.includes("risposta ricevuta")) return 5;
    if (value.includes("attesa")) return 4;
    if (value.includes("ufficio")) return 3;
    if (value.includes("assegnata")) return 2;
    if (value.includes("presa")) return 1;

    return 0;
  }

  function statusClass(status) {
    const value = norm(status);

    if (value.includes("archiv")) return "archived";
    if (value.includes("attesa") || value.includes("ufficio")) return "wait";
    return "";
  }

  function renderTimeline(report, events) {
    const current = statusIndex(report.stato);

    timeline.innerHTML = WORKFLOW.map((label, index) => {
      const done = index < current;
      const isCurrent = index === current;

      const event = (events || []).find(item => {
        const text = norm(
          item.titolo ||
          item.tipo ||
          item.stato ||
          item.descrizione ||
          ""
        );

        return text.includes(norm(label)) || norm(label).includes(text);
      });

      return `
        <div class="timeline-item ${done ? "done" : ""} ${isCurrent ? "current" : ""}">
          <div class="timeline-dot">${done ? "✓" : isCurrent ? "●" : "○"}</div>
          <div class="timeline-copy">
            <b>${esc(label)}</b>
            <span>${event ? esc(event.data || event.dataOra || "") : ""}</span>
          </div>
          <div class="timeline-operator">
            ${event ? esc(event.operatore || "") : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderMap(report) {
    const lat = Number(report.latitudine);
    const lng = Number(report.longitudine);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < CONFIG.COORD_BOUNDS.minLat || lat > CONFIG.COORD_BOUNDS.maxLat ||
      lng < CONFIG.COORD_BOUNDS.minLng || lng > CONFIG.COORD_BOUNDS.maxLng
    ) {
      document.querySelector(".map-box").innerHTML =
        '<div class="photo-box">Posizione non disponibile.</div>';
      return;
    }

    if (trackingMap) {
      trackingMap.remove();
      trackingMap = null;
    }

    trackingMap = L.map("trackingMap").setView([lat, lng], 16);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:"&copy; OpenStreetMap"
    }).addTo(trackingMap);

    L.marker([lat, lng]).addTo(trackingMap);

    setTimeout(() => trackingMap.invalidateSize(), 200);
  }

  function renderCommunications(items) {
    const visible = (items || []).filter(item =>
      norm(item.visibileCittadino || item["Visibile cittadino"]) !== "no"
    );

    communicationsGrid.innerHTML = visible.slice(-5).map(item => `
      <article class="comm-card">
        <small>${esc(item.data || item.dataOra || "")}</small>
        <b>${esc(item.tipo || item.titolo || item.stato || "Aggiornamento")}</b>
        <p>${esc(item.messaggio || item.descrizione || "")}</p>
      </article>
    `).join("") || '<div class="comm-card"><b>Nessuna comunicazione pubblica disponibile.</b></div>';
  }

  function renderOutcome(items, report) {
    const closing = [...(items || [])].reverse().find(item =>
      /chiusura|risolta|archiviata/i.test(
        [item.tipo, item.titolo, item.stato].join(" ")
      )
    );

    if (closing) {
      outcomeBox.innerHTML = `
        <b>✓ Intervento concluso</b>
        <p>${esc(closing.messaggio || closing.descrizione || "Pratica conclusa.")}</p>
      `;
      return;
    }

    if (/risolta|archiviata/i.test(report.stato || "")) {
      outcomeBox.innerHTML = `
        <b>✓ Pratica conclusa</b>
        <p>La pratica è stata chiusa con esito positivo.</p>
      `;
    }
  }

  function renderReport(report, events, communications) {
    currentReport = report;

    reportCode.textContent = report.id || "—";
    reportCode2.textContent = report.id || "—";
    reportTitle.textContent = report.titolo || "Pratica";
    category.textContent = report.categoria || "—";
    district.textContent = report.quartiere || "—";
    priority.textContent = report.priorita || "Media";
    referent.textContent = report.referenteNome || "Non assegnato";
    office.textContent =
      report.ufficioNome ||
      report.ufficio ||
      "Non indicato";

    openedAt.textContent = report.data || "—";
    openedAt2.textContent = report.data || "—";
    closedAt.textContent =
      /risolta|archiviata/i.test(report.stato || "")
        ? (report.dataChiusura || "Conclusa")
        : "—";

    categoryChip.textContent = report.categoria || "Categoria";
    districtChip.textContent = report.quartiere || "Quartiere";

    reportStatus.textContent = report.stato || "Stato non disponibile";
    reportStatus.className = "status-pill " + statusClass(report.stato);

    renderTimeline(report, events);
    renderMap(report);
    renderCommunications(communications);
    renderOutcome(communications, report);

    photoBox.textContent = report.fotoDisponibile
      ? "Foto acquisita e disponibile agli operatori autorizzati."
      : "Nessuna foto disponibile.";

    result.classList.add("show");
    result.scrollIntoView({behavior:"smooth", block:"start"});
  }

  async function searchReport(code) {
    searchMessage.className = "message info";
    searchMessage.textContent = "Ricerca della pratica in corso...";
    searchBtn.disabled = true;
    searchBtn.textContent = "Ricerca...";

    try {
      const response = await API.getPublicReport(code, trackingEmail.value.trim());
      if (!response.ok) {
        throw new Error(response.error || "Pratica non trovata.");
      }

      const report = response.report;
      renderReport(report, response.timeline || [], response.comunicazioni || []);

      searchMessage.className = "message info";
      searchMessage.textContent = "Pratica trovata.";

      const url = new URL(location.href);
      url.search = "";
      url.searchParams.set("id", report.id);
      history.replaceState(null, "", url);

    } catch (error) {
      result.classList.remove("show");
      searchMessage.className = "message error";
      searchMessage.textContent = error.message;

    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = "⌕ Cerca";
    }
  }

  trackingForm.addEventListener("submit", event => {
    event.preventDefault();

    const code = trackingCode.value.trim();

    if (!code) {
      searchMessage.className = "message error";
      searchMessage.textContent = "Inserisci il codice pratica.";
      return;
    }

    searchReport(code);
  });

  printBtn.addEventListener("click", () => window.print());

  copyCodeBtn.addEventListener("click", () => {
    if (!currentReport) return;

    navigator.clipboard.writeText(currentReport.id || "").then(() => {
      copyCodeBtn.textContent = "Codice copiato";
      setTimeout(() => copyCodeBtn.textContent = "Copia codice", 1600);
    });
  });

  const query = new URLSearchParams(location.search);
  const hashQuery = new URLSearchParams(location.hash.replace(/^#/, ""));
  const tokenFromHash = hashQuery.get("token");
  const tokenFromQuery = query.get("token");
  const queryToken = tokenFromHash || tokenFromQuery;
  if (!tokenFromHash && tokenFromQuery && history.replaceState) {
    history.replaceState(null, "", location.pathname + "#token=" + encodeURIComponent(tokenFromQuery));
  }
  const queryId = query.get("id");

  if (queryToken) {
    trackingCode.value = queryToken;
    searchReport(queryToken);
  } else if (queryId) {
    trackingCode.value = queryId;
    searchMessage.textContent = "Inserisci anche l’email usata nella segnalazione.";
  }

