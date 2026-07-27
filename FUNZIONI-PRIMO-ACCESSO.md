# Funzioni manuali di primo accesso

Nel file `Code.gs` le funzioni manuali sono ora all'inizio del file:

- `createOrUpdateUser(email, nome, password, ruolo)`
- `setupInitialUser()`
- `privatizeExistingPhotos()`

Per creare il primo utente, impostare nelle Proprietà script:

- `INITIAL_USER_EMAIL`
- `INITIAL_USER_NAME`
- `INITIAL_USER_PASSWORD`
- `INITIAL_USER_ROLE` (facoltativo; predefinito `Amministratore`)

Poi salvare il progetto, ricaricare l'editor ed eseguire `setupInitialUser`.

Per rendere private le foto già caricate, eseguire una sola volta `privatizeExistingPhotos`.
