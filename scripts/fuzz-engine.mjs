/* A fuzzer, not a test suite.
   The behavioural rules check things someone thought to ask. This asks nothing: it drives the
   engine with random operator actions for thousands of days and only insists that the world
   stay describable - no NaN, no negative fleet, no negative wallet, no throw. Every stranding
   bug this project has had was reachable this way, because they all end with a number that
   cannot be true. Seeds are fixed so a failure is reproducible: `node scripts/fuzz-engine.mjs 7`
   replays exactly the run that broke. */
import { loadEngine, makeEval } from './engine-harness.mjs';

const SEEDS = process.argv[2] ? [Number(process.argv[2])] : [1,2,3,4,5,6,7,8,9,10,11,12];
const TICKS = 4000;
/* Over capacity for longer than this, with overdrive off, is a stranding rather than a bad
   week. Longest legitimate episode seen across 200 seeds was 4 days; the strandings ran 147. */
const STRANDED_DAYS = 60;
const failures = [];

for (const seed of SEEDS) {
  const ev = makeEval(loadEngine());
  const out = JSON.parse(ev(`(()=>{
    state.started=true;state.ended=false;state.endDismissed=true;state.storyPause=false;
    state.cash=5e7;state.power=true;state.time=at("2013-01-10");state.facility="garage";
    /* Every skill, because a locked action is an unfuzzed action. Half of this list gates
       something - multisig gates quorum wallets, salvage changes what retirement returns - and
       a run without them drives the refusal path 80 times and the real one never. This costs
       realism the fuzzer does not need: it is asking whether the engine stays consistent, not
       whether the run was winnable. */
    state.skills=SKILLS.map(k=>k.id);
    /* A configured wallet from the start, with devices and backups in different places. Hardware
       wallets do not exist before 2014, so a run starting in 2013 would otherwise reach the custody
       and places machinery only if it happened to order a device late enough. */
    setCustodyPolicy("2of3");state.custody.keys=[];state.custody.assigned=[];state.custody.devices=[];
    for(let i=0;i<3;i++){const id="k"+(i+1);
      state.custody.keys.push({id,label:"K"+(i+1),seed:"s"+(i+1),bornOn:state.time,deviceUid:"d"+(i+1),stateless:false,weakEntropy:false,
        backup:{product:"steelplate",durability:i===1?"steel":"paper",at:state.time,place:["site","bank","home"][i]}});
      state.custody.devices.push({uid:"d"+(i+1),product:"trezorone",supplier:"trezor",boughtAt:state.time,keyId:id,place:["site","site","home"][i]});
      state.custody.assigned.push(id)}
    state.custody.devices.push({uid:"d4",product:"trezorone",supplier:"trezor",boughtAt:state.time,keyId:null,place:"site"});
    state.custody.configBackedUp=true;state.custody.configPlace="site";state.custody.seq=7;
    state.wallets.hot=20;state.wallets.cold=80;
    // The online wallet has a key of its own: a run from the ceremony has one, and its fate is separate from the quorum.
    createHotWallet({keyHex:"0123456789abcdef"});
    /* The engine keeps its OWN random stream - faults, events, weather, market noise - and
       initialState() seeds it from Math.random(). Seeding only the action chooser made a run
       half-reproducible: the same actions every time, a different world each time. A failing
       seed then passed on replay, which is worse than no replay at all, because it reads as a
       flake and gets ignored. Both streams are seeded here, so a seed is the whole run. */
    state.seed=${seed}>>>0;state.rng=${seed}>>>0;
    let s=${seed}>>>0;const rnd=()=>((s=(s*1664525+1013904223)>>>0)/4294967296);
    const pick=a=>a[Math.floor(rnd()*a.length)];
    const ids=HARDWARE.map(h=>h.id),fac=FACILITIES.map(f=>f.id);
    const bad=[];const seen=new Set();
    function scan(o,path,d){if(d>4||o==null)return;
      if(typeof o==="number"){if(!Number.isFinite(o))bad.push(path+"="+o);return}
      if(typeof o!=="object")return;if(seen.has(o))return;seen.add(o);
      for(const k of Object.keys(o))scan(o[k],path+"."+k,d+1)}
    const acts=[
      ()=>buyHardware(pick(ids),1+Math.floor(rnd()*50)),
      /* A deliberately oversized order. Buying within capacity is the common case and the one
         the small order above covers; buying PAST it is what leaves crates standing on the
         floor waiting for room, and crates on the floor are the precondition for the worst bug
         this project has had. Without an action that can overshoot, the fuzzer never reaches
         the state - 60 seeds failed to catch a reintroduced stranding for exactly this reason. */
      ()=>buyHardware(pick(ids),50+Math.floor(rnd()*400)),
      ()=>decommissionHardware(pick(ids),1+Math.floor(rnd()*30)),
      ()=>sellHardware(pick(ids),1+Math.floor(rnd()*30)),
      ()=>setHardwarePower(pick(ids),rnd()<.5,1+Math.floor(rnd()*20)),
      ()=>upgradeFacility(pick(fac)),
      ()=>transfer(pick(["hot","cold","exchange"]),pick(["hot","cold","exchange"]),rnd()),
      ()=>{state.overdrive=!state.overdrive},
      /* The rest of the operation, because a fuzzer only finds bugs in what it actually drives.
         Cooling, staff, custody, parts and the market all mutate the same state the floor reads. */
      ()=>buyCooling(pick(COOLING_EQUIPMENT.map(c=>c.id))),
      ()=>sellCooling(pick(COOLING_EQUIPMENT.map(c=>c.id))),
      ()=>hireStaff(pick(STAFF.map(r=>r.id))),
      ()=>setCustodyPolicy(pick(["single","2of3","3of5"])),
      ()=>dismissStaff(pick(STAFF.map(r=>r.id))),
      ()=>orderParts(pick(Object.keys(state.maintenance.inventory)),1+Math.floor(rnd()*20)),
      ()=>serviceHardware(pick(ids)),
      ()=>setHardwarePower(pick(ids),true,1+Math.floor(rnd()*20)),
      ()=>setContract(pick(["spot","standard","fixed"])),
      ()=>setPayoutThreshold(pick(PAYOUT_THRESHOLDS)),
      ()=>setPayoutDestination(pick(["hot","cold","exchange"])),
      ()=>buyBtc(pick(["hot","cold","exchange"]),rnd()*0.4),
      ()=>sellBtc(pick(["hot","cold","exchange"]),rnd()*0.4),
      ()=>toggleInsurance(),
      ()=>orderCustodyProduct(pick(CUSTODY_PRODUCTS.map(c=>c.id)),1+Math.floor(rnd()*2)),
      ()=>{const k=(state.custody&&state.custody.keys)||[];if(k.length)assignCustodyKey(pick(k).id)},
      /* Spending from the reserve: the coin count, the fee and the in-flight accounting all move here. */
      ()=>transfer(pick(["hot","cold"]),pick(["hot","cold","exchange"]),.05+rnd()*.95),
      ()=>{if(state.pendingSettlement)fetchReserve(rnd()<.5)},
      // Give the place actions something to act on: a key on every device, a paper backup on every key, and the descriptor.
      ()=>{const d=((state.custody&&state.custody.devices)||[]).filter(x=>!x.destroyed&&!x.keyId);if(d.length)generateCustodyKey(pick(d).uid)},
      ()=>{const k=((state.custody&&state.custody.keys)||[]).filter(x=>!x.backup||x.backup.destroyed);if(k.length)backupCustodyKey(pick(k).id,"paperbackup")},
      ()=>backupCustodyConfig(),
      // Borrowing against the coins, repaying, adding collateral, and paying a bill with it.
      ()=>borrowSecured(pick(["collaborative","pledge"]),.1+rnd()*.9),
      ()=>repaySecuredLoan(pick([.25,.5,1])),
      ()=>addSecuredCollateral(.1+rnd()*.5),
      ()=>{if(state.pendingSettlement)borrowForSettlement(pick(["collaborative","pledge"]))},
      ()=>toggleCoinCover(),
      ()=>commissionCustodyAudit(),
      // People: who holds a key, who leaves, and replacing a key onto a spare signer.
      ()=>{const k=((state.custody&&state.custody.keys)||[]).filter(x=>!x.retired);if(k.length)setKeyHolder(pick(k).id,pick(CUSTODY_HOLDERS))},
      ()=>{const c=state.custody||{},spare=(c.devices||[]).filter(d=>!d.destroyed&&!d.keyId&&d.place!=="transit");if(spare.length&&c.assigned.length)rotateCustodyKey(pick(c.assigned),pick(spare).uid,rnd()<.3)},
      /* Places: where things are kept, journeys, copies of the descriptor, and what a fire or a thief does. */
      ()=>{const d=(state.custody&&state.custody.devices)||[];if(d.length)moveCustodyItem("device",pick(d).uid,pick(["site","home","bank","trusted"]))},
      ()=>{const k=((state.custody&&state.custody.keys)||[]).filter(x=>x.backup);if(k.length)moveCustodyItem("backup",pick(k).id,pick(["site","home","bank","trusted"]))},
      ()=>moveCustodyItem("configcopy","config",pick(["site","home","bank","trusted"])),
      ()=>applyPlaceIncident(pick(["site","home","bank","trusted"]),pick(["fire","flood","burglary","seizure"]),state.time,true),
      // The first key: written down, lost to a dead disk, taken by a thief, and the monthly roll.
      ()=>{const k=hotKey();if(k&&!k.backup)backupCustodyKey(k.id,"paperbackup")},
      ()=>hotKeyLost(pick(["disk","fire","flood"]),state.time,true),
      ()=>hotKeyStolen(pick(["burglary","seizure"]),state.time,true),
      ()=>advanceHotKeyRisk(state.time+rnd()*400*DAY,true),
      // A retired key's signer wiped, and a ban that can open a bank box.
      ()=>{const k=((state.custody&&state.custody.keys)||[]).filter(x=>x.retired);if(k.length)wipeCustodySigner(pick(k).id)},
      ()=>custodyOnRegionalBan("china",true),
      ()=>{const c=state.custody||{},spare=(c.devices||[]).filter(d=>!d.destroyed&&!d.keyId),dead=(c.keys||[]).filter(k=>!custodyKeyLive(k)&&custodyKeyRestorable(k));if(spare.length&&dead.length)restoreCustodyKey(pick(spare).uid,pick(dead).id)},
    ];
    /* Over capacity is not automatically wrong, and the first version of this check did not
       know that. Overdrive deliberately pushes draw past the cap - the operator's decision to
       make - and cooling demand rises with heat, so a site can sit over its cap for a few days,
       say so plainly through siteStopReason(), and come back on its own. That is the simulation
       working. What is never right is over capacity that does not end: the strandings this
       found ran 147 days of 150 and would have run forever, because the fleet could not be sold
       fast enough to climb out. Duration is what separates them, so the threshold is set well
       above the longest legitimate episode observed across 200 seeds (4 days) rather than at
       the first day of trouble. A detector that cries at normal play gets switched off. */
    let ticks=0,err=null,negHw=null,negWallet=null,overCap=null,run=0,spaceRun=0,badPower=null;
    try{
      for(let i=0;i<${TICKS};i++){
        if(rnd()<.35)acts[Math.floor(rnd()*acts.length)]();
        tick(true);ticks++;
        const ff=fleet(),site=FACILITIES.find(x=>x.id===state.facility)||{};
        /* Two different questions, because power and floor space fail differently.
           POWER is a load: cooling demand rises with heat, overdrive lifts the ceiling on
           purpose, and a site can sit over its cap for days, say so through siteStopReason()
           and come back on its own. Only a breach that never ends is a stranding.
           FLOOR SPACE is not a load. Racks do not get bigger when it is warm. More machines
           standing on the floor than the floor holds means they were bolted in somewhere they
           could never fit, which is always a bug and never recovers by itself - so it needs no
           patience at all. Keeping these apart is what lets the check be strict where it can
           be and quiet where it must be. */
        if(ff.space>site.space&&!state.facilityUpgradeJob){
          if(++spaceRun>3&&!overCap)overCap=spaceRun+" days with "+ff.space+
            " floor units standing in a site that holds "+site.space;
        }else spaceRun=0;
        if(!ff.within&&!state.overdrive){
          if(++run>${STRANDED_DAYS}&&!overCap)overCap=run+" days at "+ff.potentialKw.toFixed(1)+" kW into "+
            ff.cap.toFixed(1)+" kW, overdrive off, never recovered";
        }else run=0;
        if(i%20===0){
          seen.clear();scan(state,"state",0);
          for(const k of Object.keys(state.hardware||{}))
            if(!(state.hardware[k]>=0)&&!negHw)negHw=k+"="+state.hardware[k];
          for(const k of Object.keys(state.wallets||{}))
            if(!(state.wallets[k]>=-1e-9)&&!negWallet)negWallet=k+"="+state.wallets[k];
          // A loan against coins is a sum owed against coins held, and neither can be negative or unreal.
          {const l=state.securedLoan;if(l&&!negWallet&&!(Number.isFinite(l.principal)&&l.principal>=0&&Number.isFinite(l.pledged)&&l.pledged>=-1e-9))negWallet="loan="+JSON.stringify([l.principal,l.pledged])}
          // A count of coins is a whole number that cannot go below zero, whatever was spent or received.
          for(const k of ["hot","cold"]){const u=state.utxo&&state.utxo[k];
            if(u!==undefined&&!(Number.isInteger(u)&&u>=0)&&!negWallet)negWallet="coins."+k+"="+u}
          /* Machines deliberately stopped are a subset of machines owned, always. Breaking the
             clamp in setHardwarePower drives this negative, and a negative paused count does
             not read as an error anywhere - it inflates the active count instead, so the site
             reports hash rate from machines that are not there. An invariant catches it; the
             number it produces never looks wrong on its own. */
          for(const k of Object.keys(state.poweredDownHardware||{})){
            const off=state.poweredDownHardware[k],owned=state.hardware[k]||0;
            if(!badPower&&!(off>=0&&off<=owned))badPower=k+": "+off+" stopped of "+owned+" owned";
          }
          if(bad.length>4)break;
        }
      }
    }catch(e){err=String(e&&e.message||e).slice(0,220)}
    return JSON.stringify({ticks,err,nonFinite:bad.slice(0,5),negHw,negWallet,overCap,badPower,
      date:dateFmt(state.time,true)})})()`));
  const why = out.err ? `threw: ${out.err}`
    : out.nonFinite.length ? `non-finite state: ${out.nonFinite.join(", ")}`
    : out.negHw ? `negative fleet: ${out.negHw}`
    : out.negWallet ? `negative wallet: ${out.negWallet}`
    : out.badPower ? `paused count outside 0..owned: ${out.badPower}`
    : out.overCap ? `site over capacity: ${out.overCap}` : "";
  if (why) failures.push(`seed ${seed} (${out.ticks} ticks, reached ${out.date}) - ${why}`);
}

if (failures.length) {
  console.error("Fuzz failures:\n  " + failures.join("\n  "));
  console.error("\nReplay one with: node scripts/fuzz-engine.mjs <seed> - the seed fixes both the\naction sequence and the engine's own random stream, so the run repeats exactly.");
  process.exit(1);
}
console.log(`Fuzz passed: ${SEEDS.length} seeds × ${TICKS} days of random operator actions - no throw, no non-finite state, no negative fleet or wallet, no site carrying more than it can hold, no impossible paused count`);
