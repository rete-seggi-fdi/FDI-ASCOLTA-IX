# Primo accesso Apps Script

## 1. Creare il primo utente

1. Aprire **Impostazioni progetto** (icona a forma di ingranaggio).
2. In **Proprietà script**, aggiungere:
   - `INITIAL_USER_EMAIL` — email di accesso;
   - `INITIAL_USER_NAME` — nome visualizzato;
   - `INITIAL_USER_PASSWORD` — almeno 12 caratteri;
   - `INITIAL_USER_ROLE` — facoltativo, ad esempio `Amministratore`.
3. Salvare il progetto.
4. Tornare all'editor, scegliere `setupInitialUser` dal menu delle funzioni e premere **Esegui**.
5. Autorizzare lo script. Dopo il successo, `INITIAL_USER_PASSWORD` viene eliminata automaticamente dalle proprietà.

Per aggiungere altri utenti si possono modificare le proprietà e rieseguire `setupInitialUser`, oppure richiamare tecnicamente `createOrUpdateUser(email, nome, password, ruolo)`.

## 2. Rendere private le foto storiche

1. Scegliere `privatizeExistingPhotos` dal menu delle funzioni.
2. Premere **Esegui** e autorizzare l'accesso a Drive.
3. Eseguire questa migrazione una sola volta.

La funzione restituisce nel log il numero di file resi privati. Se una vecchia URL non contiene un ID Drive valido o il file non è accessibile all'account proprietario dello script, quel file viene ignorato.
