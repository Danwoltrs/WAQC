const B='Brazil',S='Santos';
// origin, lab, seller, importer, roaster, certificates, approved
const ROWS = [
 [B,S,'COCATREL','Coffee America','Not recorded',102,76],[B,S,'OFI','OFI','Mother Parkers',85,82],[B,S,'Cooxupé','Coffee America','Not recorded',70,54],
 [B,S,'OFI','OFI','Qusac',59,51],[B,S,'Cooxupé','Hamburg Coffee','Not recorded',30,26],[B,S,'Brascof','Hamburg Coffee','Not recorded',24,17],
 [B,S,'OFI','OFI','National DCP',23,20],[B,S,'OFI','OFI','Not recorded',23,22],[B,S,'Sucden Brasil','Coffee America','Not recorded',22,13],
 [B,S,'Cooxupé','Sucafina','Reily foods',24,14],[B,S,'OFI','OFI','MZB',19,18],[B,S,'OFI','OFI','Reily foods',16,12],
 [B,S,'OFI','OFI','S & D / Westrock',11,10],[B,S,'CDN','Hamburg Coffee','Not recorded',11,6],[B,S,'Timbro','Coffee America','Not recorded',9,7],
 [B,S,'COCATREL','Hamburg Coffee','Not recorded',8,8],[B,S,'OFI','OFI','Segafredo',5,4],[B,S,'Cooxupé','OLH','Not recorded',6,6],
 [B,S,'Cooxupé','Rothfos Corp.','Not recorded',3,2],[B,S,'Cafebras','Coffee America','Not recorded',3,3],[B,S,'OFI','OFI','Coffein',3,2],
 [B,S,'Grano','Volcafe NA','Mother Parkers',3,3],[B,S,'Cooxupé','Ecom','Mother Parkers',2,2],[B,S,'StoneX','Rothfos Corp.','Mother Parkers',2,1],[B,S,'COCAPEC','Rothfos Corp.','Not recorded',1,0],
 ['Colombia','Buenaventura','Andes Export','Coffee America','Not recorded',70,62],
 ['Colombia','Buenaventura','Huila Trading','OFI','Mother Parkers',60,55],
 ['Colombia','Buenaventura','Café Cordillera','Hamburg Coffee','Not recorded',50,41],
 ['Guatemala','Guatemala','Antigua Verde','Coffee America','Reily foods',62,55],
 ['Peru','Guatemala','Sierra Norte Export','Sucafina','Reily foods',28,21],
 ['Honduras','Guatemala','Copán Coffee Co.','OFI','Qusac',44,36],
 ['El Salvador','Guatemala','Cuscatlán Export','OFI','Mother Parkers',22,21],
 ['Nicaragua','Guatemala','Jinotega Exports','Hamburg Coffee','Not recorded',18,12]
];
const COLS=['Origin','Lab','Seller','Importer','Roaster'];
const QUAL = [ // quality, origin, lab, certs, pss ok, pss n, ss ok, ss n
 ['Dunkin Brazil','Brazil','Santos',564,114,163,345,401],
 ['Dunkin Colombia Excelso','Colombia','Buenaventura',180,52,60,106,120],
 ['Dunkin Guatemala SHB','Guatemala','Guatemala',62,17,20,38,42],
 ['Dunkin Honduras SHG','Honduras','Guatemala',44,12,16,24,28],
 ['Dunkin Peru Grade 1','Peru','Guatemala',28,7,10,14,18],
 ['Dunkin El Salvador SHG','El Salvador','Guatemala',22,7,7,14,15],
 ['Dunkin Nicaragua SHG','Nicaragua','Guatemala',18,3,7,9,11]
];
const CERTS = [ // certificate, origin, lab, type, seller, importer, roaster, issued
 ['BR-037554/26','Brazil','Santos','SS','Timbro','Coffee America','Not recorded','22 Oct'],
 ['CO-001287/26','Colombia','Buenaventura','SS','Andes Export','Coffee America','Not recorded','22 Oct'],
 ['BR-037553/26','Brazil','Santos','SS','OFI','OFI','Mother Parkers','22 Oct'],
 ['GT-000641/26','Honduras','Guatemala','PSS','Copán Coffee Co.','OFI','Qusac','21 Oct'],
 ['GT-000640/26','Nicaragua','Guatemala','PSS','Jinotega Exports','Hamburg Coffee','Not recorded','21 Oct'],
 ['BR-037552/26','Brazil','Santos','SS','Cooxupé','Sucafina','Reily foods','21 Oct'],
 ['CO-001286/26','Colombia','Buenaventura','PSS','Huila Trading','OFI','Mother Parkers','20 Oct'],
 ['GT-000639/26','Peru','Guatemala','SS','Sierra Norte Export','Sucafina','Reily foods','20 Oct'],
 ['BR-037551/26','Brazil','Santos','PSS','COCATREL','Hamburg Coffee','Not recorded','20 Oct'],
 ['GT-000638/26','Guatemala','Guatemala','SS','Antigua Verde','Coffee America','Reily foods','19 Oct'],
 ['BR-037550/26','Brazil','Santos','SS','OFI','OFI','Qusac','19 Oct'],
 ['GT-000637/26','El Salvador','Guatemala','SS','Cuscatlán Export','OFI','Mother Parkers','19 Oct']
];
const band = r => r>=.9?'#556b2f':r>=.7?'#a9a454':'#ef4444';
const pct = (k,n) => n?Math.round(k/n*100):0;
const label = (c,v) => c===1?v+' lab':v;
const filters = {}; // column index -> value

const $ = id => document.getElementById(id);
const rowsNow = () => ROWS.filter(r => Object.entries(filters).every(([c,v]) => r[c]===v));
function toggle(c,v){ if(filters[c]===v) delete filters[c]; else filters[c]=v; render(); }

// PSS/SS split per row is not in the mockup data: spread each row by its origin quality's PSS/SS mix (illustrative)
function pssSs(rows){
  let pn=0,pk=0,sn=0,sk=0;
  if(![2,3,4].some(c=>c in filters)){ // origin/lab only: exact from the qualities
    QUAL.filter(q=>rows.some(r=>r[0]===q[1])).forEach(q=>{pk+=q[4];pn+=q[5];sk+=q[6];sn+=q[7]});
    return [pk,pn,sk,sn];
  }
  rows.forEach(r=>{const q=QUAL.find(q=>q[1]===r[0]);const share=q[5]/q[3];
    const rp=Math.round(r[5]*share), rs=r[5]-rp, okp=Math.min(rp,Math.round(r[6]*(q[4]/(q[4]+q[6])))) ;
    pn+=rp;pk+=okp;sn+=rs;sk+=r[6]-okp;});
  return [pk,pn,sk,sn];
}

function render(){
  const rows=rowsNow();
  const varying=COLS.map((_,c)=>new Set(rows.map(r=>r[c])).size>1);
  const shown=COLS.map((_,c)=>c).filter(c=>varying[c]);

  // tags: active filters (removable) + single-party steps + counts for varying steps
  const tags=[];
  COLS.forEach((name,c)=>{
    if(c in filters) tags.push(`<span class="chip f" data-c="${c}" title="Remove filter">${label(c,filters[c])} &times;</span>`);
    else if(!varying[c] && c<2) tags.push(`<span class="chip">${label(c,rows[0][c])}</span>`);
  });
  const origins=new Set(rows.map(r=>r[0])).size, labs=new Set(rows.map(r=>r[1])).size;
  const quals=QUAL.filter(q=>rows.some(r=>r[0]===q[1])).length;
  if(varying[0]) tags.push(`<span class="chip">${origins} origins</span>`);
  if(varying[1]) tags.push(`<span class="chip">${labs} labs</span>`);
  tags.push(`<span class="chip">${quals} ${quals===1?'quality':'qualities'}</span>`);
  if(Object.keys(filters).length) tags.push(`<span class="clear" id="clear">Clear</span>`);
  $('scope').innerHTML=tags.join('');
  document.querySelectorAll('.chip.f').forEach(e=>e.onclick=()=>{delete filters[e.dataset.c];render()});
  if($('clear')) $('clear').onclick=()=>{Object.keys(filters).forEach(k=>delete filters[k]);render()};

  // KPIs
  const n=rows.reduce((a,r)=>a+r[5],0), ok=rows.reduce((a,r)=>a+r[6],0);
  const [pk,pn,sk,sn]=pssSs(rows);
  const k=[[n,'Certificates'],[ok,`Approved (${pct(ok,n)}%)`],[n-ok,'Rejected',n-ok>0],[pct(pk,pn)+'%','PSS approved',pct(pk,pn)<80],[pct(sk,sn)+'%','SS approved',pct(sk,sn)<80]];
  $('kpis').innerHTML=k.map(([v,l,b])=>`<div class="kpi"><b class="${b?'bad':''}">${v}</b><small>${l}</small></div>`).join('');

  // flow, or a ranking when fewer than two steps vary
  const el=$('flow');
  if(shown.length>=2){
    $('flowTitle').textContent='Where your coffee comes from';
    $('flowSub').textContent=shown.map(c=>COLS[c].toLowerCase()).join(' → ')+', sized by certificates; colour = approval rate on that path. Click a bar to narrow the page to it.';
    $('cols').style.display='flex';
    $('cols').innerHTML=shown.map(c=>`<span>${COLS[c]}</span>`).join('');
    drawSankey(el,rows,shown);
  } else {
    const c=shown[0] ?? 2;
    $('flowTitle').textContent=`${COLS[c]} performance`;
    $('flowSub').textContent='Approval rate on this selection, ranked by confidence (few lots rank lower)';
    $('cols').style.display='none';
    drawRanking(el,rows,c);
  }

  // qualities + certificates follow the filter
  $('qual').innerHTML=QUAL.filter(q=>rows.some(r=>r[0]===q[1])).map(q=>{
    const p=pct(q[4],q[5]),s=pct(q[6],q[7]);
    return `<tr><td>${q[0]}</td><td>${q[1]}</td><td class="lab">${q[2]}</td><td class="num">${q[3]}</td>
    <td class="num"><span class="${p<70?'low':''}">${p}%</span> <span class="few">${q[4]} / ${q[5]}</span></td>
    <td class="num"><span class="${s<70?'low':''}">${s}%</span> <span class="few">${q[6]} / ${q[7]}</span></td></tr>`}).join('');
  const certs=CERTS.filter(c=>Object.entries(filters).every(([i,v])=>[c[1],c[2],c[4],c[5],c[6]][i]===v)).slice(0,6);
  $('certs').innerHTML=certs.length?certs.map(c=>`<tr><td style="font-weight:500">${c[0]}</td><td>${c[1]}</td><td>${c[3]}</td><td>${c[4]}</td><td class="num">${c[7]}</td></tr>`).join('')
    :'<tr><td colspan="5" class="few">No certificates in the latest batch for this selection</td></tr>';
}

function drawSankey(el,rows,shown){
  el.innerHTML='';
  const W=el.clientWidth||1150;
  const H=Math.max(260,Math.min(600,new Set(rows.map(r=>r[shown[Math.floor(shown.length/2)]])).size*34+80));
  const nodes=[],idx={},links={};
  const node=(c,v)=>{const key=c+':'+v;if(!(key in idx)){idx[key]=nodes.length;nodes.push({name:label(c,v),c,v})}return idx[key]};
  const add=(a,b,n,ok)=>{const key=a+'>'+b;(links[key]=links[key]||{source:a,target:b,value:0,ok:0});links[key].value+=n;links[key].ok+=ok};
  rows.forEach(r=>{const ids=shown.map(c=>node(c,r[c]));for(let j=0;j<ids.length-1;j++) add(ids[j],ids[j+1],r[5],r[6]);});
  const g=d3.sankey().nodeWidth(8).nodePadding(8).nodeAlign(d3.sankeyJustify).extent([[1,4],[W-1,H-4]]);
  const {nodes:N,links:L}=g({nodes:nodes.map(d=>({...d})),links:Object.values(links).map(d=>({...d}))});
  const svg=d3.select(el).append('svg').attr('width',W).attr('height',H);
  svg.append('g').selectAll('path').data(L).join('path').attr('d',d3.sankeyLinkHorizontal())
    .attr('stroke',d=>band(d.ok/d.value)).attr('stroke-opacity',.35).attr('fill','none').attr('stroke-width',d=>Math.max(1,d.width))
    .append('title').text(d=>`${d.source.name} → ${d.target.name}: ${d.value} certificates, ${pct(d.ok,d.value)}% approved`);
  svg.append('g').selectAll('rect').data(N).join('rect').attr('class','n')
    .attr('x',d=>d.x0-3).attr('y',d=>d.y0).attr('height',d=>Math.max(3,d.y1-d.y0)).attr('width',d=>d.x1-d.x0+6).attr('fill','#151618')
    .on('click',(e,d)=>toggle(d.c,d.v)).append('title').text(d=>`${d.name}: show only this`);
  svg.append('g').selectAll('text').data(N).join('text').style('cursor','pointer').on('click',(e,d)=>toggle(d.c,d.v))
    .attr('x',d=>d.x1>W-20?d.x0-8:d.x1+8).attr('y',d=>(d.y0+d.y1)/2).attr('dy','.35em').attr('text-anchor',d=>d.x1>W-20?'end':'start')
    .text(d=>`${d.name}  ${d.value}`).attr('fill','rgba(0,0,0,.75)');
}

function drawRanking(el,rows,c){
  const wilson=(k,n)=>{const z=1.96,p=k/n;return (p+z*z/(2*n)-z*Math.sqrt((p*(1-p)+z*z/(4*n))/n))/(1+z*z/n)};
  const agg={};rows.forEach(r=>{const a=agg[r[c]]=agg[r[c]]||[0,0];a[0]+=r[5];a[1]+=r[6]});
  const list=Object.entries(agg).sort((a,b)=>wilson(b[1][1],b[1][0])-wilson(a[1][1],a[1][0]));
  el.innerHTML=`<table class="perf"><thead><tr><th>#</th><th>${COLS[c]}</th><th class="num">Certificates</th><th class="num">Rejected</th><th class="num">Approval rate</th></tr></thead><tbody>${
    list.map(([name,[n,ok]],i)=>{const r=ok/n;return `<tr><td>${i+1}</td><td>${label(c,name)}${n<10?' <span class="few">few lots</span>':''}</td><td class="num">${n}</td><td class="num ${n-ok?'low':''}">${n-ok||'—'}</td><td class="num"><div class="rate"><div class="bar"><span style="width:${r*100}%;background:${band(r)}"></span></div>${Math.round(r*100)}%</div></td></tr>`}).join('')
  }</tbody></table>`;
}

render();
