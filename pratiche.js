Auth.requireAuth();
if(!Auth.isAdmin()){
  const title=document.querySelector('.panel-head h2');
  if(title&&title.textContent.includes('Elenco pratiche'))title.textContent='📋 Le mie pratiche';
}
const WORKFLOW=[['1','Segnalazione ricevuta','La segnalazione è stata registrata dal sistema FDI Ascolta IX.'],['2','Presa in carico dal Gruppo Consiliare','La pratica è stata presa in carico dal Gruppo Consiliare.'],['3','Assegnata al consigliere','La pratica è stata assegnata al consigliere competente.'],['4','Inviata dal consigliere all’ufficio municipale competente','La pratica è stata trasmessa all’ufficio municipale competente.'],['5','In attesa di risposta dall’ufficio municipale competente','La pratica è in attesa di riscontro da parte dell’ufficio competente.'],['6','Risposta ricevuta','È stata ricevuta una risposta relativa alla pratica.'],['7','In lavorazione','La pratica risulta in lavorazione.'],['8','Risolta','La criticità segnalata risulta risolta.'],['9','Archiviata','La pratica è stata archiviata.']];
let reports=[],filtered=[],referenti=[],uffici=[],selected=null,gMap=null,cMap=null,gMarkers=[];
async function get(action,params={}){
  return API.call(action,params);
}
async function post(payload){
  const {action,...params}=payload;
  return API.call(action,params);
}
function esc(v){
  return String(v??'').replace(/[&<>"']/g,m=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[m]));
}

function safeHttpsUrl(value){
  try{const url=new URL(String(value||''),location.href);return url.protocol==='https:'?url.href:''}catch(_){return ''}
}

function valid(r){
  const a=Number(r.latitudine);
  const b=Number(r.longitudine);
  const bounds=CONFIG.COORD_BOUNDS;
  return Number.isFinite(a)&&Number.isFinite(b)&&
    a>=bounds.minLat&&a<=bounds.maxLat&&
    b>=bounds.minLng&&b<=bounds.maxLng;
}

function uniq(k){
  return [...new Set(reports.map(r=>r[k]).filter(Boolean))].sort();
}

function fill(id,vals,label){
  document.getElementById(id).innerHTML=
    '<option value="">'+label+'</option>'+
    vals.map(v=>`<option>${esc(v)}</option>`).join('');
}

function apply(){
  const query=q.value.toLowerCase();
  filtered=reports.filter(r=>{
    const t=[r.id,r.titolo,r.quartiere,r.categoria,r.stato,r.nome]
      .join(' ')
      .toLowerCase();

    return(!query||t.includes(query))&&
      (!fQuartiere.value||r.quartiere===fQuartiere.value)&&
      (!fCategoria.value||r.categoria===fCategoria.value)&&
      (!fStato.value||r.stato===fStato.value)&&
      (!fPriorita.value||r.priorita===fPriorita.value);
  });

  renderList();
  renderGeneralMap();
}

function renderList(){
  count.textContent=filtered.length;
  list.innerHTML=filtered.map(r=>`
    <button
      class="item ${selected&&selected.id===r.id?'active':''}"
      type="button"
      data-report-id="${esc(r.id)}">
      <b>${esc(r.id)}</b><br>
      ${esc(r.titolo)}<br>
      <small class="muted">
        ${esc(r.quartiere)} • ${esc(r.categoria)} • ${esc(r.stato)}
      </small>
    </button>
  `).join('')||'<p class="muted">Nessuna pratica.</p>';

  list.querySelectorAll('[data-report-id]').forEach(button=>{
    button.addEventListener('click',()=>{
      openCase(button.dataset.reportId,true,true);
    });
  });
}

function detailUrl(reportId){
  const url=new URL(window.location.href);
  url.search='';
  url.searchParams.set('open',String(reportId||''));
  url.hash='case';
  return url.href;
}

function buildPracticePopup(report){
  const wrapper=document.createElement('div');

  const title=document.createElement('b');
  title.textContent=report.titolo||'Pratica';
  wrapper.appendChild(title);

  wrapper.appendChild(document.createElement('br'));

  const district=document.createElement('span');
  district.textContent=report.quartiere||'';
  wrapper.appendChild(district);

  wrapper.appendChild(document.createElement('br'));

  const link=document.createElement('a');
  link.className='popup-open';
  link.href=detailUrl(report.id);
  link.textContent='Apri pratica';

  link.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();

    if(gMap){
      gMap.closePopup();
    }

    openCase(report.id,true,true).catch(error=>{
      console.error(error);
      window.location.assign(detailUrl(report.id));
    });
  });

  wrapper.appendChild(link);

  if(typeof L!=='undefined'&&L.DomEvent){
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
  }

  return wrapper;
}

function renderGeneralMap(){
  if(!gMap){
    gMap=L.map('generalMap').setView([41.82,12.45],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'&copy; OpenStreetMap'
    }).addTo(gMap);
  }

  gMarkers.forEach(marker=>marker.remove());
  gMarkers=[];

  filtered.filter(valid).forEach(report=>{
    const marker=L
      .marker([Number(report.latitudine),Number(report.longitudine)])
      .addTo(gMap)
      .bindPopup(buildPracticePopup(report));

    gMarkers.push(marker);
  });

  setTimeout(()=>gMap.invalidateSize(),200);
}

async function openCase(id, scrollToDetail=false, enterDetailMode=false){
  selected=reports.find(r=>String(r.id)===String(id));

  if(!selected){
    return false;
  }

  const currentUrl=new URL(window.location.href);
  currentUrl.searchParams.set('open',selected.id);
  currentUrl.hash='case';
  window.history.replaceState({reportId:selected.id},'',currentUrl);

  if(enterDetailMode){
    document.body.classList.add('detail-mode');
  }

  empty.classList.add('hidden');
  document.getElementById('case').classList.remove('hidden');
  activateTab('dati');

  caseStatus.textContent=selected.stato||'';
  caseTitle.textContent=selected.titolo||'Pratica';
  caseSub.textContent=[selected.quartiere,selected.categoria,selected.data].filter(Boolean).join(' • ');
  citNome.textContent=selected.nome||'-';
  citTel.textContent=selected.telefono||'-';
  citEmail.textContent=selected.email||'-';
  prio.textContent=selected.priorita||'-';
  addr.textContent=selected.indirizzo||'-';
  desc.textContent=selected.descrizione||'-';
  coords.textContent=valid(selected)?selected.latitudine+', '+selected.longitudine:'Coordinate non valide';
  refCurrent.textContent=selected.referenteNome||'Non assegnato';
  const safePhotoUrl=safeHttpsUrl(selected.fotoUrl);
  photo.innerHTML=safePhotoUrl
    ? `<a target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" href="${esc(safePhotoUrl)}">Apri foto allegata</a>`
    : 'Nessuna foto.';

  renderCaseMap();
  renderWorkflow();
  renderRefs();
  renderUffici();
  renderList();

  if(scrollToDetail){
    const detail=document.getElementById('case');

    window.scrollTo({top:0,left:0,behavior:'auto'});

    window.setTimeout(()=>{
      detail.scrollIntoView({
        behavior:'smooth',
        block:'start'
      });
    },80);

    window.setTimeout(()=>{
      const top=Math.max(
        0,
        detail.getBoundingClientRect().top+window.scrollY-105
      );
      window.scrollTo({top,left:0,behavior:'auto'});
    },450);
  }

  renderTimeline().catch(error=>{
    console.error('Errore timeline:',error);
    timeline.innerHTML=
      '<p class="muted">Impossibile caricare la timeline.</p>';
  });

  return true;
}

window.openCase=openCase;

const backToOverview=document.getElementById('backToOverview');

backToOverview.addEventListener('click',()=>{
  document.body.classList.remove('detail-mode');

  const url=new URL(window.location.href);
  url.searchParams.delete('open');
  url.hash='';
  window.history.replaceState({},'',url);

  window.scrollTo({top:0,left:0,behavior:'smooth'});

  window.setTimeout(()=>{
    if(gMap){
      gMap.invalidateSize();
    }
  },250);
});

function renderCaseMap(){
  if(cMap){cMap.remove();cMap=null;}
  caseMapWrap.innerHTML=valid(selected)?'<div id="caseMap"></div>':'<p class="muted">Coordinate mancanti o non valide.</p>';
  if(!valid(selected))return;
  setTimeout(()=>{
    cMap=L.map('caseMap').setView([Number(selected.latitudine),Number(selected.longitudine)],17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(cMap);
    L.marker([Number(selected.latitudine),Number(selected.longitudine)]).addTo(cMap);
    setTimeout(()=>cMap.invalidateSize(),200);
  },80);
}
const fixLocation=document.getElementById('fixLocation');
async function correctSelectedLocation(){
  if(!selected)return alert('Seleziona una pratica');
  if(!selected.indirizzo)return alert('Indirizzo mancante');

  fixLocation.disabled=true;
  fixLocation.textContent='📍 Ricerca indirizzo...';
  try{
    const search=await API.geocodeAddress(selected.indirizzo,selected.quartiere||'');
    if(!search.ok)throw new Error(search.error||'Ricerca indirizzo non riuscita');
    const matches=Array.isArray(search.risultati)?search.risultati:[];
    if(!matches.length)throw new Error('Nessun indirizzo compatibile trovato nel Municipio IX');

    const choices=matches.map((item,index)=>(index+1)+'. '+item.indirizzo).join('\n');
    const answer=prompt('Scegli il risultato da usare:\n\n'+choices,'1');
    if(answer===null)return;
    const index=Number(answer)-1;
    if(!Number.isInteger(index)||!matches[index])throw new Error('Scelta non valida');
    const chosen=matches[index];

    const confirmed=confirm('Aggiornare la pratica con questa posizione?\n\n'+chosen.indirizzo);
    if(!confirmed)return;

    const result=await API.updateReportLocation({
      reportId:selected.id,
      latitudine:chosen.latitudine,
      longitudine:chosen.longitudine,
      indirizzoRisolto:chosen.indirizzo
    });
    if(!result.ok)throw new Error(result.error||'Aggiornamento posizione non riuscito');

    selected.latitudine=result.latitudine;
    selected.longitudine=result.longitudine;
    const row=reports.find(item=>item.id===selected.id);
    if(row){row.latitudine=result.latitudine;row.longitudine=result.longitudine;}
    coords.textContent=result.latitudine+', '+result.longitudine;
    renderCaseMap();
    renderGeneralMap();
    await renderTimeline();
    alert('Posizione aggiornata correttamente.');
  }catch(error){
    alert(error.message||'Errore durante la correzione della posizione');
  }finally{
    fixLocation.disabled=false;
    fixLocation.textContent='📍 Posiziona sulla via indicata';
  }
}
fixLocation.onclick=correctSelectedLocation;

function renderWorkflow(){workflow.innerHTML=WORKFLOW.map(w=>`<button class="btn secondary" type="button" data-workflow-phase="${esc(w[0])}">${w[0]}. ${esc(w[1])}</button>`).join('')}
workflow.addEventListener('click',event=>{const button=event.target.closest('[data-workflow-phase]');if(button)setStatus(button.dataset.workflowPhase)});
async function setStatus(f){
  if(!selected)return alert('Seleziona pratica');
  if(String(f)==='8'){openCloseModal();return;}
  const w=WORKFLOW.find(x=>x[0]===f);
  const res=await post({action:'updateReportStatus',reportId:selected.id,fase:w[0],stato:w[1],descrizione:w[2],visibileCittadino:'Sì',operatore:'Modulo Pratiche'});
  if(res.ok){
    selected.stato=w[1];
    reports.find(r=>r.id===selected.id).stato=w[1];
    apply();
    openCase(selected.id);
  }else alert(res.error||'Errore aggiornamento stato');
}
function renderRefs(){refSelect.innerHTML='<option value="">Seleziona consigliere</option>'+referenti.map(r=>`<option value="${esc(r.id)}">${esc(r.nome)}</option>`).join('')}function renderUffici(){const activeOffices=uffici.filter(u=>!/^(no|false|0)$/i.test(String(u.attivo||'Sì').trim()));uffSelect.innerHTML='<option value="">Seleziona ufficio</option>'+activeOffices.map(u=>`<option value="${esc(u.id)}">${esc(u.ufficio||u.nome)} — ${esc(u.settore||'')}</option>`).join('')}sendRef.onclick=async()=>{if(!selected)return alert('Seleziona pratica');if(!refSelect.value)return alert('Seleziona consigliere');const res=await post({action:'sendToReferente',reportId:selected.id,referenteId:refSelect.value,messaggio:refMsg.value});if(res.ok){alert('Inviata al consigliere');location.reload()}else alert(res.error)};sendUff.onclick=async()=>{if(!selected)return alert('Seleziona pratica');if(!uffSelect.value)return alert('Seleziona ufficio');const message=(uffMsg.value||'').trim();if(message.length<10)return alert('Inserisci un messaggio per l’ufficio di almeno 10 caratteri');const res=await post({action:'sendToUfficio',reportId:selected.id,ufficioId:uffSelect.value,messaggio:message});if(res.ok){selected.stato='In attesa di risposta dall’ufficio municipale competente';const item=reports.find(r=>r.id===selected.id);if(item)item.stato=selected.stato;uffMsg.value='';apply();await openCase(selected.id);alert('Pratica inoltrata. Ora è in attesa di risposta dall’ufficio.')}else alert(res.error||'Funzione sendToUfficio non disponibile')};async function renderTimeline(){const res=await get('getTimeline',{reportId:selected.id});const arr=res.ok?(res.timeline||[]):[];timeline.innerHTML=arr.map(t=>`<div><b>${esc(t.titolo)}</b><br><small>${esc(t.data)}</small><br>${esc(t.descrizione)}</div>`).join('')||'<p class="muted">Timeline non disponibile.</p>'}
const closeModal=document.getElementById('closeModal');
const closeModalX=document.getElementById('closeModalX');
const closeCancel=document.getElementById('closeCancel');
const closeConfirm=document.getElementById('closeConfirm');
const closeNotes=document.getElementById('closeNotes');
const closeMsg=document.getElementById('closeMsg');
const closeSendEmail=document.getElementById('closeSendEmail');
const closeArchive=document.getElementById('closeArchive');

function openCloseModal(){
  if(!selected)return alert('Seleziona pratica');
  closeNotes.value='';
  closeMsg.textContent='';
  closeSendEmail.checked=true;
  closeArchive.checked=Auth.isAdmin();
  const archiveRow=closeArchive.closest('label');if(archiveRow)archiveRow.hidden=!Auth.isAdmin();
  closeModal.classList.add('show');
  setTimeout(()=>closeNotes.focus(),80);
}
function closeCloseModal(){closeModal.classList.remove('show');}
async function confirmClosePractice(){
  if(!selected)return alert('Seleziona pratica');
  const outcomeEl=document.querySelector('input[name="closeOutcome"]:checked');
  const outcome=outcomeEl?outcomeEl.value:'Risolta';
  const notes=closeNotes.value.trim();
  if(!notes){closeMsg.textContent='Inserisci le note finali prima di chiudere la pratica.';closeNotes.focus();return;}
  closeConfirm.disabled=true;closeConfirm.textContent='Chiusura...';closeMsg.textContent='Aggiornamento pratica in corso...';
  try{
    const res=await post({action:'closeReport',reportId:selected.id,esito:outcome,noteFinali:notes,inviaEmail:closeSendEmail.checked,archivia:closeArchive.checked,operatore:'Modulo Pratiche'});
    if(!res.ok)throw new Error(res.error||'Errore chiusura pratica');
    const finalStatus=Auth.isAdmin()&&closeArchive.checked?'Archiviata':'Risolta';
    selected.stato=finalStatus;
    const found=reports.find(r=>r.id===selected.id);if(found)found.stato=finalStatus;
    closeCloseModal();apply();openCase(selected.id);alert('Pratica chiusa correttamente.');
  }catch(err){closeMsg.textContent=err.message;alert(err.message);}
  finally{closeConfirm.disabled=false;closeConfirm.textContent='Chiudi pratica';}
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&closeModal.classList.contains('show'))closeCloseModal();});
closeModal.addEventListener('click',e=>{if(e.target===closeModal)closeCloseModal();});
closeModalX.onclick=closeCloseModal;
closeCancel.onclick=closeCloseModal;
closeConfirm.onclick=confirmClosePractice;

function activateTab(id){document.querySelectorAll('.tab,.tabpane').forEach(e=>e.classList.remove('active'));document.querySelector(`[data-tab="${id}"]`)?.classList.add('active');document.getElementById(id)?.classList.add('active');if(id==='mappaTab'&&cMap)setTimeout(()=>cMap.invalidateSize(),150)}document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>activateTab(b.dataset.tab));

if(!Auth.isAdmin()){
  document.body.classList.add('councillor-mode');
  document.querySelectorAll('[data-admin-only],#sendRef,#refSelect,#refMsg').forEach(el=>{
    const container=el.closest('.admin-tools')||el;
    container.style.display='none';
  });
}


const workStartNote=document.getElementById('workStartNote');
const takeChargeBtn=document.getElementById('takeChargeBtn');
const openOfficeTabBtn=document.getElementById('openOfficeTabBtn');
const officeResponseText=document.getElementById('officeResponseText');
const responseReceivedBtn=document.getElementById('responseReceivedBtn');
const resolveCouncillorBtn=document.getElementById('resolveCouncillorBtn');

async function startWorkWithRequiredNote(){
  if(!selected)return alert('Seleziona una pratica');
  const note=(workStartNote.value||'').trim();
  if(note.length<10){
    workStartNote.focus();
    return alert('La nota è obbligatoria e deve contenere almeno 10 caratteri.');
  }
  takeChargeBtn.disabled=true;
  takeChargeBtn.textContent='Aggiornamento...';
  try{
    const result=await API.startReportWork(selected.id,note);
    if(!result.ok)throw new Error(result.error||'Aggiornamento non riuscito');
    workStartNote.value='';
    selected.stato='In lavorazione';
    const item=reports.find(report=>report.id===selected.id);
    if(item)item.stato='In lavorazione';
    apply();
    await openCase(selected.id);
    alert('Pratica segnata in lavorazione.');
  }catch(error){
    alert(error.message||'Errore durante l’aggiornamento');
  }finally{
    takeChargeBtn.disabled=false;
    takeChargeBtn.textContent='Segna in lavorazione';
  }
}

async function saveOfficeResponse(){
  if(!selected)return alert('Seleziona una pratica');
  const response=(officeResponseText.value||'').trim();
  if(response.length<10){
    officeResponseText.focus();
    return alert('Inserisci la risposta ricevuta, almeno 10 caratteri.');
  }
  responseReceivedBtn.disabled=true;
  responseReceivedBtn.textContent='Salvataggio...';
  try{
    const result=await API.recordOfficeResponse(selected.id,response);
    if(!result.ok)throw new Error(result.error||'Risposta non salvata');
    officeResponseText.value='';
    selected.stato='Risposta ricevuta';
    const item=reports.find(report=>report.id===selected.id);
    if(item)item.stato='Risposta ricevuta';
    apply();
    await openCase(selected.id);
    alert('Risposta ricevuta registrata.');
  }catch(error){
    alert(error.message||'Errore durante il salvataggio');
  }finally{
    responseReceivedBtn.disabled=false;
    responseReceivedBtn.textContent='Salva risposta ricevuta';
  }
}

if(takeChargeBtn)takeChargeBtn.onclick=startWorkWithRequiredNote;
if(openOfficeTabBtn)openOfficeTabBtn.onclick=()=>{
  if(!selected)return alert('Seleziona una pratica');
  activateTab('ufficio');
  setTimeout(()=>uffSelect.focus(),80);
};
if(responseReceivedBtn)responseReceivedBtn.onclick=saveOfficeResponse;
if(resolveCouncillorBtn)resolveCouncillorBtn.onclick=openCloseModal;

let practicesLoading=false;

async function boot(preserveSelection=false){
  if(practicesLoading)return;
  practicesLoading=true;

  const previousId=preserveSelection&&selected?selected.id:'';
  refreshPractices.disabled=true;
  refreshPractices.textContent='↻ Aggiornamento...';

  try{
    const isAdminUser=Auth.isAdmin();
    const [r,ref,u]=await Promise.all([
      get('listReports'),
      isAdminUser
        ? get('listReferenti')
        : Promise.resolve({ok:true,referenti:[]}),
      get('listUffici').catch(()=>({ok:false,uffici:[]}))
    ]);

    if(!r.ok)throw new Error(r.error||'Errore caricamento pratiche');
    if(isAdminUser&&!ref.ok)throw new Error(ref.error||'Errore caricamento referenti');

    reports=Array.isArray(r.reports)?r.reports:[];
    referenti=Array.isArray(ref.referenti)?ref.referenti:[];
    uffici=Array.isArray(u.uffici)?u.uffici:[];

    fill('fQuartiere',uniq('quartiere'),'Quartiere');
    fill('fCategoria',uniq('categoria'),'Categoria');
    fill('fStato',uniq('stato'),'Stato');
    fill('fPriorita',uniq('priorita'),'Priorità');
    apply();

    const requestedId=preserveSelection
      ? ''
      : String(new URLSearchParams(window.location.search).get('open')||'').trim();

    const previousExists=previousId&&reports.some(item=>String(item.id)===String(previousId));
    const requestedExists=requestedId&&reports.some(item=>String(item.id)===requestedId);

    const nextId=previousExists
      ? previousId
      : requestedExists
        ? requestedId
        : (reports[0]?reports[0].id:'');

    if(nextId){
      await openCase(nextId,Boolean(requestedExists),Boolean(requestedExists));
    }else{
      selected=null;
      empty.classList.remove('hidden');
      document.getElementById('case').classList.add('hidden');
    }

    if(requestedId&&!requestedExists){
      console.warn('Pratica richiesta non trovata:',requestedId);
      document.getElementById('list').insertAdjacentHTML(
        'afterbegin',
        '<p class="muted" style="padding:10px">La pratica '+esc(requestedId)+' non è stata trovata.</p>'
      );
    }
  }catch(err){
    console.error(err);
    document.getElementById('list').innerHTML='<p class="muted">Errore caricamento: '+esc(err.message)+'</p>';
  }finally{
    practicesLoading=false;
    refreshPractices.disabled=false;
    refreshPractices.textContent='↻ Aggiorna';
  }
}

refreshPractices.onclick=()=>boot(true);
[q,fQuartiere,fCategoria,fStato,fPriorita].forEach(el=>{el.oninput=apply;el.onchange=apply});
boot(false);
