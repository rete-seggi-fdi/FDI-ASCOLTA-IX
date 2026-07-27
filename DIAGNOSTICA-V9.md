# Diagnostica v9

1. Nel progetto Apps Script deve restare un solo file backend completo (`Codice.gs`/`Code.gs`).
2. Sostituire integralmente il backend con `Code_FDI_Ascolta_IX_v9.gs`.
3. Eseguire manualmente `collegaEFaiDiagnostica`.
4. Il log deve mostrare:
   - `utentiAttivi` almeno 1;
   - `utentiConPasswordHash` almeno 1;
   - `quartieriAttivi` almeno 1.
5. Aggiornare la distribuzione esistente scegliendo **Nuova versione**.
6. Aprire `URL_WEB_APP?action=health`: deve mostrare la versione `2026-07-hardened-2`.
7. Aprire `URL_WEB_APP?action=listQuartieri`: deve restituire `ok:true` e l’array `quartieri`.
8. Copiare lo stesso URL `/exec` in `assets/js/config.js`.
9. Pubblicare `config.js`, `api.js`, `login.html` e `segnala.html`.
10. Provare in finestra anonima.
