const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
const centreNames = {UKB:"UK Biobank",Kunming:"Kunming",Chengdu:"Chengdu",SCS:"SCS",YA:"YA"};
const workerNames = {hospital_agent_workers:"医院 Agent workers",ukb_agent_workers:"UKB Agent workers",active_codex_calls:"活跃 Codex 调用",formal_supervisor_alive:"正式主管"};

function fmt(value){return new Intl.NumberFormat("zh-CN").format(Number(value||0));}
function pct(value,total){return total?Math.min(100,Math.round(Number(value||0)/Number(total)*100)):0;}
function eta(hours){
  const value=Number(hours);
  if(!Number.isFinite(value)||value<=0)return "待速度稳定";
  if(value<1)return `约 ${Math.max(1,Math.round(value*60))} 分钟`;
  if(value<48)return `约 ${value.toFixed(1)} 小时`;
  return `约 ${(value/24).toFixed(1)} 天`;
}
function card(label,value,note,error=false){return `<article class="card ${error?"error":""}"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;}
function miniProgress(value,total,label){const percent=pct(value,total);return `<div class="mini-progress"><div><span>${esc(label)}</span><b>${fmt(value)}/${fmt(total)}</b></div><div class="bar"><i style="width:${percent}%"></i></div></div>`;}

function inferPhase(d){
  const total=Number(d.total_studies||0),reports=Number(d.reports_complete||0),pre=Number(d.precompute_complete||0),seg=Number(d.segmentation_complete||0);
  const workflow=d.workflow||{};
  if(total&&reports>=total)return {key:"final",title:"全部完成",value:reports,total,detail:"全部缓存、中间产物、最终报告及模型溯源已通过QC。"};
  if(workflow.stage==="agent_qc")return {key:"final",title:"最终质量审计",value:reports,total,detail:`报告 ${fmt(reports)}/${fmt(total)} · 正在执行完整性与模型溯源门禁`};
  if(reports>0||pre>0)return {key:"agent",title:"完整 Agent 运行中",value:reports,total,detail:`报告 ${fmt(reports)}/${fmt(total)} · ${eta(d.report_eta_hours)} · 不自动重试`};
  if(total&&seg>=total)return {key:"precompute",title:"测量与LGE准备",value:pre,total,detail:"分割缓存已齐备，正在生成测量、LGE和证据中间产物。"};
  return {key:"cache",title:"分割缓存生成中",value:seg,total,detail:`4CH与SAX均完成 ${fmt(seg)}/${fmt(total)}`};
}

function renderPipeline(active){
  const order=["cohort","cache","smoke","precompute","agent","final"],index=order.indexOf(active);
  document.querySelectorAll("#pipeline li").forEach((node,i)=>{node.classList.toggle("done",i<index);node.classList.toggle("active",i===index);});
}

function renderCentres(d){
  $("#center-rows").innerHTML=(d.centers||[]).filter((c)=>Number(c.total||0)>0).map((c)=>{
    const total=Number(c.total||0),cache=Math.min(Number(c.cache_4ch||0),Number(c.cache_sax||0));
    const lgeTotal=Number(c.lge_total||0),lgeComplete=Number(c.lge_complete||0);
    return `<tr>
      <td><span class="centre">${esc(centreNames[c.center]||c.center)}</span></td><td>${fmt(total)}</td>
      <td>${miniProgress(cache,total,"4CH+SAX")}</td>
      <td>${miniProgress(c.precompute||0,total,"metrics")}</td>
      <td>${miniProgress(c.llm||0,total,"evidence")}</td>
      <td>${lgeTotal?miniProgress(lgeComplete,lgeTotal,"gpt-5.5"):"<span class=\"muted-cell\">无LGE队列</span>"}</td>
      <td>${miniProgress(c.reports||0,total,"JSON+MD")}</td>
      <td>${c.errors?`<span class="status error">${fmt(c.errors)}</span>`:`<span class="status complete">0</span>`}</td>
    </tr>`;
  }).join("");
}

function renderArtifacts(d){
  const a=d.artifacts||{},total=Number(d.total_studies||0);
  const items=[
    ["测量汇总",a.metrics||0,total,"metrics"],
    ["结构化证据",a.evidence||0,total,"evidence"],
    ["推理计划",a.plan||0,total,"plan"],
    ["报告 JSON",a.report_json||0,total,"report.json"],
    ["报告 Markdown",a.report_md||0,total,"report.md"],
    ["模型溯源",a.model_verified||0,total,"gpt-5.5"],
  ];
  $("#artifact-grid").innerHTML=items.map(([label,value,target,note])=>`<div class="artifact"><span>${esc(label)}</span><strong>${fmt(value)}</strong><small>${esc(note)} · ${pct(value,target)}%</small><div class="bar"><i style="width:${pct(value,target)}%"></i></div></div>`).join("");
}

function renderWorkers(d){
  const model=d.model||{};
  $("#model-summary").innerHTML=`<div><span>模型</span><b>${esc(model.name||"—")}</b></div><div><span>接口</span><b>${esc(model.api||"—")}</b></div><div><span>推理强度</span><b>${esc(model.reasoning_effort||"—")}</b></div>`;
  $("#worker-list").innerHTML=Object.entries(d.processes||{}).map(([key,value])=>{
    const shown=typeof value==="boolean"?(value?"在线":"离线"):fmt(value);
    const cls=(typeof value==="boolean"&&!value)?"worker-off":"";
    return `<div class="worker ${cls}"><span>${esc(workerNames[key]||key.replaceAll("_"," "))}</span><b>${esc(shown)}</b></div>`;
  }).join("");
}

function renderGpu(d){
  $("#gpu-grid").innerHTML=(d.gpus||[]).map((g)=>{
    const util=Number(g.utilization_pct||0),loaded=Number(g.memory_mib||0)>500;
    const stateText=util>5?"计算中":loaded?"已加载":"空闲";
    return `<div class="gpu"><div class="gpu-top"><strong>GPU ${esc(g.gpu)}</strong><span class="gpu-state ${util>5?"active":""}">${stateText}</span></div><div class="bar"><i style="width:${Math.min(100,util)}%"></i></div><div class="gpu-meta"><span>瞬时 ${util}%</span><span>${fmt(g.memory_mib)} MiB</span></div></div>`;
  }).join("");
}

function renderTrend(d){
  const svg=$("#trend-chart"),history=(d.report_history||[]).slice(-60);
  $("#rate-value").textContent=`${Number(d.report_rate_per_hour||0).toFixed(1)} 例/小时`;
  $("#trend-caption").textContent=`累计 ${fmt(d.reports_complete)} 份报告 · 预计剩余 ${eta(d.report_eta_hours)}`;
  if(history.length<2){svg.innerHTML='<text x="500" y="115" text-anchor="middle" class="chart-empty">等待更多进度点</text>';return;}
  const width=1000,height=220,padX=48,padY=28;
  const first=history[0].timestamp,last=history[history.length-1].timestamp||first+1;
  const values=history.map((p)=>Number(p.reports||0)),min=Math.min(...values),max=Math.max(...values),span=Math.max(1,max-min);
  const x=(t)=>padX+(Number(t)-first)/Math.max(1,last-first)*(width-padX*2);
  const y=(v)=>height-padY-(Number(v)-min)/span*(height-padY*2);
  const points=history.map((p)=>`${x(p.timestamp).toFixed(1)},${y(p.reports).toFixed(1)}`).join(" ");
  const area=`${padX},${height-padY} ${points} ${width-padX},${height-padY}`;
  svg.innerHTML=`
    <line x1="${padX}" y1="${padY}" x2="${padX}" y2="${height-padY}" class="chart-axis"/>
    <line x1="${padX}" y1="${height-padY}" x2="${width-padX}" y2="${height-padY}" class="chart-axis"/>
    <polygon points="${area}" class="chart-area"/><polyline points="${points}" class="chart-line"/>
    <circle cx="${x(last)}" cy="${y(values[values.length-1])}" r="6" class="chart-point"/>
    <text x="${padX}" y="18" class="chart-label">${fmt(max)}</text>
    <text x="${padX}" y="${height-6}" class="chart-label">${new Date(first*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text>
    <text x="${width-padX}" y="${height-6}" text-anchor="end" class="chart-label">${new Date(last*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text>`;
}

function render(d){
  const phase=inferPhase(d),phasePct=pct(phase.value,phase.total);
  $("#phase-badge").textContent=phase.title;$("#phase-title").textContent=phase.title;$("#phase-percent").textContent=`${phasePct}%`;
  $("#phase-progress").style.width=`${phasePct}%`;$("#phase-detail").textContent=phase.detail;renderPipeline(phase.key);
  $("#summary-cards").innerHTML=[
    card("正式队列",fmt(d.total_studies),"四中心 + UK Biobank"),
    card("最终报告",`${fmt(d.reports_complete)} / ${fmt(d.total_studies)}`,`${pct(d.reports_complete,d.total_studies)}% · JSON + Markdown`),
    card("当前速度",`${Number(d.report_rate_per_hour||0).toFixed(1)} 例/小时`,eta(d.report_eta_hours)),
    card("未解决错误",fmt(d.errors),d.errors?"需要人工审核":"当前为0",Boolean(d.errors)),
  ].join("");
  const updated=new Date(d.updated_at),age=Math.max(0,(Date.now()-updated.getTime())/1000),isPublic=location.hostname.endsWith("github.io");
  $("#updated-at").textContent=updated.toLocaleString("zh-CN",{hour12:false});
  $("#freshness").textContent=age<120?`${isPublic?"安全快照":"实时"} · ${Math.round(age)}秒前`:`${isPublic?"安全快照":"状态"}延迟 ${Math.round(age/60)}分钟`;
  const workflowFailed=(d.workflow||{}).state==="failed";
  $("#alert").classList.toggle("hidden",!d.stalled_advisory&&!workflowFailed);
  $("#alert").textContent=workflowFailed?"正式流程报告失败状态，请查看服务器私有日志。":"连续5分钟未观察到报告级进展；系统只提示，不会自动终止或重试。";
  renderTrend(d);renderCentres(d);renderArtifacts(d);renderWorkers(d);renderGpu(d);
}

async function load(){
  try{
    const response=await fetch(`data/progress.json?t=${Date.now()}`,{cache:"no-store"});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(data.schema_version!=="monitor_safe_v2")throw new Error("等待新版安全快照");
    render(data);
  }catch(error){
    $("#freshness").textContent="状态连接中";$("#alert").classList.remove("hidden");
    $("#alert").textContent="新版聚合状态正在同步，请稍后自动刷新。";
  }
}

load();setInterval(load,15000);
