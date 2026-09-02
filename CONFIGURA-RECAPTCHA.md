# Attivazione reCAPTCHA v3 — versione 3.1.0 RC1

La protezione è ora **obbligatoria e fail-closed**: il modulo pubblico resta disabilitato finché entrambe le chiavi non risultano configurate.

## 1. Creare le chiavi

Creare una coppia reCAPTCHA v3 per il dominio pubblico del sito, per esempio:

- `rete-seggi-fdi.github.io`
- eventuale dominio personalizzato usato in produzione

Conservare separatamente:

- **Site key**: pubblica, usata dal browser;
- **Secret key**: riservata, usata solo da Apps Script.

## 2. Proprietà script

In Apps Script aprire **Impostazioni progetto → Proprietà script** e aggiungere:

| Proprietà | Valore |
|---|---|
| `RECAPTCHA_SITE_KEY` | site key v3 |
| `RECAPTCHA_SECRET` | secret key v3 |
| `RECAPTCHA_REQUIRED` | `true` |
| `RECAPTCHA_MIN_SCORE` | `0.5` |
| `RECAPTCHA_ALLOWED_HOSTNAMES` | `rete-seggi-fdi.github.io` |

Per un dominio personalizzato, separare più hostname con una virgola.

## 3. Verifica

Eseguire manualmente dall'editor Apps Script:

```text
setupRecaptcha
```

Poi eseguire:

```text
diagnosticaRecaptcha
```

Il risultato atteso è:

```json
{
  "required": true,
  "configured": true,
  "siteKeyPresent": true,
  "secretPresent": true,
  "minScore": 0.5,
  "allowedHostnames": ["rete-seggi-fdi.github.io"]
}
```

## 4. Deploy

Creare una **Nuova versione** della Web App Apps Script e ripubblicare tutti i file frontend 3.1.0 RC1.

La site key non è più inserita in `config.js`: il frontend la riceve dal backend tramite `getPublicConfig`. La secret non viene mai restituita al browser.

## 5. Test

Aprendo `segnala.html` deve apparire:

```text
Protezione anti-spam attiva.
```

Se le chiavi mancano o sono incoerenti, il pulsante di invio resta disabilitato. Dopo un invio valido, il backend verifica token, azione `create_report`, punteggio e hostname autorizzato.
