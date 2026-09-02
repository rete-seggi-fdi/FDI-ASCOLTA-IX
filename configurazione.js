const authenticated=Auth.requireAuth();
const statusBox=document.getElementById("statusBox");
const refreshBtn=document.getElementById("refreshBtn");
const quartieriList=document.getElementById("quartieriList");
const referentiList=document.getElementById("referentiList");
const ufficiList=document.getElementById("ufficiList");
const categoriesList=document.getElementById("categoriesList");
const prioritiesList=document.getElementById("prioritiesList");
const workflowList=document.getElementById("workflowList");
const usersList=document.getElementById("usersList");
const newUserBtn=document.getElementById("newUserBtn");
const userDialog=document.getElementById("userDialog");
const userDialogTitle=document.getElementById("userDialogTitle");
const userDialogClose=document.getElementById("userDialogClose");
const userCancelBtn=document.getElementById("userCancelBtn");
const userSaveBtn=document.getElementById("userSaveBtn");
const userMessage=document.getElementById("userMessage");
const passwordDialog=document.getElementById("passwordDialog");
const passwordClose=document.getElementById("passwordClose");
const passwordCancel=document.getElementById("passwordCancel");
const passwordSave=document.getElementById("passwordSave");
const passwordMessage=document.getElementById("passwordMessage");
const editorDialog=document.getElementById("editorDialog");
const dialogTitle=document.getElementById("dialogTitle");
const dialogClose=document.getElementById("dialogClose");
const editorForm=document.getElementById("editorForm");
const itemType=document.getElementById("itemType");
const formFields=document.getElementById("formFields");
const formMessage=document.getElementById("formMessage");
const cancelBtn=document.getElementById("cancelBtn");
const saveBtn=document.getElementById("saveBtn");
let configuration={quartieri:[],referenti:[],uffici:[],categories:[],priorities:[],workflow:[]};
let users=[];
let editingItem=null;
const esc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const active=item=>!/^(no|false|0)$/i.test(String(item.attivo||"Sì").trim());
function setStatus(ok,text){statusBox.className="status "+(ok?"ok":"error");statusBox.textContent=text}
function switchPanel(id){document.querySelectorAll(".panel").forEach(el=>el.classList.toggle("active",el.id===id));document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el.dataset.panel===id))}
document.querySelectorAll(".tab").forEach(button=>button.onclick=()=>switchPanel(button.dataset.panel));

function render(){
  quartieriList.innerHTML=configuration.quartieri.map(item=>card("quartiere",item,item.nome,[item.codice,item.tipo,"Ordine "+item.ordine])).join("")||empty("Nessun quartiere configurato");
  referentiList.innerHTML=configuration.referenti.map(item=>card("referente",item,item.nome,[item.ruolo,item.email,item.competenze])).join("")||empty("Nessun referente configurato");
  ufficiList.innerHTML=configuration.uffici.map(item=>card("ufficio",item,item.ufficio||item.nome,[item.settore,item.email,item.telefono])).join("")||empty("Nessun ufficio configurato");
  categoriesList.innerHTML=configuration.categories.map(value=>`<li>${esc(value)}</li>`).join("");
  prioritiesList.innerHTML=configuration.priorities.map(value=>`<li>${esc(value)}</li>`).join("");
  workflowList.innerHTML=configuration.workflow.map(value=>`<li>${esc(value)}</li>`).join("");
  usersList.innerHTML=users.map(user=>`<article class="card">
    <span class="badge ${user.attivo?"":"off"}">${user.attivo?"Attivo":"Non attivo"}</span>
    <h3>${esc(user.nome||"Senza nome")}</h3>
    <p>${esc(user.email)}</p><p>${esc(user.ruolo)}</p>
    ${user.mustChangePassword?'<p><span class="badge">Cambio password richiesto</span></p>':''}
    <div class="card-actions">
      <button class="btn" type="button" data-user-edit="${esc(user.id)}">Modifica</button>
      <button class="btn" type="button" data-user-password="${esc(user.id)}">Password</button>
      <button class="btn ${user.attivo?"danger":""}" type="button" data-user-toggle="${esc(user.id)}" data-active="${user.attivo?"false":"true"}">${user.attivo?"Disattiva":"Riattiva"}</button>
    </div>
  </article>`).join("")||empty("Nessun utente configurato");
}
function empty(text){return `<div class="empty">${esc(text)}</div>`}
function card(type,item,title,details){const id=item.id||item.codice||"";return `<article class="card"><span class="badge ${active(item)?"":"off"}">${active(item)?"Attivo":"Non attivo"}</span><h3>${esc(title||"Senza nome")}</h3>${details.filter(Boolean).map(value=>`<p>${esc(value)}</p>`).join("")}<div class="card-actions"><button class="btn" type="button" data-edit="${type}" data-id="${esc(id)}">Modifica</button>${active(item)?`<button class="btn danger" type="button" data-disable="${type}" data-id="${esc(id)}">Disattiva</button>`:""}</div></article>`}

async function loadData(){
  if(!authenticated)return;
  refreshBtn.disabled=true;
  try{
    const [health,result,userResult]=await Promise.all([API.health(),API.getConfigurationData(),API.listUsers()]);
    if(!health.ok)throw new Error(health.error||"Backend non disponibile");
    if(!result.ok)throw new Error(result.error||"Configurazione non disponibile");
    configuration=result;
    if(!userResult.ok)throw new Error(userResult.error||"Utenti non disponibili");
    users=userResult.users||[];
    render();
    setStatus(true,`Backend ${health.version||"online"} · ${configuration.quartieri.length} quartieri · ${configuration.referenti.length} referenti · ${configuration.uffici.length} uffici`);
  }catch(error){console.error(error);setStatus(false,error.message)}finally{refreshBtn.disabled=false}
}

const field=(label,name,value="",type="text",full=false)=>`<label class="field ${full?"full":""}">${label}<input id="f_${name}" name="${name}" type="${type}" value="${esc(value)}"></label>`;
const textarea=(label,name,value="")=>`<label class="field full">${label}<textarea id="f_${name}" name="${name}">${esc(value)}</textarea></label>`;
const checkbox=value=>`<label class="check field full"><input id="f_attivo" name="attivo" type="checkbox" ${active({attivo:value})?"checked":""}> Attivo</label>`;
function findItem(type,id){const key=type==="quartiere"?"quartieri":type==="referente"?"referenti":"uffici";return configuration[key].find(item=>String(item.id||item.codice)===String(id))||null}
function openEditor(type,item=null){editingItem=item;itemType.value=type;dialogTitle.textContent=(item?"Modifica ":"Nuovo ")+type;formMessage.textContent="";
  if(type==="quartiere")formFields.innerHTML=field("Codice","codice",item?.codice||item?.id||"")+field("Nome","nome",item?.nome||"")+field("Tipo","tipo",item?.tipo||"Quartiere")+field("Ordine","ordine",item?.ordine||999,"number")+checkbox(item?.attivo??"Sì");
  if(type==="referente")formFields.innerHTML=field("ID","id",item?.id||"")+field("Nome","nome",item?.nome||"")+field("Ruolo","ruolo",item?.ruolo||"")+field("Partito / lista","partito",item?.partito||"")+field("Email","email",item?.email||"","email")+field("Telefono","telefono",item?.telefono||"")+field("Zona","zona",item?.zona||"Municipio IX")+textarea("Competenze","competenze",item?.competenze||"")+checkbox(item?.attivo??"No");
  if(type==="ufficio")formFields.innerHTML=field("ID","id",item?.id||"")+field("Ufficio","ufficio",item?.ufficio||item?.nome||"")+field("Settore","settore",item?.settore||"")+field("Email","email",item?.email||"","email")+field("Telefono","telefono",item?.telefono||"")+textarea("Note","note",item?.note||"")+checkbox(item?.attivo??"No");
  if(item){
    const identifier=document.getElementById(type==="quartiere"?"f_codice":"f_id");
    if(identifier)identifier.readOnly=true;
  }
  editorDialog.showModal();
}
function collect(){const result={};new FormData(editorForm).forEach((value,key)=>{result[key]=String(value).trim()});result.attivo=document.getElementById("f_attivo")?.checked||false;return result}
async function save(){saveBtn.disabled=true;formMessage.textContent="";try{const result=await API.saveConfigurationItem(itemType.value,collect());if(!result.ok)throw new Error(result.error||"Salvataggio non riuscito");editorDialog.close();await loadData()}catch(error){formMessage.textContent=error.message}finally{saveBtn.disabled=false}}
async function disable(type,id){if(!confirm("Disattivare questo elemento?"))return;const result=await API.deactivateConfigurationItem(type,id);if(!result.ok)return alert(result.error||"Operazione non riuscita");await loadData()}


function openUser(user=null){
  document.getElementById("u_id").value=user?.id||"";
  document.getElementById("u_nome").value=user?.nome||"";
  document.getElementById("u_email").value=user?.email||"";
  document.getElementById("u_ruolo").value=user?.ruolo||"Consigliere";
  document.getElementById("u_attivo").checked=user?Boolean(user.attivo):true;
  userDialogTitle.textContent=user?"Modifica utente":"Nuovo utente";
  userSaveBtn.textContent=user?"Salva modifiche":"Crea e invia invito";
  userMessage.textContent="";
  userDialog.showModal();
}
function findUser(id){return users.find(user=>String(user.id)===String(id))||null}
async function saveUser(){
  userSaveBtn.disabled=true;userMessage.textContent="";
  try{
    const payload={
      id:document.getElementById("u_id").value.trim(),
      nome:document.getElementById("u_nome").value.trim(),
      email:document.getElementById("u_email").value.trim(),
      ruolo:document.getElementById("u_ruolo").value,
      attivo:document.getElementById("u_attivo").checked
    };
    if(!payload.nome)throw new Error("Inserire il nome");
    if(!payload.email)throw new Error("Inserire l’email");
    const result=await API.saveUser(payload);
    if(!result.ok)throw new Error(result.error||"Salvataggio non riuscito");
    userDialog.close();
    alert(result.warning || (result.invited
      ? "Utente creato. L’email con la password temporanea è stata inviata."
      : (result.emailChanged && result.credentialsSent
        ? "Email aggiornata. Le vecchie sessioni sono state revocate e sono state inviate nuove credenziali temporanee."
        : "Utente aggiornato.")));
    await loadData();switchPanel("utenti");
  }catch(error){userMessage.textContent=error.message}
  finally{userSaveBtn.disabled=false}
}
async function toggleUser(id,activeValue){
  const active=activeValue==="true";
  if(!confirm(active?"Riattivare questo utente?":"Disattivare questo utente?"))return;
  const result=await API.setUserActive(id,active);
  if(!result.ok)return alert(result.error||"Operazione non riuscita");
  await loadData();switchPanel("utenti");
}
function openPassword(id){
  document.getElementById("passwordUserId").value=id;
  passwordMessage.textContent="";
  passwordDialog.showModal();
}
async function resetPassword(){
  passwordSave.disabled=true;passwordMessage.textContent="";
  try{
    const id=document.getElementById("passwordUserId").value;
    const result=await API.resetUserPassword(id);
    if(!result.ok)throw new Error(result.error||"Invio non riuscito");
    passwordDialog.close();
    alert("Nuova password temporanea inviata. Le sessioni precedenti sono state revocate.");
    await loadData();switchPanel("utenti");
  }catch(error){passwordMessage.textContent=error.message}
  finally{passwordSave.disabled=false}
}

document.addEventListener("click",event=>{const add=event.target.closest("[data-add]");if(add)openEditor(add.dataset.add);const edit=event.target.closest("[data-edit]");if(edit)openEditor(edit.dataset.edit,findItem(edit.dataset.edit,edit.dataset.id));const off=event.target.closest("[data-disable]");if(off)disable(off.dataset.disable,off.dataset.id);
const ue=event.target.closest("[data-user-edit]");if(ue)openUser(findUser(ue.dataset.userEdit));
const up=event.target.closest("[data-user-password]");if(up)openPassword(up.dataset.userPassword);
const ut=event.target.closest("[data-user-toggle]");if(ut)toggleUser(ut.dataset.userToggle,ut.dataset.active)});
refreshBtn.onclick=loadData;saveBtn.onclick=save;cancelBtn.onclick=()=>editorDialog.close();dialogClose.onclick=()=>editorDialog.close();
newUserBtn.onclick=()=>openUser();userSaveBtn.onclick=saveUser;userCancelBtn.onclick=()=>userDialog.close();userDialogClose.onclick=()=>userDialog.close();
passwordSave.onclick=resetPassword;passwordCancel.onclick=()=>passwordDialog.close();passwordClose.onclick=()=>passwordDialog.close();
loadData();
