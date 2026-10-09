"use strict";

/* WHERE THINGS ARE KEPT - the places, what is in each, and what it takes to move it.

   The engine is in engine/places.js. This only draws it: every place says how far away it is, what
   it costs and how likely it is to be reached by a fire, a flood or a break-in, and each thing in
   it can be sent somewhere else. Moving is a journey, so the buttons say how long it takes. */

function placeYearlyChance(place){
  const monthly=CUSTODY_PLACE_KINDS.reduce((keep,kind)=>keep*(1-placeRate(place.id,kind)),1);
  return 1-Math.pow(monthly,12);
}
function placeChanceWords(place){
  const p=placeYearlyChance(place)*100;
  return p<.1?"under 0.1% a year":`about ${p<1?p.toFixed(1):Math.round(p)}% a year`;
}

/* One thing kept somewhere, with a button for each other place it could go. */
function placeItemRow(kind,id,label,sub,here){
  const to=CUSTODY_PLACES.filter(p=>!(p.id==="home"&&state.facility==="home")&&custodyPlaceId(p.id)!==custodyPlaceId(here||"site"));
  return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>${label}</b><small>${sub}</small>
    <div class="actions">${to.map(p=>`<button class="action small" data-action="custody-move" data-kind="${kind}" data-id="${id}" data-value="${p.id}">→ ${p.name} · ${custodyMoveDays(here||"site",p.id)}d</button>`).join("")}</div></div></div>`;
}

/* The descriptor is not a secret and can be copied, so its buttons are copies, not moves. */
function placeConfigRow(here){
  const held=custodyConfigLocations(state.custody).filter(Boolean).map(p=>custodyPlaceId(p));
  const to=CUSTODY_PLACES.filter(p=>!(p.id==="home"&&state.facility==="home")&&!held.includes(custodyPlaceId(p.id)));
  return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>Wallet configuration</b><small>${here?"paper descriptor, needed to rebuild a quorum":"no place recorded"}. A copy elsewhere is what survives the fire that takes this one.</small>
    <div class="actions">${to.map(p=>`<button class="action small" data-action="custody-move" data-kind="configcopy" data-id="config" data-value="${p.id}">Copy → ${p.name} · ${custodyMoveDays(here||"site",p.id)}d</button>`).join("")}</div></div></div>`;
}
function placeContents(placeId){
  const c=state.custody,rows=[];
  (c.devices||[]).filter(d=>!d.destroyed&&d.place&&custodyPlaceId(d.place)===placeId).forEach(d=>{
    const key=d.keyId?custodyKey(d.keyId):null,p=custodyProduct(d.product);
    rows.push(placeItemRow("device",d.uid,`${p?p.name:"Signer"}`,key?`holds ${key.label}`:"no key on it",d.place));
  });
  (c.keys||[]).filter(k=>k.backup&&!k.backup.destroyed&&k.backup.place&&custodyPlaceId(k.backup.place)===placeId).forEach(k=>{
    rows.push(placeItemRow("backup",k.id,`${k.label} seed backup`,k.backup.durability==="steel"?"steel: survives fire and flood":"paper: destroyed by fire and flood",k.backup.place));
  });
  if(c.configBackedUp)custodyConfigLocations(c).forEach(p=>{if(p&&custodyPlaceId(p)===placeId)rows.push(placeConfigRow(p))});
  return rows.join("");
}
function placeUnrecorded(){
  const c=state.custody,rows=[];
  (c.devices||[]).filter(d=>!d.destroyed&&!d.place).forEach(d=>rows.push(placeItemRow("device",d.uid,custodyProduct(d.product)?.name||"Signer","no place recorded",undefined)));
  (c.keys||[]).filter(k=>k.backup&&!k.backup.destroyed&&!k.backup.place).forEach(k=>rows.push(placeItemRow("backup",k.id,`${k.label} seed backup`,"no place recorded",undefined)));
  if(c.configBackedUp&&!c.configPlace)rows.push(placeConfigRow(undefined));
  return rows.join("");
}
/* Keys whose signer is gone but whose backup survives: the way back is a new device. */
function placeRestoreRows(){
  const c=state.custody,spare=(c.devices||[]).filter(d=>!d.destroyed&&!d.keyId&&!d.restoring);
  return custodyAssignedKeys().filter(k=>!custodyKeyLive(k)&&custodyKeyRestorable(k)).map(k=>
    `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>${k.label} has no working signer</b><small>Its backup survives. Restore it onto a device with no key on it.</small>
      <div class="actions">${spare.length?spare.map(d=>`<button class="action small primary" data-action="custody-restore-key" data-id="${d.uid}" data-value="${k.id}">Restore onto ${custodyProduct(d.product)?.name||"a new device"}${custodyRestoreDays(k)>0?` · ${custodyRestoreDays(k)}d`:""}</button>`).join(""):`<span class="modal-note">Buy or build a signer first.</span>`}</div></div></div>`).join("");
}
function placeJourneyRows(){
  const restoring=custodyRestores().map(r=>{const k=custodyKey(r.keyId);
    return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>Restoring ${k?k.label:"a key"} from its backup</b><small>${Math.max(0,Math.ceil((r.due-state.time)/DAY))}d remaining · the backup is being fetched from ${k&&k.backup?placeSay(k.backup.place):"where it is kept"}</small></div></div>`}).join("");
  return restoring+custodyMoves().map(m=>{const ref=custodyItemRef(m.kind,m.id);
    return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>${ref?ref.name:"Item"} → ${custodyPlaceName(m.to)}</b><small>${Math.max(0,Math.ceil((m.due-state.time)/DAY))}d remaining · nowhere until it arrives, and cannot sign</small></div></div>`}).join("");
}

function custodyPlacesCard(){
  const set=custodySetup(),monthlyFees=CUSTODY_PLACES.filter(p=>p.fee>0&&placeHolds(placeItems(p.id))).reduce((sum,p)=>sum+p.fee,0);
  const headline=set.fragile
    ?`<div class="risk high">Losing ${custodyPlaceName(set.fragileAt)} would leave the wallet unrecoverable. The things that were meant to be independent are sharing one fate.</div>`
    :set.placed?`<div class="risk low">No single place holds everything the wallet needs.</div>`
    :`<p class="modal-note">Nothing here has a recorded place. Anything you buy or write down starts at the mine, so move the backups somewhere a fire at the mine cannot reach.</p>`;
  const places=CUSTODY_PLACES.filter(p=>!(p.id==="home"&&state.facility==="home")).map(p=>{
    const name=p.id==="site"&&state.facility==="home"?"Home (your mine)":p.name,items=placeContents(p.id);
    return `<article class="venue"><div class="risk ${placeYearlyChance(p)>.04?"high":placeYearlyChance(p)>.01?"medium":"low"}">${placeChanceWords(p).toUpperCase()}</div><h3>${name}</h3>
      <p>${p.blurb}</p><p class="modal-note">${p.access===0?"No journey to reach it.":`${p.access} day${p.access===1?"":"s"} to fetch from.`}${p.fee?` ${fmtUsd(p.fee)} a month while anything is kept here.`:""}</p>
      ${items||`<p class="modal-note">Nothing kept here.</p>`}</article>`;
  }).join("");
  const loose=placeUnrecorded(),journeys=placeJourneyRows(),restore=placeRestoreRows();
  return `<section class="card span-12 custody-places"><div class="card-head"><h2>Where things are kept</h2><div class="meta">${monthlyFees?`${fmtUsd(monthlyFees)} A MONTH IN FEES`:"FIRE, FLOOD AND BREAK-IN"}</div></div>
  <div class="card-pad">${headline}
    <p class="modal-note">A backup is only a backup if it does not share a fate with what it backs up. Steel comes through a fire and a flood; nothing comes through a break-in. Moving something takes days, and while it travels it cannot sign. When the fleet moves region, whatever is kept at the mine goes with it.</p>
    ${restore}${journeys}${loose?`<h4>Not yet placed</h4>${loose}`:""}
    <div class="venue-grid">${places}</div></div></section>`;
}
