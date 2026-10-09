"use strict";

function minerStatus(id){
  const h=HARDWARE.find(x=>x.id===id),count=state.hardware?.[id]||0;if(!h||count<1)return{kind:"idle",label:"Not installed"};
  const reason=hardwareOfflineReason(h),hardwareFault=maintenanceCondition(h)<65||hardwareFaultCount(h)>0||!!activeServiceJob(id);
  if(hardwareFault)return{kind:"hardware",label:reason||"Hardware fault"};
  if(reason)return{kind:"config",label:reason};
  if(hardwarePoweredDownCount(h)>=count)return{kind:"power",label:"Manually powered down"};
  if(!state.power||gridCutOff()||state.policyLock||siteOutage()||!fleet().within)return{kind:"power",label:gridCutOff()?"Grid disconnected":state.policyLock||siteOutage()?"Site unavailable":"No electrical power"};
  return{kind:"online",label:"Online and hashing"};
}
function minerStatusSvg(id){const status=minerStatus(id);if(status.kind==="online")return `<circle class="miner-online" cx="56" cy="8" r="2"><title>${status.label}</title></circle>`;if(status.kind==="power")return `<g><title>${status.label}</title><path class="miner-power-warning" d="M56 1 63 14H49z"/><path d="m57 4-4 5h3l-2 4 6-6h-3l2-3z" fill="#17130b"/></g>`;if(status.kind==="hardware")return `<g><title>${status.label}</title><path class="miner-hardware-fire" d="M56 15c-5 0-8-3-7-7 1-3 4-4 5-7 3 2 4 4 3 6 2-1 3-2 3-4 4 4 5 7 3 10-1 2-4 2-7 2z"/><path d="M56 13c-2 0-3-1-2-3 0-1 1-2 2-3 2 2 3 4 0 6z" fill="#ffd36c"/></g>`;if(status.kind==="config")return `<g><title>${status.label}</title><path class="miner-config-warning" d="M56 1 63 14H49z"/><path d="M56 5v5m0 2v1" stroke="#17130b" stroke-width="1.5"/></g>`;return `<circle class="ops-pulse" cx="56" cy="8" r="2"><title>${status.label}</title></circle>`}
const ASIC_MINER_ART={
  s1:`<rect x="10" y="11" width="44" height="26" rx="3" fill="url(#mgm)" stroke="#93a5a0"/><path d="M12 12h40v4H12z" fill="#4c6265" opacity=".4"/><circle cx="32" cy="25" r="9" fill="url(#mgw)" stroke="#8fd1a3"/><path d="M14 40h36" stroke="#8fd1a3"/>`,
  s3:`<rect x="6" y="10" width="52" height="27" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><path d="M8 11h48v4H8z" fill="#4c6265" opacity=".4"/><circle cx="20" cy="24" r="7" fill="url(#mgw)" stroke="#8fd1a3"/><circle cx="44" cy="24" r="7" fill="url(#mgw)" stroke="#8fd1a3"/><path d="M6 40h52" stroke="url(#mga)"/>`,
  s5:`<rect x="5" y="9" width="54" height="29" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><path d="M7 10h50v4H7z" fill="#4c6265" opacity=".4"/><circle cx="20" cy="25" r="8.5" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/><circle cx="44" cy="25" r="8.5" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/><path d="M6 41h52" stroke="#5c706c"/>`,
  s7:`<rect x="3" y="9" width="58" height="28" rx="4" fill="url(#mgm)" stroke="#93a5a0"/><path d="M5 10h54v4H5z" fill="#4c6265" opacity=".4"/><rect x="18" y="14" width="10" height="18" fill="url(#mgw)"/><rect x="30" y="14" width="10" height="18" fill="url(#mgw)"/><circle cx="50" cy="23" r="9" fill="url(#mgw)" stroke="#8fd1a3" stroke-width="1.5"/><path d="M4 40h56" stroke="#5c706c"/>`,
  s9:`<rect x="2" y="8" width="60" height="30" rx="5" fill="url(#mgm)" stroke="#93a5a0"/><path d="M4 9h56v4H4z" fill="#4c6265" opacity=".4"/><rect x="20" y="13" width="24" height="20" fill="url(#mgw)"/><path d="M24 15v16M29 15v16M34 15v16M39 15v16" stroke="#8fd1a3" stroke-width="1" opacity=".6"/><circle cx="10" cy="23" r="7" fill="url(#mgw)" stroke="#8fd1a3"/><circle cx="54" cy="23" r="7" fill="url(#mgw)" stroke="#8fd1a3"/>`,
  s17:`<rect x="2" y="7" width="60" height="32" rx="5" fill="url(#mgm)" stroke="#93a5a0"/><path d="M4 8h56v4H4z" fill="#4c6265" opacity=".4"/><rect x="8" y="13" width="20" height="22" fill="url(#mgw)"/><path d="M11 16v16M15 16v16M19 16v16M23 16v16" stroke="url(#mga)" stroke-width="1" opacity=".7"/><circle cx="46" cy="24" r="11" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.6"/><circle cx="46" cy="24" r="4" fill="#0e1718" stroke="#5c706c"/>`,
  s19:`<rect x="2" y="7" width="60" height="32" rx="6" fill="url(#mgm)" stroke="#93a5a0"/><path d="M4 8h56v4H4z" fill="#4c6265" opacity=".4"/><rect x="19" y="12" width="26" height="22" fill="url(#mgw)"/><path d="M23 14v18M28 14v18M33 14v18M38 14v18M43 14v18" stroke="url(#mga)" stroke-width="1" opacity=".65"/><circle cx="10" cy="23" r="7.5" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/><circle cx="54" cy="23" r="7.5" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/>`,
  s19xp:`<rect x="2" y="7" width="60" height="32" rx="6" fill="url(#mgm)" stroke="#93a5a0"/><path d="M4 8h56v4H4z" fill="#4c6265" opacity=".4"/><rect x="19" y="12" width="26" height="22" fill="url(#mgw)"/><path d="M23 14v18M28 14v18M33 14v18M38 14v18M43 14v18" stroke="#8fd1a3" stroke-width="1" opacity=".7"/><circle cx="10" cy="23" r="7.5" fill="url(#mgw)" stroke="#8fd1a3" stroke-width="1.5"/><circle cx="54" cy="23" r="7.5" fill="url(#mgw)" stroke="#8fd1a3" stroke-width="1.5"/><circle class="ops-pulse" cx="58" cy="10" r="1.6"/>`,
  s21:`<rect x="1" y="6" width="62" height="34" rx="3" fill="url(#mgm)" stroke="#93a5a0"/><path d="M3 7h58v4H3z" fill="#4c6265" opacity=".4"/><rect x="18" y="11" width="28" height="11" fill="url(#mgw)"/><rect x="18" y="24" width="28" height="11" fill="url(#mgw)"/><path d="M21 13v7M26 13v7M31 13v7M36 13v7M41 13v7M21 26v7M26 26v7M31 26v7M36 26v7M41 26v7" stroke="url(#mga)" stroke-width="1" opacity=".75"/><circle cx="9" cy="23" r="8" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.6"/><circle cx="55" cy="23" r="8" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.6"/>`,
  s21xp:`<rect x="1" y="6" width="62" height="34" rx="3" fill="url(#mgm)" stroke="#93a5a0"/><path d="M3 7h58v4H3z" fill="#4c6265" opacity=".4"/><rect x="18" y="11" width="28" height="11" fill="url(#mgw)"/><rect x="18" y="24" width="28" height="11" fill="url(#mgw)"/><path d="M21 13v7M26 13v7M31 13v7M36 13v7M41 13v7M21 26v7M26 26v7M31 26v7M36 26v7M41 26v7" stroke="#8fd1a3" stroke-width="1" opacity=".8"/><circle cx="9" cy="23" r="8" fill="url(#mgw)" stroke="#8fd1a3" stroke-width="1.6"/><circle cx="55" cy="23" r="8" fill="url(#mgw)" stroke="#8fd1a3" stroke-width="1.6"/><circle class="ops-pulse" cx="59" cy="9" r="1.8"/>`
};
/* The drawing alone, without the <svg> wrapper or the status overlay, so the mining floor
   can emit it once as a <symbol> and point every sprite at it with <use>. */
function minerArt(id){
  return id==="laptop"?`<path d="M13 11h38v23H13z" fill="url(#mgm)" stroke="#93a5a0"/><path d="M14 12h36v3H14z" fill="#4c6265" opacity=".55"/><path d="M8 35h48l4 5H4z" fill="#2a3a3c" stroke="#0e1718"/><rect x="18" y="15" width="28" height="15" fill="url(#mgw)" stroke="#000"/><path d="M24 39h16" stroke="url(#mgg)" stroke-width="1.6"/>`:id==="cpu"?`<rect x="4" y="9" width="32" height="23" rx="1" fill="url(#mgm)" stroke="#93a5a0"/><rect x="8" y="13" width="24" height="15" fill="url(#mgw)"/><path d="M20 32v5m-8 2h16" stroke="#647d78" stroke-width="2"/><rect x="42" y="5" width="17" height="36" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><path d="M43 6h15v3H43z" fill="#4c6265" opacity=".5"/><path d="M46 12h9M46 17h9M46 22h9" stroke="#5c706c"/><circle cx="51" cy="34" r="2" fill="url(#mgg)"/>`:id==="gpurig"?`<path d="M3 8h56M3 39h56M4 8v31M58 8v31" stroke="#93a5a0" stroke-width="2"/><g fill="url(#mgm)" stroke="#647d78"><rect x="7" y="11" width="5" height="25"/><rect x="13" y="11" width="5" height="25"/><rect x="19" y="11" width="5" height="25"/><rect x="25" y="11" width="5" height="25"/><rect x="31" y="11" width="5" height="25"/><rect x="37" y="11" width="5" height="25"/></g><g fill="url(#mgg)"><circle cx="9.5" cy="18" r="1.8"/><circle cx="15.5" cy="18" r="1.8"/><circle cx="21.5" cy="18" r="1.8"/><circle cx="27.5" cy="18" r="1.8"/><circle cx="33.5" cy="18" r="1.8"/><circle cx="39.5" cy="18" r="1.8"/></g><path d="M9 31h32" stroke="url(#mga)" stroke-width="1.5"/><rect x="45" y="22" width="13" height="15" fill="url(#mgw)" stroke="#93a5a0"/><path d="M47 26h9M47 30h9M47 34h9" stroke="#5c706c"/>`:id==="5870"?`<rect x="7" y="12" width="49" height="25" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><path d="M8 13h47v3H8z" fill="#4c6265" opacity=".45"/><circle cx="22" cy="24" r="8" fill="url(#mgw)" stroke="#8fd1a3"/><circle cx="22" cy="24" r="3" fill="#0e1718" stroke="#4c6265"/><circle cx="42" cy="24" r="8" fill="url(#mgw)" stroke="#8fd1a3"/><circle cx="42" cy="24" r="3" fill="#0e1718" stroke="#4c6265"/><path d="M57 18v13M10 39h40" stroke="url(#mga)" stroke-width="2"/>`:id==="fpga"?`<path d="M11 9h42v30H11z" fill="url(#mgm)" stroke="#93a5a0"/><rect x="17" y="15" width="12" height="12" fill="url(#mga)" stroke="#a1650f"/><rect x="35" y="15" width="12" height="12" fill="url(#mga)" stroke="#a1650f"/><path d="M15 33h34M9 15h4M9 22h4M9 29h4" stroke="#8fd1a3"/>`:id==="avalon"?`<rect x="6" y="10" width="52" height="28" rx="3" fill="url(#mgm)" stroke="#93a5a0"/><path d="M8 11h48v4H8z" fill="#4c6265" opacity=".4"/><circle cx="18" cy="24" r="9" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/><circle cx="36" cy="24" r="9" fill="url(#mgw)" stroke="url(#mga)" stroke-width="1.5"/><path d="M51 16v16M54 16v16" stroke="#8fd1a3"/>`:id==="s19hydro"?`<rect x="7" y="11" width="50" height="25" rx="5" fill="url(#mgh)" stroke="#71c9d7" stroke-width="2"/><path d="M9 13h46v4H9z" fill="#8fe4ee" opacity=".3"/><path d="M13 17h26M13 23h26M13 29h26" stroke="#9be5eb"/><circle cx="47" cy="19" r="5" fill="none" stroke="#3fa9b9" stroke-width="2"/><circle cx="47" cy="29" r="5" fill="none" stroke="#3fa9b9" stroke-width="2"/><path d="M9 40h46" stroke="#3fa9b9" stroke-width="3"/>`:id==="s21hydro"?`<path d="M5 13h54v23H5z" fill="url(#mgh)" stroke="#71c9d7" stroke-width="2"/><path d="M7 15h50v4H7z" fill="#8fe4ee" opacity=".3"/><path d="M11 19h28M11 25h28M11 31h28" stroke="#5dd2df"/><path d="M44 16c11 2 11 15 0 17M48 16c11 2 11 15 0 17" fill="none" stroke="#71c9d7" stroke-width="2"/><path d="M8 39c9 5 16-5 25 0s16-5 25 0" fill="none" stroke="#3fa9b9" stroke-width="2"/>`:ASIC_MINER_ART[id]?ASIC_MINER_ART[id]:`<path d="M5 11h54v27H5z" fill="url(#mgm)" stroke="#93a5a0"/><path d="M6 12h52v4H6z" fill="#4c6265" opacity=".4"/><circle cx="18" cy="24.5" r="10" fill="url(#mgw)" stroke="#8fd1a3"/><path d="M18 15v19M9 24.5h18M11 18l14 13M25 18 11 31" stroke="#8fd1a3" stroke-width="1"/><rect x="35" y="17" width="16" height="4" fill="url(#mga)"/><rect x="35" y="25" width="16" height="4" fill="#5c706c"/><path d="M6 40h52" stroke="url(#mga)"/>`;
}
function minerSvg(id){
  return `<svg class="miner-icon" viewBox="0 0 64 46" aria-label="${id} mining hardware illustration">${minerArt(id)}${minerStatusSvg(id)}</svg>`
}
function technicianSprite(index,target){
  const x=34+index*46,working=!!target;return `<div class="technician-sprite ${working?"working":"patrolling"}" style="left:${x}px" title="Field technician ${working?`repairing ${target}`:"inspecting the fleet"}">${working?`<span class="tech-target">${target}</span>`:""}<svg viewBox="0 0 38 58" aria-hidden="true"><defs><linearGradient id="tsg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2b877"/><stop offset="1" stop-color="#a97a3f"/></linearGradient></defs><circle cx="19" cy="10" r="7" fill="url(#tsg)"/><path d="M11 19h16l4 22H7z" fill="url(#tsg)"/><path d="M12 39 8 56M26 39l4 17M8 24 1 38M30 24l7 12" stroke="url(#tsg)"/><path class="tech-wrench" d="m30 30 8-10m-4-3 6 6" stroke="#cfd9d5"/></svg></div>`
}
function miningFloorCooling(){
  const installed=COOLING_EQUIPMENT.filter(item=>(state.thermal.equipment[item.id]||0)>0),pending=state.thermal.orders||[];
  if(!installed.length&&!pending.length)return"";
  const running=thermalPowerAvailable();
  const live=installed.map(item=>{
    const qty=state.thermal.equipment[item.id],shown=Math.min(qty,6);
    return Array.from({length:shown},(_,i)=>{
      const represented=i===shown-1?qty-(shown-1):1;
      return `<div class="floor-cooling ${running?"running":"idle"}" title="${item.name} · ${running?"rejecting heat":"no site power"} · ${fmtNum(item.coolingKw)} kW each">${coolingItemSvg(item.id)}${represented>1?`<b>×${fmtCompactNumber(represented)}</b>`:""}</div>`;
    }).join("");
  }).join("");
  const booked=pending.map(order=>{
    const item=COOLING_EQUIPMENT.find(x=>x.id===order.id);if(!item)return"";
    const days=Math.max(0,Math.ceil((order.due-state.time)/DAY));
    return `<div class="floor-cooling pending" title="${item.name} · installers due ${dateFmt(order.due)} · rejects no heat until then">${coolingItemSvg(item.id)}<b>${days}d</b></div>`;
  }).join("");
  return `<div class="floor-cooling-row">${live}${booked}</div>`;
}
/* The floor draws one sprite per represented batch - up to 182 of them - and every sprite
   used to carry a full copy of its machine's drawing. At the largest sites that was 146KB of
   the floor's 162KB, the same handful of pictures repeated. A <symbol> per owned type, and a
   <use> per sprite, says the same thing once. The gradients they paint with already live in
   the app-root defs block, and url(#id) resolves document-wide, so they still apply.

   The symbols ride inside the floor markup rather than the app shell so they are replaced
   with it: renderMineContent() swaps .content alone, and a <use> must never outlive the
   <symbol> it points at. */
function floorSpriteSymbols(owned){
  if(!owned.length)return"";
  return `<svg class="floor-sprite-symbols" aria-hidden="true" focusable="false" width="0" height="0">${owned.map(h=>`<symbol id="ma-${h.id}" viewBox="0 0 64 46">${minerArt(h.id)}</symbol>`).join("")}</svg>`;
}
function floorSprite(id){
  return `<svg class="miner-icon" viewBox="0 0 64 46" aria-label="${id} mining hardware illustration"><use href="#ma-${id}"/>${minerStatusSvg(id)}</svg>`;
}
/* THE FLOOR AS DATA. Which machines stand on the floor, how many real units each one
   represents, and what state it is in - derived from the fleet once, with no markup in
   sight. The SVG floor renders this array; anything else that wants to draw the same floor
   renders the same array rather than working the rules out a second time and drifting from
   them. The rules are not obvious ones: how many sprites a type gets depends on its share of
   the fleet and the site's tier, and a batch is faulted, paused or hashing according to how
   far into the type's repair queue it falls. Deriving that twice would guarantee two floors
   that disagree. */
function floorBatches(){
  const owned=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0),total=owned.reduce((sum,h)=>sum+(state.hardware[h.id]||0),0),tier=facilityTier(),limit=[12,28,72,110,130,150,170,190][tier-1]||110,siteOff=!thermalPowerAvailable();
  /* Why a machine is not earning, told apart rather than lumped together. A fleet that is
     manually off, one the grid has cut and one that cannot reach the network are three
     different problems with three different fixes, and a floor that draws them the same way
     is hiding the only thing worth knowing. */
  const gridDown=gridCutOff()||!!state.policyLock,netDown=typeof connectivityOutage==="function"&&connectivityOutage();
  const siteReason=gridDown?"grid":siteOff?"sitepower":null;
  const out=[];
  for(const h of owned){
    const n=state.hardware[h.id],shown=Math.max(1,Math.min(n,Math.round(limit*n/Math.max(1,total)))),per=Math.max(1,Math.ceil(n/shown)),rs=hardwareRepairState(h),job=activeServiceJob(h.id),dominantPart=job?.part||Object.entries(rs.faultsByPart).sort((a,b)=>b[1]-a[1])[0]?.[0];
    /* A type goes offline entirely below 65% condition, so the band just above it is the
       last chance to act before the whole line stops earning. */
    const condition=maintenanceCondition(h),ailing=condition<75&&condition>=65;
    for(let i=0;i<shown;i++){
      const first=i*per,qty=Math.min(per,n-first);if(qty<=0)continue;
      const status=first<rs.repairing?(rs.servicing?"repair":"broken"):first<rs.repairing+rs.paused||siteOff?"paused":hardwareOfflineReason(h)?"broken":"online",label=status==="online"?"hashing":status==="paused"?(siteOff?"site power off":"manually off"):status==="repair"?`technician repair${job?.part?` · ${sparePart(job.part)?.name||job.part}`:""}${Number.isFinite(job?.stage)&&job.stage<REPAIR_STAGES.length?` · ${REPAIR_STAGES[job.stage].name}`:""}`:`faulted${dominantPart?` · ${PART_FAULT_LABELS[dominantPart]||dominantPart}`:""}`;
      out.push({hardware:h,id:h.id,index:i,qty,status,label,job,part:dominantPart,condition,ailing,
        reason:status==="paused"?(siteReason||"manual"):netDown&&status==="online"?"network":null,
        clickable:status==="broken"||status==="repair"});
    }
  }
  return out;
}
function floorOwnedHardware(){return HARDWARE.filter(h=>(state.hardware[h.id]||0)>0)}
function miningFloorUnits(){
  return floorSpriteSymbols(floorOwnedHardware())+floorBatches().map(b=>{
    const h=b.hardware,job=b.job;
    const badge=b.status==="repair"&&job?.part?`<i class="part-badge" data-part="${job.part}">${(sparePart(job.part)?.name||job.part).slice(0,1)}</i>`:"";
    return `<div class="floor-miner ${b.status} ${h.id==="laptop"?"laptop-desk":""}" ${b.clickable?`data-action="focus-service" data-id="${h.id}"`:""} title="${h.name} · ${b.qty>1?`${b.qty} units represented · `:""}${b.label}">${floorSprite(h.id)}${badge}${b.qty>1?`<b>×${fmtCompactNumber(b.qty)}</b>`:""}</div>`;
  }).join("");
}
function selfServiceRelevant(){
  const technicians=fieldTechnicianCount();
  if(!technicians)return true;
  const jobs=state.maintenance.serviceJobs||[];
  const committed=jobs.reduce((sum,job)=>sum+(job.contracted?0:Number(job.crew||0)),0);
  return committed>=technicians;
}
function selfServiceBench(owned){
  const rows=owned.map(h=>{
    const exp=selfRepairExperience(h.id),risk=selfDamageChance(h)*100,auto=selfAutoCompleteChance(h)*100;
    return `<div class="bench-row"><span>${h.name}</span><b>${exp} repair${exp===1?"":"s"} done</b><i class="${risk>25?"bad":risk>12?"warn":"good"}">${risk.toFixed(0)}% damage risk</i><i class="${auto>0?"good":"dim"}">${auto>0?`${auto.toFixed(0)}% auto-finish`:"no auto-finish"}</i></div>`;
  }).join("")||`<div class="bench-row"><span>Nothing installed to practise on yet</span></div>`;
  const missing=[["benchskills","Bench repair skills","cuts the chance of damaging a machine"],["partssourcing","Parts sourcing","20% off every spare part"],["supplychain","Supply-chain contacts","parts arrive 40% sooner"],["practisedhands","Practised hands","familiar repairs finish with no puzzle"]].filter(entry=>!hasSkill(entry[0]));
  return `<div class="self-service-bench"><div class="bench-head"><div><b>Your own bench</b><span>${fieldTechnicianCount()?"Every technician is committed to another job, so the next repair is yours to run by hand. ":""}Labour is free while you do the work yourself. Every unit type you finish makes you better at it - fewer fumbles, and eventually repairs that complete on their own.</span></div><button class="action small" data-action="tab" data-value="tech">Open Tech tree</button></div><div class="bench-list">${rows}</div>${missing.length?`<p class="modal-note">Still to unlock with skill points: ${missing.map(entry=>`<strong>${entry[1]}</strong> (${entry[2]})`).join(" · ")}.</p>`:`<p class="modal-note">Every hardware self-help skill is unlocked.</p>`}</div>`;
}
function partsStatusStrip(){
  const {short,inbound}=partsOutlook();
  if(!short.length&&!inbound.length)return"";
  const shortRows=short.map(s=>{
    const cost=sparePartCost(s.id)*s.missing;
    return `<li><div class="parts-status-text"><b>${s.missing}× ${s.name}</b><span>${s.have} in stock, ${s.need} needed${s.onOrder?` · ${s.onOrder} on order, ${s.covered?"which covers it":"still short"}, due ${dateFmt(s.due)}`:" · nothing on order"}</span></div><button class="action small ${s.covered?"":"primary"}" data-action="order-parts" data-id="${s.id}" data-value="${s.missing}" ${state.cash<cost?"disabled":""} title="${state.cash<cost?"Not enough cash":`${fmtUsd(cost)} · ${partsLeadDays()}-day lead`}">Order ${s.missing}</button></li>`;
  }).join("");
  const inboundRows=inbound.map(o=>{
    const days=Math.max(0,Math.ceil((o.due-state.time)/DAY));
    return `<li><div class="parts-status-text"><b>${o.qty}× ${o.name}</b><span>arriving ${dateFmt(o.due)} · ${days} day${days===1?"":"s"} away</span></div></li>`;
  }).join("");
  return `<div class="parts-status">${short.length?`<div class="parts-status-block short"><h4>Short of ${short.length} part${short.length===1?"":"s"} the current faults need</h4><ul>${shortRows}</ul></div>`:""}${inbound.length?`<div class="parts-status-block inbound"><h4>${inbound.length} part${inbound.length===1?"":"s"} on the way</h4><ul>${inboundRows}</ul></div>`:""}</div>`;
}
/* Cooling plant and immersion are bought and installed like infrastructure, on a different
   timescale from a fault that needs a part today. Keeping them inside Fleet servicing made
   that page ten screens long; on their own they are a page you visit when you are deciding
   how the site sheds heat. */
/* FIRMWARE, WHERE THE FLEET IS.

   Patching lives on the Operations risk desk, and Mine never mentioned it - so a player
   watching their hash rate fall because a third of it has been diverted has nothing on the
   screen they are looking at to tell them why, or what to do. It is fleet maintenance, so
   the action itself belongs beside the other fleet maintenance rather than a signpost to
   another tab. The Operations desk keeps its copy; this is the same action. */
function firmwareStatusHtml(){
  const machines=asicCount();
  if(!machines||state.time<at("2017-04-26"))return"";
  const due=firmwarePatchDue(),hijacked=firmwareHijacked(),cost=Math.max(75,machines*18);
  const until=state.ops?.firmwarePatchedUntil||0;
  const tone=hijacked?"bad":due?"warn":"good";
  const headline=hijacked?"Fleet hijacked - 35% of hash diverted"
    :due?"Signed firmware is out of date"
    :`Firmware current until ${dateFmt(until)}`;
  const detail=hijacked?`Unpatched firmware is pointing part of your hash at someone else's payout address. Patching ${fmtCompactNumber(machines)} machine${machines===1?"":"s"} ends it immediately.`
    :due?`${fmtCompactNumber(machines)} ASIC${machines===1?"":"s"} are running unsigned firmware. Each month unpatched carries roughly a 7% chance of losing 35% of your hash to a hijack.`
    :`${fmtCompactNumber(machines)} ASIC${machines===1?"":"s"} covered. Cover lasts 18 simulated months from the last rollout.`;
  return `<div class="firmware-status ${tone}"><div><b>${headline}</b><span>${detail}</span></div><button class="action small ${due||hijacked?"primary":""}" data-action="patch-firmware" ${state.cash<cost?"disabled":""} title="${state.cash<cost?`Needs ${fmtUsd(cost)}`:`Signed rollout across ${fmtCompactNumber(machines)} machines`}">${due||hijacked?"Patch":"Re-patch"} · ${fmtUsd(cost)}</button></div>`;
}
function coolingPlantVisual(){
  return `<section class="card span-12 cooling-plant-card"><div class="card-head"><h2>Cooling plant</h2><div class="meta">${fmtNum(coolingCapacityKw())} KW REJECTION · ${roomTemperatureC().toFixed(1)} °C ROOM</div></div><div class="card-pad"><div class="cooling-shop"><div class="cooling-shop-head"><div><span class="hero-kicker">Fiat infrastructure</span><h3>Balance cooling against hash rate.</h3></div><p>Stopping a miner removes its heat, energy draw and wear immediately. Room-level cooling equipment lets more machines run safely, but consumes electrical headroom and cash.</p></div><div class="cooling-options">${coolingEquipmentHtml()}</div></div>${immersionPanelHtml()}</div></section>`;
}
const COOLING_ITEM_ART={
  boxfan:`<rect x="14" y="4" width="36" height="36" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><circle cx="32" cy="22" r="14" fill="url(#mgw)" stroke="#5c706c"/><g fill="url(#mgg)"><path d="M32 22 32 10a12 12 0 0 1 10 6z"/><path d="M32 22 42 16a12 12 0 0 1 0 12z"/><path d="M32 22 42 28a12 12 0 0 1-10 6z"/><path d="M32 22 22 28a12 12 0 0 1 0-12z"/></g><path d="M24 40h16v4H24z" fill="#5c706c"/>`,
  exhaust:`<path d="M8 30 20 10h24l12 20z" fill="url(#mgm)" stroke="#93a5a0"/><path d="M14 30h36v8H14z" fill="url(#mgw)"/><path d="M18 33h28M18 37h28" stroke="#8fd1a3" stroke-width="1.5"/><rect x="28" y="2" width="8" height="10" fill="url(#mgw)" stroke="#5c706c"/>`,
  axial:`<rect x="4" y="3" width="56" height="40" rx="3" fill="url(#mgm)" stroke="#93a5a0"/><circle cx="32" cy="23" r="18" fill="url(#mgw)" stroke="#5c706c" stroke-width="1.5"/><g fill="url(#mga)" opacity=".9"><path d="M32 23 32 7a16 16 0 0 1 14 8z"/><path d="M32 23 46 15a16 16 0 0 1 0 16z"/><path d="M32 23 46 31a16 16 0 0 1-14 8z"/><path d="M32 23 18 31a16 16 0 0 1 0-16z"/></g><circle cx="32" cy="23" r="6" fill="url(#mgw)" stroke="#5c706c"/><circle cx="8" cy="7" r="1.6" fill="#0a0f10"/><circle cx="56" cy="7" r="1.6" fill="#0a0f10"/><circle cx="8" cy="39" r="1.6" fill="#0a0f10"/><circle cx="56" cy="39" r="1.6" fill="#0a0f10"/>`,
  ahu:`<rect x="4" y="6" width="56" height="34" rx="2" fill="url(#mgm)" stroke="#93a5a0"/><rect x="9" y="11" width="22" height="24" fill="url(#mgw)"/><path d="M12 15v16M16 15v16M20 15v16M24 15v16M28 15v16" stroke="#8fd1a3" stroke-width="1.2" opacity=".7"/><circle cx="46" cy="23" r="11" fill="url(#mgw)" stroke="#5c706c"/><g fill="url(#mga)"><path d="M46 23 46 13a10 10 0 0 1 8 5z"/><path d="M46 23 54 18a10 10 0 0 1 0 10z"/><path d="M46 23 54 28a10 10 0 0 1-8 5z"/></g>`,
  evap:`<rect x="6" y="14" width="52" height="26" fill="url(#mgm)" stroke="#93a5a0"/><path d="M11 16v24M17 16v24M23 16v24M29 16v24M35 16v24M41 16v24M47 16v24M53 16v24" stroke="#5dd2df" stroke-width="1.4" opacity=".55"/><path d="M14 6h36l4 8H10z" fill="url(#mgw)" stroke="#5c706c"/><circle cx="32" cy="10" r="3" fill="url(#mga)"/>`,
  drycooler:`<rect x="5" y="20" width="54" height="20" fill="url(#mgh)" stroke="#71c9d7" stroke-width="1.5"/><path d="M8 24h48M8 29h48M8 34h48" stroke="#5dd2df" stroke-width="1.4" opacity=".6"/><circle cx="32" cy="12" r="10" fill="url(#mgw)" stroke="#5c706c"/><g fill="url(#mgg)"><path d="M32 12 32 3a9 9 0 0 1 7 4z"/><path d="M32 12 39 8a9 9 0 0 1 0 9z"/><path d="M32 12 39 17a9 9 0 0 1-7 4z"/></g><path d="M14 40v4M50 40v4" stroke="#3fa9b9" stroke-width="3"/>`,
  coolingtower:`<path d="M14 8h36l6 12v18H8V20z" fill="url(#mgh)" stroke="#71c9d7" stroke-width="1.5"/><path d="M11 24h42M11 30h42M11 36h42" stroke="#5dd2df" stroke-width="1.4" opacity=".6"/><path d="M20 8v-5h24v5" fill="url(#mgw)" stroke="#5c706c"/><circle class="ops-pulse" cx="32" cy="4" r="2"/>`
};
function coolingItemSvg(id){return `<svg class="cooling-item-icon" viewBox="0 0 64 46" aria-label="${id} cooling equipment illustration">${COOLING_ITEM_ART[id]||COOLING_ITEM_ART.boxfan}</svg>`}
const CONNECTIVITY_PING={fixed:{base:35,jitter:22},sim:{base:78,jitter:42},fiber:{base:11,jitter:5}};
function connectivityPingMs(){
  const cfg=CONNECTIVITY_PING[state.connectivity]||CONNECTIVITY_PING.fixed,t=Date.now()/1000;
  const wave=Math.sin(t/3.7)*.5+Math.sin(t/11)*.5,noise=hashFrac(Math.floor(t*2))*2-1;
  return Math.max(4,Math.round(cfg.base+cfg.jitter*(wave*.6+noise*.4)));
}
function miningConnectionPanel(){
  const poolActive=state.mode==="pool",p=poolActive?poolData():null;
  const primaryConn=poolActive&&p?`stratum+tcp://${p.id}.pool.sim:3333`:"getblocktemplate → local node",primaryName=poolActive&&p?p.name:"Solo mining";
  return `<div class="stratum-panel"><div class="stratum-row active"><i class="stratum-dot"></i><code>${primaryConn}</code><span>${primaryName}</span></div>${poolActive&&p?`<div class="stratum-row standby"><i class="stratum-dot"></i><code>getblocktemplate → local node</code><span>Solo fallback</span></div>`:""}</div>`
}
/* The immersion bay. Deliberately sits inside Fleet servicing rather than beside the miner
   catalogue: converting a machine is maintenance you perform on hardware you already own,
   not a purchase. The panel exists to make the trade explicit - more hash for more power -
   because the engine applies both and a player who only reads the hash figure would be
   misled about the bill. */
function immersionPanelHtml(){
  const def=immersionTankDef();if(!def)return"";
  const tanks=immersionTankCount(),pending=pendingCoolingCount(def.id);
  if(state.time<at(def.date)&&!tanks&&!pending)return"";
  const capacity=immersionCapacity(),used=immersionTotal(),free=immersionFree();
  const eligible=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0&&immersionEligible(h));
  const pct=capacity?Math.round(used/capacity*100):0;
  const rows=eligible.map(h=>{
    const owned=state.hardware[h.id]||0,converted=immersionCount(h.id),air=owned-converted;
    const kits=state.maintenance.inventory.immersionKit||0;
    const canOne=!immersionBlockReason(h,1),batch=Math.min(air,free,kits,10);
    const all=Math.min(air,free,kits);
    const blocked=immersionBlockReason(h,1);
    return `<div class="maintenance-row"><div class="balance-name">${h.name}<small>${converted} submerged · ${air} on air · ${h.w.toLocaleString("en-US")} W stock draw</small><div class="bar" style="--w:${owned?Math.round(converted/owned*100):0}%;--bar:var(--blue)"><i></i></div></div><div class="maintenance-row-actions">${air>0?`<button class="action small ${canOne?"primary":""}" data-action="convert-immersion" data-id="${h.id}" data-value="1" ${canOne?"":"disabled"} title="${blocked||`Convert one ${h.name} · 1 kit · ${fmtUsd(immersionConversionLabour(h,1))}`}">Convert 1</button>${batch>1?`<button class="action small" data-action="convert-immersion" data-id="${h.id}" data-value="${batch}" title="Convert ${batch} · ${batch} kits · ${fmtUsd(immersionConversionLabour(h,batch))}">Convert ${batch}</button>`:""}${all>batch?`<button class="action small" data-action="convert-immersion" data-id="${h.id}" data-value="${all}" title="Convert every remaining air-cooled unit · ${all} kits · ${fmtUsd(immersionConversionLabour(h,all))}">Convert all ${all}</button>`:""}`:`<span class="trade-sub">Whole type submerged</span>`}${converted>0?`<button class="action small danger" data-action="drain-immersion" data-id="${h.id}" data-value="${converted}" ${immersionDrainBlockReason(h,converted)?"disabled":""} title="${escapeHtml(immersionDrainBlockReason(h,converted)||`Drain all ${converted} and refit fans. The conversion kits are scrapped.`)}">Drain ${converted}</button>`:""}</div></div>`;
  }).join("")||`<div class="empty-story">No hardware you own can be submerged. Hydro miners already run their own closed loop, and the starting laptop stays on the desk.</div>`;
  const status=tanks?`<b>${used}</b> of <b>${capacity}</b> tank slots used${free?` · ${free} free`:" · full"}`:pending?`<b>${pending}</b> tank${pending===1?"":"s"} on order · none installed yet`:`<b>No tank installed.</b> Order one from the cooling plant above.`;
  return `<div class="cooling-shop immersion-plant"><div class="cooling-shop-head"><div><span class="hero-kicker">Immersion cooling</span><h3>Submerge a miner and its heat stops being the room's problem.</h3></div><p>A converted machine takes clock headroom air cooling cannot support - roughly ${Math.round((IMMERSION_HASH_GAIN-1)*100)}% more hash for about ${Math.round((IMMERSION_POWER_GAIN-1)*100)}% more power, so it is worth doing when power is cheap against the coin price and not when it is not. Its fans come off, so they stop failing, and only a fraction of its heat reaches the air, which keeps the room temperature that drives wear and faults far lower than the fleet's draw suggests.</p></div><div class="auto-repair-toggle ${tanks?"on":""}"><div><b>Tank capacity</b><span>${status}</span></div><div class="bar" style="--w:${pct}%;--bar:${free?"var(--blue)":"var(--orange)"};min-width:140px"><i></i></div></div><div class="balance-list" style="margin-top:10px">${rows}</div></div>`;
}
function coolingEquipmentHtml(){
  const tier=facilityTier();return COOLING_EQUIPMENT.filter(item=>announced(item)||state.thermal.equipment[item.id]).map(item=>{const owned=state.thermal.equipment[item.id]||0,onOrder=pendingCoolingCount(item.id),installDays=coolingInstallDays(item),nextDue=pendingCoolingOrders(item.id).map(o=>o.due).sort((a,b)=>a-b)[0],available=state.time>=at(item.date)&&tier>=item.minTier&&tier<=item.maxTier,reason=state.time<at(item.date)?`Available ${dateFmt(at(item.date),true)}`:tier<item.minTier?`Requires facility tier ${item.minTier}`:tier>item.maxTier?"Too small for this facility":"Fiat equipment";return `<article class="cooling-option ${owned?"owned":""} ${available?"":"locked"}">${coolingItemSvg(item.id)}<div><span>${onOrder?`${onOrder} ON ORDER${owned?` · ${owned} INSTALLED`:""}`:owned?`${owned} INSTALLED`:reason.toUpperCase()}</span><h4>${item.name}</h4><p>${item.desc}</p><small>+${fmtNum(item.coolingKw)} kW cooling · ${item.watts.toLocaleString("en-US")} W peak draw · ${installDays}-day install${onOrder?` · next due ${dateFmt(nextDue)}`:""}</small></div><div class="cooling-actions"><button class="action small ${available?"primary":""}" data-action="buy-cooling" data-id="${item.id}" ${!available||state.cash<item.cost?"disabled":""} title="${available?`Paid now. Installed in ${installDays} simulated days; it rejects no heat until then.`:reason}">Order · ${fmtCompactUsd(item.cost)}</button>${onOrder?`<button class="action small" data-action="cancel-cooling" data-id="${item.id}" title="Cancel the newest undelivered order. The supplier keeps ${Math.round(COOLING_RESTOCK*100)}% as a restocking fee.">Cancel · +${fmtCompactUsd(item.cost*(1-COOLING_RESTOCK))}</button>`:""}${owned?`<button class="action small" data-action="sell-cooling" data-id="${item.id}" title="Remove one installed unit and sell it on. Heat rejection falls by ${fmtNum(item.coolingKw)} kW the same day.">Sell 1 · +${fmtCompactUsd(coolingResaleValue(item))}</button>`:""}</div></article>`}).join("")
}
/* The flat floor is the one in the markup and the one contracts can read. The 3D floor is an
   alternative view of the same batches, offered only where the browser can draw it. */
/* THE FLOOR IS THE 3D FLOOR.

   The flat floor was the default and the 3D view was the alternative, offered by a toggle. It
   is the other way round now: the room, the racks, the cooling plant, the crew and the heat
   all read there and only there, and asking a player to choose between a diagram and the
   thing itself was asking them to choose worse.

   The flat floor is not deleted, because it is the only thing to show a browser that cannot
   open a 3D context - a failed load, a lost context, no WebGL at all. It is a fallback now
   rather than a view: nothing offers it, and it appears only when the alternative is a blank
   rectangle. state.floorView is therefore no longer a preference the player sets; it records
   what the browser turned out to be capable of. */
function floor3dAvailable(){
  return typeof floor3dUnavailableReason!=="function"||!floor3dUnavailableReason();
}
function floorViewport(){
  const blocked=typeof floor3dUnavailableReason==="function"?floor3dUnavailableReason():"";
  if(blocked)return `<p class="modal-note floor-3d-fallback">${blocked} The flat floor below carries the same information.</p>`;
  return `<div class="floor-stage">${typeof floorSmokeHtml==="function"?floorSmokeHtml():""}<div class="floor-3d-mount" role="img" aria-label="Three-dimensional view of the mining floor"></div></div><div class="floor-3d-bar"><p class="floor-3d-readout" data-floor3d-readout>Hover a machine to inspect it. Click a faulted one to open its repair.</p><div class="floor-3d-controls"><button class="action small" data-action="floor3d-zoom" data-value="out" title="Zoom out">&minus;</button><button class="action small" data-action="floor3d-zoom" data-value="in" title="Zoom in">+</button><button class="action small" data-action="floor3d-reset" title="Return to the default vantage" disabled>Reset view</button></div></div>`;
}
function miningFloorVisual(){
  const fs=fleet(),tier=facilityTier(),temperature=roomTemperatureC(),target=thermalTargetC(),ambient=ambientTemperatureC(),capacity=coolingCapacityKw(),powered=thermalPowerAvailable(),heat=powered?activeMinerWatts()/1000:0,activeNow=powered?fs.activeCount:0,band=temperature<32?"cool":temperature<42?"warm":temperature<52?"hot":"critical",techs=fieldTechnicianCount(),owned=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0),netDown=connectivityOutage(),powerDown=!powered;
  const floorLimit=[12,28,72,110,130,150,170,190][tier-1]||110,shownIcons=Math.min(floorLimit,owned.reduce((sum,h)=>sum+(state.hardware[h.id]||0),0)),iconSize=shownIcons<=16?58:shownIcons<=32?48:shownIcons<=60?40:shownIcons<=90?32:shownIcons<=130?26:shownIcons<=170?22:18;
  const techAssignments=[];(state.maintenance.serviceJobs||[]).filter(j=>!j.contracted&&Number(j.crew||0)>0).forEach(j=>{const jh=HARDWARE.find(x=>x.id===j.id);for(let c=0;c<Number(j.crew||0);c++)techAssignments.push(jh?.name||j.id)});
  return `<section class="card span-12 mining-floor-card${typeof floorScene==="function"&&floorScene()?` floor-has-scene floor-${floorScene().kind}`:""}">${typeof floorSceneArtHtml==="function"?floorSceneArtHtml():""}<div class="card-head"><h2>Live mining floor</h2><div class="meta ${band}">${temperature.toFixed(1)} °C · ${band.toUpperCase()}</div></div>${typeof floorSceneBannerHtml==="function"?floorSceneBannerHtml():""}<div class="thermal-console"><div><span>Room temperature</span><strong class="thermal-${band}">${temperature.toFixed(1)} °C</strong><small>moving toward ${target.toFixed(1)} °C</small></div><div><span>Outside air</span><strong>${ambient.toFixed(1)} °C</strong><small>${region().name} seasonal model</small></div><div><span>Miner heat</span><strong>${heat.toFixed(2)} kW</strong><small>${activeNow} of ${fs.count} machines active now</small></div><div><span>Heat rejection</span><strong>${fmtNum(capacity)} kW</strong><small>at +10 °C · sheds ${fmtNum(thermalLossKwPerC())} kW per °C</small></div><div><span>Wear multiplier</span><strong>${temperatureWearMultiplier().toFixed(2)}×</strong><small>failure risk ${temperatureFailureMultiplier().toFixed(2)}×</small></div><div><span>Overdrive</span><strong style="color:${state.overdrive?"var(--red)":"var(--green)"}">${state.overdrive?"ENGAGED":"OFF"}</strong><small>${state.overdrive?"+15% hash · +25% power · 1.6× wear · 2.2× fault risk":"Rated settings"}</small></div><div><span>Internet</span><strong style="color:${netDown?"var(--red)":"var(--green)"}">● ${netDown?"OUTAGE":"ONLINE"}</strong><small>${netDown?`Restoring ${dateFmt(state.ops.outageUntil)}`:`${connectivityPlan().name} · ${connectivityPingMs()}ms to ${state.mode==="pool"?poolData().name:"node"}`}</small></div><div><span>Grid power</span><strong style="color:${powerDown?"var(--red)":"var(--green)"}">● ${powerDown?"OFFLINE":"ONLINE"}</strong><small>${powered?`${(region().rely*100).toFixed(1)}% grid uptime`:powerOutage()?`Outage · restoring ${dateFmt(state.ops.powerOutageUntil)}`:state.debt>0?`Arrears · ${fmtUsd(state.debt)} due`:fleetGrounded()?"Fleet in transit":"Manually stopped"}</small></div></div>${floorViewport()}<div class="facility-floor tier-${tier}"${floor3dAvailable()?' hidden':''}>${typeof floorSmokeHtml==="function"?floorSmokeHtml():""}<div class="facility-room">${facilityInteriorSvg(tier)}${miningFloorCooling()}<div class="floor-units" style="--icon-size:${iconSize}px">${miningFloorUnits()}</div>${Array.from({length:Math.min(techs,6)},(_,i)=>technicianSprite(i,techAssignments[i]||null)).join("")}<div class="floor-caption"><b>${facility().name}</b><span>${floorCaption(tier)}</span></div></div></div><div class="floor-legend"><span><i class="online"></i> Hashing</span><span><i class="paused"></i> Powered off</span><span><i class="broken"></i> Faulted</span><span><i class="repair"></i> Technician assigned</span><span><i class="cooling"></i> Cooling plant</span><span><i class="cooling-pending"></i> Cooling on order</span><button class="action small ${state.power?"danger":"primary"}" data-action="toggle-power" ${state.debt||state.policyLock?"disabled":""} title="${state.debt?"Grid arrears must be paid before power can be toggled":state.policyLock?state.policyLock:state.power?"Stops every machine at once: no mining and no electricity for the fleet. Rent, internet, staff and insurance still fall due. The site stays stopped until you start it again.":"Starts every machine that is not switched off on its own."}">${state.power?"Emergency stop all":"Start site power"}</button><button class="action small ${state.overdrive?"danger":""}" data-action="toggle-overdrive" ${state.debt||state.policyLock?"disabled":""} title="${state.debt?"Grid arrears must be paid before overdrive can be toggled":state.policyLock?state.policyLock:""}">${state.overdrive?"Disengage overdrive":"Push overdrive"}</button></div>${miningConnectionPanel()}<div class="miner-power-controls">${owned.map(h=>{const n=state.hardware[h.id],rs=hardwareRepairState(h),paused=rs.paused,reason=hardwareOfflineReason(h),unavailable=reason?Math.max(0,n-paused):rs.repairing,running=Math.max(0,n-paused-unavailable);return `<div class="miner-control-row"><div>${minerSvg(h.id)}<span><b>${h.name}</b><small>${powered?running:0} running · ${paused} manually off · ${unavailable} unavailable / repair · ${maintenanceCondition(h).toFixed(0)}% condition</small></span></div><div class="actions">${n===1
      /* A one-machine line is a switch, not a fleet. "Stop 1 / Stop all / Restart all" against
         a single laptop reads as three greyed-out fleet operations, and the thing a player
         actually wants - stop mining on this machine - is the one that looks least like it.
         This is the starting laptop's only control for the first year of the game. */
      ?`<button class="action small ${running?"danger":"primary"}" data-action="hardware-power" data-id="${h.id}" data-value="${running?"off":"on"}" data-qty="1" ${!running&&!paused?"disabled":""} title="${!running&&!paused?"This machine is unavailable or in repair":running?`Stop hashing on this ${h.name}. It earns nothing, draws no power and stops wearing.`:"Start hashing on this machine again."}">${running?"Stop hashing":"Start hashing"}</button>`
      :`<button class="action small" data-action="hardware-power" data-id="${h.id}" data-value="off" data-qty="1" ${running<1?"disabled":""} title="${running<1?"No running units to stop":""}">Stop 1</button><button class="action small danger" data-action="hardware-power" data-id="${h.id}" data-value="off" data-qty="${running}" ${running<1?"disabled":""} title="${running<1?"No running units to stop":""}">Stop all</button><button class="action small primary" data-action="hardware-power" data-id="${h.id}" data-value="on" data-qty="${paused}" ${paused<1?"disabled":""} title="${paused<1?"No manually powered-off units to restart":""}">Restart ${paused||"all"}</button>`}</div></div>`}).join("")}</div></section>`
}
function tabCommandVisual(kind){
  const fs=fleet(),learning=learningItem();let title,copy,stats,art;
  if(kind==="mine"){const owned=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0),shown=owned.slice(-8);title="Fleet command";copy=narrativeCopy("mine");stats="";art=`<div class="fleet-actual" aria-label="Actual owned mining hardware">${shown.map(h=>`<div class="fleet-actual-unit">${minerSvg(h.id)}<b>×${state.hardware[h.id]}</b><span class="fleet-actual-label">${h.name}</span></div>`).join("")}${owned.length>shown.length?`<div class="fleet-extra">+${owned.length-shown.length}<br>types</div>`:""}</div>`}
  else if(kind==="market"){title="Market terminal";copy=narrativeCopy("market");stats=`<span><b>${fmtUsd(state.cash)}</b> liquid fiat</span><span><b>${fmtBtc(totalBtc())}</b> BTC exposure</span><span><b>${fmtUsd(equityValue())}</b> equities</span><span><b>${state.time<MARKET?"-":fmtUsd(priceAt(state.time))}</b> BTC / USD</span>`;art=`<svg class="tab-art" viewBox="0 0 360 165" aria-label="Market price and settlement flow"><path d="M22 128H338M22 93H338M22 58H338" stroke="#283334"/><path d="M50 143h70M240 143h70" stroke="#86c79a" stroke-width="5"/><path d="M119 143h122" stroke="#82948f" stroke-width="2" stroke-dasharray="5 5"/><text x="45" y="158" fill="#a8b4b0" font-size="11">FIAT</text><text x="261" y="158" fill="#a8b4b0" font-size="11">BTC</text></svg>`}
  else if(kind==="custody"){title="Custody map";copy=narrativeCopy("custody");stats=`<span><b>${fmtBtc(controlled())}</b> keys controlled</span><span><b>${fmtBtc(claims())}</b> venue claims</span><span><b>${nodeOnline()?"online":"offline"}</b> node</span>`;art=`<svg class="tab-art" viewBox="0 0 360 165" aria-label="Bitcoin custody vault"><path d="M82 23h122l45 37v70l-106 24-106-24V60z" fill="#152426" stroke="#86c79a" stroke-width="3"/><circle cx="143" cy="87" r="30" fill="#0b1011" stroke="#f0a92f" stroke-width="3"/><path d="M143 68v38M130 80h25M130 95h25" stroke="#f0a92f" stroke-width="3"/><path d="M255 51h45v57h-45z" fill="#1c292b" stroke="#81938e"/><path d="M264 67h27M264 79h27M264 91h27" stroke="#86c79a"/><circle class="glow" cx="278" cy="60" r="3"/></svg>`}
  else if(kind==="learn"){title="Knowledge desk";copy=narrativeCopy("learn");stats=`<span><b>${state.knowledge.toFixed(1)}</b> knowledge</span><span><b>${state.points}</b> tech points</span><span><b>${learning?"occupied":"available"}</b> learning slot</span>`;art=`<svg class="tab-art" viewBox="0 0 360 165" aria-label="Books and podcast learning"><path d="M35 38c42-15 74-6 102 15v78c-29-21-61-29-102-14zM137 53c29-21 61-30 102-15v79c-41-15-73-7-102 14z" fill="#1c2b2d" stroke="#86c79a" stroke-width="3"/><path d="M55 66h58M55 82h48M55 98h54M160 66h58M160 82h48M160 98h54" stroke="#82948f"/><path d="M272 57c28 12 28 39 0 51M288 45c43 22 43 53 0 75" fill="none" stroke="#f0a92f" stroke-width="5"/><circle class="glow" cx="257" cy="82" r="9"/></svg>`}
  else{title="Technology tree";copy=narrativeCopy("tech");stats=`<span><b>${state.points}</b> unspent points</span><span><b>${state.skills.length}</b> upgrades</span><span><b>${SKILLS.length}</b> available paths</span>`;art=`<svg class="tab-art" viewBox="0 0 360 165" aria-label="Technology skill network"><path d="M72 82h72M144 82l65-42M144 82l65 42M209 40h74M209 124h74" stroke="#526560" stroke-width="3"/><circle cx="55" cy="82" r="18" fill="#172628" stroke="#f0a92f" stroke-width="4"/><circle cx="144" cy="82" r="17" fill="#172628" stroke="#86c79a" stroke-width="4"/><circle cx="226" cy="40" r="17" fill="#172628" stroke="#86c79a" stroke-width="4"/><circle cx="226" cy="124" r="17" fill="#172628" stroke="#86c79a" stroke-width="4"/><circle class="glow" cx="301" cy="40" r="10"/><circle cx="301" cy="124" r="10" fill="#f0a92f"/></svg>`}
  return `<section class="card span-12 tab-command-${kind}"><div class="tab-command"><div class="tab-command-copy"><div class="hero-kicker">${narrativeEra().label}</div><h2>${title}</h2><p>${copy}</p>${stats?`<div class="tab-command-stats">${stats}</div>`:""}</div><div class="tab-command-art">${art}</div></div></section>`;
}
function narrativeBanner(kind,title){return `<section class="card span-12 narrative-${kind}"><div class="card-pad"><div class="hero-kicker">${narrativeEra().label}</div><h2 style="margin:8px 0">${title}</h2><p style="color:var(--muted);line-height:1.65;max-width:900px;margin:0">${narrativeCopy(kind)}</p></div></section>`}
/* WHERE A MACHINE IS IN THE PIPELINE, on the machine's own card. The Incoming fleet card says it too, but it sits above the
   whole catalogue, so a player who has just pressed Buy on a card sees nothing happen where they pressed. This strip is the
   answer on the spot: on order and when it arrives, delivered and waiting to be commissioned, or part-way through racking. */
function hardwareOrderStrip(h){
  const orders=(state.procurementOrders||[]).filter(o=>o.id===h.id),staged=Math.max(0,Math.floor(Number(state.inactiveHardware?.[h.id])||0));
  const racking=(state.commissioningJobs||[]).filter(j=>j.id===h.id);
  if(!orders.length&&!staged&&!racking.length)return"";
  const parts=[];
  orders.forEach(o=>{const days=Math.max(0,Math.ceil((o.due-state.time)/DAY));parts.push(`${fmtCompactNumber(o.qty)} on order · arrives ${dateFmt(o.due)} (${days} day${days===1?"":"s"})${(o.slips||0)>0?" · slipped":""}`)});
  if(staged)parts.push(`${fmtCompactNumber(staged)} delivered, waiting to be commissioned`);
  racking.forEach(j=>{const done=Math.max(0,Math.floor(Number(j.done)||0)),left=Math.max(0,j.qty-done);parts.push(`${fmtCompactNumber(left)} of ${fmtCompactNumber(j.qty)} still to rack`)});
  return `<div class="hw-order-strip" role="status"><b>In the pipeline</b><span>${parts.join(" · ")}</span>${staged?`<button class="action small primary" data-action="activate-hw" data-id="${h.id}">Commission ${fmtCompactNumber(staged)}</button>`:""}</div>`;
}
function incomingFleetVisual(){
  const transit=state.procurementOrders,delivered=HARDWARE.filter(h=>(state.inactiveHardware?.[h.id]||0)>0),commissioning=state.commissioningJobs;
  const retiring=(state.retirementJobs||[]).filter(j=>Number(j.qty)-Number(j.done||0)>0);
  if(!transit.length&&!delivered.length&&!commissioning.length&&!retiring.length)return"";
  const stageNames=["In transit","Delivered","Commissioning"],track=idx=>`<div class="repair-stage-track">${stageNames.map((name,i)=>`<i class="${i<idx?"done":i===idx?"active":""}" title="${name}"></i>`).join("")}</div>`;
  const rows=[
    ...transit.map(o=>{const h=HARDWARE.find(x=>x.id===o.id),days=Math.max(0,Math.ceil((o.due-state.time)/DAY)),slipped=(o.slips||0)>0;return `<div class="incoming-fleet-row ${slipped?"slipped":""}"><div class="incoming-fleet-name"><b>${o.qty} × ${h?.name||o.id}</b><small>${slipped?"Delivery slipped · ":""}${o.vendor||h?.maker||"Supplier"} · ETA ${dateFmt(o.due)} · ${days}d remaining · ${Math.round((o.risk||0)*100)}% delay risk</small></div>${track(0)}</div>`}),
    ...delivered.map(h=>{const qty=state.inactiveHardware[h.id];return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>${qty} × ${h.name}</b><small>Staged at ${facility().name} - ready to commission</small></div>${track(1)}<button class="action small primary" data-action="activate-hw" data-id="${h.id}">Commission ${qty}</button></div>`}),
    /* Machines come online as the crew works through them, so this row is a progress report
       rather than a countdown: saying "500 racking" while 180 of them are already hashing
       reads as though nothing has happened yet. */
    ...commissioning.map(j=>{
      const h=HARDWARE.find(x=>x.id===j.id),days=Math.max(0,Math.ceil((j.due-state.time)/DAY));
      const done=Math.max(0,Math.floor(Number(j.done)||0)),left=Math.max(0,j.qty-done);
      const pct=j.qty?Math.round(done/j.qty*100):0;
      return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>${fmtCompactNumber(left)} of ${fmtCompactNumber(j.qty)} × ${h?.name||j.id} still to rack</b><small>${done?`${fmtCompactNumber(done)} already hashing · `:""}${days}d remaining</small><div class="bar" style="--w:${pct}%;--bar:var(--green)"><i></i></div></div>${track(2)}</div>`}),
    /* The pipeline runs both ways. Machines on their way OUT are as much a part of what the
       floor is doing as machines on their way in, and a fleet that is half-retired is a
       hash rate that is still falling - which the operator needs to be able to see. */
    ...retiring.map(j=>{
      const h=HARDWARE.find(x=>x.id===j.id),days=Math.max(0,Math.ceil((j.due-state.time)/DAY));
      const done=Math.max(0,Math.floor(Number(j.done)||0)),left=Math.max(0,j.qty-done);
      const pct=j.qty?Math.round(done/j.qty*100):0;
      return `<div class="incoming-fleet-row outgoing"><div class="incoming-fleet-name"><b>${fmtCompactNumber(left)} of ${fmtCompactNumber(j.qty)} × ${h?.name||j.id} still to unrack</b><small>${done?`${fmtCompactNumber(done)} already in storage · `:""}${days}d remaining · still hashing until pulled</small><div class="bar" style="--w:${pct}%;--bar:var(--orange)"><i></i></div></div><div class="repair-stage-track"><i class="done" title="Retiring"></i><i class="active" title="Unracking"></i><i title="Stored"></i></div></div>`})
  ].join("");
  return `<section class="card span-12 incoming-fleet"><div class="card-head"><h2>Incoming fleet</h2><div class="meta">ORDER → TRANSIT → COMMISSION → ACTIVE</div></div><div class="card-pad">${rows}</div></section>`;
}
function enhanceMine(){
  const grid=document.querySelector(".content .grid");if(!grid)return;
  const fs=fleet(),reserved=plannedFleetProjection(),ordered=state.procurementOrders.reduce((sum,o)=>sum+Number(o.qty||0),0),staged=Object.values(state.inactiveHardware||{}).reduce((sum,n)=>sum+Number(n||0),0);
  const banner=`<div class="shopping-banner span-12"><b>Live mine desk - ${state.speed>0?`timeline running at ${state.speed}×`:"timeline manually paused"}</b><span>Buy, sell and activate miners without leaving this screen. Prices and available quantities update as the simulation advances.</span></div>`;
  const ownedFleet=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0),healthUnits=ownedFleet.reduce((sum,h)=>sum+(state.hardware[h.id]||0),0),avgHealth=healthUnits?ownedFleet.reduce((sum,h)=>sum+maintenanceCondition(h)*(state.hardware[h.id]||0),0)/healthUnits:100,openFaults=ownedFleet.reduce((sum,h)=>sum+hardwareFaultCount(h),0),openFaultFraction=healthUnits?openFaults/healthUnits:0;
  const metrics=`<section class="card span-12 mine-top-metrics"><div class="metric-row"><div class="metric"><div class="label">Machines</div><strong>${fs.count}</strong><small>${ordered||staged?`${ordered?`${ordered} ordered`:""}${ordered&&staged?" · ":""}${staged?`${staged} awaiting activation`:""}`:`${fs.activeCount} active · ${fs.offlineCount} unavailable`}</small></div><div class="metric"><div class="label">Machine capacity</div><strong>${reserved.space} / ${facility().space}</strong><small>${ordered?`${fs.space} deployed · ${reserved.space-fs.space} reserved`:"Floor units used / available"}</small></div><div class="metric"><div class="label">Electrical capacity</div><strong>${reserved.potentialKw.toFixed(2)} / ${reserved.cap.toFixed(1)} kW</strong><small>${reserved.kw.toFixed(2)} kW drawn now · peak is what has to fit${fs.cap&&fs.kw/fs.cap>.55?` · ${((fs.kw/fs.cap)*100).toFixed(0)}% load · ${energyLoadFactor().toFixed(2)}× rate`:""}</small></div><div class="metric"><div class="label">Room temperature</div><strong>${roomTemperatureC().toFixed(1)} °C</strong><small>Target ${thermalTargetC().toFixed(1)} °C · ${facility().name}</small></div><div class="metric"><div class="label">Fleet health</div><strong style="color:${avgHealth<65||openFaultFraction>.05?"var(--red)":avgHealth<80||openFaultFraction>.01?"var(--orange)":"var(--green)"}">${avgHealth.toFixed(0)}%</strong><small>${openFaults?`${openFaults} unit${openFaults===1?"":"s"} ${openFaults===1?"needs":"need"} service`:"No open faults"}</small></div></div></section>`;
  /* Only the section being looked at is built. Everything here is a string of markup, so an
     unbuilt section costs nothing rather than being hidden with CSS - which would have left
     the page the same length and the same weight to render. */
  const section=mineSection();
  const body=section==="floor"?tabCommandVisual("mine")+miningFloorVisual()
    :section==="service"?fleetServicingVisual()
    :section==="cooling"?coolingPlantVisual()
    :incomingFleetVisual();
  grid.insertAdjacentHTML("afterbegin",banner+mineSectionNav()+metrics+powerLoadCard()+body);
  document.querySelectorAll(".catalog .item").forEach(card=>{const h=HARDWARE.find(x=>x.id===card.dataset.hwId);if(!h)return;const reason=hardwareOfflineReason(h);card.insertAdjacentHTML("afterbegin",minerSvg(h.id));if(reason)card.insertAdjacentHTML("beforeend",`<div class="trade-sub" style="color:var(--red)">Will remain offline: ${reason}</div>`)});
  if(section==="floor"&&floor3dAvailable()&&typeof mountFloor3d==="function")mountFloor3d();
}
function enhanceMarket(){
  const grid=document.querySelector(".content .grid");if(!grid)return;
  /* The chart goes in first so it sits above the hero: the price is the thing the tab is
     about, and it was the one number with no picture of where it had been. */
  if(!grid.querySelector(".price-chart-card"))grid.insertAdjacentHTML("afterbegin",priceChartCard());
  setTimeout(()=>{if(!grid.querySelector(".tab-command-market"))grid.querySelector(".price-chart-card")?.insertAdjacentHTML("afterend",tabCommandVisual("market"))},0);
  const lightningNote=[...grid.querySelectorAll(".modal-note")].find(el=>el.textContent.startsWith("Requires a full node."));if(lightningNote)lightningNote.textContent="Requires a synchronized dedicated primary node in archival or relay mode. A remote verification backup deliberately does not hold the Lightning service or channel keys.";
  const securities=STRATEGY_SECURITIES.filter(s=>state.time>=at(s.date));if(securities.length)grid.insertAdjacentHTML("beforeend",`<section class="card span-12"><div class="card-head"><h2>Strategy capital structure</h2><div class="meta">MODELLED PRICE EXPOSURE · FIAT PAYOUTS WHERE APPLICABLE</div></div><div class="card-pad"><p style="color:var(--muted);line-height:1.6;margin-top:0">These instruments are modelled from Strategy's Bitcoin-treasury logic. MSTR is amplified equity exposure; the preferred series target different cash-income profiles. Prices are game models linked to Bitcoin's historical path, not historical security prices.</p><div class="venue-grid">${securities.map(s=>{const shares=state.strategy[s.id]||0,value=strategyValue(s.id),income=shares*strategyPrice(s.id)*s.yield/365*30.4375;return `<article class="venue ${shares>0?"active":""}"><div class="risk ${s.yield?"medium":"high"}">${s.ticker} · ${s.yield?`${(s.yield*100).toFixed(0)}% modelled annual fiat yield`:"leveraged BTC equity exposure"}</div><h3>${s.name}</h3><p>${s.desc}</p><div class="trade-value">${fmtUsd(value)}</div><div class="trade-sub">${shares.toFixed(2)} shares · ${fmtUsd(strategyPrice(s.id))}/share${s.yield?` · ~${fmtUsd(income)}/month`:""}</div><div class="actions"><button class="action small primary" data-action="buy-strategy" data-id="${s.id}" data-value=".1" ${state.cash<1?"disabled":""} title="${state.cash<1?"Not enough liquid cash":""}">Buy 10% cash</button><button class="action small" data-action="buy-strategy" data-id="${s.id}" data-value=".25" ${state.cash<1?"disabled":""} title="${state.cash<1?"Not enough liquid cash":""}">Buy 25%</button><button class="action small" data-action="sell-strategy" data-id="${s.id}" data-value=".25" ${shares<=0?"disabled":""} title="${shares<=0?"No shares held to sell":""}">Sell 25%</button></div></article>`}).join("")}</div><p class="modal-note" style="margin-top:10px">STRC income is paid into fiat daily in-game. Other preferred dividends are also simplified as daily fiat accruals; no dividend is guaranteed in reality.</p></div></section>`);
  const available=SPECULATIONS.filter(s=>offerOpen(s)&&!state.speculations.includes(s.id)).sort((a,b)=>at(b.date)-at(a.date));
  if(!available.length)return;
  grid.insertAdjacentHTML("beforeend",`<section class="card span-12"><div class="card-head"><h2>Speculative side bets</h2><div class="meta">MODELLED · HIGH RISK · ONE ATTEMPT EACH</div></div><div class="card-pad"><p style="color:var(--muted);line-height:1.6;margin-top:0">These are optional historical-era opportunities, not investment advice. Each risks BTC from your hot wallet; outcomes are deterministic within this run and losses are more likely than gains.</p><div class="venue-grid">${available.map(s=>`<article class="venue"><div class="risk high">${Math.round(s.chance*100)}% modelled chance · ${s.payout.toFixed(1)}× return if it hits</div><h3>${s.name}</h3><p>${s.desc}</p><div class="trade-sub">${s.kind} · launched ${dateFmt(at(s.date),true)}${s.until?` · <strong style="color:${offerDaysLeft(s)<=120?"var(--red)":"var(--orange2)"}">${fmtNum(offerDaysLeft(s))} days left</strong> · the window this trade existed in was ${offerWindowLabel(s)}`:""}</div><div class="actions"><button class="action small primary" data-action="speculate" data-id="${s.id}" data-value=".1" ${state.wallets.hot<=0?"disabled":""} title="${state.wallets.hot<=0?"No hot-wallet BTC available to risk":""}">Risk 10% hot BTC</button><button class="action small" data-action="speculate" data-id="${s.id}" data-value=".25" ${state.wallets.hot<=0?"disabled":""} title="${state.wallets.hot<=0?"No hot-wallet BTC available to risk":""}">Risk 25%</button></div></article>`).join("")}</div></div></section>`);
}
