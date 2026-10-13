"use strict";

/* CUSTODY EDUCATION (remaining phases) - Shamir-style shares, a DIY disaster drill, and
   company-shaped collaborative arrangements modelled on cited products.

   Not endorsements. Casa Standard and Unchained vault appear because they are real, dated
   shapes of a 2-of-3 where the company holds one key. Prices are snapshots (October 2026).
   Inheritance is named in copy only. New rolls use hashRoll, never nextRand. */

const SHAMIR_DEFAULT_N=3,SHAMIR_DEFAULT_K=2;
const COMPANY_OUTAGE_RATE=.02,COMPANY_KEY_EXPOSE_RATE=.001;
const COMPANY_OUTAGE_DAYS_MIN=3,COMPANY_OUTAGE_DAYS_MAX=14;

const COLLABORATIVE_ARRANGEMENTS=[
  {id:"diy",name:"Do it yourself",fee:0,company:false,
    blurb:"Three keys you place yourself. No monthly company fee. Nobody to call if two seeds and the descriptor are gone.",
    protects:"One stolen seed spends nothing. One destroyed signer rebuilds from its backup.",
    fails:"Two seeds gone, or the descriptor gone with the signers. Inheritance is not included."},
  {id:"casa-standard",name:"Casa-shaped Standard",fee:250,company:true,policy:"2of3",
    dated:"2026-10",source:"https://support.casa.io/knowledge/standard-membership-with-3-key-vault",
    sourceNote:"Casa Standard membership article, 22 January 2026: $250/year, 2-of-3, company holds a recovery key.",
    blurb:"Modelled on Casa Standard: you hold two keys, the company holds one recovery key, $250 a year. Not an endorsement. Inheritance is named elsewhere on their pages and is not simulated here.",
    protects:"One of your seeds stolen spends nothing. The company cannot move coins alone.",
    fails:"The company key can be lost, hacked or compelled (low chance). Combined with one of yours, it spends. Unpaid fees stop the company from signing until paid.",
    caravan:false},
  {id:"unchained-vault",name:"Unchained-shaped vault",fee:250,company:true,policy:"2of3",
    dated:"2026-10",source:"https://www.unchained.com/pricing",
    sourceNote:"Unchained pricing page, read October 2026: $250 per vault per year. Concierge suite figures on that page disagree and are not modelled.",
    blurb:"Modelled on an Unchained personal vault: you hold two keys, Unchained holds one, $250 a year. Caravan is the open offline coordinator when the company key cannot sign. Not an endorsement. Inheritance products (Signature, Boot Camp) are not simulated.",
    protects:"One of your seeds stolen spends nothing. The company cannot move coins alone. With Caravan, two of your keys plus the descriptor still spend during a company outage.",
    fails:"The company key can be lost, hacked or compelled (low chance). Combined with one of yours, it spends. Unpaid fees stop the company from signing until paid.",
    caravan:true},
];

function collaborativeArrangement(id){return COLLABORATIVE_ARRANGEMENTS.find(a=>a.id===id)||null}
function activeArrangement(s=state){return collaborativeArrangement(s.custody&&s.custody.arrangement)||collaborativeArrangement("diy")}

/* ---- Shamir-style shares (SLIP-0039 shape, not BIP39 words) ----------------------------- */

function keyShares(key){return Array.isArray(key&&key.shares)?key.shares:[]}
function liveShares(key){return keyShares(key).filter(sh=>sh&&!sh.destroyed&&sh.place!=="transit")}
function keyShareThreshold(key){
  const sh=keyShares(key)[0];
  return sh&&Number.isFinite(Number(sh.threshold))?Number(sh.threshold):SHAMIR_DEFAULT_K;
}
function keySharesRestorable(key){
  if(!key||!keyShares(key).length)return false;
  return liveShares(key).length>=keyShareThreshold(key);
}
function keyShareByRef(ref){
  if(typeof ref!=="string"||!ref.includes(":"))return null;
  const i=ref.indexOf(":"),key=custodyKey(ref.slice(0,i));if(!key)return null;
  const idx=ref.slice(i+1);
  return keyShares(key).find(sh=>String(sh.index)===idx)||null;
}
function shareRef(keyId,index){return `${keyId}:${index}`}

/* Split one secret into n placeable paper shares. Replaces a single written backup when present:
   the lesson is the shares, not a second full seed beside them. */
function splitKeyIntoShares(keyId,opts={}){
  const key=custodyKey(keyId);if(!key||key.retired||key.company)return showToast("Cannot split","Pick a key that still belongs to you.");
  if(keyShares(key).length)return showToast("Already split","Move or destroy the existing shares first.");
  const n=Math.max(2,Math.min(5,Number(opts.n)||SHAMIR_DEFAULT_N));
  const k=Math.max(2,Math.min(n,Number(opts.k)||SHAMIR_DEFAULT_K));
  const places=Array.isArray(opts.places)?opts.places:[];
  const defaults=["home","bank","trusted"];
  key.shares=[];
  for(let i=1;i<=n;i++){
    const place=CUSTODY_PLACES.some(p=>p.id===places[i-1])?places[i-1]:defaults[(i-1)%defaults.length];
    key.shares.push({index:i,threshold:k,total:n,product:"slip39share",durability:"paper",place,at:state.time});
  }
  if(key.backup&&!key.backup.destroyed){
    key.backup={...key.backup,destroyed:true,cause:"replaced-by-shares"};
  }
  log(`Split ${key.label} into shares`,`${k}-of-${n} paper shares · not BIP39 words`,"custody");
  showToast("Shares written",`${k} of ${n} shares rebuild ${key.label}. These are not the 24 BIP39 words. Keep fewer than ${k} in any one place.`,"notice","custody");
  save();render();
}

function destroyKeyShares(keyId){
  const key=custodyKey(keyId);if(!key||!keyShares(key).length)return;
  key.shares.forEach(sh=>{sh.destroyed=true;sh.cause="discarded"});
  log(`Discarded shares for ${key.label}`,"Shamir shares destroyed · write a normal backup if you still need one","custody");
  showToast("Shares discarded","Write a normal seed backup if this key still needs one.","warning","custody");
  save();render();
}

/* ---- Collaborative arrangements -------------------------------------------------------- */

function companyKey(s=state){return (s.custody.keys||[]).find(k=>k.company&&!k.retired)||null}
function companyFeeOwed(s=state){
  const a=activeArrangement(s);if(!a||!a.fee)return 0;
  const due=Number(s.custody.arrangementFeeDue)||0;
  return due&&s.time>=due?a.fee:0;
}
function companyCanSign(s=state){
  const key=companyKey(s);if(!key)return false;
  if(companyFeeOwed(s)>0)return false;
  if(s.custody.companyOutageUntil&&s.time<s.custody.companyOutageUntil)return false;
  return !key.retired;
}
function payArrangementFee(){
  const a=activeArrangement(),owed=companyFeeOwed();
  if(!a.fee||!owed)return showToast("Nothing due","No company fee is owed.");
  if(state.cash<a.fee)return showToast("Not enough cash",`The ${a.name} fee is ${fmtUsd(a.fee)} a year.`);
  state.cash-=a.fee;
  state.custody.arrangementFeeDue=state.time+365*DAY;
  log(`${a.name} fee`,`-${fmtUsd(a.fee)} · next due ${dateFmt(state.custody.arrangementFeeDue,true)}`,"custody");
  showToast("Fee paid",`${a.name} can sign again until ${dateFmt(state.custody.arrangementFeeDue,true)}.`,"success","custody");
  save();render();
}

function ensureCompanyKey(){
  let key=companyKey();
  if(key)return key;
  const c=state.custody;c.seq=(c.seq||0)+1;
  key={id:`k${c.seq}`,label:"COMPANY",seed:`company-${c.seq}`,bornOn:state.time,deviceUid:null,stateless:false,backup:null,
    company:true,holder:"company",fingerprint:"company"};
  c.keys.push(key);
  return key;
}

function setCollaborativeArrangement(id){
  const a=collaborativeArrangement(id);if(!a)return;
  const c=state.custody;
  if(a.company){
    if(!hasSkill("multisig"))return showToast("Multisig required","Collaborative custody needs the Multisig discipline.");
    if(c.policy!=="2of3"){c.policy="2of3";log("Wallet policy: 2-of-3 multisig","2 of 3","custody")}
    const own=custodyAssignedKeys().filter(k=>!k.company&&!k.hot);
    if(own.length<2)return showToast("Need two of your keys","Assign two of your own keys to the 2-of-3 first. The company holds the third.");
    const ck=ensureCompanyKey();
    if(!c.assigned.includes(ck.id))c.assigned.push(ck.id);
    while(c.assigned.filter(id=>{const k=custodyKey(id);return k&&!k.company&&!k.hot}).length>2){
      const drop=c.assigned.find(id=>{const k=custodyKey(id);return k&&!k.company&&!k.hot&&id!==own[0].id&&id!==own[1].id});
      if(!drop)break;
      c.assigned=c.assigned.filter(x=>x!==drop);
    }
    // Keep exactly two player keys + company.
    const keep=new Set([own[0].id,own[1].id,ck.id]);
    c.assigned=c.assigned.filter(id=>keep.has(id)||(custodyKey(id)||{}).hot);
    if(!c.assigned.includes(own[0].id))c.assigned.push(own[0].id);
    if(!c.assigned.includes(own[1].id))c.assigned.push(own[1].id);
    if(!c.assigned.includes(ck.id))c.assigned.push(ck.id);
    c.arrangement=a.id;
    if(state.cash>=a.fee){
      state.cash-=a.fee;
      c.arrangementFeeDue=state.time+365*DAY;
      log(`${a.name} fee`,`-${fmtUsd(a.fee)} · first year`,"custody");
    } else {
      c.arrangementFeeDue=state.time;
      showToast("Fee unpaid",`Pay ${fmtUsd(a.fee)} when you can. Until then the company key will not sign.`,"warning","custody");
    }
    c.configBackedUp=false;c.configCopies=[];delete c.configPlace;
    log(`Arranged ${a.name}`,"Company holds one key of three · modelled, not an endorsement","custody");
    showToast(a.name,`${a.blurb} Record the configuration again: the key set changed.`,"notice","custody");
  } else {
    const ck=companyKey();
    if(ck){ck.retired=true;c.assigned=(c.assigned||[]).filter(id=>id!==ck.id)}
    c.arrangement="diy";
    delete c.arrangementFeeDue;delete c.companyOutageUntil;
    log("Arranged DIY 2-of-3","No company key","custody");
    showToast("Do it yourself","No company key and no yearly fee. You place every backup yourself.","notice","custody");
  }
  save();render();
}

function advanceCompanyRisks(next,silent=false){
  const a=activeArrangement();if(!a||!a.company)return;
  const key=companyKey();if(!key)return;
  const month=new Date(next).toISOString().slice(0,7);
  if(companyFeeOwed({...state,time:next,custody:state.custody})>0)return;
  if(!(state.custody.companyOutageUntil&&next<state.custody.companyOutageUntil)
    &&hashRoll(state.seed,"company-outage",a.id,month)<COMPANY_OUTAGE_RATE){
    const days=COMPANY_OUTAGE_DAYS_MIN+Math.floor(hashRoll(state.seed,"company-outage-days",a.id,month)*(COMPANY_OUTAGE_DAYS_MAX-COMPANY_OUTAGE_DAYS_MIN+1));
    state.custody.companyOutageUntil=next+days*DAY;
    log(`${a.name} outage`,`${days} day${days===1?"":"s"} · company key cannot sign`,"custody");
    if(!silent)showToast("Company key offline",a.caravan
      ?`The company cannot sign for ${days} day${days===1?"":"s"}. Caravan-shaped recovery: your two keys plus the descriptor still can.`
      :`The company cannot sign for ${days} day${days===1?"":"s"}. Your two keys still can if you hold them and the descriptor.`,"warning","custody");
  }
  if(!key.exposed&&hashRoll(state.seed,"company-key",a.id,month)<COMPANY_KEY_EXPOSE_RATE){
    key.exposed={cause:"company",at:next};
    log(`${a.name} key exposed`,"Lost, hacked or compelled · one key of three","custody");
    if(!silent)showToast("Company key exposed","Low chance, real risk. One key in the quorum is known to somebody else. Combined with one of yours, it spends. Rotate if you can.","bad","custody");
  }
}

/* ---- DIY disaster drill (read-only) ---------------------------------------------------- */

function custodyDisasterDrill(placeId="site",kind="fire"){
  const place=custodyPlace(placeId)||custodyPlace("site");
  const items=placeItems(place.id);
  const takes=kind==="burglary"||kind==="seizure";
  const lost=[];
  items.devices.forEach(d=>lost.push(`signer ${custodyProduct(d.product)?.name||d.product}`));
  items.backups.forEach(k=>{
    if(!takes&&k.backup.durability==="steel")return;
    lost.push(`${k.label} seed backup`);
  });
  (items.sheets||[]).forEach(k=>lost.push(`${k.label} roll sheet`));
  (items.passes||[]).forEach(k=>lost.push(`${k.label} passphrase slip`));
  (items.shares||[]).forEach(row=>lost.push(`${row.key.label} share ${row.share.index}/${row.share.total}`));
  if(items.config)lost.push(items.config===1?"wallet configuration":`${items.config} configuration copies`);
  const before=custodyOperable();
  const shareHits={};
  (items.shares||[]).forEach(row=>{
    shareHits[row.key.id]=(shareHits[row.key.id]||0)+1;
  });
  let shareStrand=false;
  for(const key of custodyAssignedKeys()){
    if(!keyShares(key).length)continue;
    const hit=shareHits[key.id]||0;
    const left=liveShares(key).length-hit;
    if(left<keyShareThreshold(key)&&!custodyKeyRestorable(key))shareStrand=true;
  }
  const afterGuess=before&&(lost.length===0||(!shareStrand&&items.devices.length+items.backups.length+(items.config||0)<placeHolds(items)));
  const title=`Drill: ${kind} at ${place.name}`;
  const body=lost.length
    ?`Would lose: ${lost.join(", ")}. ${before?"The wallet looks recoverable from what is kept elsewhere — verify after a real incident.":"The wallet is already not operable; a real incident here would not be the first problem."}`
    :`Nothing modelled at ${place.name} would be destroyed by a ${kind}${takes?"":" (steel would survive)"}.`;
  showToast(title,body,lost.length?"warning":"success","custody");
  log(title,lost.length?lost.join(", "):"nothing held there","custody");
  return {title,lost,body};
}
