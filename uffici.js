let offices = [];
let filteredOffices = [];
let selectedOffice = null;
let officesLoading = false;

const elements = {
  query: document.getElementById("q"),
  activeFilter: document.getElementById("fAttivo"),
  list: document.getElementById("list"),
  officeCount: document.getElementById("officeCount"),
  tableBody: document.getElementById("tableBody"),
  empty: document.getElementById("empty"),
  detail: document.getElementById("detail"),
  activeBadge: document.getElementById("activeBadge"),
  officeName: document.getElementById("officeName"),
  officeSector: document.getElementById("officeSector"),
  officeId: document.getElementById("officeId"),
  officeEmail: document.getElementById("officeEmail"),
  officePhone: document.getElementById("officePhone"),
  officeActive: document.getElementById("officeActive"),
  officeNotes: document.getElementById("officeNotes"),
  contactActions: document.getElementById("contactActions"),
  kpiTotal: document.getElementById("kpiTotal"),
  kpiActive: document.getElementById("kpiActive"),
  kpiEmail: document.getElementById("kpiEmail"),
  kpiPhone: document.getElementById("kpiPhone"),
  toast: document.getElementById("toast"),
  refresh: document.getElementById("refreshOffices")
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function getOfficeName(item) {
  return item.ufficio || item.nome || item.Ufficio || "-";
}

function getOfficeSector(item) {
  return item.settore || item.Settore || "";
}

function getOfficeEmail(item) {
  return item.email || item.Email || "";
}

function getOfficePhone(item) {
  return item.telefono || item.Telefono || "";
}

function getOfficeActive(item) {
  return item.attivo || item.Attivo || "";
}

function isOfficeActive(item) {
  const value = String(getOfficeActive(item)).trim().toLowerCase();
  return value === "sì" || value === "si" || value === "true";
}

function applyFilters() {
  const query = elements.query.value.trim().toLowerCase();
  const activeFilter = elements.activeFilter.value.trim().toLowerCase();

  filteredOffices = offices.filter(item => {
    const searchable = [
      item.id,
      getOfficeName(item),
      getOfficeSector(item),
      getOfficeEmail(item),
      getOfficePhone(item),
      item.note,
      item.Note
    ].join(" ").toLowerCase();

    const activeValue = isOfficeActive(item) ? "sì" : "no";

    return (
      (!query || searchable.includes(query)) &&
      (!activeFilter || activeValue === activeFilter)
    );
  });

  if (
    selectedOffice &&
    !filteredOffices.some(item => String(item.id) === String(selectedOffice.id))
  ) {
    selectedOffice = null;
    elements.detail.classList.add("hidden");
    elements.empty.classList.remove("hidden");
  }

  renderKpis();
  renderList();
  renderTable();
  elements.officeCount.textContent = filteredOffices.length;
}

function renderKpis() {
  elements.kpiTotal.textContent = offices.length;
  elements.kpiActive.textContent = offices.filter(isOfficeActive).length;
  elements.kpiEmail.textContent = offices.filter(item => Boolean(getOfficeEmail(item))).length;
  elements.kpiPhone.textContent = offices.filter(item => Boolean(getOfficePhone(item))).length;
}

function renderList() {
  elements.list.innerHTML = filteredOffices.map(item => `
    <button
      class="office-item ${selectedOffice && String(selectedOffice.id) === String(item.id) ? "active" : ""}"
      type="button"
      data-office-id="${escapeHtml(item.id)}"
      style="width:100%;text-align:left;font:inherit"
    >
      <span>
        <b>${escapeHtml(getOfficeName(item))}</b>
        <span>${escapeHtml(getOfficeSector(item) || "Settore non indicato")}</span>
        <small>${escapeHtml(getOfficeEmail(item) || getOfficePhone(item) || "Contatti non disponibili")}</small>
      </span>
      <span
        class="office-state ${isOfficeActive(item) ? "on" : "off"}"
        title="${isOfficeActive(item) ? "Attivo" : "Non attivo"}"
      ></span>
    </button>
  `).join("") || '<div class="muted">Nessun ufficio trovato.</div>';
}

function renderTable() {
  elements.tableBody.innerHTML = filteredOffices.map(item => `
    <tr
      data-office-id="${escapeHtml(item.id)}"
      class="${selectedOffice && String(selectedOffice.id) === String(item.id) ? "selected" : ""}"
      tabindex="0"
    >
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(getOfficeName(item))}</td>
      <td>${escapeHtml(getOfficeSector(item))}</td>
      <td>${escapeHtml(getOfficeEmail(item))}</td>
      <td>${escapeHtml(getOfficePhone(item))}</td>
      <td>${escapeHtml(getOfficeActive(item))}</td>
    </tr>
  `).join("") || '<tr><td colspan="6">Nessun ufficio trovato.</td></tr>';
}

async function copyText(value) {
  if (!value) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }

    elements.toast.textContent = "Copiato negli appunti.";
    elements.toast.classList.add("show");
    window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
  } catch (_) {
    alert("Impossibile copiare automaticamente.");
  }
}

function makeContactButton(label, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", handler);
  return button;
}

function openOffice(id, scrollToDetail = false) {
  selectedOffice = offices.find(item => String(item.id) === String(id));

  if (!selectedOffice) {
    return false;
  }

  const active = isOfficeActive(selectedOffice);
  const email = getOfficeEmail(selectedOffice);
  const phone = getOfficePhone(selectedOffice);

  elements.empty.classList.add("hidden");
  elements.detail.classList.remove("hidden");

  elements.officeName.textContent = getOfficeName(selectedOffice);
  elements.officeSector.textContent =
    getOfficeSector(selectedOffice) || "Settore non indicato";
  elements.officeId.textContent = selectedOffice.id || "-";
  elements.officeEmail.textContent = email || "-";
  elements.officePhone.textContent = phone || "-";
  elements.officeActive.textContent = active ? "Sì" : "No";
  elements.officeNotes.textContent =
    selectedOffice.note ||
    selectedOffice.Note ||
    "Nessuna nota operativa inserita.";

  elements.activeBadge.textContent = active ? "● Attivo" : "● Non attivo";
  elements.activeBadge.classList.toggle("off", !active);

  elements.contactActions.replaceChildren();

  if (email) {
    const emailLink = document.createElement("a");
    emailLink.className = "mail-btn";
    emailLink.href = "mailto:" + email;
    emailLink.textContent = "✉ Scrivi email";
    elements.contactActions.appendChild(emailLink);

    elements.contactActions.appendChild(
      makeContactButton("Copia email", "copy-btn", () => copyText(email))
    );
  }

  if (phone) {
    const phoneLink = document.createElement("a");
    phoneLink.className = "phone-btn";
    phoneLink.href = "tel:" + phone;
    phoneLink.textContent = "☎ Chiama";
    elements.contactActions.appendChild(phoneLink);

    elements.contactActions.appendChild(
      makeContactButton("Copia telefono", "copy-btn", () => copyText(phone))
    );
  }

  if (!email && !phone) {
    const emptyContact = document.createElement("span");
    emptyContact.className = "muted";
    emptyContact.textContent = "Nessun contatto rapido disponibile.";
    elements.contactActions.appendChild(emptyContact);
  }

  renderList();
  renderTable();

  if (scrollToDetail) {
    window.requestAnimationFrame(() => {
      elements.detail.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return true;
}

async function loadOffices(preserveSelection = false) {
  if (officesLoading) return;

  officesLoading = true;
  const previousId =
    preserveSelection && selectedOffice ? String(selectedOffice.id) : "";

  elements.refresh.disabled = true;
  elements.refresh.textContent = "↻ Aggiornamento...";
  elements.list.innerHTML = '<div class="muted">Caricamento uffici...</div>';

  try {
    const result = await API.listUffici();

    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Errore caricamento uffici");
    }

    offices = Array.isArray(result.uffici) ? result.uffici : [];
    applyFilters();

    const nextId =
      previousId && offices.some(item => String(item.id) === previousId)
        ? previousId
        : offices[0]
          ? offices[0].id
          : "";

    if (nextId) {
      openOffice(nextId, false);
    } else {
      selectedOffice = null;
      elements.detail.classList.add("hidden");
      elements.empty.classList.remove("hidden");
    }
  } catch (error) {
    console.error(error);

    elements.list.innerHTML = `
      <div style="padding:14px;color:#a82323;background:#fff0f0;border-radius:12px">
        ${escapeHtml(error.message)}
      </div>
    `;

    elements.tableBody.innerHTML = `
      <tr><td colspan="6">${escapeHtml(error.message)}</td></tr>
    `;
  } finally {
    officesLoading = false;
    elements.refresh.disabled = false;
    elements.refresh.textContent = "↻ Aggiorna";
  }
}

elements.query.addEventListener("input", applyFilters);
elements.activeFilter.addEventListener("change", applyFilters);
elements.refresh.addEventListener("click", () => loadOffices(true));

elements.list.addEventListener("click", event => {
  const button = event.target.closest("[data-office-id]");
  if (button) {
    openOffice(button.dataset.officeId, true);
  }
});

elements.tableBody.addEventListener("click", event => {
  const row = event.target.closest("tr[data-office-id]");
  if (row) {
    openOffice(row.dataset.officeId, true);
  }
});

elements.tableBody.addEventListener("keydown", event => {
  const row = event.target.closest("tr[data-office-id]");
  if (row && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    openOffice(row.dataset.officeId, true);
  }
});

async function startOfficesPage() {
  if (!Auth.requireAuth()) {
    return;
  }

  await loadOffices(false);
}

startOfficesPage();
