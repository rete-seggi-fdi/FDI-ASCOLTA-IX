# Installazione release 3.1.0 RC1

## 1. Backup

Prima dell’aggiornamento:

1. duplicare il Google Sheet;
2. creare una copia del progetto Apps Script;
3. scaricare il repository GitHub corrente.

## 2. Backend Apps Script

1. Aprire il Google Sheet del CRM.
2. Aprire **Estensioni → Apps Script**.
3. Sostituire integralmente `Code.gs` con quello della release.
4. Salvare.
5. Eseguire manualmente `collegaEFaiDiagnostica`.
6. Accettare le autorizzazioni richieste.
7. Eseguire manualmente `auditReportAssignments`.
8. Correggere dalla console amministratore le assegnazioni elencate.
9. Aprire **Distribuisci → Gestisci distribuzioni**.
10. Modificare la Web App e selezionare **Nuova versione**.
11. Impostare:
    - esegui come: proprietario dello script;
    - accesso: chiunque.
12. Distribuire e copiare l’URL `/exec`.

Non creare una seconda Web App se non è necessario: aggiornare la distribuzione
esistente mantiene normalmente lo stesso URL.

## 3. Configurazione frontend

Aprire `assets/js/config.js` e verificare:

```javascript
API_URL: "URL_DELLA_WEB_APP_APPS_SCRIPT"
```

Se l’URL della distribuzione non è cambiato, non modificare il file.

## 4. GitHub Pages

Caricare il contenuto della cartella della release nella root del repository,
non la cartella contenitore. La struttura deve includere:

```text
index.html
dashboard.html
pratiche.html
tracking.html
Code.gs
assets/
```

In **Settings → Pages** usare:

```text
Branch: main
Folder: / (root)
```

Attendere il workflow più recente con stato verde.

## 5. Migrazione automatica del foglio

Alla prima esecuzione il backend aggiunge senza eliminare i dati esistenti:

- `Cambio password richiesto`;
- `Versione autenticazione`;
- `Ultimo accesso`;
- `Risposta ricevuta`;
- versione autenticazione nelle sessioni.

Le password in chiaro eventualmente presenti vengono convertite in hash.

## 6. Primo amministratore

Se esiste già un amministratore, usare le credenziali correnti.

Solo per un’installazione nuova, configurare nelle Proprietà script:

```text
INITIAL_USER_EMAIL
INITIAL_USER_NAME
INITIAL_USER_PASSWORD
INITIAL_USER_ROLE = Amministratore
```

Eseguire `setupInitialUser`, poi rimuovere le proprietà non più necessarie.

## 7. Creazione consiglieri

Da **Configurazione → Utenti → Nuovo utente**:

1. inserire nome ed email;
2. scegliere `Consigliere`;
3. lasciare attivo;
4. salvare.

Il sistema invia una password temporanea e impone il cambio al primo accesso.
Nome ed email devono coincidere con il referente usato per l’assegnazione.

## 8. Collaudo minimo

1. Login amministratore: deve vedere tutte le pratiche.
2. Creare due consiglieri distinti.
3. Assegnare una pratica a ciascuno.
4. Login consigliere A: deve vedere solo la pratica A.
5. Tentare di aprire l’ID B tramite URL: deve risultare non accessibile.
6. Consigliere A: nota, lavorazione, invio ufficio, risposta, risolta.
7. Tracking cittadino: verificare timeline ed esito pubblico.
8. Disattivare A: la sessione attiva deve essere revocata.
