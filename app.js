
const STORAGE_KEY = "mamie-banque-v2";

const demoRecurring = [
  {id:101, type:"recette", label:"Pension retraite", amount:2100, day:1, payment:"Virement"},
  {id:102, type:"recette", label:"Pension de réversion", amount:620, day:28, payment:"Virement"},
  {id:201, type:"prelevement", label:"EDF", amount:57.90, day:5, payment:"Prélèvement"},
  {id:202, type:"prelevement", label:"Mutuelle", amount:78.50, day:5, payment:"Prélèvement"},
  {id:203, type:"prelevement", label:"Téléphone", amount:25.99, day:15, payment:"Prélèvement"},
  {id:204, type:"prelevement", label:"Assurance habitation", amount:19.90, day:10, payment:"Prélèvement"}
];

const demoData = [
  {id:1,date:"2026-09-01",label:"Pension retraite",type:"recette",amount:2100,payment:"Virement",pointed:true,unknown:false,recurringId:101},
  {id:2,date:"2026-09-02",label:"Carrefour",type:"depense",amount:45.62,payment:"Carte bancaire",pointed:true,unknown:false},
  {id:3,date:"2026-09-05",label:"Mutuelle",type:"prelevement",amount:78.50,payment:"Prélèvement",pointed:false,unknown:false,recurringId:202},
  {id:4,date:"2026-09-05",label:"EDF",type:"prelevement",amount:57.90,payment:"Prélèvement",pointed:false,unknown:false,recurringId:201},
  {id:5,date:"2026-09-06",label:"Pharmacie",type:"depense",amount:23.80,payment:"Carte bancaire",pointed:false,unknown:false},
  {id:6,date:"2026-09-07",label:"PRLV SEPA XYZ",type:"prelevement",amount:37.90,payment:"Prélèvement",pointed:false,unknown:true}
];

let state = load();
let currentView = "home";

function load(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {transactions:[...demoData.map(x=>({...x}))], recurring:[...demoRecurring.map(x=>({...x}))]};
  } catch {
    return {transactions:[...demoData.map(x=>({...x}))], recurring:[...demoRecurring.map(x=>({...x}))]};
  }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function euro(n){ return new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n); }
function fmtDate(d){ return new Date(d+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"}); }
function typeClass(tx){ return tx.type==="recette"?"green":tx.type==="depense"?"red":"blue"; }
function statusBadge(tx){
  if(tx.unknown) return '<span class="badge orange">NOUVEAU</span>';
  if(tx.pointed) return '<span class="badge green">POINTÉ</span>';
  return '<span class="badge gray">À VÉRIFIER</span>';
}
function sortedTx(list=state.transactions){ return [...list].sort((a,b)=>b.date.localeCompare(a.date)||b.id-a.id); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
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

function homeView(){
  const rec = state.transactions.filter(x=>x.type==="recette").reduce((s,x)=>s+x.amount,0);
  const dep = state.transactions.filter(x=>x.type==="depense").reduce((s,x)=>s+x.amount,0);
  const pre = state.transactions.filter(x=>x.type==="prelevement").reduce((s,x)=>s+x.amount,0);
  const remain = rec-dep-pre;
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

function recurringCard(r){
  return `
    <div class="recurring-item">
      <div>
        <strong>${escapeHtml(r.label)}</strong>
        <div class="meta">${r.type==="recette"?"Virement":"Prélèvement"} · vers le ${r.day} du mois</div>
      </div>
      <div class="recurring-actions">
        <strong class="${r.type==="recette"?"green":"blue"}">${euro(r.amount)}</strong>
        <button class="mini-btn" data-edit-recurring="${r.id}">Modifier</button>
        <button class="mini-btn danger" data-delete-recurring="${r.id}">Suppr.</button>
      </div>
    </div>`;
}

function settingsView(){
  const recettes=state.recurring.filter(r=>r.type==="recette");
  const prelevements=state.recurring.filter(r=>r.type==="prelevement");
  return `
    <div class="card">
      <div class="section-title" style="margin-top:0">
        <h2>Recettes récurrentes</h2>
        <button class="link-btn" data-add-recurring="recette">+ Ajouter</button>
      </div>
      ${recettes.length?recettes.map(recurringCard).join(""):'<div class="empty">Aucune recette récurrente</div>'}
    </div>

    <div class="card">
      <div class="section-title" style="margin-top:0">
        <h2>Prélèvements récurrents</h2>
        <button class="link-btn" data-add-recurring="prelevement">+ Ajouter</button>
      </div>
      ${prelevements.length?prelevements.map(recurringCard).join(""):'<div class="empty">Aucun prélèvement récurrent</div>'}
    </div>

    <button class="fab" id="generateMonthBtn">Ajouter les récurrents au mois</button>
    <div class="meta" style="padding:0 8px 16px">Les doublons déjà générés pour le mois sont ignorés.</div>
    <button class="secondary-btn" id="resetBtn">Recharger les données d'exemple</button>
  `;
}

function recurringFormView(type, id=null){
  const r=id ? state.recurring.find(x=>x.id===id) : null;
  const isRecette=type==="recette";
  return `
    <div class="card form-card">
      <div class="section-title" style="margin-top:0"><h2>${r?"Modifier":"Ajouter"} ${isRecette?"une recette":"un prélèvement"} récurrent${isRecette?"e":""}</h2></div>
      <form id="recurringForm">
        <input type="hidden" id="recurringId" value="${r?r.id:""}">
        <input type="hidden" id="recurringType" value="${type}">
        <label>Libellé
          <input id="recurringLabel" type="text" required value="${r?escapeHtml(r.label):""}" placeholder="${isRecette?"Pension retraite":"EDF"}">
        </label>
        <label>Montant habituel
          <input id="recurringAmount" type="number" inputmode="decimal" step="0.01" min="0" required value="${r?r.amount:""}">
        </label>
        <label>Jour habituel du mois
          <input id="recurringDay" type="number" min="1" max="31" required value="${r?r.day:1}">
        </label>
        <button class="primary" type="submit">${r?"Enregistrer les modifications":"Ajouter"}</button>
      </form>
      <button class="secondary-btn" style="margin-top:10px" data-jump="settings">Annuler</button>
    </div>
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
  if(view==="recurringForm") app.innerHTML=recurringFormView(options.type,options.id||null);
  bind();
}

function bind(){
  document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>render(b.dataset.jump));
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>render(b.dataset.view));
  const add=document.getElementById("addBtn"); if(add) add.onclick=()=>render("add",{type:"depense"});
  const stAdd=document.getElementById("statementAddBtn"); if(stAdd) stAdd.onclick=()=>render("add",{type:"prelevement",unknown:true});
  const reset=document.getElementById("resetBtn"); if(reset) reset.onclick=resetDemo;
  const gen=document.getElementById("generateMonthBtn"); if(gen) gen.onclick=generateRecurringForMonth;

  document.querySelectorAll("[data-add-recurring]").forEach(b=>b.onclick=()=>render("recurringForm",{type:b.dataset.addRecurring}));
  document.querySelectorAll("[data-edit-recurring]").forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.editRecurring); const r=state.recurring.find(x=>x.id===id);
    if(r) render("recurringForm",{type:r.type,id});
  });
  document.querySelectorAll("[data-delete-recurring]").forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.deleteRecurring);
    if(confirm("Supprimer ce modèle récurrent ?")){
      state.recurring=state.recurring.filter(x=>x.id!==id); save(); render("settings");
    }
  });

  document.querySelectorAll("[data-point]").forEach(cb=>{
    cb.onchange=()=>{
      const id=Number(cb.dataset.point);
      const tx=state.transactions.find(x=>x.id===id);
      if(tx){ tx.pointed=true; save(); render("statement"); }
    };
  });

  const recurringForm=document.getElementById("recurringForm");
  if(recurringForm){
    recurringForm.onsubmit=e=>{
      e.preventDefault();
      const idVal=document.getElementById("recurringId").value;
      const type=document.getElementById("recurringType").value;
      const obj={
        id:idVal?Number(idVal):Date.now(),
        type,
        label:document.getElementById("recurringLabel").value.trim(),
        amount:Number(document.getElementById("recurringAmount").value),
        day:Number(document.getElementById("recurringDay").value),
        payment:type==="recette"?"Virement":"Prélèvement"
      };
      if(idVal){
        const i=state.recurring.findIndex(x=>x.id===obj.id); if(i>=0) state.recurring[i]=obj;
      } else state.recurring.push(obj);
      save(); render("settings");
    };
  }

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
      state.transactions.push(tx); save(); render(tx.unknown?"statement":"home");
    };
  }

  const q=document.getElementById("q");
  if(q){
    ["q","typeFilter","payFilter","minFilter","maxFilter","fromFilter","toFilter"].forEach(id=>{
      const el=document.getElementById(id); el.addEventListener("input",applySearch); el.addEventListener("change",applySearch);
    });
  }
}

function generateRecurringForMonth(){
  const now=new Date();
  // Prototype anchored to current device month.
  const y=now.getFullYear(), m=now.getMonth();
  let added=0;
  state.recurring.forEach(r=>{
    const maxDay=new Date(y,m+1,0).getDate();
    const day=Math.min(r.day,maxDay);
    const d=`${y}-${String(m+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    const exists=state.transactions.some(t=>t.recurringId===r.id && t.date.slice(0,7)===d.slice(0,7));
    if(!exists){
      state.transactions.push({
        id:Date.now()+Math.floor(Math.random()*100000),
        date:d,label:r.label,type:r.type,amount:r.amount,payment:r.payment,
        pointed:false,unknown:false,recurringId:r.id
      });
      added++;
    }
  });
  save();
  alert(added ? `${added} opération(s) récurrente(s) ajoutée(s) au mois.` : "Tous les récurrents de ce mois sont déjà présents.");
  render("home");
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
function resetDemo(){
  state={transactions:[...demoData.map(x=>({...x}))],recurring:[...demoRecurring.map(x=>({...x}))]};
  save(); render("home");
}
document.getElementById("seedBtn").onclick=resetDemo;
render();
