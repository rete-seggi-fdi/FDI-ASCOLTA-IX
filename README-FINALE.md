# FDI ASCOLTA IX — Enterprise 4.0.0 FINAL CANDIDATE

Release consolidata dopo audit tecnico completo delle versioni sviluppate nel progetto.

## Correzioni principali

### Sicurezza e ruoli
- Tutte le API private richiedono sessione server-side.
- `Amministratore` può vedere e gestire tutte le pratiche.
- `Consigliere` vede una pratica solo se **email e nominativo canonico del Referente coincidono**.
- Il nominativo canonico viene verificato nel foglio `Referenti`, evitando casi come `Sordini` associato all'email di `De Juliis`.
- Timeline, comunicazioni, modifica posizione, invio ufficio, risposta e chiusura usano lo stesso controllo server-side.
- Il Consigliere non può aggirare il flusso chiamando direttamente `updateReportStatus`.
- Configurazione, utenti e assegnazione dei referenti restano riservati agli amministratori.

### Flusso Consigliere
Il workflow tecnico completo non viene mostrato al Consigliere. Il percorso operativo è:
1. `Segna in lavorazione` con nota obbligatoria.
2. Facoltativamente `Inoltra all'ufficio competente`.
3. Se inoltrata, `Risposta ricevuta` con testo obbligatorio.
4. `Segna come risolta`.

Le transizioni sono controllate anche dal backend, non soltanto dall'interfaccia.

### Chiusura pratica
- Per il Consigliere la chiusura produce `Risolta`, non `Archiviata`.
- L'archiviazione resta una scelta amministrativa.
- Le note finali vengono aggiunte allo storico `Note FDI` invece di cancellare le note precedenti.

### Utenti
- ID utente automatico.
- Ruoli: `Amministratore` / `Consigliere`.
- Password temporanea generata dal server e inviata via email.
- Cambio obbligatorio al primo accesso.
- Password definitiva: minimo 12 caratteri, maiuscola, minuscola, numero e simbolo.
- Revoca delle sessioni dopo reset/cambio password o disattivazione.
- Protezione dell'ultimo amministratore attivo.

### Configurazione
Ripristinate e verificate le API che mancavano nel backend:
- `getConfigurationData`
- `saveConfigurationItem`
- `deactivateConfigurationItem`

Gli ID di Referenti/Uffici possono essere generati automaticamente. Il ruolo del Referente è un menu a tendina.

### Portale cittadino
Ripristinate/verificate:
- `getPublicConfig`
- `geocodeAddress`
- `updateReportLocation`
- tracking pubblico senza download dell'elenco completo delle pratiche
- reCAPTCHA v3 con verifica server-side, score minimo e hostname autorizzati
- limite e validazione coordinate Municipio IX

## Installazione

### 1. Apps Script
Sostituire integralmente `Code.gs` con quello di questa release.

Poi:
1. Salvare.
2. Eseguire manualmente `setupSheet()` una volta.
3. Eseguire `auditDataIntegrity()` e controllare il risultato.
4. Creare una **nuova distribuzione Web App**.
5. Se l'URL `/exec` cambia, aggiornare `assets/js/config.js`.

### 2. Proprietà script reCAPTCHA
Se la protezione è attiva, configurare:
- `RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET`
- `RECAPTCHA_REQUIRED=true`
- `RECAPTCHA_MIN_SCORE=0.5`
- `RECAPTCHA_ALLOWED_HOSTNAMES=rete-seggi-fdi.github.io`

### 3. GitHub Pages
Caricare **tutto il contenuto della cartella della release**, non singoli hotfix provenienti da versioni precedenti.

## Controllo dati obbligatorio
Eseguire dall'editor Apps Script:

```javascript
auditDataIntegrity()
```

Se `inconsistentAssignments` contiene righe, riassegnare quelle pratiche dall'account Amministratore. Non correggere soltanto l'email o soltanto il nome nel foglio: nome ed email devono appartenere allo stesso Referente.

## Test di collaudo
1. Login Amministratore: vede tutte le pratiche e Configurazione.
2. Login De Juliis: non deve vedere pratiche di Sordini.
3. Login Sordini: vede esclusivamente le proprie pratiche.
4. Consigliere: `Segna in lavorazione` senza nota deve fallire.
5. Consigliere: invio ufficio prima della presa in lavorazione deve fallire.
6. Dopo invio ufficio, lo stato diventa `In attesa di risposta...`.
7. `Risposta ricevuta` salva testo, timeline e stato.
8. `Segna come risolta` produce `Risolta` per il Consigliere.
9. Nuovo utente: riceve password temporanea e deve cambiarla al primo accesso.
10. Tracking cittadino: token personale funziona senza `WORKFLOW is not defined`.
11. Segnalazione pubblica: geocodifica e reCAPTCHA funzionano.

## Nota importante
Questa release sostituisce gli hotfix precedenti. Non sovrapporre file di vecchi pacchetti dopo averla installata.
