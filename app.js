
const cfg = window.DELPHI_CONFIG || {};
let dataset = null;
let currentProcedure = null;
let state = { consultantId:"", startedAt:null, procedures:{} };

const $ = id => document.getElementById(id);
const save = () => localStorage.setItem(cfg.autosaveKey || "ir-consent-review", JSON.stringify(state));
const load = () => {
  try {
    const s = JSON.parse(localStorage.getItem(cfg.autosaveKey || "ir-consent-review"));
    if (s) state = s;
  } catch(e){}
};

const pState = proc => {
  if(!state.procedures[proc]) {
    state.procedures[proc] = {
      experience:"",
      answers:{},
      additionalRisks:[],
      submitted:false,
      submittedAt:null
    };
  }
  if(!Array.isArray(state.procedures[proc].additionalRisks)) state.procedures[proc].additionalRisks=[];
  return state.procedures[proc];
};
const answerFor = (proc,id) => pState(proc).answers[id] || {score:"",frequency:"",comment:""};
const procItems = proc => dataset.items.filter(x=>x.procedure===proc);

async function init(){
  dataset = await (await fetch("data.json",{cache:"no-store"})).json();
  load();
  if(state.consultantId) $("consultantId").value = state.consultantId;
  $("startBtn").onclick = start;
  $("backDashboardBtn").onclick = showDashboard;
  $("saveBackBtn").onclick = ()=>{save();showDashboard();};
  $("reviewProcedureBtn").onclick = showReview;
  $("backSurveyBtn").onclick = ()=>{hideAll();$("survey").classList.remove("hidden");};
  $("submitProcedureBtn").onclick = submitProcedure;
  $("exportBtn").onclick = exportBackup;
  $("exportBtnTop").onclick = exportBackup;
  $("addRiskBtn").onclick = addAdditionalRisk;
}

function start(){
  const cid = $("consultantId").value.trim();
  if(cfg.requireConsultantId && !cid){ alert("Enter your consultant ID."); return; }
  state.consultantId = cid || "anonymous";
  state.startedAt = state.startedAt || new Date().toISOString();
  save();
  $("intro").classList.add("hidden");
  showDashboard();
}

function hideAll(){["dashboard","survey","review"].forEach(id=>$(id).classList.add("hidden"));}

function showDashboard(){
  hideAll();
  $("dashboard").classList.remove("hidden");
  renderDashboard();
  window.scrollTo({top:0,behavior:"smooth"});
}

function procStatus(proc){
  const ps=pState(proc);
  const items=procItems(proc);
  const scored=items.filter(i=>answerFor(proc,i.id).score!=="").length;
  if(ps.submitted) return {label:"Submitted",cls:"submitted",scored,total:items.length};
  if(scored===0) return {label:"Not started",cls:"not-started",scored,total:items.length};
  if(scored===items.length) return {label:"Complete",cls:"complete",scored,total:items.length};
  return {label:"In progress",cls:"in-progress",scored,total:items.length};
}

function renderDashboard(){
  const wrap=$("procedureCards"); wrap.innerHTML="";
  dataset.procedures.forEach(proc=>{
    const st=procStatus(proc);
    const div=document.createElement("article");
    div.className="proc-card";
    div.innerHTML=`
      <h3>${escapeHtml(proc)}</h3>
      <div class="meta-row">
        <span class="status ${st.cls}">${st.label}</span>
        <span>${st.scored}/${st.total}</span>
      </div>
      <button class="btn">${st.submitted?"Open":"Review"}</button>`;
    div.querySelector("button").onclick=()=>openProcedure(proc);
    wrap.appendChild(div);
  });
}

function openProcedure(proc){
  currentProcedure=proc;
  hideAll();
  $("survey").classList.remove("hidden");
  $("procedureTitle").textContent=proc;
  $("experienceSelect").value=pState(proc).experience||"";
  $("experienceSelect").onchange=()=>{
    pState(proc).experience=$("experienceSelect").value;
    save();
  };
  renderProcedure(proc);
  renderAdditionalRisks();
  window.scrollTo({top:0,behavior:"smooth"});
}

function renderProcedure(proc){
  const panel=$("procedurePanel"); panel.innerHTML="";
  procItems(proc).forEach(item=>panel.appendChild(renderRisk(proc,item)));
  updateProgress(proc);
}

function renderRisk(proc,item){
  const a=answerFor(proc,item.id);
  const div=document.createElement("article");
  div.className="risk";
  div.innerHTML=`
    <div class="risk-main">
      <h3>${escapeHtml(item.risk)}</h3>
      <div class="meta">
        ${item.frequency_evidence ? `${escapeHtml(item.frequency_evidence)}<br>`:""}
        ${item.source ? `${escapeHtml(item.source)}`:""}
      </div>
      <div class="scale" aria-label="Score ${escapeHtml(item.risk)}">
        ${[1,2,3,4,5].map(n=>`<label title="${escapeHtml(dataset.project.scale[String(n)])}">
          <input type="radio" name="score-${item.id}" value="${n}" ${String(a.score)===String(n)?"checked":""}> ${n}
        </label>`).join("")}
      </div>
    </div>
    <div class="risk-options">
      <div>
        <label>Quote frequency?</label>
        <select id="freq-${item.id}">
          <option value=""></option>
          <option ${a.frequency==="Yes"?"selected":""}>Yes</option>
          <option ${a.frequency==="No"?"selected":""}>No</option>
          <option ${a.frequency==="Unsure"?"selected":""}>Unsure</option>
        </select>
      </div>
      <div>
        <label>Comment</label>
        <textarea id="comment-${item.id}">${escapeHtml(a.comment||"")}</textarea>
      </div>
    </div>`;
  div.querySelectorAll(`input[name="score-${item.id}"]`).forEach(el=>el.onchange=()=>{
    const x=answerFor(proc,item.id); x.score=el.value; pState(proc).answers[item.id]=x; save(); updateProgress(proc);
  });
  setTimeout(()=>{
    const f=$(`freq-${item.id}`),c=$(`comment-${item.id}`);
    if(f) f.onchange=()=>{const x=answerFor(proc,item.id);x.frequency=f.value;pState(proc).answers[item.id]=x;save();};
    if(c) c.oninput=()=>{const x=answerFor(proc,item.id);x.comment=c.value;pState(proc).answers[item.id]=x;save();};
  },0);
  return div;
}

function updateProgress(proc){
  const items=procItems(proc);
  const scored=items.filter(i=>answerFor(proc,i.id).score!=="").length;
  $("progress").style.width=`${Math.round(scored/items.length*100)}%`;
  $("progressText").textContent=`${scored}/${items.length}`;
}

function addAdditionalRisk(){
  const ps=pState(currentProcedure);
  ps.additionalRisks.push("");
  save();
  renderAdditionalRisks();
  const inputs=document.querySelectorAll(".additional-risk-input");
  if(inputs.length) inputs[inputs.length-1].focus();
}

function renderAdditionalRisks(){
  const wrap=$("additionalRisks");
  const risks=pState(currentProcedure).additionalRisks;
  wrap.innerHTML="";
  if(!risks.length){
    const p=document.createElement("div");
    p.className="empty-additional";
    p.textContent="No additional risks added.";
    wrap.appendChild(p);
    return;
  }
  risks.forEach((risk,idx)=>{
    const row=document.createElement("div");
    row.className="additional-risk-row";
    row.innerHTML=`
      <input class="additional-risk-input" type="text" value="${escapeAttr(risk)}" placeholder="Additional risk ${idx+1}">
      <button type="button" class="btn remove-risk" aria-label="Remove additional risk">Remove</button>`;
    const input=row.querySelector("input");
    input.oninput=()=>{pState(currentProcedure).additionalRisks[idx]=input.value;save();};
    row.querySelector("button").onclick=()=>{
      pState(currentProcedure).additionalRisks.splice(idx,1);
      save();
      renderAdditionalRisks();
    };
    wrap.appendChild(row);
  });
}

function showReview(){
  const ps=pState(currentProcedure);
  if(!ps.experience){alert("Select your experience with this procedure.");return;}
  if(ps.experience==="Prefer not to assess"){showDashboard();return;}

  hideAll(); $("review").classList.remove("hidden");
  $("reviewTitle").textContent=currentProcedure;
  const body=$("reviewBody"); body.innerHTML="";
  let missing=0;
  procItems(currentProcedure).forEach(item=>{
    const a=answerFor(currentProcedure,item.id);
    if(!a.score) missing++;
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${escapeHtml(item.risk)}</td><td>${escapeHtml(a.score||"—")}</td>
      <td>${escapeHtml(a.frequency||"—")}</td><td>${escapeHtml(a.comment||"")}</td>`;
    body.appendChild(tr);
  });

  $("reviewSummary").textContent=`${procItems(currentProcedure).length-missing}/${procItems(currentProcedure).length} items scored · ${ps.experience}`;
  $("missingWarning").classList.toggle("hidden",missing===0);
  $("missingWarning").textContent=missing?`${missing} items remain unscored.`:"";
  $("submitProcedureBtn").disabled=missing>0;
  $("submitStatus").innerHTML="";

  const added=ps.additionalRisks.map(x=>x.trim()).filter(Boolean);
  $("reviewAdditional").classList.toggle("hidden",added.length===0);
  const list=$("reviewAdditionalList"); list.innerHTML="";
  added.forEach((risk,idx)=>{
    const d=document.createElement("div");
    d.className="added-review-item";
    d.textContent=`${idx+1}. ${risk}`;
    list.appendChild(d);
  });
  window.scrollTo({top:0,behavior:"smooth"});
}

async function submitProcedure(){
  if(!cfg.endpoint){
    $("submitStatus").innerHTML='<div class="warning">Submission is not configured.</div>';
    return;
  }
  const ps=pState(currentProcedure);
  const payload={
    projectCode:cfg.projectCode,
    round:cfg.round||dataset.project.round,
    consultantId:state.consultantId,
    procedure:currentProcedure,
    experience:ps.experience,
    startedAt:state.startedAt,
    submittedAt:new Date().toISOString(),
    userAgent:navigator.userAgent,
    additionalRisks:ps.additionalRisks.map(x=>x.trim()).filter(Boolean),
    responses:procItems(currentProcedure).map(item=>({
      itemId:item.id, procedure:item.procedure, risk:item.risk, riskType:item.risk_type,
      score:Number(answerFor(currentProcedure,item.id).score),
      frequencyStatement:answerFor(currentProcedure,item.id).frequency,
      comment:answerFor(currentProcedure,item.id).comment
    }))
  };
  $("submitProcedureBtn").disabled=true;
  $("submitStatus").innerHTML='<div class="warning">Submitting…</div>';
  try{
    await fetch(cfg.endpoint,{
      method:"POST",mode:"no-cors",
      headers:{"Content-Type":"text/plain;charset=utf-8"},
      body:JSON.stringify(payload)
    });
    ps.submitted=true;ps.submittedAt=payload.submittedAt;save();
    $("submitStatus").innerHTML='<div class="success">Submitted.</div>';
  }catch(e){
    $("submitStatus").innerHTML='<div class="warning">Submission failed. Download your backup and contact the project lead.</div>';
  }finally{
    $("submitProcedureBtn").disabled=false;
  }
}

function exportBackup(){
  const payload={
    consultantId:state.consultantId,
    exportedAt:new Date().toISOString(),
    round:dataset.project.round,
    procedures:state.procedures
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`IR_Consent_Review_R${dataset.project.round}_${state.consultantId||"anonymous"}_backup.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,"&#096;");}
init();
