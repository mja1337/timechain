"use strict";

/* THE FLEET'S PHYSICAL LIFE: what arrives, what gets racked, what comes out again, and what
   is switched off without leaving.

   These lived in actions.js beside the money, and then briefly in thermal.js beside the heat,
   because a delivery and a cooling install look alike from a distance. They are not about
   either. They are about the crew: how long it takes to rack four thousand machines, how long
   to pull them out, and what is true of the fleet while that work is half done. */

function advanceProcurement(){state.procurementOrders=state.procurementOrders.filter(o=>{if(pendingAt(o,state.time))return true;const h=HARDWARE.find(x=>x.id===o.id);if(!h)return false;if((o.slips||0)<2&&nextRand()<(o.risk||0)){const delay=14+Math.floor(nextRand()*42);o.due=state.time+delay*DAY;o.slips=(o.slips||0)+1;log(`${h.name} delivery slipped`,`${o.vendor||"supplier"} · ${delay} additional days`);showToast("Delivery delayed",`${h.name} shipment slipped by ${delay} days (${o.label}).`,"warning","mine");return true}let delivered=Number(o.qty);if(delivered>1&&nextRand()<(o.partialRisk||0)){delivered=Math.max(1,Math.floor(delivered*(.45+nextRand()*.3)));const remaining=Number(o.qty)-delivered;state.procurementOrders.push({...o,qty:remaining,due:state.time+(14+Math.floor(nextRand()*28))*DAY,slips:2,label:`${o.label} · balance shipment`});log(`${h.name} partially delivered`,`${delivered} received · ${remaining} remain with ${o.vendor||"supplier"}`)}stageDelivery(o.id,delivered,Number.isFinite(o.condition)?o.condition:100);log(`Miner delivery received`,`${delivered} × ${h.name} awaiting activation`);showToast("Miners have arrived",`${delivered} × ${h.name} is staged.${delivered<Number(o.qty)?" The remaining allocation is still in transit.":""}`,"info","mine");renderFullQueued=true;return false})}
/* Staged machines are a count per type, so a second-hand batch's condition would be lost
   between the loading bay and the rack. It is carried alongside, weighted when two batches of
   the same machine are waiting together - which is what actually happens when you buy the
   same model from two sellers. */
function stageDelivery(id,qty,condition){
  const staged=Math.max(0,Math.floor(state.inactiveHardware?.[id]||0));
  const store=state.stagedCondition||(state.stagedCondition={});
  const prior=Number.isFinite(store[id])?store[id]:100;
  const total=staged+qty;
  store[id]=total>0?(staged*prior+qty*condition)/total:condition;
  state.inactiveHardware[id]=total;
}
/* RACKING AND UNRACKING ARE CREW WORK, so the crew size is what sets the pace.

   These asked hasStaff("fieldtech"), which is a boolean: one technician doubled the rate and
   the twenty-fourth did nothing. That is the same mistake the repair planner made - the count
   is right there in fieldTechnicianCount() - and it is most wrong exactly where it matters
   most, on the sites large enough to employ a real crew.

   Returns diminish rather than stopping dead: a second pair of hands nearly doubles the rate,
   the tenth adds a tenth. There is a limit to how many people can usefully move around the
   same aisle, and CREW_SOFT_CAP is where this stops pretending otherwise. */
const CREW_SOFT_CAP=12,COMMISSION_PER_DAY=20;
/* WHO IS DOING THE WORK, in words that are true of this run. With no technician on the payroll nobody is "the crew":
   the player is doing the racking, and a toast that says otherwise describes staff who do not exist. */
function rackingWho(){return (typeof fieldTechnicianCount==="function"?fieldTechnicianCount():0)>0?"your technicians":"you"}
function crewRatePerDay(base){
  const techs=Math.min(CREW_SOFT_CAP,typeof fieldTechnicianCount==="function"?fieldTechnicianCount():0);
  return base*(1+techs);
}
/* WHAT THE SITE CAN TAKE TODAY.

   Capacity used to be enforced at the till: you could not buy a machine the room had no space
   or power for. That is not how ordering works, and it made the game refuse a perfectly
   sensible plan - buy the fleet now while the price is right, take delivery into storage, and
   commission it when the substation upgrade lands. Worse, it meant a machine already paid for
   and standing on the floor could be refused as a batch because ONE of them did not fit.

   So the gate moved from the purchase to the intake, where it belongs. You may buy whatever
   your cash and the market can supply; what the site will accept is decided when the crates
   arrive, and it is decided per machine rather than per batch. Whatever fits goes in and the
   rest waits in storage - no decision to make, because there is no decision: a machine that
   fits is a machine you want hashing.

   Reckoned against what is actually INSTALLED, not against what is on order. Orders and staged
   crates reserve nothing: an order in transit that held capacity hostage is precisely what
   stopped the staged units in the warehouse from ever being racked. */
/* WHAT IS ALREADY ON ITS WAY INTO THE RACKS.

   Orders and staged crates reserve nothing - that is deliberate, and it is what lets a fleet
   bought ahead of a substation upgrade sit in storage until there is room for it. A machine
   being COMMISSIONED is a different thing entirely: the crew is bolting it in, and it is going
   to draw power and occupy floor whether or not it has finished doing so yet.

   Leaving those out was a real and expensive mistake. Commissioning takes days, the intake runs
   every day, and headroom measured against installed machines alone does not shrink while a job
   is in flight - so the intake started a fresh job every day for the whole length of the last
   one, each convinced there was room. A site could end up with several times the machines it
   can carry, at which point fleet().within goes false and the entire operation stops mining
   with no message anywhere saying why. */
function committedLoad(s=state){
  let watts=0,space=0;
  for(const job of s.commissioningJobs||[]){
    const h=HARDWARE.find(x=>x.id===job.id);if(!h)continue;
    const left=Math.max(0,(Number(job.qty)||0)-(Number(job.done)||0));
    if(!left)continue;
    watts+=left*hardwarePeakWatts(h,s);
    space+=left*(h.space||0);
  }
  return{watts,space};
}
/* A machine bolted in today lives wherever the operation is tomorrow. While a move is in
   flight the bay used to measure against the site being LEFT, so crates already on the floor
   were racked into a warehouse's headroom and then landed in the workshop that replaced it:
   fleet fits at dispatch, 306 machines racked over the following days, 999 kW arriving at a
   100 kW cap, and the floor offline for good. Neither site alone is the answer - an upgrade
   has not happened yet and a downsize is about to - so the bay works to whichever is tighter. */
function rackLimits(s=state){
  const fs=fleet(s),here=FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0];
  let cap=fs.cap,space=here.space;
  const moveTo=s.facilityUpgradeJob&&s.facilityUpgradeJob.id;
  if(moveTo&&moveTo!==s.facility){
    const dest=FACILITIES.find(x=>x.id===moveTo);
    if(dest){cap=Math.min(cap,fleet({...s,facility:moveTo}).cap);space=Math.min(space,dest.space)}
  }
  return{cap,space,draw:fs.potentialKw,used:fs.space};
}
function siteRackHeadroom(h,s=state){
  if(!h)return 0;
  const fs=rackLimits(s);
  const pending=committedLoad(s);
  const freeWatts=Math.max(0,(fs.cap-fs.draw)*1000-pending.watts);
  const freeSpace=Math.max(0,fs.space-fs.used-pending.space);
  const byPower=Math.floor(freeWatts/Math.max(1,hardwarePeakWatts(h,s)));
  const bySpace=h.space>0?Math.floor(freeSpace/h.space):Infinity;
  return Math.max(0,Math.min(byPower,bySpace));
}
function stagedFitCount(id,s=state){
  const h=HARDWARE.find(x=>x.id===id);if(!h)return 0;
  const staged=Math.max(0,Math.floor(Number(s.inactiveHardware?.[id])||0));
  if(!staged)return 0;
  return Math.max(0,Math.min(staged,siteRackHeadroom(h,s)));
}
/* Why a staged batch is still standing in the crate, as a sentence, or "" when it is not. */
function stagedHoldReason(id,s=state){
  const h=HARDWARE.find(x=>x.id===id);if(!h)return "";
  const staged=Math.max(0,Math.floor(Number(s.inactiveHardware?.[id])||0));
  if(!staged||stagedFitCount(id,s)>=staged)return "";
  const fs=fleet(s),f=FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0];
  const shortKw=Math.max(0,(fs.potentialKw+staged*hardwarePeakWatts(h,s)/1000)-fs.cap);
  const shortSpace=Math.max(0,fs.space+staged*h.space-f.space);
  const parts=[];
  if(shortKw>0)parts.push(`${shortKw.toFixed(1)} kW more electrical capacity`);
  if(shortSpace>0)parts.push(`${fmtNum(Math.ceil(shortSpace))} more floor units`);
  return parts.length
    ?`Racking all ${fmtNum(staged)} would need ${parts.join(" and ")}. They stay in storage, cost nothing to hold, and go in on their own as capacity frees up.`
    :"";
}
function startCommissioning(id,qty,auto=false){
  const h=HARDWARE.find(x=>x.id===id);if(!h||qty<1)return false;
  const staged=Math.max(0,Math.floor(Number(state.inactiveHardware?.[id])||0));
  qty=Math.min(qty,staged);if(qty<1)return false;
  const days=Math.max(1,Math.ceil(qty/crewRatePerDay(COMMISSION_PER_DAY)));
  state.inactiveHardware[id]=staged-qty;
  const condition=state.stagedCondition?.[id];
  // A part-commissioned batch leaves the rest in the crate, and its history with it.
  if(state.stagedCondition&&state.inactiveHardware[id]<1)delete state.stagedCondition[id];
  state.commissioningJobs.push({id,qty,due:state.time+days*DAY,started:state.time,days,done:0,
    condition:Number.isFinite(condition)?condition:undefined});
  const held=state.inactiveHardware[id];
  log(`Commissioning started: ${h.name}`,`${qty} unit${qty===1?"":"s"} · ${days} day${days===1?"":"s"}${held?` · ${held} still in storage`:""}`,"fleet");
  showToast(auto?"Machines accepted onto the floor":"Machines being commissioned",
    `${qty} × ${h.name} is being racked, configured and tested over ${days} simulation day${days===1?"":"s"}.${held?` ${fmtNum(held)} more ${held===1?"stays":"stay"} in storage until there is room.`:""}`,
    "info","mine");
  renderFullQueued=true;
  return true;
}
function activateHardware(id){
  const h=HARDWARE.find(x=>x.id===id);if(!h)return;
  const staged=Math.max(0,Math.floor(Number(state.inactiveHardware?.[id])||0));
  if(staged<1)return;
  const qty=stagedFitCount(id);
  if(qty<1)return showToast("No room for these yet",stagedHoldReason(id)||`${h.name} does not fit the active site. Retire machines, sell cooling plant or move to a larger facility.`,"bad","mine");
  startCommissioning(id,qty);
  save();renderMineContent();
}
/* Anything staged that now fits goes in by itself, every simulated day. That covers the crate
   arriving into a site with room, and equally the room appearing later - a retirement
   finishing, a facility upgrade landing, cooling plant sold off. Nobody should have to come
   back and press a button to accept hardware they have already paid for. */
function advanceStagedIntake(){
  for(const h of HARDWARE){
    if(!(state.inactiveHardware?.[h.id]>0))continue;
    const qty=stagedFitCount(h.id);
    if(qty>0)startCommissioning(h.id,qty,true);
  }
}
/* RETIRING A FLEET IS WORK.

   Commissioning a delivery takes days - the crew racks it, configures it and tests it - and
   this project already made those machines come online gradually rather than all on the last
   day. Taking them out was instant: four thousand miners left the racks, the floor and the
   power budget between one frame and the next, which is not a thing that happens and, worse,
   made an emergency the same speed as a plan. An operator who needed capacity back could have
   it immediately; an operator caught by a price collapse paid no penalty for having left it
   late.

   So retirement is the same shape as commissioning, and deliberately a little faster: pulling
   a machine and putting it on a pallet is quicker than racking, cabling, configuring and
   testing one. Units leave the active fleet as the crew works through them, so hash rate,
   heat and floor space all come down over the same days rather than in one step, and a field
   technician crew makes it quicker exactly as it does on the way in. */
const RETIRE_PER_DAY=34;
function retirementDays(qty){
  return Math.max(1,Math.ceil(qty/crewRatePerDay(RETIRE_PER_DAY)));
}
function retiringCount(id,s=state){
  return (s.retirementJobs||[]).filter(job=>job.id===id).reduce((sum,job)=>sum+Math.max(0,Number(job.qty)-Number(job.done||0)),0);
}
function decommissionHardware(id,requested=1){
  const h=HARDWARE.find(x=>x.id===id),owned=state.hardware[id]||0;
  if(!h||h.permanent||owned<1)return;
  /* What is left to retire is what you own less what is already on a pallet. Capping on owned
     alone let the same fleet be booked twice: two jobs of 100 against 100 machines, the second
     pulling nothing because the first had already emptied the racks, then finishing anyway
     with "Retired 0" and a notice saying they were in storage. retiringCount existed to answer
     exactly this and was never called. */
  const spare=Math.max(0,owned-retiringCount(id));
  if(spare<1)return showToast("Already being retired",`Every ${h.name} you own is already on its way out of the racks. Wait until the unracking is finished before booking more.`,"info","mine");
  const qty=Math.min(spare,Math.max(1,Math.floor(Number(requested)||1)));
  const days=retirementDays(qty);
  state.retirementJobs.push({id,qty,done:0,started:state.time,due:state.time+days*DAY,days});
  log(`Retirement started: ${h.name}`,`${qty} unit${qty===1?"":"s"} · ${days} day${days===1?"":"s"} to unrack and palletise`,"fleet");
  showToast("Retirement underway",`${qty} × ${h.name} is being isolated, unracked and moved to storage over ${days} simulation day${days===1?"":"s"}. Capacity, heat and hash rate come back as ${rackingWho()} work through them.`,"info","mine");
  save();renderMineContent();
}
/* The crew works through the pallet at a steady rate, and what they have finished is out of
   the racks. Salvage is taken as each machine actually comes out rather than all at the end,
   for the same reason the hash rate falls gradually: it is the work that is being modelled. */
function advanceRetirements(){
  state.retirementJobs=(state.retirementJobs||[]).filter(job=>{
    const h=HARDWARE.find(x=>x.id===job.id);if(!h)return false;
    const total=Math.max(0,Math.floor(Number(job.qty)||0)),done=Math.max(0,Math.floor(Number(job.done)||0));
    if(!Number.isFinite(job.started))job.started=Math.min(state.time,job.due);
    const finished=dueBy(job,state.time);
    const span=Math.max(DAY,job.due-job.started);
    const pulled=finished?total:Math.min(total,Math.floor(total*Math.max(0,(state.time-job.started)/span)));
    const add=Math.min(Math.max(0,pulled-done),state.hardware[job.id]||0);
    if(add>0){
      state.hardware[job.id]=Math.max(0,(state.hardware[job.id]||0)-add);
      state.poweredDownHardware[job.id]=Math.min(state.poweredDownHardware[job.id]||0,state.hardware[job.id]);
      state.decommissionedHardware[job.id]=(state.decommissionedHardware[job.id]||0)+add;
      if(hasSkill("salvage")){
        const tier=fanTierFor(h);
        state.maintenance.inventory[tier]=(state.maintenance.inventory[tier]||0)+add;
      }
      job.done=done+add;
    }
    if(!finished)return true;
    log(`Retired ${job.done} × ${h.name}`,`Isolated from power and ready for resale${hasSkill("salvage")&&job.done?` · ${job.done} ${sparePart(fanTierFor(h))?.name||"fan"}${job.done===1?"":"s"} salvaged`:""}`,"fleet");
    showToast("Machines retired",`${job.done} × ${h.name} is in storage and ready to sell.`,"info","mine");
    renderFullQueued=true;
    return false;
  });
}
function setHardwarePower(id,powerOn,requested=1){
  const h=HARDWARE.find(x=>x.id===id),owned=state.hardware[id]||0;if(!h||owned<1)return;const paused=hardwarePoweredDownCount(h),qty=Math.max(1,Math.floor(Number(requested)||1));
  if(powerOn){const changed=Math.min(paused,qty);if(!changed)return;state.poweredDownHardware[id]=paused-changed;log(`Started ${changed} × ${h.name}`,`${state.poweredDownHardware[id]} remain manually off`,"fleet");showToast("Miners started",`${changed} × ${h.name} will add heat and hash rate while site power is available.`,"info","mine")}
  else{const repairing=Math.min(owned,Math.max(hardwareFaultCount(h),activeServiceJob(id)?.count||0)),available=Math.max(0,owned-paused-repairing),changed=Math.min(available,qty);if(!changed)return showToast("No running units",`Every available ${h.name} is already stopped or in repair.`);state.poweredDownHardware[id]=paused+changed;log(`Paused ${changed} × ${h.name}`,"Cooling load reduced without retiring hardware","fleet");showToast("Heat load reduced",`${changed} × ${h.name} is off. It earns nothing, draws no miner power and stops accumulating wear.`,"info","mine")}
  save();renderMineContent();
}
