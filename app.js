const cfg = window.DELPHI_CONFIG || {};
let dataset = null;
let currentProcedure = null;
let state = { consultantId: "", startedAt: null, procedures: {} };

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem(cfg.autosaveKey || "ir-consent-review", JSON.stringify(state));
const load = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(cfg.autosaveKey || "ir-consent-review"));
    if (saved) state = saved;
  } catch (e) {}
};

const pState = proc => {
  if (!state.procedures[proc]) {
    state.procedures[proc] = {
      experience: "",
      answers: {},
      additionalRisks: [],
      submitted: false,
      submittedAt: null
    };
  }
  if (!Array.isArray(state.procedures[proc].additionalRisks)) state.procedures[proc].additionalRisks = [];
  return state.procedures[proc];
};

const answerFor = (proc, id) => pState(proc).answers[id] || { score: "", frequency: "", comment: "" };
const procItems = proc => dataset.items.filter(item => item.procedure === proc);
const localCoreFor = proc => (dataset.local_core_by_procedure && dataset.local_core_by_procedure[proc]) || [];

async function init() {
  dataset = await (await fetch("data.json", { cache: "no-store" })).json();
  load();
  if (state.consultantId) {
    $("consultantId").value = state.consultantId;
    setConsultantChip();
  }

  $("startBtn").onclick = start;
  $("introGuideBtn").onclick = openGuide;
  $("backDashboardBtn").onclick = showDashboard;
  $("saveBackBtn").onclick = () => { save(); showDashboard(); };
  $("reviewProcedureBtn").onclick = showReview;
  $("backSurveyBtn").onclick = () => { hideAll(); $("survey").classList.remove("hidden"); setPageLabel("Procedure review"); };
  $("submitProcedureBtn").onclick = submitProcedure;
  $("exportBtn").onclick = exportBackup;
  $("exportBtnTop").onclick = exportBackup;
  $("addRiskBtn").onclick = addAdditionalRisk;
  $("submittedBackBtn").onclick = showDashboard;

  $("navProcedures").onclick = () => state.consultantId ? showDashboard() : $("consultantId").focus();
  $("navGuide").onclick = openGuide;
  $("navBackup").onclick = exportBackup;
  $("floatingGuideBtn").onclick = openGuide;
  $("closeGuideBtn").onclick = closeGuide;
  $("guideBackdrop").onclick = closeGuide;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeGuide(); });

  renderGuide();
}

function start() {
  const cid = $("consultantId").value.trim();
  if (cfg.requireConsultantId && !cid) {
    alert("Enter your consultant ID.");
    return;
  }
  state.consultantId = cid || "anonymous";
  state.startedAt = state.startedAt || new Date().toISOString();
  save();
  setConsultantChip();
  showDashboard();
}

function setConsultantChip() {
  const chip = $("topbarConsultant");
  if (!state.consultantId) {
    chip.classList.add("hidden");
    return;
  }
  chip.textContent = `Consultant ${state.consultantId}`;
  chip.classList.remove("hidden");
}

function setPageLabel(text) {
  $("topbarPage").textContent = text;
}

function hideAll() {
  ["intro", "dashboard", "survey", "review", "submitted"].forEach(id => $(id).classList.add("hidden"));
}

function showDashboard() {
  hideAll();
  $("dashboard").classList.remove("hidden");
  setPageLabel("Procedures");
  renderDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function procStatus(proc) {
  const ps = pState(proc);
  const items = procItems(proc);
  const scored = items.filter(item => answerFor(proc, item.id).score !== "").length;
  if (ps.submitted) return { label: "Submitted", cls: "submitted", scored, total: items.length };
  if (scored === 0) return { label: "Not started", cls: "not-started", scored, total: items.length };
  if (scored === items.length) return { label: "Complete", cls: "complete", scored, total: items.length };
  return { label: "In progress", cls: "in-progress", scored, total: items.length };
}

function renderDashboard() {
  const wrap = $("procedureCards");
  wrap.innerHTML = "";
  dataset.procedures.forEach(proc => {
    const st = procStatus(proc);
    const coreCount = localCoreFor(proc).length;
    const div = document.createElement("article");
    div.className = "panel procedure-card";
    div.innerHTML = `
      <div class="procedure-card-top">
        <span class="status ${st.cls}">${st.label}</span>
        <span class="item-count">${st.scored}/${st.total} scored</span>
      </div>
      <h2>${escapeHtml(proc)}</h2>
      <p>${coreCount} local core item${coreCount === 1 ? "" : "s"} + ${st.total} Delphi candidate${st.total === 1 ? "" : "s"}</p>
      <div class="card-progress"><span style="width:${st.total ? Math.round(st.scored / st.total * 100) : 0}%"></span></div>
      <button class="btn btn-primary" type="button">${st.submitted ? "Open" : "Review"}</button>`;
    div.querySelector("button").onclick = () => openProcedure(proc);
    wrap.appendChild(div);
  });
}

function openProcedure(proc) {
  currentProcedure = proc;
  hideAll();
  $("survey").classList.remove("hidden");
  setPageLabel("Procedure review");
  $("procedureTitle").textContent = proc;
  $("experienceSelect").value = pState(proc).experience || "";
  $("experienceSelect").onchange = () => {
    pState(proc).experience = $("experienceSelect").value;
    save();
  };
  renderLocalCore(proc);
  renderProcedure(proc);
  renderAdditionalRisks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderLocalCore(proc) {
  $("localCoreNote").textContent = dataset.project.local_core_note || "";
  const wrap = $("localCoreList");
  wrap.innerHTML = "";
  localCoreFor(proc).forEach(item => wrap.appendChild(localCoreItem(item)));
}

function localCoreItem(item) {
  const div = document.createElement("div");
  div.className = "local-core-item";
  div.innerHTML = `<span class="core-check" aria-hidden="true">✓</span><span>${escapeHtml(item.risk)}</span>`;
  return div;
}

function renderProcedure(proc) {
  const panel = $("procedurePanel");
  panel.innerHTML = "";
  procItems(proc).forEach(item => panel.appendChild(renderRisk(proc, item)));
  updateProgress(proc);
}

function renderRisk(proc, item) {
  const a = answerFor(proc, item.id);
  const div = document.createElement("article");
  div.className = "panel risk-card";

  const addedBadge = item.candidate_status === "ADDED" ? `<span class="meta-badge added-badge">Added 2026 review</span>` : "";
  const tier = item.best_evidence_tier || "Unverified";
  const frequencyBlock = item.has_numeric_incidence ? `
    <div class="frequency-panel">
      <div class="published-frequency"><strong>Published frequency</strong><span>${escapeHtml(item.incidence_summary)}</span></div>
      <div class="field frequency-choice">
        <label for="freq-${item.id}">Include a numerical frequency on the final consent aid?</label>
        <select id="freq-${item.id}">
          <option value=""></option>
          <option ${a.frequency === "Yes" ? "selected" : ""}>Yes</option>
          <option ${a.frequency === "No" ? "selected" : ""}>No</option>
          <option ${a.frequency === "Unsure" ? "selected" : ""}>Unsure</option>
        </select>
      </div>
    </div>` : "";

  div.innerHTML = `
    <div class="risk-header">
      <div class="risk-title-block">
        <div class="risk-badges">
          ${addedBadge}
          <span class="evidence-badge ${tierClass(tier)}">${escapeHtml(tier)}</span>
        </div>
        <h3>${escapeHtml(item.risk)}</h3>
      </div>
    </div>

    ${renderEvidenceDetails(item)}

    <div class="score-section">
      <div class="score-label">Should this risk be included in the core procedure-specific consent list?</div>
      <div class="scale" aria-label="Score ${escapeHtml(item.risk)}">
        ${[1,2,3,4,5].map(n => `<label title="${escapeHtml(dataset.project.scale[String(n)])}" class="score-option">
          <input type="radio" name="score-${item.id}" value="${n}" ${String(a.score) === String(n) ? "checked" : ""}>
          <span class="score-number">${n}</span>
          <span class="score-short">${escapeHtml(shortScaleLabel(n))}</span>
        </label>`).join("")}
      </div>
    </div>

    ${frequencyBlock}

    <div class="field comment-field">
      <label for="comment-${item.id}">Comment / suggested wording <span class="optional">optional</span></label>
      <textarea id="comment-${item.id}" placeholder="Optional comment">${escapeHtml(a.comment || "")}</textarea>
    </div>`;

  div.querySelectorAll(`input[name="score-${item.id}"]`).forEach(el => {
    el.onchange = () => {
      const x = answerFor(proc, item.id);
      x.score = el.value;
      pState(proc).answers[item.id] = x;
      save();
      updateProgress(proc);
    };
  });

  const f = div.querySelector(`#freq-${cssEscape(item.id)}`);
  const c = div.querySelector(`#comment-${cssEscape(item.id)}`);
  if (f) {
    f.onchange = () => {
      const x = answerFor(proc, item.id);
      x.frequency = f.value;
      pState(proc).answers[item.id] = x;
      save();
    };
  }
  if (c) {
    c.oninput = () => {
      const x = answerFor(proc, item.id);
      x.comment = c.value;
      pState(proc).answers[item.id] = x;
      save();
    };
  }
  return div;
}

function renderEvidenceDetails(item) {
  const sources = Array.isArray(item.sources) ? item.sources : [];
  const sourceHtml = sources.length ? `
    <ul class="source-list">
      ${sources.map(source => `<li>
        <span class="source-tier ${tierClass(source.tier)}">${escapeHtml(source.tier || "Unverified")}</span>
        ${source.url ? `<a href="${escapeAttr(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>` : `<span>${escapeHtml(source.label)}</span>`}
      </li>`).join("")}
    </ul>` : `<p class="muted">No risk-level supporting source was confirmed in the current evidence review.</p>`;

  const contextFrequency = !item.has_numeric_incidence && item.incidence_summary ? `<p><strong>Frequency:</strong> ${escapeHtml(item.incidence_summary)}</p>` : "";
  const note = item.evidence_note ? `<p><strong>Evidence note:</strong> ${escapeHtml(item.evidence_note)}</p>` : "";

  return `<details class="evidence-details">
    <summary>Evidence & source${sources.length === 1 ? "" : "s"}</summary>
    <div class="evidence-content">
      ${contextFrequency}
      ${sourceHtml}
      ${note}
    </div>
  </details>`;
}

function updateProgress(proc) {
  const items = procItems(proc);
  const scored = items.filter(item => answerFor(proc, item.id).score !== "").length;
  const pct = items.length ? Math.round(scored / items.length * 100) : 0;
  $("progress").style.width = `${pct}%`;
  $("progressText").textContent = `${scored}/${items.length}`;
}

function addAdditionalRisk() {
  const ps = pState(currentProcedure);
  ps.additionalRisks.push("");
  save();
  renderAdditionalRisks();
  const inputs = document.querySelectorAll(".additional-risk-input");
  if (inputs.length) inputs[inputs.length - 1].focus();
}

function renderAdditionalRisks() {
  const wrap = $("additionalRisks");
  const risks = pState(currentProcedure).additionalRisks;
  wrap.innerHTML = "";
  if (!risks.length) {
    const p = document.createElement("div");
    p.className = "empty-additional";
    p.textContent = "No additional risks added.";
    wrap.appendChild(p);
    return;
  }

  risks.forEach((risk, idx) => {
    const row = document.createElement("div");
    row.className = "additional-risk-row";
    row.innerHTML = `
      <input class="additional-risk-input" type="text" value="${escapeAttr(risk)}" placeholder="Additional risk ${idx + 1}">
      <button type="button" class="btn btn-danger-outline remove-risk" aria-label="Remove additional risk">Remove</button>`;
    const input = row.querySelector("input");
    input.oninput = () => { pState(currentProcedure).additionalRisks[idx] = input.value; save(); };
    row.querySelector("button").onclick = () => {
      pState(currentProcedure).additionalRisks.splice(idx, 1);
      save();
      renderAdditionalRisks();
    };
    wrap.appendChild(row);
  });
}

function showReview() {
  const ps = pState(currentProcedure);
  if (!ps.experience) {
    alert("Select your experience with this procedure.");
    return;
  }
  if (ps.experience === "Prefer not to assess") {
    showDashboard();
    return;
  }

  hideAll();
  $("review").classList.remove("hidden");
  setPageLabel("Review responses");
  $("reviewTitle").textContent = currentProcedure;

  const coreWrap = $("reviewLocalCore");
  coreWrap.innerHTML = "";
  localCoreFor(currentProcedure).forEach(item => coreWrap.appendChild(localCoreItem(item)));

  const body = $("reviewBody");
  body.innerHTML = "";
  let missing = 0;
  procItems(currentProcedure).forEach(item => {
    const a = answerFor(currentProcedure, item.id);
    if (!a.score) missing++;
    const frequency = item.has_numeric_incidence ? (a.frequency || "—") : "Not asked";
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(item.risk)}</td><td>${escapeHtml(a.score || "—")}</td><td>${escapeHtml(frequency)}</td><td>${escapeHtml(a.comment || "")}</td>`;
    body.appendChild(tr);
  });

  const total = procItems(currentProcedure).length;
  $("reviewSummary").textContent = `${total - missing}/${total} items scored · ${ps.experience}`;
  $("missingWarning").classList.toggle("hidden", missing === 0);
  $("missingWarning").textContent = missing ? `${missing} items remain unscored.` : "";
  $("submitProcedureBtn").disabled = missing > 0;
  $("submitStatus").innerHTML = "";

  const added = ps.additionalRisks.map(x => x.trim()).filter(Boolean);
  $("reviewAdditional").classList.toggle("hidden", added.length === 0);
  const list = $("reviewAdditionalList");
  list.innerHTML = "";
  added.forEach((risk, idx) => {
    const d = document.createElement("div");
    d.className = "added-review-item";
    d.textContent = `${idx + 1}. ${risk}`;
    list.appendChild(d);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function submitProcedure() {
  if (!cfg.endpoint) {
    $("submitStatus").innerHTML = '<div class="alert alert-warning">Submission is not configured.</div>';
    return;
  }
  const ps = pState(currentProcedure);
  const payload = {
    projectCode: cfg.projectCode,
    round: cfg.round || dataset.project.round,
    consultantId: state.consultantId,
    procedure: currentProcedure,
    experience: ps.experience,
    startedAt: state.startedAt,
    submittedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    localCoreRisks: localCoreFor(currentProcedure).map(x => x.risk),
    additionalRisks: ps.additionalRisks.map(x => x.trim()).filter(Boolean),
    responses: procItems(currentProcedure).map(item => ({
      itemId: item.id,
      procedure: item.procedure,
      risk: item.risk,
      riskType: item.risk_type,
      score: Number(answerFor(currentProcedure, item.id).score),
      frequencyStatement: item.has_numeric_incidence ? answerFor(currentProcedure, item.id).frequency : "",
      comment: answerFor(currentProcedure, item.id).comment
    }))
  };

  $("submitProcedureBtn").disabled = true;
  $("submitStatus").innerHTML = '<div class="alert alert-info">Submitting…</div>';
  try {
    await fetch(cfg.endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    ps.submitted = true;
    ps.submittedAt = payload.submittedAt;
    save();
    hideAll();
    $("submitted").classList.remove("hidden");
    setPageLabel("Submitted");
    $("submittedMessage").textContent = `${currentProcedure} has been submitted successfully.`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (e) {
    $("submitStatus").innerHTML = '<div class="alert alert-warning">Submission failed. Download your backup and contact the project lead.</div>';
  } finally {
    $("submitProcedureBtn").disabled = false;
  }
}

function exportBackup() {
  if (!state.consultantId) {
    alert("Start the review before downloading a backup.");
    return;
  }
  const payload = {
    consultantId: state.consultantId,
    exportedAt: new Date().toISOString(),
    round: dataset.project.round,
    procedures: state.procedures
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `IR_Consent_Review_R${dataset.project.round}_${state.consultantId || "anonymous"}_backup.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderGuide() {
  const scale = $("guideScale");
  scale.innerHTML = [1,2,3,4,5].map(n => `<div class="guide-scale-row"><span>${n}</span><strong>${escapeHtml(dataset.project.scale[String(n)])}</strong></div>`).join("");

  const legend = $("evidenceLegend");
  const order = ["Tier 1","Tier 2","Tier 3","Tier 4","Tier 5","Unverified","Local core"];
  legend.innerHTML = order.map(tier => `<div class="legend-row"><span class="evidence-badge ${tierClass(tier)}">${escapeHtml(tier)}</span><p>${escapeHtml(dataset.project.evidence_tiers[tier] || "")}</p></div>`).join("");
}

function openGuide() {
  $("guideBackdrop").classList.remove("hidden");
  $("guideDrawer").classList.add("open");
  $("guideDrawer").setAttribute("aria-hidden", "false");
  document.body.classList.add("drawer-open");
  setTimeout(() => $("closeGuideBtn").focus(), 0);
}

function closeGuide() {
  $("guideBackdrop").classList.add("hidden");
  $("guideDrawer").classList.remove("open");
  $("guideDrawer").setAttribute("aria-hidden", "true");
  document.body.classList.remove("drawer-open");
}

function tierClass(tier) {
  const t = String(tier || "Unverified").toLowerCase();
  if (t.includes("local")) return "tier-local";
  const m = t.match(/tier\s*([1-5])/);
  return m ? `tier-${m[1]}` : "tier-unverified";
}

function shortScaleLabel(n) {
  return ({1:"Exclude",2:"Probably exclude",3:"Unsure",4:"Probably include",5:"Include"})[n];
}

function cssEscape(s) {
  return String(s).replace(/[^a-zA-Z0-9_-]/g, ch => `\\${ch}`);
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[m]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, "&#096;");
}

init();