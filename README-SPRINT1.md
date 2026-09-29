# FDI Ascolta IX — CRM Enterprise 3.0 Sprint 1 RC1

## Correzioni incluse
- corretto `WORKFLOW is not defined` nel tracking cittadino;
- corretto il contrasto dei link pubblici su hover/focus;
- login con destinazione coerente al ruolo;
- sidebar differenziata per amministratore e consigliere;
- ogni consigliere riceve dal backend solo le pratiche assegnate alla propria email;
- accesso a timeline e comunicazioni limitato alle pratiche autorizzate;
- modifica stato, invio ufficio e chiusura limitati alle pratiche assegnate;
- assegnazione a un referente e lista referenti riservate agli amministratori.

## Ruoli riconosciuti
Nel foglio `Utenti`, colonna `Ruolo`:
- `Amministratore`
- `Consigliere`

Per un consigliere, l'email nel foglio `Utenti` deve essere identica alla colonna
`Email referente` delle pratiche e all'email del record corrispondente nel foglio `Referenti`.

## Installazione frontend
Sostituire l'intero contenuto del repository GitHub Pages con questo pacchetto,
oppure almeno:
- `tracking.html`
- `login.html`
- `assets/css/theme-fdi.css`
- `assets/js/auth.js`
- `assets/js/crm-shell.js`

## Installazione backend obbligatoria
1. Aprire il progetto Apps Script collegato al CRM.
2. Sostituire integralmente `Code.gs` con quello incluso.
3. Salvare.
4. Creare una nuova versione del deployment Web App.
5. Verificare che l'accesso resti impostato come richiesto dalla configurazione attuale.
6. Aggiornare `assets/js/config.js` solo se l'URL del deployment cambia.

## Creazione utenti
Dall'editor Apps Script eseguire manualmente:

```javascript
createOrUpdateUser(
  'consigliere@dominio.it',
  'Nome Consigliere',
  'PasswordMoltoSicura123!',
  'Consigliere'
);
```

Per l'amministratore usare il ruolo `Amministratore`.

## Test minimo
1. Login amministratore: deve vedere tutte le pagine e tutte le pratiche.
2. Login consigliere: deve vedere Dashboard personale, Le mie pratiche e Notifiche.
3. Il consigliere deve vedere solo le pratiche con `Email referente` uguale alla sua email.
4. Aprire il tracking con token personale: non deve più apparire `WORKFLOW is not defined`.
5. Verificare hover su “Invia segnalazione” e “Segui pratica”.
