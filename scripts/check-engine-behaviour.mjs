/* BEHAVIOURAL CONTRACTS - these run the engine and assert what it DOES.

   The other suite matches source text, which is fast and catches a great deal, but it pins
   the implementation rather than the rule: three checks broke during one refactoring session
   while the behaviour they guarded was perfectly intact, because a function had been renamed
   or an expression had moved. Everything asserted here would survive any such move and fail
   only if the game's economics actually changed. Prefer adding rules here over adding another
   source match whenever a check is about what the simulation does rather than how it reads. */

import fs from "node:fs";
import { loadEngine, makeEval } from "./engine-harness.mjs";

/* Loading a save runs the migration in simulation.js, which is parsed before maintenance.js.
   Anything that migration calls therefore has to be declared in a file that loads earlier -
   a rule that is invisible until someone opens a save old enough to take the branch. A save
   carrying legacy fault counts did exactly that: the migration called partFaultWeights(),
   which lived in maintenance.js, and the ReferenceError aborted the rest of simulation.js,
   leaving every const below that point uninitialised and the whole app dead on load. */
function loadWithSave(save) {
  try { return { ok: true, sandbox: loadEngine(save) }; }
  catch (error) { return { ok: false, message: error.message }; }
}

const ev = makeEval(loadEngine());
const run = expr => ev(expr);
const json = expr => JSON.parse(ev(`JSON.stringify(${expr})`));

let checked = 0;
const failures = [];
function rule(name, fn) {
  checked += 1;
  try { fn(); } catch (error) { failures.push(`${name}: ${error.message}`); }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function close(actual, expected, tolerance, message) {
  assert(Math.abs(actual - expected) <= tolerance, `${message} (got ${actual}, wanted ${expected}±${tolerance})`);
}

/* A standard site, so each rule states only what it is actually varying. */
const SITE = (overrides = "") => `
  state.started=true;state.skills=[];state.staff=[];state.insured=false;state.overdrive=false;
  state.ended=false;state.endReason=null;state.endDismissed=true;state.activeEvent=null;state.storyPause=false;
  state.mode="pool";state.pool="foundry";state.connectivity="fixed";state.contract="spot";
  state.node=0;state.cash=1e9;state.debt=0;state.power=true;state.policyLock=null;
  // A rule that ends on an unpaid bill must not stop the clock for every rule after it.
  state.pendingSettlement=null;state.settlementSaleMode=false;
  // And a policy bought in one rule must not be cancelled, or paid out, by the next.
  state.coinCover=null;state.securedLoan=null;state.projectLoan=0;
  /* And the engine's own random stream, which initialState() seeds from Math.random(). Without
     this every rule ran against a different world each time the suite was invoked, and any rule
     that ticks long enough became a coin flip: the racking rule failed once with three machines
     "missing" and then passed six runs in a row, which is the worst possible way for a suite to
     behave - it teaches you to re-run rather than to look. A rule that wants a different draw
     overrides this after SITE(), deliberately and visibly. */
  state.seed=20260909;state.rng=20260909;
  /* Wallets, fleet and the activity feed. SITE resets forty fields including several obscure
     ones and missed the three most obvious, because rules always set hardware and wallets
     themselves - but they set them by REPLACING the object, which drops every key they do not
     mention. A rule writing state.wallets={hot:0,cold:0,exchange:0} deletes mtgox, bitfinex,
     quadriga, frontier and etf for every rule after it, and the next rule to read one of those
     venues gets undefined instead of zero. Rebuilt from initialState() so the shape is the
     engine's own, not a list here that can drift from it. */
  const __siteFresh=initialState();
  state.wallets={...__siteFresh.wallets};state.hardware={...__siteFresh.hardware};
  state.activity=[];state.log=[];state.activitySeq=0;
  state.hardwareGlut=null;state.marketPressure={usd:0,at:0};
  state.ops={firmwarePatchedUntil:1e15,hijackUntil:0,outageUntil:0,powerOutageUntil:0,venueFreezes:{},riskMonth:""};
  state.thermal={temperature:22,orders:[],equipment:{}};
  state.maintenance={condition:{},faults:{},faultsByPart:{},selfRepairs:{},dryFit:{},parts:0,
    inventory:state.maintenance.inventory,orders:[],serviceJobs:[]};
  state.immersion={};
  /* Site and region are part of the standard site, not inherited from whatever ran last:
     facility tier feeds connectivity risk, power capacity and rent, so a rule that moved site
     used to quietly change the baseline for every rule after it. */
  state.facility="home";state.region="na";state.facilityUpgradeJob=null;state.relocationJob=null;
  /* And neither is history. These accumulate across rules and change how a tick behaves:
     an event already marked seen does not fire again, an alert already queued does not queue,
     and both change how many draws a day takes from the random stream. A rule that ticks for
     years therefore used to move the sample every rule after it saw - which is how a
     connectivity rule started failing because a payout rule was added above it. */
  /* Cumulative counters are the same hazard: state.mined and state.blocks carry across rules,
     so a rule guarding on "did this run earn anything" could be answered by a previous rule's
     earnings and then assert against its own empty wallet. */
  state.mined=0;state.blocks=0;
  state.seen=[];state.hardwareAlerts={seen:[],queue:[],active:null,resumeSpeed:0};
  state.secondary={stock:{},month:""};state.pendingLosses=[];state.lossResume=false;
  /* The physical fleet lifecycle resets too. These arrived late and SITE did not learn them,
     so rules cleared them by hand and whoever forgot inherited the last rule's crates: a
     stalled commissioning job would go on landing machines into the next rule's site, take it
     over capacity, and fail an assertion about something else entirely. Contamination that
     only appears under a mutant is worse than a bug, because it makes every result suspect. */
  state.commissioningJobs=[];state.procurementOrders=[];state.retirementJobs=[];
  state.inactiveHardware={};state.poweredDownHardware={};state.decommissionedHardware={};
  state.stagedCondition={};
  state.poolAccount={balance:0,frozen:0,threshold:.01,destination:"hot",paidTotal:0,feesPaid:0,payouts:0,lastPayout:0};
  ${overrides}`;

/* ---- WHAT THE TICK CHANGES, THE TICK HAS TO REDRAW ---- */

rule("a tick that changes the shape of a tab asks for the rebuild", () => {
  /* The tick's ordinary repaint is refreshLive(), which patches text and never rebuilds a tab.
     Only renderFullQueued makes it call renderMineContent(). Anything structural that forgets
     to raise it is drawn once and then frozen - which is how a repair row sat on "Reconnect ·
     0d left" while the job finished underneath it.

     Each advance is driven ON ITS OWN here, not through tick(): faults raise the flag most
     days, so a tick-level probe reports every one of these as fine while they are not. */
  const r = json(`(()=>{
    const base=()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";state.region="texas";
      state.maintenance.serviceJobs=[];state.maintenance.orders=[];
      state.commissioningJobs=[];state.procurementOrders=[];state.inactiveHardware={};`)}};
    const out=[];
    const probe=(label,setup,run,read)=>{
      base();setup();
      renderFullQueued=false;
      const before=JSON.stringify(read());
      state.time+=DAY;run();
      out.push({label,changed:JSON.stringify(read())!==before,asked:renderFullQueued===true});
    };
    probe("cooling install lands",
      ()=>{state.hardware={s9:50};state.thermal={temperature:22,orders:[{id:"axial",qty:1,due:state.time+DAY,cost:0}],equipment:{}}},
      ()=>advanceCoolingInstalls(),()=>state.thermal.equipment);
    probe("pool payout lands",
      ()=>{state.wallets.hot=0;state.poolAccount={balance:.5,frozen:0,threshold:.01,destination:"hot",paidTotal:0,feesPaid:0,payouts:0,lastPayout:0}},
      ()=>advancePoolPayouts(),()=>state.poolAccount.payouts);
    probe("second-hand listings refresh",
      ()=>{state.time=at("2019-06-01");state.secondary={stock:{},month:""}},
      ()=>advanceSecondaryMarket(state.time),()=>Object.keys(state.secondary.stock).length);
    probe("staged crates go into the racks",
      ()=>{state.time=at("2021-06-01");state.hardware={s19:1};state.inactiveHardware={s19:40};
        state.stagedCondition={};state.thermal={temperature:22,orders:[],equipment:{axial:1}}},
      ()=>advanceStagedIntake(),()=>state.commissioningJobs.length);
    probe("node reaches the chain tip",
      ()=>{state.node=1;state.nodeStorage=5000;state.nodeMode="full";
        state.nodeSync={primaryLag:1,primaryPeak:40,backupLag:0,backupPeak:0}},
      ()=>advanceNodeSync(true),()=>state.nodeSync.primaryLag);
    probe("node falls off the tip",
      ()=>{state.node=0;state.power=false;state.nodeSync={primaryLag:0,primaryPeak:0,backupLag:0,backupPeak:0}},
      ()=>advanceNodeSync(true),()=>state.nodeSync.primaryLag);
    probe("node already behind, falling further",
      ()=>{state.node=0;state.power=false;state.nodeSync={primaryLag:12,primaryPeak:40,backupLag:0,backupPeak:0}},
      ()=>advanceNodeSync(true),()=>state.nodeSync.primaryLag);
    probe("node merely catching up",
      ()=>{state.node=1;state.nodeStorage=5000;state.nodeMode="full";
        state.nodeSync={primaryLag:40,primaryPeak:40,backupLag:0,backupPeak:0}},
      ()=>advanceNodeSync(true),()=>state.nodeSync.primaryLag);
    return{out}})()`);
  const by = Object.fromEntries(r.out.map(o => [o.label, o]));
  for (const label of ["cooling install lands","pool payout lands","second-hand listings refresh",
                       "staged crates go into the racks","node reaches the chain tip","node falls off the tip"]) {
    assert(by[label], `${label} was not probed`);
    assert(by[label].changed, `${label} changed nothing, so the probe proves nothing`);
    assert(by[label].asked, `${label} changed the shape of a tab without asking for the rebuild that draws it`);
  }
  /* And the counter-case, which is the whole reason this is not "flag on every change": a lag
     that moves every single tick wants a text patch, not a tab rebuild. Raising the flag here
     would undo the reason the tick repaints with refreshLive() at all. */
  for (const label of ["node merely catching up", "node already behind, falling further"])
    assert(by[label].changed && !by[label].asked,
      `${label}: ordinary sync progress now forces a full tab rebuild every tick`);
});

/* ---- WHAT A BUTTON OFFERS IS WHAT THE ACTION ALLOWS ---- */

rule("a service the button offers is a service that actually starts", () => {
  /* Both service actions refused in five places and their buttons checked three. The gap that
     mattered was the crew: with nobody on the payroll you ARE the crew, you can only be on one
     bench at a time, and every other machine's Refurbish and Replace button stayed enabled with
     an empty tooltip. Clicking one did nothing whatsoever.

     Asserted as parity rather than as a list of conditions: whatever the reason says, starting
     the job must agree with it. A new refusal added to the action and forgotten in the helper
     fails here. */
  const r = json(`(()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";state.region="texas";
    state.cash=1e6;state.hardware={};state.hardware.s9=40;state.hardware.s7=20;
    state.thermal={temperature:22,orders:[],equipment:{axial:2}};`)}
    const cases=[];
    const probe=(label,setup)=>{
      state.maintenance.serviceJobs=[];state.staff=[];state.skills=[];
      state.maintenance.condition={s9:70,s7:70};
      state.maintenance.faults={s9:4,s7:4};
      state.maintenance.faultsByPart={s9:{asicfan:4},s7:{asicfan:4}};
      state.maintenance.inventory.asicfan=99;state.maintenance.inventory.hashboardearly=99;
      state.maintenance.inventory.hashboard=99;state.maintenance.inventory.thermalpaste=99;
      setup();
      const h=HARDWARE.find(x=>x.id==="s7");
      for(const part of [null,"asicfan"]){
        const reason=serviceBlockReason(h,part);
        const before=state.maintenance.serviceJobs.length;
        if(part)serviceHardwarePart("s7",part);else serviceHardware("s7");
        const started=state.maintenance.serviceJobs.length>before;
        cases.push({label,part:part||"refurbish",reason,started});
        // Undo so the two probes in a case do not interfere.
        state.maintenance.serviceJobs=state.maintenance.serviceJobs.filter(j=>j.id!=="s7");
      }
    };
    probe("free hands",()=>{});
    probe("already on a bench yourself",()=>{serviceHardwarePart("s9","asicfan")});
    probe("technicians on the payroll",()=>{state.staff=["fieldtech","fieldtech","fieldtech"]});
    probe("crew all committed",()=>{state.staff=["fieldtech"];serviceHardwarePart("s9","asicfan")});
    probe("no parts in stock",()=>{state.maintenance.inventory.asicfan=0;state.maintenance.inventory.hashboardearly=0;state.maintenance.inventory.hashboard=0});
    probe("nothing wrong with it",()=>{state.maintenance.condition.s7=100;state.maintenance.faults.s7=0;state.maintenance.faultsByPart.s7={}});
    /* This machine already in the bay. Every other case clears s7's jobs between probes, so
       without it the "already scheduled" branch was never walked and could be deleted freely. */
    {
      state.maintenance.serviceJobs=[];state.staff=["fieldtech","fieldtech","fieldtech"];state.skills=[];
      state.maintenance.condition={s9:70,s7:70};state.maintenance.faults={s9:4,s7:4};
      state.maintenance.faultsByPart={s9:{asicfan:4},s7:{asicfan:4}};
      state.maintenance.inventory.asicfan=99;state.maintenance.inventory.hashboardearly=99;
      state.maintenance.inventory.hashboard=99;state.maintenance.inventory.thermalpaste=99;
      serviceHardwarePart("s7","asicfan");
      const h=HARDWARE.find(x=>x.id==="s7");
      for(const part of [null,"asicfan"]){
        const reason=serviceBlockReason(h,part);
        const before=state.maintenance.serviceJobs.length;
        if(part)serviceHardwarePart("s7",part);else serviceHardware("s7");
        cases.push({label:"already in the bay",part:part||"refurbish",reason,
          started:state.maintenance.serviceJobs.length>before});
      }
    }
    return{cases}})()`);
  assert(r.cases.length >= 10, "the matrix did not run");
  for (const c of r.cases)
    assert((c.reason === "") === c.started,
      `${c.label} / ${c.part}: the button ${c.reason ? `says "${c.reason}"` : "offers it"} but the action ${c.started ? "started" : "refused"}`);
  // The matrix has to contain both answers, or parity is trivially true.
  assert(r.cases.some(c => c.started), "no case ever started a job, so the rule proves nothing");
  assert(r.cases.some(c => !c.started), "no case was ever refused, so the rule proves nothing");
});

rule("a drain the button offers is a drain that actually happens", () => {
  /* Coming out of the fluid is not free - the fans go back on and somebody does the work - so
     it can be refused for want of cash, and the button offering it did not know that. An
     operator with no money saw an enabled "Drain 10" that did nothing when pressed. Parity,
     not a list of conditions. */
  const r = json(`(()=>{${SITE(`state.time=at("2022-06-01");state.facility="warehouse";state.region="texas";
    state.hardware={};state.hardware.s19=40;state.immersion={};
    state.thermal={temperature:22,orders:[],equipment:{axial:2,immersion:1}};`)}
    state.maintenance.inventory.immersionKit=50;state.cash=1e6;
    convertToImmersion("s19",10);
    const h=HARDWARE.find(x=>x.id==="s19");
    const cases=[];
    const probe=(label,cash,qty)=>{
      state.cash=cash;
      const reason=immersionDrainBlockReason(h,qty);
      const before=immersionCount("s19");
      revertFromImmersion("s19",qty);
      cases.push({label,reason,drained:immersionCount("s19")<before});
    };
    probe("plenty of cash",1e6,10);
    // Put them back so the next probes have something to drain.
    state.cash=1e6;convertToImmersion("s19",10);
    probe("no cash at all",0,10);
    probe("just short",immersionConversionLabour(h,10)-1,10);
    probe("enough for one",immersionConversionLabour(h,1),1);
    state.cash=1e6;
    const drainedAll=(()=>{revertFromImmersion("s19",99);return immersionCount("s19")})();
    probe("nothing submerged",1e6,1);
    return{cases,drainedAll}})()`);
  for (const c of r.cases)
    assert((c.reason === "") === c.drained,
      `${c.label}: the button ${c.reason ? `says "${c.reason}"` : "offers it"} but the action ${c.drained ? "drained" : "refused"}`);
  assert(r.cases.some(c => c.drained), "nothing ever drained, so the rule proves nothing");
  assert(r.cases.some(c => !c.drained), "nothing was ever refused, so the rule proves nothing");
});

/* ---- A JOB THAT MOVES HAS TO SAY SO ---- */

rule("a repair changing stage asks the Mine tab to redraw", () => {
  /* The tick's ordinary repaint is refreshLive(), which patches text and never rebuilds the
     Mine tab. Only renderFullQueued makes it call renderMineContent(). Stage transitions did
     not set it, so a job could move Reconnect -> Fit -> Stability -> finished underneath a row
     that went on saying "Reconnect · 0d left" for as long as the clock ran. The engine was
     never stuck; the row describing it was. */
  const r = json(`(()=>{${SITE(`state.time=at("2010-03-01");state.facility="home";state.region="na";
    state.hardware={};state.hardware.laptop=1;state.staff=[];state.skills=[];`)}
    state.maintenance.serviceJobs=[];state.maintenance.condition.laptop=70;
    state.maintenance.faults={laptop:1};state.maintenance.faultsByPart={laptop:{laptopfan:1}};
    state.maintenance.inventory.laptopfan=5;state.maintenance.inventory.thermalpaste=20;
    serviceHardwarePart("laptop","laptopfan");
    const job=activeServiceJob("laptop");
    for(let i=0;i<30&&(job.stage||0)<2;i++)tick(true);
    if(!job.oldRemoved)repairRemoveOldPart("laptop");
    if(job.puzzleType===0){for(const slot of job.tapOrder.slice())repairTapSlot("laptop",slot)}
    else if(job.puzzleType===1){const slots=job.cableSlots.slice();
      for(let p=0;p<3;p++){const idx=[];slots.forEach((v,i)=>{if(v===p)idx.push(i)});
        repairCableClick("laptop",idx[0]);repairCableClick("laptop",idx[1])}}
    else{let g=0;while(Math.abs(job.dialValue-job.dialTarget)>job.dialTolerance&&g++<80){
      const off=job.dialValue-job.dialTarget;repairNudgeDial("laptop",off>0?(off>5?-5:-1):(off<-5?5:1))}}
    const stageAfterWork=job.stage;
    // Clear the flag, then run ONE tick and see whether the transition re-raises it.
    const steps=[];
    for(let i=0;i<6;i++){
      renderFullQueued=false;
      const before=activeServiceJob("laptop");
      const stageBefore=before?before.stage:null;
      tick(true);
      const after=activeServiceJob("laptop");
      const stageAfter=after?after.stage:"gone";
      if(stageBefore!==stageAfter)steps.push({from:stageBefore,to:stageAfter,asked:renderFullQueued===true});
      if(!after)break;
    }
    return{stageAfterWork,steps}})()`);
  assert(r.stageAfterWork > 2, "the bench work never completed, so there are no later stages to test");
  assert(r.steps.length > 0, "the job never changed stage on a tick");
  for (const step of r.steps)
    assert(step.asked, `moving from stage ${step.from} to ${step.to} did not ask the Mine tab to redraw, so the row would freeze there`);
  // Including the transition that removes the job: the row has to stop being drawn at all.
  assert(r.steps.some(step => step.to === "gone"), "the job never finished within the window");

  /* A save written before repairs were staged carries a job with no stage field, and that path
     skips the stage loop entirely - so it needs its own flag on completion. Asserting only
     through the staged path let that one be deleted without anything noticing, because the
     final stage++ had already raised the flag. */
  const legacy = json(`(()=>{${SITE(`state.time=at("2010-03-01");state.facility="home";state.region="na";
    state.hardware={};state.hardware.laptop=1;`)}
    state.maintenance.condition.laptop=70;
    state.maintenance.faults={laptop:1};state.maintenance.faultsByPart={laptop:{laptopfan:1}};
    state.maintenance.inventory.laptopfan=5;state.maintenance.inventory.thermalpaste=20;
    // A pre-staging job: due date only, no stage.
    state.maintenance.serviceJobs=[{id:"laptop",count:1,part:"laptopfan",due:state.time+DAY,
      crew:1,contracted:false,labor:0,auto:true}];
    renderFullQueued=false;
    state.time+=DAY*2;advanceMaintenance();
    return{gone:!activeServiceJob("laptop"),asked:renderFullQueued===true}})()`);
  assert(legacy.gone, "a legacy job never completed");
  assert(legacy.asked, "a legacy job finished without asking the Mine tab to stop drawing its row");
});

/* ---- THE BENCH ASKS FOR A PROCEDURE, NOT A GUESS ---- */

rule("the faulted part decides the procedure", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");`)}
    return{map:["asicfan","laptopfan","fan","coolantPump","hashboard","hashboardearly",
      "hashboardmodern","powerPcb","coolingManifold"].map(p=>[p,repairProcedureFor(p)]),
      noPart:repairProcedureFor(undefined)}})()`);
  const by = Object.fromEntries(r.map);
  /* A fan is a wiring job, a hashboard is seated and cross-torqued, a power board is torqued to
     a spec. This was Math.floor(nextRand()*3) - a fan fault could hand you a torque wrench -
     which made the task decoration on top of the repair and taught nothing about the part. */
  for (const fan of ["asicfan", "laptopfan", "fan", "coolantPump"])
    assert(by[fan] === 1, `${fan} is not a wiring job (got procedure ${by[fan]})`);
  for (const board of ["hashboard", "hashboardearly", "hashboardmodern"])
    assert(by[board] === 0, `${board} is not a seat-and-cross-torque job (got ${by[board]})`);
  for (const torque of ["powerPcb", "coolingManifold"])
    assert(by[torque] === 2, `${torque} is not a torque-to-spec job (got ${by[torque]})`);
  assert(Number.isFinite(r.noPart), "a recommissioning check with no part has no procedure at all");
});

rule("the printed cross pattern is a real cross pattern", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");`)}
    const opp={0:3,3:0,1:2,2:1},bad=[];
    for(let i=0;i<600;i++){const o=crossPattern();
      if(o.length!==4||new Set(o).size!==4||o[1]!==opp[o[0]]||o[3]!==opp[o[2]])bad.push(o)}
    const starts=new Set();for(let i=0;i<200;i++)starts.add(crossPattern()[0]);
    /* And the pattern the JOB actually gets, not merely what the generator returns: asserting
       only on the helper passes happily while the caller hands out a hardcoded order. */
    const jobs=[],jobStarts=new Set();
    for(let i=0;i<200;i++){const j={part:"hashboardmodern"};initRepairPuzzle(j);
      const o=j.tapOrder;jobStarts.add(o[0]);
      if(o.length!==4||new Set(o).size!==4||o[1]!==opp[o[0]]||o[3]!==opp[o[2]])jobs.push(o)}
    return{bad:bad.slice(0,3),badCount:bad.length,starts:[...starts].sort(),
      jobBad:jobs.slice(0,3),jobBadCount:jobs.length,jobStarts:[...jobStarts].sort()}})()`);
  /* The sequence is printed and described as the manual's, so it has to be one: any corner,
     then the corner diagonally opposite, then either of the remaining pair, then its opposite.
     A shuffle would have the game teach a technique that is not the technique. */
  assert(r.badCount === 0, `${r.badCount} of 600 patterns were not cross patterns, e.g. ${JSON.stringify(r.bad)}`);
  // Which corner you start at is the fitter's choice, so that much should still vary.
  assert(r.starts.length === 4, `patterns only ever start at ${r.starts.join(",")}`);
  assert(r.jobBadCount === 0, `${r.jobBadCount} of 200 bench jobs got a non-cross order, e.g. ${JSON.stringify(r.jobBad)}`);
  assert(r.jobStarts.length === 4, `bench jobs only ever start at ${r.jobStarts.join(",")}, so the order is fixed rather than generated`);
});

rule("following the procedure by the book costs nothing", () => {
  /* THE POINT OF ALL OF THIS. Every one of these used to punish the player for information they
     were never given: the mount order was a hidden shuffle, so a wrong mount was a coin flip
     that could damage the machine, and the cable pairs were unlabelled, so the first pick of
     each pair was a guess with a penalty attached. Neither is a test of anything. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";state.region="texas";
    state.hardware={};state.hardware.s19=40;state.staff=[];state.skills=[];
    state.thermal={temperature:22,orders:[],equipment:{axial:1}};`)}
    state.maintenance.inventory.hashboardmodern=99;state.maintenance.inventory.asicfan=99;
    state.maintenance.inventory.powerPcb=99;state.maintenance.inventory.thermalpaste=99;
    const play=part=>{
      state.maintenance.serviceJobs=[];state.maintenance.condition.s19=80;
      state.maintenance.faults={s19:2};state.maintenance.faultsByPart={s19:{[part]:2}};
      serviceHardwarePart("s19",part);
      const job=activeServiceJob("s19");if(!job)return{part,skipped:true};
      job.stage=2;job.oldRemoved=true;
      if(job.puzzleType===0){for(const slot of job.tapOrder.slice())repairTapSlot("s19",slot)}
      else if(job.puzzleType===1){const slots=job.cableSlots.slice();
        for(let pair=0;pair<3;pair++){const idx=[];slots.forEach((v,i)=>{if(v===pair)idx.push(i)});
          repairCableClick("s19",idx[0]);repairCableClick("s19",idx[1])}}
      else{let guard=0;while(Math.abs(job.dialValue-job.dialTarget)>job.dialTolerance&&guard++<80){
        const off=job.dialValue-job.dialTarget;repairNudgeDial("s19",off>0?(off>5?-5:-1):(off<-5?5:1))}}
      return{part,type:job.puzzleType,mistakes:job.mistakes||0,workDone:!!job.workDone};
    };
    return{plays:["hashboardmodern","asicfan","powerPcb"].map(play)}})()`);
  for (const play of r.plays) {
    assert(!play.skipped, `${play.part} never produced a bench job`);
    assert(play.workDone, `${play.part} could not be completed by following its own instructions`);
    assert(play.mistakes === 0,
      `${play.part} charged ${play.mistakes} mistake(s) to a player who followed the printed procedure exactly`);
  }
  assert(new Set(r.plays.map(p => p.type)).size === 3, "the three parts did not exercise three different procedures");
});

rule("a torque spec is a band, and only overshooting it is a mistake", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";state.region="texas";
    state.hardware={};state.hardware.s19=40;state.staff=[];state.skills=[];
    state.thermal={temperature:22,orders:[],equipment:{axial:1}};`)}
    state.maintenance.inventory.powerPcb=99;state.maintenance.inventory.thermalpaste=99;
    state.maintenance.serviceJobs=[];state.maintenance.condition.s19=80;
    state.maintenance.faults={s19:2};state.maintenance.faultsByPart={s19:{powerPcb:2}};
    serviceHardwarePart("s19","powerPcb");
    const job=activeServiceJob("s19");job.stage=2;job.oldRemoved=true;
    const tol=job.dialTolerance,target=job.dialTarget;
    // Land inside the band rather than exactly on the figure.
    job.dialValue=target+tol;
    repairNudgeDial("s19",0);
    return{tol,target,acceptedAtEdge:!!activeServiceJob("s19")?.workDone||true,
      landedWithoutExact:job.dialValue!==target,mistakes:job.mistakes||0,done:!!job.workDone}})()`);
  assert(r.tol >= 1, "a torque spec has no tolerance, so it is an exact number to land on again");
  assert(r.done, "a fastener inside the tolerance band was not accepted");
  assert(r.landedWithoutExact, "the job only completed on the exact figure");
  assert(r.mistakes === 0, "working into the band counted as a mistake");
});

/* ---- HIRING A CREW HAS TO BUY A CREW ---- */

rule("technicians stack on a big repair and change nothing on a small one", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2025-06-01");state.facility="megacampus";state.region="iceland";
    state.hardware={};state.hardware.s21xp=47000;state.maintenance.serviceJobs=[];`)}
    const h=HARDWARE.find(x=>x.id==="s21xp");
    const at_=(faults,techs)=>{state.staff=Array.from({length:techs},()=>"fieldtech");
      const p=servicePlan(h,faults);return{crew:p.crew,days:p.days}};
    return{small:{t3:at_(10,3),t25:at_(10,25)},
      big:{t1:at_(300,1),t3:at_(300,3),t10:at_(300,10),t25:at_(300,25)},
      huge:at_(1000,25)}})()`);
  /* The bug: crew was min(3, available), so the fourth technician onward did nothing. A player
     hired twenty-five, watched three of them work, and carried a permanent backlog while paying
     the other twenty-two to stand still. */
  assert(r.big.t25.crew > r.big.t3.crew, `twenty-five technicians put ${r.big.t25.crew} on a 300-unit job, the same as three`);
  assert(r.big.t25.days < r.big.t3.days, "hiring more technicians did not make a large repair any faster");
  assert(r.big.t10.crew > r.big.t3.crew && r.big.t10.days < r.big.t3.days, "ten technicians are worth no more than three");
  assert(r.huge.crew >= 25, `a thousand faulted units absorbed only ${r.huge.crew} of twenty-five technicians`);
  /* And a small job is unchanged: you cannot usefully put twenty-five people on ten machines. */
  assert(r.small.t25.crew === r.small.t3.crew && r.small.t25.days === r.small.t3.days,
    "a ten-unit job now scales with the payroll, which is not how a ten-unit job works");
  /* And it is three, not one: a small job still takes a normal crew. Asserting only that the
     two agree passes just as happily when both collapse to a single technician. */
  assert(r.small.t3.crew === 3, `a ten-unit job with three technicians used ${r.small.t3.crew} of them`);
  /* One technician must still beat none of them, and beat three by less. */
  assert(r.big.t1.days > r.big.t3.days, "one technician is as good as three on a large job");
});

rule("racking and unracking scale with the crew, not with whether one exists", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2025-06-01");state.facility="megacampus";state.region="iceland";`)}
    const rate=t=>{state.staff=Array.from({length:t},()=>"fieldtech");
      return{commission:Math.max(1,Math.ceil(5000/crewRatePerDay(20))),retire:retirementDays(5000)}};
    return{none:rate(0),one:rate(1),three:rate(3),twelve:rate(12),twentyfive:rate(25)}})()`);
  /* hasStaff() is a boolean. Reading it here meant one technician doubled the rate and the
     twenty-fourth did nothing - the same mistake as the repair planner, in the place it costs
     most, on the sites large enough to employ a real crew. */
  assert(r.one.commission < r.none.commission, "a technician does not speed up commissioning at all");
  assert(r.three.commission < r.one.commission, "a third technician racks nothing faster than one");
  assert(r.twelve.commission < r.three.commission, "twelve technicians rack no faster than three");
  assert(r.three.retire < r.one.retire && r.twelve.retire < r.three.retire,
    "unracking does not scale with the crew doing it");
  /* Returns diminish rather than running away: there is a limit to how many people can usefully
     move around the same aisle. */
  assert(r.twentyfive.commission === r.twelve.commission,
    "the crew speed-up has no ceiling, so a large payroll racks a fleet instantly");
});

/* ---- THE SKILL TREE IS A GRAPH, AND HAS TO BE A VALID ONE ---- */

rule("every skill descends from a foundation, and the graph has no cycles", () => {
  const r = json(`(()=>{${SITE(`state.skills=[];`)}
    const byId=Object.fromEntries(SKILLS.map(s=>[s.id,s]));
    const roots=SKILLS.filter(s=>!skillRequirements(s).length).map(s=>s.id);
    const dangling=[],cyclic=[],unreachable=[];
    for(const skill of SKILLS){
      for(const id of skillRequirements(skill))if(!byId[id])dangling.push(skill.id+"->"+id);
      /* Collect every ancestor. Visiting a node twice by DIFFERENT paths is convergence, not a
         cycle - salvage reaching benchskills through both diagnostics and parts sourcing is
         exactly what makes this a graph - so the visited set only stops the walk repeating
         work. A cycle is a node that is its own ancestor. */
      const seen=new Set();let frontier=skillRequirements(skill),depth=0,ok=!frontier.length;
      while(frontier.length&&depth++<40){
        const next=[];
        for(const id of frontier){
          if(seen.has(id))continue;
          seen.add(id);
          const parent=byId[id];if(!parent)continue;
          const up=skillRequirements(parent);
          if(!up.length)ok=true;else next.push(...up);
        }
        frontier=next;
      }
      if(seen.has(skill.id))cyclic.push(skill.id);
      else if(!ok)unreachable.push(skill.id);
    }
    const branches=[...new Set(SKILLS.map(s=>s.branch))];
    const rootsPerBranch=branches.map(b=>[b,SKILLS.filter(s=>s.branch===b&&!skillRequirements(s).length).length]);
    const multi=SKILLS.filter(s=>skillRequirements(s).length>1).map(s=>s.id);
    const crossBranch=SKILLS.filter(s=>skillRequirements(s).some(id=>byId[id]&&byId[id].branch!==s.branch)).map(s=>s.id);
    return{roots,dangling,cyclic,unreachable,rootsPerBranch,multi,crossBranch,total:SKILLS.length}})()`);
  assert(r.dangling.length === 0, `prerequisites pointing at nothing: ${r.dangling.join(", ")}`);
  assert(r.cyclic.length === 0, `these depend on themselves through a cycle: ${r.cyclic.join(", ")}`);
  assert(r.unreachable.length === 0, `these can never be reached from a foundation: ${r.unreachable.join(", ")}`);
  /* One entry point per branch. Six independent ladders is not a tree, and neither is a branch
     with three separate starts you can take in any order. */
  for (const [branch, count] of r.rootsPerBranch)
    assert(count === 1, `the ${branch} branch has ${count} foundations; it should have exactly one`);
  /* And the thing that makes it a graph rather than six ladders: nodes that need two parents,
     and parents in another branch. Without these, nothing you spend in one branch has ever
     cost you anything in another. */
  assert(r.multi.length >= 6, `only ${r.multi.length} skills need more than one prerequisite`);
  /* Named rather than counted. A threshold passes when any one of them is quietly deleted,
     which is exactly the regression worth catching: each of these edges is a specific claim
     about what an operation has to have done before it can do something else. */
  for (const id of ["immersiontuning","practisedhands","curtailment","standbypower","firmwarehygiene"])
    assert(r.crossBranch.includes(id), `${id} no longer depends on another branch`);
});

rule("a skill with two prerequisites needs both of them", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2024-01-01");state.facility="container";state.points=99;`)}
    const target=SKILLS.find(s=>skillRequirements(s).length>1);
    const reqs=skillRequirements(target);
    // One parent only: still refused, and the refusal names what is missing.
    state.skills=[reqs[0]];
    /* "met" reads the SHIPPED gate rather than a parallel predicate. It used to call
       skillPrereqsMet(), which nothing in the game consulted - so this rule proved a spare
       correct while unlockSkill's real guard went untested. */
    const half={gate:skillGateReason(target),met:skillGateReason(target)===""};
    unlockSkill(target.id);
    const afterHalf=state.skills.includes(target.id);
    // Both parents: allowed.
    state.skills=reqs.slice();
    const full={gate:skillGateReason(target),met:skillGateReason(target)===""};
    unlockSkill(target.id);
    return{id:target.id,reqs,half,afterHalf,full,afterFull:state.skills.includes(target.id),
      names:reqs.map(skillName)}})()`);
  assert(r.reqs.length > 1, "no multi-prerequisite skill to test");
  assert(!r.half.met && r.half.gate !== "", `${r.id} counted one of ${r.reqs.length} prerequisites as enough`);
  assert(r.half.gate.includes(r.names[1]), `the refusal did not name the missing prerequisite: "${r.half.gate}"`);
  assert(!r.afterHalf, `${r.id} was unlocked with only half its prerequisites`);
  assert(r.full.met && r.full.gate === "" && r.afterFull, `${r.id} stayed locked with both prerequisites met`);
});

/* ---- SOME THINGS ARE MOMENTS, NOT A MENU ---- */

rule("a fork trade and a donation drive close when the moment does", () => {
  const r = json(`(()=>{${SITE(`state.donations=[];state.speculations=[];state.wallets.hot=5;`)}
    const open=d=>{state.time=at(d);return{
      specs:SPECULATIONS.filter(x=>offerOpen(x)).map(x=>x.id),
      gifts:DONATION_CAMPAIGNS.filter(x=>offerOpen(x)).map(x=>x.id)}};
    const y2017=open("2017-10-01"),y2022=open("2022-04-01"),y2026=open("2026-06-01");
    // Taking a closed offer must change nothing at all.
    state.time=at("2026-06-01");state.wallets.hot=5;
    const hot=state.wallets.hot,xp=state.xp.total;
    takeSpeculation("bch",.1);donateBtc("wikileaks",.1);
    return{y2017,y2022,y2026,
      after:{specs:state.speculations.length,gifts:state.donations.length,
        hot:state.wallets.hot===hot,xp:state.xp.total===xp},
      dated:SPECULATIONS.concat(DONATION_CAMPAIGNS).filter(x=>!x.until).map(x=>x.id)}})()`);
  /* Every one of these is a moment. A list where none of them ever close is a list that offers
     the 2017 fork claim in 2026, which is a different decision from the one described. */
  assert(r.dated.length === 0, `these never close: ${r.dated.join(", ")}`);
  assert(r.y2017.specs.includes("bch"), "the Bitcoin Cash fork trade was not available two months after the fork");
  assert(!r.y2022.specs.includes("bch"), "the fork claim was still on offer five years later");
  assert(r.y2022.gifts.includes("ukraine") && !r.y2017.gifts.includes("ukraine"),
    "the Ukraine relief campaign is not tied to when it happened");
  assert(r.y2026.specs.length === 0 && r.y2026.gifts.length === 0,
    `the end of the run still offers ${r.y2026.specs.length} trades and ${r.y2026.gifts.length} campaigns`);
  assert(r.after.specs === 0 && r.after.gifts === 0 && r.after.hot && r.after.xp,
    "a closed offer could still be taken");
});

rule("giving coins away is worth real operator XP", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2022-04-01");state.donations=[];state.wallets.hot=5;
    state.xp={total:0,level:1,peakLevel:1,bestDifficulty:0,shares:0,sources:{shares:0,record:0,deploy:0,repair:0,spend:0}};`)}
    const small=(()=>{donateBtc("ukraine",.05);const x=state.xp.total;
      state.donations=[];state.xp.total=0;state.xp.level=1;state.wallets.hot=5;return x})();
    const large=(()=>{donateBtc("ukraine",.5);return state.xp.total})();
    return{small,large,level:state.xp.level,given:state.donations[0].btc,hot:state.wallets.hot}})()`);
  /* The only use of bitcoin in this game that never comes back as machines, capacity or cash.
     XP is the one thing the game has with which to say that mattered. */
  assert(r.small > 100, `a donation paid ${r.small} XP, which is not worth noticing`);
  assert(r.large > r.small, "giving away more is worth no more than giving away less");
  assert(r.level > 1, `${r.large} XP did not move the operator past level 1`);
  assert(r.given > 0 && r.hot < 5, "the donation did not actually cost any bitcoin");
});

/* ---- MINING INCOME ARRIVES THROUGH CUSTODY ---- */

rule("pool income is held by the pool until it clears the threshold", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";state.region="texas";
    state.hardware={};state.hardware.s19=60;state.wallets.hot=0;state.wallets.cold=0;
    state.mode="pool";state.pool="foundry";state.skills=["pool"];
    state.poolAccount={balance:0,frozen:0,threshold:.01,destination:"hot",paidTotal:0,feesPaid:0,payouts:0,lastPayout:0};
    state.thermal={temperature:22,orders:[],equipment:{axial:6}};`)}
    const trace=[];
    for(let d=0;d<40;d++){tick(true);trace.push({pool:poolAccount().balance,hot:state.wallets.hot,paid:poolAccount().payouts})}
    return{trace,threshold:poolAccount().threshold,fee:payoutNetworkFee(),
      totals:{paid:poolAccount().paidTotal,fees:poolAccount().feesPaid,payouts:poolAccount().payouts}}})()`);
  const earned = r.trace.some(t => t.pool > 0 || t.hot > 0);
  assert(earned, "the fleet earned nothing over 40 days, so this rule proves nothing");
  /* The whole point: there is a day on which the miner has been paid nothing and the pool is
     holding real money. That is the state the game never used to represent. */
  const holding = r.trace.find(t => t.pool > 0 && t.paid === 0);
  assert(holding, "income never sat with the pool; it went straight to the wallet as it used to");
  assert(r.totals.payouts > 0, `no payout was ever made over 40 days at a ${r.threshold} threshold`);
  assert(r.totals.fees > 0, "payouts cost no network fee, so the threshold trade-off does not exist");
  /* Every payout crosses the threshold, and the fee comes out of the payment. */
  const firstPaid = r.trace.findIndex(t => t.paid === 1);
  assert(firstPaid > 0 && r.trace[firstPaid - 1].pool >= 0, "the first payout did not follow a held balance");
  assert(r.trace[firstPaid].hot > 0, "a payout was recorded but nothing reached the wallet");
});

rule("solo mining has no pool balance and no withdrawal fee", () => {
  /* Asserted against the router directly rather than by waiting for a block. Solo mining is a
     lottery, and a run long enough to be sure of winning it is also long enough for an
     unserviced fleet to degrade itself offline - so a tick-driven version of this rule was
     failing for reasons that had nothing to do with what it claims. The tick's use of this
     router is proved by the pool rule above, which watches a balance accrue through ticks. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";state.region="texas";
    state.wallets.hot=0;state.wallets.cold=0;state.mode="solo";
    state.poolAccount={balance:0,frozen:0,threshold:.01,destination:"hot",paidTotal:0,feesPaid:0,payouts:0,lastPayout:0};`)}
    creditMiningIncome(.5);
    const solo={hot:state.wallets.hot,pool:poolAccount().balance,fees:poolAccount().feesPaid};
    // The same income, mined through a pool, must behave completely differently.
    state.mode="pool";state.pool="foundry";state.wallets.hot=0;
    creditMiningIncome(.5);
    const pooled={hot:state.wallets.hot,pool:poolAccount().balance};
    return{solo,pooled}})()`);
  /* The coinbase pays an address you control: nobody holds it and nobody charges you to send
     it. That is the half of the solo trade-off the game never showed. */
  assert(r.solo.hot === .5, `solo income put ${r.solo.hot} in the wallet instead of the whole 0.5`);
  assert(r.solo.pool === 0, `solo mining accrued ${r.solo.pool} in a pool balance`);
  assert(r.solo.fees === 0, "solo mining paid a pool withdrawal fee");
  assert(r.pooled.hot === 0 && r.pooled.pool === .5,
    `pool income reached the wallet directly (${r.pooled.hot} hot, ${r.pooled.pool} held); it must sit with the pool first`);
});

rule("the payout destination decides who is holding the income", () => {
  const r = json(`(()=>{
    const run=dest=>{
      ${SITE(`state.time=at("2021-06-01");state.facility="warehouse";state.region="texas";
        state.hardware={};state.hardware.s19=60;state.wallets.hot=0;state.wallets.cold=0;
        state.wallets.exchange=0;state.mode="pool";state.pool="foundry";state.skills=["pool"];
        state.thermal={temperature:22,orders:[],equipment:{axial:6}};`)}
      state.poolAccount={balance:0,frozen:0,threshold:.005,destination:dest,paidTotal:0,feesPaid:0,payouts:0,lastPayout:0};
      for(let d=0;d<60;d++)tick(true);
      return{hot:state.wallets.hot,cold:state.wallets.cold,exchange:state.wallets.exchange,
        payouts:poolAccount().payouts};
    };
    return{hot:run("hot"),exchange:run("exchange"),
      coldBlocked:(()=>{${SITE(`state.time=at("2021-06-01");state.custody=blankCustody();`)}
        return payoutDestinationBlockReason("cold")})()}})()`);
  assert(r.hot.payouts > 0 && r.hot.hot > 0, "paying to the hot wallet did not reach the hot wallet");
  assert(r.exchange.payouts > 0 && r.exchange.exchange > 0 && r.exchange.hot === 0,
    "paying to an exchange put the income somewhere else");
  /* Cold storage is not a place you can be paid until you have built somewhere to be paid to.
     This is the moment the custody tab stops being optional. */
  assert(/custody/i.test(r.coldBlocked),
    "cold storage can be chosen as a payout destination without a wallet that can receive into it");
});

rule("a pool that stops paying takes what it was holding", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2026-07-01");state.facility="warehouse";state.region="texas";
    state.hardware={};state.hardware.s19=60;state.wallets.hot=0;state.mode="pool";state.pool="poolin";
    state.skills=["pool"];state.pendingLosses=[];
    state.poolAccount={balance:0,frozen:0,threshold:.5,destination:"hot",paidTotal:0,feesPaid:0,payouts:0,lastPayout:0};
    state.thermal={temperature:22,orders:[],equipment:{axial:6}};`)}
    // A high threshold means a large balance is still on the pool's books when it closes.
    for(let d=0;d<8;d++)tick(true);
    const before=poolAccount().balance,hotBefore=state.wallets.hot;
    for(let d=0;d<20;d++)tick(true);
    return{before,hotBefore,after:poolAccount().balance,frozen:poolAccount().frozen,
      mode:state.mode,losses:(state.pendingLosses||[]).map(l=>l.cause)}})()`);
  assert(r.before > 0, "the pool was holding nothing when it closed, so this rule proves nothing");
  assert(r.mode === "solo", "the fleet did not fail over when the pool closed");
  assert(r.after === 0, "the pool kept paying after it shut down");
  /* What is lost is exactly what the operator chose to leave there - the threshold argument
     made concrete - and it is reported as a coin loss rather than a log line. */
  assert(r.frozen > 0 && r.frozen < r.before, `${r.frozen} of ${r.before} survived as a claim; it must be a fraction`);
  assert(r.losses.includes("poolfail"), "a stranded pool balance was not reported as a loss");
});

/* ---- CAPACITY GATES THE LOADING BAY, NOT THE TILL ---- */

rule("a fleet can be bought beyond the room, and the room takes what it can", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";state.region="texas";
    state.cash=5e6;state.hardware={};state.hardware.s19=20;state.poweredDownHardware={};
    state.decommissionedHardware={};state.inactiveHardware={};state.procurementOrders=[];
    state.commissioningJobs=[];state.retirementJobs=[];state.stagedCondition={};
    state.thermal={temperature:22,orders:[],equipment:{axial:1}};`)}
    const h=HARDWARE.find(x=>x.id==="s19");
    const headroom=siteRackHeadroom(h);
    const offered=hardwarePurchaseLimits(h).fiatMax;
    buyHardware("s19",60);
    const ordered=state.procurementOrders.reduce((a,o)=>a+o.qty,0);
    state.procurementOrders.forEach(o=>{o.due=state.time;o.risk=0;o.partialRisk=0});
    tick(true);
    const arrival={staged:state.inactiveHardware.s19||0,job:(state.commissioningJobs[0]||{}).qty||0,
      installed:state.hardware.s19,hold:stagedHoldReason("s19")};
    // Free real capacity and let the crew work: the rest must go in without being asked.
    decommissionHardware("s19",20);
    /* Long enough for the intake to work through in waves, and to prove it then STOPS. The
       intake has to pace itself: machines being commissioned occupy floor and draw power before
       the crew has finished bolting them in, so each wave waits for the last to land. */
    let everOver=false;
    for(let d=0;d<60;d++){tick(true);if(!fleet().within)everOver=true}
    return{headroom,offered,ordered,arrival,everOver,
      end:{staged:state.inactiveHardware.s19||0,installed:state.hardware.s19,
        stored:state.decommissionedHardware.s19||0,
        within:fleet().within,headroom:siteRackHeadroom(HARDWARE.find(x=>x.id==="s19"))}}})()`);
  assert(r.headroom > 0 && r.headroom < 60, `the site had headroom for ${r.headroom}; the case needs it to be short of the order`);
  /* The card has to offer it too, or the engine allows something the player can never ask for. */
  assert(r.offered > r.headroom,
    `the card offered ${r.offered} against room for ${r.headroom}; capacity is still clamping what may be bought`);
  assert(r.ordered === 60, `buying 60 against headroom for ${r.headroom} was cut to ${r.ordered}; capacity must not gate the purchase`);
  /* What fits is taken without being asked, and what does not fit waits rather than being
     refused. The old behaviour rejected the whole batch because one machine did not fit. */
  assert(r.arrival.job === r.headroom, `the site accepted ${r.arrival.job} of a delivery it had room for ${r.headroom} of`);
  assert(r.arrival.staged === 60 - r.headroom, `${r.arrival.staged} were left in storage; expected ${60 - r.headroom}`);
  assert(/storage/i.test(r.arrival.hold), "nothing explains why the rest of a paid-for delivery is still in its crate");
  /* And the room opening later is enough on its own - nobody should have to press a button to
     accept hardware they have already paid for. But only as far as the room actually goes: a
     workshop supplies 100 kW and an S19 draws 3.5 kW, so it holds about twenty-nine of them and
     the balance stays in storage. An earlier version of this rule asserted that all sixty went
     in, which is precisely the bug it should have caught - the intake was over-committing
     because machines already being commissioned reserved nothing, and a site that ends up
     holding more than it can carry stops mining entirely. */
  assert(r.end.installed > r.headroom, "capacity freeing up did not let any more machines in");
  assert(r.end.installed + r.end.staged === 60, `${r.end.installed} racked and ${r.end.staged} staged do not account for the 60 bought`);
  assert(r.end.stored === 20, `${r.end.stored} machines in storage after retiring 20`);
  assert(r.end.headroom === 0, `the site stopped taking machines with room for ${r.end.headroom} more`);
  /* The invariant this whole gate exists to protect. */
  assert(!r.everOver && r.end.within, "the site was allowed to hold more fleet than it can carry, which stops it mining entirely");
});

rule("machines already being commissioned reserve the capacity they will use", () => {
  /* THE BUG THIS EXISTS FOR. Commissioning takes days and the intake runs every day. Headroom
     measured against INSTALLED machines alone does not shrink while a job is in flight, so the
     intake started a fresh job every day for the whole length of the last one, each convinced
     there was room. A site ends up holding several times what it can carry, fleet().within goes
     false, and the entire operation stops mining. A player lost months of a 575,000-machine
     farm to exactly this. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";state.region="texas";
    state.hardware={};state.hardware.s19=1;state.inactiveHardware={s19:400};state.stagedCondition={};
    state.commissioningJobs=[];state.retirementJobs=[];state.procurementOrders=[];
    state.decommissionedHardware={};state.poweredDownHardware={};
    state.thermal={temperature:22,orders:[],equipment:{axial:1}};`)}
    const h=HARDWARE.find(x=>x.id==="s19");
    const headroomStart=siteRackHeadroom(h);
    activateHardware("s19");
    // Mid-job, with the crew still bolting the first wave in, the site must report no room.
    const midJob={jobs:state.commissioningJobs.length,headroom:siteRackHeadroom(h),
      committed:committedLoad().watts};
    let everOver=false,peak=0;
    for(let d=0;d<60;d++){tick(true);if(!fleet().within)everOver=true;peak=Math.max(peak,state.hardware.s19)}
    return{headroomStart,midJob,everOver,peak,
      end:{installed:state.hardware.s19,staged:state.inactiveHardware.s19||0,within:fleet().within}}})()`);
  assert(r.headroomStart > 0 && r.headroomStart < 400, "the case needs a site with room for some but not all");
  assert(r.midJob.jobs === 1, "no commissioning job was started");
  assert(r.midJob.committed > 0, "a job in flight reserves no load at all");
  assert(r.midJob.headroom === 0,
    `with a job in flight the site still claims room for ${r.midJob.headroom} more, which is how it over-commits`);
  /* The invariant. Over sixty days of the intake running daily, the installed fleet must never
     once exceed what the site can carry. */
  assert(!r.everOver, "the site was allowed to hold more fleet than it can carry, which stops it mining entirely");
  assert(r.end.within, "the site ended holding more than it can carry");
  assert(r.end.installed + r.end.staged === 401, `${r.end.installed} racked and ${r.end.staged} staged do not account for the 401 owned`);
});

rule("a site that cannot carry its fleet says so", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2025-06-01");state.facility="megacampus";state.region="iceland";
    state.power=true;state.debt=0;state.hardware={};state.hardware.s21=575000;
    state.thermal={temperature:20,orders:[],equipment:{coolingtower:40}};`)}
    const over={within:fleet().within,operating:operating(),reason:siteStopReason(),earning:earningHash(),physical:fleet().hash};
    // And when it does fit, it says nothing.
    state.hardware={s21:20000};
    return{over,ok:{within:fleet().within,reason:siteStopReason()}}})()`);
  assert(r.over.within === false && r.over.operating === false, "the case needs a site that cannot carry its fleet");
  /* A stoppage the game cannot explain is worse than any stoppage it can. */
  assert(r.over.reason !== "", "a site stopped because its fleet does not fit gives no reason at all");
  assert(/kW|floor/.test(r.over.reason), `the reason does not say what is over: "${r.over.reason}"`);
  assert(/retire|sell|larger/i.test(r.over.reason), `the reason does not say what to do about it: "${r.over.reason}"`);
  /* And the number under "your hash" is what is being earned, not what is installed. A player
     watched sixteen exahash while their balance did not move. */
  assert(r.over.earning === 0 && r.over.physical > 0,
    `a stopped site reported ${r.over.earning} of earning hash against ${r.over.physical} installed`);
  assert(r.ok.reason === "", `a site that fits still complains: "${r.ok.reason}"`);
});

rule("the manual commission button racks what fits instead of refusing the batch", () => {
  /* The auto-intake and the button are two paths to the same decision, and the button was the
     one that used to reject a whole delivery because one machine did not fit. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";state.region="texas";
    state.hardware={};state.hardware.s19=20;state.inactiveHardware={s19:60};state.stagedCondition={};
    state.commissioningJobs=[];state.procurementOrders=[];state.retirementJobs=[];
    state.thermal={temperature:22,orders:[],equipment:{axial:1}};`)}
    const h=HARDWARE.find(x=>x.id==="s19");
    const headroom=siteRackHeadroom(h);
    activateHardware("s19");
    return{headroom,job:(state.commissioningJobs[0]||{}).qty||0,staged:state.inactiveHardware.s19||0}})()`);
  assert(r.headroom > 0 && r.headroom < 60, "the case needs a site with room for some but not all");
  assert(r.job === r.headroom, `the button commissioned ${r.job} of the ${r.headroom} that fit`);
  assert(r.staged === 60 - r.headroom, `${r.staged} left in storage; expected ${60 - r.headroom}`);
});

rule("a refused order returns the money and the listing", () => {
  /* Ordering used to be capacity-checked before payment, so the one path that can still refuse
     an order - a second-hand listing that is not deep enough - was free to take the cash and
     return silently. It is not free any more. */
  const r = json(`(()=>{${SITE(`state.time=at("2019-06-01");state.facility="warehouse";state.region="texas";
    state.cash=5e6;state.hardware={};state.inactiveHardware={};state.procurementOrders=[];`)}
    advanceSecondaryMarket(state.time);
    const listed=secondaryStock("s9");
    /* Reached directly, because the buy path clamps to the listing before it gets here - this
       is the belt-and-braces case, and a defence nobody exercises is a defence nobody has. */
    const stood=placeHardwareOrder("s9",listed+50);
    return{listed,stood,stillListed:secondaryStock("s9"),orders:state.procurementOrders.length}})()`);
  assert(r.listed > 0, "no second-hand stock to test against");
  assert(r.stood === false, "an order deeper than the listing was accepted anyway");
  assert(r.stillListed === r.listed, `a refused order consumed ${r.listed - r.stillListed} of the listing it could not fill`);
  assert(r.orders === 0, "a refused order was still added to the book");
});

/* ---- A PLANT YOU CAN BUY IS A PLANT YOU CAN LEAVE ---- */

rule("cooling can be cancelled before it lands and sold after it does", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2017-06-01");state.facility="warehouse";state.region="texas";
    state.cash=500000;state.hardware={};state.hardware.s9=300;
    state.thermal={temperature:26,orders:[],equipment:{axial:3}};`)}
    const item=COOLING_EQUIPMENT.find(x=>x.id==="axial");
    const start={cash:state.cash,cap:coolingCapacityKw()};
    buyCooling("axial");
    const ordered={cash:state.cash,orders:state.thermal.orders.length};
    cancelCoolingOrder("axial");
    const cancelled={cash:state.cash,orders:state.thermal.orders.length};
    sellCooling("axial");
    return {cost:item.cost,cooling:item.coolingKw,start,ordered,cancelled,
      sold:{cash:state.cash,units:state.thermal.equipment.axial||0,cap:coolingCapacityKw()},
      resaleQuoted:coolingResaleValue(item)}})()`);
  assert(r.ordered.orders === 1 && r.ordered.cash === r.start.cash - r.cost, "ordering cooling no longer costs its price");
  assert(r.cancelled.orders === 0, "an undelivered cooling order cannot be cancelled");
  /* A cancellation is not a refund in full: the supplier keeps a restocking fee, or ordering
     costs nothing to change your mind about and the decision carries no weight. */
  const refunded = r.cancelled.cash - r.ordered.cash;
  assert(refunded > 0 && refunded < r.cost, `cancelling refunded ${refunded} of ${r.cost}; it must return most of the money but not all of it`);
  assert(r.sold.units === 2, "selling an installed unit did not remove it from the plant");
  assert(r.sold.cash - r.cancelled.cash === r.resaleQuoted && r.resaleQuoted > 0,
    "selling installed cooling paid something other than the price its own card quotes");
  /* The point of selling it: the heat rejection goes with it, the same day. */
  assert(Math.abs((r.start.cap - r.sold.cap) - r.cooling * (r.start.cap / r.start.cap)) < r.cooling * 0.35,
    `capacity fell by ${(r.start.cap - r.sold.cap).toFixed(1)} kW when the unit sheds ${r.cooling} kW`);
  assert(r.sold.cap < r.start.cap, "selling a cooling unit did not reduce heat rejection");
});

rule("a cooling sale is worth more than the same plant sold with a building", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2017-06-01");state.facility="warehouse";state.region="texas";
    state.thermal={temperature:26,orders:[],equipment:{axial:2}};`)}
    const item=COOLING_EQUIPMENT.find(x=>x.id==="axial");
    return {chosen:coolingResaleValue(item),cost:item.cost,distressed:Math.round(item.cost*0.25)}})()`);
  /* Choosing the moment and the buyer is worth something. A downsize sells the plant with the
     building to someone who knows the operator has to leave; that is the worse price, and the
     two must not drift into each other or one of the decisions stops meaning anything. */
  assert(r.chosen > r.distressed, "selling cooling deliberately is worth no more than losing it in a downsize");
  assert(r.chosen < r.cost, "used industrial plant sells for its full price");
});

/* ---- THE FACILITY LADDER GOES BOTH WAYS ---- */

rule("a fleet that fits can move to a smaller site, and one that does not cannot", () => {
  /* The gate is physical, so it is tested physically: the same site, the same cash, the same
     date, varying only how many machines are installed. */
  const fits = json(`(()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={};state.hardware.s9=4;state.procurementOrders=[];
    state.inactiveHardware={};state.decommissionedHardware={};state.commissioningJobs=[];
    state.facilityUpgradeJob=null;state.relocationJob=null;`)}
    const target=FACILITIES.find(f=>f.id==="workshop");
    const before={cash:state.cash,facility:state.facility,blocked:facilityDownsizeBlockReason("workshop")};
    downsizeFacility("workshop");
    return {blocked:before.blocked,job:state.facilityUpgradeJob&&state.facilityUpgradeJob.id,
      down:!!(state.facilityUpgradeJob&&state.facilityUpgradeJob.down),paid:before.cash-state.cash,
      cost:facilityDownsizeCost(target),power:state.power}})()`);
  assert(fits.blocked === "", `a four-machine fleet should fit a workshop, but: ${fits.blocked}`);
  assert(fits.job === "workshop", "downsizing did not dispatch a move to the smaller site");
  assert(fits.down === true, "the move is not recorded as a downsize, so the UI will call it an upgrade");
  assert(fits.power === false, "a physical move must power the fleet down");
  assert(fits.paid === fits.cost && fits.paid > 0, `the lease break and re-rack were not charged (paid ${fits.paid}, cost ${fits.cost})`);

  const tooMany = json(`(()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={};state.hardware.s9=400;state.procurementOrders=[];
    state.inactiveHardware={};state.decommissionedHardware={};state.commissioningJobs=[];
    state.facilityUpgradeJob=null;state.relocationJob=null;`)}
    downsizeFacility("workshop");
    return {blocked:facilityDownsizeBlockReason("workshop"),job:state.facilityUpgradeJob}})()`);
  assert(tooMany.blocked !== "", "400 S9s should not fit a light industrial unit");
  assert(tooMany.job === null, "a fleet that does not fit was still moved into the smaller site");
});

rule("downsizing costs a lease break rather than a fit-out, and is far cheaper than the way up", () => {
  const money = json(`(()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";state.region="texas";`)}
    const workshop=FACILITIES.find(f=>f.id==="workshop"),warehouse=FACILITIES.find(f=>f.id==="warehouse");
    return {down:facilityDownsizeCost(workshop),fitOut:workshop.cost,leavingRent:warehouse.rent,
      rentSaved:warehouse.rent-workshop.rent}})()`);
  assert(money.rentSaved > 0, "moving down the ladder does not reduce rent, which is the only reason to do it");
  assert(money.down >= money.leavingRent, "walking away from a lease costs less than a month of it, so there is no reason to think about it");
  /* The number that decides whether this is a real option: an operator who has shrunk is short
     of cash, so the move has to pay for itself in months rather than years - and it must not be
     free, or staying in a site you have outgrown downward would never be a mistake. */
  const payback = money.down / money.rentSaved;
  assert(payback > 1 && payback < 6, `downsizing pays back in ${payback.toFixed(1)} months; it should be a few months, not free and not a year`);
});

rule("a pool payout conserves coins: what leaves the balance arrives, less the network fee", () => {
  /* Three surviving mutants lived here, all in clamps nobody asserted. feesPaid took
     Math.min(fee,sent); turning it into max charged the whole payment as fee while still
     crediting the net, so the lifetime ledger claimed roughly twice what the pool ever sent.
     Nothing noticed, because every individual figure still looked like a number. Conservation
     is the only assertion that catches it: sent === arrived + fee, exactly, once. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:5};state.wallets={hot:0,cold:0,exchange:0};`)}
    const a=poolAccount();
    a.destination="hot";a.threshold=.001;a.balance=0;a.paidTotal=0;a.feesPaid=0;a.payouts=0;
    const fee=payoutNetworkFee();
    const before=state.wallets.hot+state.wallets.cold+state.wallets.exchange;
    a.balance=Math.max(a.threshold,fee*4);
    const sent=a.balance;
    advancePoolPayouts();
    const after=state.wallets.hot+state.wallets.cold+state.wallets.exchange;
    return {sent,fee,arrived:after-before,balanceAfter:a.balance,
      paidTotal:a.paidTotal,feesPaid:a.feesPaid,payouts:a.payouts}})()`);
  assert(r.payouts === 1, `expected exactly one payout, got ${r.payouts}`);
  assert(r.balanceAfter === 0, `the pool balance was not cleared: ${r.balanceAfter}`);
  assert(Math.abs(r.arrived + r.feesPaid - r.sent) < 1e-12,
    `coins were invented or destroyed: ${r.sent} left the pool but ${r.arrived} arrived and ${r.feesPaid} was charged as fee`);
  assert(Math.abs(r.paidTotal - r.arrived) < 1e-12,
    `the lifetime-paid figure disagrees with the wallets: ledger says ${r.paidTotal}, wallets gained ${r.arrived}`);
  assert(r.feesPaid > 0 && r.feesPaid <= r.sent,
    `the fee charged (${r.feesPaid}) is not a sane share of a ${r.sent} payment`);
  assert(Math.abs(r.feesPaid - r.fee) < 1e-12,
    `the fee charged was ${r.feesPaid} but the network fee is ${r.fee}`);
});

rule("cooling on order counts against the site you are moving into", () => {
  /* The third instance of one class: work already in flight that the gate does not count.
     Machines mid-commission, crates waiting to be racked, and now plant on order - a cooling
     order placed in a site with room to spare installs into whichever site the operator is
     standing in when the fitters finish. buyCooling checks headroom honestly at the moment of
     purchase; nothing re-checked it after the ground moved. pendingCoolingOrdersFor() was
     written to answer this and was never called by anything. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.cash=1e9;state.hardware={s19:20};
    state.thermal={temperature:22,orders:[],equipment:{}};`)}
    const bought=[];
    for(const item of COOLING_EQUIPMENT){
      const before=JSON.stringify(state.thermal.orders);
      buyCooling(item.id);
      if(JSON.stringify(state.thermal.orders)!==before)bought.push(item.id);
    }
    const pendingW=state.thermal.orders.reduce((a,o)=>{
      const it=COOLING_EQUIPMENT.find(x=>x.id===o.id);return a+(it?it.watts*(o.qty||1):0)},0);
    const reason=facilityDownsizeBlockReason("workshop");
    downsizeFacility("workshop");
    return {bought:bought.length,pendingKw:+(pendingW/1000).toFixed(1),reason,
      dispatched:!!state.facilityUpgradeJob,facility:state.facility}})()`);
  assert(r.bought > 0, "no cooling was ordered, so the rule tests nothing");
  assert(r.pendingKw > 20, `only ${r.pendingKw} kW of cooling was on order; too little to exceed the destination's supply`);
  assert(r.reason !== "", `the move was allowed with ${r.pendingKw} kW of cooling still on order, which installs on arrival`);
  assert(!r.dispatched && r.facility === "warehouse", "the move went ahead despite being refused");
});

rule("a facility move is a risk you can price, in both directions", () => {
  /* Mutation testing found nothing asserting the SHAPE of move risk. Turning the .48 ceiling
     into a floor - one character - makes every expansion at least a coin-flip disaster and the
     whole suite passed. Risk is the number the operator accepts when they commit to a move, so
     the bounds are the contract: an upgrade never certain to go wrong, a downsize meaningfully
     safer than an expansion because there is no new grid connection to energise, and moving
     nowhere costing nothing. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.cash=1e9;state.hardware={s19:20};`)}
    const rows=[];
    // facilityMoveRisk reads state.facility, so the site has to actually be set, not passed.
    for(const from of FACILITIES){
      for(const to of FACILITIES){
        state.facility=from.id;
        rows.push({from:from.id,to:to.id,
          up:FACILITIES.findIndex(x=>x.id===to.id)>FACILITIES.findIndex(x=>x.id===from.id),
          same:from.id===to.id,risk:facilityMoveRisk(to.id)});
      }
    }
    return {rows,labels:[facilityRiskLabel(.05),facilityRiskLabel(.2),facilityRiskLabel(.4)]}})()`);
  const same = r.rows.filter(x => x.same), ups = r.rows.filter(x => x.up),
        downs = r.rows.filter(x => !x.up && !x.same);
  assert(same.every(x => x.risk === 0), "moving to the site you are already in carries risk");
  assert(ups.every(x => x.risk > 0 && x.risk <= 0.48),
    `an expansion fell outside 0 < risk <= 0.48: ${JSON.stringify(ups.find(x => !(x.risk > 0 && x.risk <= 0.48)))}`);
  assert(downs.every(x => x.risk > 0 && x.risk <= 0.2),
    `a downsize fell outside 0 < risk <= 0.2: ${JSON.stringify(downs.find(x => !(x.risk > 0 && x.risk <= 0.2)))}`);
  /* The ceiling has to BIND, or Math.min(.48,...) and Math.max(.48,...) are the same function
     on this data and the assertion above proves nothing. */
  assert(ups.some(x => x.risk > 0.2), "no expansion is riskier than a downsize ceiling; the bounds are not being exercised");
  assert(Math.max(...downs.map(x => x.risk)) < Math.max(...ups.map(x => x.risk)),
    "the riskiest downsize is not safer than the riskiest expansion");
  assert(r.labels[0] === "Low move risk" && r.labels[2] === "High move risk",
    `risk labels do not describe the bands: ${r.labels.join(" / ")}`);
});

rule("a move incident cannot charge more money than the operator has", () => {
  /* Both incident fees are clamped with Math.min(state.cash, ...). Turning either into a
     Math.max charges a fee computed from FLEET VALUE against a cash balance that may be a
     fraction of it, so a bad roll on arrival invents debt out of nothing. Nothing asserted it. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:400};state.insured=false;state.debt=0;`)}
    // A large fleet and almost no cash: fees are priced off fleet value, so the clamp is load-bearing.
    state.cash=500;
    const fleetValue=Math.round(fleet().value);   // before any incident damages the fleet
    const worst=[];
    for(let trial=0;trial<200;trial++){
      state.cash=500;state.facility="warehouse";state.hardware={s19:400};
      state.facilityUpgradeJob={id:"workshop",due:state.time-DAY,cost:0,risk:1,down:true};
      advanceFacilityMove();
      worst.push(state.cash);
    }
    return {min:Math.min(...worst),fleetValue}})()`);
  assert(r.fleetValue > 5000, `the fleet must be worth far more than the cash on hand for this to test anything, got ${r.fleetValue}`);
  assert(r.min >= 0, `a move incident drove cash to ${r.min} from a starting balance of 500`);
});

rule("retirement cannot be booked for machines already on their way out", () => {
  /* retiringCount() was written to answer this and never called, so the cap was on machines
     owned rather than machines still in the racks. Booking the same 100 twice made a second
     job that pulled nothing and then announced "Retired 0" with a notice saying they were in
     storage - a confirmation for work that never happened. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.cash=1e8;state.hardware={s19:100};
    state.thermal={temperature:22,orders:[],equipment:{}};`)}
    decommissionHardware("s19",100);
    decommissionHardware("s19",100);
    const booked=state.retirementJobs.reduce((a,j)=>a+j.qty,0),jobs=state.retirementJobs.length;
    for(let d=0;d<40;d++)tick(true);
    return {booked,jobs,jobsLeft:state.retirementJobs.length,
      hardware:state.hardware.s19||0,decommissioned:state.decommissionedHardware.s19||0}})()`);
  assert(r.jobs === 1, `${r.jobs} retirement jobs were opened against one fleet of 100`);
  assert(r.booked === 100, `${r.booked} machines were booked for retirement out of 100 owned`);
  assert(r.jobsLeft === 0, "the retirement did not finish");
  assert(r.decommissioned === 100 && r.hardware === 0,
    `the fleet did not end up in storage: ${r.hardware} racked, ${r.decommissioned} retired`);
});

rule("the loading bay racks against the site being moved INTO, not the one being left", () => {
  /* The stranding that has no warning attached to it, because every individual step is legal.
     The fleet fits the smaller site, so the move is allowed. Crates already standing on the
     floor are then racked over the following days against the headroom of the site being
     vacated. The move lands and 306 machines are drawing 999 kW into a 100 kW cap, on a floor
     that holds 260 units and is carrying 612. Nothing can be sold fast enough to recover it. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.cash=1e9;state.hardware={s19:20};
    state.thermal={temperature:22,orders:[],equipment:{axial:2}};
    state.inactiveHardware={s19:400};`)}
    const moveAllowed=facilityDownsizeBlockReason("workshop")==="";
    downsizeFacility("workshop");
    let over=0;
    for(let d=0;d<150;d++){tick(true);if(!fleet().within)over++}
    const f=fleet(),site=FACILITIES.find(x=>x.id===state.facility);
    return {moveAllowed,facility:state.facility,daysOverCapacity:over,within:f.within,
      installed:state.hardware.s19||0,crated:state.inactiveHardware.s19||0,
      kw:+f.potentialKw.toFixed(1),cap:f.cap,space:f.space,siteSpace:site.space}})()`);
  assert(r.moveAllowed, "the fleet fits the workshop today, so the move itself should be allowed");
  assert(r.facility === "workshop", "the move did not complete");
  assert(r.daysOverCapacity === 0, `the site was over capacity on ${r.daysOverCapacity} of 150 days: crates were racked against the warehouse and landed in the workshop`);
  assert(r.within, `the fleet ended outside its site: ${r.kw} kW against ${r.cap} kW, ${r.space} units against ${r.siteSpace}`);
  /* And the machines are held, not destroyed. Refusing to rack them is only acceptable
     because they stay on the books and go in as soon as there is somewhere to put them. */
  assert(r.installed + r.crated === 420, `machines went missing: ${r.installed} racked + ${r.crated} crated`);
  assert(r.installed > 0, "nothing was racked at all; the bay has stopped working rather than started measuring");
});

rule("a downsize counts the machines still being commissioned, not just the installed ones", () => {
  /* Crates already paid for arrive whether or not the site shrank under them. This was a real
     stranding: 20 machines installed, 200 mid-commission, the workshop accepted the move, and
     the floor landed 5x over its power cap with no way back. The guard has to price the inbound. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.cash=1e8;state.hardware={s19:20};
    state.thermal={temperature:22,orders:[],equipment:{axial:2}};
    state.commissioningJobs=[{id:"s19",qty:200,done:0,started:state.time,due:state.time+10*DAY,days:10}];`)}
    const reason=facilityDownsizeBlockReason("workshop");
    downsizeFacility("workshop");
    const dispatched=!!state.facilityUpgradeJob;
    let over=false;
    for(let d=0;d<60;d++){tick(true);if(!fleet().within)over=true}
    return {reason,dispatched,everOverCapacity:over,facility:state.facility,
      within:fleet().within,kw:+fleet().potentialKw.toFixed(1),cap:fleet().cap,
      installed:state.hardware.s19}})()`);
  assert(r.reason !== "", "the workshop accepted a move with 200 machines mid-commission; it cannot hold them");
  assert(/commission/i.test(r.reason), `the refusal should say the inbound hardware is the reason, but read: ${r.reason}`);
  assert(!r.dispatched, "the move was dispatched despite being refused");
  assert(r.installed === 220, `the 200 commissioning machines should still land, got ${r.installed}`);
  assert(!r.everOverCapacity, "the site went over capacity at some point in the 60 days after the refusal");
  assert(r.within, `the fleet ended outside its site: ${r.kw} kW against ${r.cap} kW`);
});

rule("the cooling plant a smaller site cannot host is sold with the site", () => {
  const moved = json(`(()=>{${SITE(`state.time=at("2019-06-01");state.facility="warehouse";
    state.region="texas";state.cash=5e6;state.hardware={};state.hardware.s9=40;
    state.thermal={temperature:22,orders:[],equipment:{drycooler:2,evap:3,axial:4}};`)}
    const shed=facilityCoolingShed("workshop");
    const blockedBefore=facilityDownsizeBlockReason("workshop");
    const cashBefore=state.cash;
    downsizeFacility("workshop");
    return {shedIds:shed.items.map(i=>i.id),credit:shed.credit,blockedBefore,
      job:state.facilityUpgradeJob&&state.facilityUpgradeJob.id,
      equipmentAfter:state.thermal.equipment,netCash:cashBefore-state.cash,
      cost:facilityDownsizeCost(FACILITIES.find(f=>f.id==="workshop"))}})()`);
  assert(moved.blockedBefore === "", `a 40-machine fleet should reach a workshop once the plant is shed, but: ${moved.blockedBefore}`);
  assert(moved.job === "workshop", "the move was not dispatched");
  /* A light industrial unit is tier 3. Dry coolers (6-8) and evaporative banks (5-7) are plant
     it cannot host; axial fans (3-5) are exactly what it can. The band is two-sided on purpose:
     a box fan rated for a spare room is no more installable in an industrial unit than a dry
     cooler is, so "what this site can host" is the only question asked. */
  assert(moved.shedIds.includes("drycooler") && moved.shedIds.includes("evap"), `plant the workshop cannot host was kept: ${moved.shedIds}`);
  assert(!moved.shedIds.includes("axial"), "plant the smaller site CAN host was sold anyway");
  assert(!("drycooler" in moved.equipmentAfter) && !("evap" in moved.equipmentAfter), "the shed plant is still installed");
  assert(moved.equipmentAfter.axial === 4, "the axial fans did not survive the move");
  assert(moved.credit > 0 && moved.netCash === moved.cost - moved.credit,
    `salvage was not credited (net ${moved.netCash}, expected ${moved.cost} - ${moved.credit})`);
});

rule("a move down the ladder still carries transit risk", () => {
  const risk = json(`(()=>{${SITE(`state.time=at("2016-06-01");state.facility="warehouse";state.region="texas";`)}
    return {down:facilityMoveRisk("workshop"),up:facilityMoveRisk("campus"),same:facilityMoveRisk("warehouse")}})()`);
  assert(risk.same === 0, "staying put cannot be risky");
  assert(risk.down > 0, "machines are unracked, driven and re-racked; that cannot be free of risk");
  assert(risk.down < risk.up, "moving down should be less hazardous than an expansion, not more");
});

/* ---- PROTOCOL: rules Bitcoin itself enforces, which the game may never bend ---- */

rule("the subsidy halves on whole satoshis", () => {
  const sats = json(`[["2009-01-03",5000000000],["2012-11-29",2500000000],["2016-07-10",1250000000],
    ["2020-05-12",625000000],["2024-04-20",312500000]].map(([d,want])=>[d,subsidySatsAt(at(d)),want])`);
  for (const [date, actual, want] of sats) {
    assert(actual === want, `subsidy at ${date} is ${actual}, not ${want}`);
    assert(Number.isInteger(actual), `subsidy at ${date} is not a whole number of satoshis`);
  }
});

rule("the subsidy grinds down to one satoshi and then to nothing", () => {
  assert(run(`subsidySatsAt(at("2009-01-03"))`) === 5000000000, "genesis subsidy is wrong");
  // Integer division ends the issuance schedule exactly, and it ends late: 32 halvings still
  // leave a single satoshi, and only the 33rd takes it to zero.
  assert(run(`subsidySatsAt(at("2140-01-01"))`) === 1, "the 32nd halving should still pay one satoshi");
  assert(run(`subsidySatsAt(at("2144-01-01"))`) === 0, "the subsidy never reaches zero");
  assert(run(`subsidySatsAt(at("2200-01-01"))`) === 0, "the subsidy comes back after reaching zero");
});

rule("difficulty only changes at a recorded retarget", () => {
  const changes = run(`(()=>{let t=at("2016-01-01"),prev=difficultyAt(t),changes=0;
    for(let i=0;i<365;i++){t+=DAY;const d=difficultyAt(t);if(d!==prev){changes++;prev=d}}return changes})()`);
  assert(changes > 20 && changes < 40, `difficulty changed ${changes} times in 2016; a 2016-block retarget is roughly 26 a year`);
});

/* ---- ORDER-BOOK DEPTH: an early fortune must not be a liquid one ---- */

rule("a large sale into a thin market moves the price against you", () => {
  const impact = run(`(()=>{${SITE(`state.time=at("2010-12-01");`)}
    return tradeImpact(40400*priceAt(state.time),1)})()`);
  assert(impact > 0.3, `dumping the idle windfall in Dec 2010 costs only ${(impact * 100).toFixed(1)}% - the book is too deep`);
});

rule("the same order is invisible once the market is deep", () => {
  const impact = run(`(()=>{${SITE(`state.time=at("2026-08-01");`)}
    return tradeImpact(1000*priceAt(state.time),1)})()`);
  assert(impact < 0.02, `a 1,000 BTC sale at the cutoff costs ${(impact * 100).toFixed(2)}%, which is too punitive for a deep market`);
});

rule("slicing an order does not dodge the impact", () => {
  const ratio = run(`(()=>{${SITE(`state.time=at("2010-12-01");`)}
    const total=40400*priceAt(state.time);
    const oneShot=total*(1-tradeImpact(total,1));
    state.marketPressure={usd:0,at:0};
    let sliced=0;
    for(let i=0;i<100;i++){const q=total/100;sliced+=q*(1-tradeImpact(q,1));addPressure(q,1)}
    return sliced/oneShot})()`);
  assert(ratio < 2, `slicing into 100 orders returns ${ratio.toFixed(2)}x the proceeds; standing pressure is not accumulating`);
});

/* ---- POWER CONTRACTS: four options, none of them dead ---- */

rule("every power contract is the best choice somewhere", () => {
  const winners = json(`(()=>{
    const seen={};
    for(const d of ["2017-06-01","2021-06-01","2022-06-01","2023-01-01","2024-06-01"]){
      for(const [reg,fac,hw,n] of [["iceland","campus","s19",1200],["texas","campus","s19",1200],
                                   ["na","warehouse","s9",120],["sichuan","campus","s19",1500]]){
        if(at(d)<at("2017-01-01"))continue;
        let best=null;
        for(const c of POWER_CONTRACTS){
          ${SITE(``)}
          state.time=at(d);state.facility=fac;state.region=reg;state.hardware={[hw]:n};state.contract=c.id;
          const f=fleet(),mc=monthlyCost();
          const p=expectedDailyBtcForHash(f.hash)*contractUptimeFactor()*priceAt(state.time)*30.4375-mc.total;
          if(!best||p>best.p)best={id:c.id,p};
        }
        seen[best.id]=(seen[best.id]||0)+1;
      }
    }
    return seen;})()`);
  for (const id of ["spot", "fixed", "curtail"]) {
    assert(winners[id] > 0, `no scenario prefers the ${id} contract - it is a dead option (winners: ${JSON.stringify(winners)})`);
  }
});

rule("curtailment deepens when the grid is short", () => {
  const calm = run(`(()=>{${SITE(`state.time=at("2019-06-01");state.contract="curtail";`)}return curtailmentIntensity()})()`);
  const shock = run(`(()=>{${SITE(`state.time=at("2022-06-01");state.contract="curtail";`)}return curtailmentIntensity()})()`);
  assert(calm < 0.15, `curtailment gives up ${(calm * 100).toFixed(0)}% of load in a calm month`);
  assert(shock > calm * 3, `curtailment barely deepens during a shock (${(calm * 100).toFixed(0)}% -> ${(shock * 100).toFixed(0)}%)`);
});

rule("curtailment is paid for the capacity it releases", () => {
  const credit = run(`(()=>{${SITE(`state.time=at("2022-06-01");state.facility="campus";state.region="texas";
    state.hardware={s19:600};state.contract="curtail";`)}
    const f=fleet();return curtailmentCreditDaily(f.w*contractLoadFactor())})()`);
  assert(credit > 0, "releasing capacity during a shock earns nothing, which is the only reason anyone signs the contract");
});

rule("the credit never turns the operating bill negative", () => {
  const worst = run(`(()=>{let worst=Infinity;
    for(const [reg,fac,hw,n] of [["iran","campus","s19",2700],["sichuan","megacampus","s21xp",49000],
                                 ["texas","hydroplant","s19",20000]]){
      ${SITE(``)}
      state.time=at("2022-06-01");state.facility=fac;state.region=reg;state.hardware={[hw]:n};state.contract="curtail";
      worst=Math.min(worst,monthlyCost().total);
    } return worst})()`);
  assert(worst >= 0, `an operating bill went to ${Math.round(worst)}; settlement would pay the player`);
});

/* ---- CONNECTIVITY: three plans, three different jobs ---- */

rule("every connectivity plan is the best choice somewhere", () => {
  const winners = json(`(()=>{
    const seen={},h=HARDWARE.find(x=>x.id==="s21xp");
    for(const reg of ["na","iceland","sichuan","kazakhstan","texas","iran","kenya","bhutan"]){
      for(const f of FACILITIES){
        if(at(f.date)>at("2025-06-01"))continue;
        const cap=Math.max(0,Math.min(Math.floor(f.kw*1000/h.w),Math.floor(f.space/h.space)));
        if(!cap)continue;
        const n=Math.max(1,Math.round(cap*0.77));
        let best=null;
        // "No internet" is the line cut, not a service to compare: it earns nothing by design.
        for(const p of CONNECTIVITY_PLANS.filter(x=>x.id!==OFFLINE_PLAN_ID)){
          ${SITE(``)}
          state.time=at("2025-06-01");state.facility=f.id;state.region=reg;
          state.hardware={s21xp:n};state.connectivity=p.id;
          // A plan you cannot buy here is not a choice available here.
          if(!connectivityAvailable(p))continue;
          const fs=fleet();
          const rev=expectedDailyBtcForHash(fs.hash)*priceAt(state.time)*30.4375;
          const value=(p.payout-1)*rev-internetMonthlyCost()
            -rev*(connectivityIncidentRisk()*3*(p.failover??1)/30.4375);
          if(!best||value>best.v)best={id:p.id,v:value};
        }
        seen[best.id]=(seen[best.id]||0)+1;
      }
    }
    return seen;})()`);
  for (const id of ["fixed", "sim", "fiber"]) {
    assert(winners[id] > 0, `no site prefers the ${id} plan - it is a dead option (winners: ${JSON.stringify(winners)})`);
  }
});

rule("a failover link's outages are measured in hours, not days", () => {
  /* Measured by running the clock, not by reading the plan table: the table can declare a
     failover the tick never applies, and a source match cannot see that gap.

     Measured over MANY SHORT RUNS rather than one long one. The connectivity branch only fires
     on days the grid branch did not, so a single 2,900-day run yielded nought to two outages
     per arm depending on where the shared random stream happened to be - which meant an
     unrelated change elsewhere in the tick could decide whether this rule had any evidence at
     all. It did exactly that when mining income stopped landing in the hot wallet every day:
     the hot-wallet risk check began short-circuiting, the stream shifted, and this rule lost
     its sample. Ten independent seeds give it enough outages per arm and a verdict
     that does not move. */
  const measured = json(`(()=>{
    const out={};
    for(const plan of ["fixed","sim"]){
      const spells=[];let days=0;
      for(let seed=1;seed<=10;seed++){
        ${SITE(``)}
        // A container yard in a jurisdiction with a poor record: the highest connectivity
        // fault rate the game offers, so both arms actually see incidents.
        state.time=at("2021-06-01");state.facility="container";state.region="kazakhstan";
        state.hardware={s19:200};state.connectivity=plan;
        state.seed=seed*7919;state.rng=seed*7919;
        const startedAt=state.time;
        for(let d=0;d<300;d++){
          const before=state.ops.outageUntil;
          tick();
          if(state.ops.outageUntil&&state.ops.outageUntil!==before&&state.ops.outageUntil>state.time)
            spells.push((state.ops.outageUntil-state.time)/DAY);
        }
        days+=(state.time-startedAt)/DAY;
      }
      out[plan]={spells,days};
    }
    return out;})()`);
  for (const plan of ["fixed", "sim"]) {
    assert(measured[plan].days > 2500, `the ${plan} arm only advanced ${measured[plan].days} days, so this rule proves nothing`);
    assert(measured[plan].spells.length >= 4, `the ${plan} arm saw ${measured[plan].spells.length} outages, which is too few to average`);
  }
  // Compared as a ratio of mean duration rather than against a fixed number of days: the
  // base outage length scales with a jurisdiction's fault rate, so in a bad one even a
  // fifteen-percent outage can run past a day without anything being wrong.
  const mean = a => a.reduce((sum, v) => sum + v, 0) / a.length;
  const failover = mean(measured.sim.spells), plain = mean(measured.fixed.spells);
  assert(failover < plain * .4,
    `dual-SIM outages average ${failover.toFixed(2)} days against fixed broadband's ${plain.toFixed(2)}; the failover is declared but the clock is not applying it`);
  const sim = json(`CONNECTIVITY_PLANS.find(p=>p.id==="sim")`);
  assert(sim.payout >= 1, "dual-SIM charges a standing revenue penalty for a link the site is not normally using");
});

/* ---- HARDWARE: newest wins on dear power, cheap-and-old wins on cheap power ---- */

rule("hardware prices fall after release", () => {
  const path = json(`(()=>{const h=HARDWARE.find(x=>x.id==="s9");const out=[];
    for(const d of ["2017-06-01","2019-06-01","2021-06-01","2025-06-01"]){
      ${SITE(``)} state.time=at(d);out.push(Math.round(hardwareUnitCost(h)));}
    return out})()`);
  for (let i = 1; i < path.length; i += 1) {
    assert(path[i] < path[i - 1], `the S9 did not get cheaper between samples: ${path.join(" -> ")}`);
  }
  assert(path[path.length - 1] < path[0] * 0.2, `the S9 only fell to ${path[path.length - 1]} from ${path[0]}`);
});

rule("a machine cannot be bought and immediately resold at a profit", () => {
  const worst = run(`(()=>{let worst=0;
    for(const h of HARDWARE.filter(x=>!x.permanent)){
      for(const age of [0.5,1,2,3,4,6,9]){
        const t=at(h.date)+age*365*DAY; if(t>END)continue;
        ${SITE(``)} state.time=t;
        const buy=hardwareUnitCost(h),sell=resaleHardwareValue(h);
        if(buy>0)worst=Math.max(worst,sell/buy);
      }
    } return worst})()`);
  assert(worst < 1, `a machine resells for ${worst.toFixed(2)}x what it costs to buy`);
});

rule("the newest machine still wins where power is expensive", () => {
  const best = run(`(()=>{${SITE(`state.time=at("2025-06-01");state.facility="campus";state.region="na";`)}
    const t=state.time;
    const avail=HARDWARE.filter(h=>t>=at(h.date)&&!h.permanent);
    const scored=avail.map(h=>{
      ${SITE(``)} state.time=t;state.facility="campus";state.region="na";state.hardware={[h.id]:1};
      const f=fleet();
      const net=expectedDailyBtcForHash(f.hash)*contractUptimeFactor()*priceAt(t)
                -dailyEnergyCostForWatts(f.w*contractLoadFactor(),t,region());
      return {id:h.id,pay:net>0?hardwareUnitCost(h)/net:Infinity};
    }).sort((a,b)=>a.pay-b.pay);
    const newest=avail.slice().sort((a,b)=>at(b.date)-at(a.date))[0];
    return scored[0].id===newest.id})()`);
  assert(best === true, "on expensive power an older machine now out-earns the newest, which is not how mining works");
});

rule("an old machine bought cheap can win where power is cheap", () => {
  const older = run(`(()=>{
    const t=at("2025-06-01");
    const avail=HARDWARE.filter(h=>t>=at(h.date)&&!h.permanent);
    const scored=avail.map(h=>{
      ${SITE(``)} state.time=t;state.facility="campus";state.region="iran";state.hardware={[h.id]:1};
      const f=fleet();
      const net=expectedDailyBtcForHash(f.hash)*contractUptimeFactor()*priceAt(t)
                -dailyEnergyCostForWatts(f.w*contractLoadFactor(),t,region());
      return {id:h.id,pay:net>0?hardwareUnitCost(h)/net:Infinity};
    }).sort((a,b)=>a.pay-b.pay);
    const newest=avail.slice().sort((a,b)=>at(b.date)-at(a.date))[0];
    return scored[0].id!==newest.id})()`);
  assert(older === true, "on the cheapest power in the game the newest machine is still the only answer");
});

rule("a used machine arrives worn but never pre-broken", () => {
  const worst = run(`(()=>{let worst=100;
    for(const h of HARDWARE.filter(x=>!x.permanent)){
      const t=Math.min(END,at(h.date)+9*365*DAY);
      ${SITE(``)} state.time=t;
      worst=Math.min(worst,incomingConditionFor(h));
    } return worst})()`);
  assert(worst >= 66, `a used machine can arrive at ${worst}% condition, below the 65% threshold that takes a type offline`);
  assert(worst < 100, "age does not affect the condition a machine arrives in");
});

/* ---- KEYS: devices, keys and wallets are three different things ---- */

const CUSTODY_SITE = (overrides = "") => `
  ${SITE(``)}
  state.skills=["backups","counterparty","multisig"];state.cash=1e7;
  state.facility="warehouse";state.region="na";state.hardware={};
  state.wallets={hot:10,cold:40,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
  state.custody={devices:[],keys:[],policy:"single",assigned:[],configBackedUp:false,
    orders:[],parts:{},builds:[],exposure:[],seq:0,lastScare:0};
  state.coldSpends=[];
  ${overrides}`;

/* A wallet that is actually finished: distinct seeds, durable backups, assigned to the policy,
   and - for a quorum - the descriptor written down too. Several rules need a wallet that can
   really sign rather than one that merely has a policy set on it, and building it by hand in
   each of them is how they drift apart. */
const CONFIGURED_WALLET = (policy = "2of3") => `
  setCustodyPolicy("${policy}");
  state.custody.keys=[];state.custody.assigned=[];
  for(let i=0;i<custodyPolicy("${policy}").keys;i++){
    const id="k"+i;
    state.custody.keys.push({id,seed:"s"+i,label:"KEY "+i,weakEntropy:false,
      backup:{durability:"steel"}});
    state.custody.assigned.push(id);
  }
  state.custody.configBackedUp=true;`;

rule("three devices holding one seed are still one key", () => {
  const result = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    for(let i=0;i<3;i++)orderCustodyProduct("jade",1);
    for(let i=0;i<16;i++)tick();
    (()=>{inspectWorkshopDevice(state.custody.devices[0].uid);prepareWorkshopDevice(state.custody.devices[0].uid);generateCustodyKey(state.custody.devices[0].uid)})();
    const seed=state.custody.keys[0];
    restoreCustodyKey(state.custody.devices[1].uid,seed.id);
    restoreCustodyKey(state.custody.devices[2].uid,seed.id);
    setCustodyPolicy("2of3");
    assignCustodyKey(seed.id);assignCustodyKey(seed.id);
    const set=custodySetup();
    return {devices:state.custody.devices.length,assigned:state.custody.assigned.length,
      distinct:set.distinct,ready:set.ready};})()`);
  assert(result.devices === 3, "the three devices did not arrive");
  assert(result.distinct === 1, `three devices on one seed counted as ${result.distinct} keys`);
  assert(!result.ready, "a 2-of-3 built from a single seed counts as configured, which is a single-signature wallet in three boxes");
});

rule("a quorum wallet needs its configuration, not just its seeds", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    setCustodyPolicy("2of3");
    for(let i=0;i<3;i++)orderCustodyProduct("jade",1);
    orderCustodyProduct("steelplate",3);
    for(let i=0;i<20;i++)tick();
    for(const d of state.custody.devices)(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})();
    for(const k of state.custody.keys){assignCustodyKey(k.id);backupCustodyKey(k.id,"steelplate")}
    const withoutConfig={loss:custodyLossRisk(),recoverable:custodyRecoverable()};
    backupCustodyConfig();
    const withConfig={loss:custodyLossRisk(),recoverable:custodyRecoverable()};
    // and a fully backed-up single-sig, for comparison
    const multi=custodyCompromiseFactor();
    setCustodyPolicy("single");
    const single=custodyCompromiseFactor();
    return {withoutConfig,withConfig,multi,single};})()`);
  assert(!r.withoutConfig.recoverable, "a multisig with every seed backed up but no descriptor reports as recoverable, which is how people have really lost coins");
  assert(r.withConfig.recoverable, "recording the configuration does not make the wallet recoverable");
  assert(r.withConfig.loss < r.withoutConfig.loss * .5, "recording the configuration barely changes the risk of losing access");
  assert(r.multi < r.single, "a spending quorum gives no protection against a compromised key");
});

rule("buying equipment protects nothing until it is configured", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    const bare=custodyCompromiseFactor();
    orderCustodyProduct("jade",1);
    for(let i=0;i<16;i++)tick();
    const owned=custodyCompromiseFactor();
    (()=>{inspectWorkshopDevice(state.custody.devices[0].uid);prepareWorkshopDevice(state.custody.devices[0].uid);generateCustodyKey(state.custody.devices[0].uid)})();
    const keyed=custodyCompromiseFactor();
    assignCustodyKey(state.custody.keys[0].id);
    const assigned=custodyCompromiseFactor();
    return {bare,owned,keyed,assigned};})()`);
  assert(r.owned === r.bare, "a device sitting in a drawer improves the compromise risk");
  assert(r.keyed === r.bare, "generating a key protects coins before it is assigned to a wallet");
  assert(r.assigned < r.bare, "assigning a key to the wallet changes nothing, so configuration is cosmetic");
});

rule("a build consumes its components and respects its unlock date", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2019-01-01");`)}
    const early=custodyProductAvailable(custodyProduct("seedsigner"));
    state.time=at("2021-01-01");
    for(const pid of ["pizero","ssdcamera","sslcd","ssmicrosd"])orderCustodyProduct(pid,1);
    for(let i=0;i<16;i++)tick();
    const stocked={...state.custody.parts};
    const shortfall=custodyBuildShortfall("seedsigner");
    assembleCustodyBuild("seedsigner");
    const afterParts={...state.custody.parts};
    for(let i=0;i<4;i++)tick();
    const device=state.custody.devices[0]||null;
    return {early,stocked,shortfall,afterParts,
      built:device?device.product:null,supplier:device?device.supplier:null};})()`);
  assert(r.early === false, "a SeedSigner can be built before the project existed");
  assert(Object.values(r.stocked).every(n => n >= 1), "the components never arrived");
  assert(r.shortfall === null, "the build reports missing components when every one is in stock");
  assert(Object.values(r.afterParts).every(n => n === 0), `assembly did not consume its components: ${JSON.stringify(r.afterParts)}`);
  assert(r.built === "seedsigner", "the assembly produced no device");
  assert(r.supplier === "selfbuilt", "a self-built signer is attributed to a vendor");
});

rule("a guessable seed is a property of the key, and a quorum survives one of them", () => {
  const r = json(`(()=>{
    const born=(product,when)=>{
      ${CUSTODY_SITE(``)}
      state.time=at(when);orderCustodyProduct(product,1);
      for(let i=0;i<18;i++)tick();
      const d=state.custody.devices.find(x=>x.product===product);
      (()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})();
      return !!state.custody.keys[0].weakEntropy;
    };
    const drained=(build)=>{
      ${CUSTODY_SITE(`state.time=at("2022-06-01");`)}
      build();
      state.time=at("2026-07-30");
      applyEvent(EVENTS.find(e=>e.id==="coldcardentropy"));
      const before=state.wallets.hot+state.wallets.cold;
      for(let i=0;i<6;i++)tick();
      return {before,after:state.wallets.hot+state.wallets.cold};
    };
    const own=(product,when)=>{state.time=at(when);orderCustodyProduct(product,1);
      for(let i=0;i<18;i++)tick();
      return state.custody.devices.find(x=>x.product===product&&!x.keyId);};
    return {
      beforeWindow:born("coldcard","2019-01-01"),
      inWindow:born("coldcardmk4","2022-06-01"),
      differentVendor:born("jade","2022-06-01"),
      singleWeak:drained(()=>{const d=own("coldcardmk4","2022-06-01");(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})();
        assignCustodyKey(state.custody.keys[0].id)}),
      singleSound:drained(()=>{const d=own("jade","2022-06-01");(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})();
        assignCustodyKey(state.custody.keys[0].id)}),
      quorumOneWeak:drained(()=>{setCustodyPolicy("2of3");
        for(const p of ["coldcardmk4","jade","bitbox02"]){const d=own(p,"2022-06-01");(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})()}
        for(const k of state.custody.keys)assignCustodyKey(k.id);backupCustodyConfig()}),
      quorumTwoWeak:drained(()=>{setCustodyPolicy("2of3");
        for(const p of ["coldcardmk4","coldcard","jade"]){const d=own(p,"2022-07-01");(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})()}
        for(const k of state.custody.keys)assignCustodyKey(k.id);backupCustodyConfig()}),
    };})()`);
  const lost = x => x.before - x.after > 0.01;
  assert(r.inWindow, "a seed generated on an affected device inside the window is not marked weak");
  assert(!r.beforeWindow, "a seed generated before the defect existed is marked weak");
  assert(!r.differentVendor, "a seed from a different vendor is caught by this vendor's defect");
  assert(lost(r.singleWeak), "a single-signature wallet on a guessable seed was not swept");
  assert(!lost(r.singleSound), "a wallet with no affected key lost coins anyway");
  assert(!lost(r.quorumOneWeak), "a 2-of-3 was emptied though only one of its three keys was guessable");
  assert(lost(r.quorumTwoWeak), "a 2-of-3 whose quorum is entirely guessable keys survived, which it must not");
});

rule("a vendor leak reaches that vendor's customers and no one else", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2016-08-01");`)}
    const held=state.wallets.hot+state.wallets.cold;
    orderCustodyProduct("nanos",1);      for(let i=0;i<12;i++)tick();
    orderCustodyProduct("trezorone",1);  for(let i=0;i<12;i++)tick();
    state.time=at("2021-06-01");
    orderCustodyProduct("nanox",1);      for(let i=0;i<12;i++)tick();
    applyEvent(EVENTS.find(e=>e.id==="ledgerbreach"));
    const hit=custodyExposedPurchases().map(x=>x.device.product);
    return {hit,held,after:state.wallets.hot+state.wallets.cold,
      owned:state.custody.devices.map(d=>d.product)};})()`);
  assert(r.owned.length === 3, "the three devices did not all arrive");
  assert(r.hit.includes("nanos"), "a device bought from the affected vendor inside the window is not exposed");
  assert(!r.hit.includes("trezorone"), "a different vendor's customer was caught by this vendor's leak");
  assert(!r.hit.includes("nanox"), "a purchase made after the window closed was caught by the leak");
  assert(Math.abs(r.after - r.held) < 1e-9, "the disclosure moved coins by itself, which a customer-data breach does not do");
});

rule("the signing ceremony is described as the one the wallet actually has", () => {
  /* `threshold>1` decides two things, and I contracted only the first. The fee premium is
     asserted elsewhere; this is the sentence. Inclusive, and a single-key operator is told
     their coins were released by "1 signatures gathered from 1 keys held apart" - quorum
     language, wrong grammar, and a description of protection they do not have, in the feature
     built to teach the difference. The activity ledger is where it lands, so that is where
     this reads it rather than trusting the expression's shape. */
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("single")}
    state.activity=[];state.wallets.cold=5;state.wallets.hot=0;
    transfer("cold","hot",.5);
    const singleEntry=(state.activity.find(e=>/Cold spend signing started/.test(e.text))||{}).amount||"";
    ${CONFIGURED_WALLET("2of3")}
    state.coldSpends=[];state.activity=[];state.wallets.cold=5;state.wallets.hot=0;
    transfer("cold","hot",.5);
    const quorumEntry=(state.activity.find(e=>/Cold spend signing started/.test(e.text))||{}).amount||"";
    return {single:String(singleEntry),quorum:String(quorumEntry)}})()`);
  assert(r.single !== "", "a single-key cold spend logged nothing, so the rule tests nothing");
  assert(r.quorum !== "", "a quorum cold spend logged nothing, so the rule tests nothing");
  assert(/one key retrieved/.test(r.single),
    `a single-key wallet should describe one key being retrieved, but logged: "${r.single}"`);
  assert(!/signatures gathered/.test(r.single),
    `a single-key wallet was described as gathering signatures from keys held apart: "${r.single}"`);
  assert(/signatures gathered from/.test(r.quorum),
    `a quorum wallet should describe gathering signatures, but logged: "${r.quorum}"`);
  assert(/2 signatures gathered from 3 keys/.test(r.quorum),
    `a 2-of-3 wallet should name its own threshold and key count: "${r.quorum}"`);
});

rule("moving coins between wallets conserves them, and leaving cold takes signing", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("2of3")}
    const before=state.wallets.hot+state.wallets.cold;
    transfer("cold","hot",.5);
    /* Cold storage protects coins by making them hard to spend, which necessarily includes
       hard for their owner. The coins have left cold and have not arrived: they are in flight,
       still the operator's, and not yet spendable. */
    const inflight={hot:state.wallets.hot,cold:state.wallets.cold,jobs:state.coldSpends.length,
      pending:coldSpends().reduce((a,j)=>a+(Number(j.gross)||0),0),days:coldSpendDays()};
    /* Driven through tick(), not by calling the advance directly: a rule that calls the helper
       proves the helper works and passes with the tick call deleted. */
    let ticks=0;
    while(state.coldSpends.length&&ticks<40){tick(true);ticks++}
    const after=state.wallets.hot+state.wallets.cold;
    return {before,inflight,ticks,after,fee:before+inflight.pending-after-inflight.pending,
      settled:before-after};})()`);
  assert(r.inflight.jobs === 1, "leaving cold storage completed instantly, so cold storage costs nothing");
  assert(r.inflight.pending > 0, "coins left cold storage and went nowhere");
  /* A 2-of-3 is two keys in two places, and every signature beyond the first is another
     journey. It must take longer than a single key would. */
  assert(r.inflight.days >= 2, `a 2-of-3 cold spend took ${r.inflight.days} day; a quorum is kept apart on purpose`);
  assert(r.ticks > 0 && r.ticks <= r.inflight.days + 1, `the signing took ${r.ticks} ticks against an estimate of ${r.inflight.days}`);
  assert(r.settled > 0, "the completed transfer cost nothing");
  assert(r.settled < .001, `a transfer cost ${r.settled} BTC, which is not a network fee`);
});

/* ---- THE BILL IS A CUSTODY EVENT: how far away the money is, and what it costs to fetch ---- */

rule("leaving cold storage is priced by the weight of the coins and the day's rate", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(``)}
    ${CONFIGURED_WALLET("single")}
    const fee=(date,coins)=>{state.time=at(date);state.utxo={cold:coins,hot:0};return transferNetworkFee("cold",1)};
    return{busy:fee("2017-12-15",1),calm:fee("2019-01-15",1),few:fee("2017-12-15",2),many:fee("2017-12-15",200),
      early:fee("2010-06-01",1),partial:(state.utxo={cold:10,hot:0},transferNetworkFee("cold",.5))
        - (state.utxo={cold:10,hot:0},transferNetworkFee("cold",1))};})()`);
  // The same transaction costs far more on the day blocks were full of fees than a year later.
  assert(r.busy > r.calm * 5, `a sweep cost ${r.busy} in December 2017 and ${r.calm} in January 2019; the fee is not following the market`);
  // Every extra coin is more weight to pay for.
  assert(r.many > r.few * 20, `200 coins cost ${r.many} against ${r.few} for two, so the number of payouts does not matter`);
  assert(r.early > 0 && r.early < r.busy, "a sweep in 2010 should cost something, and far less than at the 2017 peak");
  // A partial spend gathers fewer coins, though it pays for a change output.
  assert(r.partial < 0, "spending half the reserve cost as much as spending all of it");
});

rule("every payout is a coin to gather later, and a spend leaves one coin of change", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("single")}
    state.utxo={cold:0,hot:0};state.poolAccount.destination="cold";
    for(let i=0;i<5;i++)creditPayout("cold",.1);
    const received=utxoState().cold;
    transfer("cold","hot",.5);
    const afterHalf=utxoState().cold;
    state.coldSpends=[];state.wallets.cold=1;
    transfer("cold","hot",1);
    return{received,afterHalf,afterAll:utxoState().cold};})()`);
  assert(r.received === 5, `five payouts to cold storage made ${r.received} coins`);
  // Half of five coins gathers three of them, and the rest goes back as one change coin.
  assert(r.afterHalf === 3, `spending half of five coins left ${r.afterHalf}; it should gather three and return one change coin`);
  assert(r.afterAll === 0, `spending everything left ${r.afterAll} coins in a wallet that is now empty`);
});

rule("how far away the reserve is, and whether that beats the bill", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-28");`)}
    ${CONFIGURED_WALLET("single")}
    const single=treasuryReach();
    ${CONFIGURED_WALLET("2of3")}
    const quorum=treasuryReach();
    state.time=at("2021-02-10");
    return{single,quorum,early:treasuryReach()};})()`);
  assert(r.single.cold > 0 && r.single.reachDays >= 1, "a reserve in cold storage reported no distance");
  assert(r.quorum.reachDays > r.single.reachDays, "a quorum is kept in more than one place, so it must be further away than one key");
  // A day before the bill, one key is close enough and a quorum is not.
  assert(r.single.daysToBill === 1 && !r.single.coldTooSlow, "one key, a day from the bill, was reported as too slow");
  assert(r.quorum.coldTooSlow, "a quorum two days away was reported as in time for a bill due tomorrow");
  assert(!r.early.coldTooSlow && r.early.daysToBill > 10, "mid-month, the reserve was reported as too slow for a bill weeks away");
});

rule("coins in flight are still the operator's, and still counted", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("single")}
    const before=totalBtc(),worth=netWorth();
    transfer("cold","hot",.5);
    return{before,during:totalBtc(),worth,worthDuring:netWorth(),inFlight:coldInFlightBtc(),
      fee:state.coldSpends[0].fee,spendable:marketLiquidBtc()};})()`);
  assert(r.inFlight > 0, "coins left cold storage and are counted nowhere");
  close(r.during, r.before - r.fee, 1e-9, "the coins in flight were lost from the total, or counted twice");
  assert(r.worthDuring > r.worth * 0.99 - 1, "net worth fell by more than the network fee while coins were in the air");
  assert(r.spendable < 11, "coins in flight were offered as sellable");
});

rule("a rush is faster, costs more, and cannot make a quorum arrive together", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.skills.push("airgap");`)}
    ${CONFIGURED_WALLET("single")}
    const single={normal:coldSpendDays(),rush:coldSpendDays(state,{rush:true}),
      fee:transferNetworkFee("cold",1),rushFee:transferNetworkFee("cold",1,{rush:true}),mult:rushMultiple(state.time)};
    ${CONFIGURED_WALLET("2of3")}
    return{single,quorum:{normal:coldSpendDays(),rush:coldSpendDays(state,{rush:true})}};})()`);
  assert(r.single.rush < r.single.normal && r.single.rush >= 1, `a rushed air-gapped single key took ${r.single.rush} against ${r.single.normal}`);
  assert(r.quorum.rush < r.quorum.normal, "rushing did nothing for a quorum");
  assert(r.quorum.rush >= 2, `a rushed quorum took ${r.quorum.rush} day; two keys kept apart cannot arrive together`);
  // The multiple is the day's recorded 90th-percentile rate over its median, kept between two and six.
  assert(r.single.mult >= 2 && r.single.mult <= 6, `a rush's multiple of ${r.single.mult} is outside what the record allows`);
  close(r.single.rushFee, r.single.fee * r.single.mult, 1e-12, "a rush should pay the day's queue-jumping multiple of the ordinary fee");
});

rule("the clock is stopped during a settlement, so a signing started then is refused", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2017-01-01");state.hardware={s9:100};state.cash=0;state.speed=1;`)}
    ${CONFIGURED_WALLET("single")}
    state.wallets.hot=0;state.wallets.cold=40;
    for(let n=0;n<120&&!state.pendingSettlement;n++)tick(true);
    const pending=!!state.pendingSettlement,coldBefore=state.wallets.cold;
    const reason=coldSpendBlockReason();
    transfer("cold","hot",.5);
    return{pending,reason,jobs:state.coldSpends.length,coldBefore,coldAfter:state.wallets.cold};})()`);
  assert(r.pending, "no settlement was queued, so this rule proves nothing");
  assert(/clock/i.test(r.reason), `the refusal does not say why: "${r.reason}"`);
  assert(r.jobs === 0 && r.coldAfter === r.coldBefore, "coins left cold storage into a signing that could never finish");
});

rule("fetching the reserve restarts the clock and the coins land inside the grace month", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2017-01-01");state.hardware={s9:100};state.cash=0;state.speed=1;`)}
    ${CONFIGURED_WALLET("single")}
    state.wallets.hot=0;state.wallets.cold=40;
    for(let n=0;n<120&&!state.pendingSettlement;n++)tick(true);
    const paused={pending:!!state.pendingSettlement,reason:fetchReserveBlockReason(),plan:reservePlan(false)};
    fetchReserve(false);
    const started={pending:!!state.pendingSettlement,debt:state.debt,jobs:state.coldSpends.length,
      purpose:(state.coldSpends[0]||{}).purpose,speed:state.speed,cold:state.wallets.cold};
    let t=0;while(state.coldSpends.length&&t<40){tick(true);t++}
    return{paused,started,t,hot:state.wallets.hot,inTime:state.time<state.arrearsDue,gridCut:gridCutOff()};})()`);
  assert(r.paused.pending && r.paused.reason === "", `a player with a reserve was told they could not fetch it: "${r.paused.reason}"`);
  assert(r.paused.plan.gross > 0 && r.paused.plan.gross < 40, "the plan fetched nothing, or the whole reserve for a small bill");
  assert(!r.started.pending && r.started.debt > 0, "fetching the reserve did not carry the bill into the grace month");
  assert(r.started.speed > 0, "the clock was left stopped, so the signing could never land");
  assert(r.started.jobs === 1 && r.started.purpose === "settlement" && r.started.cold < 40, "no signing was started from the reserve");
  assert(r.t > 0 && r.hot > 0, "the coins never arrived");
  assert(r.inTime && !r.gridCut, "the coins landed after the grace month had already ended");
});

rule("fetching the reserve explains hard stops and can clear an earlier arrear", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2017-01-01");state.hardware={s9:100};state.cash=0;state.speed=1;`)}
    ${CONFIGURED_WALLET("single")}
    state.wallets.hot=0;state.wallets.cold=40;
    for(let n=0;n<120&&!state.pendingSettlement;n++)tick(true);
    const noArrearsNeed=reservePlan(false).need;
    state.debt=500;const arrears=fetchReserveBlockReason(),arrearsPlan=reservePlan(false);
    state.wallets.cold=0;const empty=fetchReserveBlockReason();state.wallets.cold=40;
    const keys=state.custody.assigned;state.custody.assigned=[];const unsigned=fetchReserveBlockReason();
    state.custody.assigned=keys;const ok=fetchReserveBlockReason(),debtBefore=state.debt;fetchReserve(false);
    const recovered={pending:!!state.pendingSettlement,debt:state.debt,jobs:state.coldSpends.length,cold:state.wallets.cold};
    return{arrears,noArrearsNeed,arrearsPlan,empty,unsigned,ok,debtBefore,recovered};})()`);
  assert(r.arrears === "" && r.arrearsPlan.need > r.noArrearsNeed, "an earlier arrear did not increase the reserve needed to recover");
  assert(/cold storage/i.test(r.empty), `an empty reserve was offered: "${r.empty}"`);
  assert(/cannot sign/i.test(r.unsigned), `a wallet that cannot sign was offered: "${r.unsigned}"`);
  assert(r.ok === "", `a valid reserve was refused: "${r.ok}"`);
  assert(!r.recovered.pending && r.recovered.jobs === 1 && r.recovered.debt > r.debtBefore,
    "a cold-only operation with arrears could not start a reserve rescue");
});

rule("a cold-only operation can fetch, sell and clear arrears after the grid is cut", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2040-06-01");state.sandbox=true;state.hardware={s19:100};state.cash=0;state.speed=1;`)}
    ${CONFIGURED_WALLET("single")}
    state.wallets.hot=0;state.wallets.cold=400;
    for(let n=0;n<120&&!state.pendingSettlement;n++)tick(true);
    const before={pending:!!state.pendingSettlement,cold:state.wallets.cold};
    state.debt=500;state.arrearsDue=state.time-DAY;state.gridCutAnnounced=true;state.power=false;
    fetchReserve(false);
    let ticks=0;while(state.coldSpends.length&&ticks<40){tick(true);ticks++}
    const landed={hot:state.wallets.hot,cold:state.wallets.cold,debt:state.debt,pending:!!state.pendingSettlement};
    const proceeds=state.wallets.hot*priceAt(state.time)*(1-RESERVE_FEE);state.cash+=proceeds;state.wallets.hot=0;
    payDebt();
    return{before,landed,ticks,after:{cash:state.cash,debt:state.debt,power:state.power,cut:gridCutOff(),cold:state.wallets.cold}};})()`);
  assert(r.before.pending, "the 2040 stress state did not reach a settlement pause");
  assert(r.landed.hot>0 && r.landed.cold<r.before.cold && !r.landed.pending,
    "the reserve did not arrive from the cold-only 2040 operation");
  assert(r.ticks>0 && r.after.debt===0 && r.after.power && !r.after.cut,
    "selling the fetched reserve did not clear arrears and restore service");
});

rule("an insufficient cold reserve remains recoverable instead of stranding the settlement", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2017-01-01");state.hardware={s9:100};state.cash=0;state.speed=1;`)}
    ${CONFIGURED_WALLET("single")}
    state.wallets.hot=0;state.wallets.cold=.01;
    for(let n=0;n<120&&!state.pendingSettlement;n++)tick(true);
    state.debt=500;const plan=reservePlan(false);fetchReserve(false);
    const started={covers:plan.covers,jobs:state.coldSpends.length,pending:!!state.pendingSettlement,debt:state.debt,cold:state.wallets.cold};
    let ticks=0;while(state.coldSpends.length&&ticks<40){tick(true);ticks++}
    return{started,ticks,hot:state.wallets.hot,cold:state.wallets.cold,debt:state.debt,pending:!!state.pendingSettlement};})()`);
  assert(!r.started.covers && r.started.jobs===1 && !r.started.pending,
    "an insufficient reserve did not enter its explicit rescue path");
  assert(r.ticks>0 && r.hot>0 && r.cold===0 && r.debt>500,
    "an insufficient reserve was lost, stalled, or failed to preserve the remaining debt");
});

rule("a save from before the coin count still opens, and its reserve is not free to spend", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  assert(save.utxo === undefined, "the fixture already carries a coin count, so it no longer tests an old save");
  const loaded = loadWithSave(save);
  assert(loaded.ok, `the pre-sprint save could not be opened: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  const r = JSON.parse(read(`JSON.stringify({coins:utxoState().cold,fee:transferNetworkFee("cold",1),
    cold:state.wallets.cold,reach:treasuryReach(),total:totalBtc()})`));
  // 119 pool payouts went to cold storage; each is a coin that has to be gathered.
  assert(r.coins > 50 && r.coins <= 150, `an established reserve was seeded with ${r.coins} coins`);
  assert(Number.isFinite(r.fee) && r.fee > 0, "an old save could not price a cold spend");
  assert(r.reach.cold === r.cold && r.total >= r.cold, "an old save's reserve is missing from its totals");
});

/* ---- PLACES: where the keys are decides what a fire, a flood or a burglar can do ---- */

/* A wallet whose devices and backups are somewhere. Each entry is one key: where its signer is,
   where its backup is, and whether the backup is steel. `device` and `backup` may be left out to
   leave them unrecorded. */
const PLACED_WALLET = (policy, keys, configPlace = "bank") => `
  setCustodyPolicy("${policy}");
  state.custody.keys=[];state.custody.assigned=[];state.custody.devices=[];state.custody.moves=[];state.custody.restores=[];
  ${JSON.stringify(keys)}.forEach((spec,i)=>{
    const id="k"+i;
    state.custody.keys.push({id,seed:"s"+i,label:"KEY "+i,weakEntropy:false,
      backup:spec.backup?{product:spec.steel?"steelplate":"paperbackup",durability:spec.steel?"steel":"paper",place:spec.backup}:null});
    state.custody.devices.push({uid:"d"+i,product:"trezorone",supplier:"trezor",boughtAt:0,keyId:id,place:spec.device});
    state.custody.assigned.push(id);
  });
  state.custody.configBackedUp=true;state.custody.configPlace="${configPlace}";`;

rule("friend betrayal is flood-rare, conditional on readable backups and absent from bank boxes", () => {
  const r=json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"trusted",backup:"bank",steel:true}])}
    const flood=placeRate("trusted","flood"),betrayal=placeRate("trusted","betrayal"),rand=state.rand;
    applyPlaceIncident("trusted","betrayal",state.time,true);applyPlaceIncident("bank","betrayal",state.time,true);
    return {flood,betrayal,bank:placeRate("bank","betrayal"),readable:trustedReadableBackups("trusted").length,exposed:!!state.custody.keys[0].exposed,destroyed:!!state.custody.devices[0].destroyed,rand:state.rand===rand};})()`);
  assert(r.betrayal>0&&r.betrayal<.001&&r.betrayal===r.flood,"friend betrayal no longer matches the small flood baseline");
  assert(r.bank===0&&r.readable===0&&!r.exposed&&!r.destroyed&&r.rand,"a locked signer or bank backup triggered friend-access damage");
});

rule("a friend can copy paper or steel without destroying it, but must know a distinct signing quorum to steal", () => {
  const incident=(count,duplicate=false)=>json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";state.wallets.cold=10;state.wallets.hot=0;`)}
    ${PLACED_WALLET("2of3", [{device:"site",backup:"trusted",steel:false},{device:"home",backup:count>1?"trusted":"bank",steel:true},{device:"bank",backup:"bank",steel:true}])}
    ${duplicate?'state.custody.keys[1].seed=state.custody.keys[0].seed;':''}
    const before=state.wallets.cold,rand=state.rand;
    applyPlaceIncident("trusted","betrayal",state.time,true);
    const after=state.wallets.cold;applyPlaceIncident("trusted","betrayal",state.time,true);
    return {before,after,again:state.wallets.cold,exposed:state.custody.keys.filter(k=>k.exposed).length,backups:state.custody.keys.every(k=>!k.backup.destroyed),devices:state.custody.devices.every(d=>!d.destroyed),config:state.custody.configBackedUp,rand:state.rand===rand,cause:pendingLoss()?.cause};})()`);
  const one=incident(1),two=incident(2),clones=incident(2,true);
  assert(one.after===one.before&&one.exposed===1,"one copied seed spent a 2-of-3 reserve");
  assert(two.after<two.before&&two.after>0&&two.cause==="betrayal","two distinct copied seeds did not expose the reserve quorum");
  assert(clones.after===clones.before,"two copies of one seed counted as two independent signatures");
  for(const r of [one,two,clones])assert(r.backups&&r.devices&&r.config&&r.rand&&r.again===r.after,"betrayal destroyed physical items, rerolled a known secret or changed the random stream");
});

rule("a backup beside the signer is one point of failure, and the wallet says so", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"site",steel:true}])}
    const together={fragile:custodySetup().fragile,at:custodySetup().fragileAt,risk:custodyLossRisk(),label:custodyReadiness().label};
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    const apart={fragile:custodySetup().fragile,risk:custodyLossRisk(),label:custodyReadiness().label};
    return{together,apart};})()`);
  assert(r.together.fragile && r.together.at === "site", "a signer and its only backup in the same place were not flagged as one point of failure");
  assert(!r.apart.fragile, "a backup in a bank box was flagged against a signer at the mine");
  assert(r.together.risk > r.apart.risk * 1.5, `keeping everything together cost ${r.together.risk} against ${r.apart.risk} apart; the correlation is not priced`);
  assert(/one place/i.test(r.together.label) && !/one place/i.test(r.apart.label), `the readiness card said "${r.together.label}" and "${r.apart.label}"`);
});

rule("a setup that records no places prices exactly as it did before places existed", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("2of3")}
    const bare={risk:custodyLossRisk(),compromise:custodyCompromiseFactor(),days:coldSpendDays(),placed:custodySetup().placed,fragile:custodySetup().fragile};
    ${PLACED_WALLET("2of3", [{device:undefined,backup:undefined},{},{}], undefined)}
    return{bare};})()`);
  assert(!r.bare.placed && !r.bare.fragile, "an unrecorded setup was treated as having places");
  // 0.0016 base, x0.35 everything backed up, x0.45 all steel, x0.3 multisig with its descriptor recorded.
  close(r.bare.risk, .0016 * .35 * .45 * .3, 1e-9, "an unrecorded 2-of-3 no longer prices the way it always did");
  assert(r.bare.days === 2, `an unrecorded 2-of-3 took ${r.bare.days} days to sign; it was always two`);
});

rule("fire takes the signer and the paper, and steel is what survives", () => {
  const steel = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"site",steel:true}])}
    const held=state.wallets.hot+state.wallets.cold;
    applyPlaceIncident("site","fire",state.time,true);
    const set=custodySetup();
    const afterFire={device:state.custody.devices[0].destroyed?.cause,backup:!!state.custody.keys[0].backup.destroyed,
      operable:custodyOperable(),live:set.liveDistinct,usable:set.usable,reason:coldSpendBlockReason(),held:state.wallets.hot+state.wallets.cold,losses:pendingLoss()};
    // Rebuilding the key from its backup onto a replacement device is the whole recovery.
    state.custody.devices.push({uid:"dNew",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    restoreCustodyKey("dNew","k0");
    return{held,afterFire,rebuilt:{live:custodySetup().liveDistinct,reason:coldSpendBlockReason()}};})()`);
  assert(steel.afterFire.device === "fire" && !steel.afterFire.backup, "a fire should destroy the signer and leave a steel backup");
  assert(steel.afterFire.operable && steel.afterFire.live === 0 && steel.afterFire.usable === 1, "the wallet should be rebuildable, and not yet signing");
  assert(/destroyed|device/i.test(steel.afterFire.reason), `the refusal did not say a signer was gone: "${steel.afterFire.reason}"`);
  assert(steel.afterFire.held === steel.held && !steel.afterFire.losses, "coins were lost although a steel backup survived");
  assert(steel.rebuilt.live === 1 && steel.rebuilt.reason === "", `restoring the key onto a new device did not bring the wallet back: "${steel.rebuilt.reason}"`);
  // The same fire with a paper backup beside the signer takes everything with it.
  const paper = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"site",steel:false}])}
    const held=state.wallets.hot+state.wallets.cold;
    applyPlaceIncident("site","fire",state.time,true);
    return{held,operable:custodyOperable(),after:state.wallets.hot+state.wallets.cold,loss:pendingLoss()};})()`);
  assert(!paper.operable, "paper beside the signer survived the fire that destroyed the signer");
  assert(paper.after < paper.held * 0.7 && paper.loss && paper.loss.kind === "unrecoverable", "coins were not stranded when the only backup burned with the signer");
});

rule("a backup kept elsewhere is why a fire at the mine costs nothing", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:false}])}
    const held=state.wallets.hot+state.wallets.cold;
    applyPlaceIncident("site","fire",state.time,true);
    return{held,after:state.wallets.hot+state.wallets.cold,operable:custodyOperable(),loss:pendingLoss(),backupAlive:!state.custody.keys[0].backup.destroyed};})()`);
  assert(r.operable && r.backupAlive, "a paper backup in a bank box was destroyed by a fire at the mine");
  assert(r.after === r.held && !r.loss, "coins were lost although the only backup was somewhere else");
});

rule("restoring a key takes as long as fetching its backup: the safest place is the slowest to recover from", () => {
  const restoreFrom = place => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:place,steel:true}])}
    state.custody.devices[0].destroyed={cause:"fire"};
    state.custody.devices.push({uid:"dNew",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    restoreCustodyKey("dNew","k0");
    const d=state.custody.devices[1],start={live:custodyKeyLive(state.custody.keys[0]),restoring:d.restoring||null,reason:coldSpendBlockReason(),
      jobs:custodyRestores().length,days:custodyRestores()[0]?custodyRestores()[0].days:0};
    let t=0;while(custodyRestores().length&&t<20){tick(true);t++}
    return{start,t,live:custodyKeyLive(state.custody.keys[0]),keyId:d.keyId,restoring:d.restoring||null,reasonAfter:coldSpendBlockReason()};})()`);
  const mine = restoreFrom("site"), none = restoreFrom(undefined), home = restoreFrom("home"), bank = restoreFrom("bank");
  assert(mine.start.live && mine.start.jobs === 0, "a backup at the mine took time to restore from");
  assert(none.start.live && none.start.jobs === 0, "a backup with no recorded place took time to restore from, so an old save changed");
  assert(home.start.days === 1 && bank.start.days === 2, `a backup at home took ${home.start.days} days and one in a bank ${bank.start.days}`);
  assert(!bank.start.live && bank.start.restoring === "k0" && /signer is gone|way/i.test(bank.start.reason), `the wallet could sign while its key was being fetched: "${bank.start.reason}"`);
  assert(bank.t >= 2 && bank.live && bank.keyId === "k0" && !bank.restoring && bank.reasonAfter === "", `the key was not on the signer once the backup arrived: ${JSON.stringify(bank)}`);
});

rule("a signer being restored onto is not a spare, and a backup on a journey cannot be restored from", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    state.custody.devices[0].destroyed={cause:"fire"};
    state.custody.devices.push({uid:"dNew",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    restoreCustodyKey("dNew","k0");restoreCustodyKey("dNew","k0");
    const spareWhileRestoring=rotateBlockReason("k0","dNew"),twice=custodyRestores().length;
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    state.custody.devices[0].destroyed={cause:"fire"};
    state.custody.devices.push({uid:"dNew",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    state.custody.keys[0].backup.place="transit";
    restoreCustodyKey("dNew","k0");
    return{spareWhileRestoring,twice,journey:{jobs:custodyRestores().length,keyId:state.custody.devices[1].keyId}};})()`);
  assert(r.twice === 1, `restoring onto the same signer twice started ${r.twice} jobs`);
  assert(/not available/i.test(r.spareWhileRestoring), `a device being restored onto was offered as a spare for a rotation: "${r.spareWhileRestoring}"`);
  assert(r.journey.jobs === 0 && r.journey.keyId === null, "a key was restored from a backup that was on a journey");
});

rule("a copy of the descriptor in another place survives the fire that takes the first", () => {
  const scenario = copies => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("2of3", [{device:"home",backup:"bank",steel:true},{device:"home",backup:"trusted",steel:true},{device:"home",backup:"home",steel:true}], "site")}
    state.custody.configCopies=${JSON.stringify(copies)};
    const held=state.wallets.hot+state.wallets.cold,before=custodySetup().fragile;
    applyPlaceIncident("site","fire",state.time,true);
    return{held,before,after:state.wallets.hot+state.wallets.cold,operable:custodyOperable(),config:state.custody.configBackedUp,
      primary:state.custody.configPlace,copies:state.custody.configCopies,loss:pendingLoss()};})()`);
  const alone = scenario([]), copied = scenario(["bank"]);
  assert(!alone.operable && alone.config === false && alone.after < alone.held, "the only copy of the descriptor burned and the quorum was still usable");
  assert(copied.operable && copied.config === true && copied.after === copied.held && !copied.loss, "a copy of the descriptor in a bank box did not save the quorum");
  assert(copied.primary === "bank" && copied.copies.length === 0, `the surviving copy was not promoted: ${copied.primary}, ${JSON.stringify(copied.copies)}`);
});

rule("copying the descriptor is a journey that leaves the original where it is", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("2of3", [{device:"home",backup:"bank",steel:true},{device:"home",backup:"trusted",steel:true},{device:"home",backup:"home",steel:true}], "site")}
    moveCustodyItem("configcopy","config","bank");
    const during={primary:state.custody.configPlace,copies:[...(state.custody.configCopies||[])],jobs:custodyMoves().length,intact:custodyConfigIntact()};
    moveCustodyItem("configcopy","config","bank");
    const doubled=custodyMoves().length;
    let t=0;while(custodyMoves().length&&t<20){tick(true);t++}
    moveCustodyItem("configcopy","config","bank");
    return{during,doubled,t,primary:state.custody.configPlace,copies:state.custody.configCopies,again:custodyMoves().length};})()`);
  assert(r.during.primary === "site" && r.during.copies.length === 0 && r.during.jobs === 1 && r.during.intact, "a copy in progress moved or removed the original");
  assert(r.doubled === 1, "the same copy was started twice");
  assert(r.t >= 1 && r.primary === "site" && r.copies.length === 1 && r.copies[0] === "bank", `the copy did not arrive as a second location: ${r.primary}, ${JSON.stringify(r.copies)}`);
  assert(r.again === 0, "a place that already holds a copy was offered another");
});

rule("a break-in takes steel too, and a thief holding enough seeds holds the coins", () => {
  const single = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"site",steel:true}])}
    const held=state.wallets.hot+state.wallets.cold;
    applyPlaceIncident("site","burglary",state.time,true);
    return{held,backupGone:!!state.custody.keys[0].backup.destroyed,after:state.wallets.hot+state.wallets.cold,loss:pendingLoss()};})()`);
  assert(single.backupGone, "steel survived a break-in; nothing survives a break-in");
  assert(single.loss && single.loss.kind === "stolen" && single.after < single.held, "a thief with the only seed did not take the coins");
  const quorum = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("2of3", [{device:"home",backup:"site",steel:true},{device:"home",backup:"bank",steel:true},{device:"home",backup:"trusted",steel:true}])}
    const held=state.wallets.hot+state.wallets.cold,factor0=custodyCompromiseFactor();
    applyPlaceIncident("site","burglary",state.time,true);
    return{held,after:state.wallets.hot+state.wallets.cold,loss:pendingLoss(),exposed:custodySetup().exposed,
      label:custodyReadiness().label,factor:custodyCompromiseFactor(),factor0};})()`);
  assert(!quorum.loss && quorum.after === quorum.held, "one stolen seed of a 2-of-3 took coins; a quorum is what makes that not matter");
  assert(quorum.exposed === 1 && /exposed/i.test(quorum.label), `the stolen seed was not flagged: ${quorum.exposed}, "${quorum.label}"`);
  assert(quorum.factor > quorum.factor0, "an exposed key did not raise the compromise risk");
});

rule("a ban on mining can open the bank box, and only in the country that banned it", () => {
  /* The safest place was safe against everything, which made it a free answer. It is in a country, and when that
     country bans the business what is in it is within reach of the people who just did. The chance is a hash roll, so
     the rule finds seeds on both sides of it rather than pinning a constant. */
  const run = (region, seed, keys) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-06-21");state.facility="warehouse";state.region="${region}";state.seed=${seed};`)}
    ${PLACED_WALLET("2of3", keys, "home")}
    const out={opened:custodyOnRegionalBan("china",true),bank:placeHolds(placeItems("bank")),loss:!!pendingLoss()};
    return out;})()`);
  const inBank = [{device:"home",backup:"bank",steel:true},{device:"home",backup:"site",steel:true},{device:"home",backup:"trusted",steel:true}];
  const empty = [{device:"home",backup:"home",steel:true},{device:"home",backup:"site",steel:true},{device:"home",backup:"trusted",steel:true}];
  const results = [];
  for (let seed = 1; seed <= 40; seed++) results.push(run("sichuan", seed, inBank));
  const opened = results.filter(r => r.opened), spared = results.filter(r => !r.opened);
  assert(opened.length > 0 && spared.length > 0, `a ban opened the box ${opened.length} times in 40 seeds; it should be a chance, not a certainty or an impossibility`);
  assert(opened.every(r => r.bank === 0), "a seized box still held its contents, steel included");
  assert(spared.every(r => r.bank > 0), "a box that was not opened lost its contents");
  const elsewhere = []; for (let seed = 1; seed <= 40; seed++) elsewhere.push(run("texas", seed, inBank));
  assert(elsewhere.every(r => !r.opened), "a ban in China opened a bank box belonging to a mine in Texas");
  const nothing = []; for (let seed = 1; seed <= 40; seed++) nothing.push(run("sichuan", seed, empty));
  assert(nothing.every(r => !r.opened), "an empty box was reported seized");
});

rule("cover does not pay for a government opening the box", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-06-21");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"home",backup:"bank",steel:true}])}
    state.coinCover={since:at("2020-01-01")};
    const claim=coinCoverClaim({kind:"stolen",cause:"seizure"},1);
    return{claim};})()`);
  assert(r.claim && r.claim.paid === 0 && /government/.test(r.claim.note), `cover paid or said nothing for a seizure: ${JSON.stringify(r.claim)}`);
});

rule("signing takes as long as it takes to fetch the keys, and the safest place is the slowest", () => {
  const days = (policy, keys) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET(policy, keys)}
    return coldSpendDays();})()`);
  const atSite = days("single", [{device: "site", backup: "bank", steel: true}]);
  const atBank = days("single", [{device: "bank", backup: "site", steel: true}]);
  assert(atBank > atSite, `a signer in a bank box (${atBank} days) was not slower than one at the mine (${atSite})`);
  const near = days("2of3", [{device: "site"}, {device: "home"}, {device: "bank"}]);
  const far = days("2of3", [{device: "bank"}, {device: "bank"}, {device: "bank"}]);
  assert(far > near, `a quorum entirely in a bank box (${far} days) was not slower than one near at hand (${near})`);
});

rule("a journey takes days, and what is on it is nowhere and cannot sign", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"site",steel:true}])}
    moveCustodyItem("device","d0","bank");
    const during={place:state.custody.devices[0].place,live:custodyKeyLive(state.custody.keys[0]),reason:coldSpendBlockReason(),jobs:custodyMoves().length,
      days:custodyMoveDays("site","bank")};
    let t=0;while(custodyMoves().length&&t<20){tick(true);t++}
    return{during,t,after:state.custody.devices[0].place,live:custodyKeyLive(state.custody.keys[0])};})()`);
  assert(r.during.place === "transit" && !r.during.live, "a signer on a journey could still sign");
  assert(/destroyed|arrive|way/i.test(r.during.reason), `the refusal did not say the signer was away: "${r.during.reason}"`);
  assert(r.during.days >= 2, `the mine to a bank box took ${r.during.days} day`);
  assert(r.after === "bank" && r.live && r.t >= r.during.days - 1, "the signer never arrived, or arrived without the journey taking time");
});

rule("new risks are rolled from the seed and draw nothing from the shared stream", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    const same=hashRoll(20260909,"a","b")===hashRoll(20260909,"a","b"),other=hashRoll(20260909,"a","c")!==hashRoll(20260909,"a","b");
    let sum=0,low=0,n=20000;for(let i=0;i<n;i++){const v=hashRoll(20260909,"u",i);sum+=v;if(v<.0045)low++}
    const rng=state.rng;
    for(let m=0;m<600;m++)advancePlaceRisks(at("2021-02-01")+m*30*DAY,true);
    return{same,other,mean:sum/n,low:low/n,rngMoved:state.rng!==rng};})()`);
  assert(r.same && r.other, "the same roll gave different answers, or different rolls gave the same");
  close(r.mean, .5, .01, "the roll is not uniform");
  close(r.low, .0045, .0015, "a threshold of .0045 does not fire about .45% of the time");
  assert(!r.rngMoved, "a place risk drew from the shared random stream, which would shift every seeded run after it");
});

rule("nothing is rolled where nothing is kept, and a bank box charges its fee only when used", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    state.custody.devices=[];state.custody.keys=[];state.custody.assigned=[];state.custody.configBackedUp=false;
    const cash0=state.cash;advancePlaceRisks(at("2021-03-01"),true);const empty={cash:state.cash-cash0};
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    const cash1=state.cash;advancePlaceRisks(at("2021-04-01"),true);
    return{empty,used:state.cash-cash1};})()`);
  assert(r.empty.cash === 0, "a bank box was billed with nothing in it");
  assert(r.used < 0, "a bank box held a backup for free");
});

rule("the mine and home are the same building while the fleet lives at home", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="home";`)}
    ${PLACED_WALLET("single", [{device:"home",backup:"home",steel:false}])}
    const atHome=placeItems("site").devices.length;
    state.facility="warehouse";
    const afterMove=placeItems("site").devices.length,stillHome=placeItems("home").devices.length;
    return{atHome,afterMove,stillHome};})()`);
  assert(r.atHome === 1, "keys kept at home were not at the mine while the mine was the house");
  assert(r.afterMove === 0 && r.stillHome === 1, "keys left at the house moved to the warehouse with the fleet");
});

rule("a border is a place things get stopped, and the destination decides how likely", () => {
  const stopped = region => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    let taken=0;
    for(let i=0;i<3000;i++){
      ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
      state.time=at("2021-02-01")+i*DAY;
      custodyOnRelocation("${region}",true);
      if(state.custody.devices[0].destroyed)taken++;
    }
    return taken;})()`);
  const iran = stopped("iran"), iceland = stopped("iceland");
  assert(iran > iceland * 3, `Iran stopped ${iran} of 3000 crossings and Iceland ${iceland}; the destination does not matter`);
  assert(iran > 60 && iran < 220, `${iran} of 3000 crossings into Iran were stopped; the chance is not about 4.5%`);
});

rule("a save from before places still opens, and its keys price as they did", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const dirty = JSON.parse(JSON.stringify(save));
  dirty.custody.devices = [{uid:"d9",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:"k1",place:"the moon"}];
  dirty.custody.keys[0].backup.place = "mars";
  dirty.custody.configPlace = "nowhere";
  // A signer marked as being restored onto with no job to finish it would be reserved for ever.
  dirty.custody.devices[0].restoring = "k1";dirty.custody.restores = [{uid:"gone",keyId:"k1",due:1},"junk"];
  for (const [name, input] of [["fixture", save], ["damaged", dirty]]) {
    const loaded = loadWithSave(input);
    assert(loaded.ok, `the ${name} save could not be opened: ${loaded.message}`);
    const read = makeEval(loaded.sandbox);
    const r = JSON.parse(read(`JSON.stringify({placed:custodySetup().placed,fragile:custodySetup().fragile,
      devicePlace:state.custody.devices[0]?state.custody.devices[0].place:null,backupPlace:state.custody.keys[0].backup.place,
      configPlace:state.custody.configPlace,moves:Array.isArray(state.custody.moves),days:coldSpendDays(),
      restoring:state.custody.devices[0]?state.custody.devices[0].restoring||null:null,restores:custodyRestores().length})`));
    assert(!r.placed && !r.fragile, `the ${name} save was treated as having places`);
    assert(r.moves, `the ${name} save has no list of journeys`);
    assert(r.devicePlace == null && r.backupPlace == null && r.configPlace == null, `the ${name} save kept a place that does not exist`);
    assert(r.days === 2, `the ${name} 2-of-3 save takes ${r.days} days to sign`);
    assert(r.restoring === null && r.restores === 0, `the ${name} save left a signer reserved for a restore that no longer exists`);
  }
});

rule("machines lost in a move or seized by a receiver cannot leave a stale stopped count behind", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2021-06-01");state.facility="warehouse";state.region="texas";state.hardware={s19:50,s9:40};
      state.poweredDownHardware={s19:50,s9:40};state.insured=false;`)}
    state.facilityUpgradeJob={id:"campus",due:state.time,risk:2,down:false};
    // Force the "miners damaged" branch of the arrival incident.
    const draws=[0,.5,.5,.5,.5,.9];let i=0;const real=nextRand;nextRand=()=>draws[Math.min(i++,draws.length-1)];
    advanceFacilityMove();nextRand=real;
    // Every machine was stopped, so losing any of them would leave the stopped count above the owned count.
    const afterMove={damaged:state.hardware.s19<50||state.hardware.s9<40,
      worst:Math.max(state.poweredDownHardware.s19-state.hardware.s19,state.poweredDownHardware.s9-state.hardware.s9)};
    state.hardware={s19:50,s9:40};state.poweredDownHardware={s19:48,s9:0};
    state.pendingSettlement={due:1e6,month:"2021-06",loanInterest:0,snapshot:{},resumeSpeed:1};
    state.operator.restructures=0;enterReceivership();
    return{afterMove,afterReceiver:{owned:state.hardware.s19,stopped:state.poweredDownHardware.s19}};})()`);
  assert(r.afterMove.damaged, "the move did not damage any miners, so this rule proves nothing about it");
  assert(r.afterMove.worst <= 0, `after the move ${r.afterMove.worst} more machines were stopped than were owned`);
  assert(r.afterReceiver.stopped <= r.afterReceiver.owned, `after receivership ${r.afterReceiver.stopped} were stopped of ${r.afterReceiver.owned} owned: buying more would bring them back stopped`);
});

/* ---- PEOPLE: a key is a secret, and a secret somebody knows leaves with them ---- */

rule("a key is held by its owner unless somebody on the payroll holds it", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("2of3")}
    const k=state.custody.keys[0],start=custodyHolder(k);
    setKeyHolder("k0","treasurer");const refused=custodyHolder(k);
    state.staff=["treasurer"];setKeyHolder("k0","treasurer");
    const hired={holder:custodyHolder(k),known:[...custodyKnownBy(k)]};
    setKeyHolder("k0","owner");
    return{start,refused,hired,back:custodyHolder(k),stillKnown:[...custodyKnownBy(k)]};})()`);
  assert(r.start === "owner", `a key nobody was given was held by "${r.start}"`);
  assert(r.refused === "owner", "a key was handed to somebody who is not on the payroll");
  assert(r.hired.holder === "treasurer", "a key could not be handed to the treasury manager once hired");
  assert(r.stillKnown.includes("treasurer"), "handing a key back made the treasury manager forget it");
});

rule("dismissing a holder exposes the keys they ever knew, and no others", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("2of3")}
    state.staff=["treasurer","security"];
    setKeyHolder("k0","treasurer");setKeyHolder("k1","security");
    setKeyHolder("k2","treasurer");setKeyHolder("k2","owner");   // handed back, but not forgotten
    const factor0=custodyCompromiseFactor();
    dismissStaff("treasurer");
    const exposed=state.custody.keys.map(k=>k.exposed?k.exposed.cause+":"+k.exposed.role:null);
    return{exposed,label:custodyReadiness().label,detail:custodyReadiness().detail,factor0,factor:custodyCompromiseFactor(),
      ready:custodySetup().ready,note:custodyDismissNote("security")};})()`);
  assert(r.exposed[0] === "former-employee:treasurer", "the key the treasury manager held was not exposed when they left");
  assert(r.exposed[2] === "former-employee:treasurer", "a key handed back was exposed on dismissal as though they had forgotten it");
  assert(r.exposed[1] === null, "a key held by someone still employed was exposed");
  assert(/exposed/i.test(r.label) && /former/i.test(r.detail), `the readiness card said "${r.label}: ${r.detail}"`);
  assert(r.factor > r.factor0, "exposed keys did not raise the compromise risk");
  assert(r.ready, "an exposed key stopped the owner signing; it is a risk, not a failure");
  assert(/Security officer knows/.test(r.note), `the dismiss button gave no warning: "${r.note}"`);
});

rule("one key known to a former employee is the whole wallet in single signature, and nothing in a quorum", () => {
  const days = setup => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${setup}
    let hit=null;const t0=state.time;
    for(let d=1;d<=2500&&!hit;d++){advanceInsiderRisk(t0+d*DAY);if(pendingLoss())hit=d}
    const loss=pendingLoss();
    return{hit,kind:loss&&loss.kind,cause:loss&&loss.cause,exposed:custodySetup().exposed,can:custodyInsiderCanSpend(),
      ready:custodySetup().ready,blocked:coldSpendBlockReason()};})()`);
  const single = days(`${CONFIGURED_WALLET("single")}state.staff=["treasurer"];setKeyHolder("k0","treasurer");dismissStaff("treasurer");`);
  const quorum = days(`${CONFIGURED_WALLET("2of3")}state.staff=["treasurer"];setKeyHolder("k0","treasurer");dismissStaff("treasurer");`);
  assert(single.exposed === 1 && single.can, "a dismissed holder of the only key was not an insider risk");
  assert(single.hit !== null && single.kind === "stolen" && single.cause === "insider", "a former employee holding the only key never used it in seven years");
  assert(single.ready && single.blocked === "", `an exposed key stopped its owner signing: "${single.blocked}"`);
  assert(quorum.exposed === 1 && !quorum.can, "one exposed key of a 2-of-3 was treated as enough to spend");
  assert(quorum.hit === null, "a former employee spent from a quorum with one key");
});

rule("the chance an exposed key is used rises every day and never falls", () => {
  const r = json(`(()=>{
    const out={};
    for(const [name,hostile] of [["hostile",true],["patient",false]]){
      let rising=true,prev=0;for(let d=0;d<=900;d++){const h=insiderDailyHazard(d,hostile);if(h<prev)rising=false;prev=h}
      out[name]={rising,day1:insiderDailyHazard(1,hostile),day30:insiderDailyHazard(30,hostile),day91:insiderDailyHazard(91,hostile),day200:insiderDailyHazard(200,hostile)};
    }
    return out;})()`);
  assert(r.hostile.rising && r.patient.rising, "the chance of an exposed key being used fell on some day");
  assert(r.hostile.day1 > 0 && r.hostile.day30 > r.hostile.day1 * 10, "a hostile person's chance did not climb steeply in the first month");
  assert(r.patient.day1 === 0 && r.patient.day91 > 0 && r.patient.day200 > r.patient.day91, "a patient person acted before the quiet quarter, or their chance did not rise afterwards");
});

rule("half of those who learn a key mean to use it within weeks, and the rest wait at least a quarter", () => {
  const r = json(`(()=>{
    const survive=(hostile,days)=>{let s=1;for(let d=1;d<=days;d++)s*=1-insiderDailyHazard(d,hostile);return s};
    let hostile=0;const n=4000;
    for(let i=0;i<n;i++){state.seed=20260909;if(hashRoll(20260909,"insider-type","k"+i,1612137600000+i*86400000)<INSIDER_HOSTILE_SHARE)hostile++}
    return{hostileShare:hostile/n,hostileMonth:1-survive(true,30),patientQuarter:1-survive(false,90),patientYear:1-survive(false,365)};})()`);
  close(r.hostileShare, .5, .03, "the split between hostile and patient is not half and half");
  assert(r.hostileMonth > .75, `a hostile person used the key within a month only ${(r.hostileMonth * 100).toFixed(0)}% of the time`);
  assert(r.patientQuarter === 0, `a patient person acted inside the first quarter ${(r.patientQuarter * 100).toFixed(1)}% of the time`);
  assert(r.patientYear > .9, `a patient person had used the key by the end of a year only ${(r.patientYear * 100).toFixed(0)}% of the time`);
});

rule("across many runs, an exposed key is swept within a month about as often as half of them are hostile", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("single")}
    const t0=state.time;let hostile=0,hostileSwept30=0,patientBefore91=0,total=0;
    for(let seed=1;seed<=400;seed++){
      state.seed=seed*7919;state.pendingLosses=[];state.wallets.hot=10;state.wallets.cold=40;
      const key=state.custody.keys[0];key.exposed={cause:"former-employee",role:"treasurer",at:t0};
      const isHostile=insiderIsHostile(key);let hit=null;
      for(let d=1;d<=120&&hit===null;d++){advanceInsiderRisk(t0+d*DAY);if(pendingLoss())hit=d}
      total++;if(isHostile){hostile++;if(hit!==null&&hit<=30)hostileSwept30++}
      else if(hit!==null&&hit<=90)patientBefore91++;
    }
    return{total,hostile,hostileSwept30,patientBefore91};})()`);
  assert(r.hostile > 160 && r.hostile < 240, `${r.hostile} of ${r.total} runs met a hostile person; it should be about half`);
  assert(r.hostileSwept30 / r.hostile > .7, `only ${r.hostileSwept30} of ${r.hostile} hostile exposures were swept inside a month`);
  assert(r.patientBefore91 === 0, `${r.patientBefore91} patient exposures were swept inside the first quarter`);
});

rule("a security officer halves the chance an exposed key is used", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    state.staff=[];const without=insiderSecurityFactor();
    state.staff=["security"];const withOfficer=insiderSecurityFactor();
    return{without,withOfficer,salary:STAFF.find(r=>r.id==="security").salary};})()`);
  close(r.withOfficer, r.without / 2, 1e-12, "a security officer did not halve the insider risk");
  assert(r.salary > 0, "a security officer is free");
});

rule("having been paid once, a former employee's clock starts again", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("single")}
    const t0=state.time,key=state.custody.keys[0];key.exposed={cause:"former-employee",role:"treasurer",at:t0};
    let hit=null;for(let d=1;d<=2500&&hit===null;d++){advanceInsiderRisk(t0+d*DAY);if(pendingLoss())hit=d}
    const days=insiderDaysExposed(t0+hit*DAY);
    return{hit,days,swept:key.exposed.sweptAt===t0+hit*DAY};})()`);
  assert(r.hit !== null && r.swept, "the sweep was not recorded against the exposure");
  assert(r.days === 0, `the clock showed ${r.days} days straight after a sweep; it should start again from nothing`);
});

rule("a dismissed field technician exposes a key in proportion to how many there were", () => {
  const exposedAmong = count => json(`(()=>{
    ${CUSTODY_SITE(`state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("single")}
    let n=0;
    for(let i=0;i<900;i++){
      state.time=at("2021-02-01")+i*DAY;state.custody.keys[0].holder="fieldtech";delete state.custody.keys[0].exposed;
      custodyOnDismiss("fieldtech",${count});
      if(state.custody.keys[0].exposed)n++;
    }
    return n;})()`);
  assert(exposedAmong(1) === 900, "dismissing the only technician did not always expose the key they held");
  const three = exposedAmong(3);
  assert(three > 220 && three < 380, `one technician of three exposed the key ${three} times in 900; it should be about a third`);
});

rule("rotation is a job: it costs the sweep fee, takes days, pauses signing and consolidates the coins", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("2of3")}
    state.custody.devices=[{uid:"dSpare",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"}];
    state.custody.keys[0].exposed={cause:"former-employee",role:"treasurer",at:state.time};
    state.utxo={cold:60,hot:1};
    const cold0=state.wallets.cold,quote=transferNetworkFee("cold",1);
    rotateCustodyKey("k0","dSpare");
    const during={job:!!custodyRotation(),cold:state.wallets.cold,reason:coldSpendBlockReason(),again:rotateBlockReason("k1","dSpare"),
      assigned:[...state.custody.assigned],exposedStill:!!state.custody.keys[0].exposed,days:custodyRotation().days};
    let t=0;while(custodyRotation()&&t<30){tick(true);t++}
    const k=state.custody.keys;
    return{cold0,quote,during,t,after:{assigned:[...state.custody.assigned],old:k[0].retired,oldExposed:!!k[0].exposed,
      coins:utxoState().cold,config:state.custody.configBackedUp,copies:state.custody.configCopies||[],insider:custodyInsiderCanSpend(),
      reason:coldSpendBlockReason(),newKey:k[k.length-1].label}};})()`);
  close(r.cold0 - r.during.cold, r.quote, 1e-12, "the rotation did not charge the sweep fee for the coins being gathered");
  assert(r.during.job && /swept|rotation/i.test(r.during.reason), `signing was not paused during a rotation: "${r.during.reason}"`);
  assert(r.during.exposedStill, "the exposure ended before the coins had moved");
  assert(r.during.days >= 2 && r.t >= r.during.days - 1, `a rotation took ${r.t} days against ${r.during.days}`);
  assert(r.after.assigned.includes("k4") && !r.after.assigned.includes("k0"), `the new key did not take the old one's place: ${JSON.stringify(r.after.assigned)}`);
  assert(r.after.old === true && !r.after.oldExposed, "the old key was not retired and cleared");
  assert(r.after.coins === 1, `${r.after.coins} coins remain after a sweep; it should have consolidated them into one`);
  assert(r.after.config === false && r.after.copies.length === 0, "a quorum's descriptor was still recorded after its keys changed");
  assert(!r.after.insider, "a retired key still counted as an insider risk");
});

rule("a rotation can be rushed: fewer days, the queue-jumping fee, never under two days", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("2of3", [{device:"bank",backup:"bank",steel:true},{device:"trusted",backup:"bank",steel:true},{device:"home",backup:"bank",steel:true}])}
    state.custody.devices.push({uid:"dSpare",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    state.utxo={cold:40,hot:1};
    const slow=rotationDays(false),fast=rotationDays(true),base=transferNetworkFee("cold",1),rushed=transferNetworkFee("cold",1,{rush:true}),mult=rushMultiple(state.time);
    const cold0=state.wallets.cold;
    rotateCustodyKey("k0","dSpare",true);
    return{slow,fast,base,rushed,mult,charged:cold0-state.wallets.cold,job:custodyRotation()};})()`);
  assert(r.fast < r.slow && r.fast >= 2, `rushing took ${r.fast} days against ${r.slow}`);
  close(r.rushed / r.base, r.mult, 1e-9, "a rushed rotation did not cost the queue-jumping multiple of the sweep fee");
  close(r.charged, r.rushed, 1e-12, "the fee charged was not the rushed fee");
  assert(r.job && r.job.rush === true && r.job.days === r.fast, "the rotation job did not record that it was rushed");
});

rule("a retired key cannot be put back in the wallet", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("single")}
    const k=state.custody.keys[0];k.retired=true;state.custody.assigned=[];
    assignCustodyKey("k0");
    return{assigned:[...state.custody.assigned]};})()`);
  assert(r.assigned.length === 0, "a key retired by a rotation was assigned to the wallet again");
});

rule("the signer a retired key was on can be wiped and used again, and a live key's cannot", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("2of3", [{device:"site",backup:"bank",steel:true},{device:"site",backup:"bank",steel:true},{device:"site",backup:"bank",steel:true}])}
    const live=wipeBlockReason("k0"),keep=state.custody.devices[0].keyId;
    state.custody.keys[0].retired=true;state.custody.assigned=state.custody.assigned.filter(id=>id!=="k0");
    const spareBefore=custodySpareSigners().length,backup=!!state.custody.keys[0].backup;
    wipeCustodySigner("k0");
    return{live,keep,spareBefore,spareAfter:custodySpareSigners().length,held:state.custody.devices[0].keyId,backup:!!state.custody.keys[0].backup,
      retired:state.custody.keys[0].retired,again:wipeBlockReason("k0")};})()`);
  assert(r.live && r.keep === "k0", `a key that still controls coins could have its signer wiped: "${r.live}"`);
  assert(r.held === null && r.spareAfter === r.spareBefore + 1, "wiping did not free the signer");
  assert(r.backup && r.retired === true, "wiping the signer touched the seed backup or un-retired the key");
  assert(r.again, "a signer that was already wiped could be wiped again");
});

rule("a rotation needs an empty signer and a key that is in the wallet", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    state.custody.devices.push({uid:"dFree",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site"});
    state.custody.devices.push({uid:"dGone",product:"trezorone",supplier:"trezor",boughtAt:0,keyId:null,place:"site",destroyed:{cause:"fire"}});
    state.custody.keys.push({id:"kOut",seed:"sOut",label:"OUT",backup:null});
    return{ok:rotateBlockReason("k0","dFree"),holds:rotateBlockReason("k0","d0"),gone:rotateBlockReason("k0","dGone"),
      outside:rotateBlockReason("kOut","dFree")};})()`);
  assert(r.ok === "", `a valid rotation was refused: "${r.ok}"`);
  assert(/holds none|independent/i.test(r.holds), `a signer already holding a key was accepted: "${r.holds}"`);
  assert(/not available/i.test(r.gone), `a destroyed signer was accepted: "${r.gone}"`);
  assert(/in the wallet/i.test(r.outside), `a key outside the wallet was accepted: "${r.outside}"`);
});

rule("a field technician busy on a repair is a day later to sign, and the owner never is", () => {
  const days = (holder, staff, jobs) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${CONFIGURED_WALLET("single")}
    state.staff=${JSON.stringify(staff)};state.custody.keys[0].holder="${holder}";
    state.maintenance.serviceJobs=${JSON.stringify(jobs)};
    return coldSpendDays();})()`);
  const busy = [{id:"s9",crew:1,contracted:false}];
  assert(days("fieldtech", ["fieldtech"], busy) === days("fieldtech", ["fieldtech"], []) + 1, "a technician on a repair crew was no slower to sign");
  assert(days("fieldtech", ["fieldtech","fieldtech"], busy) === days("fieldtech", ["fieldtech","fieldtech"], []), "a second, idle technician did not cover for the busy one");
  assert(days("owner", [], busy) === days("owner", [], []) && days("treasurer", ["treasurer"], busy) === days("treasurer", ["treasurer"], []), "a repair crew slowed a signing that does not need a technician");
});

rule("a save from before holders still opens, and every key is the owner's", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const loaded = loadWithSave(save);
  assert(loaded.ok, `the pre-sprint save could not be opened: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  const r = JSON.parse(read(`JSON.stringify({holders:custodyAssignedKeys().map(custodyHolder),exposed:custodySetup().exposed,
    note:custodyDismissNote("treasurer"),rotation:custodyRotation(),can:custodyInsiderCanSpend(),days:coldSpendDays()})`));
  assert(r.holders.length === 3 && r.holders.every(h => h === "owner"), `old keys were held by ${JSON.stringify(r.holders)}`);
  assert(r.exposed === 0 && r.note === "" && r.rotation === null && !r.can, "an old save arrived with people problems it never had");
  assert(r.days === 2, `an old 2-of-3 takes ${r.days} days to sign`);
});

/* ---- COUNTERPARTIES: what borrowing costs, and what a lender or insurer asks to see ---- */

rule("every part of the game that prices the operating loan agrees on its rate", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    const read=()=>{
      state.projectLoan=100000;
      const rate=projectLoanRate(),bill=financeInterestMonthly(),forecast=settlementForecast().breakdown.finance,
        reserve=reserveMilestoneStatus().monthlyBurn-monthlyCost().total;
      return{rate,bill,forecast,reserve};
    };
    state.staff=[];const without=read();
    state.staff=["treasurer"];const withTreasurer=read();
    return{without,withTreasurer};})()`);
  for (const [name, x] of [["without a treasury manager", r.without], ["with one", r.withTreasurer]]) {
    close(x.bill, 100000 * x.rate, 1e-6, `the month-end interest disagrees with the rate ${name}`);
    close(x.forecast, x.bill, 1e-6, `the settlement forecast disagrees with the bill ${name}`);
    close(x.reserve, x.bill, 1e-6, `the reserve milestone disagrees with the bill ${name}`);
  }
  // And the settlement that is actually queued at the month boundary, which is the one that costs money.
  const queued = staff => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-10");state.facility="warehouse";state.hardware={};state.cash=0;state.projectLoan=100000;state.staff=${JSON.stringify(staff)};`)}
    for(let n=0;n<60&&!state.pendingSettlement;n++)tick(true);
    const p=state.pendingSettlement;
    return{interest:p?p.loanInterest:null,rate:projectLoanRate()};})()`);
  for (const staff of [[], ["treasurer"]]) {
    const q = queued(staff);
    assert(q.interest !== null, "no settlement was queued, so this rule proves nothing about the bill");
    close(q.interest, 100000 * q.rate, 1e-6, `the settlement queued at month end charged ${q.interest} of interest at a rate of ${q.rate}`);
  }
  assert(r.withTreasurer.rate < r.without.rate, "a treasury manager did not lower the rate");
  close(r.without.rate, .012, 1e-12, "the operating loan no longer costs 1.2% a month");
  close(r.withTreasurer.rate, .009, 1e-12, "a treasury manager no longer brings the rate to 0.9% a month");
});

rule("custody posture is a ladder, and every rung is blocked by a named finding", () => {
  const tier = setup => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${setup}
    const p=custodyPosture();return{tier:p.tier,rank:p.rank,ids:p.findings.map(f=>f.id)};})()`);
  const strongWallet = `${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}`;
  const none = tier(``);
  const basic = tier(`${CONFIGURED_WALLET("single")}`);
  const strong = tier(strongWallet);
  const audited = tier(`${strongWallet}state.custody.auditUntil=state.time+DAY*100;`);
  assert(none.tier === "none" && none.ids.includes("unsigned"), `no wallet was ${none.tier}, findings ${none.ids}`);
  assert(basic.tier === "basic" && basic.ids.includes("unplaced"), `a wallet that records no places was ${basic.tier}, findings ${basic.ids}`);
  assert(strong.tier === "strong" && strong.ids.length === 0, `a well-kept wallet was ${strong.tier}, findings ${strong.ids}`);
  assert(audited.tier === "audited", `an audited wallet was ${audited.tier}`);
  assert(none.rank < basic.rank && basic.rank < strong.rank && strong.rank < audited.rank, "the rungs are not in order");
  // Each of these takes a strong wallet down a rung, and says why.
  const drops = {
    paper: `${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:false}])}`,
    fragile: `${PLACED_WALLET("single", [{device:"site",backup:"site",steel:true}])}`,
    exposed: `${strongWallet}state.custody.keys[0].exposed={cause:"former-employee",role:"treasurer",at:state.time};`,
    weak: `${strongWallet}state.custody.keys[0].weakEntropy=true;`,
    signers: `${strongWallet}state.custody.devices[0].destroyed={cause:"fire"};`,
  };
  for (const [id, setup] of Object.entries(drops)) {
    const t = tier(setup);
    assert(t.tier === "basic" && t.ids.includes(id), `${id}: a wallet with this problem was ${t.tier}, findings ${t.ids}`);
  }
  // An audit certifies a moment. It does not survive the wallet getting worse.
  const spoiled = tier(`${strongWallet}state.custody.auditUntil=state.time+DAY*100;state.custody.keys[0].weakEntropy=true;`);
  assert(spoiled.tier === "basic", `a valid audit kept a wallet with a weak seed at ${spoiled.tier}`);
});

rule("an audit needs a security officer, cash and fourteen days, and reports truthfully", () => {
  const run = (setup, staff = ["security"]) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${setup}
    state.staff=${JSON.stringify(staff)};
    const reason=auditBlockReason(),cash0=state.cash;
    commissionCustodyAudit();
    const during={job:!!custodyAuditJob(),cash:cash0-state.cash};
    let t=0;while(custodyAuditJob()&&t<40){tick(true);t++}
    const c=state.custody;
    return{reason,during,t,until:c.auditUntil||0,now:state.time,last:c.lastAudit||null,tier:custodyPosture().tier};})()`);
  const strong = `${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}`;
  assert(/security officer/i.test(run(strong, []).reason), "an audit started without a security officer");
  assert(/costs/i.test(run(`${strong}state.cash=100;`).reason), "an audit started without the cash");
  const ok = run(strong);
  assert(ok.reason === "" && ok.during.job && ok.during.cash === 4000, `a valid audit was refused or did not cost $4,000: "${ok.reason}", ${JSON.stringify(ok.during)}`);
  assert(ok.t >= 13 && ok.t <= 15, `an audit took ${ok.t} days; it should take fourteen`);
  assert(ok.last && ok.last.passed && ok.until > ok.now + 300 * 86400000, "a well-kept wallet did not pass and earn a year's certificate");
  assert(ok.tier === "audited", `a passed audit left the posture at ${ok.tier}`);
  // The same audit of a wallet that is not well kept finds the problem and still costs the money.
  const bad = run(`${CONFIGURED_WALLET("single")}`);
  assert(bad.last && !bad.last.passed && bad.until === 0, "an audit of a wallet that records no places passed");
  assert(bad.last.findings.some(f => /where the keys are kept/i.test(f)), `the audit did not say what was wrong: ${JSON.stringify(bad.last.findings)}`);
  assert(bad.during.cash === 4000 && bad.tier === "basic", "a failed audit was free, or changed the posture");
});

rule("an audit certificate lapses after a year", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    state.custody.auditUntil=state.time+DAY*10;
    const before=custodyPosture().tier;
    state.time+=DAY*11;
    return{before,after:custodyPosture().tier,valid:custodyAuditValid()};})()`);
  assert(r.before === "audited" && r.after === "strong" && !r.valid, `a lapsed audit left the posture at ${r.before} then ${r.after}`);
});

rule("a save from before audits arrives with none, and a posture it can be read from", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const loaded = loadWithSave(save);
  assert(loaded.ok, `the pre-sprint save could not be opened: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  const r = JSON.parse(read(`JSON.stringify({tier:custodyPosture().tier,until:custodyAuditUntil(),job:custodyAuditJob(),reason:auditBlockReason()})`));
  assert(r.tier === "basic" && r.until === 0 && r.job === null, `an old 2-of-3 with steel backups and no places was ${r.tier}`);
  assert(/security officer/i.test(r.reason), "an old save could be audited without a security officer");
});

rule("coin cover is priced by how well the keys are kept and by how much there is to lose", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    const refusedNone=coinCoverBlockReason();
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    const quotes={basic:coinCoverQuote("basic"),strong:coinCoverQuote("strong"),audited:coinCoverQuote("audited"),none:coinCoverQuote("none")};
    const before=insuranceMonthlyCost();
    toggleCoinCover();
    const bound={active:coinCoverActive(),premium:coinCoverPremium(),inBill:insuranceMonthlyCost()-before,inLedger:monthlyCost().insurance};
    state.wallets.hot*=2;state.wallets.cold*=2;
    const doubled=coinCoverPremium();
    return{refusedNone,quotes,bound,doubled};})()`);
  assert(/cannot sign|rebuilt/i.test(r.refusedNone), `a wallet that cannot sign was offered cover: "${r.refusedNone}"`);
  assert(r.quotes.none === null, "a posture of none was quoted");
  close(r.quotes.basic.premium / r.quotes.strong.premium, 1.5, 1e-9, "a basic posture does not cost half as much again as a strong one");
  close(r.quotes.audited.premium / r.quotes.strong.premium, .6, 1e-9, "an audited posture does not cost 40% less than a strong one");
  assert(r.quotes.basic.pays < r.quotes.strong.pays && r.quotes.strong.pays < r.quotes.audited.pays, "a better posture does not pay a larger share of a loss");
  assert(r.bound.active && r.bound.premium > 0, "cover could not be bound on a strong wallet");
  close(r.bound.inBill, r.bound.premium, 1e-6, "the premium is not part of the monthly insurance bill");
  assert(r.bound.inLedger >= r.bound.premium, "the premium is missing from the settlement forecast's insurance line");
  close(r.doubled / r.bound.premium, 2, 1e-9, "doubling the coins did not double the premium");
});

rule("cover pays a share of a covered theft by posture, and nothing inside its waiting period", () => {
  const claim = (setup, waitDays, cause = "hotwallet") => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${setup}
    if(${waitDays}!==null){toggleCoinCover();state.time+=DAY*${waitDays}}
    const cash0=state.cash,price=priceAt(state.time);
    reportCoinLoss({title:"t",kind:"stolen",btc:2,cause:"${cause}",what:"x",why:"y",remedy:"z"});
    const loss=pendingLoss();
    return{paid:state.cash-cash0,usd:2*price,share:(state.cash-cash0)/(2*price),text:loss.what,lossPaid:loss.paid};})()`);
  const strong = `${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}`;
  const strongPaid = claim(strong, 31);
  close(strongPaid.share, .7, 1e-9, "a strong posture did not get 70% of a covered theft back");
  assert(/Your cover paid/.test(strongPaid.text) && strongPaid.lossPaid > 0, "the loss notice did not say that cover paid");
  close(claim(`${strong}state.custody.auditUntil=state.time+DAY*400;`, 31).share, .85, 1e-9, "an audited posture did not get 85% back");
  close(claim(`${CONFIGURED_WALLET("single")}`, 31).share, .5, 1e-9, "a basic posture did not get 50% back");
  const early = claim(strong, 10);
  assert(early.paid === 0 && /does not pay for the first 30/.test(early.text), `cover paid inside its waiting period, or did not say why: "${early.text}"`);
  const none = claim(strong, null);
  assert(none.paid === 0 && !/cover/i.test(none.text), "a loss with no policy mentioned cover or was paid");
  close(claim(strong, 31, "burglary").share, .7, 1e-9, "a break-in was not covered");
});

rule("cover does not pay for what the policy treats as neglect, or for what is not a theft", () => {
  const claim = (kind, cause) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    toggleCoinCover();state.time+=DAY*40;
    const cash0=state.cash;
    reportCoinLoss({title:"t",kind:"${kind}",btc:2,cause:"${cause}",what:"x",why:"y",remedy:"z"});
    return{paid:state.cash-cash0,text:pendingLoss().what};})()`);
  for (const cause of ["entropy", "phishing", "insider"]) {
    const c = claim("stolen", cause);
    assert(c.paid === 0 && /does not pay for this/.test(c.text), `${cause}: cover paid, or did not explain: "${c.text}"`);
  }
  // The last two carry the label of a covered theft on purpose: only a theft is paid, whatever the cause says.
  for (const [kind, cause] of [["unrecoverable", "nobackup"], ["counterparty", "mtgox"], ["seized", "receivership"], ["counterparty", "hotwallet"], ["unrecoverable", "burglary"]]) {
    const c = claim(kind, cause);
    assert(c.paid === 0 && !/cover/i.test(c.text), `${kind}: a loss that is not a theft was paid or mentioned cover: "${c.text}"`);
  }
});

rule("an insurer withdraws cover it can no longer price, and a new policy waits again", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    toggleCoinCover();const bound=state.coinCover.since;
    toggleCoinCover();const cancelled=coinCoverActive();
    state.time+=DAY*50;toggleCoinCover();const rebound=state.coinCover.since;
    state.custody.devices[0].destroyed={cause:"fire"};state.custody.keys[0].backup={...state.custody.keys[0].backup,destroyed:true};
    const tier=custodyPosture().tier;advanceCoinCover(state.time,true);
    return{bound,cancelled,rebound,now:state.time,tier,after:coinCoverActive()};})()`);
  assert(!r.cancelled, "cancelling did not end the policy");
  assert(r.rebound === r.now - 0 + 0 || r.rebound > r.bound, "binding again did not restart the waiting period");
  assert(r.tier === "none" && !r.after, `an insurer kept cover on keys that could not be rebuilt: posture ${r.tier}, active ${r.after}`);
});

rule("a save from before coin cover arrives with none, and nothing in its bill", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const loaded = loadWithSave(save);
  assert(loaded.ok, `the pre-sprint save could not be opened: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  const r = JSON.parse(read(`JSON.stringify({active:coinCoverActive(),premium:coinCoverPremium(),insurance:insuranceMonthlyCost(),migration:migrationInsuranceCost()})`));
  assert(!r.active && r.premium === 0 && r.insurance === r.migration, "an old save arrived with cover it never bought");
});

/* A quorum wallet a lender will co-sign for: strong posture, descriptor copied, every backup on steel and apart. */
const LENDABLE_WALLET = `${PLACED_WALLET("2of3", [{device:"site",backup:"bank",steel:true},{device:"home",backup:"bank",steel:true},{device:"home",backup:"trusted",steel:true}], "bank")}state.custody.configCopies=["trusted"];`;

rule("a lender will only co-sign a wallet it can rely on, and a pledge needs only coins", () => {
  const reason = (mode, setup, date = "2021-02-01") => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("${date}");state.facility="warehouse";`)}
    ${setup}
    return securedBlockReason("${mode}");})()`);
  assert(/quorum/i.test(reason("collaborative", PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}]))), "a single-signature wallet was offered a collaborative loan");
  assert(/strong/i.test(reason("collaborative", `${CONFIGURED_WALLET("2of3")}`)), "a quorum wallet that records no places was offered a collaborative loan");
  assert(reason("collaborative", LENDABLE_WALLET) === "", `a strong quorum was refused: "${reason("collaborative", LENDABLE_WALLET)}"`);
  assert(/until/i.test(reason("pledge", ``, "2017-06-01")), "somebody lent against bitcoin in 2017");
  assert(reason("pledge", ``) === "", "a pledge needed anything but coins in the hot wallet");
  assert(/no coins in the hot/i.test(reason("pledge", `state.wallets.hot=0;`)), "a pledge was offered with nothing in the hot wallet");
});

rule("a collaborative loan lends more and charges less than a pledge, and pays out when the coins are in place", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    ${LENDABLE_WALLET}
    const price=priceAt(state.time),cold0=state.wallets.cold,cash0=state.cash,total0=totalBtc(),worth0=netWorth();
    const quote=securedQuote("collaborative",.5),pledgeQuote=securedQuote("pledge",.5);
    borrowSecured("collaborative",.5);
    const l=securedLoan(),during={cold:state.wallets.cold,cash:state.cash-cash0,pending:!!l.pending,principal:l.principal,pledgedBtc:securedPledgedBtc(),
      total:totalBtc(),days:quote.days,controlled:controlled()};
    let t=0;while(securedLoan().pending&&t<20){tick(true);t++}
    const done=securedLoan();
    return{price,cold0,quote,pledgeQuote,during,t,done:{principal:done.principal,pledged:done.pledged,cashGain:state.cash-cash0},rate:done.rate,
      interest:securedInterestMonthly(),bill:financeInterestMonthly()};})()`);
  assert(r.quote.principal > r.pledgeQuote.principal * 0, "no loan was quoted");
  assert(r.quote.ltv > r.pledgeQuote.ltv && r.quote.rate < r.pledgeQuote.rate, `collaborative (${r.quote.ltv} at ${r.quote.rate}) is not better than a pledge (${r.pledgeQuote.ltv} at ${r.pledgeQuote.rate})`);
  assert(r.during.pending && r.during.cash === 0 && r.during.days >= 2, `the money arrived before the coins did: ${JSON.stringify(r.during)}`);
  assert(r.during.cold < r.cold0 - 19, "the coins did not leave cold storage when the loan was agreed");
  assert(r.during.pledgedBtc > 19 && r.during.total > r.cold0 + 10 - 1, "coins on their way to the lender vanished from the totals");
  assert(r.t >= 2 && r.done.principal > 0, "the loan never paid out");
  // Less than a bank box's monthly fee may have gone out on the way, because the days crossed a month.
  close(r.done.cashGain, r.done.principal, 20, "the payout is not the principal");
  close(r.done.principal, r.quote.principal, 1e-6, "the loan paid a different sum than it quoted");
  close(r.interest, r.done.principal * r.rate, 1e-9, "the monthly interest is not the principal at its rate");
  assert(r.bill >= r.interest, "the interest on a loan against coins is missing from the month-end bill");
});

rule("a pledge is instant, costs more, and the coins stop being spendable though they still count", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    const price=priceAt(state.time),cash0=state.cash,hot0=state.wallets.hot,total0=totalBtc(),worth0=netWorth(),ctl0=controlled(),liquid0=marketLiquidBtc();
    const quote=securedQuote("pledge",.5);
    borrowSecured("pledge",.5);
    const l=securedLoan();
    return{price,quote,principal:l.principal,pending:!!l.pending,cash:state.cash-cash0,hotLeft:state.wallets.hot,hot0,
      total:[total0,totalBtc()],worth:[worth0,netWorth()],controlled:[ctl0,controlled()],liquid:[liquid0,marketLiquidBtc()],pledged:securedPledgedBtc()};})()`);
  assert(!r.pending && r.cash > 0, "a pledge was not paid out at once");
  close(r.cash, r.quote.principal, 1e-6, "the pledge paid a different sum than it quoted");
  close(r.principal / (r.quote.pledged * r.price), .4, 1e-9, "a pledge did not lend 40% of the coins' value");
  assert(r.hotLeft < r.hot0 - 4, "the coins did not leave the hot wallet");
  assert(r.controlled[1] < r.controlled[0] && r.liquid[1] < r.liquid[0], "pledged coins were still spendable");
  close(r.total[1], r.total[0] - r.quote.fee, 1e-9, "pledged coins fell out of the total, or were counted twice");
  assert(Math.abs(r.worth[1] - r.worth[0]) < r.quote.fee * r.price * 2 + 1, `borrowing changed net worth by ${r.worth[1] - r.worth[0]}; cash in and a debt of the same size should cancel`);
});

rule("interest on a loan against coins is in the forecast and in the bill that is actually queued", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-10");state.facility="warehouse";state.hardware={};`)}
    borrowSecured("pledge",.5);
    const l=securedLoan(),expected=l.principal*l.rate;
    const forecast=settlementForecast().breakdown.finance;
    state.cash=0;
    for(let n=0;n<60&&!state.pendingSettlement;n++)tick(true);
    return{expected,forecast,queued:state.pendingSettlement?state.pendingSettlement.loanInterest:null};})()`);
  close(r.forecast, r.expected, 1e-6, "the settlement forecast does not include interest on the loan against coins");
  assert(r.queued !== null, "no settlement was queued");
  close(r.queued, r.expected, 1e-6, "the settlement queued at month end does not charge interest on the loan against coins");
});

rule("a falling price calls a loan, adding coins cures it, and ignoring it sells the collateral", () => {
  const base = `${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}borrowSecured("pledge",.5);`;
  const stress = (extra, days) => json(`(()=>{
    ${base}
    const l=securedLoan(),t0=state.time,price=priceAt(t0);
    l.principal=l.pledged*price*.78;                       // the price fell, which is to say the debt is now 78% of the coins
    advanceSecuredLoan(state.time,true);
    const called={call:!!securedLoan().call,ltv:securedLtv()};
    ${extra}
    // The price stays where it was for the fortnight, so only the loan is being tested: scale the debt by how far the real series moved.
    l.principal=l.principal*priceAt(t0+DAY*${days})/price;
    const expectedSold=Math.min(l.pledged,l.principal*1.05/priceAt(t0+DAY*${days})),hot0=state.wallets.hot;
    advanceSecuredLoan(t0+DAY*${days},true);
    return{expectedSold,returned:state.wallets.hot-hot0,pledged:l.pledged,called,after:securedLoan()?{call:!!securedLoan().call,principal:securedLoan().principal,pledged:securedLoan().pledged}:null,
      loss:pendingLoss()?{kind:pendingLoss().kind,cause:pendingLoss().cause,btc:pendingLoss().btc}:null,hot:state.wallets.hot};})()`);
  const ignored = stress("", 13), expired = stress("", 15);
  assert(ignored.called.call && ignored.called.ltv > .75, "a loan at 78% was not called");
  assert(ignored.after && ignored.after.call && !ignored.loss, "a loan was sold before its fourteen days were up");
  assert(expired.after === null && expired.loss && expired.loss.kind === "seized" && expired.loss.cause === "margin", "an unanswered call did not sell the collateral");
  close(expired.loss.btc, expired.expectedSold, 1e-9, "the lender sold a different amount than the debt and its penalty come to");
  close(expired.returned, expired.pledged - expired.expectedSold, 1e-9, "what the lender did not need to sell was not returned");
  const cured = stress("addSecuredCollateral(.5);", 13);
  assert(cured.after && !cured.after.call && !cured.loss, `adding coins did not cure the call: ${JSON.stringify(cured.after)}`);
  const crash = json(`(()=>{
    ${base}
    const l=securedLoan();l.principal=l.pledged*priceAt(state.time)*.9;
    advanceSecuredLoan(state.time,true);
    return{loan:securedLoan(),loss:pendingLoss()&&pendingLoss().cause};})()`);
  assert(crash.loan === null && crash.loss === "margin", "a fall through the second line did not sell at once");
});

rule("repaying a loan returns the coins, to the hot wallet at once or to cold storage once the lender has co-signed", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);
    const hot1=state.wallets.hot,l=securedLoan(),pledged=l.pledged,principal=l.principal;state.cash=principal+1000;
    repaySecuredLoan();
    const pledge={loan:securedLoan(),hotBack:state.wallets.hot-hot1,pledged,cash:state.cash};
    ${LENDABLE_WALLET}
    borrowSecured("collaborative",.5);
    let t=0;while(securedLoan().pending&&t<20){tick(true);t++}
    const cold1=state.wallets.cold,c=securedLoan(),cp=c.pledged;state.cash=c.principal+1000;
    repaySecuredLoan();
    const during={loan:securedLoan(),jobs:state.coldSpends.length,inFlight:coldInFlightBtc()};
    t=0;while(state.coldSpends.length&&t<30){tick(true);t++}
    return{pledge,collab:{during,coldBack:state.wallets.cold-cold1,cp,t}};})()`);
  assert(r.pledge.loan === null && Math.abs(r.pledge.hotBack - r.pledge.pledged) < 1e-9, "repaying a pledge did not return every coin to the hot wallet");
  assert(r.pledge.cash === 1000, `repaying cost ${r.pledge.cash} instead of the principal`);
  assert(r.collab.during.loan === null && r.collab.during.jobs === 1 && r.collab.during.inFlight > 0, "repaying a collaborative loan did not start the coins coming back");
  assert(r.collab.t >= 2 && r.collab.coldBack > r.collab.cp - 0.01 && r.collab.coldBack <= r.collab.cp, "the coins did not arrive back in cold storage, less the network fee");
});

rule("repaying part of a loan returns the same share of the coins and keeps the loan to value", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);
    const l=securedLoan(),p0=l.principal,c0=l.pledged,ltv0=securedLtv(),interest0=securedInterestMonthly(),hot0=state.wallets.hot;
    state.cash=p0;
    repaySecuredLoan(.25);
    const m=securedLoan();
    const part={principal:m.principal,pledged:m.pledged,ltv:securedLtv(),interest:securedInterestMonthly(),cash:state.cash,hotBack:state.wallets.hot-hot0};
    repaySecuredLoan(1);
    return{p0,c0,ltv0,interest0,part,after:securedLoan(),cashEnd:state.cash};})()`);
  close(r.part.principal, r.p0 * .75, 1e-6, "a quarter repaid did not leave three quarters owed");
  close(r.part.pledged, r.c0 * .75, 1e-12, "a quarter repaid did not release a quarter of the coins");
  close(r.part.ltv, r.ltv0, 1e-9, "repaying part of the loan moved the loan to value");
  close(r.part.interest, r.interest0 * .75, 1e-6, "interest did not fall with what was owed");
  close(r.part.cash, r.p0 * .75, 1e-6, "a quarter repaid did not cost a quarter of the principal");
  assert(r.after === null && Math.abs(r.cashEnd) < 1e-6, "repaying the rest did not close the loan at exactly what was left");
});

rule("a lender failing takes a pledge and leaves the debt, and spares a quorum it held one key of", () => {
  const pledge = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2022-06-12");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);
    const l=securedLoan();l.lender="celsius";const pledged=l.pledged,principal=l.principal,loan0=state.projectLoan,frozen0=state.wallets.frozen;
    applyLenderFailure("celsius");
    return{loan:securedLoan(),frozen:state.wallets.frozen-frozen0,debt:state.projectLoan-loan0,pledged,principal,loss:pendingLoss()&&pendingLoss().kind,
      lostBtc:pendingLoss()&&pendingLoss().btc};})()`);
  const collab = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2022-06-12");state.facility="warehouse";`)}
    ${LENDABLE_WALLET}
    borrowSecured("collaborative",.5);let t=0;while(securedLoan().pending&&t<20){tick(true);t++}
    const before={pledged:securedLoan().pledged,loan:state.projectLoan};
    applyLenderFailure();
    return{loan:!!securedLoan(),pledged:securedLoan()?securedLoan().pledged:0,before,loss:!!pendingLoss(),projectLoan:state.projectLoan};})()`);
  assert(pledge.loan === null && pledge.loss === "counterparty", "a pledge to a failed lender was not lost to a claim");
  close(pledge.frozen, pledge.pledged * .7, 1e-9, "70% of a failed lender's pledge should be a frozen claim");
  close(pledge.lostBtc, pledge.pledged * .3, 1e-9, "30% of a failed lender's pledge should be written off");
  close(pledge.debt, pledge.principal, 1e-6, "the debt did not survive the collateral as ordinary borrowing");
  assert(collab.loan && collab.pledged === collab.before.pledged && !collab.loss && collab.projectLoan === collab.before.loan, "a lender that held one key of three cost the borrower coins");
  const hit = json(`(()=>({events:EVENTS.filter(e=>String(e.fx||"").indexOf("lender")===0).map(e=>e.date).sort(),
    lenders:SECURED_LENDERS.filter(x=>x.failsOn).map(x=>x.failsOn).sort()}))()`);
  assert(hit.events.length === 3 && JSON.stringify(hit.events) === JSON.stringify(hit.lenders),
    `the lender failures are not in the record on the dates the lenders fail: ${JSON.stringify(hit)}`);
});

rule("only the lender that failed takes the pledge, and a quorum never has one to lose", () => {
  const run = (lender, failing) => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2022-06-12");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);
    securedLoan().lender="${lender}";
    applyLenderFailure("${failing}");
    return{kept:!!securedLoan(),loss:!!pendingLoss(),lostShare:pendingLoss()?pendingLoss().btc:0};})()`);
  const hit = run("voyager", "voyager"), miss = run("voyager", "celsius"), survivor = run("nexo", "blockfi");
  assert(!hit.kept && hit.loss, "a pledge to the lender that failed was not taken");
  assert(miss.kept && !miss.loss && survivor.kept && survivor.loss === false, "a pledge to a different lender was taken when somebody else failed");
  const chosen = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2020-03-01");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);const a=securedLoan().lender;
    state.securedLoan=null;
    ${LENDABLE_WALLET}
    borrowSecured("collaborative",.5);const b=securedLoan().lender;
    const seen=new Set();for(let i=0;i<200;i++){state.seed=i+1;state.time=at("2020-03-01")+i*DAY;seen.add(securedLenderFor().id)}
    return{a,b,seen:[...seen],known:SECURED_LENDERS.some(x=>x.id===a)};})()`);
  assert(chosen.known && chosen.b === undefined, `a pledge named ${chosen.a} and a quorum loan named ${chosen.b}; only a pledge is a claim on a company`);
  assert(chosen.seen.length === 5, `the lender is not varying with the seed and the day: ${chosen.seen.join(", ")}`);
});

rule("a bill can be paid by borrowing against coins: a pledge at once, a quorum through the grace month", () => {
  const WAITING = `state.time=at("2021-02-10");state.facility="warehouse";state.hardware={s9:100};state.cash=0;state.speed=1;`;
  const pledge = json(`(()=>{
    ${CUSTODY_SITE(WAITING)}
    for(let n=0;n<60&&!state.pendingSettlement;n++)tick(true);
    const due=state.pendingSettlement.due,plan=settlementBorrowPlan("pledge");
    borrowForSettlement("pledge");
    return{pending:!!state.pendingSettlement,cash:state.cash,due,covers:plan.covers,loan:!!securedLoan()};})()`);
  const collab = json(`(()=>{
    ${CUSTODY_SITE(WAITING)}
    ${LENDABLE_WALLET}
    for(let n=0;n<60&&!state.pendingSettlement;n++)tick(true);
    const plan=settlementBorrowPlan("collaborative");
    borrowForSettlement("collaborative");
    const after={pending:!!state.pendingSettlement,debt:state.debt,speed:state.speed,loan:!!securedLoan(),pend:!!(securedLoan()&&securedLoan().pending)};
    let t=0;while(securedLoan()&&securedLoan().pending&&t<20){tick(true);t++}
    return{covers:plan.covers,after,paidOut:securedLoan().principal,cash:state.cash,debt:state.debt};})()`);
  assert(pledge.covers && !pledge.pending && pledge.cash >= 0 && pledge.loan, "borrowing against hot coins did not clear the bill that was waiting");
  assert(collab.covers && !collab.after.pending && collab.after.debt > 0 && collab.after.speed > 0 && collab.after.pend, "a collaborative loan did not carry the bill and restart the clock while the coins went into place");
  assert(collab.paidOut > 0 && collab.cash >= collab.debt, "the loan did not pay out enough to clear the arrears it carried");
});

rule("borrowing at the November 2021 peak and doing nothing ends in a margin call and a sale", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-11-10");state.facility="warehouse";state.hardware={};state.cash=1e7;`)}
    borrowSecured("pledge",.5);
    const l=securedLoan(),peak=priceAt(state.time),ltv0=securedLtv();
    let called=null,sold=null,t=0;
    while(t<400&&!sold){
      tick(true);t++;
      const now=securedLoan();
      if(now&&now.call&&called===null)called=t;
      if(!now)sold=t;
    }
    const loss=pendingLoss();
    return{peak,ltv0,called,sold,loss:loss?{kind:loss.kind,cause:loss.cause}:null,date:new Date(state.time).toISOString().slice(0,10)};})()`);
  close(r.ltv0, .4, 1e-9, "the pledge did not start at 40% of the coins' value");
  assert(r.called !== null && r.sold !== null, `a loan taken at the top of the market was never called or sold by ${r.date}`);
  assert(r.called < r.sold, "the lender sold before it called");
  assert(r.loss && r.loss.kind === "seized" && r.loss.cause === "margin", `the collateral was not reported as sold on a margin call: ${JSON.stringify(r.loss)}`);
});

rule("borrowing less than the coins allow starts the loan lower, and survives what sells a loan at the limit", () => {
  const through = use => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-04-14");state.facility="warehouse";state.hardware={};state.cash=1e7;`)}
    // The April 2021 peak, and the fall to July. A pledge is lost to the lender that fails in June 2022 whatever its size, so the question here is the price alone.
    borrowSecured("pledge",.5,{use:${use}});
    const l=securedLoan(),ltv0=securedLtv(),principal=l.principal;
    let soldOn=null;const stop=Date.UTC(2021,9,1);
    for(let n=0;n<400&&!soldOn&&state.time<stop;n++){tick(true);if(!securedLoan())soldOn=new Date(state.time).toISOString().slice(0,10)}
    return{ltv0,principal,soldOn,alive:!!securedLoan(),date:new Date(state.time).toISOString().slice(0,10)};})()`);
  const max = through(1), safer = through(.6);
  close(max.ltv0, .4, 1e-9, "a pledge at the limit did not start at 40%");
  close(safer.ltv0, .24, 1e-9, "borrowing 60% of what the coins allow did not start at 24%");
  close(safer.principal / max.principal, .6, 1e-9, "borrowing 60% of the limit did not lend 60% as much");
  assert(max.soldOn !== null && max.soldOn < "2021-09-01", `a loan at the limit survived the fall from the April 2021 peak: ${JSON.stringify(max)}`);
  assert(safer.alive && safer.soldOn === null, `a loan at 60% of the limit was sold in the same fall: ${JSON.stringify(safer)}`);
  // An unsupported size is not trusted: it lends at the limit rather than at whatever was asked.
  const odd = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    borrowSecured("pledge",.5,{use:7});return securedLtv();})()`);
  assert(odd <= .4 + 1e-9, `an absurd loan size lent at ${odd} of the coins' value`);
});

rule("a loan gives notice before it is called, and the notice clears when the price recovers", () => {
  const step = ratio => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    borrowSecured("pledge",.5);
    const l=securedLoan(),price=priceAt(state.time);
    l.principal=l.pledged*price*.72;advanceSecuredLoan(state.time,true);
    const warned={warned:!!securedLoan().warned,call:!!securedLoan().call,loss:!!pendingLoss()};
    l.principal=l.pledged*price*${ratio};advanceSecuredLoan(state.time,true);
    return{warned,after:{warned:!!securedLoan().warned,call:!!securedLoan().call}};})()`);
  const worse = step(.78), better = step(.6);
  assert(worse.warned.warned && !worse.warned.call && !worse.warned.loss, `a loan at 72% should warn and not yet be called: ${JSON.stringify(worse.warned)}`);
  assert(worse.after.call, "a loan at 78% was not called after the warning");
  assert(!better.after.warned && !better.after.call, "the warning did not clear when the loan came back to 60%");
});

rule("paying a bill with a loan borrows well below the limit", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-10");state.facility="warehouse";state.hardware={s9:100};state.cash=0;state.speed=1;`)}
    for(let n=0;n<60&&!state.pendingSettlement;n++)tick(true);
    const plan=settlementBorrowPlan("pledge");
    borrowForSettlement("pledge");
    return{planLtv:plan.ltv,startLtv:securedLtv(),covers:plan.covers};})()`);
  assert(r.covers, "the plan did not cover the bill, so this rule proves nothing");
  close(r.planLtv, .24, 1e-9, "paying a bill pledged for a loan at the limit instead of at 60% of it");
  assert(r.startLtv < .3, `a loan taken to pay a bill started at ${r.startLtv} of the coins' value`);
});

rule("coin cover is priced within reach of what it can be expected to pay", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";state.skills=["backups"];`)}
    ${PLACED_WALLET("single", [{device:"site",backup:"bank",steel:true}])}
    state.wallets.hot=50;state.wallets.cold=50;
    const tier=custodyPosture().tier,q=coinCoverQuote(tier),price=priceAt(state.time);
    const expectedLoss=12*hotWalletIncidentRisk()*.26*state.wallets.hot,expectedPaid=expectedLoss*q.pays;
    return{tier,premiumYear:q.premium*12/price,expectedPaid,holdings:100,rate:q.premium*12/(price*100)};})()`);
  assert(r.tier === "strong", `the wallet was ${r.tier}`);
  const loading = r.premiumYear / r.expectedPaid;
  assert(loading > 2 && loading < 60, `cover costs ${loading.toFixed(0)} times what it is expected to pay; it should be a decision, not an obvious yes or an obvious no`);
  assert(r.rate < .01, `cover at a strong posture costs ${(r.rate * 100).toFixed(2)}% of the coins a year`);
});

rule("borrowing does not make a player richer: cash in and a debt of the same size cancel", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";state.cash=500000;`)}
    state.operator.lastRevenueUsd=400000;
    const w0=netWorth();takeProjectLoan();const afterOperating=netWorth(),borrowed=state.projectLoan;
    borrowSecured("pledge",.5);const feeValue=securedQuote("pledge",.5).fee*priceAt(state.time);
    return{w0,afterOperating,borrowed,afterBoth:netWorth(),feeValue};})()`);
  assert(r.borrowed > 0, "the operating loan could not be drawn, so this rule proves nothing about it");
  close(r.afterOperating, r.w0, 1e-6, "drawing the operating loan changed net worth; the cash is offset by the debt");
  assert(Math.abs(r.afterBoth - r.w0) < r.feeValue * 2 + 1, `borrowing against coins moved net worth by ${r.afterBoth - r.w0}`);
});

rule("a save from before loans against coins arrives with none", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const loaded = loadWithSave(save);
  assert(loaded.ok, `the pre-sprint save could not be opened: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  const r = JSON.parse(read(`JSON.stringify({loan:securedLoan(),principal:securedPrincipal(),pledged:securedPledgedBtc(),interest:securedInterestMonthly(),bill:financeInterestMonthly()==state.projectLoan*projectLoanRate()})`));
  assert(r.loan === null && r.principal === 0 && r.pledged === 0 && r.interest === 0 && r.bill, "an old save arrived with a loan it never took");
});

rule("creditors can sell only the cold coins a wallet could actually sign for", () => {
  const taken = wallet => json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${wallet}
    state.wallets.hot=10;state.wallets.cold=40;
    const sold=sellControlledBtc(1000);
    return{sold,hot:state.wallets.hot,cold:state.wallets.cold};})()`);
  const unsigned = taken(``), signing = taken(CONFIGURED_WALLET("single"));
  assert(unsigned.cold === 40 && unsigned.sold === 10, `a receiver sold ${unsigned.sold} BTC including cold coins no wallet could sign for`);
  assert(signing.cold === 0 && signing.sold === 50, `a receiver could not sell cold coins the operator could sign for: sold ${signing.sold}`);
});

rule("a quorum you cannot assemble is permanent, not slow", () => {
  const r = json(`(()=>{
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    ${CONFIGURED_WALLET("2of3")}
    const ok=coldSpendBlockReason();
    // Take the keys away: the policy still demands three, and nothing satisfies it.
    state.custody.assigned=[];
    const broken=coldSpendBlockReason();
    const held=state.wallets.cold;
    transfer("cold","hot",.5);
    return {ok,broken,held,coldAfter:state.wallets.cold,jobs:state.coldSpends.length}})()`);
  assert(r.ok === "", `a configured 2-of-3 refused to sign: ${r.ok}`);
  /* Not a delay - a wall, and one that says which wall it is. This is the lesson a "back up
     your keys" sentence cannot teach: a backup is a belief until you restore from it. */
  assert(/keys/i.test(r.broken), "an unsatisfiable quorum gave no reason, or the wrong one");
  assert(r.jobs === 0 && r.coldAfter === r.held,
    "coins left a wallet that cannot produce a signature");
});

/* ---- SOLVENCY: paying a bill and earning it are not the same thing ---- */

rule("a bill met by selling the treasury is not a solvent month", () => {
  const r = json(`(()=>{
    const run=(startingCash)=>{
      ${SITE(``)}
      state.time=at("2017-01-01");state.facility="warehouse";state.region="na";
      state.hardware={s9:100};state.cash=startingCash;
      state.wallets={hot:1000,cold:0,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
      state.projectLoan=0;state.debt=0;state.arrearsDue=0;
      state.operator=Object.assign(state.operator,{restructures:0,bridgeLoans:0,
        profitableMonths:0,solventMonths:0,totalMonths:0,competitiveMonths:0});
      Object.values(state.operator.eras).forEach(e=>{e.months=0;e.solvent=0;e.profitable=0;e.uptime=0;e.competitive=0});
      for(let i=0;i<420&&!state.ended;i++){
        tick();
        if(state.pendingSettlement){
          /* The player going to the Market and selling what the bill needs, at the 0.6% fee. */
          const need=Math.max(0,state.pendingSettlement.due-state.cash),px=priceAt(state.time)*.994;
          if(need>0){const btc=Math.min(state.wallets.hot,need/px);state.wallets.hot-=btc;state.cash+=btc*px}
          if(state.cash+1e-8>=state.pendingSettlement.due)finishMonthlySettlement("btc-rescue");
          else enterReceivership();
        }
      }
      return {solvent:state.operator.solventMonths,months:state.operator.totalMonths,
        btcLeft:state.wallets.hot};
    };
    return {funded:run(1e9),liquidating:run(0)};})()`);
  assert(r.funded.months > 6, "the funded run did not reach enough month boundaries to compare");
  assert(r.funded.solvent === r.funded.months,
    `an operation paying every bill from cash recorded ${r.funded.solvent} solvent months of ${r.funded.months}`);
  assert(r.liquidating.months > 6, "the liquidating run did not reach enough month boundaries to compare");
  assert(r.liquidating.solvent === 0,
    `an operation funding itself by selling its treasury recorded ${r.liquidating.solvent} solvent months, as though it had earned the money`);
  assert(r.liquidating.btcLeft < 1000, "the liquidating run never actually sold anything, so this rule proves nothing");
});

rule("an operation with nothing left to sell reaches an end", () => {
  const r = json(`(()=>{
    ${SITE(``)}
    state.time=at("2017-01-01");state.facility="warehouse";state.region="na";
    state.hardware={s9:100};state.cash=0;
    state.wallets={hot:0,cold:0,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
    state.projectLoan=0;state.debt=0;state.arrearsDue=0;state.gridCutAnnounced=false;
    state.operator=Object.assign(state.operator,{restructures:0,bridgeLoans:0});
    let days=0;
    for(let i=0;i<2000&&!state.ended;i++){
      tick();days++;
      // only moves the interface permits: deferral is barred once arrears are carried
      if(state.pendingSettlement){ if(state.debt<=0)deferSettlement(); else enterReceivership(); }
    }
    return {days,ended:state.ended,reason:state.endReason};})()`);
  assert(r.ended, `a broke operation with no coins and no credit ran for ${r.days} days without the run ever ending`);
  assert(r.days < 400, `it took ${r.days} days for a hopeless position to resolve, which is too long to be a consequence`);
});

/* ---- SPENDING: the one path where coins leave and nothing financial comes back ---- */

rule("spending on a gift card takes the coins, pays experience, and respects its dates", () => {
  const r = json(`(()=>{
    ${SITE(``)}
    state.time=at("2013-12-01");state.facility="warehouse";state.region="na";state.hardware={};
    state.wallets={hot:20,cold:0,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
    state.giftCards={spentBtc:0,spentUsd:0,cards:0};state.xp=normalizeXp(state.xp);
    const price=priceAt(state.time);
    const before={hot:state.wallets.hot,xp:state.xp.total,spend:state.xp.sources.spend};
    buyGiftCard("gyft",100);
    const after={hot:state.wallets.hot,xp:state.xp.total,spend:state.xp.sources.spend,
      spentBtc:state.giftCards.spentBtc,cards:state.giftCards.cards};
    // a vendor that does not exist yet, and a date before anything had a price
    state.time=at("2012-01-01");const beforeEarly=state.wallets.hot;buyGiftCard("gyft",25);
    const earlyMoved=state.wallets.hot!==beforeEarly;
    state.time=at("2010-01-01");const beforeMarket=state.wallets.hot;buyGiftCard("gyft",25);
    const preMarketMoved=state.wallets.hot!==beforeMarket;
    return {before,after,price,earlyMoved,preMarketMoved,
      curve:[10,100,5000].map(u=>giftCardXpFor(u))};})()`);
  close(r.before.hot - r.after.hot, 100 / r.price, 1e-9, "the coins taken do not match the card's price in bitcoin");
  close(r.after.spentBtc, 100 / r.price, 1e-9, "the ledger of what was spent does not match what left the wallet");
  assert(r.after.cards === 1, "the card was not recorded");
  assert(r.after.xp > r.before.xp, "spending bitcoin taught the operator nothing");
  assert(r.after.spend > r.before.spend, "the experience was awarded but not attributed to spending");
  assert(!r.earlyMoved, "coins were spent at a vendor that did not take bitcoin yet");
  assert(!r.preMarketMoved, "a gift card was priced in bitcoin before bitcoin had a price");
  assert(r.curve[2] < r.curve[0] * 30,
    `experience scales too close to linearly with spend (${r.curve.map(Math.round).join(", ")}), so buying one enormous card would be the whole game`);
});

/* ---- CUSTODY: where coins sit has to matter ---- */

rule("cold storage is safe and a hot wallet is not", () => {
  const risks = json(`(()=>{
    const out={};
    for(const [label,hot,cold] of [["allHot",100,0],["half",50,50],["allCold",0,100]]){
      ${SITE(``)}
      state.time=at("2014-01-01");
      state.wallets={hot,cold,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
      out[label]={monthly:hotWalletIncidentRisk(),annual:hotWalletAnnualRisk()};
    }
    return out;})()`);
  assert(risks.allCold.monthly === 0, "cold storage carries a key-compromise risk, which is not what cold storage means");
  assert(risks.allHot.monthly > 0, "a fully hot wallet carries no risk at all, so custody placement is free");
  assert(risks.half.monthly < risks.allHot.monthly, "moving coins to cold storage does not reduce the risk");
  // The roll is gated to one per calendar month, so the annual figure must compound 12 times
  // rather than 365. A daily roll of a monthly rate would be thirty times too punishing.
  close(risks.allHot.annual, 1 - Math.pow(1 - risks.allHot.monthly, 12), 1e-9,
    "the annual risk does not compound as a monthly roll");
});

rule("the venues that failed can still take coins off you", () => {
  const wired = json(`["mtgox","bitfinexhack","quadriga","ftx"].map(id=>{
    const e=EVENTS.find(x=>x.id===id);
    return {id,found:!!e,fx:e?e.fx||null:null};
  })`);
  for (const row of wired) {
    assert(row.found, `the ${row.id} collapse is missing from the timeline`);
    assert(row.fx, `${row.id} has no effect wired to it, so holding a balance there is free`);
  }
});

/* ---- SECURITIES: the instruments must behave as advertised ---- */

rule("each security's price tracks the BTC sensitivity it advertises", () => {
  const rows = json(`STRATEGY_SECURITIES.map(s=>{
    const t0=at(s.date),t1=Math.min(END,t0+300*DAY);
    state.time=t0;const p0=strategyPrice(s.id);
    state.time=t1;const p1=strategyPrice(s.id);
    const btc=priceAt(t1)/priceAt(t0)-1;
    return {ticker:s.ticker,declared:s.btcBeta,implied:btc?((p1/p0-1)/btc):null};
  })`);
  for (const row of rows) {
    assert(row.implied !== null, `${row.ticker} has no tradable window to price against`);
    close(row.implied, row.declared, .02, `${row.ticker} moves at beta ${row.implied.toFixed(2)} against a declared ${row.declared}`);
  }
});

rule("each security pays the yield it advertises", () => {
  const rows = json(`(()=>{
    const out=[];
    for(const sec of STRATEGY_SECURITIES){
      ${SITE(``)}
      // Held at a home site with no fleet and deep cash, so the run cannot end early and
      // drag the measurement down - an earlier version of this went bankrupt at day 172
      // and reported a 10% instrument paying 4.7%.
      state.time=at(sec.date)+DAY;state.facility="home";state.region="na";
      state.hardware={};state.cash=1e9;
      state.strategy={mstr:0,strk:0,strf:0,strd:0,strc:0,yieldEarned:0};
      state.strategy[sec.id]=1000;
      const notional=1000*strategyPrice(sec.id);
      let days=0;
      for(let d=0;d<365;d++){const before=state.time;tick();if(state.time>before)days++}
      out.push({ticker:sec.ticker,declared:sec.yield*100,
        effective:100*state.strategy.yieldEarned/notional,days,ended:!!state.ended});
    }
    return out;})()`);
  for (const row of rows) {
    assert(row.days === 365 && !row.ended, `the ${row.ticker} measurement only ran ${row.days} days, so it proves nothing`);
    // Accrual is on the live price, so a year of drift moves the realised rate a little.
    close(row.effective, row.declared, 1.5, `${row.ticker} advertises ${row.declared}% and paid ${row.effective.toFixed(2)}%`);
  }
});

/* ---- COOLING: a ladder where every rung is a trade-off ---- */

/* The carve-out above is only honest while it stays narrow: plant excused from the $/kW
   comparison has to earn its place by holding miners, and has to actually be reachable. */
rule("cooling plant excused from the cost ladder earns it by holding miners", () => {
  const problems = json(`(()=>{
    const out=[];
    for(const item of COOLING_EQUIPMENT){
      if(!item.units)continue;
      if(!(item.units>0))out.push(item.id+" claims a unit capacity that is not a positive number");
      if(!(item.coolingKw>0))out.push(item.id+" rejects no heat");
      if(item.minTier>item.maxTier)out.push(item.id+" is available at no facility tier");
    }
    return out;})()`);
  assert(problems.length === 0, `plant excused from the ladder does not justify itself: ${problems.join("; ")}`);
});


/* Plant carrying a unit capacity is not competing on heat rejection alone - an immersion
   tank also holds the miners and changes what they do, so it is bought for reasons this
   comparison cannot see, and is expected to lose on dollars per kilowatt. The companion rule
   above stops that becoming an excuse for any plant to be dominated. */
rule("no cooling plant is beaten on both cost and efficiency at the same tier", () => {
  const problems = json(`(()=>{
    const out=[];
    for(let tier=1;tier<=FACILITIES.length;tier++){
      const avail=COOLING_EQUIPMENT.filter(c=>tier>=c.minTier&&tier<=c.maxTier&&!c.units);
      for(const a of avail)for(const b of avail){
        if(a===b)continue;
        const ac=a.cost/a.coolingKw,ae=a.coolingKw/(a.watts/1000);
        const bc=b.cost/b.coolingKw,be=b.coolingKw/(b.watts/1000);
        if(bc<=ac&&be>=ae&&(bc<ac||be>ae))out.push("tier "+tier+": "+a.id+" is beaten by "+b.id);
      }
    }
    return [...new Set(out)];})()`);
  assert(problems.length === 0, `a site can buy strictly better plant for less: ${problems.join("; ")}`);
});

rule("every facility tier can cool itself", () => {
  const orphans = json(`FACILITIES.map((f,i)=>i+1)
    .filter(tier=>!COOLING_EQUIPMENT.some(c=>tier>=c.minTier&&tier<=c.maxTier))`);
  assert(orphans.length === 0, `facility tiers with no cooling plant available: ${orphans.join(", ")}`);
});

/* ---- PROGRESSION: a skill the player pays for has to do something ---- */

rule("key backups reduce the risk, and a configured wallet reduces it further", () => {
  // Multisig used to be a flat modifier attached to the skill. It is now a property of the
  // wallet you actually built, so the skill unlocks the policy and the setup earns the
  // protection. Owning the skill and configuring nothing must change nothing.
  const risks = json(`(()=>{
    const out={};
    for(const skills of [[],["backups"]]){
      ${SITE(``)}
      state.time=at("2014-01-01");state.skills=skills;
      state.wallets={hot:100,cold:100,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
      out[skills.length?skills.join("+"):"none"]=hotWalletIncidentRisk();
    }
    ${CUSTODY_SITE(`state.time=at("2021-02-01");`)}
    state.wallets={hot:100,cold:100,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
    out.skillOnly=hotWalletIncidentRisk();
    setCustodyPolicy("2of3");
    for(let i=0;i<3;i++)orderCustodyProduct("jade",1);
    for(let i=0;i<16;i++)tick();
    for(const d of state.custody.devices)(()=>{inspectWorkshopDevice(d.uid);prepareWorkshopDevice(d.uid);generateCustodyKey(d.uid)})();
    for(const k of state.custody.keys)assignCustodyKey(k.id);
    state.wallets={hot:100,cold:100,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
    out.configured=hotWalletIncidentRisk();
    return out;})()`);
  assert(risks.backups < risks.none, "Key backups does not reduce the risk of losing self-held coins");
  assert(risks.configured < risks.skillOnly,
    "a configured 2-of-3 wallet does not reduce the compromise risk, so the whole custody model is decorative");
});

/* ---- SETTLEMENT: the month boundary has to behave ---- */

rule("nothing is sold for the player: a shortfall at settlement stops the clock", () => {
  /* There used to be a standing "cover the bill" instruction that sold BTC at settlement so
     the run never paused. An idle operator could then coast through the whole game on the
     treasury. A bill the cash cannot meet now stops the clock with the coins untouched. */
  const r = json(`(()=>{
    ${SITE(``)}
    state.time=at("2017-01-01");state.facility="warehouse";state.region="na";
    state.hardware={s9:100};state.cash=0;
    state.wallets={hot:1000,cold:0,mtgox:0,exchange:0,frozen:0,bitfinex:0,quadriga:0,etf:0,frontier:0};
    state.projectLoan=0;state.debt=0;state.arrearsDue=0;
    let days=0;
    for(let i=0;i<120&&!state.pendingSettlement&&!state.ended;i++){tick();days++}
    const p=state.pendingSettlement;
    return {paused:!!p,due:p?p.due:0,cash:state.cash,hot:state.wallets.hot,speed:state.speed,days};})()`);
  assert(r.paused, `no settlement was queued in ${r.days} days, so this rule proves nothing`);
  assert(r.hot >= 1000, `${1000 - r.hot} BTC was sold automatically to meet the bill`);
  assert(r.cash < r.due, `the bill was met with ${r.cash} cash that the player never raised`);
  assert(r.speed === 0, "the clock kept running past a bill the cash could not meet");
});

/* ---- REGIONS: cheap power must not simply be correct ---- */

rule("the cheapest power in the game is not automatically the best site", () => {
  const winner = run(`(()=>{let best=null;
    for(const r of REGIONS){
      if(at(r.date)>at("2021-06-01"))continue;
      ${SITE(``)}
      state.time=at("2021-06-01");state.facility="campus";state.region=r.id;state.hardware={s19:600};
      const f=fleet(),mc=monthlyCost();
      const rev=expectedDailyBtcForHash(f.hash)*priceAt(state.time)*30.4375;
      const losses=connectivityIncidentRisk()*rev*(3/30.4375)+rev*(1-(r.rely||1));
      const p=rev-mc.total-losses;
      if(!best||p>best.p)best={id:r.id,p,kwh:r.kwh};
    }
    const cheapest=REGIONS.filter(r=>at(r.date)<=at("2021-06-01")).sort((a,b)=>a.kwh-b.kwh)[0];
    return best.id===cheapest.id?"cheapest-wins":"trade-off";})()`);
  assert(winner === "trade-off", "the cheapest electricity is also the best site, so the region choice is a lookup");
});


/* ---- IMMERSION: a trade, not an upgrade ---- */

rule("submerging a miner buys hash with power, in the advertised proportions", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2022-06-01");state.facility="warehouse";state.region="na";
      state.hardware={s19:300};state.thermal.equipment.immersion=2;
      state.maintenance.inventory.immersionKit=400;`)}
    const before={hash:fleet().hash,watts:fleet().minerW};
    convertToImmersion("s19",300);
    const after={hash:fleet().hash,watts:fleet().minerW,converted:immersionTotal()};
    return{before,after};})()`);
  assert(r.after.converted === 300, `only ${r.after.converted} of 300 units were converted`);
  /* Stated as literals rather than read back from the engine's own constants: a rule that
     asks the engine what it intends and then checks it did that is vacuous, and passes
     happily when the gain is set to nothing. */
  const hashGain = r.after.hash / r.before.hash, powerGain = r.after.watts / r.before.watts;
  assert(hashGain > 1.15 && hashGain < 1.45, `converting changed hash rate by ${hashGain.toFixed(3)}x, which is not a meaningful overclock`);
  assert(powerGain > 1.15 && powerGain < 1.6, `converting changed power draw by ${powerGain.toFixed(3)}x`);
  /* The trade has to point the right way. Immersion does not make a miner efficient - it
     makes headroom usable - so joules per hash must get WORSE, or the choice is free. */
  assert(powerGain > hashGain, `immersion improved efficiency (${hashGain.toFixed(3)}x hash for ${powerGain.toFixed(3)}x power), so converting is a free upgrade rather than a trade`);
});

rule("a submerged fleet stops heating the room it stands in", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2022-07-01");state.facility="warehouse";state.region="texas";
      state.hardware={s19:300};state.thermal.equipment.immersion=2;
      state.maintenance.inventory.immersionKit=400;`)}
    const before={room:roomHeatWatts(),total:activeMinerWatts(),target:thermalTargetC()};
    convertToImmersion("s19",300);
    const after={room:roomHeatWatts(),total:activeMinerWatts(),target:thermalTargetC()};
    return{before,after};})()`);
  assert(r.after.total > r.before.total, "converted miners should draw more from the meter, not less");
  assert(r.after.room < r.before.room * .2, `room heat only fell from ${Math.round(r.before.room)}W to ${Math.round(r.after.room)}W`);
  assert(r.after.target < r.before.target - 3, `room target barely moved: ${r.before.target.toFixed(1)}C to ${r.after.target.toFixed(1)}C`);
});

rule("tank capacity is a real limit on how much can be submerged", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2022-06-01");state.facility="warehouse";
      state.hardware={s19:400};state.thermal.equipment.immersion=1;
      state.maintenance.inventory.immersionKit=900;`)}
    convertToImmersion("s19",400);
    return{converted:immersionTotal(),capacity:immersionCapacity(),free:immersionFree()};})()`);
  assert(r.converted === r.capacity, `converted ${r.converted} units into ${r.capacity} slots`);
  assert(r.free === 0, "a full tank still reports free slots");
});

rule("a machine with no fans left cannot suffer a fan fault", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2022-06-01");state.facility="warehouse";
      state.hardware={s19:150};state.thermal.equipment.immersion=1;
      state.maintenance.inventory.immersionKit=200;`)}
    const h=HARDWARE.find(x=>x.id==="s19"),fanTier=fanTierFor(h);
    const air=immersionAdjustedWeights(h,partFaultWeights(h));
    convertToImmersion("s19",150);
    const wet=immersionAdjustedWeights(h,partFaultWeights(h));
    return{fanTier,airHasFan:fanTier in air,wetHasFan:fanTier in wet,share:immersionShare(h)};})()`);
  assert(r.airHasFan, "an air-cooled ASIC should be able to lose a fan");
  assert(r.share === 1, `only ${r.share} of the type is submerged`);
  assert(!r.wetHasFan, "a fully submerged type can still suffer a fan fault");
});

rule("immersion is not available before it existed", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2019-06-01");state.facility="warehouse";
      state.hardware={s19:150};state.thermal.equipment.immersion=1;
      state.maintenance.inventory.immersionKit=200;`)}
    const h=HARDWARE.find(x=>x.id==="s19");
    return{reason:immersionBlockReason(h,1),date:immersionTankDef().date};})()`);
  assert(r.date >= "2020-01-01", `immersion tanks are dated ${r.date}, which is early for single-phase mining deployments`);
  assert(/not available until/.test(r.reason), `a 2019 site was not told immersion does not exist yet: "${r.reason}"`);
});

/* ---- THERMAL PASTE: a consumable you notice only when it is missing ---- */

rule("a hashboard swap consumes thermal paste", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2020-06-01");state.facility="warehouse";
      state.hardware={s19:16};state.maintenance.condition={s19:40};
      state.maintenance.faultsByPart={s19:{hashboardmodern:8}};
      state.maintenance.inventory.thermalpaste=5;`)}
    state.maintenance.serviceJobs=[{id:"s19",count:8,part:"hashboardmodern",crew:1,totalDays:1,stage:99}];
    state.time+=DAY*3;advanceMaintenance();
    return{paste:state.maintenance.inventory.thermalpaste,
      condition:maintenanceCondition(HARDWARE.find(h=>h.id==="s19")),
      marked:dryFitActive(HARDWARE.find(h=>h.id==="s19"))};})()`);
  assert(r.paste === 4, `a hashboard job consumed ${5 - r.paste} tubes rather than 1`);
  assert(r.condition > 65, `a properly pasted repair left the type at ${r.condition.toFixed(1)}%, below the offline threshold`);
  assert(!r.marked, "a properly pasted repair still marked the type as dry-fitted");
});

/* The point of the consumable is the penalty for skipping it, so assert the penalty rather
   than only the deduction - and assert it stops short of stranding the fleet, because a
   repair that leaves a machine below the offline threshold is a soft-lock over $12. */
rule("skipping thermal paste costs condition and comes back, but never strands the fleet", () => {
  const r = json(`(()=>{
    const shot=stock=>{
      ${SITE(`state.time=at("2020-06-01");state.facility="warehouse";
        state.hardware={s19:16};state.maintenance.condition={s19:40};
        state.maintenance.faultsByPart={s19:{hashboardmodern:8}};`)}
      state.maintenance.inventory.thermalpaste=stock;
      state.maintenance.serviceJobs=[{id:"s19",count:8,part:"hashboardmodern",crew:1,totalDays:1,stage:99}];
      state.time+=DAY*3;advanceMaintenance();
      const h=HARDWARE.find(x=>x.id==="s19");
      return{condition:maintenanceCondition(h),marked:dryFitActive(h),factor:dryFitFailureFactor(h)};
    };
    return{wet:shot(5),dry:shot(0)};})()`);
  assert(r.dry.marked, "a dry-fitted repair left no elevated failure mark");
  assert(r.dry.factor > 1, `a dry-fitted type carries a failure factor of ${r.dry.factor}`);
  assert(!r.wet.marked, "a pasted repair was marked dry-fitted");
  assert(r.dry.condition > 65, `dry-fitting stranded the type at ${r.dry.condition.toFixed(1)}%, below the 65% offline threshold`);
});


/* ---- REPAIRS: a job that needs you must say so ---- */

/* Puzzle state is prepared when the job is created, so initRepairPuzzle() returns false by
   the time the job reaches the Work stage. Hanging the Mine-tab repaint off that return
   value meant arriving at the bench never asked for a redraw: the row sat on a stale earlier
   stage and the puzzle never appeared, however long the clock ran. */
rule("a self-serviced repair asks the tab to repaint when it reaches the bench", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2009-06-01");state.facility="home";state.staff=[];
      state.hardware={laptop:1};state.maintenance.condition={laptop:70};
      state.maintenance.faultsByPart={laptop:{laptopfan:1}};`)}
    state.maintenance.inventory.laptopfan=5;
    serviceHardwarePart("laptop","laptopfan");
    const job=state.maintenance.serviceJobs[0];
    if(!job)return{error:"no job was created"};
    if(!job.contracted)return{error:"a technician-free site did not hand the job to the player"};
    /* Run until the job actually reaches the bench. The stage index changes a tick before
       the Work branch executes, so waiting on the index alone samples too early. */
    let repaints=0,handed=false,guard=0;
    while(!handed&&guard++<200){
      renderFullQueued=false;
      state.time+=DAY;advanceMaintenance();
      const live=state.maintenance.serviceJobs[0];
      if(!live)break;
      if(renderFullQueued)repaints++;
      if(live.handedOver)handed=true;
    }
    const live=state.maintenance.serviceJobs[0];
    return{reached:handed,repaints,handedOver:!!(live&&live.handedOver),
      selfAuto:!!(live&&live.selfAuto),puzzleType:live&&live.puzzleType};})()`);
  assert(!r.error, r.error);
  assert(r.reached, "the repair never reached the Work stage and was handed to the player");
  assert(r.puzzleType !== undefined, "the job reached the bench with no puzzle prepared");
  assert(r.handedOver, "arriving at the bench did not mark the job as handed to the player");
  assert(r.repaints > 0, "reaching the Work stage never asked the Mine tab to repaint, so the puzzle cannot appear");
});

/* The repaint is a transition, not a state: asking for one on every tick while the job waits
   would repaint the tab forever behind a player who has walked away. */
rule("a repair waiting at the bench does not repaint the tab on every tick", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2009-06-01");state.facility="home";state.staff=[];
      state.hardware={laptop:1};state.maintenance.condition={laptop:70};
      state.maintenance.faultsByPart={laptop:{laptopfan:1}};`)}
    state.maintenance.inventory.laptopfan=5;
    serviceHardwarePart("laptop","laptopfan");
    let guard=0;
    while(guard++<200){
      state.time+=DAY;advanceMaintenance();
      const live=state.maintenance.serviceJobs[0];
      if(!live)return{skipped:true};
      if(live.handedOver)break;
    }
    let extra=0;
    for(let i=0;i<10;i++){renderFullQueued=false;state.time+=DAY;advanceMaintenance();if(renderFullQueued)extra++;}
    return{extra,skipped:false};})()`);
  assert(r.skipped !== true, "the job finished on its own, so the waiting behaviour was never exercised");
  assert(r.extra === 0, `a job idling at the bench asked for ${r.extra} further repaints in ten days`);
});


/* ---- SAVES: an old one must still open ---- */

rule("a save carrying legacy fault counts still loads", () => {
  const legacy = {
    started: true, time: Date.UTC(2016, 5, 1), cash: 5000,
    hardware: { s9: 12 },
    // The pre-split shape: a bare count per machine, with no per-part breakdown to migrate
    // from. This is the branch that reaches for the fault weights.
    maintenance: { condition: { s9: 70 }, faults: { s9: 4 }, parts: 3, inventory: {}, orders: [], serviceJobs: [] }
  };
  const loaded = loadWithSave(legacy);
  assert(loaded.ok, `an old save could not be opened at all: ${loaded.message}`);
  const read = makeEval(loaded.sandbox);
  // Everything declared after the migration must still exist: a throw part-way through
  // simulation.js leaves the rest of the file uninitialised rather than merely skipped.
  assert(read(`typeof ANNOUNCE_WINDOW`) === "number", "simulation.js stopped executing part-way through the save migration");
  const migrated = JSON.parse(read(`JSON.stringify(state.maintenance.faultsByPart.s9||{})`));
  const total = Object.values(migrated).reduce((sum, n) => sum + n, 0);
  assert(total === 4, `four legacy faults became ${total} attributed faults`);
});


/* ---- CAPACITY: the number on the card is the number you can buy ---- */

/* The Mine card worked out its own headroom from live draw while the purchase path enforced
   peak draw. Cooling is thermostatic, so a cold room draws almost nothing and a live-draw
   check passes a fleet that cannot actually run: the card offered 34 machines where the game
   allowed 31, and advertised free floor units that could never be filled. */
rule("what the hardware card offers is what the purchase actually allows", () => {
  const cases = json(`(()=>{
    const out=[];
    // Each case is dated to when its hardware actually exists, or the purchase is refused
    // for a reason that has nothing to do with capacity.
    for(const [facility,fleetShape,overdrive,when] of [
      ["workshop",{s9:40},false,"2018-06-01"],["workshop",{s9:40},true,"2018-06-01"],
      ["warehouse",{s19:120},false,"2021-06-01"],["garage",{gpurig:6},false,"2012-06-01"]]){
      ${SITE(`state.time=at("2018-06-01");state.cash=1e9;state.power=true;`)}
      state.facility=facility;state.hardware=fleetShape;state.overdrive=overdrive;
      state.thermal.equipment={axial:2};
      // The shared site setup does not clear these, and orders carry between cases.
      state.procurementOrders=[];state.inactiveHardware={};state.time=at(when);
      const id=Object.keys(fleetShape)[0],h=HARDWARE.find(x=>x.id===id);
      /* Ask for exactly what the card says is available. Requesting an arbitrary huge number
         only matched the offer back when capacity clamped both to the same figure; now that
         capacity gates the intake instead, the offer is what the card must honour. */
      const offered=hardwarePurchaseLimits(h).fiatMax;
      buyHardware(id,offered);
      const allowed=state.procurementOrders.reduce((sum,o)=>sum+o.qty,0);
      out.push({facility,id,overdrive,offered,allowed});
    }
    return out;})()`);
  for (const row of cases) {
    assert(row.offered === row.allowed,
      `${row.facility} ${row.id}${row.overdrive ? " (overdrive)" : ""}: the card offered ${row.offered} and the game allowed ${row.allowed}`);
  }
  assert(cases.some(row => row.allowed > 0), "no case actually bought anything, so the rule proves nothing");
});

/* Free floor space that power will never let you fill is a promise the game cannot keep, so
   the capacity a player is shown has to be the one that binds. */
rule("the electrical figure shown against capacity is the one that governs purchases", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2018-06-01");state.cash=1e9;state.power=true;`)}
    state.facility="workshop";state.hardware={s9:40};state.thermal.equipment={axial:2};
    const p=plannedFleetProjection();
    return{live:p.kw,peak:p.potentialKw,cap:p.cap};})()`);
  assert(r.peak >= r.live, `peak draw (${r.peak.toFixed(1)}) is below live draw (${r.live.toFixed(1)})`);
  assert(r.peak > r.live, "peak and live draw are identical, so this rule cannot tell them apart");
});


/* ---- THE OPERATOR TREE: skills that do what they say ---- */

/* Ten of twenty-three skills used to need a facility upgrade, and the early Energy branch
   needed one before its first rung, so a 2009 spare-room operator could buy three things and
   then bank points with nothing to spend them on. Saving with no way to spend is not a
   decision, so the shape of the tree is asserted rather than left to drift back. */
rule("an operator can spend points from the first year without upgrading the site", () => {
  const r = json(`(()=>{
    const early=SKILLS.filter(s=>(!s.date||at(s.date)<=at("2009-12-31"))&&!(s.minFacility>1));
    const ungated=SKILLS.filter(s=>!(s.minFacility>1));
    const branches=[...new Set(SKILLS.map(s=>s.branch))];
    return{total:SKILLS.length,early:early.map(s=>s.id),ungated:ungated.length,branches};})()`);
  assert(r.early.length >= 4, `only ${r.early.length} skills are buyable in 2009 at tier 1: ${r.early.join(", ")}`);
  assert(r.ungated >= r.total / 2, `${r.ungated} of ${r.total} skills are reachable without a facility upgrade`);
  assert(r.branches.length >= 5, `the tree has only ${r.branches.length} branches: ${r.branches.join(", ")}`);
});

rule("immersion tuning raises hash without raising the power it costs", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2022-06-01");state.facility="warehouse";
      state.hardware={s19:300};state.thermal.equipment={immersion:2};
      state.maintenance.inventory.immersionKit=400;`)}
    convertToImmersion("s19",300);
    const before={hash:fleet().hash,watts:fleet().minerW};
    state.skills=["immersiontuning"];
    const after={hash:fleet().hash,watts:fleet().minerW};
    return{before,after};})()`);
  assert(r.after.hash > r.before.hash, "immersion tuning did not raise hash rate at all");
  close(r.after.watts, r.before.watts, 1, "immersion tuning changed the power draw");
  const lift = r.after.hash / r.before.hash;
  assert(lift > 1.05 && lift < 1.12, `immersion tuning moved hash by ${lift.toFixed(3)}x, which is not the advertised step from 25% to 35%`);
});

rule("thermal discipline makes a tube of paste go twice as far", () => {
  const r = json(`(()=>{
    const run=skills=>{
      ${SITE(`state.time=at("2020-06-01");state.facility="warehouse";
        state.hardware={s19:32};state.maintenance.condition={s19:40};
        state.maintenance.faultsByPart={s19:{hashboardmodern:16}};`)}
      state.skills=skills;state.maintenance.inventory.thermalpaste=9;
      state.maintenance.serviceJobs=[{id:"s19",count:16,part:"hashboardmodern",crew:1,totalDays:1,stage:99}];
      state.time+=DAY*3;advanceMaintenance();
      return 9-state.maintenance.inventory.thermalpaste;
    };
    return{plain:run([]),skilled:run(["thermalwork"])};})()`);
  assert(r.plain > r.skilled, `a skilled bench used ${r.skilled} tubes against ${r.plain} unskilled`);
  assert(r.skilled >= 1, "thermal discipline made the consumable free, which removes the decision rather than easing it");
});

rule("salvage recovers a fan from every machine retired", () => {
  const r = json(`(()=>{
    const run=skills=>{
      ${SITE(`state.time=at("2016-06-01");state.facility="warehouse";state.hardware={s9:10};`)}
      state.skills=skills;state.maintenance.inventory.asicfan=0;
      // The shared site setup leaves storage alone, and it accumulates between runs.
      state.decommissionedHardware={};state.poweredDownHardware={};state.retirementJobs=[];
      decommissionHardware("s9",4);
      // Retirement is work now, so the fan comes out when the machine does. Run the clock.
      const immediate={fans:state.maintenance.inventory.asicfan,stored:state.decommissionedHardware.s9||0,
        active:state.hardware.s9,jobs:state.retirementJobs.length};
      for(let d=0;d<8;d++){state.time+=DAY;advanceRetirements()}
      return{immediate,fans:state.maintenance.inventory.asicfan,stored:state.decommissionedHardware.s9||0,
        active:state.hardware.s9,jobs:state.retirementJobs.length};
    };
    return{plain:run([]),skilled:run(["salvage"])};})()`);
  assert(r.plain.fans === 0, `retiring machines without the skill produced ${r.plain.fans} fans`);
  assert(r.skilled.fans === 4, `retiring four machines with salvage produced ${r.skilled.fans} fans`);
  assert(r.skilled.stored === 4, "salvage consumed the machines instead of storing them");
  /* Retiring is work, not a state change: nothing has left the racks on the day it is
     ordered, and the machines are still the operator's until the crew has pulled them. */
  assert(r.skilled.immediate.jobs === 1 && r.skilled.immediate.stored === 0 && r.skilled.immediate.active === 10,
    "retirement still empties the racks instantly instead of scheduling the work");
  assert(r.skilled.active === 6 && r.skilled.jobs === 0, "the retirement job never finished");
});

rule("a large retirement empties the racks gradually, not on the last day", () => {
  const r = json(`(()=>{${SITE(`state.time=at("2018-06-01");state.facility="warehouse";state.region="texas";
    state.hardware={};state.hardware.s9=400;state.decommissionedHardware={};state.poweredDownHardware={};
    state.retirementJobs=[];state.commissioningJobs=[];state.procurementOrders=[];state.inactiveHardware={};`)}
    decommissionHardware("s9",400);
    const days=state.retirementJobs[0].days,trace=[];
    /* Driven through tick() rather than by calling the advance directly, so this also proves
       the job is actually wired into the simulation day. Calling the helper by hand tested
       that the helper worked and would have passed with the tick call deleted. */
    for(let d=0;d<days+2;d++){tick(true);
      trace.push({active:state.hardware.s9,stored:state.decommissionedHardware.s9||0,hash:Math.round(fleet().hash/1e12)});}
    return{days,trace}})()`);
  assert(r.days > 1, `retiring 400 machines took ${r.days} day; large-scale work must take time`);
  const midway = r.trace[Math.floor(r.trace.length / 2) - 1];
  /* The point of the ramp: halfway through, half the fleet is out and half is still hashing.
     An instant retirement and a last-day retirement both fail this. */
  assert(midway.active > 0 && midway.active < 400,
    `halfway through the job the rack held ${midway.active} of 400 machines, so the work is not gradual`);
  assert(midway.stored > 0 && midway.stored < 400, "storage fills in one step rather than as the crew works");
  assert(midway.hash > 0, "hash rate collapsed before the machines were actually pulled");
  const end = r.trace[r.trace.length - 1];
  assert(end.active === 0 && end.stored === 400, `the job ended with ${end.active} active and ${end.stored} stored`);
});

rule("air-gapped signing reduces what a key compromise can reach", () => {
  const r = json(`(()=>{
    const factor=skills=>{
      ${SITE(`state.time=at("2016-06-01");`)}
      state.skills=skills;
      return custodyCompromiseFactor();
    };
    return{plain:factor([]),skilled:factor(["airgap"])};})()`);
  assert(r.skilled < r.plain, `air-gapping left the compromise factor at ${r.skilled} against ${r.plain}`);
  assert(r.skilled > 0, "air-gapping made compromise impossible, which no custody arrangement does");
});

rule("firmware hygiene holds cover longer and is hijacked less often", () => {
  const r = json(`(()=>{
    const read=skills=>{${SITE(`state.time=at("2018-06-01");`)}state.skills=skills;
      return{cover:firmwareCoverDays(),risk:firmwareHijackRisk()};};
    return{plain:read([]),skilled:read(["firmwarehygiene"])};})()`);
  assert(r.skilled.cover > r.plain.cover, `cover stayed at ${r.skilled.cover} days`);
  assert(r.skilled.risk < r.plain.risk, `hijack risk stayed at ${r.skilled.risk}`);
  assert(r.skilled.risk > 0, "firmware hygiene removed the risk entirely rather than reducing it");
});

rule("a runbook shortens an outage and a generator carries a short one", () => {
  const r = json(`(()=>{
    const read=skills=>{${SITE(`state.time=at("2018-06-01");`)}state.skills=skills;
      return{eight:outageDays(8),gridEight:gridOutageDays(8),gridTwo:gridOutageDays(2),
        net:connectivityIncidentRisk()};};
    return{plain:read([]),runbook:read(["runbook"]),generator:read(["runbook","standbypower"]),
      dual:read(["dualupstream"])};})()`);
  assert(r.runbook.eight < r.plain.eight, `a runbook left an eight-day outage at ${r.runbook.eight} days`);
  assert(r.generator.gridEight < r.runbook.gridEight, "the generator did not shorten a grid outage further");
  assert(r.generator.gridTwo === 0, `a two-day grid outage still stopped the fleet for ${r.generator.gridTwo} days`);
  assert(r.plain.gridTwo > 0, "a two-day outage stops nobody even without a generator, so the rule proves nothing");
  assert(r.dual.net < r.plain.net, `a second upstream left connectivity risk at ${r.dual.net}`);
});


/* ---- THE PRICE CHART: no reading ahead ---- */

/* This is a historical replay. A chart that sampled past the simulation's own clock would
   hand the player the answer to the only question the game asks, so the series is clipped
   rather than faded - there is nothing drawn to read ahead from. */
rule("the price chart never samples past the simulation's clock", () => {
  const r = json(`(()=>{
    const out=[];
    for(const [when,range] of [["2011-06-01","all"],["2014-03-01","all"],
        ["2017-12-01","1y"],["2021-11-08","all"],["2021-11-08","90d"]]){
      ${SITE(``)}
      state.time=at(when);state.priceChartRange=range;
      const series=priceChartSeries();
      out.push({when,range,points:series.length,
        last:series.length?series[series.length-1][0]:null,
        first:series.length?series[0][0]:null,now:state.time});
    }
    return out;})()`);
  for (const row of r) {
    assert(row.points > 2, `${row.when} at range ${row.range} produced ${row.points} points`);
    assert(row.last <= row.now, `${row.when} at range ${row.range} plotted a point beyond the current date`);
    assert(row.first <= row.last, `${row.when} at range ${row.range} runs backwards`);
  }
});

rule("a shorter chart range is a window on the same series, not a different one", () => {
  const r = json(`(()=>{
    ${SITE(``)}
    state.time=at("2021-11-08");
    const read=range=>{state.priceChartRange=range;const s=priceChartSeries();
      return{first:s[0][0],last:s[s.length-1][0],points:s.length};};
    return{all:read("all"),year:read("1y"),quarter:read("90d")};})()`);
  assert(r.year.first > r.all.first, "the one-year range starts no later than the whole history");
  assert(r.quarter.first > r.year.first, "the ninety-day range starts no later than the one-year range");
  assert(r.all.last === r.year.last && r.year.last === r.quarter.last, "the ranges end on different dates");
  assert(r.quarter.points > 2, "the shortest range collapsed to nothing");
});

/* Before a market existed there was no price, and the chart has to say so rather than draw
   a flat line at whatever the first recorded quote happens to be. */
rule("the chart shows nothing before bitcoin had a price", () => {
  const points = json(`(()=>{
    ${SITE(``)}
    state.time=at("2009-06-01");state.priceChartRange="all";
    return priceChartSeries().length;})()`);
  assert(points === 0, `a 2009 chart plotted ${points} points before any market existed`);
});


/* This game labels recorded, derived and modelled data separately, and says so in its own
   footer. A price chart captioned RECORDED over a modelled continuation would break that
   promise quietly, which is the worst way to break it. */
rule("the price chart says which of its data is recorded and which is modelled", () => {
  const r = json(`(()=>{
    const read=when=>{${SITE(``)}state.time=at(when);state.priceChartRange="all";
      return priceChartProvenance();};
    const readShort=when=>{${SITE(``)}state.time=at(when);state.priceChartRange="90d";
      return priceChartProvenance();};
    return{historic:read("2018-06-01"),spanning:read("2030-01-01"),
      wellPast:readShort("2060-01-01"),cutoff:END};})()`);
  assert(r.historic === "RECORDED", `a wholly historic range was labelled ${r.historic}`);
  assert(/MODELLED/.test(r.spanning), `a range running past the cutoff was labelled ${r.spanning}`);
  assert(r.wellPast === "MODELLED", `a range entirely past the cutoff was labelled ${r.wellPast}`);
});


/* ---- THE SECOND-HAND MARKET ---- */

/* The buy side depreciated but never behaved like a market: you could buy ten thousand
   six-year-old S9s instantly at three percent of list. Used machines exist because somebody
   else is retiring them, so the quantity is finite. */
rule("old hardware is not an unlimited tap", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2021-06-01");state.facility="megacampus";state.cash=1e9;state.power=true;`)}
    state.secondary={stock:{},month:""};state.procurementOrders=[];state.inactiveHardware={};
    for(let m=0;m<18;m++){state.time+=30*DAY;advanceSecondaryMarket(state.time)}
    const h=HARDWARE.find(x=>x.id==="s9");
    const listed=secondaryStock("s9");
    buyHardware("s9",100000);
    const ordered=state.procurementOrders.reduce((sum,o)=>sum+o.qty,0);
    return{channel:hardwareChannel(h),listed,ordered,
      leftListed:secondaryStock("s9"),cash:state.cash};})()`);
  assert(r.channel === "secondary", "a five-year-old machine is still being sold as factory stock");
  assert(r.listed > 0 && r.listed < 5000, `the market listed ${r.listed} units, which is not a finite second-hand supply`);
  assert(r.ordered === r.listed, `asked for 100,000 and got ${r.ordered} against ${r.listed} listed`);
  assert(r.leftListed === 0, `${r.leftListed} units remained listed after buying the lot`);
});

rule("buying a listing takes it off the market", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2021-06-01");state.facility="megacampus";state.cash=1e9;state.power=true;`)}
    state.secondary={stock:{},month:""};state.procurementOrders=[];
    for(let m=0;m<18;m++){state.time+=30*DAY;advanceSecondaryMarket(state.time)}
    const before=secondaryStock("s9");
    buyHardware("s9",Math.max(1,Math.floor(before/2)));
    return{before,after:secondaryStock("s9"),
      ordered:state.procurementOrders.reduce((sum,o)=>sum+o.qty,0)};})()`);
  assert(r.before > 1, `only ${r.before} units were listed, so this rule proves little`);
  assert(r.after === r.before - r.ordered, `bought ${r.ordered} of ${r.before} and ${r.after} remain`);
});

/* Supply follows how many were BUILT, not how fast they are. A first attempt scaled with hash
   rate and gave an S9 generation almost the same supply as an S21 one. */
rule("a later generation has more of itself on the second-hand market", () => {
  const r = json(`(()=>{
    const peak=id=>{const h=HARDWARE.find(x=>x.id===id);
      ${SITE(``)}
      state.time=at(h.date)+Math.round(2.6*365)*DAY;
      return secondaryBaseStock(h);};
    return{gpurig:peak("gpurig"),s5:peak("s5"),s9:peak("s9"),s19:peak("s19"),s21:peak("s21")};})()`);
  assert(r.s9 > r.s5 && r.s19 > r.s9 && r.s21 > r.s19,
    `supply does not grow with generation: ${JSON.stringify(r)}`);
  assert(r.s21 > r.gpurig * 20, `an S21 generation lists ${r.s21} against a GPU rig's ${r.gpurig}, which is not an industrial difference`);
});

/* Nothing is available while the machine is still current, and the tail runs out. */
rule("second-hand supply appears after a generation is retired and dries up later", () => {
  const r = json(`(()=>{
    const h=HARDWARE.find(x=>x.id==="s9");
    const at_=years=>{${SITE(``)}state.time=at(h.date)+Math.round(years*365)*DAY;
      return{stock:secondaryBaseStock(h),channel:hardwareChannel(h)};};
    return{fresh:at_(0.5),early:at_(2),peak:at_(2.6),late:at_(6),ancient:at_(10)};})()`);
  assert(r.fresh.stock === 0 && r.fresh.channel === "factory", "a current machine is already on the second-hand market");
  assert(r.peak.stock > r.early.stock, "supply does not build toward a peak");
  assert(r.late.stock < r.peak.stock, "supply never thins after the peak");
  assert(r.ancient.stock === 0, `a ten-year-old machine still lists ${r.ancient.stock} units`);
});

/* A liquidation is somebody else's fleet arriving at once: the event already softened prices,
   and now it puts the machines behind that discount on the market too. */
rule("a liquidation puts machines on the market as well as cutting the price", () => {
  const r = json(`(()=>{
    const run=glut=>{
      ${SITE(`state.time=at("2021-06-01");`)}
      state.secondary={stock:{},month:""};
      state.hardwareGlut=glut?{discount:.22,until:state.time+400*DAY}:null;
      for(let m=0;m<10;m++){state.time+=30*DAY;advanceSecondaryMarket(state.time)}
      const h=HARDWARE.find(x=>x.id==="s19");
      return{listed:secondaryStock("s19"),price:hardwareUnitCost(h)};
    };
    return{calm:run(false),liquidation:run(true)};})()`);
  assert(r.liquidation.listed > r.calm.listed, `a liquidation listed ${r.liquidation.listed} against ${r.calm.listed} in calm conditions`);
  assert(r.liquidation.price < r.calm.price, "a liquidation did not soften the price");
});

/* A used machine is somebody else's maintenance record. The band is disclosed; the draw is
   not - and a factory machine has no band at all. */
rule("a second-hand machine arrives worn, within a band the player was shown", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2021-06-01");`)}
    const h=HARDWARE.find(x=>x.id==="s9"),fresh=HARDWARE.find(x=>x.id==="s19");
    const band=secondaryConditionRange(h);
    const draws=[];for(let i=0;i<40;i++)draws.push(rollSecondaryCondition(h));
    return{band,min:Math.min(...draws),max:Math.max(...draws),
      distinct:new Set(draws).size,
      freshBand:secondaryConditionRange(fresh),freshChannel:hardwareChannel(fresh)};})()`);
  assert(r.band.spread > 0, "a five-year-old machine arrives with no condition uncertainty at all");
  assert(r.min >= r.band.low && r.max <= r.band.high, `draws ran ${r.min}-${r.max} outside the shown band ${r.band.low}-${r.band.high}`);
  assert(r.distinct > 3, `forty draws produced ${r.distinct} distinct conditions, so it is not really a draw`);
  assert(r.band.high <= 100 && r.band.low >= 55, "the condition band leaves the plausible range");
  assert(r.freshBand.spread === 0, "a machine still sold new arrives with second-hand uncertainty");
});


/* ---- CONNECTIVITY: a miner's internet bill is not a telco account ---- */

/* Mining is not a bandwidth business. A Stratum connection is a few kilobits per second per
   machine, so what a bigger site buys is redundancy and an SLA, not throughput. The ladder
   used to multiply the regional rate by six hundred at megacampus, which billed a farm
   $75,600 a month to carry block templates. */
rule("the internet bill grows with the site gently, not exponentially", () => {
  const r = json(`(()=>{
    const read=(fac,plan)=>{${SITE(`state.time=at("2024-06-01");state.region="na";`)}
      state.facility=fac;state.connectivity=plan;
      return{cost:internetMonthlyCost(),scale:connectivityScale()};};
    return{homeFixed:read("home","fixed"),megaFixed:read("megacampus","fixed"),
      megaFibre:read("megacampus","fiber")};})()`);
  const growth = r.megaFixed.cost / r.homeFixed.cost;
  assert(growth > 3, `the largest site pays only ${growth.toFixed(1)}x the smallest, which is not scaling at all`);
  assert(growth < 20, `the largest site pays ${growth.toFixed(0)}x the smallest for a service carrying block templates`);
  assert(r.megaFibre.cost < 5000, `business fibre at megacampus bills ${Math.round(r.megaFibre.cost)} a month`);
});

/* A satellite terminal is the same hardware and the same monthly fee wherever it points, so
   its price does not follow the local rate and its reliability does not follow the local
   infrastructure. That is the whole proposition, and it makes the plan a bad deal where the
   ground network is good and a transformative one where it is not. */
rule("a satellite link is priced and rated globally, not locally", () => {
  const r = json(`(()=>{
    const read=(region,plan)=>{${SITE(`state.time=at("2024-06-01");`)}
      state.region=region;state.facility="warehouse";state.connectivity=plan;
      return{cost:Math.round(internetMonthlyCost()),risk:connectivityIncidentRisk()};};
    return{naSat:read("na","starlink"),kenyaSat:read("kenya","starlink"),
      naFixed:read("na","fixed"),kenyaFixed:read("kenya","fixed")};})()`);
  assert(r.naSat.cost === r.kenyaSat.cost, `the terminal costs ${r.naSat.cost} in one region and ${r.kenyaSat.cost} in another`);
  close(r.naSat.risk, r.kenyaSat.risk, 1e-9, "satellite incident risk moved with the region");
  // Where the ground network is good it should lose; where it is bad it should win.
  assert(r.naSat.cost > r.naFixed.cost && r.naSat.risk > r.naFixed.risk,
    "satellite beats a good fixed line on both price and reliability, which makes the choice free");
  assert(r.kenyaSat.cost < r.kenyaFixed.cost && r.kenyaSat.risk < r.kenyaFixed.risk,
    "satellite does not beat a poorly served fixed line, so it solves nothing where it should");
});

rule("a satellite link cannot be bought before it existed or where it was not offered", () => {
  const r = json(`(()=>{
    const plan=CONNECTIVITY_PLANS.find(p=>p.id==="starlink");
    const read=(when,region)=>{${SITE(``)}state.time=at(when);state.region=region;state.facility="warehouse";
      return{ok:connectivityAvailable(plan),why:connectivityUnavailableReason(plan)};};
    return{early:read("2016-01-01","na"),now:read("2024-06-01","na"),
      blocked:read("2024-06-01","iran"),date:plan.date};})()`);
  assert(r.date >= "2020-10-01", `the terminal is dated ${r.date}, before the service existed at all`);
  assert(!r.early.ok && /not available until/i.test(r.early.why), `a 2016 site could buy it: "${r.early.why}"`);
  assert(r.now.ok, "the terminal is unavailable even after launch");
  assert(!r.blocked.ok && /not offered/i.test(r.blocked.why), `a sanctioned jurisdiction could buy it: "${r.blocked.why}"`);
});

/* Adding terminals is close to a flat cost, so the plan should not inherit the full ladder. */
/* A plan does not travel with the fleet. Relocating to a jurisdiction that never offered the
   service used to leave the site on it, billed and rated as though nothing had changed. */
rule("relocating away from a plan's coverage falls the site back to a local line", () => {
  const r = json(`(()=>{
    ${SITE(`state.time=at("2024-06-01");`)}
    state.region="na";state.facility="warehouse";state.connectivity="starlink";
    const before=state.connectivity;
    state.region="iran";
    const changed=enforceConnectivityAvailability();
    return{before,changed,after:state.connectivity,
      stillAvailable:connectivityAvailable(connectivityPlan())};})()`);
  assert(r.before === "starlink", "the test never got onto the plan it means to test");
  assert(r.changed, "moving into a region without coverage changed nothing");
  assert(r.after === "fixed", `the site fell back to ${r.after}`);
  assert(r.stillAvailable, "the fallback plan is not itself available");
});

rule("satellite scales by adding terminals rather than by buying a bigger circuit", () => {
  const r = json(`(()=>{
    const read=(fac,plan)=>{${SITE(`state.time=at("2024-06-01");state.region="na";`)}
      state.facility=fac;state.connectivity=plan;return internetMonthlyCost();};
    return{satHome:read("home","starlink"),satMega:read("megacampus","starlink"),
      fixedHome:read("home","fixed"),fixedMega:read("megacampus","fixed")};})()`);
  const sat = r.satMega / r.satHome, fixed = r.fixedMega / r.fixedHome;
  assert(sat < fixed, `satellite scales ${sat.toFixed(1)}x against a fixed line's ${fixed.toFixed(1)}x`);
  assert(sat > 1, "satellite does not scale with the site at all, so a megacampus runs on one dish");
});


/* ---- MATERIALS PLANNING: paying somebody to watch the shelf ---- */

/* `staff` is a raw JS expression evaluated inside the sandbox, not a value to stringify - an
   earlier version stringified it, so passing the variable name set state.staff to the string
   "staff" and every planner in the suite quietly did nothing. */
const PLANNER_SITE = (staffExpr, cash = 1e6, bill = 0) => `
  ${SITE(`state.time=at("2021-06-01");state.facility="warehouse";state.power=true;`)}
  state.hardware={s19:200,s9:60};state.staff=${staffExpr};
  state.cash=${cash};state.bill=${bill};state.debt=0;
  state.maintenance.condition={s19:70,s9:58};
  state.maintenance.faultsByPart={s19:{hashboardmodern:14,asicfan:9},s9:{powerPcb:5}};
  state.maintenance.inventory={};SPARE_PARTS.forEach(p=>state.maintenance.inventory[p.id]=0);
  state.maintenance.orders=[];state.planning={month:""};`;

rule("a materials planner orders what the fleet is short of, and nobody else does", () => {
  const r = json(`(()=>{
    const run=staff=>{${PLANNER_SITE("staff")}
      advanceMaterialsPlanning(state.time);
      return state.maintenance.orders.map(o=>o.type);};
    return{none:run([]),controller:run(["inventorycontroller"]),lead:run(["mrplead"])};})()`);
  assert(r.none.length === 0, `an unstaffed site ordered ${r.none.length} lines by itself`);
  assert(r.controller.length > 0, "an inventory controller ordered nothing at all");
  assert(r.lead.length > r.controller.length, `the lead raised ${r.lead.length} lines against the controller's ${r.controller.length}`);
});

/* The two tiers are different jobs, not the same job at two prices: the junior post covers
   the parts a fleet gets through constantly, the senior one plans the whole bill. */
rule("the junior post covers consumables and the senior post covers everything", () => {
  const r = json(`(()=>{
    const run=staff=>{${PLANNER_SITE("staff")}
      advanceMaterialsPlanning(state.time);
      return [...new Set(state.maintenance.orders.map(o=>o.type))];};
    return{controller:run(["inventorycontroller"]),lead:run(["mrplead"]),
      consumables:PLANNER_CONSUMABLES};})()`);
  const boards = id => /hashboard|powerPcb|coolant|Manifold/i.test(id);
  assert(r.controller.every(id => r.consumables.includes(id)),
    `the controller ordered something that is not a consumable: ${r.controller.join(", ")}`);
  assert(r.lead.some(boards), `the lead ordered no capital parts at all: ${r.lead.join(", ")}`);
});

rule("the senior post orders ahead of the shortfall rather than exactly to it", () => {
  const r = json(`(()=>{
    const run=staff=>{${PLANNER_SITE("staff")}
      const need=partsOutlook().short.find(x=>x.id==="asicfan");
      advanceMaterialsPlanning(state.time);
      const line=state.maintenance.orders.find(o=>o.type==="asicfan");
      return{missing:need?need.missing:0,ordered:line?line.qty:0};};
    return{controller:run(["inventorycontroller"]),lead:run(["mrplead"])};})()`);
  assert(r.controller.ordered === r.controller.missing,
    `the controller ordered ${r.controller.ordered} against a shortfall of ${r.controller.missing}`);
  assert(r.lead.ordered > r.lead.missing,
    `the lead ordered ${r.lead.ordered} against a shortfall of ${r.lead.missing}, so it is not planning ahead`);
});

/* A shelf kept full is not worth losing the grid over. */
rule("a planner never spends the money owed on this month's bill", () => {
  const r = json(`(()=>{
    ${PLANNER_SITE('["mrplead"]', 9000, 8000)}
    advanceMaterialsPlanning(state.time);
    return{cash:state.cash,bill:state.bill,orders:state.maintenance.orders.length};})()`);
  assert(r.cash >= r.bill, `the planner left ${Math.round(r.cash)} against a bill of ${r.bill}`);
});

rule("hiring the senior planner replaces the junior one rather than paying both", () => {
  const r = json(`(()=>{
    ${PLANNER_SITE("[]")}
    hireStaff("inventorycontroller");const junior=[...state.staff];
    hireStaff("mrplead");const senior=[...state.staff];
    hireStaff("inventorycontroller");const down=[...state.staff];
    return{junior,senior,down,payroll:staffMonthlyCost()};})()`);
  assert(r.junior.includes("inventorycontroller"), "the junior post was never hired");
  assert(r.senior.includes("mrplead") && !r.senior.includes("inventorycontroller"),
    `both posts are on the payroll: ${r.senior.join(", ")}`);
  assert(!r.down.includes("inventorycontroller"), "hiring down re-added a post the senior already covers");
});

/* Purchase orders are raised on a cycle. Reordering every simulated day would bury the ledger
   and buy in uselessly small lots. */
/* Two separate properties, and an earlier single rule conflated them: it asserted a cycle but
   only ever proved idempotence, so deleting the month guard passed. Ordering is idempotent
   BECAUSE it counts what is already inbound, which would hide a planner running daily. */
rule("a planner does not re-order what is already on its way", () => {
  const r = json(`(()=>{
    ${PLANNER_SITE('["mrplead"]')}
    advanceMaterialsPlanning(state.time);
    const first=state.maintenance.orders.length;
    state.planning={month:""};                 // force another cycle with the same shortfall
    advanceMaterialsPlanning(state.time);
    return{first,after:state.maintenance.orders.length};})()`);
  assert(r.first > 0, "the planner ordered nothing to begin with");
  assert(r.after === r.first, `a second cycle raised ${r.after - r.first} duplicate lines for stock already inbound`);
});

rule("purchase orders are raised on a monthly cycle, not on every tick", () => {
  const r = json(`(()=>{
    ${PLANNER_SITE('["mrplead"]')}
    // A fresh shortfall every time, so only the cycle guard can stop a second run.
    const clear=()=>{state.maintenance.orders=[];SPARE_PARTS.forEach(p=>state.maintenance.inventory[p.id]=0);};
    advanceMaterialsPlanning(state.time);
    const first=state.maintenance.orders.length;
    clear();
    state.time+=DAY;advanceMaterialsPlanning(state.time);
    const sameMonth=state.maintenance.orders.length;
    clear();
    state.time+=40*DAY;advanceMaterialsPlanning(state.time);
    return{first,sameMonth,nextMonth:state.maintenance.orders.length};})()`);
  assert(r.first > 0, "the planner ordered nothing to begin with");
  assert(r.sameMonth === 0, `the planner raised ${r.sameMonth} more lines the very next day`);
  assert(r.nextMonth > 0, "the planner never ran again in the following month");
});


/* ---- COMMISSIONING: a crew working down a row ---- */

const BUILD_SITE = `
  ${SITE(`state.time=at("2021-06-01");state.facility="megacampus";state.cash=1e8;state.power=true;`)}
  state.hardware={};state.commissioningJobs=[];state.maintenance.condition={};
  state.thermal={temperature:22,orders:[],equipment:{coolingtower:4}};`;

/* A five-hundred-machine order used to earn nothing for twenty-five days and then everything
   at once. The first rack is hashing while the last is still in its box. */
rule("machines come online across the build rather than all on the last day", () => {
  const r = json(`(()=>{
    ${BUILD_SITE}
    state.inactiveHardware={s19:500};
    activateHardware("s19");
    const job=state.commissioningJobs[0];
    const total=job.qty,days=job.days;
    const trail=[];
    for(let d=0;d<days+3;d++){state.time+=DAY;advanceFleetLifecycle();
      trail.push({day:d+1,owned:state.hardware.s19||0,hash:fleet().hash});}
    return{total,days,trail};})()`);
  assert(r.days >= 4, `the build only takes ${r.days} days, so a ramp cannot be observed`);
  const mid = r.trail[Math.floor(r.days / 2) - 1];
  assert(mid.owned > 0, "nothing was hashing halfway through the build");
  assert(mid.owned < r.total, `the whole order was online halfway through: ${mid.owned} of ${r.total}`);
  assert(mid.hash > 0, "machines are counted as owned but contribute no hash rate mid-build");
  const finished = r.trail[r.days - 1];
  assert(finished.owned === r.total, `the build ended with ${finished.owned} of ${r.total} online`);
  const after = r.trail[r.trail.length - 1];
  assert(after.owned === r.total, `machines kept appearing after the build finished: ${after.owned}`);
});

rule("a build racks exactly what was ordered, no more and no less", () => {
  const r = json(`(()=>{
    const run=qty=>{${BUILD_SITE}
      state.inactiveHardware={s19:qty};
      activateHardware("s19");
      for(let d=0;d<60;d++){state.time+=DAY;advanceFleetLifecycle();}
      return{asked:qty,got:state.hardware.s19||0,open:state.commissioningJobs.length};};
    return{one:run(1),odd:run(7),many:run(500)};})()`);
  for (const key of ["one", "odd", "many"]) {
    assert(r[key].got === r[key].asked, `${key}: ordered ${r[key].asked} and ended with ${r[key].got}`);
    assert(r[key].open === 0, `${key}: the job never closed`);
  }
});

/* The deploy award is logarithmic in quantity, so paying it per increment would inflate it
   badly - a sum of small logs is far larger than the log of the sum. */
rule("a build is paid its deployment experience once, not once per rack", () => {
  const r = json(`(()=>{
    ${BUILD_SITE}
    state.inactiveHardware={s19:400};
    state.xp={total:0,level:1,peakLevel:1,bestDifficulty:0,shares:0,sources:{shares:0,record:0,deploy:0,repair:0,spend:0}};
    activateHardware("s19");
    for(let d=0;d<40;d++){state.time+=DAY;advanceFleetLifecycle();}
    const h=HARDWARE.find(x=>x.id==="s19");
    return{paid:state.xp.sources.deploy,
      once:(6+3*Math.log2(1+(h.hash||0)/1e9))*Math.log2(1+400)};})()`);
  close(r.paid, r.once, 1, "deployment experience for one batch");
});

/* Saves written before the ramp carry a due date and nothing else. */
rule("a build already in progress from an older save still completes", () => {
  const r = json(`(()=>{
    ${BUILD_SITE}
    // The shape the old code wrote: quantity and a due date, no start, no progress.
    state.commissioningJobs=[{id:"s19",qty:120,due:state.time+6*DAY}];
    const trail=[];
    for(let d=0;d<10;d++){state.time+=DAY;advanceFleetLifecycle();
      trail.push(state.hardware.s19||0);}
    return{trail,open:state.commissioningJobs.length};})()`);
  assert(r.trail[r.trail.length - 1] === 120, `an old-shaped job delivered ${r.trail[r.trail.length - 1]} of 120`);
  assert(r.open === 0, "an old-shaped job never closed");
  assert(r.trail[2] > 0 && r.trail[2] < 120, `an old-shaped job did not ramp: ${r.trail.join(", ")}`);
});

rule("the only machine you own can still be stopped and retired", () => {
  /* `owned<1` guards these actions against an empty fleet. Off by one in the inclusive
     direction and owning exactly one machine means owning an untouchable one: no retiring it,
     no powering it down, and no message explaining why. The whole of the early game is one
     machine, so this is the boundary that matters most and it was asserted nowhere.

     Uses an S1 rather than the starting laptop: the laptop is `permanent` and refuses
     retirement by design, which would have made this rule pass for the wrong reason. */
  const r = json(`(()=>{${SITE(`state.time=at("2013-06-01");state.facility="garage";
    state.region="na";state.hardware={s1:1};`)}
    state.poweredDownHardware={};state.retirementJobs=[];
    setHardwarePower("s1",false,1);
    const stopped=state.poweredDownHardware.s1||0;
    setHardwarePower("s1",true,1);
    const restarted=state.poweredDownHardware.s1||0;
    decommissionHardware("s1",1);
    const booked=state.retirementJobs.reduce((a,j)=>a+j.qty,0);
    return {owned:state.hardware.s1,stopped,restarted,booked,
      permanent:!!HARDWARE.find(h=>h.id==="s1").permanent}})()`);
  assert(r.permanent === false, "this rule needs a machine that can actually be retired");
  assert(r.stopped === 1, `the single machine could not be powered down (${r.stopped} stopped)`);
  assert(r.restarted === 0, `the single machine could not be restarted (${r.restarted} still off)`);
  assert(r.booked === 1, `the single machine could not be retired (${r.booked} booked)`);
});

/* ---- the first key ---------------------------------------------------------------------- */

const HOT_RUN = (backup = false, extra = "") => `
  ${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";state.wallets.cold=0;${extra}`)}
  createHotWallet({keyHex:"abcdef0123456789",backup:${backup}});`;

rule("the key the ceremony makes is a real key: in the list, on the computer, and never part of a wallet policy", () => {
  const r = json(`(()=>{${HOT_RUN(false)}
    const k=hotKey();const before=[...state.custody.assigned];
    assignCustodyKey(k.id);
    return{k,keys:state.custody.keys.length,devices:state.custody.devices.length,assignedAfter:[...state.custody.assigned],before,
      ready:custodySetup().ready,backed:hotKeyBackedUp(),again:createHotWallet({})};})()`);
  assert(r.k && r.k.hot === true && r.k.fingerprint === "abcdef01" && r.k.deviceUid === null, `the first key is not a key on the computer: ${JSON.stringify(r.k)}`);
  assert(r.devices === 0 && r.keys === 1, "making the first wallet bought a device or a second key");
  assert(r.assignedAfter.length === 0 && r.ready === false, "the online wallet's key was put into the wallet policy, so a software key became the reserve");
  assert(r.backed === false && r.again === null, "a second online wallet was made, or a wallet with no backup reported one");
  const backed = json(`(()=>{${HOT_RUN(true)}return{backed:hotKeyBackedUp(),b:hotKey().backup}})()`);
  assert(backed.backed && backed.b.place === "home" && backed.b.durability === "paper", "writing it down did not make a paper backup at home");
});

rule("a fire at the mine takes the computer, and a backup somewhere else is what saves the coins", () => {
  const fire = (backup, where, steel = false) => json(`(()=>{${HOT_RUN(false)}
    const k=hotKey();${backup?`k.backup={product:"${steel?"steelplate":"paperbackup"}",durability:"${steel?"steel":"paper"}",at:0,place:"${where}"};`:""}
    const hot0=state.wallets.hot,cash0=state.cash,id0=k.id;
    applyPlaceIncident("site","fire",state.time,true);
    return{hot:state.wallets.hot,hot0,cash:cash0-state.cash,sameKey:hotKey()&&hotKey().id===id0,newKey:hotKey()?hotKey().id:null,oldRetired:!!k.retired,
      loss:pendingLoss()?{cause:pendingLoss().cause,btc:pendingLoss().btc}:null};})()`);
  const none = fire(false), apart = fire(true, "bank"), together = fire(true, "site"), steelHere = fire(true, "site", true);
  assert(none.hot === 0 && none.loss && none.loss.cause === "nobackup" && Math.abs(none.loss.btc - none.hot0) < 1e-9, `a fire with no backup did not take the whole online wallet: ${JSON.stringify(none)}`);
  assert(none.oldRetired && none.newKey && !none.sameKey, "a lost wallet was not replaced by a fresh key");
  assert(apart.hot === apart.hot0 && !apart.loss && apart.sameKey && apart.cash > 0, `a backup in a bank box did not rebuild the wallet for a price: ${JSON.stringify(apart)}`);
  assert(together.hot === 0 && together.loss, "a paper backup beside the computer survived the fire that took the computer");
  assert(steelHere.hot === steelHere.hot0 && !steelHere.loss, "steel at the mine did not come through a fire");
});

rule("a break-in takes the computer and what it can reach, and a stolen backup is a stolen key", () => {
  const a = json(`(()=>{${HOT_RUN(false)}
    const k=hotKey(),hot0=state.wallets.hot,id0=k.id;
    applyPlaceIncident("site","burglary",state.time,true);
    return{hot:state.wallets.hot,hot0,loss:pendingLoss()&&{cause:pendingLoss().cause,kind:pendingLoss().kind},replaced:hotKey().id!==id0,retired:!!k.retired};})()`);
  const b = json(`(()=>{${HOT_RUN(false)}
    const k=hotKey();k.backup={product:"paperbackup",durability:"paper",at:0,place:"bank"};
    const hot1=state.wallets.hot;
    applyPlaceIncident("bank","seizure",state.time,true);
    const last=lossQueue().slice(-1)[0];
    return{hot:state.wallets.hot,hot1,cause:last&&last.cause};})()`);
  assert(a.hot < a.hot0 && a.hot > 0 && a.loss && a.loss.cause === "burglary" && a.loss.kind === "stolen", `a break-in did not steal part of the online wallet: ${JSON.stringify(a)}`);
  assert(a.replaced && a.retired, "a stolen key was kept in use");
  assert(b.hot < b.hot1 && b.cause === "seizure", `a seized backup was not a stolen key: ${JSON.stringify(b)}`);
});

rule("a friend copying online-wallet recovery material steals only that wallet and replaces its exposed key", () => {
  const r=json(`(()=>{${HOT_RUN(false)}
    const key=hotKey(),id=key.id,before=state.wallets.hot;
    key.backup={product:"steelplate",durability:"steel",at:0,place:"trusted"};
    applyPlaceIncident("trusted","betrayal",state.time,true);
    const loss=lossQueue().slice(-1)[0];
    return {before,after:state.wallets.hot,replaced:hotKey().id!==id,retired:!!key.retired,backupIntact:!key.backup.destroyed,cause:loss?.cause};})()`);
  assert(r.after<r.before&&r.after>0&&r.replaced&&r.retired&&r.backupIntact&&r.cause==="betrayal","copied online-wallet recovery was not handled as a secret exposure");
});

rule("the computer can fail on any month, only while there is something in it, and the roll never touches the shared random stream", () => {
  const r = json(`(()=>{${HOT_RUN(false)}
    const fresh=()=>{state.custody.keys=[];state.custody.hotKeyId=null;state.wallets.hot=10;state.lossQueue=[];createHotWallet({keyHex:"abcdef0123456789"})};
    const month=t=>new Date(t).toISOString().slice(0,7);
    let hit=null,miss=null,hits=0,months=0;
    for(let seed=1;seed<=400;seed++)for(let m=0;m<12;m++){
      const t=at("2021-01-01")+m*31*DAY,roll=hashRoll(seed,"hotdisk",month(t));months++;
      if(roll<HOT_DISK_RATE){hits++;if(!hit)hit={seed,t}}else if(!miss)miss={seed,t};
    }
    const run=(w,keepEmpty)=>{state.seed=w.seed;state.time=w.t;state.wallets.hot=keepEmpty?0:10;state.custody.hotWarned=true;
      const key=hotKey();advanceHotKeyRisk(w.t,true);return{replaced:hotKey()!==key,hot:state.wallets.hot}};
    const failed=run(hit,false);
    fresh();
    const spared=run(miss,false);
    fresh();
    const empty=run(hit,true);
    fresh();
    state.custody.hotWarned=false;state.wallets.hot=10;state.seed=miss.seed;advanceHotKeyRisk(miss.t,true);
    return{hits,months,failed,spared,empty,warned:state.custody.hotWarned,risk:hotKeyRisk()};})()`);
  const rate = r.hits / r.months;
  assert(rate > 0.0008 && rate < 0.0032, `the monthly roll hit ${r.hits} times in ${r.months} months (${rate}); it should be about the 0.15% rate`);
  assert(r.failed.replaced && r.failed.hot === 0, "a month that rolls a failure did not lose the unbacked wallet");
  assert(!r.spared.replaced && r.spared.hot === 10, "a month that rolls no failure touched the wallet");
  assert(!r.empty.replaced, "the computer failed with nothing in the wallet");
  assert(r.warned && r.risk > 0, "a wallet with coins and no backup was not warned, or carries no risk");
});

rule("a run with no first key behaves exactly as it did before there was one", () => {
  const r = json(`(()=>{${CUSTODY_SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}
    const none={key:hotKey(),risk:hotKeyRisk(),lossUnready:custodyLossRisk(),finding:custodyPostureFindings().some(f=>f.id==="hotkey"),backed:hotKeyBackedUp()};
    const hot0=state.wallets.hot;advanceHotKeyRisk(at("2021-03-01"),true);applyPlaceIncident("site","fire",state.time,true);
    return{none,hotAfter:state.wallets.hot,hot0,setup:hotKeyAfterIncident("site","fire",0,true)};})()`);
  assert(r.none.key === null && r.none.risk === 0 && r.none.lossUnready === 0.0018 && !r.none.finding && !r.none.backed, `a run with no first key changed: ${JSON.stringify(r.none)}`);
  assert(r.hotAfter === r.hot0, "an incident touched an online wallet that has no first key behind it");
});

rule("a wallet whose key is on one disk is a finding for anyone who prices custody, and a backup clears it", () => {
  const r = json(`(()=>{${HOT_RUN(false)}
    const one=custodyPostureFindings().find(f=>f.id==="hotkey");
    const unready=custodyLossRisk();
    hotKey().backup={product:"paperbackup",durability:"paper",at:0,place:"bank"};
    return{one:one&&one.blocks,unready,cleared:!custodyPostureFindings().some(f=>f.id==="hotkey")};})()`);
  assert(r.one === "strong", `an unbacked online key was not a finding that blocks a strong posture: ${r.one}`);
  assert(r.unready === 0, "the generic accident still rolls against coins whose key has its own risk");
  assert(r.cleared, "a backup did not clear the finding");
});

rule("a run that begins with the first-wallet ceremony does not start until it has a wallet", () => {
  /* Nothing can be paid to an address that does not exist. A run flagged as needing its first wallet holds the clock
     until the ceremony is done, and an old save or a rule that never set the flag runs exactly as it always did. */
  const r = json(`(()=>{${SITE(`state.time=at("2013-01-10");state.hardware={s9:5};`)}
    const t0=state.time;state.walletSetup={done:false,step:0,rolls:[],keyHex:"",required:true,resumeSpeed:1};
    const held0=state.wallets.hot;
    for(let i=0;i<10;i++)tick(true);
    const held={moved:state.time-t0,coins:state.wallets.hot-held0};
    state.walletSetup.done=true;
    for(let i=0;i<10;i++)tick(true);
    const after={moved:state.time-t0};
    state.walletSetup={done:false,step:0,rolls:[],keyHex:""};
    const t1=state.time;for(let i=0;i<3;i++)tick(true);
    return{held,after,legacy:state.time-t1};})()`);
  assert(r.held.moved === 0 && r.held.coins === 0, `the clock ran ${r.held.moved} ms and ${r.held.coins} BTC arrived with no wallet`);
  assert(r.after.moved > 0, "the clock did not start once the wallet was made");
  assert(r.legacy > 0, "a run with no ceremony flag (an old save) was held by a ceremony it never had");
});

rule("a payment costs what the date charged, and the early economy is unchanged", () => {
  /* The payout fee used to be one number for every year, so a payout cost $0.02 in 2013 and $21 in 2025, and
     a low threshold was never more or less foolish in a fee spike than in a quiet year. The years before 2017
     keep the fixed fee wallets really paid (0.0002 BTC, what this game always charged); from 2017 the market
     sets it. The properties: the early years are exactly as before, the 2017 spike costs more than the old
     figure, a quiet modern year costs far less, and a node still makes it cheaper. */
  const r = json(`(()=>{${SITE(`state.hardware={s19:5};`)}
    state.custody.policy="single";state.custody.assigned=[];nodeOnline=()=>false;
    const at_=d=>{state.time=at(d);return payoutNetworkFee()};
    const early=[at_("2012-06-01"),at_("2014-06-01"),at_("2016-06-01")],spike=at_("2017-12-15"),quiet=at_("2025-06-01");
    state.time=at("2021-06-01");const without=payoutNetworkFee();nodeOnline=()=>true;state.nodeMode="relay";const withNode=payoutNetworkFee();
    return {early,spike,quiet,without,withNode}})()`);
  assert(r.early.every(f => Math.abs(f - 0.0002) < 1e-12),
    `before 2017 a payment costs the fixed 0.0002 BTC it always did, got ${r.early.join(", ")}`);
  assert(r.spike > 0.0002 * 2, `the December 2017 spike should cost much more than the old flat fee, got ${r.spike}`);
  assert(r.quiet < 0.0002 / 5, `a quiet 2025 payment should cost a fraction of the old flat fee, got ${r.quiet}`);
  assert(r.withNode > 0 && r.withNode < r.without, `running a node should make a payment cheaper: ${r.withNode} vs ${r.without}`);
});

rule("a single-key wallet is not charged for a quorum it does not have", () => {
  /* `threshold>1` is what separates one key from several, and it decides both a fee premium
     and the sentence describing the ceremony. Inclusive, and a single-key operator pays the
     multisig surcharge on every payout and is told their coins were released by signatures
     gathered from keys held apart - a fee for protection they do not have, and a lie about
     how their own wallet works, in the part of the game meant to teach exactly this. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.hardware={s19:5};`)}
    state.custody.policy="single";state.custody.assigned=[];
    const single=payoutNetworkFee();
    state.custody.policy="2of3";
    const quorum=payoutNetworkFee();
    return {single,quorum,ratio:+(quorum/single).toFixed(3)}})()`);
  assert(r.single > 0 && r.quorum > 0, "a payout fee should never be free");
  assert(r.quorum > r.single,
    `a quorum wallet costs more to pay out to, but single=${r.single} and quorum=${r.quorum}`);
  assert(Math.abs(r.ratio - 1.35) < 1e-9,
    `the quorum premium should be 1.35x, got ${r.ratio}x - a single-key wallet is being charged for a quorum`);
});

rule("a site over on both power and floor is told about both", () => {
  /* siteStopReason builds its sentence from two independent shortfalls, and each is gated by
     its own `>0`. Either gate made inclusive drops that half of the message: an operator over
     on power AND floor is sent to free one of them, frees it, and the site stays dark with the
     other still unmentioned. This is the function that exists because a 575k-machine site went
     quiet with nothing on screen, so a half-explanation is the original bug wearing a sentence. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";
    state.region="texas";state.hardware={s19:400};`)}
    const fs=fleet(),f=FACILITIES.find(x=>x.id==="workshop");
    return {overKw:+(fs.kw-fs.cap).toFixed(1),overSpace:fs.space-f.space,
      within:fs.within,reason:siteStopReason().slice(0,220)}})()`);
  assert(r.overKw > 0, `this rule needs the site over on power, it is over by ${r.overKw} kW`);
  assert(r.overSpace > 0, `this rule needs the site over on floor, it is over by ${r.overSpace} units`);
  assert(r.reason !== "", "a site over on both power and floor gave no reason at all");
  assert(/kW more than/.test(r.reason), `the power shortfall is not named: "${r.reason}"`);
  assert(/floor units more than/.test(r.reason), `the floor shortfall is not named: "${r.reason}"`);

  /* The complementary case, which is what the `>0` gates are actually for. Over on floor and
     comfortably inside the power cap - every machine stopped, so nothing draws while the racks
     stay full. An inclusive gate does not drop half the message here, it INVENTS half: the
     operator is told they need "0 kW more than the workshop can supply", and sent to free
     capacity that is not the problem. Asserting only the both-short case cannot see that,
     which is why the first version of this rule survived both of those mutants. */
  const only = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";
    state.region="texas";state.hardware={s19:400};`)}
    state.poweredDownHardware={s19:400};
    const fs=fleet(),f=FACILITIES.find(x=>x.id==="workshop");
    return {kw:+fs.kw.toFixed(1),cap:+fs.cap.toFixed(1),overSpace:fs.space-f.space,
      within:fs.within,reason:siteStopReason().slice(0,220)}})()`);
  assert(only.kw <= only.cap,
    `this arm needs the site inside its power cap, it draws ${only.kw} kW of ${only.cap} kW`);
  assert(only.overSpace > 0, `this arm needs the site over on floor, it is over by ${only.overSpace}`);
  assert(/floor units more than/.test(only.reason),
    `the floor shortfall is not named: "${only.reason}"`);
  assert(!/kW more than/.test(only.reason),
    `the site is inside its power cap, yet the operator is told about a power shortfall: "${only.reason}"`);

  /* And the mirror of it, because the two gates are independent and each needs the case where
     ITS shortfall is the zero one. A single S19 in a home office draws 3.25 kW against a
     1.5 kW circuit while occupying 2 of 5 floor units: over on power, plenty of room. An
     inclusive floor gate tells that operator to find "0 floor units more than it can hold". */
  const powerOnly = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="home";
    state.region="na";state.hardware={s19:1};`)}
    const fs=fleet(),f=FACILITIES.find(x=>x.id==="home");
    return {kw:+fs.kw.toFixed(2),cap:+fs.cap.toFixed(2),space:fs.space,siteSpace:f.space,
      within:fs.within,reason:siteStopReason().slice(0,220)}})()`);
  assert(powerOnly.kw > powerOnly.cap,
    `this arm needs the site over on power, it draws ${powerOnly.kw} kW of ${powerOnly.cap} kW`);
  assert(powerOnly.space <= powerOnly.siteSpace,
    `this arm needs the fleet to fit the floor, it uses ${powerOnly.space} of ${powerOnly.siteSpace}`);
  assert(/kW more than/.test(powerOnly.reason),
    `the power shortfall is not named: "${powerOnly.reason}"`);
  assert(!/floor units more than/.test(powerOnly.reason),
    `the fleet fits the floor, yet the operator is told to find more of it: "${powerOnly.reason}"`);
});

rule("a site producing no hash says so", () => {
  /* siteStopReason exists because an operator once watched a 575k-machine site sit idle with
     nothing on screen explaining it. `fs.hash<=0` is the branch that answers the plainest
     case of all. Made strict, a site at exactly zero hash falls through every branch and the
     function returns nothing - which is the original bug, restored, in the code written to
     stop it happening. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:10};`)}
    state.poweredDownHardware={s19:10};
    const fs=fleet();
    return {hash:fs.hash,reason:siteStopReason().slice(0,150)}})()`);
  assert(r.hash === 0, `the fleet should be producing no hash for this rule, got ${r.hash}`);
  assert(r.reason !== "", "a site producing no hash gave no reason for it");
  assert(/hash/i.test(r.reason), `the reason should say nothing can hash: "${r.reason}"`);
});

rule("when every crate fits, nothing is held back and nothing says otherwise", () => {
  /* stagedHoldReason returns "" when what fits covers what is waiting, and the comparison is
     inclusive because fitting exactly is still fitting. Made strict and an operator whose
     crates all fit is told they need more power and floor to rack them - advice to go and
     free capacity they already have. */
  /* Stages EXACTLY the room available, because that is the only quantity the boundary can be
     read wrong at. Three crates in a warehouse with room for hundreds passes whether the
     comparison is inclusive or not - which is how the first version of this rule survived its
     own mutant. Fitting exactly is the case worth asserting. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:5};`)}
    const h=HARDWARE.find(x=>x.id==="s19");
    const room=siteRackHeadroom(h);
    state.inactiveHardware={s19:room};state.stagedCondition={s19:100};
    const fits=stagedFitCount("s19"),reason=stagedHoldReason("s19");
    return {crated:room,fits,reason:String(reason).slice(0,140)}})()`);
  assert(r.crated > 0, "the site had no room at all, so the rule tests nothing");
  assert(r.fits === r.crated,
    `exactly ${r.crated} crates should fit the room measured for exactly ${r.crated}, but ${r.fits} do`);
  assert(r.reason === "",
    `every crate fits exactly, yet the operator is told: "${r.reason}"`);
});

rule("a job due at exactly this instant is due, and one with no due date is neither", () => {
  /* The boundary that had been written six different ways and asserted nowhere. Both mutation
     directions matter: make dueBy strict and every lead time in the game gains a day; make
     pendingAt inclusive and a job scheduled for today is treated as already finished. The
     malformed case is asserted too, because that is where the two stop being complements -
     and where a careless "just use !dueBy" would change what the old comparisons did. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");`)}
    const t=state.time;
    const exactly={due:t},tomorrow={due:t+DAY},yesterday={due:t-DAY};
    const noDate={},nan={due:"soon"},nul={due:null};
    return {
      exactlyDue:dueBy(exactly,t),exactlyPending:pendingAt(exactly,t),
      tomorrowDue:dueBy(tomorrow,t),tomorrowPending:pendingAt(tomorrow,t),
      yesterdayDue:dueBy(yesterday,t),yesterdayPending:pendingAt(yesterday,t),
      noDateDue:dueBy(noDate,t),noDatePending:pendingAt(noDate,t),
      nanDue:dueBy(nan,t),nanPending:pendingAt(nan,t),
      nullDue:dueBy(nul,t),nullPending:pendingAt(nul,t),
      undefDue:dueBy(undefined,t),undefPending:pendingAt(undefined,t)}})()`);
  assert(r.exactlyDue === true && r.exactlyPending === false,
    "a job due at exactly this instant must be due, not still pending - otherwise every lead time gains a day");
  assert(r.tomorrowDue === false && r.tomorrowPending === true, "a job due tomorrow is pending, not due");
  assert(r.yesterdayDue === true && r.yesterdayPending === false, "a job due yesterday is due, not pending");
  /* Neither, in both directions, for every shape of missing date. */
  for (const [kind, due, pending] of [["no due field", r.noDateDue, r.noDatePending],
      ["an unparseable due", r.nanDue, r.nanPending], ["a null due", r.nullDue, r.nullPending],
      ["no job at all", r.undefDue, r.undefPending]]) {
    assert(due === false, `${kind} must not read as due`);
    assert(pending === false, `${kind} must not read as pending either`);
  }
});

rule("two batches of the same machine waiting together blend their condition", () => {
  /* stageDelivery weights the condition of what is already in the crates against what is
     arriving, which is what happens when you buy the same model from two sellers. The count
     of what is already waiting clamps at zero; invert that clamp and it reads zero however
     full the yard is, so the newest batch's condition simply replaces the average. Buy 90
     worn machines and then one refurbished unit, and the whole batch reports as refurbished -
     then racks at a condition it does not have, and the fault rate that follows is a mystery. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={};`)}
    state.inactiveHardware={};state.stagedCondition={};
    stageDelivery("s19",90,40);          // ninety tired machines
    const afterFirst={qty:state.inactiveHardware.s19,cond:state.stagedCondition.s19};
    stageDelivery("s19",10,100);         // ten pristine ones
    const afterSecond={qty:state.inactiveHardware.s19,cond:state.stagedCondition.s19};
    return {afterFirst,afterSecond}})()`);
  assert(r.afterFirst.qty === 90 && r.afterFirst.cond === 40,
    `the first batch staged wrong: ${r.afterFirst.qty} units at condition ${r.afterFirst.cond}`);
  assert(r.afterSecond.qty === 100, `the batches did not accumulate: ${r.afterSecond.qty}`);
  /* (90×40 + 10×100) / 100 = 46. Not 100, which is what ignoring the waiting batch gives,
     and not 40, which is what ignoring the new one gives. */
  assert(Math.abs(r.afterSecond.cond - 46) < 1e-9,
    `the blended condition should be 46, got ${r.afterSecond.cond} - the batch already waiting was not weighted`);
});

rule("a retirement job restored without a start date still makes progress", () => {
  /* Old saves carry retirement jobs written before `started` existed. advanceRetirements
     back-fills it with min(now, due) so the span is positive and the crew pulls machines
     steadily. Take the max instead and started lands on the due date: the span collapses,
     progress reads as zero for the whole job, and every machine leaves the racks in one jump
     at the end - the gradual retirement this was built to model, silently gone. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:100};`)}
    // A legacy job: no "started" field at all.
    state.retirementJobs=[{id:"s19",qty:100,done:0,due:state.time+10*DAY,days:10}];
    const steps=[];
    for(let d=0;d<12;d++){tick(true);
      const job=state.retirementJobs[0];
      steps.push(job?job.done:(state.decommissionedHardware.s19||0));}
    return {steps,started:Number.isFinite(state.retirementJobs[0]?.started),
      finalRetired:state.decommissionedHardware.s19||0,
      jobsLeft:state.retirementJobs.length,
      partialProgress:steps.filter(n=>n>0&&n<100).length}})()`);
  assert(r.finalRetired === 100, `the legacy job did not finish: ${r.finalRetired} of 100 retired`);
  assert(r.jobsLeft === 0, "the legacy retirement job never closed");
  assert(r.partialProgress > 0,
    "the crew went from nothing to everything in one step; a back-filled start date collapsed the span");
});

rule("cold storage that holds coins is always a measurable distance away", () => {
  /* coldLockedBtc clamps at zero so a corrupt negative balance cannot read as a debt. Invert
     that clamp and it returns zero for every positive balance instead, which makes
     treasuryDistanceDays() answer "nothing to wait for" while the coins are still behind a
     signing ceremony. The whole educational point of cold storage is that the delay is real
     and visible; a zero there teaches the opposite of the lesson. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");`)}
    state.wallets.cold=2.5;state.wallets.hot=0;
    const held=coldLockedBtc(),days=treasuryDistanceDays();
    state.wallets.cold=0;
    const emptyHeld=coldLockedBtc(),emptyDays=treasuryDistanceDays();
    return {held,days,emptyHeld,emptyDays,ceremony:coldSpendDays()}})()`);
  assert(r.held === 2.5, `cold storage holds 2.5 BTC but reports ${r.held}`);
  assert(r.ceremony > 0, "a signing ceremony that takes no time is not cold storage");
  assert(r.days === r.ceremony,
    `coins in cold are ${r.days} days away but the ceremony takes ${r.ceremony}`);
  assert(r.emptyHeld === 0 && r.emptyDays === 0,
    `an empty treasury should be zero days away, not ${r.emptyDays}`);
});

rule("machines in repair cannot also be powered down", () => {
  /* setHardwarePower clamps the repairing count at what is owned, and the available count at
     owned minus paused minus repairing. Break either clamp and the two states overlap: the
     same machine is counted as stopped and as on a bench, or more units are stopped than
     exist. Both leave poweredDownHardware describing a fleet that is not there. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="warehouse";
    state.region="texas";state.hardware={s19:10};`)}
    state.maintenance.faults={s19:4};state.maintenance.faultsByPart={s19:{asicfan:4}};
    setHardwarePower("s19",false,10);
    const afterPause={off:state.poweredDownHardware.s19||0,faults:hardwareFaultCount(HARDWARE.find(h=>h.id==="s19"))};
    setHardwarePower("s19",true,50);
    const afterStart={off:state.poweredDownHardware.s19||0};
    return {owned:10,afterPause,afterStart}})()`);
  assert(r.afterPause.off > 0, "nothing was paused, so the rule tests nothing");
  assert(r.afterPause.off + r.afterPause.faults <= r.owned,
    `${r.afterPause.off} stopped plus ${r.afterPause.faults} in repair exceeds the ${r.owned} owned`);
  assert(r.afterStart.off >= 0,
    `restarting more units than were stopped drove the paused count to ${r.afterStart.off}`);
  assert(r.afterStart.off <= r.owned, `${r.afterStart.off} stopped of ${r.owned} owned`);
});

rule("crates waiting to be racked are never a negative number of crates", () => {
  /* The staged count clamps at zero. Inverted, it reports zero or below for a yard full of
     crates, and the shortfall message that tells the operator how much power or floor they
     need to free reads as though nothing is waiting. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");state.facility="workshop";
    state.region="texas";state.hardware={s19:20};`)}
    state.inactiveHardware={s19:300};
    const h=HARDWARE.find(x=>x.id==="s19");
    const tight=stagedFitCount("s19"),reason=stagedHoldReason("s19");
    /* And the same crates in a site with room to spare, because "how many fit" returning zero
       is the RIGHT answer in a full workshop - a rule that only ever asks the full case passes
       whatever the arithmetic does. */
    state.facility="warehouse";
    const roomy=stagedFitCount("s19"),roomyReason=stagedHoldReason("s19");
    return {tight,roomy,crated:state.inactiveHardware.s19,
      reason:String(reason).slice(0,200),roomyReason:String(roomyReason).slice(0,120)}})()`);
  assert(r.crated === 300, "the crates were not staged");
  assert(r.tight >= 0, `the staged count went negative: ${r.tight}`);
  assert(r.tight <= r.crated, `${r.tight} staged out of ${r.crated} crated`);
  assert(r.roomy > 0, `a site with room racked ${r.roomy} of ${r.crated} waiting crates`);
  assert(r.roomy <= r.crated, `${r.roomy} racked out of ${r.crated} crated`);
  assert(r.tight < r.roomy, `the full workshop accepted ${r.tight}, the roomy warehouse ${r.roomy} - the site should matter`);
  assert(r.reason !== "", "300 crates cannot all fit a workshop, so the hold should be explained");
  assert(/300/.test(r.reason), `the explanation should say how many are waiting: "${r.reason}"`);
  /* Both shortfalls, separately asserted. 300 S19s overrun a workshop on power AND on floor,
     and a message that names only one of them sends the operator to free the wrong thing. */
  assert(/kW more electrical capacity/.test(r.reason),
    `the explanation should name the power shortfall: "${r.reason}"`);
  assert(/more floor units/.test(r.reason),
    `the explanation should name the floor shortfall: "${r.reason}"`);
});

rule("a restored pool account cannot carry an impossible lifetime total", () => {
  /* The normaliser clamps paidTotal at zero on load. Inverting that clamp forces every
     restored account to zero or below, so a save with real history reopens claiming the pool
     has never paid - and the operator's own record of what they earned is gone. */
  const r = json(`(()=>{${SITE(`state.time=at("2021-06-01");`)}
    state.poolAccount={balance:.5,frozen:0,threshold:.01,destination:"hot",
      paidTotal:12.5,feesPaid:.25,payouts:40,lastPayout:0};
    const kept=poolAccount();
    state.poolAccount={balance:.5,frozen:0,threshold:.01,destination:"hot",
      paidTotal:-3,feesPaid:-1,payouts:-2,lastPayout:0};
    const repaired=poolAccount();
    return {keptPaid:kept.paidTotal,keptFees:kept.feesPaid,keptPayouts:kept.payouts,
      repairedPaid:repaired.paidTotal,repairedFees:repaired.feesPaid}})()`);
  assert(r.keptPaid === 12.5, `a valid lifetime total was discarded on load: ${r.keptPaid}`);
  assert(r.keptFees === .25 && r.keptPayouts === 40, "valid payout history was discarded on load");
  assert(r.repairedPaid >= 0 && r.repairedFees >= 0,
    `a corrupt save kept impossible totals: paid ${r.repairedPaid}, fees ${r.repairedFees}`);
});

/* ---- THE SAVE GUARD: a save the game cannot use is set aside, never replaced or left blank ---- */

const UNREADABLE = "hashrate-genesis-save-v1.unreadable";
const BAD_SAVES = {
  "a date that is not a number": { raw: JSON.stringify({ version: 1, started: true, time: "abc", walletSetup: { done: true } }) },
  "text cut off part-way through": { raw: '{"version":1,"started":true,"time":1230940800000,"cash":15' },
  "a bare null": { raw: "null" },
  "a list where a table belongs": { raw: JSON.stringify({ version: 1, time: 1230940800000, wallets: [] }) },
};
for (const [what, { raw }] of Object.entries(BAD_SAVES)) {
  rule(`a stored save with ${what} loads as a fresh run and the original text is kept`, () => {
    const sandbox = loadEngine(null, raw);
    const read = makeEval(sandbox);
    assert(read("state.started") === false && read("Number.isFinite(state.time)"), "an unusable save was loaded into the run instead of being set aside");
    assert(read("saveProblem!==null") === true, "nothing told the UI that a save had been set aside");
    assert(read(`localStorage.getItem("${UNREADABLE}")`) === raw, "the raw text of the unusable save was not kept");
    assert(read("unreadableSaveKept") === true, "the footer would not offer to export the kept save");
    // The first save of the new run overwrites the live key, not the kept copy.
    read("save()");
    assert(read(`localStorage.getItem("${UNREADABLE}")`) === raw, "starting the new run overwrote the kept copy");
  });
}

rule("a good save, and a first visit, load without setting anything aside", () => {
  const save = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  const old = makeEval(loadEngine(save));
  assert(old("saveProblem")=== null && old("state.started") === true, "a readable old save was set aside");
  assert(old(`localStorage.getItem("${UNREADABLE}")`) === null, "a readable save left an unreadable copy behind");
  const fresh = makeEval(loadEngine());
  assert(fresh("saveProblem") === null && fresh("unreadableSaveKept") === false, "a first visit reported a problem");
});

rule("an imported file goes through the same shape check as a stored save", () => {
  const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/save-pre-custody-sprint.json", import.meta.url), "utf8"));
  assert(run(`saveShapeProblem(${JSON.stringify(fixture)})`) === "", "the old-save fixture was refused by the shape check");
  assert(run(`saveShapeProblem({version:1,time:"abc",wallets:{},hardware:{}})`) !== "", "an import with a non-numeric date was accepted");
  assert(run(`saveShapeProblem({version:1,time:1,wallets:{},hardware:{},activity:{}})`) !== "", "an import whose activity is not a list was accepted");
  assert(/saveShapeProblem\(parsed\)/.test(fs.readFileSync(new URL("../src/engine/actions.js", import.meta.url), "utf8")), "importSave no longer runs the shape check");
});

rule("a browser that refuses to store the game is noticed once, and clears when storage works again", () => {
  const read = makeEval(loadEngine());
  read(`globalThis.__announced=0;globalThis.announceSaveState=()=>{__announced++};globalThis.__set=localStorage.setItem;localStorage.setItem=()=>{throw new Error("QuotaExceededError")}`);
  assert(read("save()") === false && read("saveFailing") === true, "a refused write was reported as saved");
  read("save();save()");
  assert(read("__announced") === 1, `the player was told ${read("__announced")} times rather than once`);
  read("localStorage.setItem=__set");
  assert(read("save()") === true && read("saveFailing") === false, "saving did not recover when storage came back");
  assert(read("__announced") === 2, "the recovery was not announced");
});

rule("the first wallet's key never comes from the run's seed", () => {
  const read = makeEval(loadEngine());
  read(`${SITE()}state.walletSetup={done:false,step:0,rolls:[],keyHex:"",required:true};state.rng=12345;`);
  read("skipWalletSetup()");
  const r = JSON.parse(read("JSON.stringify({rng:state.rng,n:state.walletSetup.rolls.length,hex:state.walletSetup.keyHex,step:state.walletSetup.step,ok:state.walletSetup.rolls.every(x=>x>=1&&x<=6)})"));
  assert(r.rng === 12345, "generating the key consumed the game's seeded stream, so the key follows from the seed the header shows");
  assert(r.n === 99 && /^[0-9a-f]{64}$/.test(r.hex) && r.step === 2 && r.ok, "the generated key is not 99 dice and 64 hex digits");
  assert(JSON.parse(read("JSON.stringify(secureDice(5))")).length === 5, "secureDice returned the wrong number of rolls");
});

rule("the fourth halving lands on its UTC day, 20 April 2024, not the 19th", () => {
  // Block 840,000 was mined at 00:09 UTC on 20 April 2024. It is still the 19th in the Americas.
  assert(run('subsidyAt(at("2024-04-19"))') === 6.25, "the subsidy had already halved on 19 April 2024");
  assert(run('subsidyAt(at("2024-04-20"))') === 3.125, "the subsidy had not halved by 20 April 2024");
  const event = run('JSON.stringify(EVENTS.find(e=>e.id==="halving4").date)');
  assert(event === '"2024-04-20"', `the halving event is dated ${event}`);
});

/* ---- COLD STORAGE FROM THE FIRST DAY ---- */

rule("cold storage starts with a paid Basic PC and prepared signer, and refuses deposits before keys exist", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2009-02-01");state.campaignStart=at("2009-01-03");state.wallets.hot=100;state.wallets.cold=0;state.cash=1000;`)}
    state.custody=blankCustody();`);
  assert(read('venueAvailable("cold")') === true, "cold storage is not available in 2009");
  // No wallet can sign yet: coins are not accepted into cold storage.
  read('transfer("hot","cold",.5)');
  assert(read("state.wallets.cold") === 0 && read("state.wallets.hot") === 100, "coins were moved to a wallet nobody can sign for");
  read('orderCustodyProduct("beigepc",1)');
  assert(read("state.cash") === 825, "the first Basic PC was not charged");
  read('orderCustodyProduct("beigepc",1)');
  assert(read("state.custody.orders.length") === 2 && read("state.cash") === 650, "a second Basic PC was not charged separately");
  read("state.time+=2*DAY;advanceCustodyOrders(state.time)");
  assert(read("state.custody.devices.length") === 2, "the purchased computers never arrived");
  read("inspectWorkshopDevice(state.custody.devices[0].uid);prepareWorkshopDevice(state.custody.devices[0].uid)");
  read("generateCustodyKey(state.custody.devices[0].uid)");
  read('backupCustodyKey(state.custody.keys.find(k=>!k.hot).id,"paperbackup")');
  read("assignCustodyKey(state.custody.keys.find(k=>!k.hot).id)");
  assert(read("custodySetup().ready") === true, "the wallet cannot sign after the five steps");
  read('transfer("hot","cold",.5)');
  assert(Math.abs(read("state.wallets.cold") - 50) < 1, `half the coins did not reach cold storage: ${read("state.wallets.cold")}`);
});

rule("the online wallet cannot be lost in the first sixty days of a campaign, and can be afterwards", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2013-06-01");state.campaignStart=at("2013-06-01");state.wallets.hot=100;state.wallets.cold=0;`)}
    state.custody=blankCustody();createHotWallet({});`);
  assert(read("hotKeyGrace()") === true, "a campaign's first day is not inside the grace period");
  read("for(let i=0;i<20000;i++){state.wallets.hot=100;advanceHotWalletRisk()}");
  assert(read("state.wallets.hot") === 100, "the online wallet was compromised during the grace period");
  read('state.time=at("2013-09-01")');
  assert(read("hotKeyGrace()") === false, "the grace period never ends");
  read("let hit=0;for(let i=0;i<20000;i++){state.wallets.hot=100;advanceHotWalletRisk();if(state.wallets.hot<100)hit++}globalThis.__hit=hit");
  assert(read("__hit") > 0, "the online wallet can no longer be compromised even after the grace period");
});

rule("a custody loss says how likely it was, and what would have lowered it", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2013-09-01");state.campaignStart=at("2013-01-01");state.wallets.hot=100;state.wallets.cold=0;`)}
    state.custody=blankCustody();createHotWallet({});state.pendingLosses=[];
    for(let i=0;i<20000&&!lossQueue().length;i++){state.wallets.hot=100;advanceHotWalletRisk()}`);
  assert(read("lossQueue().length") > 0, "no hot-wallet incident was produced to read");
  const text = read("lossQueue()[0].oddsText");
  assert(/In the game model, this was about 1 in [\d,]+ in the month it happened \(\d/.test(text), `the loss carried no odds: "${text}"`);
  assert(/cold storage/.test(text) && /over a year/.test(text), `the odds did not say what would have lowered them: "${text}"`);
  assert(read('lossOddsText({monthly:0})') === "" && read("lossOddsText(null)") === "", "an incident with no stated chance printed one");
});

rule("replacement Basic PCs are normal paid purchases and insufficient cash cannot place an order", () => {
  const read=makeEval(loadEngine());
  read(`${SITE(`state.time=at("2009-02-01");state.cash=500;`)}state.custody=blankCustody();orderCustodyProduct("beigepc",1);state.time+=2*DAY;advanceCustodyOrders(state.time);`);
  assert(read("state.cash")===325,"the first computer was free");
  assert(!read("custodyOnceBlocked(custodyProduct('beigepc'))"),"a working computer blocked another purchase");
  read("state.custody.devices[0].destroyed={at:state.time,cause:'fire'};orderCustodyProduct('beigepc',1)");
  assert(read("state.cash")===150&&read("state.custody.orders.length")===1,"a replacement was free or not ordered");
  read("orderCustodyProduct('beigepc',1)");
  assert(read("state.cash")===150&&read("state.custody.orders.length")===1,"insufficient cash created another order");
});

rule("new signers require preparation, while legacy keyed devices and distinct-site recovery remain compatible", () => {
  const read=makeEval(loadEngine());
  read(`${SITE(`state.time=at("2021-02-01");state.facility="warehouse";`)}state.custody=blankCustody();receiveCustodyOrder({id:"beigepc",qty:1},state.time);`);
  read("generateCustodyKey(state.custody.devices[0].uid)");
  assert(read("state.custody.keys.length")===0,"an unprepared new signer created a key");
  read("prepareWorkshopDevice(state.custody.devices[0].uid)");
  assert(!read("state.custody.devices[0].softwarePrepared"),"software preparation skipped inspection");
  read("inspectWorkshopDevice(state.custody.devices[0].uid);prepareWorkshopDevice(state.custody.devices[0].uid);generateCustodyKey(state.custody.devices[0].uid);backupCustodyKey(state.custody.keys[0].id,'paperbackup');assignCustodyKey(state.custody.keys[0].id)");
  assert(read("workshopHealth().score")===65,"same-site setup earned separation points");
  read("state.custody.keys[0].backup.place='bank'");
  assert(read("workshopHealth().score")===85,"distinct-site recorded setup did not reach the rehearsal-limited maximum");
  read("delete state.custody.devices[0].workshopSetup;delete state.custody.devices[0].inspected;delete state.custody.devices[0].softwarePrepared");
  assert(read("workshopHealth().score")===85,"legacy keyed equipment lost its working status");
});

/* ---- THE RECORDED FEE RATES ---- */

rule("the fee a payment or a sweep costs follows the recorded rate of the day, and the halvings are the recorded blocks", () => {
  const r = json(`(()=>{
    const day=d=>Date.parse(d+"T00:00:00Z");
    const spike=feeRateSatPerVb(day("2017-12-17")),quiet=feeRateSatPerVb(day("2026-10-05")),after=feeRateSatPerVb(END+400*DAY);
    let lo=Infinity,hi=0;for(let t=day("2011-01-01");t<=END;t+=30*DAY){const m=rushMultiple(t);lo=Math.min(lo,m);hi=Math.max(hi,m)}
    const halv=DATA_META.halvings.map(h=>new Date(h.time*1000).toISOString().slice(0,10));
    const coded=RECORDED_HALVINGS.map(t=>new Date(t).toISOString().slice(0,10));
    return{spike,quiet,after,lo,hi,halv,coded,recorded:recordedFeeRate(day("2017-12-17")),beyond:recordedFeeRate(END+DAY)}})()`);
  assert(r.recorded > 100 && r.spike >= r.recorded - 1e-9, `December 2017 was not read from the record: ${r.recorded}, ${r.spike}`);
  assert(r.quiet < 10 && r.spike > r.quiet * 20, `a quiet 2026 day (${r.quiet}) is not far below the 2017 spike (${r.spike})`);
  assert(r.beyond === null && r.after >= 1, "beyond the record the fee rate did not fall back to the model");
  assert(r.lo >= 2 && r.hi <= 6, `the queue-jumping multiple left its bounds: ${r.lo} to ${r.hi}`);
  assert(JSON.stringify(r.halv) === JSON.stringify(r.coded), `the coded halving days ${r.coded} are not the recorded blocks' UTC days ${r.halv}`);
});

rule("a fire, flood or break-in at the mine leaves its mark on the floor for three weeks, and nothing else does", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2013-09-01");state.campaignStart=at("2012-01-01");`)}state.custody=blankCustody();`);
  read('applyPlaceIncident("home","fire",state.time,true)');
  assert(read("state.siteScene") === undefined || read("state.siteScene") === null, "a fire at home marked the mining floor");
  read('applyPlaceIncident("site","seizure",state.time,true)');
  assert(read("state.siteScene") == null, "a seizure marked the mining floor");
  read('applyPlaceIncident("site","flood",state.time,true)');
  assert(read("state.siteScene.kind") === "flood", "a flood at the mine left no mark on the floor");
  const days = (read("state.siteScene.until") - read("state.siteScene.at")) / 86400000;
  assert(days === read("SITE_SCENE_DAYS") && days === 21, `the aftermath lasts ${days} days, not three weeks`);
  read('reportCoinLoss({title:"t",kind:"stolen",btc:1,cause:"x",scene:"fire"})');
  assert(read("lossQueue()[lossQueue().length-1].scene") === "fire", "a loss did not carry its scene to the window");
});

rule("only the very next release is teased, and nothing already released or undated", () => {
  const r = json(`(()=>{
    const day=d=>Date.parse(d+"T00:00:00Z");
    const sites=t=>nextReleases(FACILITIES,t).map(f=>f.id),regions=t=>nextReleases(REGIONS,t).map(x=>x.id),hw=t=>nextReleases(HARDWARE,t).map(h=>h.id);
    const none=nextReleases(FACILITIES,day("2100-01-01"));
    return{s2009:sites(day("2009-02-01")),s2012:sites(day("2012-06-01")),r2009:regions(day("2009-02-01")),r2019:regions(day("2019-03-01")),
      hw:hw(day("2009-02-01")),none:none.length,mixed:nextReleases([{id:"a",date:"2020-01-01"},{id:"b"},{id:"c",date:"2019-01-01"},{id:"d",date:"2019-01-01"}],day("2018-01-01")).map(x=>x.id)}})()`);
  assert(JSON.stringify(r.s2009) === '["garage"]' && JSON.stringify(r.s2012) === '["warehouse"]', `the next site was ${r.s2009} then ${r.s2012}`);
  assert(JSON.stringify(r.r2009) === '["iceland"]', `the next location in 2009 was ${r.r2009}`);
  assert(JSON.stringify(r.r2019) === '["iran"]', `after Texas the next location was ${r.r2019}`);
  assert(r.hw.length >= 1 && r.none === 0, "the next machine was not found, or something was teased after the last release");
  assert(JSON.stringify(r.mixed) === '["c","d"]', `ties share the next step and undated items are skipped: ${r.mixed}`);
});

rule("the racking toasts name who is doing the work: you, until there is somebody on the payroll", () => {
  const read = makeEval(loadEngine());
  read(`${SITE()}state.staff=[];`);
  assert(read("fieldTechnicianCount()") === 0 && read("rackingWho()") === "you", "with no technician the work was attributed to a crew");
  read(`state.staff=["fieldtech"];`);
  assert(read("fieldTechnicianCount()") >= 1 && read("rackingWho()") === "your technicians", `with a technician the work was attributed to ${read("rackingWho()")}`);
});

/* ---- NO MARKET, NO RESCUE ---- */

rule("a run opens with $2,500, and the floor for a harder start is still $1,500", () => {
  const read = makeEval(loadEngine());
  assert(read("STARTING_LIQUIDITY_DEFAULT") === 2500 && read("initialState().cash") === 2500 && read("initialState().startingCash") === 2500, "the default opening cash is not $2,500");
  assert(read("introStartingCash") === 2500, `the intro offers ${read("introStartingCash")} as the default`);
  assert(read("STARTING_LIQUIDITY_MIN") === 1500, "the lowest opening cash a player can choose moved");
});

rule("before the market opens, a bill cash cannot meet and no miner can cover ends the run", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2010-03-01");state.campaignStart=at("2009-01-03");state.cash=10;state.hardware={laptop:1};state.decommissionedHardware={};`)}`);
  read('queueMonthlySettlement(500,"2010-03",0,true)');
  assert(read("state.ended") === true && read("state.endReason") === "nomarket", `the run was not ended: ended=${read("state.ended")} reason=${read("state.endReason")}`);
  assert(read("state.pendingSettlement") === null && read("state.speed") === 0, "a settlement was left open on a finished run");
});

rule("before the market opens, selling a miner you own, installed or in storage, pays the bill", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2010-03-01");state.campaignStart=at("2009-01-03");state.cash=10;state.hardware={laptop:1,cpu:2};state.decommissionedHardware={};`)}`);
  read('queueMonthlySettlement(500,"2010-03",0,true)');
  assert(read("state.ended") === false && read("state.pendingSettlement") !== null, "a run that could sell its tower was ended");
  const before = read("state.hardware.cpu");
  read("liquidateForSettlement()");
  assert(read("state.pendingSettlement") === null && read("state.cash") < 400, `the bill was not paid by the sale: cash ${read("state.cash")}`);
  assert(read("state.hardware.cpu") < before && read("state.hardware.laptop") === 1, "the sale did not take the tower off the floor, or took the permanent laptop");
});

rule("before the market opens there is no restructuring and no arrears; after it there is", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2010-03-01");state.cash=10;state.hardware={laptop:1,cpu:2};state.decommissionedHardware={};`)}`);
  read('queueMonthlySettlement(500,"2010-03",0,true)');
  read("deferSettlement()");
  assert(read("state.debt") === 0 && read("state.pendingSettlement") !== null, "the bill was carried into arrears before the market opened");
  read("enterReceivership()");
  assert(read("state.operator.restructures") === 0 && read("state.pendingSettlement") !== null, "the operation was restructured before the market opened");
  // After the market opens a shortfall is a decision, not the end of the run.
  const later = makeEval(loadEngine());
  later(`${SITE(`state.time=at("2012-03-01");state.campaignStart=at("2009-01-03");state.cash=10;state.hardware={laptop:1};state.decommissionedHardware={};`)}`);
  later('queueMonthlySettlement(500,"2012-03",0,true)');
  assert(later("state.ended") === false && later("state.pendingSettlement") !== null, "a shortfall after the market opened ended the run");
});

/* ---- THE INTERNET, CUT ---- */

rule("cutting the internet costs nothing, stops mining, and the clock keeps running", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2015-03-01");state.campaignStart=at("2012-01-01");state.hardware={laptop:1,cpu:3};state.node=0;`)}`);
  assert(read("internetMonthlyCost()") > 0 && read("operating()") === true, "the starting position is not an online mine");
  read("cutInternet()");
  assert(read("internetCut()") === true && read("internetMonthlyCost()") === 0, "the line was cut and still billed");
  assert(read("operating()") === false && read("connectivityOutage()") === true, "a mine with no internet is still mining");
  const mined = read("state.mined"), t0 = read("state.time");
  read("for(let i=0;i<20;i++)tick(true)");
  assert(read("state.mined") === mined, "coins were mined with the line cut");
  assert(read("state.time") > t0, "the clock stopped when the line was cut");
  assert(read("state.billLedger.internet") === 0 && read("state.billLedger.nodeNetwork") === 0, "an internet or node-network charge accrued with the line cut");
  assert(read("activeSiteIncident()") === null, "a cut line was reported as a site incident with an end date");
});

rule("the major chapters that fall while the line is cut are held, and shown with their point when it is restored", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2010-07-14");state.campaignStart=at("2009-01-03");state.hardware={laptop:1};state.storyPause=true;state.seen=state.seen.filter(id=>id!=="mtgoxopen");`)}`);
  read("cutInternet()");
  read("for(let i=0;i<8;i++)tick(true)");
  const points = read("state.points");
  assert(JSON.stringify(read("state.missedEvents")) === '["mtgoxopen"]', `the chapter was not held: ${read("JSON.stringify(state.missedEvents)")}`);
  assert(read("state.activeEvent") === null, "a chapter opened with no connection to read it on");
  read("restoreInternet()");
  assert(read("state.activeEvent") === "mtgoxopen" && read("state.points") === points + 1, "the held chapter was not opened, with its point, when the line came back");
  assert(read("state.connectivity") === "fixed" && read("state.missedEvents.length") === 0, "the line was not restored to what it was, or the chapter is still held");
});

rule("reconnecting goes back to the plan that was cut, or to the local line if that is gone", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2022-03-01");state.connectivity="starlink";state.region="na";`)}`);
  read("cutInternet()");assert(read("state.connectivityBefore") === "starlink", "the plan that was cut was not remembered");
  read("restoreInternet()");assert(read("state.connectivity") === "starlink", `reconnecting gave ${read("state.connectivity")}`);
  read("cutInternet();state.region=\"iran\"");read("restoreInternet()");
  assert(read("state.connectivity") === "fixed", "a plan that is not available here was restored");
});

/* ---- EMERGENCY STOP ALL ---- */

rule("Emergency stop all stops every machine, mining and the electricity, and Start site power brings them back", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2011-03-10");state.campaignStart=at("2009-02-03");state.hardware={laptop:1,cpu:3};state.node=0;state.decommissionedHardware={};state.speed=0;`)}`);
  assert(read("operating()") === true && read("fleet().w") > 0, "the starting position is not a running mine");
  read("toggleSitePower()");
  assert(read("state.power") === false && read("state.manualStop") === true && read("operating()") === false, "the stop did not stop the mine");
  assert(read("nodeHostPowered()") === false, "the laptop's node kept running with the site stopped");
  const mined = read("state.mined"); read("state.billLedger=blankBillLedger();for(let i=0;i<6;i++)tick(true)");
  assert(read("state.mined") === mined, "coins were mined with the site stopped");
  assert(read("state.billLedger.energy") === 0, `electricity accrued with the site stopped: ${read("state.billLedger.energy")}`);
  assert(read("state.billLedger.rent") >= 0 && read("state.billLedger.internet") > 0, "the fixed costs stopped with the machines: the internet line should still be billed");
  read("toggleSitePower()");
  assert(read("state.power") === true && read("state.manualStop") === false && read("operating()") === true, "Start site power did not bring the mine back");
});

rule("a manual stop survives the monthly bill and clearing arrears; a policy lock still keeps the site off", () => {
  const read = makeEval(loadEngine());
  read(`${SITE(`state.time=at("2011-03-20");state.campaignStart=at("2009-02-03");state.cash=5000;state.hardware={laptop:1,cpu:3};state.decommissionedHardware={};state.speed=0;state.storyPause=false;`)}state.lastMonth="2011-03";`);
  read("toggleSitePower()");
  read("for(let i=0;i<20;i++)tick(true)");
  assert(read("new Date(state.time).toISOString().slice(0,7)") === "2011-04", "the test did not cross a month boundary");
  assert(read("state.power") === false && read("operating()") === false, "the monthly bill switched a manually stopped site back on");
  // Arrears cut the grid, the player clears them: a site they stopped stays stopped.
  read("state.debt=40;state.arrearsDue=state.time;state.cash=5000;payDebt()");
  assert(read("state.debt") === 0 && read("state.power") === false, "clearing arrears switched a manually stopped site back on");
  // And what the player did not choose still wins: a policy lock keeps the site off after the bill.
  read("toggleSitePower();state.policyLock='closed';state.power=false;state.manualStop=false");
  assert(read("sitePowerAfterBill()") === false, "a policy lock no longer keeps the site off");
  read("state.policyLock=null");
  assert(read("sitePowerAfterBill()") === true, "a site nobody stopped is not restored after a bill");
});

/* Reported from an exit hook rather than inline, because inline made the gate
   position-dependent: it sat a few lines above the end of the file, and two rules appended
   after it ran, failed, pushed onto `failures` and were never printed. The suite announced
   121 rules passing while one of them was failing every run - a mutant survived purely
   because of where its contract happened to be written. An exit hook cannot be outrun by a
   rule added later, wherever it lands. */
rule("correspondence deduplicates findings and records resolution and recurrence", () => {
  const read=makeEval(loadEngine());
  read(`state.correspondence=[];state.time=100;syncCorrespondence(state,[{id:"hotkey",text:"Missing backup"}]);syncCorrespondence(state,[{id:"hotkey",text:"Missing backup"}]);`);
  assert(read("state.correspondence.length")===1,"repeated finding produced duplicate mail");
  read(`state.time=200;syncCorrespondence(state,[]);`);
  assert(read("state.correspondence[0].resolvedAt")===200,"fixed finding was not marked addressed");
  read(`state.time=300;syncCorrespondence(state,[{id:"hotkey",text:"Missing backup again"}]);`);
  assert(read("state.correspondence.length===1&&state.correspondence[0].resolvedAt===null&&state.correspondence[0].reopenedAt===300"),"returning finding lost its archive or status");
});
rule("correspondence persists without changing money or the random stream", () => {
  const read=makeEval(loadEngine());
  read(`state.started=true;state.walletSetup.done=true;state.correspondence=[];state.custody.hotKeyId="mail-test";state.custody.keys.push({id:"mail-test",hot:true,backup:null});state.wallets.hot=1;`);
  const before=read("JSON.stringify([state.cash,state.wallets,state.rng])");
  read("save()");
  assert(read('state.correspondence.some(m=>m.id==="hotkey")'),"actual hot-key finding did not create a letter");
  assert(read("JSON.stringify([state.cash,state.wallets,state.rng])")===before,"mail changed game economics or randomness");
  const stored=JSON.parse(read("localStorage.getItem(SAVE_KEY)"));
  const reloaded=makeEval(loadEngine(stored));
  assert(reloaded('state.correspondence.some(m=>m.id==="hotkey")'),"letter did not survive a save reload");
});
rule("campaign letters follow reached conditions once and respect mining eras", () => {
  const read=makeEval(loadEngine());
  read(`state=initialState();state.started=true;state.walletSetup.done=true;state.correspondence=[];updateCorrespondence();`);
  assert(read("state.correspondence.length")===0,"a new operation was credited with progress it had not made");
  read(`state.operator.solventMonths=1;updateCorrespondence();state.mode="pool";updateCorrespondence();`);
  assert(read('state.correspondence.some(m=>m.id==="story-paid")&&!state.correspondence.some(m=>m.id==="story-pool")'),"bill progress or pre-pool chronology was wrong");
  read(`state.time=at("2011-01-01");state.wallets.cold=1;state.hardware.avalon=1;updateCorrespondence();`);
  assert(read('state.correspondence.some(m=>m.id==="story-pool")&&state.correspondence.some(m=>m.id==="story-cold")&&!state.correspondence.some(m=>m.id==="story-asic")'),"pool/reserve progress or ASIC chronology was wrong");
  read(`state.time=at("2013-01-29");updateCorrespondence();updateCorrespondence();save();`);
  assert(read('state.correspondence.filter(m=>m.kind==="story").length')===4,"repeated updates duplicated or omitted a campaign letter");
  const stored=JSON.parse(read("localStorage.getItem(SAVE_KEY)"));
  const again=makeEval(loadEngine(stored));again("updateCorrespondence()");
  assert(again('state.correspondence.filter(m=>m.kind==="story").length')===4,"campaign archive did not survive reload intact");
});
process.on("exit", () => {
  if (failures.length) {
    console.error(`Engine behaviour: ${failures.length} of ${checked} rules failed\n`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Engine behaviour passed: ${checked} rules exercised against a live engine - protocol issuance, order-book depth, power contracts, hardware pricing and resale, settlement, and regional trade-offs`);
});
