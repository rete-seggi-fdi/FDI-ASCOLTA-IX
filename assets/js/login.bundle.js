/* FDI Ascolta IX — login build 3114 STABLE / backend rc10 */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    API_URL: "https://script.google.com/macros/s/AKfycbyZuNSOT2SCW6YNp6gZ-bTO6gfm9wGI3-YAjvSmo5oelcqrUmARNzmd49hbjSn4ISh4Yg/exec",
    SESSION_KEY: "fdi_ascolta_ix_session_v3"
  });

  const form = document.getElementById("loginForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const button = document.getElementById("loginBtn");
  const message = document.getElementById("messageBox");
  const showPass = document.getElementById("showPass");

  function showError(text) {
    message.hidden = false;
    message.className = "message error";
    message.textContent = text || "Impossibile effettuare l’accesso";
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = "";
  }

  function setBusy(busy) {
    button.disabled = busy;
    button.textContent = busy ? "Accesso in corso..." : "Entra nel CRM";
  }

  function safeNext(value, fallback) {
    const candidate = String(value || "");
    return /^(dashboard|pratiche|mappa|analytics|notifiche|uffici|configurazione|cambia-password)\.html(?:\?[^#]*)?$/.test(candidate)
      ? candidate
      : fallback;
  }

  function roleHome(user) {
    const role = String(user && user.ruolo || "").toLowerCase();
    if (/amministratore|admin/.test(role)) return "dashboard.html";
    if (/consigliere/.test(role)) return "pratiche.html";
    return "login.html";
  }

  function destination(result) {
    const params = new URLSearchParams(location.search);
    const fallback = roleHome(result && result.user);
    const requested = safeNext(params.get("next"), fallback);
    return result && result.user && result.user.mustChangePassword
      ? "cambia-password.html"
      : requested;
  }

  function saveSession(result) {
    const expiresInSeconds = Math.max(60, Number(result.expiresInSeconds || 8 * 60 * 60));
    const session = {
      token: String(result.token || ""),
      user: result.user || null,
      mustChangePassword: Boolean(result.user && result.user.mustChangePassword),
      createdAt: Date.now(),
      expiresAt: Date.now() + (expiresInSeconds * 1000)
    };
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    // Handoff monouso: la prima pagina CRM lo consuma e lo elimina subito.
    try {
      localStorage.setItem("fdi_ascolta_ix_session_handoff_v1", JSON.stringify(session));
    } catch (_) {}
  }

  function makeRequestId() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function readLoginResult(requestId) {
    let lastMeaningfulError = null;
    const delays = [0, 250, 650, 1200, 2200, 3500];

    for (const delay of delays) {
      if (delay) await sleep(delay);

      const url = CONFIG.API_URL + "?action=loginResult&requestId=" +
        encodeURIComponent(requestId) + "&_=" + Date.now();

      try {
        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          redirect: "follow"
        });

        // Apps Script ContentService può restituire un 404 transitorio
        // durante la rotazione del redirect googleusercontent. Non è un
        // errore di credenziali: aspettiamo e riproviamo.
        if (response.status === 404) {
          continue;
        }

        if (!response.ok) {
          lastMeaningfulError = new Error("Backend temporaneamente non disponibile (HTTP " + response.status + ")");
          continue;
        }

        const data = await response.json();

        if (data && data.pending === true) {
          continue;
        }

        if (data && data.pending === false) {
          if (!data.ok) {
            throw new Error(data.error || "Risposta di autenticazione non valida");
          }
          return data.result || {
            ok: false,
            error: "Risposta di autenticazione vuota"
          };
        }
      } catch (err) {
        // Gli errori applicativi reali (es. password errata) vanno mostrati.
        if (err && /Email o password|Troppe richieste|accesso/i.test(String(err.message || ""))) {
          throw err;
        }
        lastMeaningfulError = err;
      }
    }

    throw lastMeaningfulError ||
      new Error("Il backend non ha ancora completato l’accesso. Attendi qualche secondo e riprova.");
  }

  async function submitLoginViaHiddenFrame(payload) {
    const frameName = "fdiLoginTransport_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.title = "Trasporto autenticazione";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";
    iframe.style.border = "0";
    iframe.style.left = "-9999px";
    iframe.src = "about:blank";
    document.body.appendChild(iframe);

    // Attende il caricamento iniziale about:blank per non confonderlo
    // con il completamento del POST Apps Script.
    await new Promise(resolve => {
      if (iframe.contentDocument && iframe.contentDocument.readyState === "complete") {
        resolve();
        return;
      }
      iframe.addEventListener("load", resolve, { once: true });
      setTimeout(resolve, 250);
    });

    const transportForm = document.createElement("form");
    transportForm.method = "POST";
    transportForm.action = CONFIG.API_URL;
    transportForm.target = frameName;
    transportForm.enctype = "application/x-www-form-urlencoded";
    transportForm.acceptCharset = "UTF-8";
    transportForm.style.display = "none";

    const payloadInput = document.createElement("input");
    payloadInput.type = "hidden";
    payloadInput.name = "payload";
    payloadInput.value = JSON.stringify(payload);
    transportForm.appendChild(payloadInput);
    document.body.appendChild(transportForm);

    const completed = new Promise(resolve => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      iframe.addEventListener("load", done, { once: true });
      // Fallback: se il browser non espone l'evento cross-origin,
      // non restiamo bloccati all'infinito.
      setTimeout(done, 12000);
    });

    transportForm.submit();
    transportForm.remove();
    await completed;

    return () => {
      try { iframe.remove(); } catch (_) {}
    };
  }

  async function loginInvisible(emailValue, passwordValue) {
    const requestId = makeRequestId();
    const payload = {
      action: "loginAsync",
      requestId,
      email: emailValue,
      password: passwordValue
    };

    // Prima aspettiamo che il POST Apps Script abbia terminato.
    // Solo dopo leggiamo il risultato: niente polling concorrente.
    const cleanup = await submitLoginViaHiddenFrame(payload);

    try {
      return await readLoginResult(requestId);
    } finally {
      cleanup();
    }
  }

  showPass.addEventListener("click", () => {
    password.type = password.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    clearMessage();

    const emailValue = email.value.trim();
    const passwordValue = password.value;
    if (!emailValue || !passwordValue) {
      showError("Inserisci email e password");
      return;
    }

    setBusy(true);
    try {
      const result = await loginInvisible(emailValue, passwordValue);
      if (!result || !result.ok) {
        throw new Error(result && result.error ? result.error : "Email o password non validi");
      }
      saveSession(result);
      password.value = "";
      location.replace(destination(result));
    } catch (err) {
      showError(err && err.message ? err.message : "Impossibile effettuare l’accesso");
      setBusy(false);
    }
  });

})();
