# Verifica dell’analisi di sicurezza

## Esito generale

L’analisi iniziale era sostanzialmente corretta. I problemi critici relativi a funzionamento, privacy e assenza di autorizzazione erano presenti nel codice. Alcune formulazioni richiedevano però precisione e sono emersi ulteriori problemi.

## Verifica punto per punto

### 1. Modulo `segnala.html` bloccato — confermato

`quartiere` era obbligatorio e veniva popolato tramite `listQuartieri`, azione assente nel backend. Poiché le azioni GET sconosciute restituivano comunque `{ok:true}`, la pagina mostrava normalmente “Nessun quartiere configurato”, non necessariamente “Errore caricamento quartieri”. In entrambi i casi rimaneva soltanto un’opzione con valore vuoto e il form non poteva superare la validazione HTML.

### 2. Gestione pratiche incompleta — confermato

Erano assenti:

- `updateReportStatus`
- `sendToUfficio`
- `closeReport`
- `getTimeline`
- `listUffici`
- anche `getCommunications`, usato dal tracking

Le azioni POST sconosciute fallivano con “Azione non valida”. Le azioni GET sconosciute, invece, restituivano falsamente `ok:true` e producevano liste o timeline vuote, mascherando il problema.

### 3. Dati personali pubblici — confermato e più grave

`listReports` restituiva pubblicamente non solo nome, email, telefono e indirizzo, ma anche:

- coordinate esatte;
- URL della foto;
- email del referente;
- note interne `noteFdI`;
- intero contenuto della segnalazione.

Il problema non riguardava soltanto `tracking.html`: anche la home pubblica chiamava `listReports` per calcolare quattro contatori e quindi scaricava nel browser l’intero archivio.

### 4. Nessun controllo di accesso server-side — confermato

Il login restituiva soltanto un oggetto utente, senza sessione o token. Tutte le API sensibili erano pubbliche e le pagine CRM non eseguivano un controllo affidabile.

Precisazione: `sendToReferente` non consentiva di scegliere un indirizzo email arbitrario; il destinatario doveva essere un referente attivo presente nel foglio. Consentiva però a chiunque di inviare testo arbitrario, con il nome dell’app, a qualunque referente configurato. Il rischio di spam, phishing reputazionale e consumo della quota email era reale.

Anche `createReport` poteva essere sfruttata per inviare email di conferma a indirizzi scelti dall’attaccante.

### 5. Password in chiaro — confermato

Il confronto `row[3] === password` dimostrava che le password erano conservate e lette in chiaro.

### 6. URL API duplicato — confermato

La stessa URL compariva in 11 file totali, incluso `config.js`; quindi erano presenti 10 copie fuori dal punto dichiarato dalla documentazione. `pratiche.html` ignorava completamente `CONFIG.API_URL`.

### 7. Chiavi di sessione incoerenti — confermato

Erano presenti `fdi_user`, `fdi_ascolta_user`, `fdi_ascolta_ix_user`, `fdiUser`, `user` e `CONFIG.SESSION_KEY`. Quest’ultima non era definita, perciò il vecchio helper avrebbe usato la chiave testuale `undefined`.

### 8. File JavaScript morti — parzialmente corretto

Erano realmente non referenziati:

- `auth.js`
- `dashboard.js`
- `segnala.js`
- `tracking.js`

`api.js`, invece, era caricato da `index.html` ed era usato da `home.js`; non era quindi completamente orfano.

### 9. Coordinate incoerenti — confermato

Il modulo realmente eseguito accettava l’area 40–43 / 10–15, mentre backend e vecchio `segnala.js` usavano 41.65–42.05 / 12.25–12.75.

Inoltre la foto veniva salvata prima di validare le coordinate: in caso di coordinate rifiutate, l’API restituiva errore ma il file era già stato creato e reso pubblico, diventando un allegato orfano.

## Altri problemi trovati

### Critici o importanti

- `listReferenti` era pubblico e rivelava email e telefoni dei referenti.
- L’ID pratica, composto da timestamp al secondo e numero da 0 a 999, era prevedibile e poco adatto come credenziale di tracking.
- Mancavano controlli server-side sui campi obbligatori, sulle lunghezze, sull’email e sul consenso; la validazione HTML era aggirabile.
- I dati inseriti dall’utente venivano scritti direttamente nel foglio, permettendo formule malevole nei campi che iniziavano con `=`, `+`, `-` o `@`.
- Se l’email di conferma falliva dopo `appendRow`, la pratica restava salvata ma il cittadino riceveva un errore e poteva inviarla nuovamente, creando duplicati.
- Non esisteva limite alla frequenza delle richieste né controllo globale della quota email.
- Il formato ID poteva generare collisioni sotto carico e non eseguiva un controllo di unicità.

### Qualità e manutenzione

- Le azioni GET inesistenti restituivano `ok:true`, rendendo i guasti silenziosi.
- La documentazione descriveva funzioni presenti nel vecchio `dashboard.js`, ma non nel vero script inline di `dashboard.html`.
- Più pagine implementavano client API diversi e leggermente incompatibili.
- Le librerie CDN sono versionate ma prive di Subresource Integrity; rappresentano un rischio residuo di supply chain.

## Correzioni applicate

1. Endpoint pubblici minimizzati: statistiche, quartieri, creazione e singola pratica.
2. Tutte le operazioni CRM richiedono una sessione verificata nel backend.
3. Token di tracking casuale, memorizzato come hash; compatibilità con vecchio ID + email.
4. Sessione frontend unica e temporanea in `sessionStorage`.
5. Password migrate automaticamente a hash con salt e segreto server-side.
6. Funzioni backend mancanti implementate.
7. Upload validato prima dell’uso, massimo 5 MB e nessuna condivisione pubblica per i nuovi file.
8. Rate limiting e controllo quota email.
9. Validazione server-side e protezione anti-formula.
10. URL API centralizzato.
11. Coordinate centralizzate in `CONFIG.COORD_BOUNDS` e replicate nel backend.
12. File JavaScript morti rimossi.
13. `setupSheet` disponibile soltanto dall’editor Apps Script.
