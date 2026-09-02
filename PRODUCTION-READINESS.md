# Production readiness — 3.1.0-rc1

Stato: **release candidate pronta per il security test, non ancora approvata per la produzione**.

## Correzioni già applicate

- Autorizzazione sulle pratiche eseguita lato server per elenco, dettaglio, timeline, comunicazioni e mutazioni.
- Il ruolo `Consigliere` accede solo quando **nome e email** del referente assegnato coincidono con l'account.
- Le azioni amministrative (utenti, configurazione, assegnazione, coordinate, cambio stato generico) sono bloccate lato server.
- Il cambio della password temporanea è imposto dal backend, non solo dall'interfaccia.
- Reset/modifica/disattivazione utente invalidano le sessioni tramite revoca e versione di autenticazione.
- reCAPTCHA v3 è verificato lato backend (success/action/score/hostname) ed è fail-closed quando richiesto ma non configurato.
- Tracking: token nuovi nel fragment URL; rate limit globale, per codice e per client; nessuna lista pubblica delle pratiche.
- Timeline e comunicazioni pubbliche sono fail-closed: serve `Visibile cittadino = Sì`.
- Geocodifica eseguita lato server, limitata al perimetro geografico configurato.
- Formula injection mitigata prima della scrittura su Google Sheets.
- Foto: dimensione massima 5 MB e firma reale JPEG/PNG/GIF/WebP verificata; Drive resta privato.
- Frontend: niente JavaScript inline, niente event handler HTML inline, CSP, `no-referrer`, URL foto solo HTTPS.
- Leaflet 1.9.4 ha SRI; le altre dipendenze esterne sono almeno version-pinned.
- Backend duplicato e script JavaScript obsoleti rimossi.

## Blocchi / rischi da chiudere prima del go-live

### 1. Autenticazione custom — rischio alto residuo

Le password sono protette con salt + HMAC-SHA256 + pepper, ma HMAC-SHA256 è una funzione veloce e non una password KDF memory-hard. Per un servizio esposto in produzione è preferibile sostituire l'autenticazione custom con Google Workspace/OIDC o un identity provider che usi Argon2id/scrypt/bcrypt/PBKDF2 con parametri robusti.

Se si mantiene temporaneamente l'autenticazione custom, il security test deve includere brute force, credential stuffing, session fixation, revoca, token replay e verifica della protezione del pepper.

### 2. Allegati Drive — rischio funzionale/permessi

Le foto vengono salvate private e il frontend riceve un URL Drive. Un utente CRM autenticato con il sistema custom potrebbe non avere una sessione Google autorizzata a quel file. Va deciso un modello di accesso: account Workspace autorizzati, proxy autenticato, oppure storage dedicato con URL firmati a breve scadenza. Non rendere pubblica la cartella per aggirare il problema.

### 3. Header di sicurezza del server statico

La CSP presente nella release è applicata via `<meta>`. Prima della produzione, sul dominio finale, aggiungere anche header HTTP reali almeno per CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, una policy anti-framing (`frame-ancestors` nella CSP HTTP) e `Permissions-Policy`.

### 4. Supply chain frontend

Leaflet è protetto con SRI. Chart.js, MarkerCluster e Leaflet.heat sono version-pinned ma non hanno ancora SRI in questa release. Prima del go-live: vendor locale degli asset oppure SRI calcolata/verificata sulla build esatta.

### 5. Servizi Google non testabili localmente

Vanno provati sul deployment reale: autorizzazioni Apps Script, accesso Sheet/Drive, MailApp e quote, Maps/Geocoder, proprietà script, dominio reCAPTCHA, timeout e concorrenza LockService/CacheService.

### 6. Rate limiting

`CacheService` è adatto come barriera best-effort ma non come WAF. Il test deve verificare burst, distribuzione su più email/client id e possibilità di esaurire quote Apps Script/Mail/Maps. Valutare protezione edge se il traffico pubblico aumenta.

## Gate consigliato per la produzione

Non andare live finché non sono superati almeno:

1. test IDOR/BOLA su ogni endpoint privato;
2. escalation `Consigliere → Amministratore` fallita su tutte le azioni;
3. test XSS stored/reflected/DOM su tutti i campi e dati provenienti dal Sheet;
4. test CSRF/CORS e abuso delle API pubbliche;
5. brute force/login/session replay/revoca/reset password;
6. manipolazione tracking token e verifica assenza di enumerazione;
7. upload file ostili e verifica permessi Drive;
8. test reCAPTCHA bypass/action mismatch/hostname mismatch/replay;
9. verifica CSP e dipendenze in browser reale;
10. test di quota, timeout e concorrenza su Apps Script.
