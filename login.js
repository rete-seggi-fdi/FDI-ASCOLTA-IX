const loginFormEl = document.getElementById("loginForm");
const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const loginBtnEl = document.getElementById("loginBtn");
const messageBoxEl = document.getElementById("messageBox");
const showPassEl = document.getElementById("showPass");

function destinationAfterLogin() {
  const params = new URLSearchParams(location.search);
  const requested = Auth.safeNext(params.get("next"), Auth.homeForRole());
  return Auth.canOpenPage(requested) ? requested : Auth.homeForRole();
}

if (Auth.getToken()) {
  location.replace(destinationAfterLogin());
}

showPassEl.addEventListener("click", () => {
  passwordEl.type = passwordEl.type === "password" ? "text" : "password";
});

loginFormEl.addEventListener("submit", async event => {
  event.preventDefault();
  messageBoxEl.hidden = true;
  loginBtnEl.disabled = true;
  loginBtnEl.textContent = "Accesso in corso...";

  try {
    const result = await API.login(emailEl.value.trim(), passwordEl.value);
    if (!result || !result.ok) {
      throw new Error((result && result.error) || "Credenziali non valide o accesso negato");
    }
    Auth.saveSession(result);
    location.replace(result.user && result.user.mustChangePassword
      ? "cambia-password.html"
      : destinationAfterLogin());
  } catch (error) {
    messageBoxEl.hidden = false;
    messageBoxEl.textContent = error && error.message
      ? error.message
      : "Impossibile accedere all’area riservata";
  } finally {
    loginBtnEl.disabled = false;
    loginBtnEl.textContent = "Entra nel CRM";
  }
});
