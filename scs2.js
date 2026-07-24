const $=(s)=>document.querySelector(s);
const fmt=(v)=>new Intl.NumberFormat("zh-CN").format(Number(v||0));
const pct=(v,t)=>t?Math.min(100,Math.round(100*Number(v||0)/Number(t))):0;
const esc=(v)=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

function trend(history){
  const svg=$("#trend"),pts=(history||[]).slice(-120),W=760,H=230,L=46,R=18,T=16,B=28;
  if(pts.length<2){svg.innerHTML='<text x="380" y="115" text-anchor="middle">等待连续快照</text>';return;}
  const first=Number(pts[0].timestamp),last=Number(pts.at(-1).timestamp)||first+1,max=Math.max(1,...pts.flatMap(p=>[Number(p.four_ch||0),Number(p.sax||0)]));
  const x=t=>L+(Number(t)-first)/Math.max(1,last-first)*(W-L-R),y=v=>H-B-Number(v)/max*(H-T-B);
  const line=k=>pts.map(p=>`${x(p.timestamp).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const grids=[0,.5,1].map(q=>`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(max*q)}" y2="${y(max*q)}"/><text x="${L-8}" y="${y(max*q)+4}" text-anchor="end">${fmt(Math.round(max*q))}</text>`).join("");
  svg.innerHTML=`${grids}<polyline class="four" points="${line("four_ch")}"/><polyline class="sax" points="${line("sax")}"/><text x="${L}" y="${H-5}">${new Date(first*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text><text x="${W-R}" y="${H-5}" text-anchor="end">${new Date(last*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text>`;
}

function render(d){
  const progress=d.progress||{},throughput=d.throughput||{},workers=d.workers||{},errors=Number(d.errors?.total||0),four=Number(progress.four_ch_completed||0),sax=Number(progress.sax_completed||0),tf=Number(progress.four_ch_target||0),ts=Number(progress.sax_target||0);
  $("#state").textContent=errors?"错误停机":({waiting:"等待",running:"全量运行",complete:"分割完成"}[d.state]||d.state||"等待");
  $("#state").classList.toggle("error",Boolean(errors));$("#updated").textContent=new Date(d.updated_at).toLocaleString("zh-CN",{hour12:false});
  $("#stage-detail").textContent=d.mode==="smoke"?"8例端到端输入与输出门禁":"SCS 第二批4CH与SAX独立版本缓存";
  $("#four-count").textContent=`${fmt(four)} / ${fmt(tf)}`;$("#sax-count").textContent=`${fmt(sax)} / ${fmt(ts)}`;
  $("#four-bar").style.width=`${pct(four,tf)}%`;$("#sax-bar").style.width=`${pct(sax,ts)}%`;
  $("#four-meta").textContent=`batch 256 · ${pct(four,tf)}%`;$("#sax-meta").textContent=`patch batch 32 · ${pct(sax,ts)}%`;
  const rate=Number(throughput.four_ch_per_hour||0)+Number(throughput.sax_per_hour||0),etas=[throughput.four_ch_eta_hours,throughput.sax_eta_hours].filter(v=>v!=null).map(Number);
  $("#rate").textContent=rate?`${rate.toFixed(1)} 例/小时`:"校准中";$("#eta").textContent=etas.length?`ETA ${Math.max(...etas).toFixed(1)} 小时`:"等待稳定窗口";$("#errors").textContent=fmt(errors);
  $("#workers").textContent=`${fmt(workers.active||0)} / 7 分片在线`;
  $("#contracts").innerHTML=[["4CH模型","V3 · SHA256已锁定"],["SAX模型","nnUNet fold 0 · SHA256已锁定"],["输入","原始DICOM · 已分类序列"],["API调用",fmt(d.api_calls||0)]].map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("");
  $("#gpus").innerHTML=(d.gpus||[]).map(g=>`<div class="gpu ${g.assignment!=="external_or_idle"?"active":""}"><strong>GPU ${esc(g.gpu)}</strong><span>${esc(g.assignment||"保留")}</span><small>${fmt(g.memory_used_mib)} MiB · ${fmt(g.utilization_pct)}%</small></div>`).join("");trend(d.history||[]);
}
async function load(){try{const r=await fetch(`data/scs2_progress.json?t=${Date.now()}`,{cache:"no-store"});if(!r.ok)throw Error(r.status);render(await r.json());}catch(e){$("#state").textContent="状态未连接";$("#stage-detail").textContent="尚未生成安全快照或同步暂时延迟";}}
load();setInterval(load,15000);
