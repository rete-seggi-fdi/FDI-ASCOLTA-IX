# AUDIT TECNICO — Enterprise 4.0.0

## Difetti rilevati e corretti

- **Critico — isolamento Consiglieri:** controllo precedente basato su dati assegnazione potenzialmente incoerenti. Ora email + nominativo canonico del foglio Referenti devono coincidere.
- **Critico — API frontend senza backend:** `getPublicConfig`, `geocodeAddress`, `updateReportLocation`, `getConfigurationData`, `saveConfigurationItem`, `deactivateConfigurationItem` erano richiamate dal frontend ma assenti nel backend consolidato. Ripristinate.
- **Critico — cambio stato aggirabile:** un Consigliere poteva tentare una chiamata diretta a `updateReportStatus`. Ora il backend la rifiuta e impone le azioni guidate.
- **Alto — workflow non imposto server-side:** aggiunti controlli sulle transizioni presa in lavorazione → ufficio → risposta → risolta.
- **Alto — chiusura predefinita archiviata:** l'interfaccia aveva `Archivia automaticamente` selezionato. Ora è amministrativo e non predefinito; il Consigliere chiude come `Risolta`.
- **Alto — perdita note:** la chiusura sovrascriveva `Note FDI`. Ora le note finali vengono accodate con data e autore.
- **Alto — reCAPTCHA incompleto:** il frontend richiedeva configurazione e token, ma il backend consolidato non esponeva/configurava la verifica. Aggiunta verifica server-side v3.
- **Medio — uffici inattivi:** `listUffici` includeva anche record disattivati. Ora vengono esclusi.
- **Medio — ID configurazione manuali:** Referenti e Uffici potevano richiedere ID manuale. Ora il backend li genera quando assenti.
- **Medio — ruolo Referente libero:** trasformato in selezione guidata nell'interfaccia di configurazione.
- **Medio — diagnostica dati:** aggiunta `auditDataIntegrity()` per individuare email duplicate nei Referenti e assegnazioni incoerenti.
- **Verifica sintattica:** nessun errore JavaScript rilevato nei file JS e negli script inline HTML.
- **Verifica API:** tutte le azioni dichiarate in `assets/js/api.js` hanno una corrispondente route backend.

## Limite del collaudo automatico
Il test statico non può simulare i servizi Google reali (Sheets, MailApp, Maps, reCAPTCHA e Web App distribuita). Dopo il deploy va eseguita la checklist del README con account Amministratore e almeno due account Consigliere reali.
