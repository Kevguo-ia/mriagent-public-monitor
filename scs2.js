const $ = (selector) => document.querySelector(selector);
const fmt = (value) => new Intl.NumberFormat("zh-CN").format(Number(value || 0));
const pct = (value, total) => total ? Math.min(100, 100 * Number(value || 0) / Number(total)) : 0;
const esc = (value) => String(value ?? "—").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

function statusText(data) {
  if (data.errors?.active) return "错误停机";
  const map = {
    waiting: "等待", running: "后台运行", starting: "正在启动", complete: "全部完成",
    scs2_remaining_preflight: "重建预检", scs2_audit: "SCS_2审计", scs2_complete: "SCS_2完成",
    ukb_prepare: "UKB准备", ukb_sax: "UKB续跑", ukb_audit: "UKB审计", all_complete: "全部完成"
  };
  return map[data.stage] || map[data.state] || data.stage || data.state || "等待";
}

function pipeline(data) {
  const cohort = data.cohort || {};
  const candidates = Number(cohort.paired_candidates || 0);
  const exact = Number(cohort.sax_exact_geometry_eligible || 0);
  const target = Number(cohort.sax_final_eligible || exact);
  const completed = Number(cohort.sax_completed || 0);
  const steps = [
    ["双序列候选", candidates, candidates, "4CH与SAX同时存在"],
    ["精确DICOM网格", exact, candidates, "层数、时相、方向、位置"],
    ["实际重建合格", target, candidates, "逐时相层面一致"],
    ["SAX缓存完成", completed, target, "正式模型 · batch 32"],
    ["严格审计", data.stage === "all_complete" || String(data.stage).includes("ukb") ? target : completed, target, "可读性、形状、仿射、标签"]
  ];
  $("#pipeline").innerHTML = steps.map(([label, value, total, note], index) => {
    const progress = pct(value, total);
    return `<div class="step ${value >= total && total ? "done" : ""}">
      <div class="step-index">${index + 1}</div>
      <div class="step-copy"><span>${esc(label)}</span><strong>${fmt(value)}${total ? ` / ${fmt(total)}` : ""}</strong><small>${esc(note)}</small></div>
      <div class="mini-bar"><i style="width:${progress.toFixed(1)}%"></i></div>
    </div>`;
  }).join("");
}

function trend(history, target) {
  const svg = $("#trend");
  const points = (history || []).slice(-120).filter((point) => Number.isFinite(Number(point.sax)));
  const W = 760, H = 250, L = 54, R = 24, T = 22, B = 36;
  if (points.length < 2) {
    svg.innerHTML = '<text class="empty" x="380" y="126" text-anchor="middle">等待连续快照</text>';
    return;
  }
  const first = Number(points[0].timestamp), last = Number(points.at(-1).timestamp) || first + 1;
  const ceiling = Math.max(1, Number(target || 0), ...points.map((point) => Number(point.sax || 0)));
  const x = (time) => L + (Number(time) - first) / Math.max(1, last - first) * (W - L - R);
  const y = (value) => H - B - Number(value) / ceiling * (H - T - B);
  const grids = [0, .25, .5, .75, 1].map((part) => `<line class="grid" x1="${L}" x2="${W-R}" y1="${y(ceiling*part)}" y2="${y(ceiling*part)}"/><text x="${L-9}" y="${y(ceiling*part)+4}" text-anchor="end">${fmt(Math.round(ceiling*part))}</text>`).join("");
  const line = points.map((point) => `${x(point.timestamp).toFixed(1)},${y(point.sax).toFixed(1)}`).join(" ");
  svg.innerHTML = `${grids}<line class="target" x1="${L}" x2="${W-R}" y1="${y(ceiling)}" y2="${y(ceiling)}"/><polyline class="sax-line" points="${line}"/><circle class="last-point" cx="${x(last)}" cy="${y(points.at(-1).sax)}" r="5"/><text class="last-label" x="${x(last)-9}" y="${y(points.at(-1).sax)-10}" text-anchor="end">${fmt(points.at(-1).sax)}</text><text x="${L}" y="${H-7}">${new Date(first*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text><text x="${W-R}" y="${H-7}" text-anchor="end">${new Date(last*1000).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</text>`;
}

function render(data) {
  const cohort = data.cohort || {}, exclusions = data.exclusions || {}, workers = data.workers || {}, throughput = data.throughput || {};
  const candidates = Number(cohort.paired_candidates || 0), four = Number(cohort.four_ch_completed || 0), target = Number(cohort.sax_final_eligible || 0), sax = Number(cohort.sax_completed || 0), paired = Number(cohort.paired_completed || sax);
  const state = $("#state");
  state.textContent = statusText(data);
  state.classList.toggle("error", Boolean(data.errors?.active));
  $("#updated").textContent = data.updated_at ? new Date(data.updated_at).toLocaleString("zh-CN", {hour12:false}) : "—";
  $("#candidate-count").textContent = fmt(candidates);
  $("#four-count").textContent = `${fmt(four)} / ${fmt(candidates)}`;
  $("#four-meta").textContent = `batch 128 · ${pct(four,candidates).toFixed(1)}%`;
  $("#sax-count").textContent = `${fmt(sax)} / ${fmt(target)}`;
  $("#sax-meta").textContent = `patch batch 32 · ${pct(sax,target).toFixed(1)}%`;
  $("#paired-count").textContent = fmt(paired);
  $("#paired-meta").textContent = `占候选 ${pct(paired,candidates).toFixed(1)}%`;
  $("#rate").textContent = throughput.sax_per_hour ? `${Number(throughput.sax_per_hour).toFixed(1)} 例/小时` : "校准中";
  $("#eta").textContent = throughput.eta_hours != null ? `ETA ${Number(throughput.eta_hours).toFixed(1)} 小时` : "等待稳定窗口";
  $("#next-stage").textContent = `下一阶段：${data.next_stage || "—"}`;
  $("#exclusion-note").innerHTML = `<span>静态层×时相门禁排除 <b>${fmt(exclusions.coarse_slice_phase_gate)}</b></span><span>精确DICOM几何排除 <b>${fmt(exclusions.exact_dicom_geometry_gate)}</b></span><span>实际重建排除 <b>${fmt(exclusions.reconstruction_gate)}</b></span><span>累计排除 <b>${fmt(exclusions.total)}</b></span>`;
  $("#workers").textContent = `${fmt(workers.active)} / ${fmt(workers.expected || 7)} 分片在线`;
  $("#contracts").innerHTML = [
    ["病例口径", "仅双序列配对"], ["4CH", "正式V3 · batch 128"], ["SAX", "正式nnUNet · batch 32"],
    ["SAX patch", (data.contracts?.sax_patch_size || [20,256,224]).join(" × ")], ["自动重试", data.contracts?.automatic_retry ? "开启" : "关闭"],
    ["API调用", fmt(data.api_calls || 0)], ["历史结果覆盖", data.contracts?.old_results_overwritten ? "是" : "否"]
  ].map(([key,value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("");
  $("#gpus").innerHTML = (data.gpus || []).map((gpu) => `<div class="gpu ${gpu.assigned ? "active" : ""}"><div><strong>GPU ${esc(gpu.gpu)}</strong><span>${gpu.assigned ? esc(gpu.assignment) : "空闲/外部"}</span></div><div class="gpu-bar"><i style="width:${Math.min(100,100*Number(gpu.memory_used_mib||0)/Math.max(1,Number(gpu.memory_used_mib||0)+Number(gpu.memory_free_mib||0))).toFixed(1)}%"></i></div><small>${fmt(gpu.memory_used_mib)} MiB · 利用率 ${fmt(gpu.utilization_pct)}%</small></div>`).join("") || '<p class="quiet">等待GPU快照</p>';
  pipeline(data);
  trend(data.history || [], target);
}

async function load() {
  try {
    const response = await fetch(`data/scs2_progress.json?t=${Date.now()}`, {cache:"no-store"});
    if (!response.ok) throw new Error(String(response.status));
    render(await response.json());
  } catch (error) {
    $("#state").textContent = "快照未连接";
  }
}

load();
setInterval(load, 15000);
