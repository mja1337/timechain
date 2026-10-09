"use strict";

/* PLACES - where the keys are, and what reaches them there.

   custody.js says what a wallet is made of. This says where the pieces live, because a backup
   that shares a fate with the thing it backs up is not a backup. Two seed cards in the same
   drawer as the signer are one point of failure with three labels on it.

   Three things follow from a thing having a place:

     TIME   A key kept in a bank box is a trip away. The days to fetch the keys a signing needs
            are added to the signing (see custodySignerDays), so the safest place is the slowest
            and the closest is the likeliest to burn.

     FATE   Each place has a monthly chance of a fire, a flood and a break-in. Fire and flood
            destroy signers and paper; steel survives them. A break-in takes whatever is there,
            steel included, and a stolen backup is a seed somebody else now holds.

     JOURNEYS  Moving something takes days, during which it is nowhere and cannot sign. The
            fleet moving region takes whatever is kept at the mine with it, and a border is a
            place things can be stopped.

   An item with no recorded place is treated as being in a place of its own, so it never
   correlates with anything. That is what lets every rule and every save written before places
   existed keep behaving exactly as it did.

   Every roll here is a hash of the run's seed (hashRoll), never nextRand(), and only fires when
   something is actually kept in the place. A run that keeps nothing anywhere has the same history
   it always had.

   Loaded after losses.js; nothing here runs before the page has finished parsing. */

const PLACE_CUSTOMS_SHARE=.6;     // share of a region's political and infrastructure risk that is a chance of trouble at its border
const PLACE_STRAND_FLOOR=.35,PLACE_STRAND_SPREAD=.4;  // the same 35-75% the monthly "nobody can spend these" accident has always taken
const PLACE_THEFT_FLOOR=.5,PLACE_THEFT_SPREAD=.4;

function custodyMoves(c=state.custody){return c.moves||(c.moves=[])}
/* A place's name as it reads in the middle of a sentence: "at the mine", not "at The mine". */
function placeSay(place){
  const id=typeof place==="string"?place:place.id;
  return {site:"the mine",home:"home",bank:"the bank deposit box",trusted:"a trusted person's house",transit:"on its way"}[id]||custodyPlaceName(id).replace(/^The /,"the ");
}

/* ---- what survives ------------------------------------------------------------------ */

/* The place something is in, as a key. An unrecorded item is in a place of its own. */
function placeKey(place,uniq,s=state){return place?custodyPlaceId(place,s):"?"+uniq}
function custodyDevicesOfKey(key,s=state){return (s.custody.devices||[]).filter(d=>d.keyId===key.id)}
/* A key can sign if a working device holds it. A key with no device on record at all is taken as
   live, because nothing says it is gone. */
function custodyKeyLive(key,s=state){
  const devices=custodyDevicesOfKey(key,s);
  return devices.length===0||devices.some(d=>!d.destroyed&&d.place!=="transit");
}
/* A key with no working signer can still be rebuilt if its backup is intact and not on a journey. */
function custodyKeyRestorable(key){const b=key.backup;return !!b&&!b.destroyed&&b.place!=="transit"}
/* Distinct seeds among the assigned keys that can still produce a signature: a working device, or
   a backup to rebuild one from. `lost` asks the same question after some things have gone: it is
   called with an item's id and the place it is kept, and returns true if that item is lost. */
function custodyUsableSeeds(s=state,lost=null){
  const gone=(id,place)=>!!lost&&lost(id,place),seeds=new Set();
  for(const key of custodyAssignedKeys(s)){
    const devices=custodyDevicesOfKey(key,s);
    const live=devices.length===0||devices.some(d=>!d.destroyed&&d.place!=="transit"&&!gone("d"+d.uid,placeKey(d.place,"d"+d.uid,s)));
    const b=key.backup;
    const rebuild=!!b&&!b.destroyed&&b.place!=="transit"&&!gone("b"+key.id,placeKey(b.place,"b"+key.id,s));
    if(live||rebuild)seeds.add(key.seed||key.id);
  }
  return seeds;
}
/* The descriptor is not a secret, so it can be copied, and a copy in another place is exactly what
   makes a quorum survive the fire that takes the first. Every location is `config0`, `config1`... */
function custodyConfigLocations(c){return [c.configPlace,...(Array.isArray(c.configCopies)?c.configCopies:[])]}
function custodyConfigIntact(s=state,lost=null){
  const c=s.custody;
  return !!c.configBackedUp&&custodyConfigLocations(c).some((p,i)=>!(lost&&lost("config"+i,placeKey(p,"config"+i,s))));
}
function custodySurvives(s,lost){
  const policy=custodyPolicy(s.custody.policy);
  return custodyUsableSeeds(s,lost).size>=policy.threshold&&(policy.threshold<=1||custodyConfigIntact(s,lost));
}
/* Whether the wallet can be used or rebuilt at all right now. */
function custodyOperable(s=state){return custodySurvives(s,null)}
/* FRAGILE: the setup is working now, losing one place would end that, and losing any ONE of the
   things kept there would not. That last condition is what makes it a correlation problem rather
   than a single copy. A descriptor with no second copy is lost with any single misfortune, and
   the readiness card already says so; what places add is two things that were supposed to be
   independent sharing one fate. */
function custodyPlaceSummary(s=state){
  const c=s.custody||{},items=[];
  let placed=false;
  const note=(id,place)=>{if(place)placed=true;items.push({id,place:placeKey(place,id,s)})};
  for(const key of custodyAssignedKeys(s)){
    custodyDevicesOfKey(key,s).filter(d=>!d.destroyed).forEach(d=>note("d"+d.uid,d.place));
    if(key.backup&&!key.backup.destroyed)note("b"+key.id,key.backup.place);
  }
  if(c.configBackedUp)custodyConfigLocations(c).forEach((p,i)=>note("config"+i,p));
  if(!custodyOperable(s))return{placed,fragile:false,fragileAt:null};
  for(const place of new Set(items.map(i=>i.place))){
    if(custodySurvives(s,(id,where)=>where===place))continue;
    const members=items.filter(i=>i.place===place);
    if(members.every(m=>custodySurvives(s,id=>id===m.id)))return{placed,fragile:true,fragileAt:place};
  }
  return{placed,fragile:false,fragileAt:null};
}

/* ---- restoring a key from its backup -------------------------------------------------------- */

function custodyRestores(c=state.custody){return c.restores||(c.restores=[])}
/* Days to fetch a key's backup: the days its place takes. -1 if it is on a journey; 0 where nothing says it
   is anywhere, so every save and rule from before places behaves exactly as it did. */
function custodyRestoreDays(key){
  const b=key.backup;
  if(!b||b.destroyed||!b.place)return 0;
  if(b.place==="transit")return -1;
  return placeAccess(custodyPlaceId(b.place));
}
function advanceRestores(silent=false){
  const c=state.custody;if(!c)return;
  c.restores=custodyRestores(c).filter(job=>{
    if(pendingAt(job,state.time))return true;
    const device=custodyDevice(job.uid),key=custodyKey(job.keyId);
    if(device){delete device.restoring;if(key&&!device.destroyed&&!device.keyId){
      device.keyId=key.id;
      log(`${key.label} restored`,"The seed is on a signer again","custody");
      if(!silent)showToast("Key restored",`${key.label} is on a working signer again.`,"success","custody");
      renderFullQueued=true}}
    return false;
  });
}

/* ---- how long it takes ---------------------------------------------------------------- */

function custodyKeyAccessDays(key,s=state){
  const device=custodyDevicesOfKey(key,s).find(d=>!d.destroyed&&d.place!=="transit");
  const place=device&&device.place?custodyPlace(custodyPlaceId(device.place,s)):null;
  return place?place.access:0;
}
/* Days spent gathering signatures: the nearest keys the policy needs, the first costing only the
   journey to it and each further one costing at least a day however near it is, because it is
   still a different signer. With nothing recorded this is one day per extra signature, which is
   what it always was. */
function custodySignerDays(s=state){
  const policy=custodyPolicy(s.custody.policy);
  const days=custodyAssignedKeys(s).filter(k=>custodyKeyLive(k,s)).map(k=>custodyKeyAccessDays(k,s)+custodyHolderDelay(k,s)).sort((a,b)=>a-b);
  while(days.length<policy.threshold)days.push(0);   // a key that is missing is nowhere yet; the refusal says so
  return days.slice(0,policy.threshold).reduce((sum,a,i)=>sum+(i===0?a:Math.max(COLD_SIGNER_DAYS,a)),0);
}

/* ---- what is kept where --------------------------------------------------------------- */

function placeItems(place,s=state){
  const c=s.custody,out={devices:[],backups:[],config:0};
  (c.devices||[]).forEach(d=>{if(!d.destroyed&&d.place&&custodyPlaceId(d.place,s)===place)out.devices.push(d)});
  (c.keys||[]).forEach(k=>{if(k.backup&&!k.backup.destroyed&&k.backup.place&&custodyPlaceId(k.backup.place,s)===place)out.backups.push(k)});
  if(c.configBackedUp)custodyConfigLocations(c).forEach(p=>{if(p&&custodyPlaceId(p,s)===place)out.config++});
  return out;
}
function placeHolds(items){return items.devices.length+items.backups.length+(items.config||0)}
function placeSentence(items){
  const parts=[];
  if(items.devices.length)parts.push(`${items.devices.length} signer${items.devices.length===1?"":"s"}`);
  if(items.backups.length)parts.push(`${items.backups.length} seed backup${items.backups.length===1?"":"s"}`);
  if(items.config)parts.push(items.config===1?"a copy of the wallet configuration":`${items.config} copies of the wallet configuration`);
  return parts.join(", ")||"nothing";
}
function placeRate(placeId,kind,s=state){
  const place=custodyPlace(placeId);if(!place)return 0;
  let rate=place.rates[kind]||0;
  // A house or a garage is easier to get into than a campus with a fence and a guard.
  if(placeId==="site"&&kind==="burglary"&&typeof facilityTier==="function"){const tier=facilityTier();rate*=tier<=2?1.6:tier>=6?.4:1}
  return rate;
}

/* ---- the monthly roll ------------------------------------------------------------------ */

function strandSelfHeld(cause,next){
  // The online wallet has its own key and its own fate; what is stranded here is what the wallet policy held.
  const hot=typeof hotKey==="function"&&hotKey()?0:(state.wallets.hot||0),cold=state.wallets.cold||0,held=hot+cold;if(held<=0)return 0;
  const lost=held*(PLACE_STRAND_FLOOR+PLACE_STRAND_SPREAD*hashRoll(state.seed,"strand",cause,next));
  state.wallets.hot=Math.max(0,hot-lost*hot/held);state.wallets.cold=Math.max(0,cold-lost*cold/held);
  return lost;
}

function advancePlaceRisks(next,silent=false){
  if(!state.custody)return;
  const month=new Date(next).toISOString().slice(0,7);
  for(const place of CUSTODY_PLACES){
    const items=placeItems(place.id);if(!placeHolds(items))continue;
    if(place.fee>0&&state.cash>=place.fee){state.cash-=place.fee;log(`${place.name} fee`,`-${fmtUsd(place.fee)}`,"custody")}
    for(const kind of CUSTODY_PLACE_KINDS){
      if(hashRoll(state.seed,"place",month,place.id,kind)<placeRate(place.id,kind)){applyPlaceIncident(place.id,kind,next,silent);break}
    }
  }
}

const PLACE_KIND_WORDS={fire:["A fire","burned"],flood:["A flood","flooded"],burglary:["A break-in","was broken into"],seizure:["A seizure","was opened by the authorities"]};

/* An incident reaches the first key too, if the computer it lives on is at the mine, or the seed backup was what was taken. */
/* How long the aftermath of a fire, flood or break-in at the mine stays on the floor. A picture and nothing else: no rule reads it. */
const SITE_SCENE_DAYS=21;
function applyPlaceIncident(placeId,kind,next,silent=false){
  applyPlaceIncidentBase(placeId,kind,next,silent);
  if(placeId==="site"&&(kind==="fire"||kind==="flood"||kind==="burglary"))state.siteScene={kind,at:next,until:next+SITE_SCENE_DAYS*DAY};
  if(typeof hotKeyAfterIncident==="function")hotKeyAfterIncident(placeId,kind,next,silent);
}
function applyPlaceIncidentBase(placeId,kind,next,silent=false){
  const c=state.custody,place=custodyPlace(placeId),policy=custodyPolicy(c.policy),items=placeItems(placeId);
  const before=custodyOperable(),assigned=new Map(custodyAssignedKeys().map(k=>[k.id,k.seed||k.id]));
  const lost={devices:[],backups:[],config:0},stolen=new Set(),kept=[];
  // A seizure takes what a burglary takes, steel included: nobody asks whether the plate was fireproof.
  const takes=kind==="burglary"||kind==="seizure",taker=kind==="seizure"?"The authorities":"Burglars";
  items.devices.forEach(d=>{d.destroyed={at:next,cause:kind};lost.devices.push(d)});
  items.backups.forEach(k=>{
    // Steel comes through a fire and a flood. Nothing comes through a break-in.
    if(!takes&&k.backup.durability==="steel"){kept.push(k);return}
    k.backup={...k.backup,destroyed:true,cause:kind};lost.backups.push(k);
    if(takes){k.exposed={cause:kind,at:next};if(assigned.has(k.id))stolen.add(assigned.get(k.id))}
  });
  // The descriptor is paper in every place there is.
  if(items.config){
    const here=p=>p&&custodyPlaceId(p)===placeId,locations=custodyConfigLocations(c),left=locations.filter(p=>!here(p));
    lost.config=items.config;
    if(left.length===0){c.configBackedUp=false;delete c.configPlace;c.configCopies=[]}
    else{c.configPlace=left[0];c.configCopies=left.slice(1)}
  }
  const [what]=PLACE_KIND_WORDS[kind],gone=placeSentence({devices:lost.devices,backups:lost.backups,config:lost.config});
  const title=`${what} at ${placeSay(place)}`;
  log(title,gone==="nothing"?"Nothing was lost":`Lost: ${gone}`,"custody");
  const held=(state.wallets.hot||0)+(state.wallets.cold||0);
  // A burglar holding enough seeds to satisfy the wallet is a thief holding the coins.
  if(takes&&policy.threshold>0&&stolen.size>=policy.threshold&&held>0){
    const taken=held*(PLACE_THEFT_FLOOR+PLACE_THEFT_SPREAD*hashRoll(state.seed,"theft",placeId,next)),hot=state.wallets.hot||0;
    state.wallets.hot=Math.max(0,hot-taken*hot/held);state.wallets.cold=Math.max(0,(state.wallets.cold||0)-taken*(1-hot/held));
    reportCoinLoss({title:`${taker} took the keys, and the coins went with them`,kind:"stolen",btc:taken,cause:kind,scene:kind,odds:placeRate(placeId,kind)>0?{monthly:placeRate(placeId,kind),note:"Where the seeds are kept sets this chance: a bank box is a small fraction of a house."}:null,from:`the seed backups kept at ${placeSay(place)}`,
      what:`${what} at ${placeSay(place)}. They took ${gone}, and with ${stolen.size} of the ${policy.keys} seed${policy.keys===1?"":"s"} the wallet needs ${policy.threshold}. ${fmtBtc(taken)} left within the day.`,
      why:kind==="seizure"?"A seed backup is the coins, and a box in a bank is the one place a government can open without asking you.":"A seed backup is the coins. It sat in the same place as everything else, so one visit was enough to satisfy the wallet.",
      remedy:policy.threshold>1?"Keep the keys of a quorum in different places: one stolen seed then spends nothing.":"A single seed in a single place is a single point of failure. Keep a second copy apart, and move the signer and the backup to different places.",tab:"custody"});
    return;
  }
  const tellMeAnyway=lost.devices.length||lost.backups.length||lost.config;
  const after=custodyOperable();
  if(before&&!after){
    const taken=strandSelfHeld(`${placeId}-${kind}`,next);
    reportCoinLoss({title:"Every copy of the keys was in the same place",kind:"unrecoverable",btc:taken,cause:"places",scene:kind,always:true,odds:placeRate(placeId,kind)>0?{monthly:placeRate(placeId,kind),note:"The chance of the fire or break-in was small; what made it a loss was every copy sharing one place."}:null,from:"self-held keys",
      what:`${what} at ${placeSay(place)}. Gone: ${gone}. That left too few keys to sign and too few backups to rebuild them, so ${fmtBtc(taken)} is still on the chain at addresses nobody can spend from.`,
      why:"The backups shared a fate with the signers. A backup kept beside the thing it backs up protects against a lost device and nothing else.",
      remedy:"Keep at least one durable backup somewhere a fire at the mine cannot reach, and write down the wallet configuration of a quorum separately from its keys.",tab:"custody"});
    return;
  }
  if(!silent)showToast(tellMeAnyway?title:`${title}, and nothing was lost`,
    tellMeAnyway?`${gone[0].toUpperCase()+gone.slice(1)} ${lost.devices.length+lost.backups.length+lost.config===1?"was":"were"} destroyed${stolen.size?` or stolen. ${stolen.size===1?"That seed is":"Those seeds are"} now known to somebody else, so replace ${stolen.size===1?"that key":"those keys"}`:""}. ${after?"The wallet can still be rebuilt from what survives.":""}`
    :`${what} reached ${placeSay(place)} and the steel backups there came through it. This is what they are for.`,tellMeAnyway?"bad":"success","custody");
}

/* ---- journeys --------------------------------------------------------------------------- */

function placeAccess(place){const p=place?custodyPlace(place):null;return p?p.access:0}
function custodyMoveDays(from,to){return Math.max(1,placeAccess(from)+placeAccess(to))}
function custodyItemRef(kind,id){
  const c=state.custody;
  if(kind==="device"){const d=(c.devices||[]).find(x=>x.uid===id&&!x.destroyed);return d?{get:()=>d.place,set:v=>{d.place=v},name:custodyProduct(d.product)?.name||"Signer"}:null}
  if(kind==="backup"){const k=custodyKey(id);return k&&k.backup&&!k.backup.destroyed?{get:()=>k.backup.place,set:v=>{k.backup.place=v},name:`${k.label} seed backup`}:null}
  if(kind==="configcopy")return c.configBackedUp?{get:()=>c.configPlace,set:()=>{},name:"A copy of the wallet configuration",copy:true}:null;
  return null;
}
function moveCustodyItem(kind,id,to){
  const place=custodyPlace(to),ref=custodyItemRef(kind,id);
  if(!place||!ref)return;
  const here=ref.get();
  if(here==="transit")return showToast("Already on its way","It has to arrive before it can be moved again.");
  if(ref.copy){
    // Copying writes it out again somewhere else: the original stays where it is, and a place that has one needs no more.
    if(custodyConfigLocations(state.custody).some(p=>p&&custodyPlaceId(p)===custodyPlaceId(to)))return showToast("Already there","A copy of the configuration is already kept in that place.");
    if(custodyMoves().some(m=>m.kind==="configcopy"&&m.to===to))return;
  } else if(custodyPlaceId(here||"site")===custodyPlaceId(to))return;
  const days=custodyMoveDays(here||"site",to);
  if(!ref.copy)ref.set("transit");
  custodyMoves().push({kind,id,to,due:state.time+days*DAY,started:state.time,from:here||"site"});
  log(`${ref.copy?"Copying":"Moving"} ${ref.name}`,`${custodyPlaceName(here||"site")} → ${place.name} · ${days} day${days===1?"":"s"}`,"custody");
  showToast(ref.copy?"Copy on its way":"On its way",ref.copy?`A copy is travelling to ${placeSay(place)} and is made in ${days} day${days===1?"":"s"}.`:`${ref.name} is travelling to ${placeSay(place)} and arrives in ${days} day${days===1?"":"s"}. Until then it is nowhere, and cannot sign.`,"info","custody");
  save();render();
}
function advanceCustodyMoves(silent=false){
  const c=state.custody;if(!c)return;
  c.moves=custodyMoves(c).filter(job=>{
    if(pendingAt(job,state.time))return true;
    const ref=custodyItemRef(job.kind,job.id);
    if(ref&&ref.copy){
      const c=state.custody;(c.configCopies=Array.isArray(c.configCopies)?c.configCopies:[]).push(job.to);
      log("Configuration copied",custodyPlaceName(job.to),"custody");
      if(!silent)showToast("Copy made",`A copy of the wallet configuration is now kept at ${placeSay(job.to)}.`,"info","custody");
      renderFullQueued=true;
    } else if(ref){ref.set(job.to);
      log(`${ref.name} arrived`,custodyPlaceName(job.to),"custody");
      if(!silent)showToast("Arrived",`${ref.name} is now at ${placeSay(job.to)}.`,"info","custody");
      renderFullQueued=true}
    return false;
  });
}

/* ---- the fleet moves region -------------------------------------------------------------- */

/* Everything kept at the mine goes where the fleet goes. Said at dispatch, while there is still
   time to move something first. */
function custodyRelocationNotice(){
  const items=placeItems("site");if(!placeHolds(items))return;
  showToast("Your keys travel with the fleet",`${placeSentence(items)} kept at the mine will go with the fleet and cross the border with it. Move anything you would rather not carry to another place first.`,"warning","custody");
}
/* A border is a place things can be stopped. Signers are what get taken; a seed written on steel
   is not an object anybody asks about. */
function custodyOnRelocation(regionId,silent=false){
  const dest=REGIONS.find(r=>r.id===regionId),items=placeItems("site");
  if(!dest||!items.devices.length)return;
  const chance=Math.min(.06,(dest.netRisk||.02)*PLACE_CUSTOMS_SHARE);
  if(hashRoll(state.seed,"customs",regionId,state.time)>=chance)return;
  const before=custodyOperable();
  items.devices.forEach(d=>{d.destroyed={at:state.time,cause:"seized"}});
  log(`Signers seized entering ${dest.name}`,`${items.devices.length} device${items.devices.length===1?"":"s"} taken at the border`,"custody");
  if(before&&!custodyOperable()){
    const taken=strandSelfHeld(`customs-${regionId}`,state.time);
    reportCoinLoss({title:"Stopped at the border with the only copy",kind:"unrecoverable",btc:taken,cause:"places",scene:"seizure",always:true,from:"self-held keys",
      what:`Customs in ${dest.name} took ${items.devices.length} signer${items.devices.length===1?"":"s"}. There was no backup anywhere to rebuild from, so ${fmtBtc(taken)} can no longer be moved.`,
      why:"The signers travelled with the fleet and nothing else held the keys.",
      remedy:"Back every key up, and keep a backup in a place the fleet is not moving to.",tab:"custody"});
  } else if(!silent)showToast("Signers taken at the border",`${items.devices.length} device${items.devices.length===1?"":"s"} did not get through customs in ${dest.name}. ${custodyOperable()?"The keys can be restored from their backups onto new devices.":""}`,"bad","custody");
}

/* A BANK BOX IS IN A COUNTRY. When the country bans the business, what is in the box is within reach of the
   people who just banned it. Only the one ban the game dates to a place it has a mine in (China, Sichuan) is
   modelled, and only as a chance: a crackdown on mining is not an order to open every box. Nothing else
   about a place changes, and a box in a region that is not the one banning is untouched. */
const BAN_SEIZURE={china:{region:"sichuan",chance:.4}};
function custodyOnRegionalBan(fx,silent=false){
  const rule=BAN_SEIZURE[fx];
  if(!rule||!state.custody||state.region!==rule.region)return false;
  if(!placeHolds(placeItems("bank")))return false;
  if(hashRoll(state.seed,"seizure",fx,state.time)>=rule.chance)return false;
  applyPlaceIncident("bank","seizure",state.time,silent);
  return true;
}
