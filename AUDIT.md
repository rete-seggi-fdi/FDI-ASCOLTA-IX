# Rapporto di audit

## Criticità corrette

### Critica — autorizzazione assente sulle pratiche

La versione ricevuta autenticava le chiamate private ma restituiva tutte le
pratiche a qualunque utente autenticato. Anche timeline, comunicazioni e azioni
non verificavano l’assegnazione.

Correzione: filtro e autorizzazione server-side centralizzati tramite
`requireReportAccess`.

### Critica — endpoint frontend assenti

Il frontend invocava gestione utenti, configurazione, cambio password, note,
risposta ufficio, geocodifica e aggiornamento posizione, ma il dispatcher
backend non li implementava.

Correzione: copertura completa delle azioni dichiarate in `assets/js/api.js`.

### Alta — assegnazioni incoerenti

Una riga poteva contenere il nome di un consigliere e l’email di un altro.

Correzione: il consigliere accede solo se entrambe coincidono con l’account.
La funzione `auditReportAssignments` individua i dati da riassegnare.

### Alta — sessioni non invalidate

Modifiche di ruolo, email, password o stato potevano lasciare valide sessioni
precedenti.

Correzione: versione autenticazione per utente e revoca delle sessioni.

### Alta — gestione utenti incompleta

Mancavano endpoint coerenti per inviti, reset, attivazione e primo accesso.

Correzione: flusso completo con password temporanea e cambio obbligatorio.

### Media — workflow consigliere troppo permissivo

Un consigliere poteva richiedere stati amministrativi.

Correzione: blocco server-side delle transizioni non operative e flusso
semplificato già presente nell’interfaccia.

### Media — codice duplicato/obsoleto

Erano presenti un secondo `Code.gs` e script JavaScript non utilizzati, uno dei
quali esponeva un vecchio tracking basato su `listReports`.

Correzione: rimossi duplicati e file non referenziati.

## Verifiche eseguite

- parsing sintattico di `Code.gs`;
- parsing di tutti i JavaScript esterni;
- parsing degli script inline di tutte le pagine HTML;
- confronto automatico tra azioni dell’API frontend e dispatcher backend;
- test con dati simulati:
  - amministratore vede tutte le pratiche;
  - consigliere vede solo la propria;
  - pratica di altro consigliere negata;
  - assegnazione nome/email incoerente negata;
  - password deboli rifiutate.

## Limiti del collaudo locale

Non è possibile simulare integralmente MailApp, DriveApp, Maps, autorizzazioni
Google e il deployment reale senza eseguire il progetto nell’account Google.
La checklist in `INSTALLAZIONE.md` copre il collaudo da eseguire dopo il deploy.
