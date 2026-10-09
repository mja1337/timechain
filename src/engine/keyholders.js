"use strict";

/* PEOPLE - who holds a key, what happens when they leave, and how a key is replaced.

   A key is a secret, and a secret that a person knows is a secret that goes when they do. So a key
   can be held by the owner or by somebody on the payroll, and dismissing the person who held it
   does not remove the key from the wallet: it makes it known to someone who no longer works for
   you. That is a different problem from a lost key or a stolen one, and it has a different
   answer, which is the one real operators give: replace the key and move the coins.

   Three things follow:

     EXPOSURE  Dismissing a holder marks every key they ever knew as exposed. An exposed key
               raises the wallet's compromise risk (custody.js) until it is replaced.

     INSIDER   If the exposed keys alone are enough to satisfy the wallet, somebody can spend.
               The key stays usable by its owner, and the danger is the clock: a chance each day
               that rises every day, and sometimes steeply. Half of those who learn a key mean to
               use it and will within weeks; the rest wait at least a quarter and then the chance
               climbs too. A security officer halves it, and only replacing the key ends it. One
               exposed key of a 2-of-3 is harmless; the same key in a single-signature wallet is
               the whole wallet.

     ROTATION  Replacing a key is a job, not a click. A new key is generated on a spare signer, every
               coin is swept to the new wallet, which costs the real fee for the weight of the
               coins and takes days, and the wallet's descriptor has to be written down again.
               It also consolidates the coins into one, which is the one thing that makes the next
               spend cheap.

   A stolen backup (places.js) uses the same field and the same answer. A key with a known weak
   seed does too, which is the remedy the entropy advisory has always described.

   Rolls are hashes of the seed, never nextRand(). Loaded after places.js. */

const INSIDER_SECURITY_FACTOR=.5,INSIDER_TAKE_FLOOR=.6,INSIDER_TAKE_SPREAD=.4;
/* Two kinds of person, and the player is never told which. Half of those who learn a key and leave
   are HOSTILE: the chance they use it is nothing on the first day and climbs every day after, so that
   within a month it is more likely than not. The rest are PATIENT: nothing for at least three months,
   because a game's day passes quickly and a quiet quarter is the point, and then a chance that climbs
   every day until it is a certainty. Either way every day exposed is a worse day than the one before. */
const INSIDER_HOSTILE_SHARE=.5;
const INSIDER_HOSTILE={slope:.004,cap:.35};
const INSIDER_PATIENT={quiet:90,slope:.0002,cap:.1};

/* ---- who holds what -------------------------------------------------------------------- */

function custodyHolder(key){return key&&CUSTODY_HOLDERS.includes(key.holder)?key.holder:"owner"}
function custodyHolderName(id){return id==="owner"?"You":(STAFF.find(r=>r.id===id)?.name||id)}
function custodyHolderAvailable(id){return id==="owner"||(CUSTODY_HOLDERS.includes(id)&&hasStaff(id))}
/* Everyone who has ever known this key. Handing it to someone else does not make the last
   person forget it. */
function custodyKnownBy(key){return new Set([...(key.knownBy||[]),custodyHolder(key)].filter(id=>id!=="owner"))}

function setKeyHolder(keyId,role){
  const key=custodyKey(keyId);if(!key)return;
  if(!custodyHolderAvailable(role))return showToast("Nobody in that post",`${custodyHolderName(role)} is not on your payroll. Hire them first, or keep the key yourself.`,"bad","custody");
  const was=custodyHolder(key);if(was===role)return;
  key.knownBy=[...custodyKnownBy(key)];
  key.holder=role;
  log(`Key ${key.label} now held by ${custodyHolderName(role)}`,was==="owner"?"Was held by you":`Was held by ${custodyHolderName(was)}, who still knows it`,"custody");
  showToast("Key handed over",`${custodyHolderName(role)} now holds ${key.label}.${was!=="owner"?` ${custodyHolderName(was)} still knows it, so dismissing them would still expose it.`:""}`,"info","custody");
  save();render();
}
/* A technician who is busy on a repair crew is not free to sign. */
function custodyHolderDelay(key,s=state){
  if(custodyHolder(key)!=="fieldtech")return 0;
  const techs=fieldTechnicianCount(s);if(techs<=0)return 0;
  const committed=((s.maintenance&&s.maintenance.serviceJobs)||[]).reduce((sum,job)=>sum+(job.contracted?0:Number(job.crew||0)),0);
  return committed>=techs?1:0;
}

/* ---- someone leaves ---------------------------------------------------------------------- */

/* Called after a dismissal, with how many were in the post before. */
function custodyOnDismiss(roleId,countBefore=1){
  if(!state.custody||roleId==="owner")return;
  const hit=[];
  for(const key of custodyAssignedKeys()){
    if(key.exposed||!custodyKnownBy(key).has(roleId))continue;
    // One technician of several held it. Whether it was the one who left is settled by the seed, not by a coin flip.
    if(roleId==="fieldtech"&&countBefore>1&&hashRoll(state.seed,"dismiss",key.id,state.time)>=1/countBefore)continue;
    key.exposed={cause:"former-employee",role:roleId,at:state.time};hit.push(key);
  }
  if(!hit.length)return;
  const name=STAFF.find(r=>r.id===roleId)?.name||roleId,list=hit.map(k=>k.label).join(", ");
  log(`${name} left knowing ${hit.length===1?"a key":"keys"}`,`${list} · replace ${hit.length===1?"it":"them"}`,"custody");
  showToast(`${hit.length===1?"A key is":"Keys are"} now known to a former employee`,
    `${name} knew ${list}. ${hit.length===1?"It stays":"They stay"} in the wallet until ${hit.length===1?"it is":"they are"} replaced, and a former employee is an insider risk for as long as that takes. Rotate ${hit.length===1?"it":"them"} onto a spare signer.`,"bad","custody");
}
/* The wording the dismiss button needs, or "" when nobody's key is at stake. */
function custodyDismissNote(roleId){
  if(!state.custody||roleId==="owner")return "";
  const keys=custodyAssignedKeys().filter(k=>!k.exposed&&custodyKnownBy(k).has(roleId));
  if(!keys.length)return "";
  const name=STAFF.find(r=>r.id===roleId)?.name||roleId;
  return `${name} knows ${keys.map(k=>k.label).join(", ")}. Dismissing them exposes ${keys.length===1?"that key":"those keys"} until you replace ${keys.length===1?"it":"them"}.`;
}

/* ---- the insider ---------------------------------------------------------------------------- */

/* The chance, on one day, that somebody who knows a key uses it, `days` days after they came to
   know it. Rising every day, never falling. */
function insiderDailyHazard(days,hostile){
  if(days<1)return 0;
  if(hostile)return Math.min(INSIDER_HOSTILE.cap,INSIDER_HOSTILE.slope*days);
  return days<=INSIDER_PATIENT.quiet?0:Math.min(INSIDER_PATIENT.cap,INSIDER_PATIENT.slope*(days-INSIDER_PATIENT.quiet));
}
function insiderSecurityFactor(){return hasStaff("security")?INSIDER_SECURITY_FACTOR:1}
/* Every exposed key of the wallet, whoever learned it and however. Together they are what a person
   with a grudge, or a thief, has to work with. */
function custodyExposedKeys(s=state){return custodyAssignedKeys(s).filter(k=>k.exposed)}
/* Whether the keys somebody else knows are enough to spend on their own. */
function custodyInsiderCanSpend(s=state){
  const policy=custodyPolicy(s.custody.policy),seeds=new Set(custodyExposedKeys(s).map(k=>k.seed||k.id));
  return seeds.size>0&&seeds.size>=policy.threshold;
}
/* The key that has been known longest sets the clock, and its seed decides what sort of person
   knew it. Deterministic, so the same run always meets the same person. */
function insiderLead(s=state){
  return custodyExposedKeys(s).slice().sort((a,b)=>(a.exposed.sweptAt||a.exposed.at)-(b.exposed.sweptAt||b.exposed.at))[0]||null;
}
function insiderIsHostile(key,s=state){return hashRoll(s.seed,"insider-type",key.id,key.exposed.at)<INSIDER_HOSTILE_SHARE}
function insiderDaysExposed(next=state.time,s=state){
  const lead=insiderLead(s);return lead?Math.max(0,Math.floor((next-(lead.exposed.sweptAt||lead.exposed.at))/DAY)):0;
}
/* What the player is shown: the chance today, averaged over the two kinds of person, because the
   game does not say which one it is. */
function insiderShownHazard(s=state){
  const days=insiderDaysExposed(state.time,s);
  return insiderSecurityFactor()*(INSIDER_HOSTILE_SHARE*insiderDailyHazard(days,true)+(1-INSIDER_HOSTILE_SHARE)*insiderDailyHazard(days,false));
}
function advanceInsiderRisk(next){
  if(!state.custody||!custodyInsiderCanSpend())return;
  const hot=state.wallets.hot||0,cold=state.wallets.cold||0,held=hot+cold;if(held<=0)return;
  const lead=insiderLead();if(!lead)return;
  const days=Math.floor((next-(lead.exposed.sweptAt||lead.exposed.at))/DAY);
  const chance=insiderDailyHazard(days,insiderIsHostile(lead))*insiderSecurityFactor();
  if(!(chance>0)||hashRoll(state.seed,"insider",lead.id,Math.floor(next/DAY))>=chance)return;
  const taken=held*(INSIDER_TAKE_FLOOR+INSIDER_TAKE_SPREAD*hashRoll(state.seed,"insider-take",lead.id,Math.floor(next/DAY)));
  state.wallets.hot=Math.max(0,hot-taken*hot/held);state.wallets.cold=Math.max(0,cold-taken*cold/held);
  // Having been paid once, they start again from nothing: the next chance builds from today.
  lead.exposed.sweptAt=next;
  const former=lead.exposed.cause==="former-employee",name=former?(STAFF.find(r=>r.id===lead.exposed.role)?.name||"A former employee"):"Whoever took the backup",
    labels=custodyExposedKeys().map(k=>k.label).join(", "),quorum=custodyPolicy(state.custody.policy).threshold>1;
  log(`Coins swept by ${former?"a former employee":"a thief"}`,`-${fmtBtc(taken)} · ${days} day${days===1?"":"s"} after ${former?"they left":"the break-in"}`,"custody");
  reportCoinLoss({title:former?"A former employee used a key they still had":"A stolen key was used",kind:"stolen",btc:taken,cause:"insider",from:"self-held keys",
    what:`${name} still knew ${labels} and used ${quorum?"enough keys":"it"} to sweep ${fmtBtc(taken)}, ${days} day${days===1?"":"s"} after ${former?"leaving":"the backup was taken"}.`,
    why:"A known key is a loaded one. Dismissing the person who held it, or losing the card it was written on, does not remove it from the wallet, and every day it stays there makes the day it is used more likely.",
    remedy:quorum?"A quorum is what protects you here: one key known to one person spends nothing. Replace the key anyway.":"Replace the key the day it becomes known to anybody else, and move the coins to the new wallet. In a quorum, one key known to one person is not enough to spend.",tab:"custody"});
}

/* ---- replacing a key ------------------------------------------------------------------------ */

function custodyRotation(c=state.custody){return (c&&c.rotation)||null}
function rotateBlockReason(keyId,deviceUid,s=state){
  const c=s.custody,key=custodyKey(keyId),device=custodyDevice(deviceUid);
  if(custodyRotation(c))return "A rotation is already under way.";
  if(!key||!c.assigned.includes(keyId))return "Only a key in the wallet can be rotated.";
  if(!device||device.destroyed||device.restoring||device.place==="transit")return "That signer is not available.";
  if(device.keyId)return "Generate the new key on a signer that holds none, or the two keys will not be independent.";
  return "";
}
/* A rush skips the careful steps and pays the priority fee, as a rush cold spend does: half the days, never fewer than
   two, because a rotation is a signing and a quorum cannot be fully rushed. */
function rotationDays(rush=false){const days=coldSpendDays()+1;return rush?Math.max(2,Math.ceil(days/2)):days}
function rotateCustodyKey(keyId,deviceUid,rush=false){
  const reason=rotateBlockReason(keyId,deviceUid);
  if(reason)return showToast("Cannot rotate",reason,"bad","custody");
  const c=state.custody,old=custodyKey(keyId),device=custodyDevice(deviceUid),product=custodyProduct(device.product);
  const key={id:`k${c.keys.length+1}`,label:nextKeyLabel(),seed:`s${c.keys.length+1}`,bornOn:state.time,deviceUid,
    stateless:!!product?.stateless,backup:null,weakEntropy:custodyWeakEntropyAt(product,state.time)};
  c.keys.push(key);device.keyId=key.id;
  // A person who knew the old key is not handed the new one.
  key.holder=old.exposed&&old.exposed.cause==="former-employee"?"owner":custodyHolder(old);
  // Every coin is swept to the new wallet, and the fee is the real one for the weight being gathered.
  const fee=Math.min(state.wallets.cold||0,transferNetworkFee("cold",1,{rush})),days=rotationDays(rush);
  state.wallets.cold=Math.max(0,(state.wallets.cold||0)-fee);
  c.rotation={old:old.id,new:key.id,due:state.time+days*DAY,started:state.time,fee,days,rush:!!rush};
  log(`Rotating ${old.label} to ${key.label}${rush?" (rushed)":""}`,`${days} day${days===1?"":"s"} · ${fmtBtc(fee)} to sweep the coins`,"custody");
  showToast("Rotation started",`${key.label} is generated and the coins are being swept to the new wallet. It takes ${days} day${days===1?"":"s"} and ${fmtBtc(fee)}. Until it finishes the old key still controls the coins, and signing is paused.`,"info","custody");
  save();render();
}
/* The signer a retired key was on still holds it, and a signer holding a key cannot be the one a new key is
   generated on. A real operator resets the device, which is the whole point of owning a spare; the seed backup is
   untouched, and the retired key stays retired. */
/* A spare signer a replacement key could be generated on. */
function custodySpareSigners(){
  return (state.custody.devices||[]).filter(d=>!d.destroyed&&!d.keyId&&!d.restoring&&d.place!=="transit");
}
function wipeBlockReason(keyId,s=state){
  const key=(s.custody.keys||[]).find(k=>k.id===keyId);
  if(!key||!key.retired)return "Only a retired key's signer can be wiped; this key still controls coins.";
  const device=(s.custody.devices||[]).find(d=>d.keyId===keyId&&!d.destroyed);
  if(!device)return "No signer holds that key any more.";
  if(device.restoring||device.place==="transit")return "That signer is not available.";
  return "";
}
function wipeCustodySigner(keyId){
  const reason=wipeBlockReason(keyId);
  if(reason)return showToast("Cannot wipe",reason,"bad","custody");
  const device=state.custody.devices.find(d=>d.keyId===keyId&&!d.destroyed),key=custodyKey(keyId);
  device.keyId=null;
  log(`Wiped the signer that held ${key.label}`,"It can hold a new key again","custody");
  showToast("Signer wiped",`${key.label} is gone from the device. It is a spare again, and can take a replacement key.`,"success","custody");
  save();render();
}
function advanceRotation(silent=false){
  const c=state.custody,job=custodyRotation(c);
  if(!job||pendingAt(job,state.time))return;
  const old=custodyKey(job.old),fresh=custodyKey(job.new),slot=c.assigned.indexOf(job.old);
  if(slot>=0)c.assigned[slot]=job.new;else if(fresh)c.assigned.push(job.new);
  if(old){old.retired=true;delete old.exposed}
  // A new key set invalidates the descriptor written down for the old one, and so does every copy of it.
  if(custodyPolicy(c.policy).threshold>1){c.configBackedUp=false;c.configCopies=[];delete c.configPlace}
  utxoState().cold=(state.wallets.cold||0)>0?1:0;
  c.rotation=null;
  log(`Rotated to ${fresh?fresh.label:"a new key"}`,`${old?old.label:"The old key"} retired · coins consolidated into one`,"custody");
  if(!silent)showToast("Rotation complete",`${old?old.label:"The old key"} no longer controls anything. ${custodyPolicy(c.policy).threshold>1?"Record the wallet configuration again, and back the new key up. ":"Back the new key up. "}The coins are now a single coin, which is the cheapest thing to spend.`,"success","custody");
  renderFullQueued=true;
}
