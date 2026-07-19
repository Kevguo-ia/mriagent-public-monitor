const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));
let state = null;
let yaState = null;

const labels = {pending:"等待",segmentation_partial:"部分分割",segmentation_complete:"分割完成",precompute_complete:"预计算完成",llm_complete:"LLM完成",report_complete:"报告完成",complete:"完成",error:"错误"};
const centreNames = {UKB:"UK Biobank",Kunming:"Kunming",Chengdu:"Chengdu",SCS:"SCS",YA:"YA"};
const workerNames = {kunming_segmentation_workers:"昆明既有缓存进程",full_cohort_segmentation_workers:"正式医院缓存进程",hospital_agent_workers:"医院完整 Agent",ukb_agent_workers:"UKB 完整 Agent"};
const yaStages=["waiting_upload","verify_archives","extract","inventory_qc","cache_smoke","cache_full","cache_qc","agent_smoke","agent_full","final_qc","complete"];
const yaStageNames={waiting_upload:"等待上传",verify_archives:"归档校验",extract:"安全解压",inventory_qc:"数据质量检查",cache_smoke:"缓存Smoke",cache_full:"全量缓存",cache_qc:"缓存QC",agent_smoke:"Agent Smoke",agent_full:"全量Agent",final_qc:"最终QC",complete:"完成"};

function fmt(value){return new Intl.NumberFormat("zh-CN").format(Number(value||0));}
function pct(value,total){return total?Math.min(100,Math.round(Number(value||0)/total*100)):0;}
function eta(hours){if(hours==null||!Number.isFinite(Number(hours))||hours<=0)return "待速度稳定后计算";if(hours<1)return `约 ${Math.max(1,Math.round(hours*60))} 分钟`;if(hours<48)return `约 ${hours.toFixed(1)} 小时`;return `约 ${(hours/24).toFixed(1)} 天`;}
function card(label,value,note,error=false){return `<article class="card ${error?"error":""}"><span class="label">${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;}

function inferPhase(d){
  const total=d.total_studies||0,reports=d.reports_complete||0,seg=d.segmentation_complete||0;
  const agentWorkers=(d.processes?.hospital_agent_workers||0)+(d.processes?.ukb_agent_workers||0);
  if(total&&reports>=total)return {key:"final",title:"全部完成",value:reports,total,detail:"3,906例缓存、完整Agent与最终报告均已完成。"};
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
  renderCentres(d);renderGpu(d);
}

function renderYa(d){
  yaState=d;
  const stage=d.stage||"waiting_upload",stageIndex=Math.max(0,yaStages.indexOf(stage));
  const counts=d.counts||{},upload=d.upload||{},rates=d.rates||{},workers=d.workers||{};
  document.querySelector(".ya-panel").classList.toggle("failed",d.state==="failed");
  $("#ya-state").textContent=d.state==="failed"?"失败停机":(yaStageNames[stage]||stage);
  document.querySelectorAll("#ya-pipeline li").forEach((node,index)=>{
    node.classList.toggle("done",index<stageIndex||stage==="complete");
    node.classList.toggle("active",index===stageIndex&&stage!=="complete");
  });
  const eligible=counts.cache_valid||counts.eligible||0;
  const cacheComplete=Math.min(counts.cache_4ch||0,counts.cache_sax||0);
  const reports=counts.reports||0,errors=(counts.agent_errors||0)+(counts.report_errors||0);
  $("#ya-cards").innerHTML=[
    card("上传归档",`${fmt(upload.archives_ready)}/${fmt(upload.archives_expected||3)}`,`${fmt(upload.partial_files)} 个临时文件 · 稳定检查 ${fmt(upload.stable_observations)}/2`),
    card("Agent合格检查",fmt(eligible),counts.raw_cases?`库存 ${fmt(counts.raw_cases)} · 技术无效 ${fmt(counts.technical_invalid||0)}`:"等待数据QC"),
    card("4CH + SAX缓存",fmt(cacheComplete),rates.cache_per_hour?`${fmt(rates.cache_per_hour)}/小时`:"速度尚未稳定"),
    card("最终报告",fmt(reports),rates.report_eta_hours?`${fmt(rates.reports_per_hour)}/小时 · ${eta(rates.report_eta_hours)}`:"速度尚未稳定",Boolean(errors)),
  ].join("");
  $("#ya-detail").textContent=d.state==="failed"?"流水线已安全停机，不会自动重试。":
    `${yaStageNames[stage]||stage} · 缓存worker ${fmt(workers.cache_workers||0)} · Agent worker ${fmt(workers.agent_workers||0)} · 错误 ${fmt(errors)}`;
  $("#ya-models").textContent=`${d.models?.text||"deepseek-chat"} 文本 · ${d.models?.image||"[j]gpt-5.4"} ${d.models?.image_reasoning_effort||"medium"} 图像`;
  $("#ya-updated").textContent=`更新时间 ${new Date(d.updated_at).toLocaleString("zh-CN",{hour12:false})}`;
}

async function load(){
  try{const response=await fetch(`data/progress.json?t=${Date.now()}`,{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);render(await response.json());}
  catch(error){$("#freshness").textContent="状态连接失败";$("#alert").classList.remove("hidden");$("#alert").textContent="暂时无法读取安全状态快照，请稍后刷新。";}
}

async function loadYa(){
  try{const response=await fetch(`data/ya_progress.json?t=${Date.now()}`,{cache:"no-store"});if(!response.ok)throw new Error(`HTTP ${response.status}`);renderYa(await response.json());}
  catch(error){$("#ya-state").textContent="状态未连接";$("#ya-detail").textContent="YA安全状态快照尚未生成或暂时不可用。";}
}

load();loadYa();setInterval(load,15000);setInterval(loadYa,15000);
