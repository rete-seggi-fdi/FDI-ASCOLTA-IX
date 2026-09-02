let reports=[];
let filtered=[];
let map;
let clusterLayer;
let heatLayer;
let selectedId=null;
let refreshTimer=null;
let clusterEnabled=true;
let heatEnabled=false;
let firstLoad=true;
const markerById=new Map();

function esc(v){
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function uniq(field){
  return [...new Set(reports.map(r=>r[field]).filter(Boolean))]
    .sort((a,b)=>String(a).localeCompare(String(b),"it"));
}

function fill(id,values){
  const s=document.getElementById(id);
  const current=s.value;
  const first=s.options[0].outerHTML;
  s.innerHTML=first+values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if([...s.options].some(o=>o.value===current)) s.value=current;
}

function statusGroup(s){
  const v=String(s||"").toLowerCase();
  if(v.includes("archiv")) return "arch";
  if(v.includes("risolt")) return "done";
  if(/presa|assegnata|attesa|ufficio|lavorazione|risposta/.test(v)) return "work";
  return "open";
}

function colorFor(s){
  return {open:"#c62828",work:"#ef6c00",done:"#159447",arch:"#667085"}[statusGroup(s)];
}

function iconFor(c){
  const v=String(c||"").toLowerCase();
  if(v.includes("buca")||v.includes("strad")) return "🕳";
  if(v.includes("verde")) return "🌳";
  if(v.includes("illumin")) return "💡";
  if(v.includes("rifiut")) return "🗑";
  if(v.includes("viabil")) return "🚧";
  if(v.includes("segnalet")) return "🚦";
  if(v.includes("scuol")) return "🏫";
  return "📍";
}

function markerIcon(r){
  return L.divIcon({
    className:"",
    html:`<div class="custom-marker" style="background:${colorFor(r.stato)}"><span>${iconFor(r.categoria)}</span></div>`,
    iconSize:[34,34],
    iconAnchor:[17,34],
    popupAnchor:[0,-30]
  });
}

function validCoords(r){
  const lat=Number(r.latitudine);
  const lng=Number(r.longitudine);
  const bounds=CONFIG.COORD_BOUNDS;

  return Number.isFinite(lat)&&
    Number.isFinite(lng)&&
    lat>=bounds.minLat&&lat<=bounds.maxLat&&
    lng>=bounds.minLng&&lng<=bounds.maxLng;
}

function reportDetailUrl(reportId){
  const url=new URL("pratiche.html",window.location.href);
  url.searchParams.set("open",String(reportId||""));
  return url.href;
}

function navigateToReport(reportId){
  const id=String(reportId||"").trim();

  if(!id){
    showToast("Codice pratica mancante.");
    return;
  }

  window.location.assign(reportDetailUrl(id));
}

function buildPopupNode(report){
  const wrapper=document.createElement("div");
  wrapper.className="popup";

  const title=document.createElement("h3");
  title.textContent=report.titolo||"Pratica";
  wrapper.appendChild(title);

  const idLine=document.createElement("p");
  const idStrong=document.createElement("b");
  idStrong.textContent=report.id||"";
  idLine.appendChild(idStrong);
  wrapper.appendChild(idLine);

  const address=document.createElement("p");
  address.textContent=report.indirizzo||report.quartiere||"Posizione non indicata";
  wrapper.appendChild(address);

  [
    ["Stato",report.stato||"—"],
    ["Priorità",report.priorita||"Media"],
    ["Referente",report.referenteNome||"Non assegnato"]
  ].forEach(([label,value])=>{
    const line=document.createElement("p");
    const strong=document.createElement("b");
    strong.textContent=label+": ";
    line.appendChild(strong);
    line.appendChild(document.createTextNode(value));
    wrapper.appendChild(line);
  });

  const actions=document.createElement("div");
  actions.className="popup-actions";

  const openButton=document.createElement("button");
  openButton.type="button";
  openButton.className="open-link";
  openButton.textContent="Apri dettaglio pratica";
  openButton.addEventListener("click",event=>{
    event.preventDefault();
    event.stopPropagation();

    if(map){
      map.closePopup();
    }

    navigateToReport(report.id);
  });

  actions.appendChild(openButton);
  wrapper.appendChild(actions);

  // Evita che Leaflet intercetti il click del pulsante.
  if(typeof L!=="undefined"&&L.DomEvent){
    L.DomEvent.disableClickPropagation(wrapper);
    L.DomEvent.disableScrollPropagation(wrapper);
  }

  return wrapper;
}

function initMap(){
  map=L.map("map").setView([41.79,12.47],12);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
    attribution:"&copy; OpenStreetMap"
  }).addTo(map);

  clusterLayer=L.markerClusterGroup({
    showCoverageOnHover:false,
    spiderfyOnMaxZoom:true,
    disableClusteringAtZoom:17,
    maxClusterRadius:54,
    iconCreateFunction(cluster){
      return L.divIcon({
        html:`<div class="cluster-bubble">${cluster.getChildCount()}</div>`,
        className:"cluster-icon",
        iconSize:[46,46]
      });
    }
  });

  heatLayer=L.heatLayer([],{
    radius:28,
    blur:22,
    maxZoom:16,
    minOpacity:.3
  });
}

function renderMap({fit=true}={}){
  clusterLayer.clearLayers();
  markerById.clear();

  if(map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
  if(map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

  const bounds=[];
  const heatPoints=[];

  filtered.filter(validCoords).forEach(r=>{
    const lat=Number(r.latitudine);
    const lng=Number(r.longitudine);
    const marker=L.marker([lat,lng],{icon:markerIcon(r)}).bindPopup(buildPopupNode(r));

    marker.on("click",()=>{
      selectedId=r.id;
      renderTable();
      const row=document.querySelector(`tr[data-id="${CSS.escape(String(r.id))}"]`);
      if(row) row.scrollIntoView({behavior:"smooth",block:"nearest"});
    });

    markerById.set(String(r.id),marker);
    clusterLayer.addLayer(marker);
    bounds.push([lat,lng]);

    const group=statusGroup(r.stato);
    const weight=group==="open"
      ? 1
      : group==="work"
        ? 0.8
        : group==="done"
          ? 0.45
          : 0.25;

    heatPoints.push([lat,lng,weight]);
  });

  heatLayer.setLatLngs(heatPoints);

  if(clusterEnabled) clusterLayer.addTo(map);
  if(heatEnabled) heatLayer.addTo(map);

  if(fit&&bounds.length){
    map.fitBounds(bounds,{padding:[30,30],maxZoom:15});
  }

  setTimeout(()=>map.invalidateSize(),100);
}

function renderTable(){
  tableBody.innerHTML=filtered.map(r=>`
    <tr data-id="${esc(r.id)}" class="${selectedId===r.id?"selected":""}">
      <td>${esc(r.id)}</td>
      <td>${esc(r.titolo||"—")}</td>
      <td>${esc(r.quartiere||"—")}</td>
      <td>${esc(r.categoria||"—")}</td>
      <td><span class="status ${statusGroup(r.stato)}">${esc(r.stato||"—")}</span></td>
      <td>${esc(r.priorita||"Media")}</td>
      <td>
        <button class="open-link" type="button"
                data-open-report="${esc(r.id)}">Apri dettaglio</button>
      </td>
    </tr>
  `).join("")||'<tr><td colspan="7">Nessuna pratica trovata.</td></tr>';

  tableCount.textContent=filtered.length;
  visibleCount.textContent=filtered.length;
}

function updateKpis(){
  const count=g=>reports.filter(r=>statusGroup(r.stato)===g).length;
  kpiOpen.textContent=count("open");
  kpiWork.textContent=count("work");
  kpiDone.textContent=count("done");
  kpiArch.textContent=count("arch");

  geoCount.textContent=reports.filter(validCoords).length;
  noGeoCount.textContent=reports.filter(r=>!validCoords(r)).length;
  neighborhoodCount.textContent=new Set(reports.map(r=>r.quartiere).filter(Boolean)).size;
  priorityCount.textContent=reports.filter(r=>/alta|urgente|critica/i.test(String(r.priorita||""))).length;

  renderCategoryBars();
}

function renderCategoryBars(){
  const counts={};
  reports.forEach(r=>{
    const key=String(r.categoria||"Altro").trim()||"Altro";
    counts[key]=(counts[key]||0)+1;
  });

  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const max=top[0]?.[1]||1;

  categoryBars.innerHTML=top.length
    ? `<div style="font-weight:950;color:var(--blue);font-size:.82rem">Categorie principali</div>`+
      top.map(([name,count])=>`
        <div class="category-row">
          <div>
            <div class="category-label"><span>${esc(name)}</span><span>${count}</span></div>
            <div class="category-track"><div class="category-fill" style="width:${Math.round(count/max*100)}%"></div></div>
          </div>
          <div style="text-align:right;font-weight:900;color:var(--blue)">${iconFor(name)}</div>
        </div>
      `).join("")
    : '<div class="loading">Nessuna categoria disponibile.</div>';
}

function applyFilters({fit=true}={}){
  const query=q.value.trim().toLowerCase();

  filtered=reports.filter(r=>{
    const text=[
      r.id,r.titolo,r.indirizzo,r.quartiere,r.categoria,
      r.stato,r.priorita,r.referenteNome
    ].join(" ").toLowerCase();

    return (!query||text.includes(query)) &&
      (!fStato.value||r.stato===fStato.value) &&
      (!fCategoria.value||r.categoria===fCategoria.value) &&
      (!fQuartiere.value||r.quartiere===fQuartiere.value) &&
      (!fPriorita.value||r.priorita===fPriorita.value) &&
      (!fReferente.value||r.referenteNome===fReferente.value);
  });

  if(selectedId&&!filtered.some(r=>String(r.id)===String(selectedId))){
    selectedId=null;
  }

  renderMap({fit});
  renderTable();
}

function resetFilters(){
  q.value="";
  [fStato,fCategoria,fQuartiere,fPriorita,fReferente].forEach(s=>s.value="");
  applyFilters();
}

function focusReport(id){
  selectedId=id;
  const marker=markerById.get(String(id));
  const r=filtered.find(x=>String(x.id)===String(id));

  if(marker&&r){
    map.setView([Number(r.latitudine),Number(r.longitudine)],16);
    if(clusterEnabled) clusterLayer.zoomToShowLayer(marker,()=>marker.openPopup());
    else marker.openPopup();
  } else {
    showToast("Questa pratica non dispone di coordinate geografiche.");
  }

  renderTable();
}

function setSystemStatus(ok,message){
  systemStatus.classList.toggle("error",!ok);
  systemStatusText.textContent=message;
}

function showToast(message){
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer=setTimeout(()=>toast.classList.remove("show"),3000);
}

function updateRefreshLabel(){
  lastRefresh.textContent="Ultimo aggiornamento: "+new Intl.DateTimeFormat("it-IT",{
    hour:"2-digit",minute:"2-digit",second:"2-digit"
  }).format(new Date());
}

function configureAutoRefresh(){
  clearInterval(refreshTimer);
  const delay=Number(refreshInterval.value);
  if(delay>0){
    refreshTimer=setInterval(()=>loadReports(false),delay);
  }
}

async function loadReports(fit=true){
  refreshBtn.disabled=true;
  refreshBtn.textContent="Aggiornamento...";

  try{
    const result=await API.listReports();
    if(!result.ok) throw new Error(result.error||"Errore caricamento pratiche");

    const previousIds=new Set(reports.map(r=>String(r.id)));
    const nextReports=Array.isArray(result.reports)?result.reports:[];
    const newItems=firstLoad?[]:nextReports.filter(r=>!previousIds.has(String(r.id)));

    reports=nextReports;
    setSystemStatus(true,"Sistema operativo");

    fill("fStato",uniq("stato"));
    fill("fCategoria",uniq("categoria"));
    fill("fQuartiere",uniq("quartiere"));
    fill("fPriorita",uniq("priorita"));
    fill("fReferente",uniq("referenteNome"));

    updateKpis();
    applyFilters({fit:firstLoad?true:fit});
    updateRefreshLabel();

    if(newItems.length){
      showToast(`${newItems.length} nuova${newItems.length===1?" pratica":" pratiche"} rilevata${newItems.length===1?"":"e"}.`);
    }else if(!firstLoad){
      showToast("Dati aggiornati.");
    }

    firstLoad=false;
  }catch(e){
    console.error(e);
    setSystemStatus(false,"Connessione non disponibile");
    lastRefresh.textContent="Ultimo aggiornamento: errore";
    tableBody.innerHTML=`<tr><td colspan="7"><div class="error">${esc(e.message)}</div></td></tr>`;
    showToast("Aggiornamento non riuscito.");
  }finally{
    refreshBtn.disabled=false;
    refreshBtn.textContent="Aggiorna ora";
  }
}

function toggleCluster(){
  clusterEnabled=!clusterEnabled;
  clusterBtn.classList.toggle("active",clusterEnabled);
  clusterBtn.textContent=clusterEnabled?"Cluster attivi":"Cluster disattivi";
  renderMap({fit:false});
}

function toggleHeat(){
  heatEnabled=!heatEnabled;
  heatBtn.classList.toggle("active",heatEnabled);
  heatBtn.textContent=heatEnabled?"Heatmap attiva":"Heatmap";
  renderMap({fit:false});
}

q.addEventListener("input",()=>applyFilters({fit:false}));
[fStato,fCategoria,fQuartiere,fPriorita,fReferente].forEach(
  s=>s.addEventListener("change",()=>applyFilters())
);
applyBtn.addEventListener("click",()=>applyFilters());
resetBtn.addEventListener("click",resetFilters);
clusterBtn.addEventListener("click",toggleCluster);
heatBtn.addEventListener("click",toggleHeat);
refreshBtn.addEventListener("click",()=>loadReports(false));
refreshInterval.addEventListener("change",configureAutoRefresh);

tableBody.addEventListener("click",event=>{
  const openButton=event.target.closest("[data-open-report]");

  if(openButton){
    event.preventDefault();
    event.stopPropagation();
    navigateToReport(openButton.dataset.openReport);
    return;
  }

  const row=event.target.closest("tr[data-id]");
  if(row){
    focusReport(row.dataset.id);
  }
});

async function startSalaOperativa(){
  if(!Auth.requireAuth()){
    return;
  }

  if(typeof L==="undefined"||
     typeof L.markerClusterGroup!=="function"||
     typeof L.heatLayer!=="function"){
    setSystemStatus(false,"Librerie mappa non disponibili");
    tableBody.innerHTML=
      '<tr><td colspan="7"><div class="error">Impossibile caricare le librerie della mappa.</div></td></tr>';
    return;
  }

  initMap();
  await loadReports(true);
  configureAutoRefresh();
}

startSalaOperativa();
