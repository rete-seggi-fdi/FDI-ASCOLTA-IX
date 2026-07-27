/**
 * FDI Ascolta IX — backend hardened
 * Google Apps Script + Google Sheets
 *
 * Principi:
 * - le API private richiedono una sessione server-side;
 * - il tracking pubblico non scarica mai l'elenco completo delle pratiche;
 * - password mai memorizzate in chiaro;
 * - upload, input e frequenza delle richieste sono limitati;
 * - setupSheet non è esposto via HTTP.
 */

const APP = Object.freeze({
  NAME: 'FDI Ascolta IX',
  SCHEMA_VERSION: '2026-07-hardened-2',
  SESSION_HOURS: 8,
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  PHOTO_FOLDER_NAME: 'FDI Ascolta IX Foto',
  PUBLIC_TRACKING_URL: 'https://rete-seggi-fdi.github.io/FDI-ASCOLTA-IX/tracking.html',
  COORDS: Object.freeze({ minLat: 41.65, maxLat: 42.05, minLng: 12.25, maxLng: 12.75 })
});

const SHEETS = Object.freeze({
  REPORTS: 'Segnalazioni',
  REFERENTI: 'Referenti',
  LOG: 'Log_Invii',
  USERS: 'Utenti',
  OFFICES: 'Uffici',
  DISTRICTS: 'Quartieri',
  TIMELINE: 'Timeline',
  COMMUNICATIONS: 'Comunicazioni',
  SESSIONS: 'Sessioni'
});

const HEADERS = Object.freeze({
  [SHEETS.REPORTS]: [
    'ID','Data','Quartiere','Categoria','Titolo','Descrizione','Indirizzo',
    'Latitudine','Longitudine','Foto URL','Stato','Priorità',
    'Referente assegnato','Email referente','Data invio','Nome cittadino',
    'Email cittadino','Telefono cittadino','Note FDI','Tracking Token Hash',
    'Data chiusura','Ufficio ID','Ufficio','Esito finale','Ultimo aggiornamento'
  ],
  [SHEETS.REFERENTI]: [
    'ID','Nome','Ruolo','Partito/Lista','Email','Telefono','Competenze','Zona','Attivo'
  ],
  [SHEETS.LOG]: [
    'Data','Tipo','Segnalazione ID','Destinatario ID','Destinatario','Email',
    'Oggetto','Messaggio','Operatore','Esito'
  ],
  [SHEETS.USERS]: ['ID','Nome','Email','Password','Ruolo','Attivo'],
  [SHEETS.OFFICES]: ['ID','Ufficio','Settore','Email','Telefono','Note','Attivo'],
  [SHEETS.DISTRICTS]: ['Codice','Nome','Tipo','Attivo','Ordine'],
  [SHEETS.TIMELINE]: [
    'ID','Segnalazione ID','Data','Titolo','Descrizione','Stato',
    'Visibile cittadino','Operatore'
  ],
  [SHEETS.COMMUNICATIONS]: [
    'ID','Segnalazione ID','Data','Tipo','Titolo','Messaggio',
    'Visibile cittadino','Operatore'
  ],
  [SHEETS.SESSIONS]: [
    'Token Hash','Utente ID','Email','Creato','Scadenza','Revocato'
  ]
});

const WORKFLOW = Object.freeze([
  'Segnalazione ricevuta',
  'Presa in carico dal Gruppo Consiliare',
  'Assegnata al consigliere',
  'Inviata dal consigliere all’ufficio municipale competente',
  'In attesa di risposta dall’ufficio municipale competente',
  'Risposta ricevuta',
  'In lavorazione',
  'Risolta',
  'Archiviata'
]);

/* =========================
 * FUNZIONI MANUALI DI PRIMO ACCESSO
 * Selezionabili dal menu Esegui di Apps Script
 * ========================= */

/**
 * Eseguire manualmente dall'editor Apps Script per creare/aggiornare un utente.
 * Non è esposto come azione HTTP.
 */
function createOrUpdateUser(email, nome, password, ruolo) {
  setupSheet();
  SpreadsheetApp.flush();
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error('Email non valida');
  if (String(password || '').trim().length < 12) throw new Error('Usare una password di almeno 12 caratteri');

  const salt = Utilities.getUuid().replace(/-/g, '');
  const hashed = hashPassword(String(password).trim(), salt);
  const match = findRow(SHEETS.USERS, row => normalizeEmail(row.Email) === normalizedEmail);
  const values = {
    ID: match && cleanOutput(match.data.ID)
      ? cleanOutput(match.data.ID)
      : 'USR-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    Nome: safeSheetText(cleanText(nome, 120, false)),
    Email: normalizedEmail,
    Password: hashed,
    Ruolo: safeSheetText(cleanText(ruolo || 'Operatore', 80, false)),
    Attivo: 'Sì'
  };

  if (match) setRowFields(SHEETS.USERS, match.rowNumber, values);
  else appendObjectRow(SHEETS.USERS, values);
  return 'Utente configurato: ' + normalizedEmail;
}

/**
 * Funzione senza parametri, visibile nel menu Esegui di Apps Script.
 * Prima dell'esecuzione configurare nelle Proprietà script:
 * INITIAL_USER_EMAIL, INITIAL_USER_NAME, INITIAL_USER_PASSWORD,
 * INITIAL_USER_ROLE (facoltativo, valore predefinito: Amministratore).
 * La proprietà contenente la password viene eliminata dopo il successo.
 */
function repairUsersSheet() {
  const ss = getSpreadsheet();
  ensureSheet(ss, SHEETS.USERS, HEADERS[SHEETS.USERS]);
  SpreadsheetApp.flush();

  const sheet = ss.getSheetByName(SHEETS.USERS);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(value => String(value).trim());
  const missing = HEADERS[SHEETS.USERS].filter(header => headers.indexOf(header) < 0);
  if (missing.length) throw new Error('Intestazioni ancora mancanti: ' + missing.join(', '));
  return 'Foglio Utenti verificato. Intestazioni: ' + HEADERS[SHEETS.USERS].join(', ');
}

function setupInitialUser() {
  const props = PropertiesService.getScriptProperties();
  const email = String(props.getProperty('INITIAL_USER_EMAIL') || '').trim();
  const nome = String(props.getProperty('INITIAL_USER_NAME') || '').trim();
  const password = String(props.getProperty('INITIAL_USER_PASSWORD') || '');
  const ruolo = String(props.getProperty('INITIAL_USER_ROLE') || 'Amministratore').trim();

  const missing = [];
  if (!email) missing.push('INITIAL_USER_EMAIL');
  if (!nome) missing.push('INITIAL_USER_NAME');
  if (!password) missing.push('INITIAL_USER_PASSWORD');
  if (missing.length) {
    throw new Error('Proprietà script mancanti: ' + missing.join(', '));
  }

  const result = createOrUpdateUser(email, nome, password, ruolo);
  props.deleteProperty('INITIAL_USER_PASSWORD');
  return result + '. La proprietà INITIAL_USER_PASSWORD è stata eliminata.';
}

/**
 * Eseguire una sola volta per revocare la condivisione pubblica delle vecchie foto.
 */
function privatizeExistingPhotos() {
  setupSheet();
  let changed = 0;
  readRows(SHEETS.REPORTS).forEach(item => {
    const id = extractDriveFileId(item.data['Foto URL']);
    if (!id) return;
    try {
      DriveApp.getFileById(id).setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
      changed++;
    } catch (_) {}
  });
  return 'Foto rese private: ' + changed;
}

function extractDriveFileId(url) {
  const value = String(url || '');
  const match = value.match(/[-\w]{25,}/);
  return match ? match[0] : '';
}


function doGet(e) {
  try {
    ensureSetup();
    const action = e && e.parameter ? String(e.parameter.action || '').trim() : '';

    if (action === 'health') {
      const ss = getSpreadsheet();
      return json({
        ok: true,
        app: APP.NAME,
        version: APP.SCHEMA_VERSION,
        spreadsheetConnected: Boolean(ss && ss.getId())
      });
    }

    // Compatibilità per le pagine pubbliche meno recenti che usano GET.
    // Nessuna API privata viene esposta tramite GET.
    if (action === 'listQuartieri') {
      return json({ ok: true, quartieri: listQuartieri() });
    }
    if (action === 'getPublicStats') {
      return json({ ok: true, stats: getPublicStats() });
    }

    return json({ ok: true, message: APP.NAME + ' API attiva' });
  } catch (err) {
    return jsonError(err);
  }
}

function doPost(e) {
  try {
    ensureSetup();
    const body = parseBody(e);
    const action = String(body.action || '').trim();

    // Azioni pubbliche, con payload minimizzato e rate limiting.
    if (action === 'health') {
      const ss = getSpreadsheet();
      return json({
        ok: true,
        app: APP.NAME,
        version: APP.SCHEMA_VERSION,
        spreadsheetConnected: Boolean(ss && ss.getId())
      });
    }
    if (action === 'login') return json(loginUser(body));
    if (action === 'createReport') return json(createReport(body));
    if (action === 'listQuartieri') return json({ ok: true, quartieri: listQuartieri() });
    if (action === 'getPublicStats') return json({ ok: true, stats: getPublicStats() });
    if (action === 'getPublicReport') return json(getPublicReport(body));

    // Tutto il resto è privato.
    const user = requireAuth(body);

    if (action === 'logout') return json(logoutUser(body));
    if (action === 'listReports') return json({ ok: true, reports: listReports() });
    if (action === 'listReferenti') return json({ ok: true, referenti: listReferenti() });
    if (action === 'listUffici') return json({ ok: true, uffici: listUffici() });
    if (action === 'updateReportStatus') return json(updateReportStatus(body, user));
    if (action === 'sendToReferente') return json(sendToReferente(body, user));
    if (action === 'sendToUfficio') return json(sendToUfficio(body, user));
    if (action === 'closeReport') return json(closeReport(body, user));
    if (action === 'getTimeline') {
      return json({ ok: true, timeline: getTimeline(body.reportId, false) });
    }
    if (action === 'getCommunications') {
      return json({ ok: true, comunicazioni: getCommunications(body.reportId, false) });
    }

    return json({ ok: false, error: 'Azione non valida' });
  } catch (err) {
    return jsonError(err);
  }
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Nessun dato ricevuto');
  }
  try {
    return JSON.parse(e.postData.contents || '{}');
  } catch (_) {
    throw new Error('JSON non valido');
  }
}

/* =========================
 * Autenticazione e sessioni
 * ========================= */

function loginUser(body) {
  const email = normalizeEmail(body.email);
  const password = String(body.password || '').trim();

  if (!isValidEmail(email) || !password || password.length > 200) {
    throw new Error('Email o password non validi');
  }

  enforceRateLimit('login:global', 100, 900);
  enforceRateLimit('login:' + shortHash(email), 10, 900);

  const userMatch = findRow(SHEETS.USERS, row =>
    normalizeEmail(row.Email) === email && isYes(row.Attivo)
  );

  if (!userMatch || !verifyPassword(password, String(userMatch.data.Password || ''))) {
    throw new Error('Email o password non validi');
  }

  const token = createSession(userMatch.data);
  return {
    ok: true,
    token: token,
    expiresInSeconds: APP.SESSION_HOURS * 3600,
    user: publicUser(userMatch.data)
  };
}

function createSession(userRow) {
  pruneExpiredSessions();
  const rawToken = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const now = new Date();
  const expires = new Date(now.getTime() + APP.SESSION_HOURS * 3600 * 1000);

  appendObjectRow(SHEETS.SESSIONS, {
    'Token Hash': hashToken(rawToken),
    'Utente ID': userRow.ID,
    'Email': normalizeEmail(userRow.Email),
    'Creato': now,
    'Scadenza': expires,
    'Revocato': 'No'
  });

  return rawToken;
}

function requireAuth(body) {
  const rawToken = String(body.authToken || '').trim();
  if (!rawToken || rawToken.length < 40) throw authError();

  const tokenHash = hashToken(rawToken);
  const session = findRow(SHEETS.SESSIONS, row =>
    secureEquals(String(row['Token Hash'] || ''), tokenHash) && !isYes(row.Revocato)
  );

  if (!session) throw authError();
  const expires = toDate(session.data.Scadenza);
  if (!expires || expires.getTime() <= Date.now()) {
    setRowFields(SHEETS.SESSIONS, session.rowNumber, { Revocato: 'Sì' });
    throw authError();
  }

  const user = findRow(SHEETS.USERS, row =>
    String(row.ID || '') === String(session.data['Utente ID'] || '') && isYes(row.Attivo)
  );
  if (!user) throw authError();

  return publicUser(user.data);
}

function logoutUser(body) {
  const tokenHash = hashToken(String(body.authToken || ''));
  const session = findRow(SHEETS.SESSIONS, row =>
    secureEquals(String(row['Token Hash'] || ''), tokenHash)
  );
  if (session) setRowFields(SHEETS.SESSIONS, session.rowNumber, { Revocato: 'Sì' });
  return { ok: true };
}

function authError() {
  const err = new Error('Sessione non valida o scaduta');
  err.authRequired = true;
  return err;
}

function publicUser(row) {
  return {
    id: String(row.ID || ''),
    nome: cleanOutput(row.Nome),
    email: normalizeEmail(row.Email),
    ruolo: cleanOutput(row.Ruolo)
  };
}

function hashPassword(password, salt) {
  const pepper = getSecretPepper();
  return 'v1$' + salt + '$' + bytesToHex(
    Utilities.computeHmacSha256Signature(salt + '|' + password, pepper)
  );
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('v1$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  return secureEquals(hashPassword(password, parts[1]), stored);
}

function migratePlainPasswords() {
  const sheet = sheetByName(SHEETS.USERS);
  const rows = readRows(SHEETS.USERS);
  const passwordCol = headerIndex(sheet, 'Password');

  rows.forEach(item => {
    const current = String(item.data.Password || '').trim();
    if (current && !current.startsWith('v1$')) {
      const salt = Utilities.getUuid().replace(/-/g, '');
      sheet.getRange(item.rowNumber, passwordCol).setValue(hashPassword(current, salt));
    }
  });
}

function getSecretPepper() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('AUTH_PEPPER');
  if (!pepper) {
    pepper = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('AUTH_PEPPER', pepper);
  }
  return pepper;
}

function pruneExpiredSessions() {
  const sheet = sheetByName(SHEETS.SESSIONS);
  const rows = readRows(SHEETS.SESSIONS);
  const now = Date.now();
  const revokeCol = headerIndex(sheet, 'Revocato');

  rows.forEach(item => {
    const expiry = toDate(item.data.Scadenza);
    if (expiry && expiry.getTime() <= now && !isYes(item.data.Revocato)) {
      sheet.getRange(item.rowNumber, revokeCol).setValue('Sì');
    }
  });
}

/* =========================
 * API pubbliche
 * ========================= */

function createReport(body) {
  enforceRateLimit('create:global', 60, 600);

  const email = normalizeEmail(body.email);
  const clientId = cleanText(body.clientId || 'anonimo', 120, false);
  enforceRateLimit('create:email:' + shortHash(email), 5, 3600);
  enforceRateLimit('create:client:' + shortHash(clientId), 10, 3600);

  if (String(body.website || '').trim()) throw new Error('Invio non valido');
  if (!truthy(body.consenso)) throw new Error('È necessario accettare il consenso dati');

  const report = {
    nome: requiredText(body.nome, 'Nome e cognome', 120),
    email: email,
    telefono: cleanText(body.telefono, 40, false),
    quartiere: requiredText(body.quartiere, 'Quartiere', 120),
    categoria: requiredText(body.categoria, 'Categoria', 100),
    titolo: requiredText(body.titolo, 'Titolo', 180),
    descrizione: requiredText(body.descrizione, 'Descrizione', 5000),
    indirizzo: requiredText(body.indirizzo, 'Indirizzo', 300),
    priorita: normalizePriority(body.priorita),
    latitudine: normalizeCoordinate(body.latitudine),
    longitudine: normalizeCoordinate(body.longitudine)
  };

  if (!isValidEmail(report.email)) throw new Error('Indirizzo email non valido');
  if (!isValidMunicipioIXCoord(report.latitudine, report.longitudine)) {
    throw new Error('Coordinate non valide o fuori area Municipio IX');
  }

  const photo = body.foto && body.foto.base64 ? validatePhoto(body.foto) : null;
  const id = generateReportId();
  const trackingToken = generateTrackingToken();
  const now = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let rowNumber;
  try {
    rowNumber = appendObjectRow(SHEETS.REPORTS, {
      'ID': id,
      'Data': now,
      'Quartiere': safeSheetText(report.quartiere),
      'Categoria': safeSheetText(report.categoria),
      'Titolo': safeSheetText(report.titolo),
      'Descrizione': safeSheetText(report.descrizione),
      'Indirizzo': safeSheetText(report.indirizzo),
      'Latitudine': report.latitudine,
      'Longitudine': report.longitudine,
      'Foto URL': '',
      'Stato': WORKFLOW[0],
      'Priorità': report.priorita,
      'Nome cittadino': safeSheetText(report.nome),
      'Email cittadino': report.email,
      'Telefono cittadino': safeSheetText(report.telefono),
      'Tracking Token Hash': hashToken(trackingToken),
      'Ultimo aggiornamento': now
    });
  } finally {
    lock.releaseLock();
  }

  let photoWarning = '';
  if (photo) {
    try {
      const photoUrl = savePhoto(photo, id);
      setRowFields(SHEETS.REPORTS, rowNumber, { 'Foto URL': photoUrl });
    } catch (err) {
      photoWarning = 'La pratica è stata creata, ma la foto non è stata salvata.';
    }
  }

  let timelineWarning = '';
  try {
    appendTimeline(id, WORKFLOW[0], 'La segnalazione è stata registrata dal sistema.', WORKFLOW[0], true, 'Sistema');
  } catch (_) {
    timelineWarning = 'La pratica è stata creata, ma la timeline iniziale non è stata registrata.';
  }

  let emailSent = false;
  let emailWarning = '';
  try {
    sendCitizenConfirmation({
      id: id,
      trackingToken: trackingToken,
      nome: report.nome,
      email: report.email,
      quartiere: report.quartiere,
      categoria: report.categoria,
      titolo: report.titolo,
      indirizzo: report.indirizzo
    });
    emailSent = true;
  } catch (err) {
    emailWarning = 'La pratica è stata registrata, ma l’email di conferma non è partita.';
  }

  return {
    ok: true,
    id: id,
    trackingToken: trackingToken,
    trackingUrl: APP.PUBLIC_TRACKING_URL + '?token=' + encodeURIComponent(trackingToken),
    emailSent: emailSent,
    warning: [photoWarning, timelineWarning, emailWarning].filter(Boolean).join(' ')
  };
}

function getPublicStats() {
  const reports = readRows(SHEETS.REPORTS).map(item => item.data).filter(row => row.ID);
  const districts = {};
  let forwarded = 0;
  let closed = 0;

  reports.forEach(row => {
    const status = String(row.Stato || '').toLowerCase();
    if (/assegnata|inviata|ufficio|attesa|risposta|lavorazione/.test(status)) forwarded++;
    if (/risolta|archiviata/.test(status)) closed++;
    const q = cleanOutput(row.Quartiere);
    if (q) districts[q] = true;
  });

  return {
    received: reports.length,
    forwarded: forwarded,
    closed: closed,
    districts: Object.keys(districts).length
  };
}

function getPublicReport(body) {
  const code = cleanText(body.code || body.trackingToken || body.reportId, 160, false);
  const email = normalizeEmail(body.email);
  if (!code) throw new Error('Inserisci il codice pratica');

  enforceRateLimit('tracking:global', 300, 600);
  enforceRateLimit('tracking:' + shortHash(code), 30, 600);

  const tokenHash = hashToken(code);
  let match = findRow(SHEETS.REPORTS, row =>
    row['Tracking Token Hash'] && secureEquals(String(row['Tracking Token Hash']), tokenHash)
  );

  if (!match) {
    match = findRow(SHEETS.REPORTS, row => String(row.ID || '').toLowerCase() === code.toLowerCase());
    if (!match || !email || normalizeEmail(match.data['Email cittadino']) !== email) {
      throw new Error('Codice pratica non trovato o email non corrispondente');
    }
  }

  const report = match.data;
  return {
    ok: true,
    report: publicReport(report),
    timeline: getTimeline(report.ID, true),
    comunicazioni: getCommunications(report.ID, true)
  };
}

function publicReport(row) {
  return {
    id: cleanOutput(row.ID),
    data: formatDate(row.Data),
    quartiere: cleanOutput(row.Quartiere),
    categoria: cleanOutput(row.Categoria),
    titolo: cleanOutput(row.Titolo),
    descrizione: cleanOutput(row.Descrizione),
    indirizzo: cleanOutput(row.Indirizzo),
    latitudine: normalizeCoordinate(row.Latitudine),
    longitudine: normalizeCoordinate(row.Longitudine),
    stato: cleanOutput(row.Stato),
    priorita: cleanOutput(row['Priorità']),
    referenteNome: cleanOutput(row['Referente assegnato']),
    ufficioNome: cleanOutput(row.Ufficio),
    dataChiusura: formatDate(row['Data chiusura']),
    esitoFinale: cleanOutput(row['Esito finale']),
    fotoDisponibile: Boolean(row['Foto URL'])
  };
}

function listQuartieri() {
  return readRows(SHEETS.DISTRICTS)
    .map(item => item.data)
    .filter(row => row.Nome && !isNo(row.Attivo))
    .map(row => ({
      codice: cleanOutput(row.Codice),
      id: cleanOutput(row.Codice),
      nome: cleanOutput(row.Nome),
      tipo: cleanOutput(row.Tipo),
      attivo: cleanOutput(row.Attivo),
      ordine: Number(row.Ordine || 999)
    }))
    .sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome, 'it'));
}

/* =========================
 * API private
 * ========================= */

function listReports() {
  return readRows(SHEETS.REPORTS)
    .map(item => item.data)
    .filter(row => row.ID)
    .map(row => ({
      id: cleanOutput(row.ID),
      data: formatDate(row.Data),
      quartiere: cleanOutput(row.Quartiere),
      categoria: cleanOutput(row.Categoria),
      titolo: cleanOutput(row.Titolo),
      descrizione: cleanOutput(row.Descrizione),
      indirizzo: cleanOutput(row.Indirizzo),
      latitudine: normalizeCoordinate(row.Latitudine),
      longitudine: normalizeCoordinate(row.Longitudine),
      fotoUrl: cleanOutput(row['Foto URL']),
      stato: cleanOutput(row.Stato),
      priorita: cleanOutput(row['Priorità']),
      referenteNome: cleanOutput(row['Referente assegnato']),
      referenteEmail: normalizeEmail(row['Email referente']),
      dataInvio: formatDate(row['Data invio']),
      nome: cleanOutput(row['Nome cittadino']),
      email: normalizeEmail(row['Email cittadino']),
      telefono: cleanOutput(row['Telefono cittadino']),
      noteFdI: cleanOutput(row['Note FDI']),
      dataChiusura: formatDate(row['Data chiusura']),
      ufficioId: cleanOutput(row['Ufficio ID']),
      ufficioNome: cleanOutput(row.Ufficio),
      esitoFinale: cleanOutput(row['Esito finale']),
      ultimoAggiornamento: formatDate(row['Ultimo aggiornamento'])
    }))
    .reverse();
}

function listReferenti() {
  return readRows(SHEETS.REFERENTI)
    .map(item => item.data)
    .filter(row => row.ID && !isNo(row.Attivo))
    .map(row => ({
      id: cleanOutput(row.ID),
      nome: cleanOutput(row.Nome),
      ruolo: cleanOutput(row.Ruolo),
      partito: cleanOutput(row['Partito/Lista']),
      email: normalizeEmail(row.Email),
      telefono: cleanOutput(row.Telefono),
      competenze: cleanOutput(row.Competenze),
      zona: cleanOutput(row.Zona),
      attivo: cleanOutput(row.Attivo)
    }));
}

function listUffici() {
  return readRows(SHEETS.OFFICES)
    .map(item => item.data)
    .filter(row => row.ID)
    .map(row => ({
      id: cleanOutput(row.ID),
      ufficio: cleanOutput(row.Ufficio),
      nome: cleanOutput(row.Ufficio),
      settore: cleanOutput(row.Settore),
      email: normalizeEmail(row.Email),
      telefono: cleanOutput(row.Telefono),
      note: cleanOutput(row.Note),
      attivo: cleanOutput(row.Attivo)
    }));
}

function updateReportStatus(body, user) {
  const report = requireReport(body.reportId);
  const status = requiredText(body.stato, 'Stato', 160);
  const description = cleanText(body.descrizione, 2000, true) || ('Stato aggiornato a: ' + status);
  const visible = !isNo(body.visibileCittadino);

  if (WORKFLOW.indexOf(status) < 0) throw new Error('Stato non valido');

  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, {
    'Stato': status,
    'Ultimo aggiornamento': now
  });
  appendTimeline(report.data.ID, status, description, status, visible, user.nome || user.email);
  return { ok: true, stato: status };
}

function sendToReferente(body, user) {
  enforceRateLimit('mail:user:' + shortHash(user.id || user.email), 30, 3600);
  const report = requireReport(body.reportId);
  const refId = requiredText(body.referenteId, 'Referente', 80);
  const ref = findRow(SHEETS.REFERENTI, row =>
    String(row.ID || '') === refId && isYes(row.Attivo)
  );

  if (!ref) throw new Error('Referente non trovato');
  const email = normalizeEmail(ref.data.Email);
  if (!isValidEmail(email)) throw new Error('Email referente mancante o non valida');

  const subject = APP.NAME + ' - Segnalazione ' + cleanOutput(report.data.ID);
  const message = cleanText(body.messaggio, 6000, true) || buildDefaultMessage(report.data, ref.data);
  ensureMailQuota();

  MailApp.sendEmail({ to: email, subject: subject, body: message, name: APP.NAME });

  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, {
    'Stato': WORKFLOW[2],
    'Referente assegnato': cleanOutput(ref.data.Nome),
    'Email referente': email,
    'Data invio': now,
    'Ultimo aggiornamento': now
  });
  appendTimeline(report.data.ID, WORKFLOW[2], 'Pratica assegnata al referente ' + cleanOutput(ref.data.Nome) + '.', WORKFLOW[2], true, user.nome);
  appendLog('Referente', report.data.ID, ref.data.ID, ref.data.Nome, email, subject, message, user.nome, 'Inviata');
  return { ok: true };
}

function sendToUfficio(body, user) {
  enforceRateLimit('mail:user:' + shortHash(user.id || user.email), 30, 3600);
  const report = requireReport(body.reportId);
  const officeId = requiredText(body.ufficioId, 'Ufficio', 80);
  const office = findRow(SHEETS.OFFICES, row =>
    String(row.ID || '') === officeId && isYes(row.Attivo)
  );

  if (!office) throw new Error('Ufficio non trovato o non attivo');
  const email = normalizeEmail(office.data.Email);
  if (!isValidEmail(email)) throw new Error('Email ufficio mancante o non valida');

  const subject = APP.NAME + ' - Pratica ' + cleanOutput(report.data.ID);
  const message = cleanText(body.messaggio, 6000, true) || buildOfficeMessage(report.data, office.data);
  ensureMailQuota();

  MailApp.sendEmail({ to: email, subject: subject, body: message, name: APP.NAME });

  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, {
    'Stato': WORKFLOW[3],
    'Ufficio ID': cleanOutput(office.data.ID),
    'Ufficio': cleanOutput(office.data.Ufficio),
    'Ultimo aggiornamento': now
  });
  appendTimeline(report.data.ID, WORKFLOW[3], 'Pratica trasmessa a ' + cleanOutput(office.data.Ufficio) + '.', WORKFLOW[3], true, user.nome);
  appendCommunication(report.data.ID, 'Invio ufficio', WORKFLOW[3], 'La pratica è stata trasmessa all’ufficio competente.', true, user.nome);
  appendLog('Ufficio', report.data.ID, office.data.ID, office.data.Ufficio, email, subject, message, user.nome, 'Inviata');
  return { ok: true };
}

function closeReport(body, user) {
  const report = requireReport(body.reportId);
  const outcome = requiredText(body.esito || 'Risolta', 'Esito', 120);
  const notes = requiredText(body.noteFinali, 'Note finali', 3000);
  const archive = truthy(body.archivia);
  const finalStatus = archive ? WORKFLOW[8] : WORKFLOW[7];
  const now = new Date();

  setRowFields(SHEETS.REPORTS, report.rowNumber, {
    'Stato': finalStatus,
    'Note FDI': safeSheetText(notes),
    'Data chiusura': now,
    'Esito finale': safeSheetText(outcome),
    'Ultimo aggiornamento': now
  });

  appendTimeline(report.data.ID, finalStatus, notes, finalStatus, true, user.nome);
  appendCommunication(report.data.ID, 'Chiusura', finalStatus, notes, true, user.nome);

  let emailSent = false;
  let warning = '';
  if (truthy(body.inviaEmail)) {
    try {
      sendCitizenClosure(report.data, outcome, notes);
      emailSent = true;
    } catch (_) {
      warning = 'Pratica chiusa, ma email al cittadino non inviata.';
    }
  }

  return { ok: true, stato: finalStatus, emailSent: emailSent, warning: warning };
}

function getTimeline(reportId, publicOnly) {
  const id = cleanText(reportId, 100, false);
  if (!id) throw new Error('ID pratica mancante');

  return readRows(SHEETS.TIMELINE)
    .map(item => item.data)
    .filter(row => String(row['Segnalazione ID'] || '') === id)
    .filter(row => !publicOnly || !isNo(row['Visibile cittadino']))
    .map(row => ({
      id: cleanOutput(row.ID),
      data: formatDate(row.Data),
      titolo: cleanOutput(row.Titolo),
      descrizione: cleanOutput(row.Descrizione),
      stato: cleanOutput(row.Stato),
      visibileCittadino: cleanOutput(row['Visibile cittadino']),
      operatore: publicOnly ? '' : cleanOutput(row.Operatore)
    }));
}

function getCommunications(reportId, publicOnly) {
  const id = cleanText(reportId, 100, false);
  if (!id) throw new Error('ID pratica mancante');

  return readRows(SHEETS.COMMUNICATIONS)
    .map(item => item.data)
    .filter(row => String(row['Segnalazione ID'] || '') === id)
    .filter(row => !publicOnly || !isNo(row['Visibile cittadino']))
    .map(row => ({
      id: cleanOutput(row.ID),
      data: formatDate(row.Data),
      tipo: cleanOutput(row.Tipo),
      titolo: cleanOutput(row.Titolo),
      messaggio: cleanOutput(row.Messaggio),
      visibileCittadino: cleanOutput(row['Visibile cittadino']),
      operatore: publicOnly ? '' : cleanOutput(row.Operatore)
    }));
}

/* =========================
 * Email
 * ========================= */

function sendCitizenConfirmation(report) {
  ensureMailQuota();
  const trackingUrl = APP.PUBLIC_TRACKING_URL + '?token=' + encodeURIComponent(report.trackingToken);
  const subject = APP.NAME + ' - Segnalazione ricevuta ' + report.id;
  const body =
    'Gentile ' + (report.nome || 'cittadino') + ',\n\n' +
    'abbiamo ricevuto la tua segnalazione.\n\n' +
    'Codice pratica: ' + report.id + '\n' +
    'Quartiere: ' + (report.quartiere || '') + '\n' +
    'Categoria: ' + (report.categoria || '') + '\n' +
    'Titolo: ' + (report.titolo || '') + '\n' +
    'Indirizzo: ' + (report.indirizzo || '') + '\n\n' +
    'Link personale per seguire la pratica:\n' + trackingUrl + '\n\n' +
    'Non condividere il link: consente di consultare i dettagli della pratica.\n\n' +
    'Cordiali saluti,\n' + APP.NAME;

  MailApp.sendEmail({ to: report.email, subject: subject, body: body, name: APP.NAME });
}

function sendCitizenClosure(reportRow, outcome, notes) {
  const email = normalizeEmail(reportRow['Email cittadino']);
  if (!isValidEmail(email)) throw new Error('Email cittadino non valida');
  ensureMailQuota();

  const subject = APP.NAME + ' - Aggiornamento pratica ' + cleanOutput(reportRow.ID);
  const body =
    'Gentile ' + (cleanOutput(reportRow['Nome cittadino']) || 'cittadino') + ',\n\n' +
    'la pratica ' + cleanOutput(reportRow.ID) + ' è stata conclusa.\n' +
    'Esito: ' + outcome + '\n\n' +
    notes + '\n\n' +
    'Cordiali saluti,\n' + APP.NAME;

  MailApp.sendEmail({ to: email, subject: subject, body: body, name: APP.NAME });
}

function buildDefaultMessage(report, ref) {
  return (
    'Gentile ' + cleanOutput(ref.Nome) + ',\n\n' +
    'si segnala la seguente criticità ricevuta tramite ' + APP.NAME + '.\n\n' +
    'ID: ' + cleanOutput(report.ID) + '\n' +
    'Quartiere: ' + cleanOutput(report.Quartiere) + '\n' +
    'Categoria: ' + cleanOutput(report.Categoria) + '\n' +
    'Titolo: ' + cleanOutput(report.Titolo) + '\n' +
    'Descrizione: ' + cleanOutput(report.Descrizione) + '\n' +
    'Indirizzo: ' + cleanOutput(report.Indirizzo) + '\n' +
    'Priorità: ' + cleanOutput(report['Priorità']) + '\n\n' +
    'Si chiede cortesemente un riscontro.\n\n' +
    'Cordiali saluti,\n' + APP.NAME
  );
}

function buildOfficeMessage(report, office) {
  return (
    'Spett.le ' + cleanOutput(office.Ufficio) + ',\n\n' +
    'si trasmette la pratica territoriale seguente.\n\n' +
    'ID: ' + cleanOutput(report.ID) + '\n' +
    'Quartiere: ' + cleanOutput(report.Quartiere) + '\n' +
    'Categoria: ' + cleanOutput(report.Categoria) + '\n' +
    'Titolo: ' + cleanOutput(report.Titolo) + '\n' +
    'Descrizione: ' + cleanOutput(report.Descrizione) + '\n' +
    'Indirizzo: ' + cleanOutput(report.Indirizzo) + '\n\n' +
    'Si richiede un riscontro sullo stato dell’intervento.\n\n' +
    'Cordiali saluti,\n' + APP.NAME
  );
}

function ensureMailQuota() {
  if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Quota email giornaliera esaurita');
}

/* =========================
 * Foto
 * ========================= */

function validatePhoto(file) {
  const base64 = String(file.base64 || '').trim();
  if (!base64) throw new Error('Foto non valida');

  const estimated = Math.floor(base64.length * 3 / 4);
  if (estimated > APP.MAX_PHOTO_BYTES) throw new Error('La foto supera il limite di 5 MB');

  let bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (_) {
    throw new Error('Contenuto foto non valido');
  }
  if (bytes.length > APP.MAX_PHOTO_BYTES) throw new Error('La foto supera il limite di 5 MB');

  const detected = detectImageType(bytes);
  if (!detected) throw new Error('Sono ammesse solo immagini JPEG, PNG, GIF o WebP');

  return { bytes: bytes, mime: detected.mime, ext: detected.ext };
}

function detectImageType(bytes) {
  const b = bytes.map(value => (value + 256) % 256);
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  if (b.length >= 8 && b.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10') {
    return { mime: 'image/png', ext: 'png' };
  }
  if (b.length >= 6) {
    const sig = String.fromCharCode.apply(null, b.slice(0, 6));
    if (sig === 'GIF87a' || sig === 'GIF89a') return { mime: 'image/gif', ext: 'gif' };
  }
  if (b.length >= 12) {
    const riff = String.fromCharCode.apply(null, b.slice(0, 4));
    const webp = String.fromCharCode.apply(null, b.slice(8, 12));
    if (riff === 'RIFF' && webp === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  }
  return null;
}

function savePhoto(photo, reportId) {
  const folder = getOrCreateFolder(APP.PHOTO_FOLDER_NAME);
  const blob = Utilities.newBlob(photo.bytes, photo.mime, reportId + '.' + photo.ext);
  const saved = folder.createFile(blob);
  saved.setDescription('Allegato privato della pratica ' + reportId);
  // Nessuna condivisione pubblica: l'allegato rimane privato nel Drive dell'ente.
  return saved.getUrl();
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

/* =========================
 * Timeline, log e dati
 * ========================= */

function appendTimeline(reportId, title, description, status, visible, operator) {
  appendObjectRow(SHEETS.TIMELINE, {
    'ID': 'TL-' + Utilities.getUuid(),
    'Segnalazione ID': reportId,
    'Data': new Date(),
    'Titolo': safeSheetText(title),
    'Descrizione': safeSheetText(description),
    'Stato': safeSheetText(status),
    'Visibile cittadino': visible ? 'Sì' : 'No',
    'Operatore': safeSheetText(operator || '')
  });
}

function appendCommunication(reportId, type, title, message, visible, operator) {
  appendObjectRow(SHEETS.COMMUNICATIONS, {
    'ID': 'COM-' + Utilities.getUuid(),
    'Segnalazione ID': reportId,
    'Data': new Date(),
    'Tipo': safeSheetText(type),
    'Titolo': safeSheetText(title),
    'Messaggio': safeSheetText(message),
    'Visibile cittadino': visible ? 'Sì' : 'No',
    'Operatore': safeSheetText(operator || '')
  });
}

function appendLog(type, reportId, destinationId, destination, email, subject, message, operator, result) {
  appendObjectRow(SHEETS.LOG, {
    'Data': new Date(),
    'Tipo': type,
    'Segnalazione ID': reportId,
    'Destinatario ID': destinationId,
    'Destinatario': safeSheetText(destination),
    'Email': email,
    'Oggetto': safeSheetText(subject),
    'Messaggio': safeSheetText(message),
    'Operatore': safeSheetText(operator || ''),
    'Esito': result
  });
}

function requireReport(reportId) {
  const id = cleanText(reportId, 100, false);
  if (!id) throw new Error('ID pratica mancante');
  const report = findRow(SHEETS.REPORTS, row => String(row.ID || '') === id);
  if (!report) throw new Error('Segnalazione non trovata');
  return report;
}

function generateReportId() {
  return 'IX-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd') + '-' +
    Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase();
}

function generateTrackingToken() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
}

/* =========================
 * Schema e manutenzione
 * ========================= */

/**
 * Restituisce sempre il foglio configurato.
 *
 * Alla prima esecuzione manuale, se il progetto è collegato a un foglio,
 * ne salva automaticamente l'ID nelle Proprietà script. Le esecuzioni
 * della Web App usano poi SpreadsheetApp.openById(), evitando di dipendere
 * da un foglio "attivo" nel browser.
 */
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty('SPREADSHEET_ID') || '').trim();

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (err) {
      throw new Error('SPREADSHEET_ID non valido o foglio non accessibile');
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }

  throw new Error(
    'Google Sheet non configurato. Imposta la proprietà script SPREADSHEET_ID con l’ID del foglio.'
  );
}

/**
 * Eseguire manualmente una volta dall'editor.
 * Collega il backend al foglio corrente e verifica utenti e quartieri.
 */
function collegaEFaiDiagnostica() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error(
      'Questo progetto non è collegato a un foglio. Imposta manualmente SPREADSHEET_ID nelle Proprietà script.'
    );
  }

  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', active.getId());
  setupSheet();

  const users = readRows(SHEETS.USERS).filter(item => item.data.Email);
  const activeUsers = users.filter(item => isYes(item.data.Attivo));
  const hashedUsers = activeUsers.filter(item => String(item.data.Password || '').startsWith('v1$'));
  const districts = listQuartieri();

  const result = {
    versione: APP.SCHEMA_VERSION,
    foglio: active.getName(),
    spreadsheetId: active.getId(),
    utentiTotali: users.length,
    utentiAttivi: activeUsers.length,
    utentiConPasswordHash: hashedUsers.length,
    quartieriAttivi: districts.length
  };

  console.log(JSON.stringify(result, null, 2));

  if (!activeUsers.length) throw new Error('Nessun utente attivo nel foglio Utenti');
  if (!hashedUsers.length) throw new Error('Nessun utente attivo con password hash v1$');
  if (!districts.length) throw new Error('Nessun quartiere attivo nel foglio Quartieri');

  return 'Diagnostica completata: ' + JSON.stringify(result);
}

function ensureSetup() {
  const cache = CacheService.getScriptCache();
  if (cache.get('schema:' + APP.SCHEMA_VERSION)) return;
  setupSheet();
  cache.put('schema:' + APP.SCHEMA_VERSION, '1', 21600);
}

function setupSheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getSpreadsheet();
    Object.keys(HEADERS).forEach(name => ensureSheet(ss, name, HEADERS[name]));
    SpreadsheetApp.flush();
    sheetByName(SHEETS.REPORTS).getRange('H:I').setNumberFormat('@');
    seedReferenti();
    seedQuartieri();
    migratePlainPasswords();
  } finally {
    lock.releaseLock();
  }
}

function ensureSheet(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const lastCol = Math.max(sheet.getLastColumn(), 1);
    const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(value => String(value).trim());
    const finalHeaders = existing.slice();

    headers.forEach(header => {
      if (finalHeaders.indexOf(header) < 0) finalHeaders.push(header);
    });

    if (finalHeaders.length !== existing.length || finalHeaders.some((header, index) => header !== existing[index])) {
      sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
    }
  }
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
}

function seedReferenti() {
  const sheet = sheetByName(SHEETS.REFERENTI);
  if (sheet.getLastRow() === 1) {
    appendObjectRow(SHEETS.REFERENTI, {
      ID: 'REF-001', Nome: 'Nome Referente 1', Ruolo: 'Consigliere / Assessore',
      Email: 'email@example.com', Competenze: 'Ambiente, Rifiuti', Zona: 'Municipio IX', Attivo: 'Sì'
    });
    appendObjectRow(SHEETS.REFERENTI, {
      ID: 'REF-002', Nome: 'Nome Referente 2', Ruolo: 'Referente lavori pubblici',
      Email: 'email2@example.com', Competenze: 'Strade, Illuminazione', Zona: 'Municipio IX', Attivo: 'Sì'
    });
  }
}

function seedQuartieri() {
  const sheet = sheetByName(SHEETS.DISTRICTS);
  if (sheet.getLastRow() > 1) return;

  const existing = {};
  readRows(SHEETS.REPORTS).forEach(item => {
    const name = cleanOutput(item.data.Quartiere);
    if (name) existing[name] = true;
  });

  Object.keys(existing).sort().forEach((name, index) => {
    appendObjectRow(SHEETS.DISTRICTS, {
      Codice: 'Q-' + String(index + 1).padStart(3, '0'),
      Nome: safeSheetText(name), Tipo: 'Quartiere', Attivo: 'Sì'
    });
  });

  appendObjectRow(SHEETS.DISTRICTS, {
    Codice: 'ALTRO', Nome: 'Altro / zona non in elenco', Tipo: 'Altro', Attivo: 'Sì'
  });
}

/* =========================
 * Helpers Sheet
 * ========================= */

function sheetByName(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Foglio mancante: ' + name);
  return sheet;
}

function readRows(name) {
  const sheet = sheetByName(name);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(String);
  return values.slice(1).map((row, index) => {
    const data = {};
    headers.forEach((header, col) => { data[header] = row[col]; });
    return { rowNumber: index + 2, data: data };
  });
}

function findRow(name, predicate) {
  const rows = readRows(name);
  for (let i = 0; i < rows.length; i++) {
    if (predicate(rows[i].data)) return rows[i];
  }
  return null;
}

function appendObjectRow(name, object) {
  const sheet = sheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const row = headers.map(header => Object.prototype.hasOwnProperty.call(object, header) ? object[header] : '');
  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  return rowNumber;
}

function setRowFields(name, rowNumber, fields) {
  const sheet = sheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  Object.keys(fields).forEach(header => {
    const index = headers.indexOf(header);
    if (index < 0) throw new Error('Colonna mancante: ' + header);
    sheet.getRange(rowNumber, index + 1).setValue(fields[header]);
  });
}

function headerIndex(sheet, header) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
  const index = headers.indexOf(header);
  if (index < 0) throw new Error('Colonna mancante: ' + header);
  return index + 1;
}

/* =========================
 * Validazione e utility
 * ========================= */

function requiredText(value, label, maxLength) {
  const text = cleanText(value, maxLength, true);
  if (!text) throw new Error(label + ' obbligatorio');
  return text;
}

function cleanText(value, maxLength, allowNewLines) {
  let text = String(value == null ? '' : value).replace(/\r\n?/g, '\n');
  text = text.replace(allowNewLines ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, ' ');
  text = text.trim();
  if (text.length > maxLength) throw new Error('Campo troppo lungo (massimo ' + maxLength + ' caratteri)');
  return text;
}

function cleanOutput(value) {
  const text = String(value == null ? '' : value);
  return /^'[=+\-@]/.test(text) ? text.slice(1) : text;
}

function safeSheetText(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '')) && String(value).length <= 200;
}

function normalizePriority(value) {
  const p = String(value || 'Media').trim().toLowerCase();
  if (p === 'alta') return 'Alta';
  if (p === 'bassa') return 'Bassa';
  return 'Media';
}

function normalizeCoordinate(value) {
  if (value === null || value === undefined || value === '') return '';
  let coord = String(value).trim().replace(',', '.');
  const parts = coord.split('.');
  if (parts.length > 2) coord = parts[0] + '.' + parts.slice(1).join('');
  return coord;
}

function isValidMunicipioIXCoord(lat, lng) {
  const la = Number(normalizeCoordinate(lat));
  const lo = Number(normalizeCoordinate(lng));
  return Number.isFinite(la) && Number.isFinite(lo) &&
    la >= APP.COORDS.minLat && la <= APP.COORDS.maxLat &&
    lo >= APP.COORDS.minLng && lo <= APP.COORDS.maxLng;
}

function truthy(value) {
  return value === true || /^(true|1|sì|si|on|yes)$/i.test(String(value || '').trim());
}

function isYes(value) {
  return /^(sì|si|yes|true|1)$/i.test(String(value || '').trim());
}

function isNo(value) {
  return /^(no|false|0)$/i.test(String(value || '').trim());
}

function toDate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]') return value;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(value) {
  const date = toDate(value);
  if (!date) return value ? String(value) : '';
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function hashToken(value) {
  return bytesToHex(Utilities.computeHmacSha256Signature(String(value || ''), getSecretPepper()));
}

function shortHash(value) {
  return hashToken(value).slice(0, 24);
}

function bytesToHex(bytes) {
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function secureEquals(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function enforceRateLimit(key, limit, seconds) {
  const cache = CacheService.getScriptCache();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const current = Number(cache.get(key) || '0');
    if (current >= limit) throw new Error('Troppe richieste. Riprova più tardi.');
    cache.put(key, String(current + 1), Math.min(seconds, 21600));
  } finally {
    lock.releaseLock();
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonError(err) {
  return json({
    ok: false,
    error: err && err.message ? err.message : 'Errore interno',
    authRequired: Boolean(err && err.authRequired)
  });
}
