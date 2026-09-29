# FDI Ascolta IX CRM 5.1 MONOLITHIC

## Perché questa release
La console privata non dipende più da CSS/API/Auth esterni.
`dashboard.html` contiene direttamente:
- stile della console;
- CONFIG;
- Auth;
- API;
- logica Dashboard / Pratiche / Uffici / Utenti.

Questo elimina il problema osservato con HTML nuovo + CSS/JS vecchi o non trovati da GitHub Pages.

## Deploy GitHub
Caricare TUTTI i file di questa cartella nella root del repository.
Per la console privata il file determinante è `dashboard.html`.

Dopo il deploy aprire:
`dashboard.html?v=510`

Le vecchie pagine private (`pratiche.html`, `uffici.html`, ecc.) reindirizzano alla console unica.

## Apps Script
`Code.gs` è incluso. Se il backend 5.0 è già distribuito correttamente non serve ridistribuirlo solo per la modifica grafica/monolitica.
Se invece lo sostituisci:
1. incolla integralmente `Code.gs`;
2. esegui `setupSheet()` manualmente una sola volta;
3. crea una nuova distribuzione Web App;
4. se cambia l'URL `/exec`, cerca `API_URL` dentro `dashboard.html` e nei file runtime pubblici e sostituiscilo.

## Test
1. login amministratore;
2. dashboard;
3. pratiche;
4. uffici;
5. utenti;
6. login consigliere;
7. verifica che visualizzi solo le proprie pratiche;
8. parte pubblica e tracking.
