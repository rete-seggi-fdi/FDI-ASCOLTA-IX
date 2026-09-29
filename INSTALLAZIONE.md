# Installazione e migrazione 2.1.0

## Prima del deploy

- Conservare una copia del foglio e del vecchio backend.
- Eliminare dal progetto Apps Script i moduli legacy (`auth.gs`, `report.gs`, `referenti.gs`, `email.gs`, `util.gs`, `comunicazioni.gs`, `uffici.gs`, `quartieri.gs`) quando contengono funzioni duplicate.
- Incollare `Code.gs` come sostituzione completa, non in coda al codice precedente.

## Ordine delle funzioni manuali

1. `setupSheet`
2. `setupInitialUser`
3. `collegaEFaiDiagnostica`
4. `privatizeExistingPhotos` una sola volta

## Dati da completare

- Foglio `Referenti`: inserire nominativi e email reali; poi impostare `Attivo` a `Sì`.
- Foglio `Uffici`: i modelli iniziali sono inattivi; inserire contatti verificati e attivarli.
- Foglio `Quartieri`: viene popolato automaticamente, ma può essere gestito dalla pagina Configurazione.

## Nuova versione Web App

Dopo ogni modifica a `Code.gs`, aggiornare la distribuzione con **Nuova versione**. Se viene creata una distribuzione diversa, aggiornare `CONFIG.API_URL`.

## Diagnostica

Aprire l'endpoint `health`. Se la versione non è `2026-07-complete-1`, il deploy sta ancora eseguendo codice precedente.


## Passaggio obbligatorio: reCAPTCHA

Prima del deploy definitivo configurare `RECAPTCHA_SITE_KEY`, `RECAPTCHA_SECRET`, `RECAPTCHA_REQUIRED=true`, quindi eseguire `setupRecaptcha`. Vedere `CONFIGURA-RECAPTCHA.md`.
