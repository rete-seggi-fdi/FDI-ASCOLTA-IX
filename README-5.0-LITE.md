# FDI Ascolta IX — CRM 5.0 LITE

Questa release ripensa il CRM mantenendo la logica funzionale ma riducendo drasticamente pagine, chiamate e dati trasferiti.

## Struttura
- `dashboard.html`: unica console privata (SPA)
  - Dashboard
  - Pratiche / Le mie pratiche
  - Uffici (admin)
  - Utenti (admin)
- `segnala.html`: invio pubblico
- `tracking.html`: tracking pubblico
- le vecchie pagine private reindirizzano alla console unica.

## Prestazioni
- Dashboard: una sola richiesta e solo KPI + ultime 8 pratiche.
- Elenco: 25 pratiche per pagina, filtri lato server.
- Dettaglio/timeline: caricati solo al click.
- Uffici/referenti/quartieri: caricati una volta quando servono.
- Nessun polling automatico.
- Nessun `setupSheet()` durante le richieste normali.
- Eliminato il controllo N+1 dei referenti per ogni pratica del consigliere.

## Permessi
Il consigliere vede una pratica solo se email e referente canonico coincidono. Le azioni sono validate anche dal backend.

## Installazione
1. Sostituire integralmente `Code.gs` in Apps Script.
2. Eseguire manualmente `setupSheet()` una sola volta.
3. Creare una nuova distribuzione Web App.
4. Se l'URL `/exec` cambia, aggiornare `assets/js/config.js`.
5. Caricare su GitHub l'intero contenuto della cartella 5.0 LITE.
6. Non sovrapporre file delle release 4.x.

## Test rapido
- login amministratore;
- dashboard;
- apertura elenco pratiche e paginazione;
- apertura dettaglio;
- login consigliere e verifica che veda solo le proprie pratiche;
- presa in lavorazione con nota;
- invio ufficio;
- risposta ricevuta;
- risoluzione;
- invio segnalazione pubblica;
- tracking.
