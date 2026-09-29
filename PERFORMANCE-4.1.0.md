# Performance 4.1.0

## Problema individuato
La lentezza non dipende dal numero attuale di pratiche. Ogni pagina generava più richieste contemporanee a Google Apps Script. In particolare `crm-shell.js` richiedeva l'intero elenco pratiche per badge, ricerca e notifiche mentre la pagina richiedeva nuovamente lo stesso elenco. Ogni chiamata autenticata rileggeva inoltre i fogli Sessioni e Utenti.

## Correzioni
- deduplicazione delle richieste `listReports` nel browser: più componenti della stessa pagina condividono la stessa Promise;
- cache browser 20 secondi per pratiche e 5 minuti per dati quasi statici;
- cache server dell'autenticazione per 5 minuti;
- cache server delle pratiche per utente per 20 secondi;
- cache server di referenti e uffici per 5 minuti;
- invalidazione della cache client dopo operazioni che modificano una pratica.

## Scalabilità
Questa release elimina il moltiplicatore di richieste che rendeva lento il CRM già con 5 pratiche. Per volumi superiori a circa 2.000-5.000 pratiche è comunque consigliato il passo successivo: paginazione server-side e indici dedicati, evitando di trasferire l'intero archivio al browser.

## Installazione
1. Sostituire integralmente `Code.gs` in Apps Script.
2. Eseguire una volta `setupSheet()`.
3. Creare una nuova distribuzione Web App.
4. Caricare almeno `assets/js/api.js` su GitHub Pages. È consigliato caricare l'intera release per mantenere le versioni allineate.
5. Se cambia l'URL `/exec`, aggiornare `assets/js/config.js`.

## Test prestazioni
Aprire DevTools > Network e ricaricare Dashboard. Durante il caricamento iniziale deve esserci una sola chiamata `listReports` effettiva dal browser, anche se più componenti la richiedono.
