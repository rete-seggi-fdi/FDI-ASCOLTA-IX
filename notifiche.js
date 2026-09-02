if (!Auth.requireAuth()) {
  throw new Error("Sessione non disponibile");
}

const READ_KEY=CONFIG.NOTIFICATION_READ_KEY;
let reports=[],mode="all";

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function group(s){const v=String(s||"").toLowerCase();if(v.includes("archiv"))return"arch";if(v.includes("risolt"))return"done";if(/presa|assegnata|attesa|ufficio|lavorazione|risposta/.test(v))return"work";return"open"}
function isClosed(r){return["done","arch"].includes(group(r.stato))}
function readSet(){try{return new Set(JSON.parse(localStorage.getItem(READ_KEY)||"[]"))}catch(_){return new Set()}}
function saveRead(set){localStorage.setItem(READ_KEY,JSON.stringify([...set].slice(-500)))}
function nid(r){return[r.id||"",r.stato||"",r.ultimoAggiornamento||r.dataAggiornamento||r.timestamp||r.dataCreazione||""].join("|")}
function parseDate(value){
  if(!value)return null;
  if(value instanceof Date&&!isNaN(value))return value;
  const raw=String(value).trim();
  const italian=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if(italian){
    const d=new Date(
      Number(italian[3]),Number(italian[2])-1,Number(italian[1]),
      Number(italian[4]||0),Number(italian[5]||0),Number(italian[6]||0)
    );
    return isNaN(d)?null:d;
  }
  const d=new Date(raw);
  return isNaN(d)?null:d;
}
function dateOf(r){
  for(const v of [r.ultimoAggiornamento,r.dataAggiornamento,r.timestamp,r.dataCreazione,r.data]){
    const d=parseDate(v);
    if(d)return d;
  }
  return null;
}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function fmtDate(d){return d?new Intl.DateTimeFormat("it-IT",{dateStyle:"short",timeStyle:"short"}).format(d):"Data non disponibile"}

function fillStatus(){
  const vals=[...new Set(reports.map(r=>r.stato).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"it"));
  status.innerHTML='<option value="">Tutti gli stati</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("")
}

function updateKpis(){
  const read=readSet(),today=new Date();
  kTotal.textContent=reports.length;
  kUnread.textContent=reports.filter(r=>!read.has(nid(r))).length;
  kActive.textContent=reports.filter(r=>!isClosed(r)).length;
  kToday.textContent=reports.filter(r=>sameDay(dateOf(r),today)).length;
}

function markRead(id){
  const set=readSet();set.add(id);saveRead(set);render()
}

function render(){
  const read=readSet(),q=search.value.trim().toLowerCase(),st=status.value;
  const data=reports.slice().sort((a,b)=>(dateOf(b)?.getTime()||0)-(dateOf(a)?.getTime()||0)).filter(r=>{
    const unread=!read.has(nid(r));
    const text=[r.id,r.titolo,r.quartiere,r.indirizzo,r.categoria,r.stato,r.referenteNome].join(" ").toLowerCase();
    return(!q||text.includes(q))&&(!st||r.stato===st)&&
      (mode==="all"||mode==="unread"&&unread||mode==="active"&&!isClosed(r)||mode==="closed"&&isClosed(r))
  });

  feed.innerHTML=data.length?data.map(r=>{
    const id=nid(r),unread=!read.has(id);
    return `<article class="notice ${unread?"unread":""}">
      <span class="dot"></span>
      <div>
        <h3>${esc(r.id||"Pratica")} · ${esc(r.stato||"Aggiornamento")}</h3>
        <p>${esc(r.titolo||r.categoria||"Segnalazione")} — ${esc(r.quartiere||r.indirizzo||"Municipio IX")}</p>
        <small>${fmtDate(dateOf(r))}${r.referenteNome?" · "+esc(r.referenteNome):""}</small>
      </div>
      <div class="notice-actions">
        ${unread?`<button class="link" type="button" data-read-id="${esc(id)}">Segna letta</button>`:""}
        <a class="link" href="pratiche.html?open=${encodeURIComponent(r.id||"")}" data-read-id="${esc(id)}">Apri pratica</a>
        <a class="link" href="tracking.html?id=${encodeURIComponent(r.id||"")}" data-read-id="${esc(id)}">Tracking</a>
      </div>
    </article>`
  }).join(""):'<div class="empty">Nessuna notifica corrisponde ai filtri.</div>';
  updateKpis()
}

feed.addEventListener("click", event=>{
  const target=event.target.closest("[data-read-id]");
  if(target) markRead(target.dataset.readId);
});

async function load(){
  refreshBtn.disabled=true;refreshBtn.textContent="Aggiornamento...";
  try{
    const result=await API.listReports();
    if(!result||!result.ok)throw new Error(result&&result.error?result.error:"Errore caricamento notifiche");
    reports=Array.isArray(result.reports)?result.reports:[];
    fillStatus();
    render();
  }catch(e){
    console.error(e);
    feed.innerHTML=`<div class="empty">Impossibile caricare le notifiche: ${esc(e.message)}</div>`;
    kTotal.textContent='0';kUnread.textContent='0';kActive.textContent='0';kToday.textContent='0';
  }finally{
    refreshBtn.disabled=false;refreshBtn.textContent="Aggiorna";
  }
}

document.querySelectorAll("[data-filter]").forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll("[data-filter]").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active");mode=btn.dataset.filter;render()
});
search.oninput=render;status.onchange=render;refreshBtn.onclick=load;
readAllBtn.onclick=()=>{const set=readSet();reports.forEach(r=>set.add(nid(r)));saveRead(set);render()};
clearReadBtn.onclick=()=>{localStorage.removeItem(READ_KEY);render()};
load();setInterval(load,60000);
