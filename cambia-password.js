if(!Auth.requireAuth()) throw new Error("Autenticazione richiesta");
const form=document.getElementById("passwordForm");
const message=document.getElementById("message");
const saveBtn=document.getElementById("saveBtn");
form.addEventListener("submit",async event=>{
  event.preventDefault();message.hidden=true;
  const current=document.getElementById("currentPassword").value;
  const next=document.getElementById("newPassword").value;
  const confirm=document.getElementById("confirmPassword").value;
  if(next!==confirm){message.textContent="Le nuove password non coincidono";message.hidden=false;return}
  if(next.length<12){
    message.textContent="La password deve contenere almeno 12 caratteri";
    message.hidden=false;return;
  }
  if(!/[A-Z]/.test(next)){
    message.textContent="Inserisci almeno una lettera maiuscola";
    message.hidden=false;return;
  }
  if(!/[a-z]/.test(next)){
    message.textContent="Inserisci almeno una lettera minuscola";
    message.hidden=false;return;
  }
  if(!/[0-9]/.test(next)){
    message.textContent="Inserisci almeno un numero";
    message.hidden=false;return;
  }
  if(!/[^A-Za-z0-9]/.test(next)){
    message.textContent="Inserisci almeno un carattere speciale";
    message.hidden=false;return;
  }
  saveBtn.disabled=true;saveBtn.textContent="Salvataggio...";
  try{
    const result=await API.changeOwnPassword(current,next);
    if(!result.ok)throw new Error(result.error||"Aggiornamento non riuscito");
    Auth.clearSession();
    alert("Password aggiornata. Ora accedi con la nuova password.");
    location.replace("login.html");
  }catch(error){message.textContent=error.message||"Errore";message.hidden=false}
  finally{saveBtn.disabled=false;saveBtn.textContent="Salva nuova password"}
});
