const user = getSession();
if (!user) location.href = 'login.html';

document.getElementById('userBox').textContent = user ? `${user.nome} · ${user.ruolo}` : '';
document.getElementById('logoutBtn').onclick = () => {
  clearSession();
  location.href = 'login.html';
};

let allReports = [];
let filteredReports = [];
let allReferenti = [];
let selectedReport = null;
let detailMap = null;
let detailMarker = null;

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeCoord(value) {
  if (value === null || value === undefined || value === '') return NaN;
  let s = String(value).trim().replace(',', '.');
  const parts = s.split('.');
  if (parts.length > 2) s = parts[0] + '.' + parts.slice(1).join('');
  return Number(s);
}

function isValidMunicipioIXCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 41.65 && lat <= 42.05 && lng >= 12.25 && lng <= 12.75;
}

function statusClass(stato) {
  const s = String(stato || '').toLowerCase();
  if (s.includes('risolta') || s.includes('chiusa')) return 'status-done';
  if (s.includes('inviata')) return 'status-sent';
  if (s.includes('verifica')) return 'status-work';
  return 'status-new';
}

function updateStats() {
  document.getElementById('dTotali').textContent = allReports.length;
  document.getElementById('dNuove').textContent = allReports.filter(r => String(r.stato).toLowerCase().includes('nuova')).length;
  document.getElementById('dInviate').textContent = allReports.filter(r => String(r.stato).toLowerCase().includes('inviata')).length;
  document.getElementById('dRisolte').textContent = allReports.filter(r => {
    const s = String(r.stato).toLowerCase();
    return s.includes('risolta') || s.includes('chiusa');
  }).length;
}

function applyFilters() {
  const q = String(document.getElementById('searchInput').value || '').trim().toLowerCase();
  const status = String(document.getElementById('statusFilter').value || '').toLowerCase();

  filteredReports = allReports.filter(r => {
    const haystack = [r.id, r.titolo, r.descrizione, r.quartiere, r.indirizzo, r.categoria, r.nome, r.email]
      .map(v => String(v || '').toLowerCase())
      .join(' ');

    const matchesText = !q || haystack.includes(q);
    const s = String(r.stato || '').toLowerCase();
    let matchesStatus = true;

    if (status === 'nuova') matchesStatus = s.includes('nuova');
    if (status === 'inviata') matchesStatus = s.includes('inviata');
    if (status === 'risolta') matchesStatus = s.includes('risolta') || s.includes('chiusa');

    return matchesText && matchesStatus;
  });

  renderReportList();
}

function renderReportList() {
  const list = document.getElementById('reportsList');
  list.innerHTML = '';

  if (!filteredReports.length) {
    list.innerHTML = '<div class="empty-mini">Nessuna pratica trovata.</div>';
    return;
  }

  filteredReports.forEach(r => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'crm-report-item' + (selectedReport && selectedReport.id === r.id ? ' active' : '');
    item.innerHTML = `
      <div class="crm-report-head">
        <span class="status-dot ${statusClass(r.stato)}"></span>
        <strong>${escapeHtml(r.titolo || r.categoria || 'Segnalazione')}</strong>
      </div>
      <div class="meta">${escapeHtml(r.id)}<br>${escapeHtml(r.quartiere || '')} · ${escapeHtml(r.indirizzo || '')}</div>
      <span class="badge ${statusClass(r.stato)}">${escapeHtml(r.stato || 'Nuova')}</span>
    `;
    item.onclick = () => selectReport(r.id);
    list.appendChild(item);
  });
}

function referentiOptions(selectedEmail) {
  if (!allReferenti.length) return '<option value="">Nessun referente configurato</option>';

  return '<option value="">Seleziona referente</option>' + allReferenti.map(ref => {
    const label = `${ref.nome || 'Referente'}${ref.ruolo ? ' — ' + ref.ruolo : ''}${ref.competenze ? ' (' + ref.competenze + ')' : ''}`;
    const selected = selectedEmail && String(ref.email || '').toLowerCase() === String(selectedEmail).toLowerCase() ? 'selected' : '';
    return `<option value="${escapeHtml(ref.id)}" ${selected}>${escapeHtml(label)}</option>`;
  }).join('');
}

function defaultMessage(r) {
  return `Gentile Referente,\n\nil Gruppo Consiliare Fratelli d’Italia del Municipio IX segnala la seguente criticità ricevuta tramite FDI Ascolta IX.\n\nCodice pratica: ${r.id || ''}\nQuartiere: ${r.quartiere || ''}\nCategoria: ${r.categoria || ''}\nTitolo: ${r.titolo || ''}\nDescrizione: ${r.descrizione || ''}\nIndirizzo: ${r.indirizzo || ''}\nPriorità: ${r.priorita || 'Media'}\n\nSi chiede cortesemente un riscontro e, se possibile, l’attivazione degli uffici competenti.\n\nCordiali saluti,\nFDI Ascolta IX`;
}

function selectReport(reportId) {
  selectedReport = allReports.find(r => r.id === reportId) || null;
  renderReportList();
  renderPractice();
}

function renderPractice() {
  const empty = document.getElementById('emptyPractice');
  const content = document.getElementById('practiceContent');

  if (!selectedReport) {
    empty.classList.remove('hidden');
    content.classList.add('hidden');
    return;
  }

  const r = selectedReport;
  empty.classList.add('hidden');
  content.classList.remove('hidden');

  document.getElementById('pStatus').className = `badge ${statusClass(r.stato)}`;
  document.getElementById('pStatus').textContent = r.stato || 'Nuova';
  document.getElementById('pTitle').textContent = r.titolo || r.categoria || 'Segnalazione';
  document.getElementById('pMeta').textContent = `${r.id || ''} · ${r.data || ''}`;
  document.getElementById('pDescription').textContent = r.descrizione || '';
  document.getElementById('pQuartiere').textContent = r.quartiere || '-';
  document.getElementById('pCategoria').textContent = r.categoria || '-';
  document.getElementById('pIndirizzo').textContent = r.indirizzo || '-';
  document.getElementById('pPriorita').textContent = r.priorita || 'Media';
  document.getElementById('pCittadino').textContent = r.nome || '-';
  document.getElementById('pEmail').textContent = r.email || '-';
  document.getElementById('pTelefono').textContent = r.telefono || '-';
  document.getElementById('pReferente').textContent = r.referenteNome || 'Non ancora assegnato';
  document.getElementById('currentStatus').value = r.stato || 'Nuova';
  document.getElementById('referenteSelect').innerHTML = referentiOptions(r.referenteEmail);
  document.getElementById('referenteMessage').value = defaultMessage(r);
  document.getElementById('sendMessageBox').className = 'notice hidden';
  document.getElementById('sendMessageBox').textContent = '';

  const photoBox = document.getElementById('pPhotoBox');
  const photo = document.getElementById('pPhoto');
  if (r.fotoUrl) {
    photo.src = r.fotoUrl;
    photoBox.classList.remove('hidden');
  } else {
    photo.removeAttribute('src');
    photoBox.classList.add('hidden');
  }

  renderDetailMap(r);
}

function renderDetailMap(r) {
  const lat = normalizeCoord(r.latitudine);
  const lng = normalizeCoord(r.longitudine);
  const valid = isValidMunicipioIXCoord(lat, lng);
  const notice = document.getElementById('mapNotice');

  if (!detailMap) {
    detailMap = L.map('detailMap', { scrollWheelZoom: true }).setView([41.827, 12.48], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(detailMap);
  }

  if (detailMarker) {
    detailMarker.remove();
    detailMarker = null;
  }

  if (!valid) {
    notice.className = 'notice error';
    notice.textContent = 'Coordinate mancanti o non valide. Il marker non può essere posizionato.';
    detailMap.setView([41.827, 12.48], 12);
    setTimeout(() => detailMap.invalidateSize(), 250);
    return;
  }

  notice.className = 'notice hidden';
  notice.textContent = '';
  detailMarker = L.marker([lat, lng]).addTo(detailMap)
    .bindPopup(`<strong>${escapeHtml(r.titolo || r.categoria || 'Segnalazione')}</strong><br>${escapeHtml(r.indirizzo || '')}`)
    .openPopup();

  detailMap.setView([lat, lng], 17);
  setTimeout(() => detailMap.invalidateSize(), 250);
}

async function sendSelectedToReferente() {
  if (!selectedReport) return;

  const box = document.getElementById('sendMessageBox');
  const referenteId = document.getElementById('referenteSelect').value;
  const messaggio = document.getElementById('referenteMessage').value;

  if (!referenteId) {
    box.className = 'notice error';
    box.textContent = 'Seleziona un referente prima di inviare.';
    return;
  }

  box.className = 'notice';
  box.textContent = 'Invio email in corso...';

  try {
    const res = await API.sendToReferente(selectedReport.id, referenteId, messaggio);
    if (!res.ok) throw new Error(res.error || 'Errore durante l’invio');
    box.className = 'notice success';
    box.textContent = 'Richiesta inviata correttamente al referente.';
    await loadDashboard(selectedReport.id);
  } catch (err) {
    box.className = 'notice error';
    box.textContent = err.message;
  }
}

async function loadDashboard(keepSelectedId) {
  const [reportsData, referentiData] = await Promise.all([
    API.listReports(),
    API.listReferenti()
  ]);

  allReports = reportsData.reports || [];
  allReferenti = referentiData.referenti || [];

  updateStats();
  applyFilters();

  if (keepSelectedId) {
    selectReport(keepSelectedId);
  } else if (!selectedReport && allReports.length) {
    selectReport(allReports[0].id);
  } else if (selectedReport) {
    selectReport(selectedReport.id);
  }
}

document.getElementById('searchInput').addEventListener('input', applyFilters);
document.getElementById('statusFilter').addEventListener('change', applyFilters);
document.getElementById('sendReferenteBtn').addEventListener('click', sendSelectedToReferente);
document.getElementById('refreshBtn').addEventListener('click', () => loadDashboard(selectedReport && selectedReport.id));

(async function () {
  try {
    await loadDashboard();
  } catch (e) {
    console.error(e);
    document.getElementById('reportsList').innerHTML = '<div class="notice error">Errore caricamento dati.</div>';
  }
})();
