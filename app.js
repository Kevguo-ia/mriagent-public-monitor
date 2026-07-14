const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
let state = null;

const labels = {pending:"等待",segmentation_partial:"部分分割",segmentation_complete:"分割完成",precompute_complete:"预计算完成",llm_complete:"LLM完成",report_complete:"报告完成",complete:"完成",error:"错误"};
const centreNames = {UKB:"UK Biobank",Kunming:"Kunming",Chengdu:"Chengdu",SCS:"SCS",YA:"YA"};
const workerNames = {kunming_segmentation_workers:"昆明既有缓存进程",full_cohort_segmentation_workers:"正式医院缓存进程",hospital_agent_workers:"医院完整 Agent",ukb_agent_workers:"UKB 完整 Agent"};

function fmt(value){return new Intl.NumberFormat("zh-CN").format(Number(value||0));}
function pct(value,total){return total?Math.min(100,Math.round(Number(value||0)/total*100)):0;}
function eta(hours){if(hours==null||!Number.isFinite(Number(hours))||hours<=0)return "待速度稳定后计算";if(hours<1)return `约 ${Math.max(1,Math.round(hours*60))} 分钟`;if(hours<48)return `约 ${hours.toFixed(1)} 小时`;return `约 ${(hours/24).toFixed(1)} 天`;}
function badge(value){const cls=value==="complete"||value==="report_complete"?"complete":value==="error"?"error":"";return `<span class="status ${cls}">${esc(labels[value]||value||"等待")}</span>`;}
function card(label,value,note,error=false){return `<article class="card ${error?"error":""}"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;}

function inferPhase(d){
  const total=d.total_studies||0,reports=d.reports_complete||0,seg=d.segmentation_complete||0;
  const agentWorkers=(d.processes?.hospital_agent_workers||0)+(d.processes?.ukb_agent_workers||0);
  if(total&&reports>=total)return {key:"final",title:"全部完成",value:reports,total,detail:"3,943例缓存、完整Agent与最终报告均已完成。"};
  if(reports>0||agentWorkers>0)return {key:"agent",title:"完整 Agent 运行中",value:reports,total,detail:`报告 ${fmt(reports)}/${fmt(total)} · ${eta(d.report_eta_hours)}`};
  if(total&&seg>=total)return {key:"qc",title:"缓存 QC / Smoke",value:seg,total,detail:"缓存已齐备，正在执行质量门禁与四中心完整流程smoke。"};
  return {key:"cache",title:"分割缓存生成中",value:seg,total,detail:`4CH与SAX均完成 ${fmt(seg)}/${fmt(total)} · ${eta(d.segmentation_eta_hours)}`};
}

function renderPipeline(active){
  const order=["cohort","cache","qc","smoke","agent","final"];
  const index=order.indexOf(active);
  document.querySelectorAll("#pipeline li").forEach((node,i)=>{node.classList.toggle("done",i<index);node.classList.toggle("active",i===index);});
}

function renderCentres(d){
  $("#center-rows").innerHTML=(d.centers||[]).map((c)=>{
    const total=c.total||0;
    const cacheComplete=(c.segmentation_complete||0)+(c.precompute_complete||0)+(c.llm_complete||0)+(c.report_complete||0);
    const cachePct=pct(cacheComplete,total), reportPct=pct(c.reports||0,total);
    return `<tr>
      <td><span class="centre">${esc(centreNames[c.center]||c.center)}</span></td><td>${fmt(total)}</td>
      <td>${fmt(c.cache_4ch)}/${fmt(total)}</td><td>${fmt(c.cache_sax)}/${fmt(total)}</td>
      <td class="metric-cell"><div class="metric-line"><span>4CH+SAX</span><b>${cachePct}%</b></div><div class="bar"><i style="width:${cachePct}%"></i></div></td>
      <td class="metric-cell"><div class="metric-line"><span>${fmt(c.reports)}/${fmt(total)}</span><b>${reportPct}%</b></div><div class="bar"><i style="width:${reportPct}%"></i></div></td>
      <td>${c.errors?`<span class="status error">${fmt(c.errors)}</span>`:`<span class="status complete">0</span>`}</td>
    </tr>`;
  }).join("");
}

function renderGpu(d){
  $("#gpu-grid").innerHTML=(d.gpus||[]).map((g)=>{
    const util=Number(g.utilization_pct||0), loaded=Number(g.memory_mib||0)>1000;
    const stateText=util>5?"计算中":loaded?"已加载":"数据准备";
    return `<div class="gpu"><div class="gpu-top"><strong>GPU ${esc(g.gpu)}</strong><span class="gpu-state ${util>5?"active":""}">${stateText}</span></div><div class="bar"><i style="width:${Math.min(100,util)}%"></i></div><div class="gpu-meta"><span>瞬时 ${util}%</span><span>${fmt(g.memory_mib)} MiB</span></div></div>`;
  }).join("");
  $("#worker-list").innerHTML=Object.entries(d.processes||{}).map(([key,value])=>`<div class="worker"><span>${esc(workerNames[key]||key.replaceAll("_"," "))}</span><b>${fmt(value)}</b></div>`).join("");
}

function renderCases(){
  if(!state)return;
  const query=$("#search").value.trim().toLowerCase();
  const matched=(state.cases||[]).filter((item)=>!query||String(item.study_uid).toLowerCase().includes(query));
  const rows=matched.slice(0,1000);
  $("#case-caption").textContent=`匹配 ${fmt(matched.length)} 条，当前显示 ${fmt(rows.length)} 条；仅含匿名ID。`;
  $("#case-rows").innerHTML=rows.map((item)=>`<tr><td><code>${esc(item.study_uid)}</code></td><td>${esc(centreNames[item.center]||item.center)}</td><td>${badge(item.seg_4ch)}</td><td>${badge(item.seg_sax)}</td><td>${badge(item.precompute)}</td><td>${badge(item.llm)}</td><td>${badge(item.report)}</td><td>${item.error_class?`<span class="status error">${esc(item.error_class)}</span>`:"—"}</td></tr>`).join("");
}

function render(d){
  state=d;
  const phase=inferPhase(d),phasePct=pct(phase.value,phase.total);
  $("#phase-badge").textContent=phase.title;
  $("#phase-title").textContent=phase.title;
  $("#phase-percent").textContent=`${phasePct}%`;
  $("#phase-progress").style.width=`${phasePct}%`;
  $("#phase-detail").textContent=phase.detail;
  renderPipeline(phase.key);
  $("#summary-cards").innerHTML=[
    card("独立检查",fmt(d.total_studies),"Kunming · Chengdu · SCS · UKB"),
    card("缓存完成",fmt(d.segmentation_complete),`${pct(d.segmentation_complete,d.total_studies)}% · 4CH + SAX`),
    card("最终报告",fmt(d.reports_complete),`${pct(d.reports_complete,d.total_studies)}% · 完整 Agent`),
    card("未解决错误",fmt(d.errors),d.errors?"需要人工审核":"当前无错误",Boolean(d.errors))
  ].join("");
  const updated=new Date(d.updated_at),age=Math.max(0,(Date.now()-updated.getTime())/1000),isPublic=location.hostname.endsWith("github.io");
  $("#updated-at").textContent=updated.toLocaleString("zh-CN",{hour12:false});
  $("#freshness").textContent=age<90?`${isPublic?"安全快照":"实时"} · ${Math.round(age)}秒前`:`${isPublic?"安全快照":"状态"}延迟 ${Math.round(age/60)}分钟`;
  $("#alert").classList.toggle("hidden",!d.stalled_advisory);
  $("#alert").textContent="连续5分钟未观察到病例级进展；系统只提示，不会自动终止或重试任务。";
  renderCentres(d);renderGpu(d);renderCases();
}

async function load(){
  try{const response=await fetch(`data/progress.json?t=${Date.now()}`,{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);render(await response.json());}
  catch(error){$("#freshness").textContent="状态连接失败";$("#alert").classList.remove("hidden");$("#alert").textContent="暂时无法读取安全状态快照，请稍后刷新。";}
}

$("#search").addEventListener("input",renderCases);
load();setInterval(load,15000);
