const DATA_URL="data/cached_reports_progress.json";
const $=id=>document.getElementById(id);
const fmt=n=>Number(n||0).toLocaleString("zh-CN");
const pct=(n,d)=>d?Math.max(0,Math.min(100,Number(n||0)/Number(d)*100)):0;
const labels={UKB_15000:["UKB 15,000","UK BIOBANK"],SCS_2:["四川省第二批","SCS · BATCH 2"]};

function cohortCard(name,c){
  const p=pct(c.completed,c.total);
  const label=labels[name]||[name,"COHORT"];
  return `<article class="cohort">
    <div class="cohort-head"><div><span class="tag">${label[1]}</span><h2>${label[0]}</h2></div><strong class="percent">${p.toFixed(2)}%</strong></div>
    <div class="track" aria-label="${label[0]}完成率"><i style="width:${p}%"></i></div>
    <div class="cohort-stats">
      <span>已处理<b>${fmt(c.completed)} / ${fmt(c.total)}</b></span>
      <span>成功报告<b>${fmt(c.ok)}</b></span>
      <span>错误<b>${fmt(c.errors)}</b></span>
    </div>
    <div class="cohort-meta"><span>${fmt(c.active_workers)} 个Worker</span><span>${fmt(c.api_calls)} 次API</span><span>${fmt(c.withheld)} 安全暂缓</span></div>
  </article>`;
}

function render(data){
  const cohorts=Object.entries(data.cohorts||{});
  const sums=key=>cohorts.reduce((acc,[,c])=>acc+Number(c[key]||0),0);
  const total=sums("total"),completed=sums("completed"),ok=sums("ok"),errors=sums("errors"),api=sums("api_calls");
  const overall=pct(completed,total);
  $("total").textContent=fmt(total);$("completed").textContent=fmt(completed);$("ok").textContent=fmt(ok);$("errors").textContent=fmt(errors);
  $("completed-note").textContent=`${overall.toFixed(2)}% · 剩余 ${fmt(Math.max(0,total-completed))}`;
  $("overall-percent").textContent=`${overall.toFixed(2)}%`;$("overall-bar").style.width=`${overall}%`;
  $("cohorts").innerHTML=cohorts.map(([name,c])=>cohortCard(name,c)).join("");
  $("workers").textContent=fmt(data.active_workers);$("api").textContent=fmt(api);$("retry").textContent=data.automatic_retry?"开启":"关闭";
  const complete=data.stage==="complete";$("stage").textContent=complete?"全部完成":"全量报告生成中";
  const updated=new Date(data.updated_at);$("updated").textContent=updated.toLocaleString("zh-CN",{hour12:false});
  $("connection").textContent="实时";$("footer-state").textContent=`最后同步 ${updated.toLocaleTimeString("zh-CN",{hour12:false})}`;
}

async function refresh(){
  try{const response=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:"no-store"});if(!response.ok)throw new Error("status");render(await response.json())}
  catch(error){$("connection").textContent="连接失败";$("footer-state").textContent="等待下一次同步"}
}
refresh();setInterval(refresh,15000);
