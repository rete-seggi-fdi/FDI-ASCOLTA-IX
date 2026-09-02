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
  SCHEMA_VERSION: '3.1.0-rc3',
  SESSION_HOURS: 8,
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  PHOTO_FOLDER_NAME: 'FDI Ascolta IX Foto',
  PUBLIC_BASE_URL: 'https://rete-seggi-fdi.github.io/FDI-ASCOLTA-IX/',
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
    'Data chiusura','Ufficio ID','Ufficio','Esito finale','Ultimo aggiornamento','Request ID'
  ],
  [SHEETS.REFERENTI]: [
    'ID','Nome','Ruolo','Partito/Lista','Email','Telefono','Competenze','Zona','Attivo'
  ],
  [SHEETS.LOG]: [
    'Data','Tipo','Segnalazione ID','Destinatario ID','Destinatario','Email',
    'Oggetto','Messaggio','Operatore','Esito'
  ],
  [SHEETS.USERS]: ['ID','Nome','Email','Password','Ruolo','Attivo','Cambio password richiesto','Versione autenticazione','Ultimo accesso'],
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
    'Token Hash','Utente ID','Email','Versione autenticazione','Creato','Scadenza','Revocato'
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

const CATEGORIES = Object.freeze([
  'Buche / strade', 'Illuminazione', 'Rifiuti', 'Verde pubblico',
  'Sicurezza', 'Degrado', 'Barriere architettoniche', 'Altro'
]);

const PRIORITIES = Object.freeze(['Bassa', 'Media', 'Alta']);


/* =========================
 * FUNZIONI MANUALI DI PRIMO ACCESSO
 * Selezionabili dal menu Esegui di Apps Script
 * ========================= */

/**
 * Eseguire manualmente dall'editor Apps Script per creare/aggiornare un utente.
 * Non è esposto come azione HTTP.
 */
function validatePasswordPolicy(password) {
  const value = String(password || '').trim();
  if (value.length < 12) throw new Error('Usare una password di almeno 12 caratteri');
  if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/[0-9]/.test(value) || !/[^A-Za-z0-9]/.test(value)) {
    throw new Error('Usare almeno una maiuscola, una minuscola, un numero e un simbolo');
  }
  return value;
}

function createOrUpdateUser(email, nome, password, ruolo) {
  setupSheet();
  SpreadsheetApp.flush();
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) throw new Error('Email non valida');
  const validatedPassword = validatePasswordPolicy(password);

  const salt = Utilities.getUuid().replace(/-/g, '');
  const hashed = hashPassword(validatedPassword, salt);
  const match = findRow(SHEETS.USERS, row => normalizeEmail(row.Email) === normalizedEmail);
  const values = {
    ID: match && cleanOutput(match.data.ID)
      ? cleanOutput(match.data.ID)
      : 'USR-' + Utilities.getUuid().slice(0, 8).toUpperCase(),
    Nome: safeSheetText(cleanText(nome, 120, false)),
    Email: normalizedEmail,
    Password: hashed,
    Ruolo: safeSheetText(normalizeUserRole(ruolo || 'Amministratore')),
    Attivo: 'Sì',
    'Cambio password richiesto': 'No',
    'Versione autenticazione': match ? currentAuthVersion(match.data) + 1 : 1
  };

  if (match) {
    setRowFields(SHEETS.USERS, match.rowNumber, values);
    revokeUserSessions(cleanOutput(match.data.ID));
  } else appendObjectRow(SHEETS.USERS, values);
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
    const action = e && e.parameter ? String(e.parameter.action || '').trim() : '';

    // Bridge same-backend per frontend statici (GitHub Pages).
    // Evita di affidare login e API JSON ai redirect/CORS di ContentService.
    if (action === 'bridge') return apiBridgeHtml();

    ensureSetup();

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

/**
 * Pagina bridge caricata in iframe dal frontend pubblico.
 * Le richieste vengono inoltrate a doPost() tramite google.script.run,
 * evitando CORS e mantenendo token/password fuori dagli URL.
 */
function apiBridgeHtml() {
  const allowedOrigin = String(APP.PUBLIC_BASE_URL || '').match(/^https:\/\/[^/]+/);
  if (!allowedOrigin) throw new Error('PUBLIC_BASE_URL non valido');

  const originJson = JSON.stringify(allowedOrigin[0]);
  const html = '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="referrer" content="no-referrer"></head><body>' +
    '<script>(function(){' +
    '"use strict";' +
    'const ALLOWED_ORIGIN=' + originJson + ';' +
    'function send(message){try{parent.postMessage(message,ALLOWED_ORIGIN);}catch(_){}}' +
    'window.addEventListener("message",function(event){' +
      'if(event.origin!==ALLOWED_ORIGIN)return;' +
      'const data=event.data||{};' +
      'if(data.type!=="FDI_API_REQUEST"||!data.id)return;' +
      'google.script.run' +
        '.withSuccessHandler(function(raw){send({type:"FDI_API_RESPONSE",id:data.id,raw:String(raw||"")});})' +
        '.withFailureHandler(function(err){send({type:"FDI_API_RESPONSE",id:data.id,error:(err&&err.message)?err.message:"Errore bridge Apps Script"});})' +
        '.apiBridge(JSON.stringify(data.payload||{}));' +
    '});' +
    'send({type:"FDI_BRIDGE_READY",version:' + JSON.stringify(APP.SCHEMA_VERSION) + '});' +
    '})();<\/script></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle(APP.NAME + ' API Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Entry point invocato esclusivamente dal bridge HtmlService.
 * Riusa lo stesso dispatcher di doPost per evitare due implementazioni API.
 */
function apiBridge(payloadText) {
  const output = doPost({
    postData: { contents: String(payloadText || '') }
  });
  return output.getContent();
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
    if (action === 'getPublicConfig') return json(getPublicConfig());
    if (action === 'geocodeAddress') return json(geocodeAddress(body));

    // Tutto il resto è privato.
    const user = requireAuth(body);

    if (action === 'logout') return json(logoutUser(body));
    if (action === 'changeOwnPassword') return json(changeOwnPassword(body, user));
    requireCompletedPasswordChange(user);

    if (action === 'listUsers') { requireAdmin(user); return json({ ok: true, users: listUsers() }); }
    if (action === 'saveUser') { requireAdmin(user); return json(saveUser(body, user)); }
    if (action === 'setUserActive') { requireAdmin(user); return json(setUserActive(body, user)); }
    if (action === 'resetUserPassword') { requireAdmin(user); return json(resetUserPassword(body, user)); }
    if (action === 'getConfigurationData') { requireAdmin(user); return json(getConfigurationData()); }
    if (action === 'saveConfigurationItem') { requireAdmin(user); return json(saveConfigurationItem(body, user)); }
    if (action === 'deactivateConfigurationItem') { requireAdmin(user); return json(deactivateConfigurationItem(body, user)); }
    if (action === 'listReports') return json({ ok: true, reports: listReports(user) });
    if (action === 'listReferenti') { requireAdmin(user); return json({ ok: true, referenti: listReferenti() }); }
    if (action === 'listUffici') return json({ ok: true, uffici: listUffici(isAdminUser(user)) });
    if (action === 'updateReportStatus') return json(updateReportStatus(body, user));
    if (action === 'updateReportLocation') return json(updateReportLocation(body, user));
    if (action === 'sendToReferente') return json(sendToReferente(body, user));
    if (action === 'sendToUfficio') return json(sendToUfficio(body, user));
    if (action === 'addReportNote') return json(addReportNote(body, user));
    if (action === 'startReportWork') return json(startReportWork(body, user));
    if (action === 'recordOfficeResponse') return json(recordOfficeResponse(body, user));
    if (action === 'closeReport') return json(closeReport(body, user));
    if (action === 'getTimeline') {
      requireReportAccess(body.reportId, user);
      return json({ ok: true, timeline: getTimeline(body.reportId, false) });
    }
    if (action === 'getCommunications') {
      requireReportAccess(body.reportId, user);
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
  normalizeUserRole(userMatch.data.Ruolo);

  setRowFields(SHEETS.USERS, userMatch.rowNumber, { 'Ultimo accesso': new Date() });
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
    'Versione autenticazione': currentAuthVersion(userRow),
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

  if (normalizeEmail(session.data.Email) !== normalizeEmail(user.data.Email)) {
    setRowFields(SHEETS.SESSIONS, session.rowNumber, { Revocato: 'Sì' });
    throw authError();
  }
  if (Number(session.data['Versione autenticazione'] || 0) !== currentAuthVersion(user.data)) {
    setRowFields(SHEETS.SESSIONS, session.rowNumber, { Revocato: 'Sì' });
    throw authError();
  }
  try {
    normalizeUserRole(user.data.Ruolo);
  } catch (_) {
    setRowFields(SHEETS.SESSIONS, session.rowNumber, { Revocato: 'Sì' });
    throw authError();
  }

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
    ruolo: normalizeUserRole(row.Ruolo),
    mustChangePassword: isYes(row['Cambio password richiesto'])
  };
}

function currentAuthVersion(row) {
  const value = Number(row && row['Versione autenticazione']);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

function requireCompletedPasswordChange(user) {
  if (user && user.mustChangePassword) {
    const err = new Error('Devi cambiare la password temporanea prima di usare il CRM');
    err.passwordChangeRequired = true;
    throw err;
  }
}


function normalizedRole(user) {
  return String(user && user.ruolo || '').trim().toLowerCase();
}

function isAdminUser(user) {
  return /amministratore|admin/.test(normalizedRole(user));
}

function isConsigliereUser(user) {
  return /consigliere/.test(normalizedRole(user));
}

function requireAdmin(user) {
  if (!isAdminUser(user)) throw new Error('Operazione riservata agli amministratori');
  return true;
}

function normalizePersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('it');
}

function canAccessReportRow(row, user) {
  if (isAdminUser(user)) return true;
  if (isConsigliereUser(user)) {
    const sameEmail = normalizeEmail(row['Email referente']) === normalizeEmail(user.email);
    const sameName = normalizePersonName(row['Referente assegnato']) === normalizePersonName(user.nome);
    return Boolean(sameEmail && sameName);
  }
  return false;
}

function requireReportAccess(reportId, user) {
  const id = cleanText(reportId, 80, false);
  const report = findRow(SHEETS.REPORTS, row => String(row.ID || '') === id);
  if (!report) throw new Error('Pratica non trovata');
  if (!canAccessReportRow(report.data, user)) throw new Error('Accesso negato alla pratica');
  return report;
}


/* =========================
 * Gestione utenti CRM
 * ========================= */

function listUsers() {
  return readRows(SHEETS.USERS)
    .map(item => item.data)
    .filter(row => cleanOutput(row.ID))
    .map(row => ({
      id: cleanOutput(row.ID),
      nome: cleanOutput(row.Nome),
      email: normalizeEmail(row.Email),
      ruolo: cleanOutput(row.Ruolo),
      attivo: isYes(row.Attivo),
      mustChangePassword: isYes(row['Cambio password richiesto'])
    }))
    .sort((a, b) => String(a.nome || a.email).localeCompare(String(b.nome || b.email), 'it'));
}

function normalizeUserRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (/amministratore|admin/.test(role)) return 'Amministratore';
  if (/consigliere/.test(role)) return 'Consigliere';
  throw new Error('Ruolo non valido. Usare Amministratore o Consigliere');
}

function saveUser(body, operator) {
  const item = body && body.user ? body.user : {};
  const id = cleanText(item.id, 80, false);
  const email = normalizeEmail(item.email);
  const nome = cleanText(item.nome, 120, true);
  const ruolo = normalizeUserRole(item.ruolo);
  const attivo = item.attivo === true || isYes(item.attivo);

  if (!isValidEmail(email)) throw new Error('Email non valida');

  const byId = id ? findRow(SHEETS.USERS, row => String(row.ID || '') === id) : null;
  const byEmail = findRow(SHEETS.USERS, row => normalizeEmail(row.Email) === email);
  const match = byId || byEmail;

  if (byId && byEmail && byId.rowNumber !== byEmail.rowNumber) {
    throw new Error('Email già utilizzata da un altro utente');
  }

  const isNew = !match;
  const emailChanged = Boolean(match && normalizeEmail(match.data.Email) !== email);
  if (match && !isYes(match.data.Attivo) && attivo && !isYes(match.data['Cambio password richiesto'])) {
    throw new Error('Prima di riattivare l’utente reimposta la password temporanea');
  }

  const fields = {
    ID: match && cleanOutput(match.data.ID)
      ? cleanOutput(match.data.ID)
      : nextUserId(),
    Nome: safeSheetText(nome),
    Email: email,
    Ruolo: safeSheetText(ruolo),
    Attivo: attivo ? 'Sì' : 'No',
    'Versione autenticazione': match ? currentAuthVersion(match.data) + 1 : 1
  };

  let temporaryPassword = '';
  const credentialsReset = isNew || emailChanged;
  if (credentialsReset) {
    temporaryPassword = generateTemporaryPassword();
    const salt = Utilities.getUuid().replace(/-/g, '');
    fields.Password = hashPassword(temporaryPassword, salt);
    fields['Cambio password richiesto'] = 'Sì';
  }

  if (match) {
    preventLastAdminRemoval(match.data, fields);
    setRowFields(SHEETS.USERS, match.rowNumber, fields);
    revokeUserSessions(cleanOutput(match.data.ID));
  } else {
    appendObjectRow(SHEETS.USERS, fields);
  }

  if (credentialsReset) {
    try {
      sendWelcomeEmail(nome, email, temporaryPassword, ruolo);
    } catch (mailError) {
      const affected = findRow(SHEETS.USERS, row => String(row.ID || '') === fields.ID);
      if (affected) {
        if (match) {
          setRowFields(SHEETS.USERS, affected.rowNumber, {
            Nome: match.data.Nome,
            Email: match.data.Email,
            Password: match.data.Password,
            Ruolo: match.data.Ruolo,
            Attivo: match.data.Attivo,
            'Cambio password richiesto': match.data['Cambio password richiesto'],
            'Versione autenticazione': currentAuthVersion(match.data)
          });
        } else {
          setRowFields(SHEETS.USERS, affected.rowNumber, { Attivo: 'No' });
        }
      }
      throw new Error((match ? 'Modifica annullata' : 'Utente creato ma disattivato') + ': email credenziali non inviata. ' + mailError.message);
    }
  }

  logAdminAction(isNew ? 'Utente creato e invito inviato' : (emailChanged ? 'Email utente aggiornata e credenziali rigenerate' : 'Utente aggiornato'), fields.ID, email, operator);
  return {
    ok: true,
    invited: isNew,
    credentialsSent: credentialsReset,
    emailChanged: emailChanged,
    user: {
      id: fields.ID,
      nome: nome,
      email: email,
      ruolo: ruolo,
      attivo: attivo,
      mustChangePassword: credentialsReset ? true : isYes(match.data['Cambio password richiesto'])
    }
  };
}

function nextUserId() {
  const max = readRows(SHEETS.USERS).reduce((current, item) => {
    const match = String(item.data.ID || '').match(/^U(\d+)$/i);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return 'U' + String(max + 1).padStart(3, '0');
}

function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*-_';
  const all = upper + lower + digits + symbols;
  const entropy = bytesToHex(Utilities.computeHmacSha256Signature(
    Utilities.getUuid() + '|' + Utilities.getUuid() + '|' + Date.now(),
    getSecretPepper()
  ));
  let cursor = 0;
  function pick(chars) {
    const byte = parseInt(entropy.slice(cursor, cursor + 2), 16);
    cursor = (cursor + 2) % entropy.length;
    return chars[byte % chars.length];
  }
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 18) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const byte = parseInt(entropy.slice(cursor, cursor + 2), 16);
    cursor = (cursor + 2) % entropy.length;
    const j = byte % (i + 1);
    const tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp;
  }
  return chars.join('');
}

function sendWelcomeEmail(nome, email, temporaryPassword, ruolo) {
  const loginUrl = getPublicBaseUrl() + 'login.html';
  const subject = 'Accesso al CRM FDI Ascolta IX';
  const text =
    'Ciao ' + nome + ',\n\n' +
    'è stato creato il tuo account per il CRM FDI Ascolta IX.\n\n' +
    'Ruolo: ' + ruolo + '\n' +
    'Email: ' + email + '\n' +
    'Password temporanea: ' + temporaryPassword + '\n\n' +
    'Accedi qui: ' + loginUrl + '\n\n' +
    'Al primo accesso dovrai scegliere una nuova password.\n' +
    'Non inoltrare questa email e non condividere la password temporanea.';

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#102342">' +
    '<h2 style="color:#082f6a">FDI Ascolta IX</h2>' +
    '<p>Ciao <strong>' + escapeHtmlEmail(nome) + '</strong>,</p>' +
    '<p>è stato creato il tuo account per il CRM.</p>' +
    '<div style="padding:18px;border:1px solid #dfe6ef;border-radius:12px;background:#f4f7fb">' +
    '<p><strong>Ruolo:</strong> ' + escapeHtmlEmail(ruolo) + '</p>' +
    '<p><strong>Email:</strong> ' + escapeHtmlEmail(email) + '</p>' +
    '<p><strong>Password temporanea:</strong> <code style="font-size:16px">' + escapeHtmlEmail(temporaryPassword) + '</code></p>' +
    '</div>' +
    '<p style="margin:24px 0"><a href="' + loginUrl + '" style="background:#082f6a;color:#fff;padding:12px 18px;text-decoration:none;border-radius:9px;font-weight:bold">Accedi al CRM</a></p>' +
    '<p>Al primo accesso dovrai scegliere una nuova password.</p>' +
    '<p style="font-size:12px;color:#67758c">Non inoltrare questa email e non condividere la password temporanea.</p>' +
    '</div>';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: text,
    htmlBody: html,
    name: APP.NAME
  });
}

function escapeHtmlEmail(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function setUserActive(body, operator) {
  const id = cleanText(body.userId, 80, true);
  const active = body.active === true || isYes(body.active);
  const match = findRow(SHEETS.USERS, row => String(row.ID || '') === id);
  if (!match) throw new Error('Utente non trovato');
  normalizeUserRole(match.data.Ruolo);
  if (active && !isYes(match.data.Attivo) && !isYes(match.data['Cambio password richiesto'])) {
    throw new Error('Prima di riattivare l’utente reimposta la password temporanea');
  }

  const fields = { Attivo: active ? 'Sì' : 'No', 'Versione autenticazione': currentAuthVersion(match.data) + 1 };
  preventLastAdminRemoval(match.data, fields);
  setRowFields(SHEETS.USERS, match.rowNumber, fields);
  revokeUserSessions(id);

  logAdminAction(active ? 'Utente attivato' : 'Utente disattivato', id, normalizeEmail(match.data.Email), operator);
  return { ok: true };
}

function resetUserPassword(body, operator) {
  const id = cleanText(body.userId, 80, true);
  const match = findRow(SHEETS.USERS, row => String(row.ID || '') === id);
  if (!match) throw new Error('Utente non trovato');
  normalizeUserRole(match.data.Ruolo);

  const password = generateTemporaryPassword();
  const salt = Utilities.getUuid().replace(/-/g, '');
  const oldPassword = match.data.Password;
  const oldChangeRequired = match.data['Cambio password richiesto'];
  const oldAuthVersion = currentAuthVersion(match.data);
  setRowFields(SHEETS.USERS, match.rowNumber, {
    Password: hashPassword(password, salt),
    'Cambio password richiesto': 'Sì',
    'Versione autenticazione': oldAuthVersion + 1
  });

  try {
    sendWelcomeEmail(
      cleanOutput(match.data.Nome),
      normalizeEmail(match.data.Email),
      password,
      normalizeUserRole(match.data.Ruolo)
    );
  } catch (mailError) {
    setRowFields(SHEETS.USERS, match.rowNumber, {
      Password: oldPassword,
      'Cambio password richiesto': oldChangeRequired,
      'Versione autenticazione': oldAuthVersion
    });
    throw new Error('Reset annullato: email con la password temporanea non inviata. ' + mailError.message);
  }

  revokeUserSessions(id);
  logAdminAction('Nuova password temporanea inviata', id, normalizeEmail(match.data.Email), operator);
  return { ok: true, sent: true };
}

function changeOwnPassword(body, user) {
  const currentPassword = String(body.currentPassword || '').trim();
  const newPassword = String(body.newPassword || '').trim();

  validatePasswordPolicy(newPassword);
  if (currentPassword === newPassword) throw new Error('La nuova password deve essere diversa');

  const match = findRow(SHEETS.USERS, row => String(row.ID || '') === String(user.id || ''));
  if (!match || !verifyPassword(currentPassword, String(match.data.Password || ''))) {
    throw new Error('Password temporanea non corretta');
  }

  const salt = Utilities.getUuid().replace(/-/g, '');
  setRowFields(SHEETS.USERS, match.rowNumber, {
    Password: hashPassword(newPassword, salt),
    'Cambio password richiesto': 'No',
    'Versione autenticazione': currentAuthVersion(match.data) + 1
  });
  revokeUserSessions(user.id);
  logAdminAction('Password personale modificata', user.id, user.email, user);
  return { ok: true, reloginRequired: true };
}

function preventLastAdminRemoval(existing, fields) {
  const wasAdmin = /amministratore|admin/i.test(String(existing.Ruolo || ''));
  const willBeAdmin = Object.prototype.hasOwnProperty.call(fields, 'Ruolo')
    ? /amministratore|admin/i.test(String(fields.Ruolo || ''))
    : wasAdmin;
  const willBeActive = Object.prototype.hasOwnProperty.call(fields, 'Attivo')
    ? isYes(fields.Attivo)
    : isYes(existing.Attivo);

  if (wasAdmin && (!willBeAdmin || !willBeActive)) {
    const otherAdmins = readRows(SHEETS.USERS).filter(item =>
      String(item.data.ID || '') !== String(existing.ID || '') &&
      isYes(item.data.Attivo) &&
      /amministratore|admin/i.test(String(item.data.Ruolo || ''))
    );
    if (!otherAdmins.length) {
      throw new Error('Non è possibile rimuovere o disattivare l’ultimo amministratore');
    }
  }
}

function revokeUserSessions(userId) {
  readRows(SHEETS.SESSIONS).forEach(item => {
    if (String(item.data['Utente ID'] || '') === String(userId || '') && !isYes(item.data.Revocato)) {
      setRowFields(SHEETS.SESSIONS, item.rowNumber, { Revocato: 'Sì' });
    }
  });
}

function logAdminAction(tipo, userId, email, operator) {
  try {
    appendObjectRow(SHEETS.LOG, {
      Data: new Date(),
      Tipo: tipo,
      'Segnalazione ID': userId,
      Destinatario: email,
      Email: email,
      Operatore: operator && operator.email ? operator.email : '',
      Esito: 'OK'
    });
  } catch (_) {}
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

function getRecaptchaSettings() {
  const props = PropertiesService.getScriptProperties();
  const required = !/^(false|0|no)$/i.test(String(props.getProperty('RECAPTCHA_REQUIRED') || 'true').trim());
  const siteKey = String(props.getProperty('RECAPTCHA_SITE_KEY') || '').trim();
  const secret = String(props.getProperty('RECAPTCHA_SECRET') || '').trim();
  const minScoreRaw = Number(props.getProperty('RECAPTCHA_MIN_SCORE') || '0.5');
  const minScore = Number.isFinite(minScoreRaw) ? Math.min(1, Math.max(0, minScoreRaw)) : 0.5;
  const allowedHostnames = String(props.getProperty('RECAPTCHA_ALLOWED_HOSTNAMES') || 'rete-seggi-fdi.github.io')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return { required: required, siteKey: siteKey, secret: secret, minScore: minScore, allowedHostnames: allowedHostnames };
}

function getPublicConfig() {
  const cfg = getRecaptchaSettings();
  return {
    ok: true,
    recaptcha: {
      required: cfg.required,
      configured: Boolean(cfg.siteKey && cfg.secret),
      siteKey: cfg.siteKey
    }
  };
}

function getPublicBaseUrl() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('PUBLIC_BASE_URL') || APP.PUBLIC_BASE_URL).trim();
  if (!/^https:\/\//i.test(configured)) throw new Error('PUBLIC_BASE_URL deve usare HTTPS');
  return configured.replace(/\/+$/, '') + '/';
}

function getPublicTrackingUrl() {
  const configured = String(PropertiesService.getScriptProperties().getProperty('PUBLIC_TRACKING_URL') || '').trim();
  if (configured) {
    if (!/^https:\/\//i.test(configured)) throw new Error('PUBLIC_TRACKING_URL deve usare HTTPS');
    return configured;
  }
  return getPublicBaseUrl() + 'tracking.html';
}

function verifyRecaptchaV3(token, expectedAction) {
  const cfg = getRecaptchaSettings();
  if (!cfg.required) return true;
  if (!cfg.siteKey || !cfg.secret) throw new Error('Protezione anti-spam non configurata');
  const responseToken = cleanText(token, 4096, false);
  if (!responseToken) throw new Error('Verifica anti-spam mancante');

  const response = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'post',
    payload: { secret: cfg.secret, response: responseToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Servizio anti-spam non disponibile');

  let result;
  try { result = JSON.parse(response.getContentText() || '{}'); }
  catch (_) { throw new Error('Risposta anti-spam non valida'); }

  if (!result.success) throw new Error('Verifica anti-spam non superata');
  if (String(result.action || '') !== String(expectedAction || '')) throw new Error('Azione anti-spam non valida');
  if (Number(result.score) < cfg.minScore) throw new Error('Verifica anti-spam non superata');
  const hostname = String(result.hostname || '').trim().toLowerCase();
  if (cfg.allowedHostnames.length && cfg.allowedHostnames.indexOf(hostname) < 0) {
    throw new Error('Origine anti-spam non autorizzata');
  }
  return true;
}

function diagnosticaRecaptcha() {
  const cfg = getRecaptchaSettings();
  return {
    required: cfg.required,
    configured: Boolean(cfg.siteKey && cfg.secret),
    siteKeyPresent: Boolean(cfg.siteKey),
    secretPresent: Boolean(cfg.secret),
    minScore: cfg.minScore,
    allowedHostnames: cfg.allowedHostnames
  };
}

function setupRecaptcha() {
  const result = diagnosticaRecaptcha();
  if (result.required && !result.configured) {
    throw new Error('Impostare RECAPTCHA_SITE_KEY e RECAPTCHA_SECRET nelle Proprietà script');
  }
  if (result.required && !result.allowedHostnames.length) {
    throw new Error('Impostare almeno un hostname in RECAPTCHA_ALLOWED_HOSTNAMES');
  }
  return 'reCAPTCHA configurato: ' + JSON.stringify(result);
}

function geocodeAddress(body) {
  const clientId = cleanText(body.clientId || 'anonimo', 120, false);
  const address = requiredText(body.indirizzo, 'Indirizzo', 300);
  const district = cleanText(body.quartiere, 120, false);
  enforceRateLimit('geocode:global', 120, 600);
  enforceRateLimit('geocode:client:' + shortHash(clientId), 20, 3600);

  const query = [address, district, 'Roma'].filter(Boolean).join(', ');
  const response = Maps.newGeocoder()
    .setRegion('it')
    .setLanguage('it')
    .setBounds(APP.COORDS.minLat, APP.COORDS.minLng, APP.COORDS.maxLat, APP.COORDS.maxLng)
    .geocode(query);
  const results = Array.isArray(response && response.results) ? response.results : [];
  const clean = results.map(item => {
    const location = item && item.geometry && item.geometry.location ? item.geometry.location : {};
    return {
      indirizzo: cleanText(item && item.formatted_address || '', 500, false),
      latitudine: normalizeCoordinate(location.lat),
      longitudine: normalizeCoordinate(location.lng)
    };
  }).filter(item => item.indirizzo && isValidMunicipioIXCoord(item.latitudine, item.longitudine)).slice(0, 5);
  return { ok: true, risultati: clean };
}

function createReport(body) {
  enforceRateLimit('create:global', 60, 600);

  const email = normalizeEmail(body.email);
  const clientId = cleanText(body.clientId || 'anonimo', 120, false);
  enforceRateLimit('create:email:' + shortHash(email), 5, 3600);
  enforceRateLimit('create:client:' + shortHash(clientId), 10, 3600);

  if (String(body.website || '').trim()) throw new Error('Invio non valido');
  if (!truthy(body.consenso)) throw new Error('È necessario accettare il consenso dati');
  verifyRecaptchaV3(body.recaptchaToken, 'create_report');

  const report = {
    nome: requiredText(body.nome, 'Nome e cognome', 120),
    email: email,
    telefono: cleanText(body.telefono, 40, false),
    quartiere: normalizeDistrictName(body.quartiere),
    categoria: normalizeCategory(body.categoria),
    titolo: requiredText(body.titolo, 'Titolo', 180),
    descrizione: requiredText(body.descrizione, 'Descrizione', 5000),
    indirizzo: requiredText(body.indirizzo, 'Indirizzo', 300),
    priorita: normalizePriorityStrict(body.priorita),
    latitudine: normalizeCoordinate(body.latitudine),
    longitudine: normalizeCoordinate(body.longitudine)
  };

  if (!isValidEmail(report.email)) throw new Error('Indirizzo email non valido');
  if (!isValidMunicipioIXCoord(report.latitudine, report.longitudine)) {
    throw new Error('Coordinate non valide o fuori area Municipio IX');
  }

  const publicTrackingUrl = getPublicTrackingUrl();
  const photo = body.foto && body.foto.base64 ? validatePhoto(body.foto) : null;
  const requestId = normalizeRequestId(body.requestId);
  const id = generateReportId();
  const trackingToken = generateTrackingToken();
  const now = new Date();

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let rowNumber;
  let duplicateReport = null;
  try {
    if (requestId) {
      const existing = findRow(SHEETS.REPORTS, row => String(row['Request ID'] || '') === requestId);
      if (existing) {
        if (normalizeEmail(existing.data['Email cittadino']) !== report.email) {
          throw new Error('Identificativo richiesta già utilizzato');
        }
        duplicateReport = existing;
      }
    }
    if (!duplicateReport) rowNumber = appendObjectRow(SHEETS.REPORTS, {
      'ID': id,
      'Request ID': requestId,
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

  if (duplicateReport) {
    const duplicateId = cleanOutput(duplicateReport.data.ID);
    return {
      ok: true,
      id: duplicateId,
      duplicate: true,
      trackingToken: '',
      trackingUrl: '',
      emailSent: false,
      warning: 'Richiesta già ricevuta: è stata restituita la pratica esistente. Puoi seguirla con codice pratica ed email.'
    };
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
    trackingUrl: publicTrackingUrl + '#token=' + encodeURIComponent(trackingToken),
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

  const clientId = cleanText(body.clientId, 120, false);
  enforceRateLimit('tracking:global', 300, 600);
  if (clientId) enforceRateLimit('tracking:client:' + shortHash(clientId), 60, 600);
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

function listQuartieri(includeInactive) {
  return readRows(SHEETS.DISTRICTS)
    .map(item => item.data)
    .filter(row => row.Nome && (includeInactive || isYes(row.Attivo)))
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

function getConfigurationData() {
  return {
    ok: true,
    quartieri: listQuartieri(true),
    referenti: listReferenti(true),
    uffici: listUffici(true),
    categories: CATEGORIES.slice(),
    priorities: PRIORITIES.slice(),
    workflow: WORKFLOW.slice()
  };
}

function saveConfigurationItem(body, user) {
  const type = String(body.itemType || '').trim().toLowerCase();
  const item = body && body.item ? body.item : {};
  if (type === 'quartiere') {
    const code = requiredText(item.codice || item.id, 'Codice quartiere', 80);
    const values = {
      Codice: safeSheetText(code),
      Nome: safeSheetText(requiredText(item.nome, 'Nome quartiere', 120)),
      Tipo: safeSheetText(cleanText(item.tipo || 'Quartiere', 80, false)),
      Attivo: truthy(item.attivo) ? 'Sì' : 'No',
      Ordine: Math.max(0, Math.min(9999, Number(item.ordine) || 999))
    };
    upsertConfigurationRow(SHEETS.DISTRICTS, 'Codice', code, values);
  } else if (type === 'referente') {
    const id = requiredText(item.id, 'ID referente', 80);
    const email = normalizeEmail(item.email);
    if (!isValidEmail(email)) throw new Error('Email referente non valida');
    const values = {
      ID: safeSheetText(id),
      Nome: safeSheetText(requiredText(item.nome, 'Nome referente', 120)),
      Ruolo: safeSheetText(cleanText(item.ruolo, 120, false)),
      'Partito/Lista': safeSheetText(cleanText(item.partito, 120, false)),
      Email: email,
      Telefono: safeSheetText(cleanText(item.telefono, 40, false)),
      Competenze: safeSheetText(cleanText(item.competenze, 1000, true)),
      Zona: safeSheetText(cleanText(item.zona || 'Municipio IX', 120, false)),
      Attivo: truthy(item.attivo) ? 'Sì' : 'No'
    };
    upsertConfigurationRow(SHEETS.REFERENTI, 'ID', id, values);
  } else if (type === 'ufficio') {
    const id = requiredText(item.id, 'ID ufficio', 80);
    const email = normalizeEmail(item.email);
    if (email && !isValidEmail(email)) throw new Error('Email ufficio non valida');
    const values = {
      ID: safeSheetText(id),
      Ufficio: safeSheetText(requiredText(item.ufficio || item.nome, 'Nome ufficio', 160)),
      Settore: safeSheetText(cleanText(item.settore, 160, false)),
      Email: email,
      Telefono: safeSheetText(cleanText(item.telefono, 40, false)),
      Note: safeSheetText(cleanText(item.note, 2000, true)),
      Attivo: truthy(item.attivo) ? 'Sì' : 'No'
    };
    upsertConfigurationRow(SHEETS.OFFICES, 'ID', id, values);
  } else {
    throw new Error('Tipo configurazione non valido');
  }
  logAdminAction('Configurazione aggiornata: ' + type, '', '', user);
  return { ok: true };
}

function upsertConfigurationRow(sheetName, keyHeader, keyValue, values) {
  const match = findRow(sheetName, row => String(row[keyHeader] || '') === String(keyValue || ''));
  if (match) setRowFields(sheetName, match.rowNumber, values);
  else appendObjectRow(sheetName, values);
}

function deactivateConfigurationItem(body, user) {
  const type = String(body.itemType || '').trim().toLowerCase();
  const id = requiredText(body.id, 'Identificativo', 80);
  const map = {
    quartiere: [SHEETS.DISTRICTS, 'Codice'],
    referente: [SHEETS.REFERENTI, 'ID'],
    ufficio: [SHEETS.OFFICES, 'ID']
  };
  const target = map[type];
  if (!target) throw new Error('Tipo configurazione non valido');
  const match = findRow(target[0], row => String(row[target[1]] || '') === id);
  if (!match) throw new Error('Elemento non trovato');
  setRowFields(target[0], match.rowNumber, { Attivo: 'No' });
  logAdminAction('Configurazione disattivata: ' + type, id, '', user);
  return { ok: true };
}

/* =========================
 * API private
 * ========================= */

function listReports(user) {
  return readRows(SHEETS.REPORTS)
    .map(item => item.data)
    .filter(row => row.ID && canAccessReportRow(row, user))
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

function listReferenti(includeInactive) {
  return readRows(SHEETS.REFERENTI)
    .map(item => item.data)
    .filter(row => row.ID && (includeInactive || isYes(row.Attivo)))
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

function listUffici(includeInactive) {
  return readRows(SHEETS.OFFICES)
    .map(item => item.data)
    .filter(row => row.ID && (includeInactive || isYes(row.Attivo)))
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
  requireAdmin(user);
  requireReportAccess(body.reportId, user);
  const report = requireReport(body.reportId);
  const status = requiredText(body.stato, 'Stato', 160);
  const description = cleanText(body.descrizione, 2000, true) || ('Stato aggiornato a: ' + status);
  const visible = isYes(body.visibileCittadino);

  if (WORKFLOW.indexOf(status) < 0) throw new Error('Stato non valido');

  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, {
    'Stato': status,
    'Ultimo aggiornamento': now
  });
  appendTimeline(report.data.ID, status, description, status, visible, user.nome || user.email);
  return { ok: true, stato: status };
}

function updateReportLocation(body, user) {
  requireAdmin(user);
  const report = requireReportAccess(body.reportId, user);
  const lat = normalizeCoordinate(body.latitudine);
  const lng = normalizeCoordinate(body.longitudine);
  if (!isValidMunicipioIXCoord(lat, lng)) throw new Error('Coordinate non valide o fuori area Municipio IX');
  const address = cleanText(body.indirizzo, 300, false);
  const fields = { Latitudine: lat, Longitudine: lng, 'Ultimo aggiornamento': new Date() };
  if (address) fields.Indirizzo = safeSheetText(address);
  setRowFields(SHEETS.REPORTS, report.rowNumber, fields);
  appendTimeline(report.data.ID, 'Posizione aggiornata', 'Coordinate della pratica aggiornate.', cleanOutput(report.data.Stato), false, user.nome || user.email);
  return { ok: true, latitudine: lat, longitudine: lng };
}

function addReportNote(body, user) {
  const report = requireReportAccess(body.reportId, user);
  const note = requiredText(body.note, 'Nota', 3000);
  if (note.length < 3) throw new Error('La nota è troppo breve');
  const visible = isAdminUser(user) && truthy(body.visibileCittadino);
  appendTimeline(report.data.ID, 'Nota operativa', note, cleanOutput(report.data.Stato), visible, user.nome || user.email);
  return { ok: true };
}

function startReportWork(body, user) {
  const report = requireReportAccess(body.reportId, user);
  const note = requiredText(body.note, 'Nota di presa in carico', 3000);
  if (note.length < 10) throw new Error('La nota deve contenere almeno 10 caratteri');
  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, { Stato: WORKFLOW[6], 'Ultimo aggiornamento': now });
  appendTimeline(report.data.ID, WORKFLOW[6], 'La pratica è in lavorazione.', WORKFLOW[6], true, user.nome || user.email);
  appendCommunication(report.data.ID, 'Nota interna', 'Presa in carico operativa', note, false, user.nome || user.email);
  return { ok: true, stato: WORKFLOW[6] };
}

function recordOfficeResponse(body, user) {
  const report = requireReportAccess(body.reportId, user);
  const response = requiredText(body.response, 'Risposta ufficio', 5000);
  if (response.length < 10) throw new Error('La risposta deve contenere almeno 10 caratteri');
  const now = new Date();
  setRowFields(SHEETS.REPORTS, report.rowNumber, { Stato: WORKFLOW[5], 'Ultimo aggiornamento': now });
  appendTimeline(report.data.ID, WORKFLOW[5], 'È stato ricevuto un riscontro dall’ufficio competente.', WORKFLOW[5], true, user.nome || user.email);
  appendCommunication(report.data.ID, 'Risposta ufficio', 'Risposta ricevuta', response, false, user.nome || user.email);
  return { ok: true, stato: WORKFLOW[5] };
}

function sendToReferente(body, user) {
  requireAdmin(user);
  enforceRateLimit('mail:user:' + shortHash(user.id || user.email), 30, 3600);
  const report = requireReport(body.reportId);
  const refId = requiredText(body.referenteId, 'Referente', 80);
  const ref = findRow(SHEETS.REFERENTI, row =>
    String(row.ID || '') === refId && isYes(row.Attivo)
  );

  if (!ref) throw new Error('Referente non trovato');
  const email = normalizeEmail(ref.data.Email);
  if (!isValidEmail(email)) throw new Error('Email referente mancante o non valida');
  const linkedCounsellor = findRow(SHEETS.USERS, row =>
    isYes(row.Attivo) && /consigliere/i.test(String(row.Ruolo || '')) &&
    normalizeEmail(row.Email) === email &&
    normalizePersonName(row.Nome) === normalizePersonName(ref.data.Nome)
  );
  if (!linkedCounsellor) {
    throw new Error('Il referente deve corrispondere a un account Consigliere attivo con lo stesso nome e la stessa email');
  }

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
  requireReportAccess(body.reportId, user);
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
  requireReportAccess(body.reportId, user);
  const report = requireReport(body.reportId);
  const outcome = requiredText(body.esito || 'Risolta', 'Esito', 120);
  const notes = requiredText(body.noteFinali, 'Note finali', 3000);
  const archive = isAdminUser(user) && truthy(body.archivia);
  const currentStatus = cleanOutput(report.data.Stato);
  if (/archiviata/i.test(currentStatus)) throw new Error('La pratica è già archiviata');
  if (/risolta/i.test(currentStatus) && !archive) throw new Error('La pratica è già risolta');
  if (truthy(body.inviaEmail)) {
    enforceRateLimit('closemail:user:' + shortHash(user.id || user.email), 20, 3600);
    enforceRateLimit('closemail:report:' + shortHash(report.data.ID), 3, 21600);
  }
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
    .filter(row => !publicOnly || isYes(row['Visibile cittadino']))
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
    .filter(row => !publicOnly || isYes(row['Visibile cittadino']))
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
  const trackingUrl = getPublicTrackingUrl() + '#token=' + encodeURIComponent(report.trackingToken);
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

function normalizeRequestId(value) {
  const id = cleanText(value, 80, false);
  if (!id) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{15,79}$/.test(id)) throw new Error('Identificativo richiesta non valido');
  return id;
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
function auditReportAssignments() {
  setupSheet();
  const counsellors = readRows(SHEETS.USERS).map(item => item.data).filter(row =>
    isYes(row.Attivo) && /consigliere/i.test(String(row.Ruolo || ''))
  );
  return readRows(SHEETS.REPORTS).map(item => item.data).filter(row => {
    const assignedName = normalizePersonName(row['Referente assegnato']);
    const assignedEmail = normalizeEmail(row['Email referente']);
    if (!assignedName && !assignedEmail) return false;
    return !counsellors.some(user =>
      normalizePersonName(user.Nome) === assignedName && normalizeEmail(user.Email) === assignedEmail
    );
  }).map(row => ({
    id: cleanOutput(row.ID),
    referenteNome: cleanOutput(row['Referente assegnato']),
    referenteEmail: normalizeEmail(row['Email referente'])
  }));
}

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
  const recaptcha = diagnosticaRecaptcha();
  const publicBaseUrl = getPublicBaseUrl();
  const activeDemoReferenti = readRows(SHEETS.REFERENTI).filter(item => {
    const email = normalizeEmail(item.data.Email);
    const name = String(item.data.Nome || '').trim().toLowerCase();
    return isYes(item.data.Attivo) && (/@example\.(com|org|net|invalid)$/.test(email) || /^nome referente\b/.test(name));
  });

  const result = {
    versione: APP.SCHEMA_VERSION,
    foglio: active.getName(),
    spreadsheetId: active.getId(),
    utentiTotali: users.length,
    utentiAttivi: activeUsers.length,
    utentiConPasswordHash: hashedUsers.length,
    quartieriAttivi: districts.length,
    referentiDemoAttivi: activeDemoReferenti.length,
    publicBaseUrl: publicBaseUrl,
    recaptcha: recaptcha
  };

  console.log(JSON.stringify(result, null, 2));

  if (!activeUsers.length) throw new Error('Nessun utente attivo nel foglio Utenti');
  if (!hashedUsers.length) throw new Error('Nessun utente attivo con password hash v1$');
  if (!districts.length) throw new Error('Nessun quartiere attivo nel foglio Quartieri');
  if (activeDemoReferenti.length) throw new Error('Sono presenti referenti dimostrativi attivi');
  if (recaptcha.required && !recaptcha.configured) throw new Error('reCAPTCHA è obbligatorio ma non configurato');
  if (recaptcha.required && !recaptcha.allowedHostnames.length) throw new Error('RECAPTCHA_ALLOWED_HOSTNAMES non configurato');

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
    const reportsSheet = sheetByName(SHEETS.REPORTS);
    reportsSheet.getRange(1, headerIndex(reportsSheet, 'Latitudine'), reportsSheet.getMaxRows(), 1).setNumberFormat('@');
    reportsSheet.getRange(1, headerIndex(reportsSheet, 'Longitudine'), reportsSheet.getMaxRows(), 1).setNumberFormat('@');
    migrateLegacyConfigurationActiveFlags();
    seedReferenti();
    deactivateDemoReferenti();
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

/**
 * Le versioni precedenti consideravano attivi quartieri/referenti/uffici con
 * colonna Attivo vuota. La RC1 era diventata fail-closed e rendeva invisibili
 * configurazioni legacy. Questa migrazione rende esplicito il vecchio stato
 * senza allentare i controlli sugli utenti autenticati.
 */
function migrateLegacyConfigurationActiveFlags() {
  [SHEETS.DISTRICTS, SHEETS.REFERENTI, SHEETS.OFFICES].forEach(name => {
    const sheet = sheetByName(name);
    const activeCol = headerIndex(sheet, 'Attivo');
    readRows(name).forEach(item => {
      const current = String(item.data.Attivo || '').trim();
      if (!current) sheet.getRange(item.rowNumber, activeCol).setValue('Sì');
    });
  });
}

/**
 * Eseguire manualmente dopo un aggiornamento importante per autorizzare gli
 * scope usati in produzione e verificare che i servizi Google siano accessibili.
 */
function autorizzaServiziProduzione() {
  const ss = getSpreadsheet();
  const sheetName = ss.getName();
  const maps = Maps.newGeocoder().setRegion('it').setLanguage('it').geocode('EUR, Roma');
  const rootName = DriveApp.getRootFolder().getName();
  const mailQuota = MailApp.getRemainingDailyQuota();
  return 'Servizi autorizzati. Foglio=' + sheetName +
    '; Maps=' + Boolean(maps && maps.results) +
    '; Drive=' + Boolean(rootName) +
    '; MailQuota=' + mailQuota;
}

/**
 * Diagnostica rapida pensata per il post-deploy. Non modifica credenziali.
 */
function diagnosticaPostDeploy() {
  setupSheet();
  const ss = getSpreadsheet();
  const props = PropertiesService.getScriptProperties();
  const activeUsers = readRows(SHEETS.USERS).filter(item => item.data.Email && isYes(item.data.Attivo));
  const hashedUsers = activeUsers.filter(item => String(item.data.Password || '').startsWith('v1$'));
  const districts = listQuartieri(false);
  const recaptcha = diagnosticaRecaptcha();
  const result = {
    versione: APP.SCHEMA_VERSION,
    spreadsheetIdConfigurato: Boolean(String(props.getProperty('SPREADSHEET_ID') || '').trim()),
    spreadsheetId: ss.getId(),
    foglio: ss.getName(),
    utentiAttivi: activeUsers.length,
    utentiConPasswordHash: hashedUsers.length,
    quartieriAttivi: districts.length,
    authPepperPresente: Boolean(String(props.getProperty('AUTH_PEPPER') || '').trim()),
    recaptcha: recaptcha
  };
  console.log(JSON.stringify(result, null, 2));
  return JSON.stringify(result);
}

function seedReferenti() {
  const sheet = sheetByName(SHEETS.REFERENTI);
  if (sheet.getLastRow() === 1) {
    appendObjectRow(SHEETS.REFERENTI, {
      ID: 'REF-001', Nome: 'Nome Referente 1', Ruolo: 'Consigliere / Assessore',
      Email: 'demo1@example.invalid', Competenze: 'Ambiente, Rifiuti', Zona: 'Municipio IX', Attivo: 'No'
    });
    appendObjectRow(SHEETS.REFERENTI, {
      ID: 'REF-002', Nome: 'Nome Referente 2', Ruolo: 'Referente lavori pubblici',
      Email: 'demo2@example.invalid', Competenze: 'Strade, Illuminazione', Zona: 'Municipio IX', Attivo: 'No'
    });
  }
}

function deactivateDemoReferenti() {
  readRows(SHEETS.REFERENTI).forEach(item => {
    const email = normalizeEmail(item.data.Email);
    const name = String(item.data.Nome || '').trim().toLowerCase();
    const isDemo = /@example\.(com|org|net|invalid)$/.test(email) || /^nome referente\b/.test(name);
    if (isDemo && !isNo(item.data.Attivo)) {
      setRowFields(SHEETS.REFERENTI, item.rowNumber, { Attivo: 'No' });
    }
  });
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

function normalizeCategory(value) {
  const raw = requiredText(value, 'Categoria', 100);
  const match = CATEGORIES.find(item => item.toLocaleLowerCase('it') === raw.toLocaleLowerCase('it'));
  if (!match) throw new Error('Categoria non valida');
  return match;
}

function normalizeDistrictName(value) {
  const raw = requiredText(value, 'Quartiere', 120);
  const match = listQuartieri(false).find(item =>
    String(item.nome || '').toLocaleLowerCase('it') === raw.toLocaleLowerCase('it')
  );
  if (!match) throw new Error('Quartiere non valido o non attivo');
  return match.nome;
}

function normalizePriority(value) {
  const p = String(value || 'Media').trim().toLowerCase();
  if (p === 'alta') return 'Alta';
  if (p === 'bassa') return 'Bassa';
  return 'Media';
}

function normalizePriorityStrict(value) {
  const raw = String(value == null || value === '' ? 'Media' : value).trim();
  const match = PRIORITIES.find(item => item.toLocaleLowerCase('it') === raw.toLocaleLowerCase('it'));
  if (!match) throw new Error('Priorità non valida');
  return match;
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
    authRequired: Boolean(err && err.authRequired),
    passwordChangeRequired: Boolean(err && err.passwordChangeRequired)
  });
}
