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
