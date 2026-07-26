# FDI Ascolta IX — versione hardening

Piattaforma statica GitHub Pages + Google Apps Script + Google Sheets per la raccolta e la gestione delle segnalazioni territoriali del Municipio IX.

## Modifiche principali

- API privata protetta da sessioni verificate nel backend.
- Tracking pubblico puntuale: non scarica più tutte le segnalazioni.
- Home pubblica alimentata da sole statistiche aggregate.
- Password migrate automaticamente dal formato in chiaro a un hash con salt e segreto server-side.
- Implementate le azioni mancanti: `listQuartieri`, `listUffici`, `updateReportStatus`, `sendToUfficio`, `closeReport`, `getTimeline`, `getCommunications`.
- `setupSheet` non è più richiamabile via HTTP.
- URL Apps Script presente esclusivamente in `assets/js/config.js`.
- Unica sessione frontend in `sessionStorage`, con chiave definita in `CONFIG.SESSION_KEY`.
- Upload limitato a 5 MB, con controllo della firma reale del file; JPEG, PNG, GIF e WebP soltanto.
- Le nuove foto restano private su Drive.
- Rate limiting su login, creazione segnalazioni, tracking e invii email.
- Validazione server-side dei campi, delle lunghezze, dell’email, del consenso e delle coordinate.
- Protezione contro formule iniettate nei fogli Google.
- Eliminati i file JavaScript non utilizzati.

## Pubblicazione

1. Copiare `docs/Code.gs` nel progetto Google Apps Script collegato al foglio.
2. Dall’editor Apps Script eseguire manualmente `setupSheet()` e autorizzare gli accessi richiesti.
3. Creare almeno un utente eseguendo dall’editor, con dati reali:

```javascript
createOrUpdateUser(
  'operatore@dominio.it',
  'Nome Operatore',
  'una-password-lunga-e-unica',
  'Amministratore'
);
```

4. Per revocare la condivisione pubblica delle foto già presenti, eseguire una volta:

```javascript
privatizeExistingPhotos();
```

5. Creare una nuova distribuzione Web App. L’app deve essere accessibile pubblicamente perché segnalazione e tracking sono servizi pubblici; le operazioni CRM restano protette dal token verificato nel backend.
6. Inserire il nuovo URL di distribuzione esclusivamente in `assets/js/config.js`.
7. Pubblicare i file statici su GitHub Pages.

Dopo ogni modifica a `Code.gs` è necessario aggiornare o ricreare la distribuzione Apps Script; modificare il sorgente senza distribuire una nuova versione non aggiorna l’API pubblica.

## Fogli creati o aggiornati

- `Segnalazioni`
- `Referenti`
- `Log_Invii`
- `Utenti`
- `Uffici`
- `Quartieri`
- `Timeline`
- `Comunicazioni`
- `Sessioni`

Le colonne mancanti vengono aggiunte senza spostare quelle esistenti. Le password già presenti in chiaro vengono convertite automaticamente al primo `setupSheet()`.

## Tracking

Le nuove segnalazioni ricevono un link personale con token casuale. Il token viene memorizzato nel foglio soltanto come hash. Per le vecchie pratiche prive di token, il cittadino può usare il codice `IX-...` insieme all’email indicata nella segnalazione.

Le foto non sono più pubbliche con “chiunque abbia il link”. Nel tracking viene mostrata soltanto l’indicazione che una foto è disponibile agli operatori autorizzati.

## Configurazione quartieri e uffici

`setupSheet()` recupera i quartieri già presenti nelle segnalazioni e aggiunge sempre “Altro / zona non in elenco”, così il modulo non resta bloccato. Completare poi il foglio `Quartieri` con l’elenco ufficiale.

Compilare il foglio `Uffici` con almeno:

- ID
- Ufficio
- Settore
- Email
- Telefono
- Note
- Attivo (`Sì` / `No`)

Solo gli uffici e i referenti marcati `Sì` possono ricevere invii dal CRM.

## Nota di sicurezza

La soluzione elimina l’autenticazione puramente client-side e le esposizioni presenti nel progetto originale. Per ambienti con requisiti elevati rimane consigliata, come evoluzione, l’integrazione con un identity provider esterno e ruoli granulari per operatore.
