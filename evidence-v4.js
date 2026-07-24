const DATA_URL = "data/evidence_v4_progress.json";
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n || 0).toLocaleString("zh-CN");
const pct = (n, d) => d ? Math.min(100, Math.max(0, n / d * 100)) : 0;
const stageMap = {
  prepared: ["队列已准备", 0], preflight_running: ["全量离线预检", 1],
  smoke_running: ["10例真实API Smoke", 2], blocked_smoke: ["Smoke已阻断", 2],
  blocked_smoke_audit: ["Smoke审计阻断", 2], full_running: ["全量生成中", 3],
  blocked_full: ["全量已阻断", 3], blocked_final_audit: ["最终审计阻断", 4],
  complete: ["全部完成", 5]
};
const centerNames = {UKB:"UK Biobank",Kunming:"昆明",Chengdu:"成都",SCS:"SCS"};

function metricCell(value, total){const p=pct(value,total);return `<td class="metric"><div><span>${fmt(value)}</span><b>${p.toFixed(1)}%</b></div><span class="mini"><i style="width:${p}%"></i></span></td>`}
function render(data){
  const stage=stageMap[data.stage]||[data.stage||"准备中",0];
  $("stage-name").textContent=stage[0]; $("updated-at").textContent=new Date(data.updated_at).toLocaleString("zh-CN",{hour12:false});
  $("freshness").textContent="实时"; $("state-badge").textContent=stage[0];
  const blocked=String(data.stage).startsWith("blocked"); $("state-badge").classList.toggle("bad",blocked);
  document.querySelectorAll("#pipeline li").forEach((li,i)=>{li.classList.toggle("done",i<stage[1]);li.classList.toggle("active",i===stage[1]&&stage[1]<5)});
  const progress=pct(data.report_complete,data.eligible); $("progress-copy").textContent=`报告 ${fmt(data.report_complete)} / ${fmt(data.eligible)}`;
  $("progress-percent").textContent=`${progress.toFixed(1)}%`; $("progress-bar").style.width=`${progress}%`;
  const cards=[
    ["正式队列",data.total,`可生成 ${fmt(data.eligible)}`], ["Graph完成",data.graph_complete,`${pct(data.graph_complete,data.eligible).toFixed(1)}%`],
    ["Evidence完成",data.evidence_complete,`${pct(data.evidence_complete,data.eligible).toFixed(1)}%`], ["Report完成",data.report_complete,`${pct(data.report_complete,data.eligible).toFixed(1)}%`],
    ["运行错误",data.errors,"失败不自动重试","error"]
  ];
  $("kpis").innerHTML=cards.map(x=>`<article class="kpi ${x[3]||""}"><span>${x[0]}</span><strong>${fmt(x[1])}</strong><small>${x[2]}</small></article>`).join("");
  $("graph-count").textContent=fmt(data.graph_complete); $("evidence-count").textContent=fmt(data.evidence_complete);
  $("decision-count").textContent=fmt((data.released||0)+(data.withheld||0)); $("released-copy").textContent=fmt(data.released);
  $("withheld-copy").textContent=fmt(data.withheld); $("released-bar").style.width=`${pct(data.released,data.eligible)}%`; $("withheld-bar").style.width=`${pct(data.withheld,data.eligible)}%`;
  $("text-route").textContent=data.text_route; $("retry-state").textContent=data.automatic_retry?"开启":"关闭"; $("workers").textContent=fmt(data.active_workers);
  $("api-calls").textContent=fmt(data.api_calls); $("errors").textContent=fmt(data.errors);
  $("center-rows").innerHTML=Object.entries(data.centers||{}).map(([name,c])=>`<tr><td class="centre">${centerNames[name]||name}</td><td>${fmt(c.eligible)} / ${fmt(c.total)}</td>${metricCell(c.graph,c.eligible)}${metricCell(c.evidence,c.eligible)}${metricCell(c.report,c.eligible)}<td>${fmt((c.released||0)+(c.withheld||0))}</td><td>${fmt(c.errors)}</td></tr>`).join("");
}
async function refresh(){try{const response=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:"no-store"});if(!response.ok)throw new Error("status");render(await response.json())}catch(error){$("freshness").textContent="连接失败";$("state-badge").textContent="数据不可用";$("state-badge").classList.add("bad")}}
refresh(); setInterval(refresh,15000);
