const gpsBtn = document.getElementById('gpsBtn');

gpsBtn.addEventListener('click', () => {
  if (!navigator.geolocation) {
    alert('GPS non disponibile');
    return;
  }

  gpsBtn.textContent = 'Rilevamento...';

  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('latitudine').value = pos.coords.latitude.toFixed(6);
      document.getElementById('longitudine').value = pos.coords.longitude.toFixed(6);
      gpsBtn.textContent = 'Usa GPS';
    },
    () => {
      alert('Impossibile rilevare la posizione. Inserisci latitudine e longitudine manualmente.');
      gpsBtn.textContent = 'Usa GPS';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
});

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      base64: String(reader.result).split(',')[1]
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function validCoord(lat, lng) {
  const la = Number(String(lat).replace(',', '.'));
  const lo = Number(String(lng).replace(',', '.'));
  return Number.isFinite(la) && Number.isFinite(lo) && la >= 41.65 && la <= 42.05 && lo >= 12.25 && lo <= 12.75;
}

document.getElementById('reportForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const msg = document.getElementById('formMessage');
  const fd = new FormData(e.target);
  const payload = Object.fromEntries(fd.entries());

  if (!validCoord(payload.latitudine, payload.longitudine)) {
    msg.className = 'notice error';
    msg.textContent = 'Coordinate non valide. Usa il pulsante GPS oppure inserisci coordinate del Municipio IX, es. 41.802494 e 12.442314.';
    return;
  }

  msg.className = 'notice';
  msg.textContent = 'Invio in corso...';

  try {
    const foto = await fileToBase64(document.getElementById('foto').files[0]);
    payload.foto = foto;

    const res = await API.createReport(payload);

    if (!res.ok) throw new Error(res.error || 'Errore invio');

    const trackingUrl = `${location.origin}${location.pathname.replace('segnala.html', 'tracking.html')}`;

    msg.className = 'notice success';
    msg.innerHTML = `
      Segnalazione inviata correttamente.<br>
      <strong>Codice pratica: ${res.id}</strong><br>
      Abbiamo inviato una email di conferma all’indirizzo indicato.<br>
      Puoi seguire la pratica da qui: <a href="${trackingUrl}">Segui pratica</a>
    `;
    e.target.reset();
  } catch (err) {
    msg.className = 'notice error';
    msg.textContent = err.message;
  }
});
