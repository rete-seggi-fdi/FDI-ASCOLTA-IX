/* FDI Ascolta IX — login build 3109 / backend rc7 */
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
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify({
      token: String(result.token || ""),
      user: result.user || null,
      mustChangePassword: Boolean(result.user && result.user.mustChangePassword),
      expiresAt: Date.now() + (expiresInSeconds * 1000)
    }));
  }

  function makeRequestId() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function pollLoginResult(requestId) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const url = CONFIG.API_URL + "?action=loginResult&requestId=" + encodeURIComponent(requestId) + "&_=" + Date.now();
      try {
        const response = await fetch(url, {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          credentials: "omit",
          redirect: "follow"
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.pending === false) {
            if (!data.ok) throw new Error(data.error || "Risposta di autenticazione non valida");
            return data.result || { ok: false, error: "Risposta di autenticazione vuota" };
          }
        }
      } catch (err) {
        // Il POST può essere ancora in lavorazione: riprova finché non scade il timeout.
        if (Date.now() + 650 >= deadline) throw err;
      }
      await sleep(650);
    }
    throw new Error("Il server non ha completato l’accesso in tempo. Riprova.");
  }

  async function loginInvisible(emailValue, passwordValue) {
    const requestId = makeRequestId();
    const payload = {
      action: "loginAsync",
      requestId,
      email: emailValue,
      password: passwordValue
    };

    // Il POST viene inviato senza CORS e senza navigazione. La risposta POST è
    // volutamente opaca; il risultato viene recuperato separatamente via GET.
    fetch(CONFIG.API_URL, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(payload)
    }).catch(() => {
      // Il polling seguente stabilisce se il backend ha elaborato la richiesta.
    });

    return pollLoginResult(requestId);
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

  fetch(CONFIG.API_URL + "?action=health&_=" + Date.now(), {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit"
  }).catch(() => {});
})();
