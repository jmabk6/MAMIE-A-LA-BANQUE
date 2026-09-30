const STORAGE_KEY = "mamie-banque-v2";
const STORAGE_PREFIX = "mamie-banque";
const BACKUP_PREFIX = "mamie-banque-backup-";

// Remplaçable uniquement par la page de test sur PC ; en production, le serveur OVH.
const API_BASE = window.MAMIE_API_BASE || "https://mamie.hoteldereims.com";
const API_CODE_KEY = "mamie-banque-api-code";
let remoteReady = false;
let remoteSaving = false;
let remoteSaveAgain = false;

function getApiCode(){
  let code=localStorage.getItem(API_CODE_KEY) || "";
  if(code) return code;

  code=prompt("Code d’accès de Mamie à la banque :");
  if(code===null) return "";
  code=code.trim();

  if(code) localStorage.setItem(API_CODE_KEY,code);
  return code;
}

async function apiPost(action, extra={}){
  const code=getApiCode();
  if(!code) throw new Error("NO_CODE");

  const body=new URLSearchParams();
  body.set("action",action);
  body.set("key",code);

  Object.entries(extra).forEach(([k,v])=>body.set(k,v));

  const r=await fetch(API_BASE+"/sync.php",{
    method:"POST",
    mode:"cors",
    cache:"no-store",
    body
  });

  const j=await r.json().catch(()=>({}));

  if(r.status===401){
    localStorage.removeItem(API_CODE_KEY);
    throw new Error("BAD_CODE");
  }

  if(!r.ok || !j.ok){
    throw new Error(j.error || "REMOTE_ERROR");
  }

  return j;
}

async function loadRemote(){
  for(let attempt=0;attempt<2;attempt++){
    try{
      const j=await apiPost("load");
      if(!isValidState(j.data)) throw new Error("INVALID_STATE");

      state=cloneState(j.data);
      // Si le téléphone contient des saisies absentes du serveur (ex. version hors ligne
      // du 30/09), on les garde dans une copie de sécurité avant de les remplacer.
      const localRaw=localStorage.getItem(STORAGE_KEY);
      const remoteRaw=JSON.stringify(state);
      if(localRaw!==null && localRaw!==remoteRaw) backupCurrentStorage("avant-chargement-serveur");
      localStorage.setItem(STORAGE_KEY,remoteRaw); // cache de secours uniquement
      remoteReady=true;
      return true;
    }catch(e){
      if(e.message==="BAD_CODE" && attempt===0){
        alert("Code d’accès incorrect. Réessaie.");
        continue;
      }
      if(e.message==="NO_CODE") return false;

      alert("La sauvegarde OVH n’est pas accessible. Aucune donnée ne sera modifiée tant que la connexion n’est pas rétablie.");
      return false;
    }
  }
  return false;
}

async function saveRemote(){
  if(!remoteReady) return false;
  if(remoteSaving){
    remoteSaveAgain=true;
    return true;
  }

  remoteSaving=true;

  try{
    await apiPost("save",{data:JSON.stringify(state)});
    return true;
  }catch(e){
    if(e.message==="BAD_CODE"){
      remoteReady=false;
      alert("Le code d’accès doit être saisi de nouveau. Recharge l’application.");
    }else{
      alert("ATTENTION : la sauvegarde MySQL a échoué. Ne supprime pas l’application et réessaie avec Internet.");
    }
    return false;
  }finally{
    remoteSaving=false;
    if(remoteSaveAgain){
      remoteSaveAgain=false;
      saveRemote();
    }
  }
}

async function bootRemote(){
  const ok=await loadRemote();

  if(!ok){
    document.getElementById("app").innerHTML=
      '<div class="card"><h2>Connexion nécessaire</h2><p>Recharge la page et saisis le code d’accès avant toute saisie.</p></div>';
    return;
  }

  autoGenerateRecurring();
  render("home");
}

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
  // Double sécurité : copie locale + MySQL. MySQL est désormais la source principale.
  backupCurrentStorage(reason);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveRemote();
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
let transactionReturnView = "home";
let lastMonthKey = null;

// ---------- Comptes ----------
// Une opération ou un récurrent sans compte (saisi avant les comptes) appartient au compte Mamie.
const ACCOUNTS={mamie:"Compte Mamie", commun:"Compte commun"};
// Préférence d'affichage propre au téléphone : hors du préfixe « mamie-banque », ce n'est pas une sauvegarde.
const ACCOUNT_PREF_KEY="mb-compte-actif";
let currentAccount=(()=>{ try{ const v=localStorage.getItem(ACCOUNT_PREF_KEY); return ACCOUNTS[v]?v:"mamie"; }catch{ return "mamie"; } })();
function accountOf(x){ return x && ACCOUNTS[x.account] ? x.account : "mamie"; }
function otherAccount(a=currentAccount){ return a==="mamie"?"commun":"mamie"; }
function accountTx(list=state.transactions){ return list.filter(t=>accountOf(t)===currentAccount); }
function accountRecurring(){ return state.recurring.filter(r=>accountOf(r)===currentAccount); }
function setAccount(a){
  if(!ACCOUNTS[a] || a===currentAccount) return;
  currentAccount=a;
  try{ localStorage.setItem(ACCOUNT_PREF_KEY,a); }catch{}
  // Un formulaire en cours appartient à l'autre compte : on revient à l'accueil.
  const lists=["home","months","monthDetail","expenses","statement","search","settings"];
  render(lists.includes(currentView)?currentView:"home");
}
function openingBalance(acc=currentAccount){
  const o=(state.openingBalances||{})[acc];
  return o && /^\d{4}-\d{2}$/.test(o.month) ? {month:o.month, amount:Number(o.amount)||0} : null;
}
// ---------- Catégories ----------
// Liste modifiable dans Réglages ; tant qu'elle n'a pas été modifiée, c'est la liste par défaut.
// Un virement entre comptes n'a pas de catégorie : ce n'est pas une dépense.
const DEFAULT_CATEGORIES=["Alimentation","Essence","Petit matériel","Assurance","Téléphone","Santé / pharmacie","Énergie","Logement","Loisirs","Cadeaux","Divers"];
const NO_CATEGORY="Sans catégorie";
function categories(){ return Array.isArray(state.categories) ? state.categories : DEFAULT_CATEGORIES.slice(); }
function categorySelectHtml(id, selected){
  const list=categories();
  const extra=selected && !list.includes(selected) ? [selected] : [];
  return `<select id="${id}" required>
    <option value="" ${selected?"":"selected"} disabled>Choisir une catégorie…</option>
    ${[...list,...extra].map(c=>`<option ${c===selected?"selected":""}>${escapeHtml(c)}</option>`).join("")}
  </select>`;
}
function localMonthKey(d=new Date()){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

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

function normalizeLabel(value){
  return String(value||"").trim().toLocaleUpperCase("fr-FR");
}
function recurringSchedule(r){
  if(Array.isArray(r.schedule) && r.schedule.length){
    return r.schedule
      .map(x=>({month:Number(x.month),day:Number(x.day),amount:Number(x.amount)}))
      .filter(x=>x.month>=1 && x.month<=12 && x.day>=1 && x.day<=31 && Number.isFinite(x.amount));
  }
  const months=(r.months||[]).map(Number).filter(m=>m>=1&&m<=12);
  if((r.frequency||"monthly")==="monthly") return [];
  const fallbackMonths=months.length ? months : Array.from({length:occurrencesPerYear(r)},(_,i)=>1+i*Math.max(1,Math.floor(12/occurrencesPerYear(r))));
  return fallbackMonths.map(month=>({month,day:Number(r.day)||1,amount:Number(r.amount)||0}));
}
function expectedRecurringForMonth(r, monthIndex){
  const schedule=recurringSchedule(r);
  if(schedule.length){
    const x=schedule.find(e=>e.month===monthIndex+1);
    return x || null;
  }
  if(monthApplies(r,monthIndex)) return {month:monthIndex+1,day:Number(r.day)||1,amount:Number(r.amount)||0};
  return null;
}


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
  const schedule=recurringSchedule(r);
  if(schedule.length) return schedule.reduce((sum,x)=>sum+(Number(x.amount)||0),0)/12;
  return (Number(r.amount)||0)*occurrencesPerYear(r)/12;
}
function monthApplies(r, monthIndex){
  const f=r.frequency||"monthly";
  if(f==="monthly") return true;
  const schedule=recurringSchedule(r);
  if(schedule.length) return schedule.some(x=>x.month===monthIndex+1);
  const months=(r.months||[]).map(Number);
  if(months.length) return months.includes(monthIndex+1);
  const interval={bimonthly:2,quarterly:3,semiannual:6,annual:12}[f]||1;
  return monthIndex%interval===0;
}
function renderTxList(list, showAccount=false){
  if(!list.length) return '<div class="empty">Aucune opération</div>';
  return `<div class="card">${sortedTx(list).map(tx=>`
    <div class="tx tx-editable" data-edit-tx="${tx.id}" role="button" tabindex="0" aria-label="Modifier ${escapeHtml(tx.label)}">
      <div class="tx-main">
        <strong>${escapeHtml(tx.label)} ${statusBadge(tx)}</strong>
        <div class="meta">${showAccount?`<span class="acc-tag">${accountOf(tx)==="mamie"?"MAMIE":"COMMUN"}</span> `:""}${fmtDate(tx.date)} · ${escapeHtml(tx.payment)}${tx.transferId ? "" : ` · ${escapeHtml(tx.category||NO_CATEGORY)}`}${tx.period && tx.period!==String(tx.date).slice(0,7) ? ` · échéance ${MONTH_FULL[Number(tx.period.slice(5))-1].toLowerCase()}` : ""}</div>
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
  const monthTx=accountTx().filter(t =>
    !isLegacyDemoTransaction(t) &&
    typeof t.date==="string" &&
    t.date.slice(0,7)===prefix
  );
  const recurring=accountRecurring().filter(r=>!isLegacyDemoRecurring(r));
  return {y,m,prefix,monthTx,recurring};
}

function actualOrExpectedRecurringAmount(r, monthTx, monthIndex){
  const actual=monthTx.filter(t=>String(t.recurringId)===String(r.id) && t.type===r.type);
  if(actual.length) return actual.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const occurrence=expectedRecurringForMonth(r,monthIndex);
  if(occurrence) return Number(occurrence.amount)||0;

  return 0;
}

function homeView(){
  const {m,monthTx,recurring}=currentMonthContext();

  const recurringRecettes=recurring.filter(r=>r.type==="recette" && monthApplies(r,m));
  const recurringPrelevements=recurring.filter(r=>r.type==="prelevement" && monthApplies(r,m));

  const linkedRecurringIds=new Set(recurring.map(r=>Number(r.id)));
  const extraRecettes=monthTx.filter(t=>t.type==="recette" && !linkedRecurringIds.has(Number(t.recurringId)));
  const extraPrelevements=monthTx.filter(t=>t.type==="prelevement" && !linkedRecurringIds.has(Number(t.recurringId)));

  const rec =
    recurringRecettes.reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx,m),0) +
    extraRecettes.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const dep=monthTx
    .filter(t=>t.type==="depense")
    .reduce((s,t)=>s+(Number(t.amount)||0),0);

  const pre =
    recurringPrelevements.reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx,m),0) +
    extraPrelevements.reduce((s,t)=>s+(Number(t.amount)||0),0);

  const monthlyPreBudget =
    recurring
      .filter(r=>r.type==="prelevement" && (r.frequency||"monthly")==="monthly")
      .reduce((s,r)=>s+actualOrExpectedRecurringAmount(r,monthTx,m),0) +
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

function addView(defaultType="depense", unknown=false, editId=null){
  const existing = editId!==null
    ? state.transactions.find(x=>String(x.id)===String(editId))
    : null;

  const tx = existing || {
    id:"",
    type:defaultType,
    date:new Date().toISOString().slice(0,10),
    label:"",
    amount:"",
    payment:defaultType==="prelevement" ? "Prélèvement" : defaultType==="recette" ? "Virement" : "Carte bancaire",
    unknown:!!unknown
  };

  const type = tx.type || "depense";
  const payment = tx.payment || "Carte bancaire";
  const payments=["Carte bancaire","Prélèvement","Virement","Espèces","Chèque"];

  return `
    <form id="transactionForm" class="card form-card" data-edit-id="${existing ? escapeHtml(String(existing.id)) : ""}">
      <div class="segmented" id="typeSegment">
        <button type="button" data-type="depense" class="${type==="depense"?"active":""}">Dépense</button>
        <button type="button" data-type="recette" class="${type==="recette"?"active":""}">Recette</button>
        <button type="button" data-type="prelevement" class="${type==="prelevement"?"active":""}">Prélèvement</button>
        ${existing ? "" : `<button type="button" data-type="transfert">Virement vers ${ACCOUNTS[otherAccount()]}</button>`}
      </div>

      <input type="hidden" id="type" value="${escapeHtml(type)}" />

      <label>Date
        <input id="date" type="date" required value="${escapeHtml(tx.date || "")}" />
      </label>

      <label>Enseigne / Libellé
        <input id="label" type="text" required
               value="${escapeHtml(tx.label || "")}"
               placeholder="CARREFOUR, EDF…" style="text-transform:uppercase" />
      </label>

      <label>Montant TTC
        <input id="amount" type="number" inputmode="decimal" step="0.01" min="0" required
               value="${tx.amount === "" ? "" : escapeHtml(String(tx.amount))}"
               placeholder="0,00" />
      </label>

      <label>Mode de paiement
        <select id="payment">
          ${payments.map(p=>`<option ${p===payment?"selected":""}>${escapeHtml(p)}</option>`).join("")}
        </select>
      </label>

      ${tx.transferId ? "" : `<label id="categoryField">Catégorie ${categorySelectHtml("category", tx.category||"")}</label>`}

      <label class="check-row">
        <input id="unknown" type="checkbox" ${tx.unknown ? "checked" : ""} />
        Ajouté depuis le relevé / inconnu
      </label>

      <button class="primary" type="submit">
        ${existing ? "Enregistrer les modifications" : "Enregistrer"}
      </button>
      ${existing ? `<button class="secondary-btn danger transaction-delete-btn" type="button"
              data-transaction-delete="1" style="margin-top:10px">
        Supprimer cette opération
      </button>` : ""}
      <button class="secondary-btn transaction-cancel-btn" type="button"
              data-transaction-cancel="1" style="margin-top:10px">
        Annuler
      </button>
    </form>
  `;
}
// ---------- Mois : soldes bancaires ----------
// Le solde suit le compte en banque : les espèces n'y passent pas.
// L'écran Mois a ses propres onglets : un compte, ou « global » (les deux additionnés).
const MONTH_FULL=["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
let monthsScope=null; // "mamie" | "commun" | "global" ; null = suit le compte choisi
function currentMonthsScope(){ return monthsScope==="global" ? "global" : currentAccount; }
function scopeAccounts(scope){ return scope==="global" ? Object.keys(ACCOUNTS) : [scope]; }
function monthTitle(key){ const [y,m]=key.split("-").map(Number); return `${MONTH_FULL[m-1]} ${y}`; }
function datedAccountTx(acc){
  return state.transactions.filter(t=>accountOf(t)===acc && !isLegacyDemoTransaction(t) &&
    typeof t.date==="string" && /^\d{4}-\d{2}/.test(t.date));
}
function bankEffect(t){
  if(t.payment==="Espèces") return 0;
  const a=Number(t.amount)||0;
  return t.type==="recette" ? a : -a;
}
function monthRange(scope){
  const keys=[localMonthKey()];
  scopeAccounts(scope).forEach(acc=>{
    datedAccountTx(acc).forEach(t=>keys.push(t.date.slice(0,7)));
    const o=openingBalance(acc); if(o) keys.push(o.month);
  });
  keys.sort();
  const out=[];
  let [y,m]=keys[0].split("-").map(Number);
  const last=keys[keys.length-1];
  for(let k=keys[0]; k<=last; k=`${y}-${String(m).padStart(2,"0")}`){
    out.push(k);
    m++; if(m===13){ m=1; y++; }
  }
  return out;
}
function monthStartBalance(key, acc){
  // Solde au 1er du mois = solde de départ ± opérations entre le mois de départ et ce mois.
  const o=openingBalance(acc);
  if(!o) return null;
  let bal=o.amount;
  datedAccountTx(acc).forEach(t=>{
    const k=t.date.slice(0,7);
    if(k>=o.month && k<key) bal+=bankEffect(t);
    else if(k>=key && k<o.month) bal-=bankEffect(t);
  });
  return bal;
}
function accountMonthSummary(key, acc){
  const tx=datedAccountTx(acc).filter(t=>t.date.slice(0,7)===key);
  const start=monthStartBalance(key,acc);
  // Un virement entre comptes n'est ni une recette ni une dépense : il est compté à part.
  const bank=t=>t.payment!=="Espèces" && !t.transferId;
  const sum=f=>tx.filter(f).reduce((s,t)=>s+(Number(t.amount)||0),0);
  return {
    acc, tx, start,
    end: start===null ? null : start+tx.reduce((s,t)=>s+bankEffect(t),0),
    recettes:sum(t=>bank(t)&&t.type==="recette"),
    depenses:sum(t=>bank(t)&&t.type==="depense"),
    prelevements:sum(t=>bank(t)&&t.type==="prelevement"),
    especes:sum(t=>t.payment==="Espèces"&&t.type!=="recette"),
    virements:tx.filter(t=>t.transferId).reduce((s,t)=>s+bankEffect(t),0)
  };
}
function monthSummary(key, scope){
  const parts=scopeAccounts(scope).map(acc=>accountMonthSummary(key,acc));
  if(parts.length===1) return {...parts[0], key, parts};
  // Global : les virements entre les deux comptes s'annulent, on ne les montre pas.
  const add=f=>parts.reduce((s,p)=>s+p[f],0);
  const missing=parts.some(p=>p.start===null);
  return {
    key, parts,
    tx:parts.flatMap(p=>p.tx).filter(t=>!t.transferId),
    start: missing ? null : add("start"),
    end: missing ? null : add("end"),
    recettes:add("recettes"), depenses:add("depenses"), prelevements:add("prelevements"),
    especes:add("especes"), virements:0
  };
}
let detailPayFilter="";   // "" | "Carte bancaire" | "Espèces"
let detailCatFilter="";   // "" | nom de catégorie | NO_CATEGORY
function filterTx(list){
  return list.filter(t=>
    (!detailPayFilter || t.payment===detailPayFilter) &&
    (!detailCatFilter || (t.transferId ? false : (t.category||NO_CATEGORY)===detailCatFilter)));
}
function detailFiltersHtml(tx){
  const cats=[...new Set([...categories(), ...tx.filter(t=>!t.transferId).map(t=>t.category||NO_CATEGORY)])];
  const pays=[["","Tous"],["Carte bancaire","CB"],["Espèces","Espèces"]];
  const shown=filterTx(tx);
  const total=shown.reduce((s,t)=>s+(t.type==="recette"?1:-1)*(Number(t.amount)||0),0);
  const active=detailPayFilter||detailCatFilter;
  return `<div class="card detail-filters">
    <div class="segmented pay-filter">
      ${pays.map(([v,l])=>`<button type="button" data-pay-filter="${escapeHtml(v)}" class="${v===detailPayFilter?"active":""}">${l}</button>`).join("")}
    </div>
    <select id="catFilter">
      <option value="">Toutes les catégories</option>
      ${cats.map(c=>`<option ${c===detailCatFilter?"selected":""}>${escapeHtml(c)}</option>`).join("")}
    </select>
    ${active ? `<div class="filter-total">${shown.length} opération(s) · total <strong class="${total<0?"red":"green"}">${total<0?"-":"+"}${euro(Math.abs(total))}</strong></div>` : ""}
  </div>`;
}
function balanceText(v){ return v===null ? "—" : euro(v); }
function scopeLabel(scope){ return scope==="global" ? "Global" : ACCOUNTS[scope]; }

function monthsTabsHtml(scope){
  const tabs=[["mamie","Cpt Mamie"],["commun","Cpt commun"],["global","Global"]];
  return `<div class="account-switch months-tabs">
    ${tabs.map(([k,l])=>`<button type="button" data-months-scope="${k}" class="${k===scope?"active":""}">${l}</button>`).join("")}
  </div>`;
}

function monthsView(){
  const scope=currentMonthsScope();
  const missing=scopeAccounts(scope).filter(acc=>!openingBalance(acc)).map(acc=>ACCOUNTS[acc]);
  const byYear={};
  monthRange(scope).reverse().forEach(k=>{ (byYear[k.slice(0,4)] ||= []).push(k); });
  return `
    ${monthsTabsHtml(scope)}
    ${missing.length ? `<div class="notice orange">Pour voir les soldes, indique le solde de départ du ${missing.join(" et du ")} dans Réglages.</div>` : ""}
    ${Object.keys(byYear).sort().reverse().map(y=>`
      <section class="section-title"><h2>${y}</h2></section>
      <div class="card">
        ${byYear[y].map(k=>{
          const s=monthSummary(k,scope);
          return `<div class="month-row" data-open-month="${k}" role="button" tabindex="0">
            <div class="month-name"><strong>${MONTH_FULL[Number(k.slice(5))-1]}</strong><div class="meta">${s.tx.length} opération(s)</div></div>
            <div class="month-bal"><small>Début</small><span>${balanceText(s.start)}</span></div>
            <div class="month-bal"><small>Fin</small><strong class="${s.end!==null&&s.end<0?"red":""}">${balanceText(s.end)}</strong></div>
          </div>`;
        }).join("")}
      </div>`).join("")}
  `;
}

function monthDetailView(key){
  const scope=currentMonthsScope();
  const s=monthSummary(key,scope);
  const global=scope==="global";
  return `
    ${monthsTabsHtml(scope)}
    <button class="link-btn back-btn" data-jump="months">‹ Tous les mois</button>
    <section class="hero card">
      <small>${monthTitle(key)} · ${scopeLabel(scope)}</small>
      <div class="month-hero">
        <div><small>Solde début</small><div class="balance-sm">${balanceText(s.start)}</div></div>
        <div><small>Solde fin</small><div class="balance-sm">${balanceText(s.end)}</div></div>
      </div>
      ${global ? `<div class="month-parts">${s.parts.map(p=>`<div><small>${ACCOUNTS[p.acc]}</small><span>${balanceText(p.start)} → ${balanceText(p.end)}</span></div>`).join("")}</div>` : ""}
    </section>
    <section class="grid">
      <div class="stat"><small>Recettes</small><strong class="green">+${euro(s.recettes)}</strong></div>
      <div class="stat"><small>Dépenses</small><strong class="red">-${euro(s.depenses)}</strong></div>
      <div class="stat"><small>Prélèvements</small><strong class="blue">-${euro(s.prelevements)}</strong></div>
    </section>
    ${s.virements?`<div class="notice" style="margin-top:12px">Virements entre comptes : <strong>${s.virements>0?"+":"-"}${euro(Math.abs(s.virements))}</strong> (ni recette ni dépense, compris dans le solde)</div>`:""}
    ${s.especes?`<div class="notice" style="margin-top:12px">Espèces dépensées : <strong>${euro(s.especes)}</strong> (hors compte, non comptées dans le solde)</div>`:""}
    <section class="section-title"><h2>Opérations</h2></section>
    ${detailFiltersHtml(s.tx)}
    ${renderTxList(filterTx(s.tx), global)}
  `;
}

function statementView(){
  const pending = sortedTx(accountTx().filter(x=>!x.pointed));
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
    <div id="searchResults">${renderTxList(accountTx())}</div>
  `;
}

function recurringCard(r){
  const provision=monthlyProvision(r);
  const schedule=recurringSchedule(r);
  const scheduleText=schedule.length
    ? schedule.map(x=>`${x.day} ${MONTH_NAMES[x.month-1]} · ${euro(x.amount)}`).join(" · ")
    : "";
  const months=(r.months||[]).map(m=>MONTH_NAMES[m-1]).join(", ");
  const monthlyVariable=r.type==="prelevement" && (r.frequency||"monthly")==="monthly" && !!r.monthlyVariable;
  return `
    <div class="recurring-item">
      <div>
        <strong>${escapeHtml(r.label)}</strong>
        <div class="meta">${monthlyVariable ? "Mensuel variable" : freqLabel(r)} ${scheduleText ? "· "+escapeHtml(scheduleText) : `· vers le ${r.day} ${months? "· "+months:""}`}</div>
        ${monthlyVariable ? `<div class="provision-line">Montant habituel : <strong>${euro(r.amount)}/mois</strong></div>` : ""}
        ${provision?`<div class="provision-line">À provisionner : <strong>${euro(provision)}/mois</strong></div>`:""}
      </div>
      <div class="recurring-actions">
        ${schedule.length ? "" : `<strong class="${r.type==="recette"?"green":"blue"}">${euro(r.amount)}</strong>`}
        <button class="mini-btn" data-edit-recurring="${r.id}">Modifier</button>
        <button class="mini-btn danger" data-delete-recurring="${r.id}">Suppr.</button>
      </div>
    </div>`;
}

function recurringAccountCard(acc){
  const mine=state.recurring.filter(r=>accountOf(r)===acc);
  const recettes=mine.filter(r=>r.type==="recette");
  const prelevements=mine.filter(r=>r.type==="prelevement");
  return `
    <div class="card recurring-account-card">
      <h2 class="recurring-account-title">${ACCOUNTS[acc]}</h2>
      <div class="section-title">
        <h3>Recettes récurrentes</h3>
        <button class="link-btn" data-add-recurring="recette" data-recurring-account="${acc}">+ Ajouter</button>
      </div>
      ${recettes.length?recettes.map(recurringCard).join(""):'<div class="empty">Aucune recette récurrente</div>'}
      <div class="section-title">
        <h3>Prélèvements récurrents</h3>
        <button class="link-btn" data-add-recurring="prelevement" data-recurring-account="${acc}">+ Ajouter</button>
      </div>
      ${prelevements.length?prelevements.map(recurringCard).join(""):'<div class="empty">Aucun prélèvement récurrent</div>'}
    </div>`;
}

function settingsView(){
  const o=openingBalance();
  return `
    <div class="card form-card">
      <div class="section-title" style="margin-top:0"><h2>Solde de départ · ${ACCOUNTS[currentAccount]}</h2></div>
      <div class="meta">Le solde du relevé bancaire au 1er jour d’un mois. Les soldes des autres mois en seront déduits.</div>
      <form id="openingForm">
        <label>Mois<input id="openingMonth" type="month" required value="${o?o.month:localMonthKey()}"></label>
        <label>Solde au 1er du mois<input id="openingAmount" type="number" inputmode="decimal" step="0.01" required value="${o?o.amount:""}" placeholder="0,00"></label>
        <button class="primary" type="submit">Enregistrer le solde</button>
      </form>
    </div>

    ${Object.keys(ACCOUNTS).map(recurringAccountCard).join("")}

    <div class="meta" style="padding:0 8px 16px">Les récurrents sont ajoutés automatiquement dans chaque mois, sur leur compte. Une échéance supprimée n’est pas recréée.</div>
    <div class="card" style="margin-top:16px">
      <div class="section-title" style="margin-top:0"><h2>Catégories</h2></div>
      ${categories().map((c,i)=>`<div class="category-item">
        <span>${escapeHtml(c)}</span>
        <span class="recurring-actions">
          <button class="mini-btn" data-rename-category="${i}">Renommer</button>
          <button class="mini-btn danger" data-delete-category="${i}">Suppr.</button>
        </span>
      </div>`).join("")}
      <button class="secondary-btn" id="addCategoryBtn" style="margin-top:10px">+ Ajouter une catégorie</button>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="section-title" style="margin-top:0"><h2>Sauvegarde et récupération</h2></div>
      <div class="meta" style="margin-bottom:10px">Recherche toutes les anciennes clés localStorage commençant par « mamie-banque ». Aucune clé n’est supprimée.</div>
      <button class="secondary-btn" id="scanStorageBtn">Rechercher mes anciennes données</button>
      <button class="secondary-btn" id="exportBackupBtn" style="margin-top:10px">Télécharger une sauvegarde de l’état actuel</button>
    </div>
    <div id="recoveryPanel"></div>
  `;
}

function recurringFormView(type, id=null, account=null){
  const r=id ? state.recurring.find(x=>String(x.id)===String(id)) : null;
  const acc=r ? accountOf(r) : (ACCOUNTS[account] ? account : currentAccount);
  const isRecette=type==="recette";
  const freq=(r&&r.frequency)||"monthly";
  const selected=(r&&r.months)||[];
  const schedule=r ? recurringSchedule(r) : [];
  const variableMode=!isRecette && freq!=="monthly";
  const scheduleRows=schedule.length ? schedule : [];
  return `
    <div class="card form-card">
      <div class="section-title" style="margin-top:0"><h2>${r?"Modifier":"Ajouter"} ${isRecette?"une recette":"un prélèvement"} récurrent${isRecette?"e":""}</h2></div>
      <form id="recurringForm">
        <input type="hidden" id="recurringId" value="${r?r.id:""}">
        <input type="hidden" id="recurringType" value="${type}">
        <label>Compte ${isRecette?"crédité":"prélevé"}
          <select id="recurringAccount">
            ${Object.keys(ACCOUNTS).map(a=>`<option value="${a}" ${a===acc?"selected":""}>${ACCOUNTS[a]}</option>`).join("")}
          </select>
        </label>
        <label>Catégorie ${categorySelectHtml("recurringCategory", r&&r.category||"")}</label>
        <label>À partir de<input id="recurringStart" type="month" required value="${r ? recurringFirstMonth(r) : localMonthKey()}"></label>
        <label>Libellé<input id="recurringLabel" type="text" required value="${r?escapeHtml(r.label):""}" placeholder="${isRecette?"Pension retraite":"Assurance"}" style="text-transform:uppercase"></label>

        <div id="monthlyVariableBox" class="monthly-variable-box">
          <label class="check-row monthly-variable-check">
            <input id="monthlyVariable" type="checkbox" ${r&&r.monthlyVariable?"checked":""}>
            Montant variable chaque mois
          </label>
          <div class="meta">Ex. téléphone : le montant habituel sert de budget, puis tu ajustes l'opération au montant réellement prélevé.</div>
        </div>

        <div id="standardRecurringFields">
          <label><span id="recurringAmountLabel">Montant à chaque échéance</span><input id="recurringAmount" type="number" inputmode="decimal" step="0.01" min="0" value="${r?r.amount:""}"></label>
        </div>

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

        <div id="monthlyDayField">
          <label>Jour habituel du mois<input id="recurringDay" type="number" min="1" max="31" value="${r?r.day:1}"></label>
        </div>

        <div id="monthsBox" class="months-box">
          <div class="field-title">Mois de prélèvement / versement</div>
          <div class="month-grid">
            ${MONTH_NAMES.map((n,i)=>`<label class="month-chip"><input type="checkbox" value="${i+1}" ${selected.includes(i+1)?"checked":""}>${n}</label>`).join("")}
          </div>
        </div>

        <div id="scheduleBox" class="months-box">
          <div class="field-title">Échéances</div>
          <div class="meta" style="margin-bottom:10px">Chaque échéance peut avoir sa propre date et son propre montant.</div>
          <div id="scheduleRows">
            ${scheduleRows.map(x=>scheduleRowHtml(x)).join("")}
          </div>
          <button class="secondary-btn" type="button" id="addScheduleRow">+ Ajouter une échéance</button>
        </div>

        <div id="provisionPreview" class="notice orange"></div>
        <button class="primary" type="submit">${r?"Enregistrer les modifications":"Ajouter"}</button>
      </form>
      <button class="secondary-btn" style="margin-top:10px" data-jump="settings">Annuler</button>
    </div>
  `;
}
function scheduleRowHtml(x={month:1,day:1,amount:""}){
  return `<div class="schedule-row" style="display:grid;grid-template-columns:1fr .75fr 1fr auto;gap:8px;align-items:end;margin-bottom:10px">
    <label style="margin:0">Mois
      <select class="schedule-month">${MONTH_NAMES.map((n,i)=>`<option value="${i+1}" ${Number(x.month)===i+1?"selected":""}>${n}</option>`).join("")}</select>
    </label>
    <label style="margin:0">Jour
      <input class="schedule-day" type="number" min="1" max="31" value="${Number(x.day)||1}">
    </label>
    <label style="margin:0">Montant
      <input class="schedule-amount" type="number" inputmode="decimal" step="0.01" min="0" value="${x.amount===""?"":Number(x.amount)}">
    </label>
    <button class="mini-btn danger remove-schedule-row" type="button">Suppr.</button>
  </div>`;
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
  const navView = view==="monthDetail" ? "months" : view;
  document.querySelectorAll(".nav-btn").forEach(b=>b.classList.toggle("active",b.dataset.view===navView));
  // Les écrans Mois couvrent tous les mois : le mois en cours affiché en haut y prêterait à confusion.
  const eyebrow=document.querySelector(".topbar .eyebrow");
  if(eyebrow) eyebrow.hidden = navView==="months";
  const topSwitch=document.querySelector(".account-switch:not(.months-tabs)");
  if(topSwitch) topSwitch.hidden = navView==="months";
  document.querySelectorAll("[data-account]").forEach(b=>b.classList.toggle("active",b.dataset.account===currentAccount));
  const app=document.getElementById("app");
  if(view==="home") app.innerHTML=homeView();
  if(view==="expenses") app.innerHTML=expensesView();
  if(view==="months") app.innerHTML=monthsView();
  if(view==="monthDetail"){
    if(options.month) lastMonthKey=options.month;
    app.innerHTML=monthDetailView(lastMonthKey || localMonthKey());
  }
  if(view==="statement") app.innerHTML=statementView();
  if(view==="search") app.innerHTML=searchView();
  if(view==="settings") app.innerHTML=settingsView();
  if(view==="add") app.innerHTML=addView(options.type||"depense",!!options.unknown,null);
  if(view==="editTransaction") app.innerHTML=addView("depense",false,options.id);
  if(view==="recurringForm") app.innerHTML=recurringFormView(options.type,options.id||null,options.account||null);
  bind();
}

function bind(){
  document.querySelectorAll("[data-account]").forEach(b=>b.onclick=()=>setAccount(b.dataset.account));
  document.querySelectorAll("[data-months-scope]").forEach(b=>b.onclick=()=>{
    const scope=b.dataset.monthsScope;
    if(scope==="global") monthsScope="global";
    else{
      monthsScope=null;
      currentAccount=scope;
      try{ localStorage.setItem(ACCOUNT_PREF_KEY,scope); }catch{}
    }
    render(currentView);
  });
  const addCategoryBtn=document.getElementById("addCategoryBtn");
  if(addCategoryBtn) addCategoryBtn.onclick=()=>{
    const name=(prompt("Nom de la nouvelle catégorie :")||"").trim();
    if(!name) return;
    if(categories().some(c=>c.toLowerCase()===name.toLowerCase())){ alert("Cette catégorie existe déjà."); return; }
    state.categories=[...categories(), name];
    save("avant-ajout-categorie"); render("settings");
  };
  document.querySelectorAll("[data-rename-category]").forEach(b=>b.onclick=()=>{
    const list=categories(); const old=list[Number(b.dataset.renameCategory)];
    const name=(prompt(`Nouveau nom pour « ${old} » :`, old)||"").trim();
    if(!name || name===old) return;
    if(list.some(c=>c!==old && c.toLowerCase()===name.toLowerCase())){ alert("Cette catégorie existe déjà."); return; }
    // Le nouveau nom s'applique partout : opérations et récurrents.
    state.categories=list.map(c=>c===old?name:c);
    state.transactions.forEach(t=>{ if(t.category===old) t.category=name; });
    state.recurring.forEach(r=>{ if(r.category===old) r.category=name; });
    if(detailCatFilter===old) detailCatFilter=name;
    save("avant-renommage-categorie"); render("settings");
  });
  document.querySelectorAll("[data-delete-category]").forEach(b=>b.onclick=()=>{
    const list=categories(); const old=list[Number(b.dataset.deleteCategory)];
    const used=state.transactions.filter(t=>t.category===old).length;
    if(!confirm(`Supprimer la catégorie « ${old} » ?${used?`\n\n${used} opération(s) passeront en « ${NO_CATEGORY} ».`:""}`)) return;
    state.categories=list.filter(c=>c!==old);
    state.transactions.forEach(t=>{ if(t.category===old) delete t.category; });
    state.recurring.forEach(r=>{ if(r.category===old) delete r.category; });
    if(detailCatFilter===old) detailCatFilter="";
    save("avant-suppression-categorie"); render("settings");
  });
  document.querySelectorAll("[data-pay-filter]").forEach(b=>b.onclick=()=>{ detailPayFilter=b.dataset.payFilter; render("monthDetail"); });
  const catFilter=document.getElementById("catFilter");
  if(catFilter) catFilter.onchange=()=>{ detailCatFilter=catFilter.value; render("monthDetail"); };
  document.querySelectorAll("[data-open-month]").forEach(row=>{
    const open=()=>render("monthDetail",{month:row.dataset.openMonth});
    row.onclick=open;
    row.onkeydown=e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } };
  });
  const openingForm=document.getElementById("openingForm");
  if(openingForm) openingForm.onsubmit=e=>{
    e.preventDefault();
    const month=document.getElementById("openingMonth").value;
    const amount=Number(document.getElementById("openingAmount").value);
    if(!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(amount)) return;
    state.openingBalances={...(state.openingBalances||{}), [currentAccount]:{month,amount}};
    save("avant-solde-depart");
    autoGenerateRecurring();
    alert(`Solde de départ enregistré pour le ${ACCOUNTS[currentAccount]}.`);
    render("settings");
  };
  document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>render(b.dataset.jump));
  document.querySelectorAll(".nav-btn").forEach(b=>b.onclick=()=>render(b.dataset.view));
  const add=document.getElementById("addBtn");
  if(add) add.onclick=()=>{ transactionReturnView="home"; render("add",{type:"depense"}); };
  const stAdd=document.getElementById("statementAddBtn");
  if(stAdd) stAdd.onclick=()=>{ transactionReturnView="statement"; render("add",{type:"prelevement",unknown:true}); };

  document.querySelectorAll("[data-edit-tx]").forEach(row=>{
    const openEdit=()=>{
      transactionReturnView = currentView==="editTransaction" ? "home" : currentView;
      render("editTransaction",{id:row.dataset.editTx});
    };
    row.onclick=openEdit;
    row.ondblclick=e=>{ e.preventDefault(); e.stopPropagation(); };
    row.onkeydown=e=>{
      if(e.key==="Enter" || e.key===" "){
        e.preventDefault();
        openEdit();
      }
    };
  });

  const transactionCancel=document.querySelector("[data-transaction-cancel]");
  if(transactionCancel) transactionCancel.onclick=()=>render(transactionReturnView || "home");
  const transactionDelete=document.querySelector("[data-transaction-delete]");
  if(transactionDelete) transactionDelete.onclick=()=>{
    const form=document.getElementById("transactionForm");
    const editId=form && form.dataset.editId ? String(form.dataset.editId) : "";
    const tx=state.transactions.find(x=>String(x.id)===editId);
    if(!tx) return;
    const both=tx.transferId ? "\n\nC’est un virement entre comptes : il sera supprimé des deux comptes." : "";
    if(confirm(`Supprimer définitivement « ${tx.label} » de ${euro(Number(tx.amount)||0)} ?${both}`)){
      state.transactions=state.transactions.filter(x=>String(x.id)!==editId && !(tx.transferId && x.transferId===tx.transferId));
      if(tx.recurringId){
        state.skippedOccurrences=[...(state.skippedOccurrences||[]), {recurringId:tx.recurringId, period:occurrencePeriod(tx)}];
      }
      save("avant-suppression-operation");
      render(transactionReturnView || "home");
    }
  };
  const scan=document.getElementById("scanStorageBtn");
  if(scan) scan.onclick=()=>{
    const panel=document.getElementById("recoveryPanel");
    if(panel) panel.innerHTML=recoveryPanelHtml();
    bindRecoveryPanel();
  };
  const exp=document.getElementById("exportBackupBtn"); if(exp) exp.onclick=exportCurrentBackup;
  const exportBtn=document.getElementById("exportBackupBtn");
  if(exportBtn) exportBtn.onclick=exportBackup;
  const importBtn=document.getElementById("importBackupBtn");
  const importFile=document.getElementById("importBackupFile");
  if(importBtn && importFile){
    importBtn.onclick=()=>importFile.click();
    importFile.onchange=()=>{ importBackupFile(importFile.files && importFile.files[0]); importFile.value=""; };
  }


  bindRecoveryPanel();

  document.querySelectorAll("[data-add-recurring]").forEach(b=>b.onclick=()=>render("recurringForm",{type:b.dataset.addRecurring,account:b.dataset.recurringAccount}));
  document.querySelectorAll("[data-edit-recurring]").forEach(b=>b.onclick=()=>{
    const id=String(b.dataset.editRecurring); const r=state.recurring.find(x=>String(x.id)===id);
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
      const id=String(cb.dataset.point);
      const tx=state.transactions.find(x=>String(x.id)===id);
      if(tx){ tx.pointed=true; save(); render("statement"); }
    };
  });

  const recurringForm=document.getElementById("recurringForm");
  if(recurringForm){
    const freqEl=document.getElementById("recurringFrequency");
    const typeEl=document.getElementById("recurringType");
    const scheduleBox=document.getElementById("scheduleBox");
    const monthsBox=document.getElementById("monthsBox");
    const monthlyDayField=document.getElementById("monthlyDayField");
    const standardFields=document.getElementById("standardRecurringFields");
    const monthlyVariableBox=document.getElementById("monthlyVariableBox");
    const monthlyVariableEl=document.getElementById("monthlyVariable");
    const recurringAmountLabel=document.getElementById("recurringAmountLabel");

    const getSchedule=()=>[...document.querySelectorAll(".schedule-row")].map(row=>({
      month:Number(row.querySelector(".schedule-month").value),
      day:Number(row.querySelector(".schedule-day").value),
      amount:Number(row.querySelector(".schedule-amount").value)
    })).filter(x=>x.month>=1&&x.month<=12&&x.day>=1&&x.day<=31&&Number.isFinite(x.amount));

    const bindScheduleRows=()=>{
      document.querySelectorAll(".remove-schedule-row").forEach(btn=>btn.onclick=()=>{
        btn.closest(".schedule-row").remove();
        refreshRecurringUi();
      });
      document.querySelectorAll(".schedule-row input,.schedule-row select").forEach(el=>el.oninput=refreshRecurringUi);
    };

    const refreshRecurringUi=()=>{
      const type=typeEl.value;
      const frequency=freqEl.value;
      const variable=(type==="prelevement" && frequency!=="monthly");
      scheduleBox.style.display=variable?"block":"none";
      standardFields.style.display=variable?"none":"block";
      monthlyDayField.style.display=variable?"none":"block";
      monthsBox.style.display=(type==="recette" && frequency!=="monthly")?"block":"none";

      const canBeMonthlyVariable=(type==="prelevement" && frequency==="monthly");
      monthlyVariableBox.style.display=canBeMonthlyVariable?"block":"none";
      if(!canBeMonthlyVariable) monthlyVariableEl.checked=false;
      recurringAmountLabel.textContent=(canBeMonthlyVariable && monthlyVariableEl.checked)
        ? "Montant habituel / budget mensuel"
        : "Montant à chaque échéance";

      const amount=Number(document.getElementById("recurringAmount").value)||0;
      const months=[...document.querySelectorAll("#monthsBox input:checked")].map(x=>Number(x.value));
      const temp={type,amount,frequency,months,schedule:variable?getSchedule():[]};
      const preview=document.getElementById("provisionPreview");
      const provision=monthlyProvision(temp);
      preview.style.display=(type==="prelevement" && frequency!=="monthly")?"block":"none";
      preview.innerHTML=provision?`Budget : <strong>${euro(provision)} par mois</strong> seront réservés pour cette dépense.`:"";
    };

    document.getElementById("addScheduleRow").onclick=()=>{
      const rows=document.getElementById("scheduleRows");
      rows.insertAdjacentHTML("beforeend",scheduleRowHtml({month:1,day:1,amount:""}));
      bindScheduleRows();
      refreshRecurringUi();
    };
    freqEl.addEventListener("change",refreshRecurringUi);
    document.getElementById("recurringAmount").addEventListener("input",refreshRecurringUi);
    monthlyVariableEl.addEventListener("change",refreshRecurringUi);
    document.querySelectorAll("#monthsBox input").forEach(x=>x.addEventListener("change",refreshRecurringUi));
    bindScheduleRows();
    refreshRecurringUi();

    recurringForm.onsubmit=e=>{
      e.preventDefault();
      const idVal=document.getElementById("recurringId").value;
      const type=typeEl.value;
      const frequency=freqEl.value;
      const variable=(type==="prelevement" && frequency!=="monthly");
      const schedule=variable?getSchedule():[];

      if(variable && schedule.length===0){
        alert("Ajoute au moins une échéance.");
        return;
      }
      const duplicateMonths=schedule.map(x=>x.month).filter((m,i,a)=>a.indexOf(m)!==i);
      if(variable && duplicateMonths.length){
        alert("Il ne peut y avoir qu’une échéance par mois.");
        return;
      }

      const obj={
        id:idVal?Number(idVal):Date.now(),
        type,
        label:normalizeLabel(document.getElementById("recurringLabel").value),
        category:document.getElementById("recurringCategory").value,
        amount:variable?0:Number(document.getElementById("recurringAmount").value),
        day:variable?1:Number(document.getElementById("recurringDay").value),
        payment:type==="recette"?"Virement":"Prélèvement",
        frequency,
        monthlyVariable:type==="prelevement" && frequency==="monthly" && monthlyVariableEl.checked,
        months:variable?schedule.map(x=>x.month):[...document.querySelectorAll("#monthsBox input:checked")].map(x=>Number(x.value)),
        schedule,
        startMonth:/^\d{4}-\d{2}$/.test(document.getElementById("recurringStart").value) ? document.getElementById("recurringStart").value : localMonthKey(),
        // Changer le compte ne déplace pas les opérations déjà créées : elles sont passées sur l'ancien compte.
        account:ACCOUNTS[document.getElementById("recurringAccount").value] ? document.getElementById("recurringAccount").value : currentAccount
      };
      if(idVal){
        const i=state.recurring.findIndex(x=>String(x.id)===String(obj.id)); if(i>=0) state.recurring[i]=obj;
      } else state.recurring.push(obj);
      // Ses opérations encore sans catégorie prennent celle du récurrent.
      state.transactions.forEach(t=>{ if(String(t.recurringId)===String(obj.id) && !t.category && obj.category) t.category=obj.category; });
      save("avant-modification-recurrent");
      autoGenerateRecurring();
      render("settings");
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
      const label=form.querySelector("#label");
      const transferLabel=normalizeLabel(`Virement vers ${ACCOUNTS[otherAccount()]}`);
      const categoryField=form.querySelector("#categoryField");
      if(categoryField){
        categoryField.hidden=b.dataset.type==="transfert";
        form.querySelector("#category").required=b.dataset.type!=="transfert";
      }
      if(b.dataset.type==="transfert"){
        form.querySelector("#payment").value="Virement";
        if(!label.value.trim()) label.value=transferLabel;
      }else if(normalizeLabel(label.value)===transferLabel) label.value="";
    });
    form.onsubmit=e=>{
      e.preventDefault();
      const editId=form.dataset.editId ? String(form.dataset.editId) : null;

      if(editId!==null){
        const i=state.transactions.findIndex(x=>String(x.id)===String(editId));
        if(i>=0){
          const previous=state.transactions[i];
          state.transactions[i]={
            ...previous,
            type:form.querySelector("#type").value,
            date:form.querySelector("#date").value,
            label:normalizeLabel(form.querySelector("#label").value),
            amount:Number(form.querySelector("#amount").value),
            payment:form.querySelector("#payment").value,
            unknown:form.querySelector("#unknown").checked,
            ...(form.querySelector("#category") ? {category:form.querySelector("#category").value} : {})
          };
          // Un virement entre comptes existe des deux côtés : date et montant restent identiques.
          if(previous.transferId){
            const partner=state.transactions.find(x=>x.transferId===previous.transferId && String(x.id)!==String(previous.id));
            if(partner){ partner.date=state.transactions[i].date; partner.amount=state.transactions[i].amount; }
          }
          save("avant-modification-depense");
          render(transactionReturnView || "home");
          return;
        }
      }

      if(form.querySelector("#type").value==="transfert"){
        // Une seule saisie, deux opérations : sortie de ce compte, entrée sur l'autre.
        const base=Date.now();
        const to=otherAccount();
        const date=form.querySelector("#date").value;
        const amount=Number(form.querySelector("#amount").value);
        state.transactions.push(
          {id:base,type:"depense",date,amount,payment:"Virement",account:currentAccount,transferId:base,
           label:normalizeLabel(form.querySelector("#label").value)||normalizeLabel(`Virement vers ${ACCOUNTS[to]}`),
           unknown:false,pointed:false},
          {id:base+1,type:"recette",date,amount,payment:"Virement",account:to,transferId:base,
           label:normalizeLabel(`Virement de ${ACCOUNTS[currentAccount]}`),unknown:false,pointed:false}
        );
        save("avant-virement-entre-comptes");
        render("home");
        return;
      }

      const tx={
        id:Date.now(),
        account:currentAccount,
        type:form.querySelector("#type").value,
        date:form.querySelector("#date").value,
        label:normalizeLabel(form.querySelector("#label").value),
        amount:Number(form.querySelector("#amount").value),
        payment:form.querySelector("#payment").value,
        category:form.querySelector("#category").value,
        unknown:form.querySelector("#unknown").checked,
        pointed:false
      };
      state.transactions.push(tx);
      save("avant-ajout-operation");
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

function bindRecoveryPanel(){
  document.querySelectorAll("[data-preview-storage]").forEach(b=>{
    b.onclick=()=>previewStorage(Number(b.dataset.previewStorage));
  });
  document.querySelectorAll("[data-recover-storage]").forEach(b=>{
    b.onclick=()=>recoverStorage(Number(b.dataset.recoverStorage));
  });
}

// ---------- Récurrents : création automatique ----------
// À chaque ouverture, chaque récurrent reçoit son opération dans chaque mois où il tombe,
// depuis son premier mois jusqu'au mois en cours, sur son propre compte.
// Une opération créée ainsi garde son mois d'échéance (period) : on peut la déplacer
// ou la supprimer sans qu'elle soit recréée.
function occurrencePeriod(t){ return t.period || String(t.date||"").slice(0,7); }
function recurringFirstMonth(r){
  if(/^\d{4}-\d{2}$/.test(r.startMonth||"")) return r.startMonth;
  const o=openingBalance(accountOf(r));
  return o ? o.month : localMonthKey();
}
function isSkippedOccurrence(r, period){
  return (state.skippedOccurrences||[]).some(x=>String(x.recurringId)===String(r.id) && x.period===period);
}
function autoGenerateRecurring(){
  const current=localMonthKey();
  let added=0, seq=0;
  state.recurring.filter(r=>!isLegacyDemoRecurring(r)).forEach(r=>{
    let [y,m]=recurringFirstMonth(r).split("-").map(Number);
    for(let key=`${y}-${String(m).padStart(2,"0")}`; key<=current; key=`${y}-${String(m).padStart(2,"0")}`){
      const occurrence=expectedRecurringForMonth(r,m-1);
      const exists=state.transactions.some(t=>String(t.recurringId)===String(r.id) && occurrencePeriod(t)===key);
      if(occurrence && !exists && !isSkippedOccurrence(r,key)){
        const day=Math.min(Number(occurrence.day)||1,new Date(y,m,0).getDate());
        state.transactions.push({
          id:Date.now()*100+(seq++),
          date:`${key}-${String(day).padStart(2,"0")}`,
          label:normalizeLabel(r.label),type:r.type,amount:Number(occurrence.amount)||0,payment:r.payment,
          pointed:false,unknown:false,recurringId:r.id,period:key,account:accountOf(r),
          ...(r.category ? {category:r.category} : {})
        });
        added++;
      }
      m++; if(m===13){ m=1; y++; }
    }
  });
  if(added) save("avant-creation-recurrents");
  return added;
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
  const list=accountTx().filter(x=>{
    const matchesQ=!q || x.label.toLowerCase().includes(q) || String(x.amount).replace(".",",").includes(q) || String(x.amount).includes(q);
    return matchesQ && (!t||x.type===t) && (!p||x.payment===p) &&
      (isNaN(min)||x.amount>=min) && (isNaN(max)||x.amount<=max) &&
      (from===null || !from || x.date>=from) && (to===null || !to || x.date<=to);
  });
  document.getElementById("searchResults").innerHTML=renderTxList(list);
}
bootRemote();
