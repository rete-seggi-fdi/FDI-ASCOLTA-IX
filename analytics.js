const authenticated=Auth.requireAuth();
let reports=[],filtered=[],charts={};

function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function group(s){const v=String(s||"").toLowerCase();if(v.includes("archiv"))return"arch";if(v.includes("risolt"))return"done";if(/presa|assegnata|attesa|ufficio|lavorazione|risposta/.test(v))return"work";return"open"}
function parseDate(value){
  if(!value)return null;
  if(value instanceof Date&&!isNaN(value))return value;
  const text=String(value).trim();
  const italian=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(italian){
    return new Date(
      Number(italian[3]),
      Number(italian[2])-1,
      Number(italian[1]),
      Number(italian[4]||0),
      Number(italian[5]||0)
    );
  }
  const parsed=new Date(text);
  return isNaN(parsed)?null:parsed;
}
function dateOf(r){
  for(const value of [r.data,r.dataCreazione,r.timestamp,r.createdAt,r.dataSegnalazione]){
    const date=parseDate(value);
    if(date)return date;
  }
  const match=String(r.id||"").match(/IX-(\d{4})(\d{2})(\d{2})/);
  return match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3])):null;
}
function closeDateOf(r){
  for(const value of [r.dataChiusura,r.closedAt,r.dataRisoluzione,r.ultimoAggiornamento]){
    const date=parseDate(value);
    if(date)return date;
  }
  return null;
}
function uniq(field){return [...new Set(reports.map(r=>r[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b),"it"))}
function fill(id,values){const s=document.getElementById(id),current=s.value,first=s.options[0].outerHTML;s.innerHTML=first+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");if([...s.options].some(o=>o.value===current))s.value=current}
function countsBy(arr,field,fallback="Non indicato"){const o={};arr.forEach(r=>{const k=String(r[field]||fallback).trim()||fallback;o[k]=(o[k]||0)+1});return o}
function destroy(name){if(charts[name])charts[name].destroy()}
function makeChart(name,config){destroy(name);charts[name]=new Chart(document.getElementById(name),config)}
function baseOptions(indexAxis="x"){return{responsive:true,maintainAspectRatio:false,indexAxis,plugins:{legend:{labels:{boxWidth:12,usePointStyle:true,font:{weight:"bold"}}}},scales:indexAxis==="y"?{x:{beginAtZero:true,grid:{color:"#edf1f6"}},y:{grid:{display:false}}}:{x:{grid:{display:false}},y:{beginAtZero:true,grid:{color:"#edf1f6"}}}}}

function apply(){
  const q=search.value.trim().toLowerCase(),days=period.value,cut=days==="all"?null:new Date(Date.now()-Number(days)*86400000);
  filtered=reports.filter(r=>{
    const d=dateOf(r);
    const text=[r.id,r.titolo,r.quartiere,r.categoria,r.stato,r.priorita,r.referenteNome,r.indirizzo].join(" ").toLowerCase();
    return(!q||text.includes(q))&&(!cut||!d||d>=cut)&&(!quartiere.value||r.quartiere===quartiere.value)&&(!categoria.value||r.categoria===categoria.value)&&(!referente.value||r.referenteNome===referente.value)
  });
  render();
}

function render(){
  const total=filtered.length,closed=filtered.filter(r=>["done","arch"].includes(group(r.stato))).length;
  kTotal.textContent=total;kActive.textContent=total-closed;kClosure.textContent=total?Math.round(closed/total*100)+"%":"0%";
  kPriority.textContent=filtered.filter(r=>/alta|urgente|critica/i.test(String(r.priorita||""))).length;
  kAreas.textContent=new Set(filtered.map(r=>r.quartiere).filter(Boolean)).size;
  const durations=filtered.map(r=>{const a=dateOf(r),b=closeDateOf(r);return a&&b&&b>=a?(b-a)/86400000:null}).filter(v=>v!==null);
  kCloseTime.textContent=durations.length?(durations.reduce((a,b)=>a+b,0)/durations.length).toFixed(1)+" gg":"—";
  renderCharts();renderTable();
}

function renderCharts(){
  const monthMap={};
  filtered.forEach(r=>{const d=dateOf(r);if(!d)return;const key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");monthMap[key]??={received:0,closed:0};monthMap[key].received++;if(["done","arch"].includes(group(r.stato)))monthMap[key].closed++});
  const months=Object.keys(monthMap).sort().slice(-12);
  makeChart("trendChart",{type:"line",data:{labels:months.map(x=>x.split("-").reverse().join("/")),datasets:[{label:"Ricevute",data:months.map(x=>monthMap[x].received),borderColor:"#0b4c99",backgroundColor:"rgba(11,76,153,.12)",fill:true,tension:.35},{label:"Chiuse",data:months.map(x=>monthMap[x].closed),borderColor:"#159447",backgroundColor:"rgba(21,148,71,.08)",fill:true,tension:.35}]},options:baseOptions()});

  const st={Aperte:0,"In lavorazione":0,Risolte:0,Archiviate:0};
  filtered.forEach(r=>{const g=group(r.stato);st[g==="open"?"Aperte":g==="work"?"In lavorazione":g==="done"?"Risolte":"Archiviate"]++});
  makeChart("statusChart",{type:"doughnut",data:{labels:Object.keys(st),datasets:[{data:Object.values(st),backgroundColor:["#c62828","#ef6c00","#159447","#667085"],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:"68%",plugins:{legend:{position:"bottom",labels:{usePointStyle:true,font:{weight:"bold"}}}}}});

  const top=(obj,n)=>Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,n);
  const areas=top(countsBy(filtered,"quartiere"),10);
  makeChart("areaChart",{type:"bar",data:{labels:areas.map(x=>x[0]),datasets:[{label:"Pratiche",data:areas.map(x=>x[1]),backgroundColor:"#0b4c99",borderRadius:7}]},options:baseOptions("y")});

  const cats=top(countsBy(filtered,"categoria"),8);
  makeChart("categoryChart",{type:"bar",data:{labels:cats.map(x=>x[0]),datasets:[{label:"Pratiche",data:cats.map(x=>x[1]),backgroundColor:"#d3a400",borderRadius:7}]},options:baseOptions("y")});

  const adv=top(countsBy(filtered,"referenteNome","Non assegnato"),8);
  makeChart("advisorChart",{type:"bar",data:{labels:adv.map(x=>x[0]),datasets:[{label:"Totale",data:adv.map(x=>x[1]),backgroundColor:"#6b3bc1",borderRadius:7}]},options:baseOptions("y")});

  const pri=countsBy(filtered,"priorita","Media");
  makeChart("priorityChart",{type:"polarArea",data:{labels:Object.keys(pri),datasets:[{data:Object.values(pri),backgroundColor:["#c62828","#ef6c00","#e9b900","#159447","#0b4c99","#667085"]}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{usePointStyle:true,font:{weight:"bold"}}}}}});
}

function renderTable(){
  const map={};
  filtered.forEach(r=>{const k=r.referenteNome||"Non assegnato";map[k]??={total:0,active:0,closed:0};map[k].total++;if(["done","arch"].includes(group(r.stato)))map[k].closed++;else map[k].active++});
  const rows=Object.entries(map).sort((a,b)=>b[1].total-a[1].total),max=rows[0]?.[1].total||1;
  tableInfo.textContent=rows.length+" consiglieri";
  advisorTable.innerHTML=rows.length?rows.map(([name,v])=>`<tr><td><b>${esc(name)}</b></td><td>${v.total}</td><td>${v.active}</td><td>${v.closed}</td><td>${v.total?Math.round(v.closed/v.total*100):0}%</td><td><div class="progress"><i style="width:${Math.round(v.total/max*100)}%"></i></div></td></tr>`).join(""):'<tr><td colspan="6"><div class="loading">Nessun dato disponibile.</div></td></tr>'
}

function exportCsv(){
  const headers=["ID","Titolo","Quartiere","Categoria","Stato","Priorità","Consigliere"];
  const rows=filtered.map(r=>[r.id,r.titolo,r.quartiere,r.categoria,r.stato,r.priorita,r.referenteNome].map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(";"));
  const blob=new Blob(["\ufeff"+headers.join(";")+"\n"+rows.join("\n")],{type:"text/csv;charset=utf-8"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="analytics-fdi-ascolta-ix.csv";a.click();URL.revokeObjectURL(a.href)
}

async function load(){
  if(!authenticated)return;
  refreshBtn.disabled=true;
  refreshBtn.textContent="Aggiornamento...";
  try{
    const result=await API.listReports();
    if(!result.ok)throw new Error(result.error||"Errore caricamento");
    reports=Array.isArray(result.reports)?result.reports:[];
    fill("quartiere",uniq("quartiere"));
    fill("categoria",uniq("categoria"));
    fill("referente",uniq("referenteNome"));
    apply();
  }catch(error){
    console.error(error);
    advisorTable.innerHTML=`<tr><td colspan="6"><div class="loading">${esc(error.message)}</div></td></tr>`;
  }finally{
    refreshBtn.disabled=false;
    refreshBtn.textContent="Aggiorna";
  }
}
[search,period,quartiere,categoria,referente].forEach(el=>el.addEventListener(el.tagName==="INPUT"?"input":"change",apply));
resetBtn.onclick=()=>{search.value="";period.value="all";quartiere.value="";categoria.value="";referente.value="";apply()};
refreshBtn.onclick=load;
printBtn.onclick=()=>window.print();csvBtn.onclick=exportCsv;
load();
