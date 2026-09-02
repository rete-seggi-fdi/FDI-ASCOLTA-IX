const runDiag = document.getElementById("runDiag");
const diagResults = document.getElementById("diagResults");

function addResult(label, status, detail) {
  const row = document.createElement("div");
  row.className = "diag-row";
  const title = document.createElement("strong");
  title.className = status === "ok" ? "diag-ok" : status === "warn" ? "diag-warn" : "diag-err";
  title.textContent = (status === "ok" ? "✓ " : status === "warn" ? "! " : "✗ ") + label;
  const text = document.createElement("div");
  text.className = "mono";
  text.textContent = detail;
  row.append(title, text);
  diagResults.appendChild(row);
}

async function geolocationPermission() {
  if (!navigator.geolocation) return { status: "err", detail: "navigator.geolocation non disponibile" };
  if (!window.isSecureContext) return { status: "err", detail: "Pagina non in secure context HTTPS" };
  if (!navigator.permissions || typeof navigator.permissions.query !== "function") return { status: "warn", detail: "GPS disponibile; API Permissions non supportata dal browser" };
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return { status: result.state === "denied" ? "err" : "ok", detail: "Permesso geolocalizzazione: " + result.state };
  } catch (error) {
    return { status: "warn", detail: "GPS disponibile; stato permesso non leggibile: " + (error.message || error) };
  }
}

async function executeDiag() {
  diagResults.innerHTML = "";
  runDiag.disabled = true;
  runDiag.textContent = "Controllo...";
  addResult("Versione frontend", CONFIG.VERSION === "3.1.0-rc4" ? "ok" : "err", CONFIG.VERSION);
  addResult("HTTPS / secure context", window.isSecureContext ? "ok" : "err", location.href);
  addResult("Endpoint configurato", /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(CONFIG.API_URL) ? "ok" : "err", CONFIG.API_URL);

  try {
    const health = await API.health();
    addResult("Backend Apps Script", health && health.ok ? "ok" : "err", JSON.stringify(health));
  } catch (error) {
    addResult("Backend Apps Script", "err", error.message || String(error));
  }

  try {
    const districts = await API.listQuartieri();
    const names = (districts && districts.quartieri || []).map(q => q.nome).filter(Boolean);
    addResult("Quartieri", districts && districts.ok && names.length ? "ok" : "err", names.length ? names.join(", ") : JSON.stringify(districts));
  } catch (error) {
    addResult("Quartieri", "err", error.message || String(error));
  }

  const geo = await geolocationPermission();
  addResult("Geolocalizzazione browser", geo.status, geo.detail);

  runDiag.disabled = false;
  runDiag.textContent = "Ripeti diagnostica";
}

runDiag.addEventListener("click", executeDiag);
executeDiag();
