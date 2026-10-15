(() => {
const $ = id => document.getElementById(id);
const count = value => new Intl.NumberFormat('id-ID').format(Number(value) || 0);
const forms = { campaign:'Promo LAMS', 'body-concern-check':'Body Goal Check', 'body-journey-match':'Body Journey Match', 'body-goal-navigator':'Body Goal Navigator' };
const svgNode = (tag, attributes = {}) => {
  const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
  for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
  return node;
};
function empty(container, message='Belum ada submission yang sesuai filter.') {
  container.replaceChildren(); const p=document.createElement('p'); p.className='chart-empty'; p.textContent=message; container.append(p);
}
function clearAnalytics(message='Memuat ringkasan…') {
  $('insights').setAttribute('aria-busy','true'); $('insights-status').textContent=message;
  for(const id of ['trend-chart','form-chart','source-chart','area-chart']) empty($(id),message);
  $('trend-values').replaceChildren(); $('trend-grain').textContent='—';
  for(const id of ['followup-count','utm-count']) $(id).textContent='—';
  for(const id of ['followup-ratio','utm-ratio']) $(id).textContent='Menunggu data';
}
function bars(container, values, label, filter, applyFilter) {
  container.replaceChildren(); if(!values.length) return empty(container);
  const max=Math.max(...values.map(row=>row.count),1), list=document.createElement('ul'); container.append(list);
  for(const row of values) {
    const item=document.createElement('li'), button=document.createElement('button'), heading=document.createElement('span'), name=document.createElement('span'), number=document.createElement('strong');
    button.type='button'; button.className='bar-button'; heading.className='bar-label'; name.textContent=row.other?'Lainnya':label(row.key); number.textContent=count(row.count); heading.append(name,number);
    const chart=svgNode('svg',{viewBox:'0 0 1000 10',preserveAspectRatio:'none','aria-hidden':'true'});
    chart.append(svgNode('rect',{x:0,y:0,width:1000,height:10,class:'bar-track'}),svgNode('rect',{x:0,y:0,width:Math.max(1,row.count/max*1000),height:10,class:'bar-fill'}));
    button.append(heading,chart); button.setAttribute('aria-label',name.textContent+': '+count(row.count)+' submission'+(row.other?'':'. Filter data'));
    if(row.other) button.disabled=true; else button.addEventListener('click',()=>applyFilter(filter,row.key??'__none__'));
    item.append(button); list.append(item);
  }
}
function trend(data) {
  const container=$('trend-chart'); container.replaceChildren(); $('trend-values').replaceChildren();
  const grain={day:'Harian',week:'Mingguan',month:'Bulanan'}[data.grain]||'Harian'; $('trend-grain').textContent=grain;
  if(!data.trend.length) return empty(container);
  const values=data.trend, max=Math.max(...values.map(row=>row.count),1);
  const summary=document.createElement('p'); summary.className='trend-summary'; summary.textContent='Tertinggi '+count(max)+' submission / '+({day:'hari',week:'minggu',month:'bulan'}[data.grain]||'hari'); container.append(summary);
  const chart=svgNode('svg',{viewBox:'0 0 600 180',role:'img','aria-label':'Tren '+grain.toLowerCase()+', '+count(data.total)+' submission. Angka lengkap tersedia di bawah grafik.'});
  for(const y of [10,90,170]) chart.append(svgNode('line',{x1:10,x2:590,y1:y,y2:y,class:'trend-grid'}));
  const points=values.map((row,i)=>[values.length===1?300:10+i/(values.length-1)*580,170-row.count/max*150]);
  const path=points.map(([x,y],i)=>(i?'L':'M')+x+','+y).join(' ');
  if(points.length>1) chart.append(svgNode('path',{d:path+' L590,170 L10,170 Z',class:'trend-area'}),svgNode('path',{d:path,class:'trend-line'}));
  for(const [i,[x,y]] of points.entries()) { const dot=svgNode('circle',{cx:x,cy:y,r:3.5,class:'trend-dot'}),title=svgNode('title');title.textContent=values[i].date+': '+count(values[i].count);dot.append(title);chart.append(dot); }
  container.append(chart);
  const dates=document.createElement('div'); dates.className='trend-dates';
  const dateLabel=value=>new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date(value+'T00:00:00+07:00'));
  for(const value of [values[0].date,values.at(-1).date]) {const span=document.createElement('span');span.textContent=dateLabel(value);dates.append(span);} container.append(dates);
  const table=document.createElement('table'),caption=document.createElement('caption');caption.textContent='Jumlah submission per '+grain.toLowerCase()+' (WIB)';table.append(caption);
  const head=document.createElement('thead'),tr=document.createElement('tr');for(const text of ['Awal periode','Submission']){const th=document.createElement('th');th.scope='col';th.textContent=text;tr.append(th);}head.append(tr);table.append(head);
  const body=document.createElement('tbody');for(const value of values){const tr=document.createElement('tr');for(const text of [dateLabel(value.date),count(value.count)]){const td=document.createElement('td');td.textContent=text;tr.append(td);}body.append(tr);}table.append(body);$('trend-values').append(table);
}
function renderAnalytics(data, applyFilter) {
  $('insights').setAttribute('aria-busy','false'); $('insights-status').textContent=count(data.total)+' submission sesuai filter';
  $('followup-count').textContent=count(data.followup); $('utm-count').textContent=count(data.with_utm);
  const ratio=value=>data.total?new Intl.NumberFormat('id-ID',{style:'percent',maximumFractionDigits:1}).format(value/data.total):'0%';
  $('followup-ratio').textContent=ratio(data.followup)+' menyetujui follow-up'; $('utm-ratio').textContent=ratio(data.with_utm)+' sumbernya tercatat';
  trend(data); bars($('form-chart'),data.forms,key=>forms[key]||key,'form',applyFilter);
  bars($('source-chart'),data.sources,key=>key??'Tanpa UTM','source',applyFilter);
  bars($('area-chart'),data.areas,key=>key,'area',applyFilter);
}
function analyticsFailed() {
  clearAnalytics('Ringkasan belum dapat dimuat. Klik Perbarui untuk mencoba lagi.');
  $('insights').setAttribute('aria-busy','false');
  for(const id of ['followup-ratio','utm-ratio']) $(id).textContent='Ringkasan belum tersedia';
}
window.AkasiaCharts = { clearAnalytics, renderAnalytics, analyticsFailed };
})();
