const API = Object.freeze({
  async call(action, params = {}, publicAction = false, timeoutMs = 30000) {
    const payload = { action, ...params };
    if (!publicAction) {
      const token = Auth.getToken();
      if (!token) { Auth.requireAuth(); throw new Error("Sessione non disponibile"); }
      payload.authToken = token;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(CONFIG.API_URL, {
        method: "POST", cache: "no-store", redirect: "follow",
        body: JSON.stringify(payload), signal: controller.signal
      });
      if (!response.ok) throw new Error("Errore HTTP " + response.status);
      const text = await response.text();
      let result;
      try { result = JSON.parse(text); }
      catch (_) { throw new Error("Risposta backend non valida"); }
      if (result && result.authRequired) {
        Auth.clearSession(); location.replace("login.html"); throw new Error("Sessione scaduta");
      }
      if (result && result.ok === false) throw new Error(result.error || "Operazione non riuscita");
      return result;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("Il server sta impiegando troppo tempo");
      throw e;
    } finally { clearTimeout(timer); }
  },
  login(email,password){ return this.call("login",{email,password},true); },
  logout(){ return this.call("logout"); },
  publicBootstrap(){ return this.call("getPublicBootstrap",{},true,15000); },
  createReport(data){ return this.call("createReport",data,true,60000); },
  publicReport(code,email=""){ return this.call("getPublicReport",{code,email},true,20000); },
  dashboard(){ return this.call("liteDashboard"); },
  reports(params={}){ return this.call("liteReports",params); },
  detail(reportId){ return this.call("liteReportDetail",{reportId}); },
  meta(){ return this.call("liteMeta"); },
  startWork(reportId,note){ return this.call("startReportWork",{reportId,note}); },
  sendOffice(reportId,ufficioId,messaggio){ return this.call("sendToUfficio",{reportId,ufficioId,messaggio}); },
  officeResponse(reportId,response){ return this.call("recordOfficeResponse",{reportId,response}); },
  closeReport(reportId,esito,noteFinali,inviaEmail=false){ return this.call("closeReport",{reportId,esito,noteFinali,inviaEmail}); },
  assign(reportId,referenteId,messaggio=""){ return this.call("sendToReferente",{reportId,referenteId,messaggio}); },
  users(){ return this.call("listUsers"); },
  saveUser(user){ return this.call("saveUser",{user}); },
  setUserActive(userId,active){ return this.call("setUserActive",{userId,active}); },
  resetPassword(userId){ return this.call("resetUserPassword",{userId}); },
  changePassword(currentPassword,newPassword){ return this.call("changeOwnPassword",{currentPassword,newPassword}); }
});