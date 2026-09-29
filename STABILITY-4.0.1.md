# Enterprise 4.0.1 — Stability

Correzioni principali:
- rimosso il blocco reCAPTCHA esterno dalla parte pubblica; resta protezione server-side con honeypot e rate limit;
- caricamento quartieri via GET pubblico con cache locale di fallback;
- `ensureSetup()` non esegue più la manutenzione completa a ogni cold start/cache expiry;
- Spreadsheet memorizzato per la durata della singola esecuzione Apps Script, riducendo aperture ripetute;
- corretto un doppio controllo accidentale in `ensureSheet`;
- versione frontend 4.0.1.

## Installazione
1. Sostituire integralmente Code.gs in Apps Script.
2. Salvare ed eseguire manualmente `setupSheet()` una sola volta.
3. Creare una nuova distribuzione Web App.
4. Se cambia URL /exec, aggiornare `assets/js/config.js`.
5. Caricare su GitHub l’intero contenuto della release.

Non è più necessario configurare RECAPTCHA_SITE_KEY o RECAPTCHA_SECRET per il modulo pubblico.
