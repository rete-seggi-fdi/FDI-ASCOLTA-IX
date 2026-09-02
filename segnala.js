  const form = document.getElementById("reportForm");
  const gpsBtn = document.getElementById("gpsBtn");
  const searchAddressBtn = document.getElementById("searchAddressBtn");
  const addressResults = document.getElementById("addressResults");
  const addressInput = document.getElementById("indirizzo");
  const gpsStatus = document.getElementById("gpsStatus");
  const gpsMapEl = document.getElementById("gpsMap");
  const coordPreview = document.getElementById("coordPreview");
  const latInput = document.getElementById("latitudine");
  const lngInput = document.getElementById("longitudine");
  const formMessage = document.getElementById("formMessage");
  const quartiereSelect = document.getElementById("quartiere");
  const photoInput = document.getElementById("foto");
  const submitReport = document.getElementById("submitReport");
  const recaptchaStatus = document.getElementById("recaptchaStatus");

  let gpsMap = null;
  let gpsMarker = null;
  let positionSource = "";
  let resolvedAddressValue = "";
  let recaptchaSiteKey = "";
  let recaptchaRequired = true;
  let securityReady = false;

  function newRequestId() {
    if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
    if (globalThis.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(20);
      crypto.getRandomValues(bytes);
      return "req_" + Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    }
    return "req_" + Date.now().toString(36) + "_" + performance.now().toString(36).replace(".", "");
  }
  let reportRequestId = newRequestId();


  async function loadQuartieri() {
    try {
      const data = await API.listQuartieri();

      if (!data.ok) {
        throw new Error(data.error || "Errore caricamento quartieri");
      }

      quartiereSelect.innerHTML = '<option value="">Seleziona quartiere</option>';

      const seenDistricts = new Set();

      (data.quartieri || []).forEach(function(q) {
        const name = String(q && q.nome || "").trim();
        if (!name) return;

        const key = name.toLocaleLowerCase("it-IT");
        if (seenDistricts.has(key)) return;
        seenDistricts.add(key);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;

        const code = String(q && (q.codice || q.id) || "").trim();
        if (code) {
          option.dataset.codice = code;
          option.title = "Codice interno: " + code;
        }

        quartiereSelect.appendChild(option);
      });

      if (!data.quartieri || !data.quartieri.length) {
        quartiereSelect.innerHTML = '<option value="">Nessun quartiere configurato</option>';
      }

    } catch (error) {
      quartiereSelect.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "Errore caricamento quartieri";
      quartiereSelect.appendChild(option);
      quartiereSelect.title = error && error.message ? error.message : "Errore API";
      console.error("Caricamento quartieri:", error);
    }
  }

  function showNotice(type, text) {
    formMessage.className = "notice " + type;
    formMessage.textContent = text;
    formMessage.classList.remove("hidden");
  }

  function setGpsStatus(type, text) {
    gpsStatus.className = "gps-status " + type;
    gpsStatus.textContent = text;
  }

  function updateCoords(lat, lng, source) {
    latInput.value = Number(lat).toFixed(6);
    lngInput.value = Number(lng).toFixed(6);
    positionSource = source || positionSource || "manuale";

    coordPreview.style.display = "block";
    coordPreview.textContent =
      "Punto selezionato (" + positionSource + "): " + latInput.value + ", " + lngInput.value;
  }

  function clearCoords() {
    latInput.value = "";
    lngInput.value = "";
    positionSource = "";
    resolvedAddressValue = "";
    coordPreview.style.display = "none";
    addressResults.style.display = "none";
    addressResults.innerHTML = "";
    gpsMapEl.style.display = "none";
  }

  function showMap(lat, lng) {
    gpsMapEl.style.display = "block";

    if (!gpsMap) {
      gpsMap = L.map("gpsMap").setView([lat, lng], 17);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap"
      }).addTo(gpsMap);

      gpsMarker = L.marker([lat, lng], { draggable: true }).addTo(gpsMap);

      gpsMarker.on("dragend", function () {
        const pos = gpsMarker.getLatLng();
        updateCoords(pos.lat, pos.lng, "marker spostato");
      });

      gpsMap.on("click", function(event) {
        gpsMarker.setLatLng(event.latlng);
        updateCoords(event.latlng.lat, event.latlng.lng, "punto scelto sulla mappa");
      });
    } else {
      gpsMap.setView([lat, lng], 17);
      gpsMarker.setLatLng([lat, lng]);
    }

    setTimeout(function () {
      gpsMap.invalidateSize();
    }, 250);
  }

  function selectAddressResult(result) {
    resolvedAddressValue = result.indirizzo || addressInput.value.trim();
    updateCoords(result.latitudine, result.longitudine, "indirizzo cercato");
    showMap(Number(result.latitudine), Number(result.longitudine));
    addressResults.style.display = "none";
    addressResults.innerHTML = "";
    setGpsStatus("ok", "Punto trovato: " + resolvedAddressValue + ". Controlla il marker e spostalo se necessario.");
  }

  async function searchAddress() {
    const address = addressInput.value.trim();
    const quartiere = quartiereSelect.value;

    if (!address) {
      setGpsStatus("err", "Inserisci prima la via o il punto di riferimento.");
      addressInput.focus();
      return;
    }

    searchAddressBtn.disabled = true;
    searchAddressBtn.textContent = "Ricerca...";
    addressResults.style.display = "none";
    addressResults.innerHTML = "";

    try {
      const result = await API.geocodeAddress(address, quartiere);
      if (!result.ok) throw new Error(result.error || "Ricerca indirizzo non riuscita");

      const matches = Array.isArray(result.risultati) ? result.risultati : [];
      if (!matches.length) {
        throw new Error("Indirizzo non trovato nel Municipio IX. Aggiungi numero civico o un punto di riferimento.");
      }

      addressResults.innerHTML = "";
      matches.forEach(function(item, index) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = item.indirizzo || (item.latitudine + ", " + item.longitudine);
        button.addEventListener("click", function() {
          selectAddressResult(matches[index]);
        });
        addressResults.appendChild(button);
      });
      addressResults.style.display = "block";
      setGpsStatus("ok", "Seleziona il risultato corretto dall’elenco.");
    } catch (error) {
      setGpsStatus("err", error.message || "Errore nella ricerca dell’indirizzo.");
    } finally {
      searchAddressBtn.disabled = false;
      searchAddressBtn.textContent = "Cerca indirizzo";
    }
  }

  searchAddressBtn.addEventListener("click", searchAddress);
  addressInput.addEventListener("keydown", function(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      searchAddress();
    }
  });
  addressInput.addEventListener("input", function() {
    if (resolvedAddressValue && addressInput.value.trim() !== resolvedAddressValue) {
      clearCoords();
      setGpsStatus("", "");
    }
  });

  function gpsErrorMessage(error) {
    let message = "Impossibile acquisire la posizione.";
    if (error && error.code === 1) {
      message += " Il permesso di localizzazione è stato negato: apri le impostazioni del sito nel browser e consenti Posizione.";
    } else if (error && error.code === 2) {
      message += " Il dispositivo non riesce a determinare la posizione. Attiva Localizzazione/GPS e riprova.";
    } else if (error && error.code === 3) {
      message += " La richiesta GPS è scaduta.";
    } else {
      message += " Controlla i permessi di localizzazione del browser.";
    }
    return message;
  }

  function acquirePosition(options) {
    return new Promise(function(resolve, reject) {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  }

  async function getReliablePosition() {
    try {
      return await acquirePosition({
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      });
    } catch (firstError) {
      if (firstError && firstError.code === 1) throw firstError;
      // Su molti telefoni/desktop l'alta precisione può andare in timeout.
      // Un secondo tentativo più permissivo usa anche Wi-Fi/rete e una cache breve.
      try {
        return await acquirePosition({
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 300000
        });
      } catch (secondError) {
        throw secondError || firstError;
      }
    }
  }

  async function checkGeolocationPermission() {
    if (!navigator.permissions || typeof navigator.permissions.query !== "function") return "unknown";
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status && status.state ? status.state : "unknown";
    } catch (_) {
      return "unknown";
    }
  }

  gpsBtn.addEventListener("click", async function () {
    if (!window.isSecureContext) {
      setGpsStatus("err", "Il GPS richiede HTTPS. Apri il sito pubblicato con https:// e non come file locale o anteprima non sicura.");
      return;
    }
    if (!navigator.geolocation) {
      setGpsStatus("err", "Geolocalizzazione non supportata dal browser.");
      return;
    }

    const permission = await checkGeolocationPermission();
    if (permission === "denied") {
      setGpsStatus("err", "La posizione è bloccata per questo sito. Tocca il lucchetto/impostazioni del sito e imposta Posizione su Consenti, poi ricarica la pagina.");
      return;
    }

    gpsBtn.disabled = true;
    gpsBtn.textContent = "Acquisizione GPS...";
    setGpsStatus("", permission === "prompt" ? "Il browser potrebbe chiederti il permesso di usare la posizione." : "Ricerca posizione in corso...");

    try {
      const position = await getReliablePosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      updateCoords(lat, lng, "posizione del dispositivo");
      showMap(lat, lng);

      const accuracy = Number(position.coords.accuracy || 0);
      setGpsStatus(
        "ok",
        "Posizione acquisita" +
          (accuracy ? " (precisione circa " + Math.round(accuracy) + " m)" : "") +
          ". Verifica che coincida con il luogo della segnalazione."
      );
      gpsBtn.textContent = "Aggiorna posizione";
    } catch (error) {
      setGpsStatus("err", gpsErrorMessage(error));
      gpsBtn.textContent = "Usa GPS";
    } finally {
      gpsBtn.disabled = false;
    }
  });

  let recaptchaPromise = null;
  let publicConfigPromise = null;
  let recaptchaClient = null;
  let recaptchaProvider = "";
  let recaptchaProviderIndex = 0;

  const RECAPTCHA_PROVIDERS = [
    {
      label: "recaptcha.net",
      baseUrl: "https://www.recaptcha.net"
    },
    {
      label: "google.com",
      baseUrl: "https://www.google.com"
    }
  ];

  function setRecaptchaStatus(type, text, showRetry) {
    recaptchaStatus.className = "notice " + type;
    recaptchaStatus.replaceChildren();

    const message = document.createElement("span");
    message.textContent = text;
    recaptchaStatus.appendChild(message);

    if (showRetry) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.textContent = "Riprova controllo";
      retry.style.display = "block";
      retry.style.marginTop = "10px";
      retry.style.minHeight = "38px";
      retry.style.padding = "0 14px";
      retry.style.borderRadius = "10px";
      retry.style.border = "1px solid currentColor";
      retry.style.background = "#fff";
      retry.style.fontWeight = "900";
      retry.style.cursor = "pointer";

      retry.addEventListener("click", function() {
        resetRecaptchaClient();
        initializeRecaptcha();
      });

      recaptchaStatus.appendChild(retry);
    }

    recaptchaStatus.classList.remove("hidden");
  }

  function withTimeout(promise, timeoutMs, message) {
    let timeoutId;

    const timeout = new Promise(function(_, reject) {
      timeoutId = window.setTimeout(function() {
        reject(new Error(message || "Operazione scaduta"));
      }, timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(function() {
      window.clearTimeout(timeoutId);
    });
  }

  async function loadPublicSecurityConfig() {
    if (publicConfigPromise) return publicConfigPromise;

    publicConfigPromise = withTimeout(
      API.getPublicConfig(),
      20000,
      "Il server non ha restituito la configurazione anti-spam."
    ).then(function(result) {
      if (!result || !result.ok) {
        throw new Error(
          (result && result.error) ||
          "Configurazione anti-spam non disponibile"
        );
      }

      const recaptcha = result.recaptcha || {};
      recaptchaRequired = recaptcha.required !== false;
      recaptchaSiteKey = String(recaptcha.siteKey || "").trim();

      if (recaptchaRequired && (!recaptcha.configured || !recaptchaSiteKey)) {
        throw new Error(
          "Protezione anti-spam non configurata dall’amministratore"
        );
      }

      return recaptcha;
    }).catch(function(error) {
      publicConfigPromise = null;
      throw error;
    });

    return publicConfigPromise;
  }

  function clearRecaptchaGlobals() {
    document
      .querySelectorAll('script[data-fdi-recaptcha="true"]')
      .forEach(function(script) {
        script.remove();
      });

    document
      .querySelectorAll(
        'iframe[src*="/recaptcha/"], iframe[src*="recaptcha.net"]'
      )
      .forEach(function(frame) {
        frame.remove();
      });

    try {
      window.grecaptcha = undefined;
    } catch (_) {}

    try {
      window.___grecaptcha_cfg = undefined;
    } catch (_) {}
  }

  function resetRecaptchaClient() {
    recaptchaPromise = null;
    recaptchaClient = null;
    recaptchaProvider = "";
    securityReady = false;
    clearRecaptchaGlobals();
  }

  function loadRecaptchaScript(provider) {
    return new Promise(function(resolve, reject) {
      const script = document.createElement("script");
      const timeoutId = window.setTimeout(function() {
        script.remove();
        reject(
          new Error(
            "Caricamento da " + provider.label + " scaduto"
          )
        );
      }, 12000);

      script.dataset.fdiRecaptcha = "true";
      script.src =
        provider.baseUrl +
        "/recaptcha/api.js?render=" +
        encodeURIComponent(recaptchaSiteKey);
      script.async = true;
      script.defer = true;

      script.onload = function() {
        window.clearTimeout(timeoutId);
        resolve();
      };

      script.onerror = function() {
        window.clearTimeout(timeoutId);
        script.remove();
        reject(
          new Error(
            "Impossibile caricare reCAPTCHA da " + provider.label
          )
        );
      };

      document.head.appendChild(script);
    });
  }

  function waitForRecaptchaReady(client, providerLabel) {
    if (
      !client ||
      typeof client.ready !== "function" ||
      typeof client.execute !== "function"
    ) {
      return Promise.reject(
        new Error(
          "Libreria reCAPTCHA non valida da " + providerLabel
        )
      );
    }

    return withTimeout(
      new Promise(function(resolve) {
        client.ready(resolve);
      }),
      9000,
      "reCAPTCHA caricato da " +
        providerLabel +
        " ma non inizializzato. Verifica che la chiave sia reCAPTCHA v3 standard."
    );
  }

  async function loadRecaptcha(startIndex) {
    if (!recaptchaSiteKey) {
      return recaptchaRequired
        ? Promise.reject(
            new Error("Site key reCAPTCHA non disponibile")
          )
        : Promise.resolve(null);
    }

    if (recaptchaClient) return recaptchaClient;
    if (recaptchaPromise) return recaptchaPromise;

    const initialIndex =
      Number.isInteger(startIndex) ? startIndex : recaptchaProviderIndex;

    recaptchaPromise = (async function() {
      const errors = [];

      for (let offset = 0; offset < RECAPTCHA_PROVIDERS.length; offset++) {
        const index =
          (initialIndex + offset) % RECAPTCHA_PROVIDERS.length;
        const provider = RECAPTCHA_PROVIDERS[index];

        clearRecaptchaGlobals();

        try {
          await loadRecaptchaScript(provider);

          const client = window.grecaptcha;
          await waitForRecaptchaReady(client, provider.label);

          recaptchaClient = client;
          recaptchaProvider = provider.label;
          recaptchaProviderIndex = index;

          return client;
        } catch (error) {
          errors.push(error.message || String(error));
        }
      }

      throw new Error(
        "reCAPTCHA non disponibile. " +
        errors.join(" | ") +
        ". Controlla che la chiave sia di tipo reCAPTCHA v3 standard e che il dominio " +
        window.location.hostname +
        " sia autorizzato."
      );
    })().catch(function(error) {
      recaptchaPromise = null;
      recaptchaClient = null;
      recaptchaProvider = "";
      throw error;
    });

    return recaptchaPromise;
  }

  async function initializeRecaptcha() {
    submitReport.disabled = true;
    submitReport.textContent = "Verifica anti-spam in corso...";

    try {
      if (window.location.protocol === "file:") {
        throw new Error(
          "Il modulo deve essere aperto dal sito pubblicato, non come file locale."
        );
      }

      await loadPublicSecurityConfig();
      await loadRecaptcha();

      securityReady = true;
      setRecaptchaStatus(
        "success",
        "Protezione anti-spam attiva tramite " +
          recaptchaProvider +
          ".",
        false
      );
      submitReport.disabled = false;
      submitReport.textContent = "Invia segnalazione";
    } catch (error) {
      securityReady = false;
      setRecaptchaStatus(
        "error",
        error.message || "Protezione anti-spam non disponibile",
        true
      );
      submitReport.disabled = true;
      submitReport.textContent =
        "Invio temporaneamente non disponibile";
      console.error("Configurazione reCAPTCHA:", error);
    }
  }

  async function executeRecaptcha(client, providerLabel) {
    await waitForRecaptchaReady(client, providerLabel);

    const token = await withTimeout(
      client.execute(recaptchaSiteKey, {
        action: "create_report"
      }),
      15000,
      "La verifica tramite " +
        providerLabel +
        " non ha restituito un token."
    );

    if (!token || typeof token !== "string") {
      throw new Error(
        "Il servizio anti-spam non ha restituito un token valido."
      );
    }

    return token;
  }

  async function getRecaptchaToken() {
    if (!securityReady) {
      throw new Error(
        "Protezione anti-spam non pronta. Premi “Riprova controllo”."
      );
    }

    if (!recaptchaSiteKey && !recaptchaRequired) return "";

    let firstError = null;

    try {
      const client = await loadRecaptcha();
      return await executeRecaptcha(client, recaptchaProvider);
    } catch (error) {
      firstError = error;
    }

    // Secondo tentativo automatico usando l'altro dominio.
    const nextIndex =
      (recaptchaProviderIndex + 1) % RECAPTCHA_PROVIDERS.length;

    resetRecaptchaClient();

    try {
      const client = await loadRecaptcha(nextIndex);
      return await executeRecaptcha(client, recaptchaProvider);
    } catch (secondError) {
      securityReady = false;

      const message =
        "Il controllo anti-spam non è riuscito. " +
        "Primo tentativo: " +
        (firstError && firstError.message
          ? firstError.message
          : "errore sconosciuto") +
        " Secondo tentativo: " +
        (secondError && secondError.message
          ? secondError.message
          : "errore sconosciuto");

      setRecaptchaStatus("error", message, true);

      throw new Error(
        message +
        ". Verifica che la chiave sia reCAPTCHA v3 standard, non v2 o Enterprise, " +
        "e che " +
        window.location.hostname +
        " sia tra i domini autorizzati."
      );
    }
  }

  function validateClientPhoto(file) {
    if (!file) return;
    if (file.size > CONFIG.MAX_PHOTO_BYTES) {
      throw new Error("La foto supera il limite di 5 MB.");
    }
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      throw new Error("Sono ammesse solo immagini JPEG, PNG, GIF o WebP.");
    }
  }

  function fileToBase64(file) {
    return new Promise(function(resolve, reject) {
      if (!file) return resolve(null);

      const reader = new FileReader();

      reader.onload = function() {
        const result = String(reader.result || "");
        resolve({
          name: file.name,
          type: file.type,
          base64: result.includes(",") ? result.split(",")[1] : result
        });
      };

      reader.onerror = function() {
        reject(new Error("Impossibile leggere la foto selezionata"));
      };
      reader.onabort = function() {
        reject(new Error("Lettura della foto interrotta"));
      };
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener("submit", async function(event) {
    event.preventDefault();

    if (!securityReady) {
      showNotice("error", "Protezione anti-spam non pronta. Ricarica la pagina.");
      return;
    }

    const fd = new FormData(form);

    if (!latInput.value || !lngInput.value) {
      showNotice("error", "Cerca la via indicata oppure scegli il punto con GPS/mappa prima di inviare.");
      return;
    }

    const lat = Number(latInput.value);
    const lng = Number(lngInput.value);

    const bounds = CONFIG.COORD_BOUNDS;
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < bounds.minLat || lat > bounds.maxLat ||
      lng < bounds.minLng || lng > bounds.maxLng
    ) {
      showNotice("error", "Il punto selezionato non è valido o risulta fuori dal Municipio IX.");
      return;
    }

    submitReport.disabled = true;
    submitReport.textContent = "Preparazione invio...";

    try {
      const selectedPhoto = photoInput.files[0] || null;
      validateClientPhoto(selectedPhoto);

      submitReport.textContent = selectedPhoto
        ? "Preparazione foto..."
        : "Verifica anti-spam...";

      const foto = await withTimeout(
        fileToBase64(selectedPhoto),
        20000,
        "La lettura della foto sta richiedendo troppo tempo. Prova con un file più piccolo."
      );

      submitReport.textContent = "Verifica anti-spam...";
      const recaptchaToken = await getRecaptchaToken();

      const payload = {
        action: "createReport",
        requestId: reportRequestId,
        nome: fd.get("nome"),
        email: fd.get("email"),
        telefono: fd.get("telefono"),
        quartiere: fd.get("quartiere"),
        categoria: fd.get("categoria"),
        priorita: fd.get("priorita") || "Media",
        titolo: fd.get("titolo"),
        descrizione: fd.get("descrizione"),
        indirizzo: fd.get("indirizzo"),
        latitudine: latInput.value,
        longitudine: lngInput.value,
        fontePosizione: positionSource,
        consenso: document.getElementById("consenso").checked,
        website: fd.get("website"),
        recaptchaToken: recaptchaToken,
        foto: foto
      };

      submitReport.textContent = "Invio al server...";
      const result = await API.createReport(payload);

      if (!result.ok) throw new Error(result.error || "Errore durante l’invio.");

      showNotice(
        "success",
        "Segnalazione inviata correttamente. Codice pratica: " + result.id
      );
      if (result.trackingUrl) {
        const link = document.createElement("a");
        link.href = result.trackingUrl;
        link.textContent = " Apri il tracking personale";
        link.style.display = "block";
        link.style.marginTop = "8px";
        link.style.fontWeight = "900";
        formMessage.appendChild(link);
      }
      if (result.warning) {
        const warning = document.createElement("small");
        warning.textContent = result.warning;
        warning.style.display = "block";
        warning.style.marginTop = "8px";
        formMessage.appendChild(warning);
      }

      reportRequestId = newRequestId();
      form.reset();
      loadQuartieri();
      clearCoords();
      gpsMapEl.style.display = "none";
      gpsStatus.className = "gps-status";
      gpsStatus.textContent = "";
      gpsBtn.textContent = "Usa GPS";

    } catch (err) {
      console.error("Invio segnalazione:", err);
      showNotice(
        "error",
        err && err.message
          ? err.message
          : "Invio non riuscito. Ricarica la pagina e riprova."
      );
    } finally {
      submitReport.disabled = !securityReady;
      submitReport.textContent = securityReady
        ? "Invia segnalazione"
        : "Invio temporaneamente non disponibile";
    }
  });

  loadQuartieri();
  initializeRecaptcha();
