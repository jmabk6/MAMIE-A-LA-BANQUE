
const STORAGE_KEY = "mamie-banque-v1";

const demoData = [
  {id:1,date:"2026-09-01",label:"Pension retraite",type:"recette",amount:2100,payment:"Virement",pointed:true,unknown:false},
  {id:2,date:"2026-09-02",label:"Carrefour",type:"depense",amount:45.62,payment:"Carte bancaire",pointed:true,unknown:false},
  {id:3,date:"2026-09-03",label:"Mutuelle",type:"prelevement",amount:78.50,payment:"Prélèvement",pointed:false,unknown:false},
  {id:4,date:"2026-09-05",label:"EDF",type:"prelevement",amount:57.90,payment:"Prélèvement",pointed:false,unknown:false},
  {id:5,date:"2026-09-06",label:"Pharmacie",type:"depense",amount:23.80,payment:"Carte bancaire",pointed:false,unknown:false},
  {id:6,date:"2026-09-07",label:"PRLV SEPA XYZ",type:"prelevement",amount:37.90,payment:"Prélèvement",pointed:false,unknown:true}
];

let state = load();
let currentView = "home";

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {transactions:[...demoData]};
  } catch {
    return {transactions:[...demoData]};
  }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function euro(n){ return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n); }
function fmtDate(d){ return new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}); }
function signed(tx){ return tx.type==="recette" ? tx.amount : -tx.amount; }
function typeClass(tx){ return tx.type==="recette"?"green":tx.type==="depense"?"red":"blue"; }
function statusBadge(tx){
  if(tx.unknown) return '<span class="badge orange">NOUVEAU</span>';
  if(tx.pointed) return '<span class="badge green">POINTÉ</span>';
  return '<span class="badge gray">À VÉRIFIER</span>';
}
function sortedTx(list=state.transactions){
  return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id);
}
function renderTxList(list){
  if(!list.length) return '<div class="empty">Aucune opération</div>';
  return `<div class="card">${sortedTx(list).map(tx=>`
    <div class="tx">
      <div class="tx-main">
        <strong>${escapeHtml(tx.label)} ${statusBadge(tx)}</strong>
        <div class="meta">${fmtDate(tx.date)} · ${escapeHtml(tx.payment)}</div>
      </div>
      <div class="amount ${typeClass(tx)}">${tx.type==="recette"?"+":"-"}${euro(tx.amount)}</div>
    </div>`).join("")}</div>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

function homeView(){
  const rec = state.transactions.filter(x=>x.type==="recette").reduce((s,x)=>s+x.amount,0);
  const dep = state.transactions.filter(x=>x.type==="depense").reduce((s,x)=>s+x.amount,0);
  const pre = state.transactions.filter(x=>x.type==="prelevement").reduce((s,x)=>s+x.amount,0);
  const remain = rec-dep-pre;
  const pointed = state.transactions.filter(x=>x.pointed).length;
  const unknown = state.transactions.filter(x=>x.unknown).length;
  return `
    <section class="hero card">
      <small>Reste du mois</small>
      <div class="balance">${euro(remain)}</div>
      <div class="meta" style="color:#d7efef">Recettes moins dépenses et prélèvements</div>
    </section>
    <section class="grid">
      <div class="stat"><small>Recettes</small><strong class="green">${euro(rec)}</strong></div>
      <div class="stat"><small>Dépenses</small><strong class="red">${euro(dep)}</strong></div>
      <div class="stat"><small>Prélèvements</small><strong class="blue">${euro(pre)}</strong></div>
    </section>
    <section class="section-title"><h2>Suivi du relevé</h2></section>
    <section class="grid">
      <div class="stat"><small>Pointées</small><strong class="green">${pointed}</strong></div>
      <div class="stat"><small>Nouvelles</small><strong class="orange">${unknown}</strong></div>
      <div class="stat"><small>À vérifier</small><strong>${state.transactions.filter(x=>!x.pointed).length}</strong></div>
    </section>
    <button class="fab" id="addBtn">+ Ajouter une dépense</button>
    <section class="section-title"><h2>Dernières opérations</h2><button class="link-btn" data-jump="search">Voir tout</button></section>
    ${renderTxList(sortedTx().slice(0,5))}
  `;
}

function expensesView(){
  return `
    <section class="section-title"><h2>Dépenses du mois</h2></section>
    <button class="fab" id="addBtn">+ Ajouter une dépense</button>
    ${renderTxList(state.transactions.filter(x=>x.type==="depense"))}
  `;
}

function addView(defaultType="depense", unknown=false){
  const tpl = document.getElementById("transaction-form-template").content.cloneNode(true);
  const wrap = document.createElement("div");
  wrap.appendChild(tpl);
  const form = wrap.querySelector("#transactionForm");
  form.querySelector("#date").value = new Date().toISOString().slice(0,10);
  form.querySelector("#type").value = defaultType;
  form.querySelector("#unknown").checked = unknown;
  form.querySelectorAll("#typeSegment button").forEach(b=>b.classList.toggle("active",b.dataset.type===defaultType));
  return wrap.innerHTML;
}

function statementView(){
  const pending = sortedTx(state.transactions.filter(x=>!x.pointed));
  const unknown = pending.filter(x=>x.unknown).length;
  return `
    <div class="notice">Coche les opérations présentes sur le relevé bancaire.</div>
    ${unknown ? `<div class="notice orange">${unknown} nouvelle(s) opération(s) à examiner.</div>`:""}
    <div class="card">
      ${pending.length ? pending.map(tx=>`
        <label class="reconcile-item">
          <input type="checkbox" data-point="${tx.id}">
          <div><strong>${escapeHtml(tx.label)} ${statusBadge(tx)}</strong><div class="meta">${fmtDate(tx.date)} · ${escapeHtml(tx.payment)}</div></div>
          <div class="amount ${typeClass(tx)}">${euro(tx.amount)}</div>
        </label>`).join("") : '<div class="empty">Tout est pointé ✓</div>'}
    </div>
    <button class="fab" id="statementAddBtn">+ Ajouter une opération du relevé</button>
  `;
}

function searchView(){
  return `
    <div class="card search-box">
      <input id="q" placeholder="Rechercher une enseigne, un montant…" />
      <div class="filters" style="margin-top:10px">
        <select id="typeFilter">
          <option value="">Tous les types</option>
          <option value="depense">Dépenses</option>
          <option value="recette">Recettes</option>
          <option value="prelevement">Prélèvements</option>
        </select>
        <select id="payFilter">
          <option value="">Tous les paiements</option>
          <option>Carte bancaire</option><option>Prélèvement</option><option>Virement</option><option>Espèces</option><option>Chèque</option>
        </select>
        <input id="minFilter" type="number" step="0.01" placeholder="Montant min." />
        <input id="maxFilter" type="number" step="0.01" placeholder="Montant max." />
        <input id="fromFilter" type="date" />
        <input id="toFilter" type="date" />
      </div>
    </div>
    <div id="searchResults">${renderTxList(state.transactions)}</div>
  `;
}

function settingsView(){
  return `
    <div class="card">
      <div class="settings-row"><div><strong>Recettes récurrentes</strong><div class="meta">À préparer dans la prochaine version</div></div><span>›</span></div>
      <div class="settings-row"><div><strong>Prélèvements récurrents</strong><div class="meta">À préparer dans la prochaine version</div></div><span>›</span></div>
      <div class="settings-row"><div><strong>Sauvegarde</strong><div class="meta">Pour l'instant : uniquement sur cet iPhone</div></div><span>Local</span></div>
    </div>
    <button class="fab" id="resetBtn">Recharger les données d'exemple</button>
  `;
}

function render(view=currentView, options={}){
  currentView=view;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const app=document.getElementById("app");
  if(view==="home") app.innerHTML=homeView();
  if(view==="expenses") app.innerHTML=expensesView();
  if(view==="statement") app.innerHTML=statementView();
  if(view==="search") app.innerHTML=searchView();
  if(view==="settings") app.innerHTML=settingsView();
  if(view==="add") app.innerHTML=addView(options.type||"depense",!!options.unknown);
  bind();
}

function bind(){
  document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>render(b.dataset.jump));
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>render(b.dataset.view));
  const add=document.getElementById("addBtn"); if(add) add.onclick=()=>render("add",{type:"depense"});
  const stAdd=document.getElementById("statementAddBtn"); if(stAdd) stAdd.onclick=()=>render("add",{type:"prelevement",unknown:true});
  const reset=document.getElementById("resetBtn"); if(reset) reset.onclick=resetDemo;

  document.querySelectorAll("[data-point]").forEach(cb=>{
    cb.onchange=()=>{
      const id=Number(cb.dataset.point);
      const tx=state.transactions.find(x=>x.id===id);
      if(tx){ tx.pointed=true; save(); render("statement"); }
    };
  });

  const form=document.getElementById("transactionForm");
  if(form){
    form.querySelectorAll("#typeSegment button").forEach(b=>b.onclick=()=>{
      form.querySelectorAll("#typeSegment button").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      form.querySelector("#type").value=b.dataset.type;
      if(b.dataset.type==="prelevement") form.querySelector("#payment").value="Prélèvement";
      if(b.dataset.type==="recette") form.querySelector("#payment").value="Virement";
    });
    form.onsubmit=e=>{
      e.preventDefault();
      const tx={
        id:Date.now(),
        type:form.querySelector("#type").value,
        date:form.querySelector("#date").value,
        label:form.querySelector("#label").value.trim(),
        amount:Number(form.querySelector("#amount").value),
        payment:form.querySelector("#payment").value,
        unknown:form.querySelector("#unknown").checked,
        pointed:false
      };
      state.transactions.push(tx); save();
      render(tx.unknown?"statement":"home");
    };
  }

  const q=document.getElementById("q");
  if(q){
    ["q","typeFilter","payFilter","minFilter","maxFilter","fromFilter","toFilter"].forEach(id=>{
      const el=document.getElementById(id); el.addEventListener("input",applySearch); el.addEventListener("change",applySearch);
    });
  }
}
function applySearch(){
  const q=document.getElementById("q").value.trim().toLowerCase();
  const t=document.getElementById("typeFilter").value;
  const p=document.getElementById("payFilter").value;
  const min=parseFloat(document.getElementById("minFilter").value);
  const max=parseFloat(document.getElementById("maxFilter").value);
  const from=document.getElementById("fromFilter").value;
  const to=document.getElementById("toFilter").value;
  const list=state.transactions.filter(x=>{
    const matchesQ=!q || x.label.toLowerCase().includes(q) || String(x.amount).replace(".",",").includes(q) || String(x.amount).includes(q);
    return matchesQ && (!t||x.type===t) && (!p||x.payment===p) &&
      (isNaN(min)||x.amount>=min) && (isNaN(max)||x.amount<=max) &&
      (!from||x.date>=from) && (!to||x.date<=to);
  });
  document.getElementById("searchResults").innerHTML=renderTxList(list);
}
function resetDemo(){ state={transactions:[...demoData.map(x=>({...x}))]}; save(); render("home"); }
document.getElementById("seedBtn").onclick=resetDemo;
render();
