# Verifica finale — FDI Ascolta IX CRM 2.0.0

Data verifica: 27 luglio 2026

## Risultato

Tutti i controlli statici previsti sono superati.

| Controllo | Esito |
|---|---|
| Sintassi JavaScript e Apps Script, 17 blocchi/file | PASS |
| Riferimenti locali HTML, CSS, JS e immagini | PASS |
| URL Apps Script presente solo in `assets/js/config.js` | PASS |
| Parametri cache frontend uniformi a `v=200` | PASS |
| Nessun file JavaScript orfano | PASS |
| Guardia di autenticazione in tutte le pagine CRM | PASS |
| Nessuna chiamata pubblica a `listReports` | PASS |
| `setupSheet` non esposto tramite HTTP | PASS |
| Nessuna funzione backend duplicata | PASS |
| `APP`, `SHEETS`, `HEADERS` e `WORKFLOW` dichiarati una sola volta | PASS |
| Tutte le azioni del client API implementate nel backend | PASS |
| Modulo pubblico di segnalazione completo | PASS |
| Tracking puntuale e senza dati anagrafici | PASS |
| Sessioni server-side e token memorizzati come hash | PASS |
| Password con salt, HMAC-SHA-256 e pepper | PASS |
| Foto private, limite 5 MB e controllo firma file | PASS |
| Rate limiting, honeypot, blocco duplicati e reCAPTCHA opzionale | PASS |
| Limiti geografici centralizzati | PASS |

## Correzioni principali incluse

- ripristino completo di `segnala.html` come pagina pubblica;
- quartieri caricati dal backend e popolamento iniziale del foglio;
- workflow completo delle pratiche;
- geocodifica dell'indirizzo e correzione della posizione delle pratiche;
- tracking pubblico dedicato alla singola pratica;
- sessioni verificate dal server e protezione di tutte le API CRM;
- password non più memorizzate in chiaro;
- pagina Analytics migrata al client API autenticato;
- pagina Configurazione resa persistente e riservata agli amministratori;
- gestione reale di quartieri, referenti e uffici;
- rimozione dei moduli JavaScript morti e della seconda copia del backend;
- centralizzazione di URL API, chiave sessione, limiti coordinate e versione asset;
- disattivazione automatica dei contatti dimostrativi;
- modelli uffici inattivi, da completare con contatti verificati;
- riparazione automatica delle intestazioni e delle colonne duplicate dei fogli.

## Limiti della verifica

La verifica è stata eseguita sul repository e non sul tuo ambiente Google reale. Non sono stati eseguiti direttamente:

- il deploy della Web App;
- letture e scritture sul tuo Google Sheet;
- upload sul tuo Google Drive;
- invii tramite MailApp;
- geocodifica con la quota del tuo account;
- verifica reCAPTCHA con chiavi e dominio di produzione.

Dopo l'installazione è quindi necessario eseguire il test di accettazione riportato nel `README.md`.
