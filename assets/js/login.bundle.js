/* FDI Ascolta IX — login build 3107 / backend rc6 */
(() => {
  "use strict";

  const CONFIG = Object.freeze({
    API_URL: "https://script.google.com/macros/s/AKfycbyZuNSOT2SCW6YNp6gZ-bTO6gfm9wGI3-YAjvSmo5oelcqrUmARNzmd49hbjSn4ISh4Yg/exec",
    SESSION_KEY: "fdi_ascolta_ix_session"
  });

  const form = document.getElementById("loginForm");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  const button = document.getElementById("loginBtn");
  const message = document.getElementById("messageBox");
  const showPass = document.getElementById("showPass");

  function showError(text) {
    message.hidden = false;
    message.textContent = text || "Impossibile effettuare l’accesso";
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = "";
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
    const requested = safeNext((result && result.next) || params.get("next"), fallback);
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

  function decodeAuthHash() {
    const hash = String(location.hash || "");
    if (!hash.startsWith("#auth=")) return null;

    const encoded = decodeURIComponent(hash.slice(6));
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function finishAuth(result) {
    if (!result || !result.ok) {
      showError(result && result.error ? result.error : "Email o password non validi");
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    saveSession(result);
    history.replaceState(null, "", location.pathname + location.search);
    location.replace(destination(result));
  }

  // Quando la finestra temporanea torna da Apps Script su login.html#auth=...,
  // passa il risultato alla finestra principale (stessa origin GitHub) e si chiude.
  let authResult = null;
  try {
    authResult = decodeAuthHash();
  } catch (_) {
    authResult = { ok: false, error: "Risposta di autenticazione non valida" };
  }

  if (authResult) {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: "FDI_LOGIN_RESULT", result: authResult },
        location.origin
      );
      document.body.innerHTML =
        '<main style="font-family:Arial,sans-serif;padding:30px"><h2>Accesso completato</h2><p>Puoi chiudere questa finestra.</p></main>';
      window.setTimeout(() => window.close(), 150);
      return;
    }
    finishAuth(authResult);
    return;
  }

  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    if (!event.data || event.data.type !== "FDI_LOGIN_RESULT") return;
    finishAuth(event.data.result);
  });

  showPass.addEventListener("click", () => {
    password.type = password.type === "password" ? "text" : "password";
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    clearMessage();

    const emailValue = email.value.trim();
    const passwordValue = password.value;
    if (!emailValue || !passwordValue) {
      showError("Inserisci email e password");
      return;
    }

    // window.open deve avvenire direttamente nel gesto dell'utente per evitare
    // che il browser consideri la finestra un popup indesiderato.
    const popupName = "FDI_ASCOLTA_LOGIN";
    const popup = window.open(
      "about:blank",
      popupName,
      "popup=yes,width=560,height=680,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      showError("Il browser ha bloccato la finestra di accesso. Consenti i popup per questo sito e riprova.");
      return;
    }

    button.disabled = true;
    button.textContent = "Accesso in corso...";

    try {
      popup.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>Accesso</title></head>' +
        '<body style="font-family:Arial,sans-serif;padding:30px"><p>Connessione sicura al backend…</p></body></html>'
      );
      popup.document.close();
    } catch (_) {}

    const postForm = document.createElement("form");
    postForm.method = "POST";
    postForm.action = CONFIG.API_URL;
    postForm.target = popupName;
    postForm.style.display = "none";

    const payload = {
      action: "login",
      responseMode: "redirect",
      email: emailValue,
      password: passwordValue,
      next: new URLSearchParams(location.search).get("next") || ""
    };

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "payload";
    input.value = JSON.stringify(payload);
    postForm.appendChild(input);
    document.body.appendChild(postForm);

    try {
      postForm.submit();
    } finally {
      postForm.remove();
      password.value = "";
    }

    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        button.disabled = false;
        button.textContent = "Entra nel CRM";
      }
    }, 400);
  });

  // GET health è volutamente separato dal login POST.
  fetch(CONFIG.API_URL + "?action=health&_=" + Date.now(), {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    credentials: "omit"
  })
    .then(response => {
      if (!response.ok) throw new Error("Backend non disponibile");
      return response.json();
    })
    .then(result => {
      if (!result || !result.ok) throw new Error("Backend non disponibile");
    })
    .catch(() => {
      // Non blocca il login: la diagnostica completa è disponibile in diagnostica.html.
    });
})();
