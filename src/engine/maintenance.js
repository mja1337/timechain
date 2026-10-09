"use strict";

/* MAINTENANCE LAYER - spare parts, fault attribution, service jobs and the
   hands-on repair puzzles. Extracted from simulation.js to keep the engine
   inside the agreed module ceiling. Every binding here is a top-level
   function or const resolved at call time, so load order is not sensitive
   beyond running before the first render. */

function sparePart(id){return SPARE_PARTS.find(part=>part.id===id)}
const PART_FAULT_LABELS={laptopfan:"Laptop fan bearing wear",fan:"Fan bearing seizure",asicfan:"Blower fan bearing seizure",hashboardearly:"Hashboard chip failure",hashboard:"Hashboard chip failure",hashboardmodern:"Hashboard chip failure",powerPcb:"PSU/power PCB failure",coolantPump:"Coolant pump failure",coolingManifold:"Cooling manifold leak"};
function hardwareUsingPart(partId){
  /* A consumable is never a fault cause, so it appears in no machine's fault weights. It
     still fits everything whose repair would use it. */
  const def=sparePart(partId);
  if(def?.consumable){
    if(def.fits==="immersion")return HARDWARE.filter(h=>immersionEligible(h));
    return HARDWARE.filter(h=>Object.keys(partFaultWeights(h)).some(id=>REPASTE_PARTS.includes(id)));
  }
  return HARDWARE.filter(h=>Object.keys(partFaultWeights(h)).includes(partId));
}
/* One tube does a bench-full of boards, so this is a rounding-up per job rather than a
   per-unit charge. Deliberately NOT a requirement to start the job: the interesting decision
   is whether you keep a $12 consumable in stock, not whether the game blocks you. */
function repasteUnitsFor(h,job,repaired){
  const parts=job.part?[job.part]:Object.keys(serviceRequirements(h,repaired));
  if(!parts.some(id=>REPASTE_PARTS.includes(id)))return 0;
  return Math.max(1,Math.ceil(repaired/(hasSkill("thermalwork")?16:8)));
}
function consumeRepaste(units){
  if(!units)return{needed:0,used:0,short:0};
  const have=state.maintenance.inventory.thermalpaste||0,used=Math.min(have,units);
  state.maintenance.inventory.thermalpaste=have-used;
  return{needed:units,used,short:units-used};
}
function ownedHardwareUsingPart(partId){return hardwareUsingPart(partId).map(h=>({h,n:(state.hardware[h.id]||0)+(state.inactiveHardware?.[h.id]||0)})).filter(x=>x.n>0)}
function partFitSummary(partId){
  const owned=ownedHardwareUsingPart(partId);
  if(owned.length)return{fits:true,text:`Fits ${owned.map(x=>`${x.h.name} ×${x.n}`).join(" · ")}`};
  const all=hardwareUsingPart(partId);
  if(!all.length)return{fits:false,text:"No machine in the game uses this part"};
  const eras=[...new Set(all.map(h=>h.era))].join(", ");
  return{fits:false,text:`Nothing in your fleet uses this - it fits ${eras} hardware such as ${all[all.length-1].name}`};
}
function pickWeightedPart(weights){
  const entries=Object.entries(weights),total=entries.reduce((sum,[,w])=>sum+w,0)||1;
  let roll=nextRand()*total;
  for(const[part,weight]of entries){roll-=weight;if(roll<=0)return part}
  return entries[entries.length-1][0];
}
const REPAIR_STAGES=[
  {id:"powerdown",name:"Power down",weight:.05},
  {id:"disconnect",name:"Disconnect",weight:.10},
  {id:"work",name:"Work",weight:.50},
  {id:"reconnect",name:"Reconnect",weight:.10},
  {id:"fitup",name:"Fit & rack",weight:.10},
  {id:"stabilitycheck",name:"Stability check",weight:.15}
];
function shuffledPairSlots(pairs){const arr=[];for(let i=0;i<pairs;i++)arr.push(i,i);for(let i=arr.length-1;i>0;i--){const j=Math.floor(nextRand()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]]}return arr}
const REPAIR_COMPLICATIONS={
  powerdown:"Breaker interlock didn't isolate cleanly",
  disconnect:"Cabling was more tangled than expected",
  work:"Deeper damage than expected turned up",
  reconnect:"A re-seated connection came in loose",
  fitup:"The rack didn't want to line back up",
  stabilitycheck:"It failed the burn-in and needs another pass"
};
function serviceRequirements(h,count){
  const units=divisor=>Math.max(1,Math.ceil(count/divisor)),fanTier=fanTierFor(h),boardTier=hashboardTierFor(h);
  if(h.era==="HYDRO ASIC")return {[boardTier]:units(10),powerPcb:units(20),coolantPump:units(24),coolingManifold:units(16)};
  if(h.era==="ASIC")return {[fanTier]:units(12),[boardTier]:units(10),powerPcb:units(20)};
  if(h.era==="FPGA")return {[fanTier]:units(12),powerPcb:units(18)};
  if(h.era==="GPU")return {[fanTier]:units(8),powerPcb:units(15)};
  return {[fanTier]:units(10)};
}
function serviceRequirementText(requirements){return Object.entries(requirements).map(([id,qty])=>`${qty} ${sparePart(id)?.name||id}${qty===1?"":"s"}`).join(" · ")}
function hasServiceParts(requirements){return Object.entries(requirements).every(([id,qty])=>(state.maintenance.inventory[id]||0)>=qty)}
/* One more technician earns their place on a job for every this-many faulted units. */
const CREW_PER_FAULTS=25;
function servicePlan(h,count){
  const jobs=state.maintenance.serviceJobs||[],technicians=fieldTechnicianCount(),
    committed=jobs.reduce((sum,job)=>sum+(job.contracted?0:Number(job.crew||0)),0),
    available=Math.max(0,technicians-committed),
    selfBusy=jobs.some(job=>job.contracted),
    selfServiced=available<1,
    /* HOW MANY OF THEM CAN ACTUALLY WORK ON THIS.

       This was min(3, available), on the reasoning that you cannot usefully put more than three
       people on one hardware type. That reasoning holds for a rack of ten and collapses for a
       farm of forty-seven thousand: the extra technicians were meant to run CONCURRENT jobs on
       different hardware types, and an operation running one machine type at scale has no other
       type to send them to. A player hired twenty-five, watched three of them work, and carried
       a permanent backlog of three hundred while paying the other twenty-two $1,200 a month to
       stand still.

       The crew a job can absorb now scales with the size of the job - a bigger fault population
       is more rows to work in parallel, which is exactly what a real site does - bounded by how
       many technicians you actually employ. Small jobs are unchanged: below seventy-five faults
       this still comes out at three. */
    crew=selfServiced?(selfBusy?0:1):Math.max(1,Math.min(available,Math.max(3,Math.ceil(count/CREW_PER_FAULTS)))),
    complexity=h.era==="HYDRO ASIC"?2.2:h.era==="ASIC"?1.5:h.era==="GPU"?1.2:1,
    workDays=Math.max(1,Math.ceil(count*complexity/20)),
    days=crew?Math.max(1,Math.ceil(workDays/crew)):Infinity;
  return{technicians,committed,available,crew,workDays,days,contracted:selfServiced,selfBusy,contractorBusy:selfBusy};
}
function repairPuzzleRequired(job){return !!job&&!job.auto&&!!job.contracted&&!job.workDone}
/* THE JOB DECIDES THE PROCEDURE, not a die roll.

   The puzzle type was Math.floor(nextRand()*3): a fan fault might hand you a torque wrench and
   a power board might hand you cable pairs. That made the task decoration on top of the repair
   rather than part of it, and it taught nothing, because the thing you were doing had no
   relationship to the thing that was broken.

   A fan is a wiring job. A hashboard is seated and torqued down in a cross pattern. A power
   board and a coolant manifold are torqued to a spec. That is what those repairs are, so that
   is what the bench now asks for - and it means finishing one has taught the player something
   true about the part they just replaced. */
const REPAIR_PROCEDURES={
  laptopfan:1,fan:1,asicfan:1,coolantPump:1,
  hashboardearly:0,hashboard:0,hashboardmodern:0,
  powerPcb:2,coolingManifold:2
};
function repairProcedureFor(part){
  const proc=REPAIR_PROCEDURES[part];
  // No part means a recommissioning check rather than a component swap: torque to spec fits.
  return proc===undefined?2:proc;
}
/* TORQUE SPECS ARE A BAND, NOT A NUMBER.

   A fastener is tightened to "40 newton-metres, plus or minus two" - never to an exact integer
   nobody could hit. The dial used to demand the precise value, which turned a procedure into
   arithmetic with one correct answer and no reason to be careful. A band makes over-torquing
   the actual risk, which is the actual lesson. */
/* A GENUINE CROSS PATTERN, not a shuffle.

   Now that the sequence is printed and described as the manual's, it has to actually be one -
   a random permutation would have the game teach a technique that is not the technique. The
   rule for four fasteners is: any corner, then the one diagonally opposite it, then either of
   the remaining pair, then its opposite. Which corner you start at is the fitter's choice, so
   that part stays random; the shape does not.

   Corners are indexed 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right, so the diagonals
   are 0-3 and 1-2. */
function crossPattern(){
  const opposite={0:3,3:0,1:2,2:1};
  const first=Math.floor(nextRand()*4),second=opposite[first];
  const rest=[0,1,2,3].filter(i=>i!==first&&i!==second);
  const third=rest[Math.floor(nextRand()*rest.length)];
  return[first,second,third,opposite[third]];
}
const TORQUE_TOLERANCE=2;
function initRepairPuzzle(job){
  if(!job||job.puzzleType!==undefined)return false;
  if(job.selfAuto===undefined)job.selfAuto=nextRand()<selfAutoCompleteChance(HARDWARE.find(x=>x.id===job.id));
  if(job.selfAuto)return false;
  job.puzzleType=repairProcedureFor(job.part);job.oldRemoved=!job.part;
  if(job.puzzleType===0){
    /* A REAL CROSS PATTERN IS KNOWABLE. This was a hidden shuffle, so a "wrong mount" was a
       coin flip that could damage the machine - punishing the player for information they were
       never given. The sequence is now shown, the way a torque diagram is printed in a service
       manual, and getting it wrong is carelessness rather than bad luck. Bench skills hide the
       diagram, because by then you know it. */
    job.tapOrder=crossPattern();job.tapProgress=[];job.tapFromMemory=hasSkill("benchskills");
  }
  else if(job.puzzleType===1){
    /* Terminals carry the pair they belong to. Wiring is connecting like to like, not guessing
       which of six unlabelled dots happen to match. */
    job.cableSlots=shuffledPairSlots(3);job.cableLocked=[false,false,false,false,false,false];job.cableSelected=null;
  }
  else{
    job.dialTarget=20+Math.floor(nextRand()*61);job.dialTolerance=TORQUE_TOLERANCE;
    const offsets=[-16,-14,-12,-10,-8,8,10,12,14,16];job.dialValue=job.dialTarget+offsets[Math.floor(nextRand()*offsets.length)];
  }
  return true;
}
function advanceMaintenance(){
  state.maintenance.orders=state.maintenance.orders.filter(order=>{if(pendingAt(order,state.time))return true;const part=sparePart(order.type)||sparePart("fan");state.maintenance.inventory[part.id]=(state.maintenance.inventory[part.id]||0)+order.qty;log("Spare parts delivered",`+${order.qty} ${part.name}${order.qty===1?"":"s"}`);return false});
  state.maintenance.serviceJobs=state.maintenance.serviceJobs.filter(job=>{
    const h=HARDWARE.find(x=>x.id===job.id),legacy=!Number.isFinite(Number(job.stage));
    if(legacy){
      if(pendingAt(job,state.time))return true;
    }else{
      while(job.stage<REPAIR_STAGES.length&&job.stageDue<=state.time){
        const stage=REPAIR_STAGES[job.stage];
        if(stage.id==="work"&&!job.auto&&job.contracted&&!job.workDone){
          if(job.selfAuto){completeRepairWork(job,"Finished from practised familiarity - no set-up needed",true);continue}
          initRepairPuzzle(job);
          /* The repaint has to be asked for on ARRIVAL at the bench, not on whether the
             puzzle needed setting up here. Puzzle state is prepared when the job is created,
             so initRepairPuzzle() returns false by the time the job reaches this stage - and
             hanging the repaint off that return value meant the Mine tab was never told to
             redraw. The row sat on a stale "Power down · 1d left" and the puzzle never
             appeared, however long the clock ran. Once, on the transition, not every tick. */
          if(!job.handedOver){
            job.handedOver=true;
            renderFullQueued=true;
            const h2=HARDWARE.find(x=>x.id===job.id),what=job.part?sparePart(job.part)?.name||job.part:"refurbishment";
            log(`${h2?.name||job.id} is on your bench`,`${what} · the Work stage is waiting for you`,"fleet");
            showToast("The repair is waiting for you",`${h2?.name||job.id} has reached the Work stage. Open the Mine floor and finish the ${String(what).toLowerCase()} by hand - the clock will not move this job on without you.`,"info","mine");
          }
          break;
        }
        const complicationChance=Math.min(.6,.10*(job.contracted?1.3:1)*(hasSkill("fieldservice")?.5:1));
        if(nextRand()<complicationChance){
          const delay=(.5+nextRand())*DAY;
          job.stageDue+=delay;job.due+=delay;
          let note=REPAIR_COMPLICATIONS[stage.id];
          if(stage.id==="work"&&nextRand()<.3){
            const breakdown=hardwareFaultBreakdown(job.id),weights=partFaultWeights(h);
            let extra=pickWeightedPart(weights),tries=0;while((extra===job.part||breakdown[extra])&&tries<4){extra=pickWeightedPart(weights);tries++}
            const byPart=state.maintenance.faultsByPart[job.id]||(state.maintenance.faultsByPart[job.id]={});
            byPart[extra]=(byPart[extra]||0)+1;
            note=`Found a second fault - ${sparePart(extra)?.name||extra} also needs attention`;
            renderFullQueued=true;
          }
          const surcharge=Math.round((job.labor||0)*.15);
          if(surcharge>0&&state.cash>=surcharge){state.cash-=surcharge;note+=` · +${fmtUsd(surcharge)} callback fee`}
          log(`${h?.name||job.id} · ${stage.name} complication`,note,"fleet");
          showToast("Repair delayed",`${h?.name||job.id}: ${note}. Completion moves back ${(delay/DAY).toFixed(1)} day${delay/DAY>=1.05?"s":""}; review the job and any newly discovered fault.`,"bad","mine");
          renderFullQueued=true;
          break;
        }
        job.stage++;
        /* A STAGE CHANGE HAS TO ASK FOR THE REPAINT. The tick's ordinary repaint is
           refreshLive(), which patches text and never rebuilds the Mine tab - so a job could
           move Reconnect → Fit → Stability → done underneath a row that went on saying
           "Reconnect · 0d left" for as long as the clock ran. The engine was never stuck; the
           only thing frozen was the row describing it. Complications and the bench hand-over
           already asked for it, which is why those transitions looked fine and these did not. */
        renderFullQueued=true;
        if(job.stage<REPAIR_STAGES.length)job.stageDue=state.time+REPAIR_STAGES[job.stage].weight*(job.totalDays||1)*DAY;
      }
      if(job.stage<REPAIR_STAGES.length)return true;
    }
    // Same again for the job leaving the list entirely: the row has to stop being drawn.
    renderFullQueued=true;
    const repaired=Math.max(1,Number(job.count)||0);
    if(job.part){
      const byPart=state.maintenance.faultsByPart[job.id]||(state.maintenance.faultsByPart[job.id]={}),partName=sparePart(job.part)?.name||job.part;
      byPart[job.part]=0;
      const paste=consumeRepaste(repasteUnitsFor(h,job,repaired)),dry=paste.short>0;
      const boosted=Math.min(100,maintenanceCondition(h)+Math.max(6,20*repaired/Math.max(1,state.hardware[job.id]||1))*(dry?.5:1));
      state.maintenance.condition[job.id]=hardwareFaultCount(h)>0?boosted:Math.max(70,boosted);
      markDryFit(h,dry,paste);
      awardXp((12+6*Math.log2(1+repaired))*(job.contracted?1.5:1),"repair");log(`Service completed: ${h?.name||job.id}`,`${repaired} ${partName}${repaired===1?"":"s"} replaced · ${job.contracted?"serviced by you":`${job.crew}-technician crew`}`);
      const remaining=hardwareFaultCount(h);showToast("Part replacement complete",`${repaired} × ${h?.name||"miner"} ${partName.toLowerCase()} swap finished.${remaining?` ${remaining} other fault${remaining===1?" remains":"s remain"} to repair.`:" The serviced units can return to mining."}`,"info","mine");
    }else{
      state.maintenance.faultsByPart[job.id]={};
      const paste=consumeRepaste(repasteUnitsFor(h,job,repaired)),dry=paste.short>0;
      state.maintenance.condition[job.id]=Math.min(100,maintenanceCondition(h)+Math.max(18,60*repaired/Math.max(1,state.hardware[job.id]||1))*(dry?.5:1));
      markDryFit(h,dry,paste);
      awardXp((12+6*Math.log2(1+repaired))*(job.contracted?1.5:1),"repair");log(`Service completed: ${h?.name||job.id}`,`${repaired} unit${repaired===1?"":"s"} repaired · ${job.contracted?"serviced by you":`${job.crew}-technician crew`}`);
      showToast("Fleet service complete",`${repaired} × ${h?.name||"miner"} returned to service with restored condition. Check temperature and load before pushing the fleet again.`,"info","mine");
    }
    return false;
  });
  if(!thermalPowerAvailable())return;
  const technicians=fieldTechnicianCount(),wearFactor=(technicians?Math.max(.35,.6-.08*Math.min(2,technicians-1)-.02*Math.max(0,technicians-3)):1)*temperatureWearMultiplier(),failureHeat=temperatureFailureMultiplier();
  HARDWARE.forEach(h=>{
    const n=state.hardware[h.id]||0;if(!n||hardwareOfflineReason(h)!=="")return;
    const age=Math.max(0,(state.time-at(h.date))/DAY/365),condition=maintenanceCondition(h),active=hardwareRepairState(h).active;if(!active)return;
    /* Stable fluid temperature, no dust and no thermal cycling: the submerged share of a
       type ages and fails more slowly than the air-cooled share standing beside it. */
    const imm=immersionActive(h,active),airShare=(active-imm+imm*IMMERSION_WEAR)/Math.max(1,active);
    const wear=((h.era==="HYDRO ASIC"?.035:.018)+Math.min(.04,age*.002))*wearFactor*(active/n)*(state.overdrive?1.6:1)*airShare;
    state.maintenance.condition[h.id]=Math.max(0,condition-wear);
    const exposed=active-imm+imm*IMMERSION_FAULT;
    const base=h.era==="HYDRO ASIC"?.00075:h.era==="ASIC"?.00045:h.era==="GPU"?.000325:.000175,stress=(1+(100-condition)/55+age*.12)*failureHeat*(state.overdrive?2.2:1)*dryFitFailureFactor(h),failures=Math.min(active,poisson(exposed*base*stress*(technicians?0.72:1)));
    if(failures){
      const weights=immersionAdjustedWeights(h,partFaultWeights(h)),byPart=state.maintenance.faultsByPart[h.id]||(state.maintenance.faultsByPart[h.id]={}),gained={};
      for(let i=0;i<failures;i++){const part=pickWeightedPart(weights);byPart[part]=(byPart[part]||0)+1;gained[part]=(gained[part]||0)+1}
      const detail=Object.entries(gained).map(([part,count])=>`${count}× ${PART_FAULT_LABELS[part]||sparePart(part)?.name||part}`).join(" · ");
      log(`${h.name} fault detected`,`${detail} · ${roomTemperatureC().toFixed(0)} °C room`,`fleet`);
      showToast("Mining capacity lost to a fault",`${detail} failed on ${h.name} at ${roomTemperatureC().toFixed(0)} °C. Affected units stopped hashing; cool the room and schedule the named part replacement in Mine.`,"bad","mine");
      renderFullQueued=true;
    }
  });
  HARDWARE.forEach(h=>{
    const existingFaults=hardwareFaultCount(h);
    if(!existingFaults||activeServiceJob(h.id))return;
    if(nextRand()<Math.min(.25,existingFaults*.02)*(hasSkill("diagnostics")?.5:1)){
      const breakdown=hardwareFaultBreakdown(h),weights=immersionAdjustedWeights(h,partFaultWeights(h));
      let extra=pickWeightedPart(weights),tries=0;while(breakdown[extra]&&tries<4){extra=pickWeightedPart(weights);tries++}
      const byPart=state.maintenance.faultsByPart[h.id]||(state.maintenance.faultsByPart[h.id]={});
      byPart[extra]=(byPart[extra]||0)+1;
      log(`${h.name} fault spreading`,`Ignored damage reaches ${PART_FAULT_LABELS[extra]||sparePart(extra)?.name||extra}`,"fleet");
      showToast("An unrepaired fault spread",`${h.name} now also needs ${sparePart(extra)?.name||extra}. More capacity is offline and the new part must be added to the repair plan.`,"bad","mine");
      renderFullQueued=true;
    }
  });
  if(state.autoRepair&&fieldTechnicianCount()>0)HARDWARE.forEach(h=>{
    if(!(state.hardware[h.id]>0)||activeServiceJob(h.id))return;
    const count=state.hardware[h.id],condition=maintenanceCondition(h);
    if(condition<65){
      const plan=servicePlan(h,count),requirements=serviceRequirements(h,count),labor=Math.max(40,h.cost*.008*count);
      if(plan.crew&&!plan.contracted&&hasServiceParts(requirements)&&state.cash>=labor){serviceHardware(h.id,true);return}
    }
    const breakdown=hardwareFaultBreakdown(h),candidates=Object.entries(breakdown).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]);
    for(const[part,faulted]of candidates){
      const requirements={[part]:Math.max(1,Math.ceil(faulted/7))};if(!hasServiceParts(requirements))continue;
      const plan=servicePlan(h,faulted);if(!plan.crew||plan.contracted)continue;
      const labor=Math.max(25,h.cost*.004*faulted);if(state.cash<labor)continue;
      serviceHardwarePart(h.id,part,true);
      return;
    }
  });
}
/* Moved here from the Mine tab when a materials planner needed the same figures. Two
   descriptions of "what is this fleet short of" would drift the way the purchase limits did,
   and the one that drifts is always the one nobody is looking at. */
/* WHAT THE BENCH IS WAITING FOR.

   The fleet view told you a part was missing only at the moment you tried to use it: the
   fault row swapped its Replace button for an Order button and said nothing about how short
   you were, whether a delivery was already coming, or when. So an operator with three faults
   and two inbound orders had to open the parts catalogue and do the arithmetic by hand.

   This gathers both halves - what the current faults will consume, and what is already on
   its way - and states them once, at the top, with the shortfall as a number. */
function partsOutlook(){
  const need={};
  HARDWARE.filter(h=>(state.hardware[h.id]||0)>0).forEach(h=>{
    const n=state.hardware[h.id],breakdown=hardwareFaultBreakdown(h);
    Object.entries(breakdown).forEach(([part,count])=>{
      if(count>0)need[part]=(need[part]||0)+Math.max(1,Math.ceil(count/7));
    });
    // A machine under the offline threshold needs the whole refurbishment kit, not one part.
    if(maintenanceCondition(h)<65){
      const required=serviceRequirements(h,n);
      Object.entries(required).forEach(([part,qty])=>{need[part]=Math.max(need[part]||0,qty)});
    }
  });
  /* Reseating a hashboard consumes interface compound, so a fleet with board faults and no
     thermal paste is short of something it does not yet know it needs. */
  if(Object.keys(need).some(id=>REPASTE_PARTS.includes(id)))need.thermalpaste=Math.max(need.thermalpaste||0,1);
  const orders={};
  for(const order of (state.maintenance.orders||[])){
    const id=order.type||"fan";
    if(!orders[id])orders[id]={qty:0,due:Infinity};
    orders[id].qty+=Number(order.qty)||0;
    orders[id].due=Math.min(orders[id].due,order.due);
  }
  const short=[],inbound=[];
  for(const part of SPARE_PARTS){
    const have=state.maintenance.inventory[part.id]||0,want=need[part.id]||0,order=orders[part.id];
    if(want>have)short.push({id:part.id,name:part.name,need:want,have,missing:want-have,
      onOrder:order?order.qty:0,due:order?order.due:null,covered:order?order.qty>=want-have:false});
    if(order)inbound.push({id:part.id,name:part.name,qty:order.qty,due:order.due});
  }
  return{short,inbound};
}
function orderParts(type,qty=1){
  const part=sparePart(type);if(!part)return;qty=Math.max(1,Math.floor(Number(qty)||1));const unit=sparePartCost(part),cost=qty*unit,lead=partsLeadDays();
  if(state.cash<cost)return showToast("Not enough cash",`${qty} ${part.name}${qty===1?"":"s"} cost ${fmtUsd(cost)}.`);
  state.cash-=cost;state.maintenance.orders.push({type:part.id,qty,due:state.time+lead*DAY});log("Spare parts ordered",`${qty} ${part.name}${qty===1?"":"s"} · -${fmtUsd(cost)} · ${lead} days`);save();renderMineContent();
}
/* WHY A SERVICE CANNOT START, as a sentence, or "" when it can.

   Both service actions refused in five places and the buttons that launch them checked three
   of them. The gap that mattered was the crew: with no technicians on the payroll you are the
   crew, you can only be on one bench at a time, and every OTHER machine's Refurbish and
   Replace button stayed enabled with an empty tooltip. Clicking one did nothing at all - the
   action raised "You are already on a job" and the button had given no hint it would.

   One function, used by both buttons and both actions, so they cannot drift again. */
function serviceBlockReason(h,part=null,s=state){
  if(!h)return "That machine does not exist.";
  const count=s.hardware?.[h.id]||0;
  if(!count)return `No ${h.name} units are installed.`;
  if(activeServiceJob(h.id,s))return `${h.name} is already in the maintenance bay.`;
  const faults=hardwareFaultCount(h,s);
  let repairCount;
  if(part){
    const faulted=hardwareFaultBreakdown(h,s)[part]||0;
    if(!faulted)return `No ${sparePart(part)?.name?.toLowerCase()||part} faults are currently reported on ${h.name}.`;
    repairCount=faulted;
  }else{
    const condition=maintenanceCondition(h,s);
    if(condition>=95&&!faults)return `${h.name} is at ${condition.toFixed(0)}% condition with no failed units.`;
    repairCount=condition<65?count:Math.max(faults,Math.ceil(count*.15));
  }
  const plan=servicePlan(h,repairCount);
  if(!plan.crew)return plan.technicians
    ?`All ${plan.technicians} technician${plan.technicians===1?" is":"s are"} committed to other jobs.`
    :"You can only work one repair at a time yourself, and you are already on one.";
  const requirements=part?{[part]:Math.max(1,Math.ceil(repairCount/7))}:serviceRequirements(h,repairCount);
  if(!hasServiceParts(requirements))return `This needs ${serviceRequirementText(requirements)}; order the missing components first.`;
  return "";
}
function serviceHardware(id,auto=false){
  const h=HARDWARE.find(x=>x.id===id),count=state.hardware[id]||0;if(!h||!count)return;
  if(activeServiceJob(id))return showToast("Service already scheduled",`${h.name} is already in the maintenance bay.`);
  const condition=maintenanceCondition(h),faults=hardwareFaultCount(h);if(condition>=95&&!faults)return showToast("Service not needed",`${h.name} is at ${condition.toFixed(0)}% condition with no failed units.`);
  const repairCount=condition<65?count:Math.max(faults,Math.ceil(count*.15)),requirements=serviceRequirements(h,repairCount),plan=servicePlan(h,repairCount),labor=plan.contracted?0:Math.max(40,h.cost*.008*repairCount);
  if(!plan.crew)return showToast("You are already on a job",`You can only work one repair at a time yourself.${plan.technicians?` All ${plan.technicians} technician${plan.technicians===1?" is":"s are"} busy on other jobs.`:""} Finish the job on your bench, or hire another field technician to run repairs in parallel.`);
  if(!hasServiceParts(requirements))return showToast("Parts required",`Service needs ${serviceRequirementText(requirements)}; order the missing components first.`);
  if(state.cash<labor)return showToast("Not enough cash",`Service labour costs ${fmtUsd(labor)}.`);
  state.cash-=labor;Object.entries(requirements).forEach(([part,qty])=>state.maintenance.inventory[part]-=qty);state.maintenance.serviceJobs.push({id,count:repairCount,due:state.time+plan.days*DAY,crew:plan.crew,contracted:plan.contracted,labor,totalDays:plan.days,stage:0,stageDue:state.time+REPAIR_STAGES[0].weight*plan.days*DAY,auto});if(repairPuzzleRequired(state.maintenance.serviceJobs[state.maintenance.serviceJobs.length-1]))initRepairPuzzle(state.maintenance.serviceJobs[state.maintenance.serviceJobs.length-1]);log(`Service started: ${h.name}`,`${repairCount} units · ${plan.days} days · ${fmtUsd(labor)}`);showToast(auto?"Auto-repair started":"Service scheduled",`${repairCount} × ${h.name} is offline for ${plan.days} simulation day${plan.days===1?"":"s"}. ${plan.contracted?"You are doing this one yourself - the Work stage waits for you on the Mine floor.":auto?"Your technician crew is handling it automatically.":`${plan.crew} of ${plan.technicians} technicians assigned.`}`,"info","mine");save();renderMineContent();
}
function serviceHardwarePart(id,part,auto=false){
  const h=HARDWARE.find(x=>x.id===id),count=state.hardware[id]||0,partDef=sparePart(part);if(!h||!count||!partDef)return;
  if(activeServiceJob(id))return showToast("Service already scheduled",`${h.name} is already in the maintenance bay.`);
  const faulted=hardwareFaultBreakdown(h)[part]||0;if(!faulted)return showToast("Service not needed",`No ${partDef.name.toLowerCase()} faults are currently reported on ${h.name}.`);
  const requirements={[part]:Math.max(1,Math.ceil(faulted/7))},plan=servicePlan(h,faulted),labor=plan.contracted?0:Math.max(25,h.cost*.004*faulted);
  if(!plan.crew)return showToast("You are already on a job",`You can only work one repair at a time yourself.${plan.technicians?` All ${plan.technicians} technician${plan.technicians===1?" is":"s are"} busy on other jobs.`:""} Finish the job on your bench, or hire another field technician to run repairs in parallel.`);
  if(!hasServiceParts(requirements))return showToast("Parts required",`Replacing ${partDef.name.toLowerCase()}s needs ${serviceRequirementText(requirements)}; order the missing components first.`);
  if(state.cash<labor)return showToast("Not enough cash",`Targeted service labour costs ${fmtUsd(labor)}.`);
  state.cash-=labor;Object.entries(requirements).forEach(([p,qty])=>state.maintenance.inventory[p]-=qty);
  state.maintenance.serviceJobs.push({id,count:faulted,part,due:state.time+plan.days*DAY,crew:plan.crew,contracted:plan.contracted,labor,totalDays:plan.days,stage:0,stageDue:state.time+REPAIR_STAGES[0].weight*plan.days*DAY,auto});if(repairPuzzleRequired(state.maintenance.serviceJobs[state.maintenance.serviceJobs.length-1]))initRepairPuzzle(state.maintenance.serviceJobs[state.maintenance.serviceJobs.length-1]);
  log(`Service started: ${h.name}`,`${faulted} × ${partDef.name} · ${plan.days} day${plan.days===1?"":"s"} · ${fmtUsd(labor)}`);
  showToast(auto?"Auto-repair started":"Service scheduled",`${faulted} × ${partDef.name} swap on ${h.name}, ${plan.days} simulation day${plan.days===1?"":"s"}. ${plan.contracted?"You are doing this one yourself - the Work stage waits for you on the Mine floor.":auto?`Your technician crew is handling it automatically.`:`${plan.crew} of ${plan.technicians} technicians assigned.`}`,"info","mine");
  save();renderMineContent();
}
function repairRemoveOldPart(id){
  const job=activeServiceJob(id);if(!job||!job.part||job.auto||job.oldRemoved)return;
  const h=HARDWARE.find(x=>x.id===id),partDef=sparePart(job.part);
  job.oldRemoved=true;
  showToast("Old part pulled",`${partDef?.name||job.part} removed from ${h?.name||id}. Fit the replacement to finish the job.`,"info","mine");
  save();renderMineContent();
}
function selfRepairMistake(job,message){
  const h=HARDWARE.find(x=>x.id===job.id);job.mistakes=(job.mistakes||0)+1;
  if(!job.contracted||nextRand()>=selfDamageChance(h))return showToast("Out of sequence",message,"bad","mine");
  const drop=3+nextRand()*5,units=Math.max(1,state.hardware[job.id]||1),breakdown=hardwareFaultBreakdown(h),outstanding=Object.values(breakdown).reduce((sum,c)=>sum+c,0);
  state.maintenance.condition[job.id]=Math.max(0,maintenanceCondition(h)-drop);
  let collateral=null;
  if(outstanding<units&&nextRand()<.4){
    const weights=partFaultWeights(h);let extra=pickWeightedPart(weights),tries=0;
    while(extra===job.part&&tries<5){extra=pickWeightedPart(weights);tries++}
    if(extra!==job.part){const byPart=state.maintenance.faultsByPart[job.id]||(state.maintenance.faultsByPart[job.id]={});byPart[extra]=(byPart[extra]||0)+1;collateral=sparePart(extra)?.name||extra}
  }
  log(`${h?.name||job.id} damaged during self-service`,`${collateral?`${collateral} broken · `:""}condition -${drop.toFixed(1)}%${hasSkill("benchskills")?"":" · bench repair skills would cut this risk"}`,"fleet");
  showToast("The self-repair caused damage",`${message} ${collateral?`A ${collateral.toLowerCase()} also broke and is now a separate fault.`:`Machine condition fell ${drop.toFixed(1)}%.`} The current repair remains on your bench.`,"bad","mine");
  renderFullQueued=true;
}
function completeRepairWork(job,successNote,duringTick=false){
  const h=HARDWARE.find(x=>x.id===job.id),partDef=sparePart(job.part),label=job.part?(partDef?.name||job.part):null;
  if(job.contracted){const store=state.maintenance.selfRepairs||(state.maintenance.selfRepairs={});store[job.id]=selfRepairExperience(job.id)+1}
  job.workDone=true;job.stage++;
  if(job.stage<REPAIR_STAGES.length)job.stageDue=state.time+REPAIR_STAGES[job.stage].weight*(job.totalDays||1)*DAY;
  log(`${h?.name||job.id} · ${label?"part seated":"recommissioning check passed"}`,successNote,"fleet");
  showToast(label?"Part seated":"Recommissioning check passed",label?`${label} is fitted correctly on ${h?.name||job.id}. Reconnecting.`:`${h?.name||job.id} passed its final recommissioning check. Reconnecting.`,"info","mine");
  if(duringTick){renderFullQueued=true;return}
  save();renderMineContent();
}
function repairTapSlot(id,slot){
  const job=activeServiceJob(id);slot=Number(slot);if(!job||job.auto||!job.oldRemoved||job.workDone||job.puzzleType!==0||!Array.isArray(job.tapOrder))return;
  job.tapProgress=Array.isArray(job.tapProgress)?job.tapProgress:[];
  const pos=job.tapProgress.length;
  if(job.tapOrder[pos]===slot){
    job.tapProgress.push(slot);
    if(job.tapProgress.length>=job.tapOrder.length)return completeRepairWork(job,"Torqued down in the correct cross pattern");
  }else{
    job.tapProgress=[];
    selfRepairMistake(job,`Wrong mounting point - the ${job.part?sparePart(job.part)?.name?.toLowerCase()||"part":"unit"} shifted.`);
  }
  save();renderMineContent();
}
function repairCableClick(id,slot){
  const job=activeServiceJob(id);slot=Number(slot);if(!job||job.auto||!job.oldRemoved||job.workDone||job.puzzleType!==1||!Array.isArray(job.cableSlots))return;
  if(job.cableLocked[slot])return;
  if(job.cableSelected===null||job.cableSelected===undefined){job.cableSelected=slot;save();renderMineContent();return}
  if(job.cableSelected===slot){job.cableSelected=null;save();renderMineContent();return}
  if(job.cableSlots[job.cableSelected]===job.cableSlots[slot]){
    job.cableLocked[job.cableSelected]=true;job.cableLocked[slot]=true;job.cableSelected=null;
    if(job.cableLocked.every(Boolean))return completeRepairWork(job,"Every cable pair reconnected to its matching terminal");
  }else{
    job.cableSelected=null;
    selfRepairMistake(job,"That pair doesn't match - the connectors don't seat.");
  }
  save();renderMineContent();
}
function repairNudgeDial(id,delta){
  const job=activeServiceJob(id);delta=Number(delta);if(!job||job.auto||!job.oldRemoved||job.workDone||job.puzzleType!==2||!Number.isFinite(job.dialValue))return;
  const tol=Math.max(1,Number(job.dialTolerance)||TORQUE_TOLERANCE);
  job.dialValue+=delta;
  const off=job.dialValue-job.dialTarget;
  if(Math.abs(off)<=tol)return completeRepairWork(job,`Torqued to ${job.dialTarget} ±${tol} Nm`);
  /* Only going PAST the band is a mistake. Approaching it from either side is just work, and a
     wrench that punished you for the direction you happened to start from was punishing you for
     the roll that set up the puzzle. */
  if(off>tol&&delta>0)selfRepairMistake(job,`Over-torqued past ${job.dialTarget+tol} Nm.`);
  else if(off<-tol&&delta<0)selfRepairMistake(job,"Backed the fastener off below spec.");
  save();renderMineContent();
}
/* A board that went back on dry still goes back on: the machine returns to service, because
   soft-locking a fleet over a missing twelve-dollar tube would be a worse game than it is a
   simulation. What it does not do is last. The chip runs hot against degraded compound, so
   the type carries an elevated failure rate for the next two months and you meet the same
   fault again - which is exactly what skipping the paste buys you in a real bay.

   Completing the job WITH paste clears the mark, so the fix is the obvious one. */
const DRY_FIT_DAYS=60;
const DRY_FIT_FAILURE=1.8;
function markDryFit(h,dry,paste){
  if(!h)return;
  const store=state.maintenance.dryFit||(state.maintenance.dryFit={});
  if(!dry){if(store[h.id]){delete store[h.id];}return}
  store[h.id]=state.time+DRY_FIT_DAYS*DAY;
  log(`${h.name} boards dry-fitted`,`${paste.short} tube${paste.short===1?"":"s"} of thermal paste short - heatsinks reseated on degraded compound · half the condition recovery lost · ${DRY_FIT_FAILURE}× failure rate for ${DRY_FIT_DAYS} days`,"fleet");
  showToast("Refitted without thermal paste",`There was no thermal paste in stock, so ${h.name} heatsinks went back on the old compound. The boards recovered half the condition they should have and will fail roughly ${DRY_FIT_FAILURE}× as often for the next ${DRY_FIT_DAYS} days. A tube costs ${fmtUsd(sparePartCost("thermalpaste"))}.`,"bad","mine");
  renderFullQueued=true;
}
function dryFitActive(h,s=state){return !!h&&(s.maintenance?.dryFit?.[h.id]||0)>s.time}
function dryFitFailureFactor(h,s=state){
  if(!dryFitActive(h,s))return 1;
  // Knowing how to seat a heatsink does not make old compound good, but it helps.
  return s.skills?.includes("thermalwork")?1.4:DRY_FIT_FAILURE;
}
function sparePartCost(part){const def=typeof part==="string"?sparePart(part):part;return (def?.cost||0)*(covidPartsMarket()?2.25:1)*(hasSkill("partssourcing")?.8:1)*(hasStaff("mrplead")?.92:1)}

/* MATERIALS PLANNING.

   Keeping a shelf stocked is the one job on this site that is pure administration: work out
   what the fleet will need, check what is already coming, raise the difference. It is also
   the job most likely to be forgotten until a repair is standing idle waiting for a twelve
   dollar tube of paste, which is exactly the kind of tedium worth paying somebody to carry.

   The controller covers consumables - the parts a fleet gets through constantly. The lead
   plans the whole bill of materials and orders to a buffer, so stock arrives before the
   shortfall rather than after it.

   Runs monthly, not daily: a planner raises purchase orders on a cycle, and reordering every
   simulated day would bury the ledger and buy in uselessly small lots. */
const PLANNER_CONSUMABLES=["thermalpaste","laptopfan","fan","asicfan"];
function materialsPlannerTier(s=state){
  if(hasStaff("mrplead"))return "full";
  if(hasStaff("inventorycontroller"))return "consumables";
  return null;
}
/* What the planner will raise this cycle: the shortfall, less what is already inbound, plus
   a buffer if somebody is paid to think a month ahead. */
function plannedPartOrders(){
  const tier=materialsPlannerTier();
  if(!tier)return [];
  const {short}=partsOutlook();
  const orders=[];
  for(const row of short){
    if(tier==="consumables"&&!PLANNER_CONSUMABLES.includes(row.id))continue;
    const buffer=tier==="full"?Math.ceil(row.need*.5):0;
    const qty=Math.max(0,row.missing+buffer-row.onOrder);
    if(qty>0)orders.push({id:row.id,qty});
  }
  return orders;
}
function advanceMaterialsPlanning(t=state.time){
  const tier=materialsPlannerTier();
  if(!tier)return;
  const store=state.planning||(state.planning={month:""});
  const month=new Date(t).toISOString().slice(0,7);
  if(store.month===month)return;
  store.month=month;
  const orders=plannedPartOrders();
  if(!orders.length)return;
  let spent=0,lines=0;
  /* A planner does not spend the money earmarked for the electricity bill. Whatever has
     already accrued toward this month's settlement is off limits, so a well-stocked shelf can
     never be the reason the grid gets cut. */
  const reserved=Math.max(0,Number(state.bill)||0)+Math.max(0,Number(state.debt)||0);
  for(const order of orders){
    const unit=sparePartCost(order.id),cost=unit*order.qty;
    if(cost>state.cash-reserved)continue;
    state.cash-=cost;spent+=cost;lines++;
    state.maintenance.orders.push({type:order.id,qty:order.qty,due:t+partsLeadDays()*DAY});
  }
  if(!lines)return;
  const who=tier==="full"?"MRP lead":"Inventory controller";
  log(`${who} raised ${lines} purchase order${lines===1?"":"s"}`,
    `${orders.slice(0,3).map(o=>`${o.qty}× ${sparePart(o.id)?.name||o.id}`).join(" · ")}${orders.length>3?` · +${orders.length-3} more`:""} · ${fmtUsd(spent)}`,"fleet");
  renderFullQueued=true;
}
function partsLeadDays(){return Math.max(3,Math.round((covidPartsMarket()?42:14)*(hasSkill("supplychain")?.6:1)))}
function selfRepairExperience(id){return Math.max(0,Math.floor(Number(state.maintenance.selfRepairs?.[id])||0))}
function selfDamageChance(h){if(!h)return 0;return Math.max(.02,.4*Math.pow(.72,selfRepairExperience(h.id))*(hasSkill("benchskills")?.4:1))}
function selfAutoCompleteChance(h){if(!h||!hasSkill("practisedhands"))return 0;return Math.min(.85,.2+.13*selfRepairExperience(h.id))}
