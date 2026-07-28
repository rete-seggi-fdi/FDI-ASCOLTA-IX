# FDI Ascolta IX CRM — Release 3.0.0

Piattaforma per la raccolta, l’assegnazione e la gestione delle segnalazioni
territoriali del Municipio IX, compatibile con:

- Google Apps Script;
- Google Sheets;
- GitHub Pages.

## Regola di sicurezza principale

Un utente con ruolo `Consigliere` riceve dal backend esclusivamente le pratiche
nelle quali coincidono **sia**:

- `Referente assegnato` con il nome del suo account;
- `Email referente` con l’email del suo account.

La stessa regola viene verificata dal server prima di mostrare timeline e
comunicazioni e prima di ogni modifica, nota, invio all’ufficio, risposta o
chiusura. Nascondere elementi nel browser non viene considerato un controllo di
sicurezza.

Le assegnazioni con nome ed email incoerenti non vengono mostrate a nessun
consigliere. L’amministratore deve riassegnarle dalla pagina Pratiche.

## Installazione

Seguire [INSTALLAZIONE.md](INSTALLAZIONE.md). Non pubblicare il file `Code.gs`
su GitHub se il repository diventa privato o contiene personalizzazioni
riservate; il file deve essere copiato nell’editor Apps Script.

## Controllo assegnazioni

Dall’editor Apps Script eseguire manualmente:

```javascript
auditReportAssignments
```

La funzione non modifica dati. Restituisce le righe con coppia
nome/email referente non valida, da riassegnare dalla console amministratore.

## Ruoli

### Amministratore

Vede tutte le pratiche e gestisce assegnazioni, utenti, referenti, uffici,
configurazione e coordinate.

### Consigliere

Vede solo le proprie pratiche. Può:

- segnare la pratica in lavorazione con nota;
- aggiungere note;
- inoltrare a un ufficio;
- registrare la risposta ricevuta;
- risolvere la pratica.

Non può riassegnare pratiche, amministrare utenti o aprire dati di altri
consiglieri.

## Password e sessioni

- password con almeno 12 caratteri, maiuscola, minuscola, numero e simbolo;
- password salvate come HMAC-SHA256 con salt e pepper;
- password temporanea inviata via email;
- cambio obbligatorio al primo accesso;
- revoca delle sessioni dopo cambio password, reset, disattivazione o modifica
  di ruolo/email;
- sessione server-side con scadenza di 8 ore.

## Documentazione

- [INSTALLAZIONE.md](INSTALLAZIONE.md)
- [CHANGELOG.md](CHANGELOG.md)
- [AUDIT.md](AUDIT.md)
- [CONFIGURA-RECAPTCHA.md](CONFIGURA-RECAPTCHA.md)
