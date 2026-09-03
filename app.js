const STORAGE_KEY = "mamie-banque-v2";
const STORAGE_PREFIX = "mamie-banque";
const BACKUP_PREFIX = "mamie-banque-backup-";

// We keep only a signature to recognize the old demonstration dataset.
// No demonstration amounts/data can ever be reloaded by this version.
const DEMO_SIGNATURE = {
  recurring: ["Pension retraite","Pension de réversion","EDF","Mutuelle","Téléphone","Assurance habitation"],
  transactions: ["Pension retraite","Carrefour","Mutuelle","EDF","Pharmacie","PRLV SEPA XYZ"]
};

function emptyState(){
  return {transactions:[], recurring:[]};
}

function isValidState(value){
  return !!value && typeof value==="object" &&
    Array.isArray(value.transactions) && Array.isArray(value.recurring);
}

function cloneState(value){
  return JSON.parse(JSON.stringify(value));
}

function parseStoredState(raw){
  if(!raw) return null;
  try{
    const parsed=JSON.parse(raw);
    return isValidState(parsed) ? parsed : null;
  }catch{
    return null;
  }
}

function load(){
  // IMPORTANT: lecture uniquement. Jamais d'écriture, jamais de données d'exemple.
  const raw=localStorage.getItem(STORAGE_KEY);
  const parsed=parseStoredState(raw);
  return parsed ? parsed : emptyState();
}

function makeBackupKey(reason="securite"){
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const safeReason=String(reason).replace(/[^a-zA-Z0-9_-]/g,"-").slice(0,40) || "securite";
  let key=`${BACKUP_PREFIX}${stamp}-${safeReason}`;
  let i=1;
  while(localStorage.getItem(key)!==null){
    key=`${BACKUP_PREFIX}${stamp}-${safeReason}-${i++}`;
  }
  return key;
}

function backupCurrentStorage(reason="avant-modification"){
  const raw=localStorage.getItem(STORAGE_KEY);
  if(raw===null) return null;
  const key=makeBackupKey(reason);
  // Copie exacte de la valeur actuelle. On ne modifie ni ne supprime la clé source.
  localStorage.setItem(key, raw);
  return key;
}

function save(reason="avant-modification"){
  // Toute modification persistée commence par une copie de sécurité de l'état
  // actuellement enregistré sous mamie-banque-v2.
  backupCurrentStorage(reason);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function listMamieStorage(){
  const items=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const raw=localStorage.getItem(key);
    const parsed=parseStoredState(raw);
    items.push({
      key,
      raw,
      parsed,
      bytes: raw ? new Blob([raw]).size : 0
    });
  }
  return items.sort((a,b)=>{
    if(a.key===STORAGE_KEY) return -1;
    if(b.key===STORAGE_KEY) return 1;
    return a.key.localeCompare(b.key);
  });
}

function looksLikeOldDemo(data){
  if(!isValidState(data)) return false;
  const r=(data.recurring||[]).map(x=>x&&x.label).filter(Boolean);
  const t=(data.transactions||[]).map(x=>x&&x.label).filter(Boolean);
  const recurringMatches=DEMO_SIGNATURE.recurring.filter(x=>r.includes(x)).length;
  const txMatches=DEMO_SIGNATURE.transactions.filter(x=>t.includes(x)).length;
  return recurringMatches>=5 && txMatches>=4;
}

function storageSummary(item){
  if(!item.parsed){
    return {valid:false, tx:0, recurring:0, labels:"", demo:false};
  }
  const labels=(item.parsed.recurring||[]).map(r=>r.label).filter(Boolean).slice(0,8);
  return {
    valid:true,
    tx:item.parsed.transactions.length,
    recurring:item.parsed.recurring.length,
    labels:labels.join(" · "),
    demo:looksLikeOldDemo(item.parsed)
  };
}

function recoveryPanelHtml(){
  const items=listMamieStorage();
  if(!items.length){
    return '<div class="notice">Aucune clé localStorage commençant par « mamie-banque » n’a été trouvée sur cet appareil et dans ce navigateur.</div>';
  }
  return `<div class="card">
    <div class="section-title" style="margin-top:0"><h2>Données trouvées sur cet iPhone</h2></div>
    <div class="meta" style="margin-bottom:10px">
      Rien n’est supprimé. « Récupérer » copie la version choisie vers la version actuelle après avoir sauvegardé l’état actuel.
    </div>
    ${items.map((item,index)=>{
      const s=storageSummary(item);
      const current=item.key===STORAGE_KEY;
      const size=(item.bytes/1024).toFixed(1);
      return `<div class="recurring-item" style="align-items:flex-start">
        <div style="min-width:0;flex:1">
          <strong>${escapeHtml(item.key)}</strong>
          <div class="meta">${current?"Clé utilisée actuellement · ":""}${size} Ko</div>
          ${s.valid
            ? `<div class="meta">${s.tx} opération(s) · ${s.recurring} récurrent(s)</div>
               ${s.labels?`<div class="meta" style="margin-top:4px">${escapeHtml(s.labels)}</div>`:""}
               ${s.demo?'<div class="notice orange" style="margin-top:8px">Cette version ressemble fortement aux anciennes données d’exemple.</div>':""}`
            : '<div class="notice orange" style="margin-top:8px">Contenu non reconnu comme une sauvegarde Mamie à la banque.</div>'}
        </div>
        <div class="recurring-actions">
          ${s.valid?`<button class="mini-btn" data-preview-storage="${index}">Voir</button>`:""}
          ${s.valid && !current?`<button class="mini-btn" data-recover-storage="${index}">Récupérer</button>`:""}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function previewStorage(index){
  const items=listMamieStorage();
  const item=items[index];
  if(!item || !item.parsed) return;
  const s=storageSummary(item);
  const recurring=(item.parsed.recurring||[]).map(r=>`${r.label || "Sans libellé"} — ${euro(Number(r.amount)||0)}`).join("\n");
  const tx=(item.parsed.transactions||[]).slice(0,20).map(t=>`${t.date || "?"} — ${t.label || "Sans libellé"} — ${euro(Number(t.amount)||0)}`).join("\n");
  alert(
    `Clé : ${item.key}\n\n`+
    `${s.tx} opération(s) · ${s.recurring} récurrent(s)`+
    `${s.demo?"\n⚠ Cette version ressemble aux anciennes données d’exemple.":""}`+
    `\n\nRÉCURRENTS\n${recurring || "(aucun)"}`+
    `\n\n20 PREMIÈRES OPÉRATIONS\n${tx || "(aucune)"}`
  );
}

function recoverStorage(index){
  const items=listMamieStorage();
  const item=items[index];
  if(!item || !item.parsed) return;
  const s=storageSummary(item);
  const warning=s.demo
    ? "\n\nATTENTION : cette version ressemble fortement aux anciennes données d’exemple."
    : "";
  if(!confirm(
    `Récupérer les données de « ${item.key} » ?\n\n`+
    `${s.tx} opération(s) et ${s.recurring} récurrent(s).`+
    warning+
    `\n\nL’état actuel sera sauvegardé avant la récupération. L’ancienne clé restera intacte.`
  )) return;

  // Sauvegarde explicite avant récupération.
  backupCurrentStorage("avant-recuperation");
  state=cloneState(item.parsed);
  // Écriture directe : on vient déjà de sauvegarder l'état courant juste au-dessus.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  alert(`Données récupérées depuis « ${item.key} ».\nL’ancienne clé n’a pas été modifiée.`);
  render("settings");
}

function exportCurrentBackup(){
  const payload={
    app:"Mamie à la banque",
    exportedAt:new Date().toISOString(),
    storageKey:STORAGE_KEY,
    state:cloneState(state)
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=`mamie-a-la-banque-sauvegarde-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

let state = load();
let currentView = "home";

// Neutralisation du bouton ↻ historique présent dans index.html.
const legacySeedBtn=document.getElementById("seedBtn");
if(legacySeedBtn){
  legacySeedBtn.onclick=null;
  legacySeedBtn.disabled=true;
  legacySeedBtn.hidden=true;
  legacySeedBtn.setAttribute("aria-hidden","true");
}

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

const MONTH_NAMES=["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Août","Sep","Oct","Nov","Déc"];
function freqLabel(r){
  const f=r.frequency||"monthly";
  if(f==="monthly") return "Mensuel";
  if(f==="bimonthly") return "Tous les 2 mois";
  if(f==="quarterly") return "Trimestriel";
  if(f==="semiannual") return "Semestriel";
  if(f==="annual") return "Annuel";
  return "Mois personnalisés";
}
function occurrencesPerYear(r){
  const f=r.frequency||"monthly";
  if(f==="monthly") return 12;
  if(f==="bimonthly") return 6;
  if(f==="quarterly") return 4;
  if(f==="semiannual") return 2;
  if(f==="annual") return 1;
  return (r.months||[]).length || 1;
}
function monthlyProvision(r){
  if(r.type!=="prelevement" || (r.frequency||"monthly")==="monthly") return 0;
  return r.amount*occurrencesPerYear(r)/12;
}
function monthApplies(r, monthIndex){
  const f=r.frequency||"monthly";
  if(f==="monthly") return true;
  const months=(r.months||[]).map(Number);
  if(months.length) return months.includes(monthIndex+1);
  const interval={bimonthly:2,quarterly:3,semiannual:6,annual:12}[f]||1;
  return monthIndex%interval===0;
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


function isLegacyDemoRecurring(r){
  const demos=[
    [101,"recette","Pension retraite",2100],
    [102,"recette","Pension de réversion",620],
    [201,"prelevement","EDF",57.90],
    [202,"prelevement","Mutuelle",78.50],
    [203,"prelevement","Téléphone",25.99],
    [204,"prelevement","Assurance habitation",19.90]
  ];
  return demos.some(([id,type,label,amount]) =>
    Number(r.id)===id &&
    r.type===type &&
    r.label===label &&
    Math.abs(Number(r.amount)-amount)<0.001
  );
}

function isLegacyDemoTransaction(t){
  const demos=[
    [1,"2026-09-01","Pension retraite","recette",2100],
    [2,"2026-09-02","Carrefour","depense",45.62],
    [3,"2026-09-05","Mutuelle","prelevement",78.50],
    [4,"2026-09-05","EDF","prelevement",57.90],
    [5,"2026-09-06","Pharmacie","depense",23.80],
    [6,"2026-09-07","PRLV SEPA XYZ","prelevement",37.90]
  ];
  return demos.some(([id,date,label,type,amount]) =>
    Number(t.id)===id &&
    t.date===date &&
    t.label===label &&
    t.type===type &&
    Math.abs(Number(t.amount)-amount)<0.001
  );
}

function currentMonthContext(){
  const now=new Date();
  const y=now.getFullYear();
  const m=now.getMonth();
  const prefix=`${y}-${String(m+1).padStart(2,"0")}`;
  const monthTx=state.transactions.filter(t =>
    !isLegacyDemoTransaction(t) &&
    typeof t.date==="string" &&
    t.date.slice(0,7)===prefix
  );
  const recurring=state.recurring.filter(r=>!isLegacyDemoRecurring(r));
  return {y,m,prefix,monthTx,recurring};
}

function actualOrExpectedRecurringAmount(r, monthTx){
  const actual=monthTx.filter(t=>Number(t.recurringId)===Number(r.id) && t.type===r.type);
  if(actual.length) return actual.reduce((s,t)=>s+(Number(t.amount)||0),0);
  return Number(r.amount)||0;
}

function homeView(){
  const {m,monthTx,recurring}=currentMonthContext();

  const recurringRecettes=recurring.filter(r=>r.type==="recette" && monthApplies(r,m));
  const recurringPrelevements=recurring.filter(r=>r.type==="prelevement" && monthApplies(r,m));

  const linkedRecurringIds=new Set(recurring.map(r=>Number(r.id)));
  const extraRecettes=monthTx.filter(t=>t.type==="recette" && !linkedRecurringIds.has(Number(t.recurringId)));
  const extraPrelevements=monthTx.filter(t=>t.type==="prelevement" && !linkedRecurringIds.has(Number(t.recurringId)));

  const rec =
    recurringRecettes.reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx),0) +
    extraRecettes.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const dep=monthTx
    .filter(t=>t.type==="depense")
    .reduce((s,t)=>s+(Number(t.amount)||0),0);

  const pre =
    recurringPrelevements.reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx),0) +
    extraPrelevements.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const monthlyPreBudget =
    recurring
      .filter(r=>r.type==="prelevement" && (r.frequency||"monthly")==="monthly")
      .reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx),0) +
    extraPrelevements.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const provisions=recurring
    .filter(r=>r.type==="prelevement")
    .reduce((s,r)=>s+monthlyProvision(r),0);

  const available=rec-dep-monthlyPreBudget-provisions;

  return `
    <section class="hero card">
      <small>Disponible à dépenser</small>
      <div class="balance">${euro(available)}</div>
      <div class="meta" style="color:#d7efef">Recettes du mois − dépenses − prélèvements mensuels − provisions</div>
    </section>
    <section class="grid">
      <div class="stat"><small>Recettes</small><strong class="green">${euro(rec)}</strong></div>
      <div class="stat"><small>Dépenses</small><strong class="red">${euro(dep)}</strong></div>
      <div class="stat"><small>Prélèvements</small><strong class="blue">${euro(pre)}</strong></div>
    </section>
    <section class="card provision-card">
      <div><small>Mis de côté chaque mois</small><strong class="orange">${euro(provisions)}</strong></div>
      <div class="meta">Pour préparer les prélèvements trimestriels, semestriels, annuels ou personnalisés.</div>
    </section>
    <button class="fab" id="addBtn">+ Ajouter une dépense</button>
    <section class="section-title"><h2>Dernières opérations du mois</h2><button class="link-btn" data-jump="search">Voir tout</button></section>
    ${renderTxList(sortedTx(monthTx).slice(0,5))}
  `;
}

function expensesView(){
  const {monthTx}=currentMonthContext();
  return `
    <section class="section-title"><h2>Dépenses du mois</h2></section>
    <button class="fab" id="addBtn">+ Ajouter une dépense</button>
    ${renderTxList(monthTx.filter(x=>x.type==="depense"))}
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

  // Toujours offrir une sortie claire de l’écran de saisie sans enregistrer.
  const cancel=document.createElement("button");
  cancel.type="button";
  cancel.className="secondary-btn transaction-cancel-btn";
  cancel.dataset.jump=unknown ? "statement" : "home";
  cancel.textContent="Annuler";
  cancel.style.marginTop="10px";
  const submitBtn=form.querySelector('button[type="submit"]');
  if(submitBtn) submitBtn.insertAdjacentElement("afterend", cancel);
  else form.appendChild(cancel);

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
        <input id="fromFilter" type="text" inputmode="numeric" placeholder="Du (JJ/MM/AAAA)" autocomplete="off" />
        <input id="toFilter" type="text" inputmode="numeric" placeholder="Au (JJ/MM/AAAA)" autocomplete="off" />
      </div>
    </div>
    <div id="searchResults">${renderTxList(state.transactions)}</div>
  `;
}

function recurringCard(r){
  const provision=monthlyProvision(r);
  const months=(r.months||[]).map(m=>MONTH_NAMES[m-1]).join(", ");
  return `
    <div class="recurring-item">
      <div>
        <strong>${escapeHtml(r.label)}</strong>
        <div class="meta">${freqLabel(r)} · vers le ${r.day} ${months? "· "+months:""}</div>
        ${provision?`<div class="provision-line">À provisionner : <strong>${euro(provision)}/mois</strong></div>`:""}
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
    <div class="card" style="margin-top:16px">
      <div class="section-title" style="margin-top:0"><h2>Sauvegarde et récupération</h2></div>
      <div class="meta" style="margin-bottom:10px">Recherche toutes les anciennes clés localStorage commençant par « mamie-banque ». Aucune clé n’est supprimée.</div>
      <button class="secondary-btn" id="scanStorageBtn">Rechercher mes anciennes données</button>
      <button class="secondary-btn" id="exportBackupBtn" style="margin-top:10px">Télécharger une sauvegarde de l’état actuel</button>
    </div>
    <div id="recoveryPanel"></div>
  `;
}

function recurringFormView(type, id=null){
  const r=id ? state.recurring.find(x=>x.id===id) : null;
  const isRecette=type==="recette";
  const freq=(r&&r.frequency)||"monthly";
  const selected=(r&&r.months)||[];
  return `
    <div class="card form-card">
      <div class="section-title" style="margin-top:0"><h2>${r?"Modifier":"Ajouter"} ${isRecette?"une recette":"un prélèvement"} récurrent${isRecette?"e":""}</h2></div>
      <form id="recurringForm">
        <input type="hidden" id="recurringId" value="${r?r.id:""}">
        <input type="hidden" id="recurringType" value="${type}">
        <label>Libellé<input id="recurringLabel" type="text" required value="${r?escapeHtml(r.label):""}" placeholder="${isRecette?"Pension retraite":"Assurance"}"></label>
        <label>Montant à chaque échéance<input id="recurringAmount" type="number" inputmode="decimal" step="0.01" min="0" required value="${r?r.amount:""}"></label>
        <label>Fréquence
          <select id="recurringFrequency">
            <option value="monthly" ${freq==="monthly"?"selected":""}>Mensuel</option>
            <option value="bimonthly" ${freq==="bimonthly"?"selected":""}>Tous les 2 mois</option>
            <option value="quarterly" ${freq==="quarterly"?"selected":""}>Trimestriel</option>
            <option value="semiannual" ${freq==="semiannual"?"selected":""}>Semestriel</option>
            <option value="annual" ${freq==="annual"?"selected":""}>Annuel</option>
            <option value="custom" ${freq==="custom"?"selected":""}>Mois personnalisés</option>
          </select>
        </label>
        <label>Jour habituel du mois<input id="recurringDay" type="number" min="1" max="31" required value="${r?r.day:1}"></label>
        <div id="monthsBox" class="months-box">
          <div class="field-title">Mois de prélèvement / versement</div>
          <div class="month-grid">
            ${MONTH_NAMES.map((n,i)=>`<label class="month-chip"><input type="checkbox" value="${i+1}" ${selected.includes(i+1)?"checked":""}>${n}</label>`).join("")}
          </div>
          <div class="meta">Pour un semestriel, coche par exemple Mars et Septembre.</div>
        </div>
        <div id="provisionPreview" class="notice orange"></div>
        <button class="primary" type="submit">${r?"Enregistrer les modifications":"Ajouter"}</button>
      </form>
      <button class="secondary-btn" style="margin-top:10px" data-jump="settings">Annuler</button>
    </div>
  `;
}


function exportBackup(){
  try{
    const payload={
      app:"Mamie à la banque",
      version:1,
      exportedAt:new Date().toISOString(),
      storageKey:STORAGE_KEY,
      data:JSON.parse(JSON.stringify(state))
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const d=new Date();
    const stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}-${String(d.getMinutes()).padStart(2,"0")}`;
    a.href=url;
    a.download=`mamie-banque-sauvegarde-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    alert("Sauvegarde créée. Conserve bien le fichier téléchargé.");
  }catch(err){
    alert("Impossible de créer la sauvegarde : "+err.message);
  }
}

function importBackupFile(file){
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(reader.result);
      const incoming=parsed && parsed.data ? parsed.data : parsed;
      if(!incoming || !Array.isArray(incoming.transactions) || !Array.isArray(incoming.recurring)){
        throw new Error("Ce fichier n’est pas une sauvegarde Mamie à la banque valide.");
      }

      // Copie de sécurité de l'état actuel AVANT toute restauration.
      const stamp=new Date().toISOString().replace(/[:.]/g,"-");
      localStorage.setItem(`mamie-banque-backup-avant-restauration-${stamp}`, JSON.stringify(state));

      const nbTx=incoming.transactions.length;
      const nbRec=incoming.recurring.length;
      if(!confirm(`Restaurer cette sauvegarde ?\n\n${nbTx} opération(s)\n${nbRec} récurrent(s)\n\nL’état actuel sera conservé dans une sauvegarde de sécurité.`)){
        return;
      }

      state=JSON.parse(JSON.stringify(incoming));
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      alert("Sauvegarde restaurée avec succès.");
      render("home");
    }catch(err){
      alert(err.message || "Impossible de restaurer cette sauvegarde.");
    }
  };
  reader.onerror=()=>alert("Impossible de lire le fichier.");
  reader.readAsText(file);
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
  const scan=document.getElementById("scanStorageBtn");
  if(scan) scan.onclick=()=>{
    const panel=document.getElementById("recoveryPanel");
    if(panel) panel.innerHTML=recoveryPanelHtml();
    bindRecoveryPanel();
  };
  const exp=document.getElementById("exportBackupBtn"); if(exp) exp.onclick=exportCurrentBackup;
  const gen=document.getElementById("generateMonthBtn"); if(gen) gen.onclick=generateRecurringForMonth;
  const exportBtn=document.getElementById("exportBackupBtn");
  if(exportBtn) exportBtn.onclick=exportBackup;
  const importBtn=document.getElementById("importBackupBtn");
  const importFile=document.getElementById("importBackupFile");
  if(importBtn && importFile){
    importBtn.onclick=()=>importFile.click();
    importFile.onchange=()=>{ importBackupFile(importFile.files && importFile.files[0]); importFile.value=""; };
  }


  bindRecoveryPanel();

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
    const refreshProvision=()=>{
      const type=document.getElementById("recurringType").value;
      const amount=Number(document.getElementById("recurringAmount").value)||0;
      const frequency=document.getElementById("recurringFrequency").value;
      const months=[...document.querySelectorAll("#monthsBox input:checked")].map(x=>Number(x.value));
      const temp={type,amount,frequency,months};
      const preview=document.getElementById("provisionPreview");
      const p=monthlyProvision(temp);
      preview.style.display=(type==="prelevement" && frequency!=="monthly")?"block":"none";
      preview.innerHTML=p?`Budget : <strong>${euro(p)} par mois</strong> seront réservés pour cette dépense.`:"";
    };
    ["recurringAmount","recurringFrequency"].forEach(id=>document.getElementById(id).addEventListener("input",refreshProvision));
    document.querySelectorAll("#monthsBox input").forEach(x=>x.addEventListener("change",refreshProvision));
    refreshProvision();
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
        payment:type==="recette"?"Virement":"Prélèvement",
        frequency:document.getElementById("recurringFrequency").value,
        months:[...document.querySelectorAll("#monthsBox input:checked")].map(x=>Number(x.value))
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

function bindRecoveryPanel(){
  document.querySelectorAll("[data-preview-storage]").forEach(b=>{
    b.onclick=()=>previewStorage(Number(b.dataset.previewStorage));
  });
  document.querySelectorAll("[data-recover-storage]").forEach(b=>{
    b.onclick=()=>recoverStorage(Number(b.dataset.recoverStorage));
  });
}

function generateRecurringForMonth(){
  const now=new Date();
  // Prototype anchored to current device month.
  const y=now.getFullYear(), m=now.getMonth();
  let added=0;
  state.recurring.forEach(r=>{
    if(!monthApplies(r,m)) return;
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

function frDateToIso(value){
  const v=String(value||"").trim();
  if(!v) return "";
  const m=v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if(!m) return null;
  const d=Number(m[1]), mo=Number(m[2]), y=Number(m[3]);
  const dt=new Date(y,mo-1,d);
  if(dt.getFullYear()!==y || dt.getMonth()!==mo-1 || dt.getDate()!==d) return null;
  return `${y}-${String(mo).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
}

function applySearch(){
  const q=document.getElementById("q").value.trim().toLowerCase();
  const t=document.getElementById("typeFilter").value;
  const p=document.getElementById("payFilter").value;
  const min=parseFloat(document.getElementById("minFilter").value);
  const max=parseFloat(document.getElementById("maxFilter").value);
  const from=frDateToIso(document.getElementById("fromFilter").value);
  const to=frDateToIso(document.getElementById("toFilter").value);
  const list=state.transactions.filter(x=>{
    const matchesQ=!q || x.label.toLowerCase().includes(q) || String(x.amount).replace(".",",").includes(q) || String(x.amount).includes(q);
    return matchesQ && (!t||x.type===t) && (!p||x.payment===p) &&
      (isNaN(min)||x.amount>=min) && (isNaN(max)||x.amount<=max) &&
      (from===null || !from || x.date>=from) && (to===null || !to || x.date<=to);
  });
  document.getElementById("searchResults").innerHTML=renderTxList(list);
}
render();
