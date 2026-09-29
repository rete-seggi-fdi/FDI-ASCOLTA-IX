# 4.2.0 FAST BOOT
Riduce i round-trip Apps Script: Dashboard 1 chiamata; Pratiche 1 chiamata; Configurazione 1 chiamata.
Il menu laterale non ricarica più l'intero archivio ogni 60 secondi.
Le normali richieste non eseguono più setup/migrazioni: eseguire `setupSheet()` manualmente una volta prima del deploy.
Per scalare oltre migliaia di pratiche resta consigliata la paginazione server-side.
