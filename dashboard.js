  const authenticated = Auth.requireAuth();

  let reports = [];
  let filteredReports = [];


  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[char]));
  }

  function parseItalianDate(value) {
    const text = String(value || "");
    const match = text.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/
    );

    if (!match) return new Date(0);

    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4] || 0),
      Number(match[5] || 0)
    );
  }

  function formatDateTime(value) {
    const date = parseItalianDate(value);
    if (!date.getTime()) return esc(value || "—");

    return date.toLocaleString("it-IT", {
      day:"2-digit",
      month:"2-digit",
      year:"numeric",
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function statusClass(status) {
    const value = String(status || "").toLowerCase();

    if (value.includes("archiv")) return "archived";
    if (value.includes("risolt")) return "done";
    if (value.includes("attesa") || value.includes("ufficio")) return "wait";
    if (
      value.includes("presa") ||
      value.includes("assegnata") ||
      value.includes("lavorazione")
    ) {
      return "work";
    }
    return "new";
  }

  function priorityClass(priority) {
    const value = String(priority || "").toLowerCase();
    if (value.includes("alta")) return "high";
    if (value.includes("bassa")) return "low";
    return "medium";
  }

  function isToday(value) {
    const date = parseItalianDate(value);
    const today = new Date();

    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }

  function updateClock() {
    const now = new Date();

    currentDate.textContent = now.toLocaleDateString("it-IT", {
      day:"numeric",
      month:"long",
      year:"numeric"
    });

    currentTime.textContent = now.toLocaleTimeString("it-IT", {
      hour:"2-digit",
      minute:"2-digit"
    });
  }

  function loadOperator() {
    const user = Auth.getUser();
    operatorName.textContent = user && (user.nome || user.email)
      ? (user.nome || user.email)
      : "Area riservata";
  }

  function updateKpis() {
    const count = predicate => reports.filter(predicate).length;

    const newCount = count(r =>
      /ricevuta|nuova/i.test(r.stato || "")
    );

    const workCount = count(r =>
      /presa|assegnata|lavorazione/i.test(r.stato || "")
    );

    const waitingCount = count(r =>
      /attesa|ufficio/i.test(r.stato || "")
    );

    const doneCount = count(r =>
      /risolta/i.test(r.stato || "")
    );

    const archivedCount = count(r =>
      /archiviata/i.test(r.stato || "")
    );

    kpiNew.textContent = newCount;
    kpiWork.textContent = workCount;
    kpiWaiting.textContent = waitingCount;
    kpiDone.textContent = doneCount;
    kpiArchived.textContent = archivedCount;

    totalReports.textContent = reports.length;
    todayReports.textContent = reports.filter(r => isToday(r.data)).length;
    activeReports.textContent = reports.filter(r =>
      !/risolta|archiviata/i.test(r.stato || "")
    ).length;

    const closed = doneCount + archivedCount;
    closureRate.textContent = reports.length
      ? Math.round((closed / reports.length) * 100) + "%"
      : "0%";
  }

  function renderPractices() {
    const list = filteredReports.slice(0, 6);

    if (!list.length) {
      practicesBody.innerHTML =
        '<tr><td colspan="6" class="empty">Nessuna pratica trovata.</td></tr>';
      return;
    }

    practicesBody.innerHTML = list.map(report => `
      <tr>
        <td>
          <a class="id-link" href="pratiche.html?open=${encodeURIComponent(report.id)}">
            ${esc(report.id)}
          </a>
        </td>
        <td class="cell-title">${esc(report.titolo || "Pratica senza titolo")}</td>
        <td>${esc(report.quartiere || "—")}</td>
        <td>
          <span class="status ${statusClass(report.stato)}">
            ${esc(report.stato || "Nuova")}
          </span>
        </td>
        <td>
          <span class="priority ${priorityClass(report.priorita)}">
            ${esc(report.priorita || "Media")}
          </span>
        </td>
        <td class="cell-date">${formatDateTime(report.data)}</td>
      </tr>
    `).join("");
  }

  function renderActivities() {
    const list = filteredReports.slice(0, 5);

    if (!list.length) {
      activityList.innerHTML =
        '<div class="empty">Nessuna attività disponibile.</div>';
      return;
    }

    activityList.innerHTML = list.map(report => {
      const date = parseItalianDate(report.data);

      const time = date.getTime()
        ? date.toLocaleTimeString("it-IT", {
            hour:"2-digit",
            minute:"2-digit"
          })
        : "—";

      return `
        <div class="timeline-item">
          <div class="timeline-time">${esc(time)}</div>
          <div class="timeline-marker"></div>
          <div class="timeline-copy">
            <b>${esc(report.stato || "Aggiornamento pratica")}</b>
            <span>${esc(report.id)} · ${esc(report.quartiere || "—")}</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function applySearch() {
    const query = searchInput.value.trim().toLowerCase();

    filteredReports = reports.filter(report => {
      const text = [
        report.id,
        report.titolo,
        report.quartiere,
        report.categoria,
        report.stato,
        report.priorita,
        report.nome,
        report.email
      ].join(" ").toLowerCase();

      return !query || text.includes(query);
    });

    renderPractices();
    renderActivities();
  }

  function logout() {
    Auth.logout();
  }

  async function boot() {
    loadOperator();
    updateClock();
    setInterval(updateClock, 30000);

    try {
      const result = await API.listReports();

      if (!result.ok) {
        throw new Error(result.error || "Errore caricamento pratiche");
      }

      reports = (result.reports || []).slice().sort((a, b) =>
        parseItalianDate(b.data) - parseItalianDate(a.data)
      );

      filteredReports = reports.slice();

      updateKpis();
      renderPractices();
      renderActivities();

      lastUpdate.textContent = new Date().toLocaleString("it-IT");

    } catch (error) {
      practicesBody.innerHTML =
        '<tr><td colspan="6"><div class="error">Errore caricamento: ' +
        esc(error.message) +
        '</div></td></tr>';

      activityList.innerHTML =
        '<div class="error">Impossibile caricare le attività.</div>';
    }
  }

  searchInput.addEventListener("input", applySearch);
  logoutBtn.addEventListener("click", logout);

  document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      searchInput.focus();
    }
  });

  if (authenticated) boot();
