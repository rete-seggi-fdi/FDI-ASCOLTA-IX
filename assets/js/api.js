const API = {
  async get(action) {
    const res = await fetch(`${CONFIG.API_URL}?action=${encodeURIComponent(action)}`);
    return res.json();
  },
  async post(payload) {
    const res = await fetch(CONFIG.API_URL, { method: "POST", body: JSON.stringify(payload) });
    return res.json();
  },
  async listReports(){ return this.get('listReports'); },
  async listReferenti(){ return this.get('listReferenti'); },
  async login(email,password){ return this.post({action:'login', email, password}); },
  async createReport(data){ return this.post({action:'createReport', ...data}); },
  async sendToReferente(reportId, referenteId, messaggio){ return this.post({action:'sendToReferente', reportId, referenteId, messaggio}); }
};
function getSession(){ try { return JSON.parse(localStorage.getItem(CONFIG.SESSION_KEY)||'null'); } catch(e){ return null; } }
function setSession(user){ localStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(user)); }
function clearSession(){ localStorage.removeItem(CONFIG.SESSION_KEY); }
