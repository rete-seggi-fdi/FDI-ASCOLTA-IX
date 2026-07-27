# FDI Ascolta IX CRM — versione 2.0.0

Applicazione statica + Google Apps Script per la raccolta e la gestione delle segnalazioni territoriali del Municipio IX.

## Struttura

- `Code.gs`: unica fonte backend da incollare nel progetto Apps Script.
- `assets/js/config.js`: unico punto in cui configurare URL della Web App, sessione, coordinate e chiave pubblica reCAPTCHA.
- `segnala.html`: modulo pubblico con quartieri, ricerca indirizzo, mappa, upload e anti-spam.
- `tracking.html`: tracking pubblico puntuale, senza scaricare l'archivio delle pratiche.
- pagine CRM: Dashboard, Pratiche, Sala Operativa, Analytics, Notifiche, Uffici e Configurazione.

I vecchi moduli JavaScript orfani e la copia `docs/Code.gs` sono stati rimossi.

## Installazione backend

1. Fare un backup del Google Sheet e del progetto Apps Script.
2. Eliminare o svuotare tutti i vecchi file `.gs` che duplicano funzioni del backend.
3. Mantenere un solo file `Code.gs` e sostituirne integralmente il contenuto.
4. Eseguire manualmente `setupSheet()`.
5. Configurare nelle Proprietà script:

```text
INITIAL_USER_EMAIL
INITIAL_USER_NAME
INITIAL_USER_PASSWORD
INITIAL_USER_ROLE = Amministratore
```

6. Eseguire `setupInitialUser()`.
7. Eseguire `collegaEFaiDiagnostica()` e controllare il log.
8. Eseguire una sola volta `privatizeExistingPhotos()`.

`setupSheet()` crea/ripara i fogli, inserisce i 34 quartieri ufficiali più “Altro”, disattiva i contatti dimostrativi `example.com` e crea modelli inattivi per gli uffici.

## Anti-spam reCAPTCHA v3

Il sistema mantiene honeypot, controllo duplicati e throttling anche senza reCAPTCHA. Per attivare anche reCAPTCHA v3:

1. Inserire la chiave pubblica in `assets/js/config.js`:

```javascript
RECAPTCHA_SITE_KEY: "CHIAVE_PUBBLICA"
```

2. Inserire nelle Proprietà script:

```text
RECAPTCHA_SECRET = chiave_segreta
RECAPTCHA_MIN_SCORE = 0.5
```

La chiave segreta non deve mai essere salvata nel repository.

## Distribuzione Apps Script

Creare o aggiornare una distribuzione **Applicazione web**:

```text
Esegui come: Me
Chi può accedere: Chiunque
```

L'accesso pubblico è necessario per segnalazione, statistiche e tracking. Tutte le azioni CRM richiedono un token di sessione verificato dal backend.

Verifiche rapide:

```text
URL_WEB_APP?action=health
URL_WEB_APP?action=listQuartieri
```

`health` deve restituire `spreadsheetConnected: true`; `listQuartieri` deve restituire un array non vuoto.

## Pubblicazione frontend

Pubblicare l'intera cartella sul ramo/cartella usati da GitHub Pages. L'URL Apps Script deve comparire soltanto in `assets/js/config.js`.

Dopo la pubblicazione aprire il sito in finestra anonima o forzare il refresh. Tutti gli asset usano il parametro cache `v=200`.

## Test di accettazione

1. Invio segnalazione con ricerca indirizzo.
2. Ricezione codice e link personale.
3. Tracking con token e con codice + email.
4. Login e logout.
5. Apertura pratica da mappa e ricerca globale.
6. Cambio stato, timeline, invio referente/ufficio e chiusura.
7. Analytics e notifiche.
8. Creazione/modifica/disattivazione di quartieri, referenti e uffici dalla Configurazione.

## Fonti dati iniziali

L'elenco iniziale dei 34 quartieri deriva dalla pagina istituzionale “I quartieri di Roma — Municipio IX” di Roma Capitale. I contatti di referenti e uffici non vengono inventati: devono essere inseriti e verificati dall'amministratore prima di impostare `Attivo = Sì`.
