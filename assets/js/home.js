(async function () {
  try {
    const data = await API.getPublicStats();
    const stats = data.stats || {};
    document.getElementById("statReceived").textContent = stats.received ?? 0;
    document.getElementById("statForwarded").textContent = stats.forwarded ?? 0;
    document.getElementById("statClosed").textContent = stats.closed ?? 0;
    document.getElementById("statDistricts").textContent = stats.districts ?? 0;
  } catch (error) {
    console.warn("Statistiche pubbliche non disponibili", error);
  }
})();
