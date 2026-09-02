# Security review — versione 3.1.0 RC1

## Controlli implementati

- sessioni opache server-side con token memorizzati solo come hash e scadenza di otto ore;
- guardia client su tutte le pagine CRM e autorizzazione server su tutte le azioni private;
- password con salt individuale, HMAC-SHA-256 e pepper nelle Proprietà script;
- tracking puntuale tramite token casuale oppure codice pratica + email;
- nessuna chiamata pubblica a `listReports`;
- foto private, limite 5 MB e controllo della firma JPEG/PNG/GIF/WebP;
- input sanitizzati contro formula injection nel Google Sheet;
- rate limit per login, invio pratica, tracking, geocoding e invii email;
- honeypot, rate limiting multilivello e verifica server-side reCAPTCHA v3;
- `setupSheet` eseguibile solo manualmente;
- API URL e chiave di sessione centralizzati;
- coordinate coerenti tra frontend e backend;
- contatti dimostrativi disattivati automaticamente;
- mutazioni di configurazione riservate al ruolo Amministratore.

## Dati pubblici

Le API pubbliche restituiscono solo:

- statistiche aggregate;
- elenco dei quartieri attivi;
- singola pratica richiesta mediante token o codice + email.

Nome, email, telefono, note interne, URL foto e identità dell'operatore non vengono inclusi nel tracking pubblico.

## Limiti residui

- Apps Script non espone in modo affidabile l'IP originario del visitatore; il throttling usa quindi più chiavi e non sostituisce reCAPTCHA.
- Le autorizzazioni al Google Sheet e al Drive restano responsabilità dell'account proprietario.
- Prima della produzione occorre verificare destinatari email, quote MailApp e dominio autorizzato reCAPTCHA.
