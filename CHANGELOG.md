# Changelog

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
