"use strict";

/* CUSTODY - holding your own keys, modelled as the three separate things it actually is.

   A DEVICE is a physical object. A KEY is a secret generated on one. A WALLET is a policy
   saying which keys may spend. Buying a device protects nothing; generating a key on it and
   assigning that key to a wallet is what protects something. Three devices restored from one
   seed are one key, and the model counts them that way, because a 2-of-3 built from a single
   seed is a single-signature wallet wearing three enclosures.

   Two risks pull in opposite directions, and choosing between them is the point:

     COMPROMISE - somebody else spends your coins. More keys required means fewer ways for
     one stolen secret to matter, so multisig helps a great deal.

     LOSS - nobody can spend them, including you. More keys means more things to keep, and a
     multisig wallet needs its descriptor as well as its seeds: seeds alone cannot rebuild a
     2-of-3, which is a way real people have really lost real coins.

   So multisig is not a buff. It trades a compromise problem for a recovery problem, and a
   player who takes the first without answering the second has made their position worse. */

const CUSTODY_KEY_WORDS=["ASH","BIRCH","CEDAR","DELTA","ELM","FERN","GORSE","HAZEL","IRIS","JUNIPER",
  "KELP","LARCH","MOSS","NETTLE","OAK","PINE","QUARTZ","ROWAN","SORREL","THISTLE","UMBER","VETCH",
  "WILLOW","XYLEM","YEW","ZEPHYR"];

function blankCustody(){
  return {devices:[],keys:[],policy:"single",assigned:[],configBackedUp:false,
    orders:[],parts:{},builds:[],exposure:[],seq:0,lastScare:0};
}
function custodyProduct(id){return CUSTODY_PRODUCTS.find(p=>p.id===id)||null}
function custodyPolicy(id){return CUSTODY_POLICIES.find(p=>p.id===id)||CUSTODY_POLICIES[0]}
function custodyProductAvailable(p,t=state.time){return !!p&&t>=at(p.date)}
/* A one-off, like the old PC in the basement, is refused while a working one exists or is on its way. A fire that took
   it is the reason to put another together from spare parts, which is the same product reached a different way. */
function custodyOnceBlocked(p){return !!p&&!!p.once&&((state.custody.devices||[]).some(d=>d.product===p.id&&!d.destroyed)||(state.custody.orders||[]).some(o=>o.id===p.id))}
function custodyAcquireLabel(p){const lost=(state.custody.devices||[]).some(d=>d.product===p.id&&d.destroyed);return lost&&p.acquireAgain?p.acquireAgain:p.acquire}

/* A label the player can recognise a key by. Deliberately not anything resembling a real
   recovery phrase: these are identifiers for a key, never the key itself. */
function nextKeyLabel(){
  const c=state.custody;c.seq=(c.seq||0)+1;
  const word=CUSTODY_KEY_WORDS[(c.seq-1)%CUSTODY_KEY_WORDS.length];
  const run=Math.floor((c.seq-1)/CUSTODY_KEY_WORDS.length)+1;
  return run>1?`${word}-${run}`:word;
}

/* ---- reading the current setup ------------------------------------------------------- */

function custodyDevice(uid){return (state.custody.devices||[]).find(d=>d.uid===uid)||null}
function custodyKey(id){return (state.custody.keys||[]).find(k=>k.id===id)||null}
function custodyAssignedKeys(s=state){
  const c=s.custody||{};
  return (c.assigned||[]).map(id=>(c.keys||[]).find(k=>k.id===id)).filter(Boolean);
}
function custodySetup(s=state){
  const c=s.custody||blankCustody();
  const policy=custodyPolicy(c.policy);
  const assigned=custodyAssignedKeys(s);
  // Distinct SEEDS, not distinct devices. Restoring one seed onto three signers is one key.
  const distinct=new Set(assigned.map(k=>k.seed||k.id)).size;
  const ready=distinct>=policy.keys;
  const backed=assigned.filter(k=>k.backup&&!k.backup.destroyed);
  const steel=backed.filter(k=>k.backup.durability==="steel");
  // A single-sig wallet is fully described by its seed. A multisig is not: without the
  // descriptor the seeds are not enough to rebuild the wallet.
  const configOk=policy.threshold===1?true:!!c.configBackedUp;
  const where=custodyPlaceSummary(s);
  return {policy,assigned,distinct,ready,
    backedUp:backed.length,steelBacked:steel.length,
    unbacked:assigned.length-backed.length,configOk,
    // Distinct seeds that can still produce a signature: a working device, or a backup to rebuild one from.
    usable:custodyUsableSeeds(s).size,liveDistinct:new Set(assigned.filter(k=>custodyKeyLive(k,s)).map(k=>k.seed||k.id)).size,
    exposed:assigned.filter(k=>k.exposed).length,placed:where.placed,fragile:where.fragile,fragileAt:where.fragileAt};
}

/* Multiplies the chance somebody else spends your coins. An unconfigured wallet gets no
   protection at all, because owning a device in a drawer is not custody. */
function custodyCompromiseFactor(s=state){
  const set=custodySetup(s);
  // Signing offline narrows what a compromised machine can reach, whatever the policy is.
  const airgap=s.skills?.includes("airgap")?.7:1;
  if(!set.ready)return 1;
  // A stolen backup is a seed somebody else holds. Until it is replaced it widens every risk.
  const leaked=Math.pow(1.6,Math.min(3,set.exposed));
  if(set.policy.threshold<=1)return .55*airgap*leaked;
  // Requiring two independent secrets is the single largest reduction available here.
  return .18*airgap*leaked;
}

/* The chance per month that a self-custody setup becomes unrecoverable: a device dies, a
   house floods, a seed card is thrown out. Backups are what stand between that and a loss. */
function custodyLossRisk(s=state){
  const held=(s.wallets?.hot||0)+(s.wallets?.cold||0);
  if(held<=0||s.time<at("2011-01-01"))return 0;
  const set=custodySetup(s);
  if(!set.ready)return typeof hotKey==="function"&&hotKey(s)?0:.0018;   // no managed setup: whatever you scrawled (the online wallet's own key has its own risk)
  let risk=.0016;
  if(set.unbacked===0)risk*=.35;                     // every key written down somewhere
  if(set.steelBacked>=set.assigned.length)risk*=.45; // and written down on something durable
  if(set.policy.threshold>1){
    // Two of three keys survive most single accidents - but only if the wallet can be
    // rebuilt at all, and seeds alone cannot rebuild a multisig.
    risk*=set.configOk?.3:2.4;
  }
  /* Everything that could rebuild the wallet sharing one fate. Only counted for a setup that has
     said where things are, so a save from before places existed prices exactly as it did. */
  if(set.placed&&set.fragile)risk*=1.8;
  return risk;
}
/* Whether an incident is survivable rather than terminal. This is the question the whole
   feature is about, so it is one function and it is honest about what it needs. */
function custodyRecoverable(s=state){
  const set=custodySetup(s);
  if(!set.ready)return false;
  if(!set.configOk)return false;
  if(set.policy.threshold>1)return set.backedUp>=set.policy.threshold;
  return set.backedUp>=1;
}
function custodyReadiness(s=state){
  const set=custodySetup(s);
  if(!set.ready)return{label:"Not configured",tone:"bad",
    detail:`${set.distinct} of ${set.policy.keys} keys assigned`};
  if(!set.configOk)return{label:"Config not backed up",tone:"bad",
    detail:"Seeds alone cannot rebuild a multisig wallet"};
  if(set.exposed>0){
    const first=set.assigned.find(k=>k.exposed);
    return{label:"Key exposed",tone:"bad",detail:first&&first.exposed.cause==="former-employee"
      ?`A former ${STAFF.find(r=>r.id===first.exposed.role)?.name?.toLowerCase()||"employee"} knew ${first.label}. Rotate it onto a spare signer`
      :"An assigned key was copied or its backup was stolen. Rotate that key: somebody else now knows the secret"}}
  if(set.liveDistinct<set.policy.threshold)return{label:"Signers destroyed",tone:"bad",
    detail:set.usable>=set.policy.threshold?"Restore the keys from their backups onto new devices":"Not enough keys survive to sign or to rebuild. The coins are stranded"};
  if(set.unbacked>0)return{label:"Keys not backed up",tone:"warn",
    detail:`${set.unbacked} of ${set.assigned.length} keys have no backup`};
  if(set.placed&&set.fragile)return{label:"One place holds too much",tone:"warn",
    detail:`Losing ${set.fragileAt?`${custodyPlaceName(set.fragileAt)}`:"one place"} would leave the wallet unrecoverable. Keep backups apart from the signers`};
  if(set.steelBacked<set.assigned.length)return{label:"Paper backups",tone:"warn",
    detail:"Durable backups survive what paper does not"};
  return{label:"Ready",tone:"good",detail:"Keys assigned, backed up and recoverable"};
}

/* ---- key strength ------------------------------------------------------------------- */

function custodyWeakEntropyAt(product,t){
  const w=COLDCARD_ENTROPY_WINDOW;
  if(!product||product.supplier!==w.supplier)return false;
  return t>=at(w.from)&&t<at(w.to);
}
function custodyWeakKeys(s=state){return (s.custody?.keys||[]).filter(k=>k.weakEntropy)}
/* Can the wallet be spent using weak keys alone? That is the only question that matters:
   one brute-forceable key in a 2-of-3 moves nothing, and two of them move everything. */
function custodyWeakQuorum(s=state){
  const set=custodySetup(s);
  if(!set.ready)return custodyWeakKeys(s).length>0&&(s.custody?.assigned||[]).length>0;
  const weakAssigned=new Set(set.assigned.filter(k=>k.weakEntropy).map(k=>k.seed)).size;
  return weakAssigned>=set.policy.threshold;
}

/* ---- supplier exposure --------------------------------------------------------------- */

/* A vendor losing its customer list is a privacy event, not a theft. It exposes the people
   who bought from that vendor in that window - and it keeps exposing them, because a list
   that has leaked cannot be un-leaked by buying a different device later. */
function custodySupplierExposed(supplier,s=state){
  return (s.custody?.exposure||[]).some(e=>e.supplier===supplier);
}
function custodyExposedPurchases(s=state){
  const exposure=s.custody?.exposure||[];
  if(!exposure.length)return[];
  const out=[];
  for(const device of (s.custody?.devices||[])){
    for(const leak of exposure){
      if(device.supplier!==leak.supplier)continue;
      if(leak.from&&device.boughtAt<at(leak.from))continue;
      if(leak.to&&device.boughtAt>at(leak.to))continue;
      out.push({device,leak});
    }
  }
  return out;
}
function custodyPrivacyExposed(s=state){return custodyExposedPurchases(s).length>0}

/* ---- buying, building and configuring ------------------------------------------------ */

function custodyLeadDays(p){
  const base=p.lead||0;
  return Math.max(0,Math.round(base*(hasSkill("supplychain")?.6:1)));
}
/* Cash a custody purchase can draw on: cash, plus what the tutorial is holding aside when the purchase is a signer. */
function custodyCash(p){return state.cash+(p&&p.kind==="signer"&&typeof tourEscrow==="function"?tourEscrow():0)}
function custodyUnitCost(p){return (p.cost||0)*(hasSkill("procurement")?.94:1)*(hasStaff("procurementlead")?.95:1)}

function orderCustodyProduct(id,qty=1){
  const p=custodyProduct(id);
  if(!p||p.build)return;
  if(!custodyProductAvailable(p))return showToast("Not available yet",`${p.name} does not exist until ${dateFmt(at(p.date),true)}.`);
  qty=Math.max(1,Math.floor(Number(qty)||1));
  // The tutorial holds a signer's price aside from cash; this is the purchase it is held for.
  if(typeof tourReleaseFor==="function")tourReleaseFor(p,qty);
  // Some things are one-offs: there is one old PC in the basement.
  if(custodyOnceBlocked(p))return showToast("There is only the one",`You already have ${p.name}. Buy a signer if you need another.`,"blocked","custody");
  const unit=custodyUnitCost(p),cost=unit*qty;
  if(state.cash<cost)return showToast("Not enough cash",`${qty} × ${p.name} costs ${fmtUsd(cost)}.`);
  state.cash-=cost;
  const lead=custodyLeadDays(p);
  if(lead<=0){receiveCustodyOrder({id,qty,supplier:p.supplier},state.time);save();render();return}
  state.custody.orders.push({id,qty,supplier:p.supplier,due:state.time+lead*DAY,cost});
  if(p.acquire){const again=custodyAcquireLabel(p)===p.acquireAgain&&!!p.acquireAgain;log(again?`Putting ${p.name} back together`:`Fetching ${p.name}`,`${again?"from spare parts":"from the basement"} · ${lead} day${lead===1?"":"s"}`,"custody");showToast(again?"Cobbling one together":"Digging it out",again?`A replacement ${p.name} is going together from spare parts. It is ready in ${lead} day${lead===1?"":"s"}.`:`${p.name} is on its way up from the basement. It arrives in ${lead} day${lead===1?"":"s"}.`,"info","custody")}
  else{log(`Ordered ${p.name}`,`${qty} × ${fmtUsd(unit)} · ${lead} days`,"custody");
  showToast("Custody order placed",`${qty} × ${p.name} arrives in ${lead} days.`,"info","custody")}
  save();render();
}
/* Delivery. A signing device becomes an object you own and nothing more - it holds no key
   until you generate one on it. Parts and backup media go to stock. */
function receiveCustodyOrder(order,when){
  const p=custodyProduct(order.id);if(!p)return;
  const c=state.custody;
  const add=(pid,n)=>{c.parts[pid]=(c.parts[pid]||0)+n};
  if(p.kind==="signer"){
    for(let i=0;i<order.qty;i++){
      c.seq=(c.seq||0)+1;
      c.devices.push({uid:`d${c.seq}`,product:p.id,supplier:order.supplier||p.supplier,
        boughtAt:order.boughtAt||when,keyId:null,place:"site",workshopSetup:1});
    }
  } else if(p.kind==="kit"){
    for(const [pid,n] of Object.entries(p.contains||{}))add(pid,n*order.qty);
  } else add(p.id,order.qty);
  log(`Delivered: ${p.name}`,`${order.qty} × received`,"custody");
}
function advanceCustodyOrders(next){
  const c=state.custody;
  c.orders=(c.orders||[]).filter(o=>{
    if(pendingAt(o,next))return true;
    receiveCustodyOrder({...o,boughtAt:o.due-((custodyProduct(o.id)?.lead||0)*DAY)},next);
    const p=custodyProduct(o.id);
    showToast("Custody hardware delivered",`${o.qty} × ${p?p.name:o.id} has arrived. ${p?.kind==="signer"?"A signer protects the key while approving payments; owning one alone does not protect a balance. Generate or restore a key, then check the wallet policy and recovery plan.":p?.kind==="backup"?"Durable material helps a backup survive physical damage. Once recorded, the secret still needs protection from being read or stolen.":"The parts are available for your custody setup."}`,"info","custody");
    renderFullQueued=true;
    return false;
  });
  c.builds=(c.builds||[]).filter(b=>{
    if(pendingAt(b,next))return true;
    const build=CUSTODY_BUILDS[b.build];
    c.seq=(c.seq||0)+1;
    c.devices.push({uid:`d${c.seq}`,product:build.id,supplier:"selfbuilt",boughtAt:b.startedAt,keyId:null,place:"site",
      enclosed:!!b.enclosed,workshopSetup:1});
    log(`Assembled ${build.name}`,b.enclosed?"Verified and enclosed":"Verified, no enclosure","custody");
    showToast("SeedSigner assembled",`The assembly is ready to generate or restore a key. This signer forgets the seed between uses, so the backup is essential: losing the device need not lose the wallet, but losing the only seed copy can.`,"info","custody");
    renderFullQueued=true;
    return false;
  });
}

function custodyBuildShortfall(buildId){
  const build=CUSTODY_BUILDS[buildId];if(!build)return null;
  const stock=state.custody.parts||{};
  const missing={};
  for(const [pid,n] of Object.entries(build.required))if((stock[pid]||0)<n)missing[pid]=n-(stock[pid]||0);
  return Object.keys(missing).length?missing:null;
}
function assembleCustodyBuild(buildId){
  const build=CUSTODY_BUILDS[buildId];if(!build)return;
  const product=CUSTODY_PRODUCTS.find(p=>p.build===buildId);
  if(product&&!custodyProductAvailable(product))
    return showToast("Not available yet",`${product.name} does not exist until ${dateFmt(at(product.date),true)}.`);
  const missing=custodyBuildShortfall(buildId);
  if(missing)return showToast("Missing components",
    Object.entries(missing).map(([pid,n])=>`${n} × ${custodyProduct(pid)?.name||pid}`).join(", ")+" still needed.");
  const c=state.custody;
  for(const [pid,n] of Object.entries(build.required))c.parts[pid]=(c.parts[pid]||0)-n;
  let enclosed=false;
  for(const [pid,n] of Object.entries(build.optional||{})){
    if((c.parts[pid]||0)>=n){c.parts[pid]-=n;enclosed=true}
  }
  c.builds.push({build:buildId,due:state.time+build.days*DAY,startedAt:state.time,enclosed});
  log(`Assembling ${build.name}`,`${build.days} days${enclosed?" · enclosure fitted":""}`,"custody");
  showToast("Assembly started",`${build.name} will be verified in ${build.days} days.`,"info","custody");
  save();render();
}

/* A key is generated ON a device. A stateless signer does not retain it, which is exactly
   why losing that device is not losing the wallet. */
function generateCustodyKey(uid){
  const device=custodyDevice(uid);if(!device)return;
  if(typeof workshopPrepared==="function"&&!workshopPrepared(device))return showToast("Prepare the signer first","Inspect the device and prepare its signing client in the custody workshop before creating a key.","blocked","custody");
  if(device.keyId)return showToast("Device already holds a key",`Generate on a device that has none, or the two keys will not be independent.`);
  const product=custodyProduct(device.product);
  const c=state.custody;
  const key={id:`k${(c.keys.length+1)}`,label:nextKeyLabel(),seed:`s${c.keys.length+1}`,
    bornOn:state.time,deviceUid:uid,stateless:!!product?.stateless,backup:null,
    // Weakness is a property of the seed at the moment it was generated. It does not attach
    // to the device, cannot be patched away, and follows the seed onto any other signer.
    weakEntropy:custodyWeakEntropyAt(product,state.time)};
  c.keys.push(key);device.keyId=key.id;
  log(`Generated key ${key.label}`,`${product?product.name:device.product}${product?.stateless?" · stateless signer":""}`,"custody");
  showToast("Key generated",`Key ${key.label} exists on ${product?product.name:"the device"}. This device holds the signing secret, not the coins themselves. Back the key up so you can recover after a device failure, then assign it to the cold-storage policy.`,"info","custody");
  save();render();
}
/* Restoring an existing seed onto a second device. The model keeps the seed identity, so
   the wallet still counts one key however many enclosures are holding it. */
function restoreCustodyKey(uid,keyId){
  const device=custodyDevice(uid),key=custodyKey(keyId);
  if(!device||!key||device.keyId||device.restoring)return;
  /* The seed is on its backup, and the backup is somewhere. Fetching it takes the days that place takes, so
     the safest place is the slowest to recover from; at the mine, or with no place recorded, it is at once. */
  const days=custodyRestoreDays(key);
  if(days<0)return showToast("The backup is on a journey","It has to arrive before a key can be restored from it.","bad","custody");
  if(days>0){
    device.restoring=key.id;
    custodyRestores().push({uid,keyId:key.id,started:state.time,due:state.time+days*DAY,days});
    log(`Restoring ${key.label} from its backup`,`${custodyPlaceName(key.backup.place)} · ${days} day${days===1?"":"s"}`,"custody");
    showToast("Fetching the backup",`${key.label}'s backup is at ${placeSay(key.backup.place)}. It takes ${days} day${days===1?"":"s"} to fetch and restore, and the wallet cannot sign with this key until it is done.`,"info","custody");
    save();render();return;
  }
  device.keyId=key.id;
  log(`Restored ${key.label} to a second device`,"Still one key, on two devices","custody");
  showToast("Seed restored",`${key.label} can now sign from either device. That helps if one device fails, but both hold the same secret: copying a key does not create a second approval for multisig.`,"notice","custody");
  save();render();
}

function backupCustodyKey(keyId,productId){
  const key=custodyKey(keyId);if(!key)return;
  const p=custodyProduct(productId);if(!p||p.kind!=="backup")return;
  if(!custodyProductAvailable(p))return showToast("Not available yet",`${p.name} does not exist until ${dateFmt(at(p.date),true)}.`);
  const c=state.custody;
  if((p.cost||0)>0){
    if((c.parts[p.id]||0)<1)return showToast("None in stock",`Order ${p.name} before backing a key up with it.`);
    c.parts[p.id]-=1;
  }
  key.backup={product:p.id,durability:p.durability||"paper",at:state.time,place:"site"};
  log(`Backed up key ${key.label}`,p.name,"custody");
  showToast("Key backed up",`${key.label} is recorded on ${p.name}. This copy can restore spending access if the device dies. It is kept at the mine for now: move it away from the same fire risk, and protect it from anyone who could read it.`,"info","custody");
  save();render();
}
function setCustodyPolicy(id){
  const policy=custodyPolicy(id);
  if(policy.threshold>1&&!hasSkill("multisig"))
    return showToast("Multisig discipline required","Multisig divides permission to spend between independent keys. Unlock Multisig discipline first: you need enough keys to approve a payment, enough backups to recover, and a record of how the wallet fits together.");
  state.custody.policy=policy.id;
  state.custody.assigned=(state.custody.assigned||[]).slice(0,policy.keys);
  if(policy.threshold<=1)state.custody.configBackedUp=false;
  log(`Wallet policy: ${policy.name}`,`${policy.threshold} of ${policy.keys}`,"custody");
  save();render();
}
function assignCustodyKey(keyId){
  const c=state.custody,policy=custodyPolicy(c.policy),key=custodyKey(keyId);
  if(!key)return;
  if(key.retired)return showToast("That key is retired","It was replaced because somebody else may know it. Putting it back would undo the rotation.","bad","custody");
  if(key.hot)return showToast("That is your online wallet","The key behind your online wallet lives on the mining computer. A wallet policy needs keys on signers of their own.","bad","custody");
  if(c.assigned.includes(keyId))return;
  if(c.assigned.length>=policy.keys)return showToast("Wallet is full",`${policy.name} takes ${policy.keys} key${policy.keys===1?"":"s"}.`);
  const seeds=custodyAssignedKeys().map(k=>k.seed);
  if(seeds.includes(key.seed))return showToast("That is the same key",
    "This seed is already assigned. If someone copies that secret, they can use every device holding it. Multisig needs independently generated keys so one stolen secret cannot count as several approvals.");
  c.assigned.push(keyId);
  // Changing the key set invalidates the descriptor you previously wrote down.
  if(policy.threshold>1)c.configBackedUp=false;
  log(`Assigned key ${key.label} to the wallet`,`${c.assigned.length} of ${policy.keys}`,"custody");
  save();render();
}
function unassignCustodyKey(keyId){
  const c=state.custody;
  c.assigned=(c.assigned||[]).filter(id=>id!==keyId);
  if(custodyPolicy(c.policy).threshold>1)c.configBackedUp=false;
  save();render();
}
function backupCustodyConfig(){
  const c=state.custody,set=custodySetup();
  if(!set.ready)return showToast("Nothing to record yet","Assign every key the policy needs before writing the configuration down.");
  c.configBackedUp=true;c.configPlace="site";
  log("Backed up the wallet configuration","Policy, key fingerprints and derivation recorded","custody");
  showToast("Configuration backed up",
    "You have recorded which keys belong together and how they form the wallet. The backups provide the secrets; this configuration provides the map. Keep a copy away from the same building so recovery does not depend on the original devices surviving.","info","custody");
  save();render();
}


/* ---- what can go wrong, rolled once a calendar month with the other operational risks ---- */

/* Two different accidents, deliberately kept apart. A loss is nobody spending the coins,
   including you; a phishing success is somebody else spending them. Backups answer the first
   and a spending quorum answers the second, which is why neither alone is a complete
   position. */
/* The waves. A guessable key is not a risk that might happen - it is a key somebody else
   already has, and the only variable is when they get to you. So this drains rather than
   rolls, in tranches, and it keeps draining for as long as the wallet can still be opened by
   weak keys alone. Rotating to a fresh seed stops it, which is exactly the remedy the
   advisory describes and the only one that works. */
function advanceEntropyDrain(next){
  const alert=state.custody.entropyAlert;
  if(!alert)return;
  if(!custodyWeakQuorum())return;
  const held=(state.wallets.hot||0)+(state.wallets.cold||0);
  if(held<=0)return;
  const days=Math.max(0,(next-alert.since)/DAY);
  if(days>45)return;                                  // the waves ran their course
  const share=days<1?.33:.18;                          // the first wave took the most
  const taken=held*share;
  const hotShare=held>0?(state.wallets.hot||0)/held:0;
  state.wallets.hot=Math.max(0,state.wallets.hot-taken*hotShare);
  state.wallets.cold=Math.max(0,state.wallets.cold-taken*(1-hotShare));
  log("Coldcard entropy theft",`-${fmtBtc(taken)} · swept from a guessable key`,"custody");
  reportCoinLoss({
    title:"Your coins are being swept",kind:"stolen",btc:taken,cause:"entropy",
    from:"self-held keys generated on the affected signer",
    what:`${fmtBtc(taken)} was swept in this wave. The waves continue for as long as the wallet can still be opened by the weak key alone.`,
    why:"A seed generated on a Coldcard inside the affected window is brute-forceable. This is not a risk that might happen - it is a key somebody else already has, and the only variable is when they reach you. No firmware update repairs a seed that was already generated.",
    remedy:"Generate a fresh key on a different signer and move everything that is left to it. Patching the device does nothing; only rotating the seed stops this.",
    tab:"custody"});
}
function advanceCustodyRisks(next,silent=false){
const lossRisk=custodyLossRisk();
if(lossRisk>0&&nextRand()<lossRisk){
  const held=(typeof hotKey==="function"&&hotKey()?0:(state.wallets.hot||0))+(state.wallets.cold||0);
  if(custodyRecoverable()){
    // The accident happened; the backups answered it. This is what they are for.
    const set=custodySetup();
    const effort=Math.min(state.cash,180+Math.round(240*(set.policy.threshold>1?1.6:1)));
    state.cash=Math.max(0,state.cash-effort);
    state.custody.lastScare=state.time;
    log("Signer lost, wallet recovered",`Restored from backups · -${fmtUsd(effort)} in recovery effort`,"custody");
    if(!silent)showToast("A signer was lost - and it did not matter",
      `The device is gone. ${set.policy.threshold>1?"Two of three keys and the wallet configuration":"The seed backup"} rebuilt the wallet for ${fmtUsd(effort)}.`,"notice","custody");
  } else {
    const lost=held*(.35+nextRand()*.4);
    const hotShare=held>0&&!(typeof hotKey==="function"&&hotKey())?(state.wallets.hot||0)/held:0;
    state.wallets.hot=Math.max(0,state.wallets.hot-lost*hotShare);
    state.wallets.cold=Math.max(0,state.wallets.cold-lost*(1-hotShare));
    log("Self-held coins became unrecoverable",`-${fmtBtc(lost)} · no usable backup`,"custody");
    reportCoinLoss({
      title:"Coins lost, not stolen",kind:"unrecoverable",btc:lost,cause:"nobackup",
      from:"self-held keys",
      what:`A signing device failed and no usable backup existed to rebuild the wallet from. ${fmtBtc(lost)} is still on the chain at an address nobody can spend from.`,
      why:"Nobody took these. The key that could move them stopped existing, and a key with no backup is a key you only borrow.",
      remedy:custodySetup().policy.threshold>1?"A multisig needs its wallet configuration backed up as well as its seeds - the descriptor is as necessary as the keys, and restoring without it is not possible.":"Write the seed down and store it away from the device. Then prove the backup works by restoring from it, because a backup you have never tested is a belief, not a backup.",
      tab:"custody"});
  }
}
if(custodyPrivacyExposed()&&((state.wallets.hot||0)+(state.wallets.cold||0))>0&&nextRand()<.055){
  const set=custodySetup();
  if(set.ready&&set.policy.threshold>1){
    // A convincing fake extracts one secret. In a quorum wallet one secret spends nothing.
    log("Targeted phishing attempt",`Impersonated ${CUSTODY_SUPPLIERS[custodyExposedPurchases()[0]?.leak.supplier]?.name||"the vendor"} · one key is not enough to spend`,"custody");
    if(!silent)showToast("Someone tried the leaked list on you",
      "A convincing fake asked you to re-enter a seed. Even if it had worked, one key of three spends nothing.","notice","custody");
  } else if(nextRand()<.34){
    const held=(state.wallets.hot||0)+(state.wallets.cold||0);
    const lost=held*(.15+nextRand()*.3);
    const hotShare=held>0?(state.wallets.hot||0)/held:0;
    state.wallets.hot=Math.max(0,state.wallets.hot-lost*hotShare);
    state.wallets.cold=Math.max(0,state.wallets.cold-lost*(1-hotShare));
    log("Phishing succeeded",`-${fmtBtc(lost)} · a seed was entered into a convincing fake`,"custody");
    reportCoinLoss({
      title:"The fake was convincing enough",kind:"stolen",btc:lost,cause:"phishing",
      from:"self-held keys",
      what:`A message impersonating your hardware-wallet vendor asked you to re-enter your recovery seed for a security check. ${fmtBtc(lost)} left within the hour.`,
      why:"The device was never compromised - the list of people who owned one was. A vendor data leak turns every customer into a known, addressable target, and the approach arrives knowing your name, your address and what you bought.",
      remedy:"A seed is never entered anywhere but the signing device itself, and no vendor will ever ask for it. A quorum wallet would also have survived this: one key handed over spends nothing.",
      tab:"custody"});
  } else {
    log("Targeted phishing attempt","Recognised and ignored","custody");
  }
}
}
