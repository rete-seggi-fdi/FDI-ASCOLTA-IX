# FDI Ascolta IX

Piattaforma statica GitHub Pages + Google Apps Script + Google Sheets per la raccolta e gestione delle segnalazioni territoriali del Municipio IX.

## Pubblicazione
Caricare tutto il contenuto di questa cartella nella root del repository `FDI-Municipio-IX/fdi-ascolta-ix` e abilitare GitHub Pages da `main / root`.

## Configurazione API
Il link Apps Script è in `assets/js/config.js`.

## Aggiornamento v4.1

Correzioni incluse:
- email automatica al cittadino con codice pratica;
- coordinate salvate correttamente come testo;
- dashboard: mappa non più sopra la scheda pratica;
- dashboard: filtro coordinate non valide;
- dashboard: scelta referente e invio email direttamente dalla scheda pratica.

Dopo aver caricato i file su GitHub, aggiorna anche Apps Script copiando `docs/Code.gs` dentro il tuo progetto Apps Script e crea una nuova distribuzione.
