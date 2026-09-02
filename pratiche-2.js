function updateMiniKpis(){
  const countBy = fn => reports.filter(fn).length;
  miniNew.textContent=countBy(r=>/ricevuta|nuova/i.test(r.stato||''));
  miniWork.textContent=countBy(r=>/presa|assegnata|lavorazione/i.test(r.stato||''));
  miniWait.textContent=countBy(r=>/attesa|ufficio/i.test(r.stato||''));
  miniDone.textContent=countBy(r=>/risolta/i.test(r.stato||''));
  miniArch.textContent=countBy(r=>/archiviata/i.test(r.stato||''));
  mapCount.textContent=filtered.length+' pratiche';
}
const originalApply=apply;
apply=function(){originalApply();updateMiniKpis();};
