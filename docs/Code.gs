/**
 * FDI Ascolta IX
 * Backend Google Apps Script + Google Sheet
 * v4.1: coordinate salvate come testo, email al cittadino, invio referente, liste API.
 */

const SHEETS = {
  REPORTS: 'Segnalazioni',
  REFERENTI: 'Referenti',
  LOG: 'Log_Invii',
  USERS: 'Utenti'
};

const PHOTO_FOLDER_NAME = 'FDI Ascolta IX Foto';
const PUBLIC_TRACKING_URL = 'https://rete-seggi-fdi.github.io/FDI-ASCOLTA-IX/tracking.html';

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';

    if (action === 'setupSheet') {
      setupSheet();
      return json({ ok: true, message: 'Setup completato' });
    }

    if (action === 'listReports') {
      return json({ ok: true, reports: listReports() });
    }

    if (action === 'listReferenti') {
      return json({ ok: true, referenti: listReferenti() });
    }

    return json({ ok: true, message: 'FDI Ascolta IX API attiva' });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json({ ok: false, error: 'Nessun dato ricevuto' });
    }

    const body = JSON.parse(e.postData.contents || '{}');

    if (body.action === 'login') return json(loginUser(body));
    if (body.action === 'createReport') return json(createReport(body));
    if (body.action === 'sendToReferente') return json(sendToReferente(body));

    return json({ ok: false, error: 'Azione non valida' });
  } catch (err) {
    return json({ ok: false, error: err.message });
  }
}

function loginUser(body) {
  setupSheet();

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.USERS);
  const values = sheet.getDataRange().getValues();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '').trim();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const userEmail = String(row[2] || '').trim().toLowerCase();
    const userPassword = String(row[3] || '').trim();
    const attivo = String(row[5] || '').trim().toLowerCase();

    if (userEmail === email && userPassword === password && attivo === 'sì') {
      return {
        ok: true,
        user: {
          id: row[0],
          nome: row[1],
          email: userEmail,
          ruolo: row[4]
        }
      };
    }
  }

  return { ok: false, error: 'Email o password non validi' };
}

function createReport(body) {
  setupSheet();

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.REPORTS);
  sheet.getRange('H:I').setNumberFormat('@');

  const id =
    'IX-' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') +
    '-' +
    Math.floor(Math.random() * 1000);

  let fotoUrl = '';
  if (body.foto && body.foto.base64) {
    fotoUrl = savePhoto(body.foto, id);
  }

  const latitudine = normalizeCoordinate(body.latitudine);
  const longitudine = normalizeCoordinate(body.longitudine);

  if (!isValidMunicipioIXCoord(latitudine, longitudine)) {
    throw new Error('Coordinate non valide o fuori area Municipio IX');
  }

  sheet.appendRow([
    id,
    new Date(),
    body.quartiere || '',
    body.categoria || '',
    body.titolo || '',
    body.descrizione || '',
    body.indirizzo || '',
    latitudine,
    longitudine,
    fotoUrl,
    'Nuova',
    body.priorita || 'Media',
    '',
    '',
    '',
    body.nome || '',
    body.email || '',
    body.telefono || '',
    ''
  ]);

  sendCitizenConfirmation({
    id,
    nome: body.nome,
    email: body.email,
    quartiere: body.quartiere,
    categoria: body.categoria,
    titolo: body.titolo,
    descrizione: body.descrizione,
    indirizzo: body.indirizzo
  });

  return { ok: true, id: id };
}

function sendCitizenConfirmation(report) {
  const email = String(report.email || '').trim();
  if (!email) return;

  const subject = 'FDI Ascolta IX - Segnalazione ricevuta ' + report.id;
  const body =
    'Gentile ' + (report.nome || 'cittadino') + ',\n\n' +
    'abbiamo ricevuto la tua segnalazione tramite FDI Ascolta IX.\n\n' +
    'Codice pratica: ' + report.id + '\n' +
    'Quartiere: ' + (report.quartiere || '') + '\n' +
    'Categoria: ' + (report.categoria || '') + '\n' +
    'Titolo: ' + (report.titolo || '') + '\n' +
    'Indirizzo: ' + (report.indirizzo || '') + '\n\n' +
    'Puoi seguire lo stato della pratica da questa pagina:\n' +
    PUBLIC_TRACKING_URL + '\n\n' +
    'Dovrai inserire il codice pratica indicato sopra.\n\n' +
    'Cordiali saluti,\n' +
    'FDI Ascolta IX';

  MailApp.sendEmail({
    to: email,
    subject: subject,
    body: body,
    name: 'FDI Ascolta IX'
  });
}

function listReports() {
  setupSheet();

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.REPORTS);
  const values = sheet.getDataRange().getValues();

  return values.slice(1)
    .filter(r => r[0])
    .map(r => ({
      id: r[0],
      data: formatDate(r[1]),
      quartiere: r[2],
      categoria: r[3],
      titolo: r[4],
      descrizione: r[5],
      indirizzo: r[6],
      latitudine: normalizeCoordinate(r[7]),
      longitudine: normalizeCoordinate(r[8]),
      fotoUrl: r[9],
      stato: r[10],
      priorita: r[11],
      referenteNome: r[12],
      referenteEmail: r[13],
      dataInvio: formatDate(r[14]),
      nome: r[15],
      email: r[16],
      telefono: r[17],
      noteFdI: r[18]
    }))
    .reverse();
}

function listReferenti() {
  setupSheet();

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.REFERENTI);
  const values = sheet.getDataRange().getValues();

  return values.slice(1)
    .filter(r => r[0])
    .map(r => ({
      id: r[0],
      nome: r[1],
      ruolo: r[2],
      partito: r[3],
      email: r[4],
      telefono: r[5],
      competenze: r[6],
      zona: r[7],
      attivo: r[8]
    }))
    .filter(r => String(r.attivo).toLowerCase() !== 'no');
}

function sendToReferente(body) {
  setupSheet();

  const reportsSheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.REPORTS);
  const logSheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.LOG);
  const reports = reportsSheet.getDataRange().getValues();
  const referenti = listReferenti();
  const ref = referenti.find(r => String(r.id) === String(body.referenteId));

  if (!ref) throw new Error('Referente non trovato');
  if (!ref.email) throw new Error('Email referente mancante');

  let rowIndex = -1;
  let reportRow = null;

  for (let i = 1; i < reports.length; i++) {
    if (String(reports[i][0]) === String(body.reportId)) {
      rowIndex = i + 1;
      reportRow = reports[i];
      break;
    }
  }

  if (rowIndex < 0) throw new Error('Segnalazione non trovata');

  const subject =
    'FDI Ascolta IX - Segnalazione ' +
    (reportRow[3] || 'territoriale') +
    ' - ' +
    (reportRow[2] || 'Municipio IX');

  const message = body.messaggio || buildDefaultMessage(reportRow, ref);

  MailApp.sendEmail({
    to: ref.email,
    subject: subject,
    body: message,
    name: 'FDI Ascolta IX'
  });

  reportsSheet.getRange(rowIndex, 11).setValue('Inviata al referente');
  reportsSheet.getRange(rowIndex, 13).setValue(ref.nome);
  reportsSheet.getRange(rowIndex, 14).setValue(ref.email);
  reportsSheet.getRange(rowIndex, 15).setValue(new Date());

  logSheet.appendRow([
    new Date(),
    body.reportId,
    ref.id,
    ref.nome,
    ref.email,
    subject,
    message
  ]);

  return { ok: true };
}

function buildDefaultMessage(reportRow, ref) {
  return (
    'Gentile ' + ref.nome + ',\n\n' +
    'il Gruppo Consiliare Fratelli d’Italia del Municipio IX segnala la seguente criticità ricevuta attraverso la piattaforma FDI Ascolta IX.\n\n' +
    'ID segnalazione: ' + reportRow[0] + '\n' +
    'Quartiere: ' + reportRow[2] + '\n' +
    'Categoria: ' + reportRow[3] + '\n' +
    'Titolo: ' + reportRow[4] + '\n' +
    'Descrizione: ' + reportRow[5] + '\n' +
    'Indirizzo: ' + reportRow[6] + '\n' +
    'Priorità: ' + reportRow[11] + '\n\n' +
    'Si chiede cortesemente un riscontro e, se possibile, l’attivazione degli uffici competenti.\n\n' +
    'Cordiali saluti,\n' +
    'FDI Ascolta IX'
  );
}

function savePhoto(file, id) {
  const folder = getOrCreateFolder(PHOTO_FOLDER_NAME);
  const bytes = Utilities.base64Decode(file.base64);
  const safeName = id + '-' + String(file.name || 'foto.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = Utilities.newBlob(bytes, file.type || 'image/jpeg', safeName);
  const saved = folder.createFile(blob);
  saved.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return saved.getUrl();
}

function getOrCreateFolder(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function setupSheet() {
  const ss = SpreadsheetApp.getActive();

  createSheetIfMissing(ss, SHEETS.REPORTS, [
    'ID','Data','Quartiere','Categoria','Titolo','Descrizione','Indirizzo','Latitudine','Longitudine','Foto URL','Stato','Priorità','Referente assegnato','Email referente','Data invio','Nome cittadino','Email cittadino','Telefono cittadino','Note FDI'
  ]);

  createSheetIfMissing(ss, SHEETS.REFERENTI, [
    'ID','Nome','Ruolo','Partito/Lista','Email','Telefono','Competenze','Zona','Attivo'
  ]);

  createSheetIfMissing(ss, SHEETS.LOG, [
    'Data','Segnalazione ID','Referente ID','Referente','Email','Oggetto','Messaggio'
  ]);

  createSheetIfMissing(ss, SHEETS.USERS, [
    'ID','Nome','Email','Password','Ruolo','Attivo'
  ]);

  ss.getSheetByName(SHEETS.REPORTS).getRange('H:I').setNumberFormat('@');
  seedReferenti(ss);
}

function seedReferenti(ss) {
  const refSheet = ss.getSheetByName(SHEETS.REFERENTI);

  if (refSheet.getLastRow() === 1) {
    refSheet.appendRow(['REF-001','Nome Referente 1','Consigliere / Assessore','','email@example.com','','Ambiente, Rifiuti','Municipio IX','Sì']);
    refSheet.appendRow(['REF-002','Nome Referente 2','Referente lavori pubblici','','email2@example.com','','Strade, Illuminazione','Municipio IX','Sì']);
  }
}

function createSheetIfMissing(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  sheet.setFrozenRows(1);
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
  return Number.isFinite(la) && Number.isFinite(lo) && la >= 41.65 && la <= 42.05 && lo >= 12.25 && lo <= 12.75;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function formatDate(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
  }
  return String(v);
}
