# Changelog

## 3.1.0-rc3 — Bridge Apps Script e GPS robusto

- sostituite le chiamate `fetch` dirette GitHub Pages → Apps Script con un bridge HtmlService + `google.script.run`, eliminando la dipendenza da CORS/redirect per login e API;
- il bridge accetta messaggi solo dall'origine pubblica configurata e non inserisce password/token negli URL;
- CSP aggiornata per consentire esclusivamente il frame Apps Script necessario al bridge;
- geolocalizzazione con controllo esplicito del permesso e secondo tentativo a precisione ridotta in caso di timeout/posizione non disponibile;
- cache-busting frontend aggiornato e preflight esteso per verificare il bridge.

## 3.1.0-rc1 — Hardening pre-produzione

### Autorizzazione e sessioni

- completata la copertura di tutte le azioni realmente invocate dal frontend;
- cambio password temporanea imposto anche dal backend prima di qualsiasi azione privata;
- accesso Consigliere subordinato alla corrispondenza congiunta di nome ed email assegnati;
- sessioni invalidate dopo modifiche a password, ruolo, email o stato account;
- registrato `Ultimo accesso`;
- tracking pubblico mostra timeline/comunicazioni solo se esplicitamente marcate visibili.

### Protezioni pubbliche

- reCAPTCHA v3 verificato server-side con `success`, `action`, `score` e hostname;
- geocodifica effettuata lato Apps Script e limitata al perimetro configurato;
- rate limit aggiuntivo per tracking e geocodifica tramite client identifier pseudocasuale;
- token di tracking spostato nel fragment URL per i nuovi link.

### Frontend

- eliminati gli handler HTML inline e spostato il JavaScript pagina in file separati;
- aggiunta Content Security Policy in meta e politica `no-referrer`;
- aggiunta SRI ufficiale per Leaflet 1.9.4;
- validazione HTTPS per i link foto;
- rimossi JavaScript obsoleti e il duplicato `docs/Code.gs`;
- riallineate versioni e cache key alla release candidate.

### Correzioni operative

- archiviazione riservata agli amministratori; i consiglieri possono risolvere ma non archiviare;
- transizioni amministrative bloccate server-side;
- password forti validate anche nelle funzioni manuali di bootstrap;
- aggiunta funzione manuale `setupRecaptcha`.


## 3.0.0 — Audit organico

### Sicurezza e permessi

- applicato il filtro pratiche lato server;
- accesso consigliere consentito solo con corrispondenza esatta di nome ed
  email assegnati;
- applicata la stessa autorizzazione a timeline, comunicazioni e tutte le
  mutazioni;
- assegnazione e gestione referenti riservate agli amministratori;
- configurazione e utenti riservati agli amministratori;
- revoca sessioni dopo cambio credenziali, ruolo, email o stato account;
- protezione dell’ultimo amministratore attivo;
- sessioni legate alla versione di autenticazione dell’utente.

### Utenti e password

- aggiunta gestione utenti completa;
- ID utente generato automaticamente;
- ruoli limitati ad `Amministratore` e `Consigliere`;
- password temporanea inviata via email;
- cambio password obbligatorio;
- politica password forte applicata anche dal backend;
- registrazione dell’ultimo accesso.

### API e workflow

- riallineati tutti gli endpoint usati dal frontend;
- aggiunti note, presa in lavorazione, risposta ufficio e aggiornamento
  posizione;
- aggiunta risposta ricevuta al foglio Segnalazioni;
- aggiunte configurazione, geocodifica e configurazione pubblica;
- transizioni amministrative vietate al consigliere;
- aggiunto controllo manuale `auditReportAssignments`.

### Correzioni e pulizia

- eliminati JavaScript obsoleti non caricati dalle pagine;
- rimosso il duplicato `docs/Code.gs`;
- conservato il tracking pubblico senza esposizione dell’elenco pratiche;
- mantenuti i fix di contrasto della navigazione pubblica;
- aggiornati documentazione, installazione e verifiche.
