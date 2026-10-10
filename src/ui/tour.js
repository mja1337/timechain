"use strict";

/* THE TUTORIAL - ten short steps, each one thing to do in the real game, with the clock held.

   The first version of this was a guided walk: it opened every room in turn, rang the part that mattered and
   said what it was for. Nobody had to do anything, so nothing stuck, and a player could finish it with a key
   on one disk, no backup and no cold storage, which is exactly how the early custody losses happened. This one
   is a coach with a checklist. Each card asks for one action, points at the button that does it, and moves on
   by itself when the game's own state says it has been done.

   By the last card the wallet is set up end to end: the online wallet's key is backed up, a signer is
   delivered, checked and holding a reserve key, that key is written down and assigned to the reserve wallet,
   both paper copies are on their way out of the building, and the player has chosen where income lands.

   NEVER STUCK. The player can never be on a step that following its card cannot finish. Four rules make that true,
   and check-ui-contracts plays thousands of randomly interfered runs to hold the tutorial to them:

   1. Every step's next action is computed from the game's state, every time (tourNextAction). The card names it
      and carries a button that does it (tour-do), so the action is there even if its control on the page is
      scrolled away, collapsed or on another tab; the control on the page is ringed when it can be found. A step
      whose next move is to wait (a delivery, a signer coming back from a deposit box) runs the clock by itself
      and stops it when the wait is over.
   2. The tutorial is always on the FIRST step that is not done. Doing things early passes steps over; undoing
      something (a key unassigned, a backup brought home, the wallet's rule changed, income sent elsewhere) takes
      the card back to the step that is now open, and says what changed. Back is free to look at done steps.
   3. Money. The signer is the only thing the tutorial needs to buy. When it begins, it sets the signer's price
      aside from cash (state.tour.escrow, shown in the top bar) so nothing bought along the way can spend it, and
      the signer order draws on it. Nothing is gifted: the money is the player's, held and then spent on the
      signer, or handed back if the tutorial is skipped. Every new run starts with at least $1,500 and the dearest
      signer the tutorial picks costs $175, so a new run can always afford it. The signer is the cheapest one on sale
      that arrives before the recorded data ends (the Basic PC exists from the Genesis Block, so there always is one).
      What is left - a signer arriving after the end, a signer lost before its key with cash short, a replay begun
      with too little - is handled silently by tourEnsureSigner, so the tutorial never stops short.
   4. Interruptions. A bill, a loss or a historical chapter takes the screen; the card waits behind it and nothing
      moves until it is closed. The tutorial ends unfinished only when the player skips it or the run itself ends
      (receivership, bankruptcy, the end of the record), with the hold handed back.

   THE CLOCK. Held for the whole tutorial except while a step is waiting for something to arrive, and on the last
   step, which is pressing play. Nothing here draws from the shared random stream, so a run that takes the
   tutorial has the same history as one that skips it, given the same days played.

   SAVES. The step is kept in state.tour by id, so a reload lands on the same card. A save from before any tour
   existed is treated as having had it, and a save that was part-way through the old room-by-room tour starts
   this one from the top; steps that are already done are passed over. It can be replayed from the footer. */

const TOUR_VERSION=2,TOUR_WAIT_SPEED=2;
function tourColdKeys(s=state){return ((s.custody&&s.custody.keys)||[]).filter(k=>!k.hot&&!k.retired)}
function tourSigners(s=state){return ((s.custody&&s.custody.devices)||[]).filter(d=>!d.destroyed&&custodyProduct(d.product)?.kind==="signer")}
/* Something on its way counts only if it arrives before time runs out: the end of the record, or of the sandbox. */
function tourArrives(due,s=state){return due<(s.sandbox?SANDBOX_END:END)}
function tourSignerOrders(s=state){return ((s.custody&&s.custody.orders)||[]).filter(o=>custodyProduct(o.id)?.kind==="signer"&&tourArrives(o.due,s))}
function tourSignerOrdered(s=state){return tourSignerOrders(s).length>0}
/* A signer the tutorial can use: here, or on its way back in time to use it. */
function tourSignerInTime(d,s=state){
  if(d.place!=="transit")return true;
  const m=((s.custody&&s.custody.moves)||[]).find(x=>x.kind==="device"&&x.id===d.uid);
  return !!m&&tourArrives(m.due,s);
}
function tourHasSigner(s=state){return tourSigners(s).some(d=>tourSignerInTime(d,s))}
/* The signer the tutorial asks for: the cheapest on sale that arrives before the recorded data runs out (always the
   case in the sandbox), else the quickest. The Basic PC is on sale from the Genesis Block, so there is always one. */
function tourCheapestSigner(){
  const sale=CUSTODY_PRODUCTS.filter(p=>p.kind==="signer"&&!p.build&&custodyProductAvailable(p)&&!custodyOnceBlocked(p));
  const arrives=p=>tourArrives(state.time+custodyLeadDays(p)*DAY);
  const pick=sale.filter(arrives).sort((a,b)=>custodyUnitCost(a)-custodyUnitCost(b)||custodyLeadDays(a)-custodyLeadDays(b))[0];
  return pick||sale.sort((a,b)=>custodyLeadDays(a)-custodyLeadDays(b))[0]||null;
}
function tourBacked(k){return !!k&&!!k.backup&&!k.backup.destroyed}
/* A backup counts as away from the mine once it has left, even while it is still travelling. */
function tourAway(k,s=state){return tourBacked(k)&&!!k.backup.place&&(k.backup.place==="transit"||custodyPlaceId(k.backup.place,s)!=="site")}
/* The paper copies that still share the mine's fate: the online wallet's and every key in charge of the reserve. */
function tourBackupsAtMine(s=state){
  const hot=typeof hotKey==="function"?hotKey(s):null;
  return [hot,...custodyAssignedKeys(s)].filter(k=>tourBacked(k)&&!tourAway(k,s));
}
function tourUsable(d){return !d.destroyed&&!d.restoring&&d.place!=="transit"}
function tourMovePending(kind,id,s=state){return ((s.custody&&s.custody.moves)||[]).some(m=>m.kind===kind&&m.id===id)}

/* ---- the signer's money --------------------------------------------------------------- */
function tourEscrow(s=state){return Math.max(0,Number(s.tour&&s.tour.escrow)||0)}
function tourNeedsSigner(s=state){return !tourHasSigner(s)&&!tourColdKeys(s).length&&!tourSignerOrdered(s)}
/* True if a signer ordered now would arrive before time runs out. */
function tourSignerCanArrive(){const p=tourCheapestSigner();return !!p&&tourArrives(state.time+custodyLeadDays(p)*DAY)}
function tourSignerCost(){const p=tourCheapestSigner();return p?custodyUnitCost(p):0}
/* Hold the signer's price aside while the tutorial still has to buy one. False if cash cannot cover it. */
function tourReserve(){
  const t=state.tour;if(!tourNeedsSigner())return true;
  const short=tourSignerCost()-tourEscrow();if(short<=0)return true;
  if(!(state.cash>=short))return false;
  state.cash-=short;t.escrow=tourEscrow()+short;return true;
}
/* NEVER SHORT OF A SIGNER, NEVER STOPPED. Two things could still leave the signer step with no way on: the player's own
   signer (or its order) arriving after the recorded history ends, and a signer lost before it made a key with too little
   cash left to replace it (or a replay begun with too little). The tutorial handles both silently and carries on.
   - Late: the player's own signer, or the signer they ordered, arrives now instead of after the end. Nothing is added.
   - Short: the tutorial puts a Basic PC-class signer on the floor at no cost. Only while the tutorial is running, only on
     its signer step (no usable signer, no reserve key, nothing on order that arrives in time), and only when cash plus
     the hold cannot buy one; a signer cannot be sold, so it carries no value beyond the key it will hold. */
function tourHurrySigner(){
  const c=state.custody;let moved=false;
  for(const m of custodyMoves().slice()){
    const d=m.kind==="device"&&tourSigners().find(x=>x.uid===m.id);
    if(d){d.place=m.to;c.moves=custodyMoves().filter(x=>x!==m);moved=true}
  }
  for(const o of c.orders.slice()){
    if(custodyProduct(o.id)?.kind!=="signer")continue;
    receiveCustodyOrder({...o,qty:1,boughtAt:o.due-custodyLeadDays(custodyProduct(o.id))*DAY},state.time);
    if(o.qty>1)o.qty--;else c.orders=c.orders.filter(x=>x!==o);
    moved=true;break;
  }
  return moved;
}
function tourProvideSigner(){
  const p=tourCheapestSigner()||custodyProduct("beigepc");if(!p)return false;
  tourRefund();
  receiveCustodyOrder({id:p.id,qty:1,supplier:p.supplier,boughtAt:state.time},state.time);
  const d=state.custody.devices[state.custody.devices.length-1];if(d)d.tourProvided=true;
  state.tour.provided=(state.tour.provided|0)+1;
  return true;
}
/* Called on every check while the tutorial still needs a signer. */
function tourEnsureSigner(){
  if(!tourNeedsSigner())return;
  if(tourHurrySigner()&&!tourNeedsSigner())return;
  if(tourNeedsSigner()&&!tourReserve())tourProvideSigner();
}
function tourRefund(){const e=tourEscrow();if(e>0){state.cash+=e;state.tour.escrow=0}}
/* Called by orderCustodyProduct before it checks cash: the hold exists for exactly this purchase. */
function tourReleaseFor(p,qty=1){
  if(!p||p.kind!=="signer")return;const e=tourEscrow();if(e<=0)return;
  if(state.cash+e<custodyUnitCost(p)*qty)return;
  state.cash+=e;state.tour.escrow=0;
}

/* ---- next actions ---------------------------------------------------------------------- */
/* An action is {label, hint, run} for something to press, or {wait, hint} for something on its way. `ring` lists the
   controls on the page that do the same thing, rung when one is on screen. */
const TOUR_PAPER='[data-action="custody-backup"][data-value="paperbackup"]';
function tourBackupAction(k,where){
  return {label:"Write it on paper · free",hint:`Write <b>${k.hot?"your online wallet's key":`key ${k.label}`}</b> down on paper${where?` ${where}`:""}.`,
    ring:[k.hot?`.hot-wallet ${TOUR_PAPER}`:`.cold-setup li.current ${TOUR_PAPER}`,`.custody-workshop ${TOUR_PAPER}`,k.hot?".hot-wallet":".cold-setup"],
    run:()=>backupCustodyKey(k.id,"paperbackup")};
}
function tourWaitForMove(kind,id,what){
  const m=((state.custody&&state.custody.moves)||[]).find(x=>x.kind===kind&&x.id===id);
  return {wait:true,hint:`${what} is on its way to ${custodyPlaceName(m?m.to:"site")}${m?` and arrives on ${dateFmt(m.due,true)}`:""}. <b>The clock runs by itself</b> until it does.`,ring:[".custody-places",".cold-setup"]};
}
function tourWorkshopAction(d){
  const name=custodyProduct(d.product)?.name||"the signer";
  if(!d.inspected)return {label:"Inspect delivery and source",hint:`Check where <b>${name}</b> came from: press <b>Inspect delivery and source</b>.`,
    ring:['.custody-workshop [data-action="workshop-inspect"]','.cold-setup li.current [data-action="workshop-focus"]',".custody-workshop"],run:()=>inspectWorkshopDevice(d.uid)};
  if(d.chainSource==="own"&&typeof nodeOnline==="function"&&!nodeOnline())return {label:"Use the provider's chain data",hint:`${name} is set to check payments against your own node, which is offline. Switch it to the provider's chain data (you can change it back once the node is up).`,
    ring:[".custody-workshop"],run:()=>setWorkshopClient(d.uid,"chainSource","provider")};
  return {label:"Record software and checks",hint:`Record the software that will show you each payment: press <b>Record software and payment-review checks</b>.`,
    ring:['.custody-workshop [data-action="workshop-prepare"]','.cold-setup li.current [data-action="workshop-focus"]',".custody-workshop"],run:()=>prepareWorkshopDevice(d.uid)};
}
function tourPrepareAction(){
  const signers=tourSigners(),d=signers.find(x=>tourUsable(x)&&!workshopPrepared(x));
  if(d)return tourWorkshopAction(d);
  const away=signers.find(x=>x.place==="transit"&&tourSignerInTime(x));
  if(away)return tourWaitForMove("device",away.uid,custodyProduct(away.product)?.name||"Your signer");
  return null;
}
function tourKeyAction(){
  const loose=tourColdKeys().find(k=>!tourBacked(k));
  if(loose)return tourBackupAction(loose);
  const free=tourSigners().find(d=>tourUsable(d)&&!d.keyId&&workshopPrepared(d));
  if(free)return {label:"Generate a key",hint:`Create the reserve key on <b>${custodyProduct(free.product)?.name||"the signer"}</b>: press <b>Generate a key</b>.`,
    ring:['.cold-setup li.current [data-action="custody-genkey"]','.custody-workshop [data-action="custody-genkey"]',".cold-setup"],run:()=>generateCustodyKey(free.uid)};
  const stale=tourSigners().find(d=>tourUsable(d)&&d.keyId&&custodyKey(d.keyId)?.retired&&workshopPrepared(d));
  if(stale)return {label:"Wipe the retired key",hint:"This signer still holds a retired key. Wipe it so it can hold the new reserve key.",ring:[".custody-workshop",".cold-setup"],run:()=>wipeCustodySigner(stale.keyId)};
  return tourPrepareAction();
}
function tourAssignAction(){
  const set=custodySetup(),c=state.custody;
  const loose=set.assigned.find(k=>!tourBacked(k));
  if(loose)return tourBackupAction(loose,"before it is trusted with the reserve");
  if(set.ready)return null;
  const seeds=new Set(set.assigned.map(k=>k.seed||k.id));
  const spare=tourColdKeys().filter(k=>tourBacked(k)&&!c.assigned.includes(k.id)&&!seeds.has(k.seed||k.id));
  if(set.policy.keys>1&&spare.length<set.policy.keys-set.distinct)
    return {label:"Switch to single signature",hint:`The reserve wallet is set to <b>${set.policy.name}</b>, which needs ${set.policy.keys} keys, and ${spare.length+set.distinct===1?"there is one":`there are ${spare.length+set.distinct}`}. Start with a single signature; you can move to multisig once you have the keys.`,
      ring:['[data-action="custody-policy"][data-value="single"]',".cold-setup"],run:()=>setCustodyPolicy("single")};
  const k=spare[0];if(!k)return tourKeyAction();
  return {label:"Assign to wallet",hint:`Put key <b>${k.label}</b> in charge of the reserve: press <b>Assign to wallet</b>.`,
    ring:['.cold-setup li.current [data-action="custody-assign"]','.custody-workshop [data-action="custody-assign"]',".cold-setup"],run:()=>assignCustodyKey(k.id)};
}
/* Bank box when a year of its fee is in cash; otherwise the free trusted house, so a move never waits on money. */
function tourMoveAction(){
  const k=tourBackupsAtMine()[0];if(!k)return null;
  const to=state.cash>=custodyPlace("bank").fee*12?"bank":"trusted",name=custodyPlace(to).name;
  return {label:`Send it to ${to==="bank"?"the bank box":"a trusted house"}`,hint:`Move <b>${k.hot?"your online wallet's backup":`key ${k.label}'s backup`}</b> out of the mine: press <b>→ ${name}</b> beside it in <b>Where things are kept</b> (or the other place, if you prefer). ${tourBackupsAtMine().length} still at the mine.`,
    ring:[tourMoveRow,".cold-setup"],run:()=>moveCustodyItem("backup",k.id,to)};
}

function tourSpeedButton(){return tourVisible('.topbar .speed[data-value="1"]')||tourVisible(".mobile-pause-button")||tourVisible('.speed[data-value="1"]')}
/* Re-resolved on every refresh: the first backup still at the mine whose move button is on screen. */
function tourMoveRow(){
  for(const k of tourBackupsAtMine()){
    const b=tourVisible(`[data-action="custody-move"][data-kind="backup"][data-id="${k.id}"]`);
    if(b)return b.closest(".incoming-fleet-row")||b;
  }
  return null;
}

const TOUR_STEPS=[
  {id:"welcome",center:true,chapter:"Tutorial",title:"Finish setting up, one step at a time",
    body:"Your wallet has a key. In the next few minutes you will back it up, build a cold-storage reserve beside it, choose where your income lands and start mining. Each card asks for <b>one thing</b>, points at the button that does it, and moves on by itself once it is done. <b>The clock is held</b> until the last step, apart from the days a delivery takes."},
  {id:"walletkey",chapter:"Your wallet",tab:"custody",target:[".hot-wallet"],title:"Make your wallet's key",
    body:"A block reward is paid to an address, and an address comes from a key. You made that key in the opening ceremony: it is the key behind your <b>online wallet</b>.",
    act:()=>null,done:s=>!!s.walletSetup&&!!s.walletSetup.done},
  {id:"hotbackup",chapter:"Your wallet",tab:"custody",target:[`.hot-wallet ${TOUR_PAPER}`,".hot-wallet"],title:"Write the key down",
    body:"The ceremony sheet is destroyed, so that key now lives on one computer: the one in the mine. If its disk dies, the coins in it go with it. A copy on paper is free, and turns a dead disk into an afternoon's work.",
    again:"Your online wallet's paper backup is gone, so it needs writing down again.",
    act:()=>{const k=hotKey();return k&&!hotKeyBackedUp()?tourBackupAction(k):null},
    done:s=>typeof hotKey!=="function"||!hotKey(s)||hotKeyBackedUp(s)},
  {id:"signer",chapter:"Cold storage",tab:"custody",target:['.cold-setup li.current [data-action="custody-buy"]',".cold-setup"],title:"Get a signer",
    body:"Cold storage is a key that never touches the mining computer, so it needs a device of its own. Before hardware wallets that means a cheap computer that never goes online.",
    again:"There is no signer any more (or none that can be back in time), so the reserve needs one again.",
    act:()=>{
      const o=tourSignerOrders()[0];
      if(o)return {wait:true,hint:`${custodyProduct(o.id)?.name||"Your signer"} arrives on ${dateFmt(o.due,true)}. <b>The clock runs by itself</b> until it does, then stops.`,ring:[tourSpeedButton,".cold-setup"]};
      const p=tourCheapestSigner();if(!p)return null;const cost=custodyUnitCost(p),held=tourEscrow();
      return {label:`Order ${p.name} · ${cost>0?fmtUsd(cost):"free"}`,hint:`Order a <b>${p.name}</b> (${cost>0?fmtUsd(cost):"free"}, ${custodyLeadDays(p)} day${custodyLeadDays(p)===1?"":"s"} to arrive).${held>0?` The tutorial set ${fmtUsd(held)} of your cash aside for it, so it is covered.`:""}`,
        ring:[`.cold-setup li.current [data-action="custody-buy"][data-id="${p.id}"]`,'.cold-setup li.current [data-action="custody-buy"]',".cold-setup"],run:()=>orderCustodyProduct(p.id)};
    },
    pauseWhenDone:true,done:s=>tourHasSigner(s)||tourColdKeys(s).length>0},
  {id:"prepare",chapter:"Cold storage",tab:"custody",target:[".custody-workshop",".cold-setup"],title:"Check it and prepare its software",
    body:"A parcel is not proof. Check where it came from, then record the software that will show you each payment before you sign it. Neither step makes a key.",
    again:"No signer is checked and prepared any more.",
    act:tourPrepareAction,done:s=>tourSigners(s).some(d=>workshopPrepared(d))||tourColdKeys(s).length>0},
  {id:"reservekey",chapter:"Cold storage",tab:"custody",target:[".cold-setup"],title:"Make a reserve key and write it down",
    body:"Create the secret on the signer, then copy it onto paper. The device can fail; the paper copy is how the key comes back. Anyone who reads it can spend with it, so it is kept private.",
    again:"No reserve key is written down any more.",
    // One reserve key written down is the goal; extra keys made on extra signers are the player's own business.
    act:tourKeyAction,done:s=>tourColdKeys(s).some(tourBacked)},
  {id:"assign",chapter:"Cold storage",tab:"custody",target:[".cold-setup"],title:"Put the key in charge of the reserve",
    body:"A key protects nothing until the reserve wallet's spending rule names it. One key, one signature: simple to use, and the right place to start.",
    again:"The reserve wallet is no longer ready: a key in charge of it changed, or its rule did.",
    act:tourAssignAction,done:s=>custodySetup(s).ready&&custodyAssignedKeys(s).every(tourBacked)},
  {id:"offsite",chapter:"Keep it safe",tab:"custody",target:[tourMoveRow,".cold-setup"],title:"Keep the backups away from the mine",
    body:"The paper copies are in the same building as the computer and the signer, so one fire takes the lot. Send each to a <b>bank deposit box</b> (safest, $15 a month) or <b>a trusted person's house</b> (free, with a very small chance they help themselves).",
    again:"A backup is back at the mine.",
    act:tourMoveAction,done:s=>tourBackupsAtMine(s).length===0},
  {id:"payout",chapter:"Mining",tab:"pools",target:['[data-action="payout-destination"][data-value="cold"]',".payout-destinations"],title:"Choose where mining income lands",
    body:"Every coin you mine is paid to an address you choose. <b>Cold storage</b> is the safest place and takes days to spend from; the <b>online wallet</b> can pay a bill this afternoon and is reachable by anyone who reaches the computer.",
    again:"Mining income is no longer going where you chose.",
    keep:true,
    act:()=>payoutDestinationBlockReason("cold")?{label:"Keep it in the online wallet",hint:"Cold storage cannot receive yet, so keep income in the online wallet for now.",ring:[".payout-destinations"],run:()=>{state.tour.payoutKept=true}}
      :{label:"Send income to cold storage",hint:`${state.time<MARKET?"Before July 2010 there is no market, so mined coins cannot pay a bill yet and cold storage costs you nothing. ":""}Press <b>Send income here</b> under Cold storage, or keep it online with the button below.`,
        ring:['[data-action="payout-destination"][data-value="cold"]',".payout-destinations"],run:()=>setPayoutDestination("cold")},
    done:s=>poolAccount().destination==="cold"||!!(s.tour&&s.tour.payoutKept)},
  {id:"start",finish:true,chapter:"Mining",tab:"mine",target:[tourSpeedButton,".topbar"],title:"Start mining",
    body:"Your laptop is on the floor and switched on. More hash means a better chance of a reward, and a bigger power bill. Your first job is small: <b>keep it mining and pay the first bill</b>. The Dashboard briefing says what to do next.",
    act:()=>({label:"Start the clock · 1×",hint:"Press <b>1×</b> to start the clock. The tutorial ends, and you can replay it from the footer.",ring:[tourSpeedButton,".topbar"],
      run:()=>{state.speed=1;state.returnSpeed=1;state.lastReal=Date.now();setTimer()}}),
    done:s=>s.speed>0}
];

let tourScrolledByPlayer=false,tourCardSignature="",tourSettleUntil=0;
function normalizeTourState(s){
  // A save from before the tour is treated as having done it.
  if(!s.tour||typeof s.tour!=="object")s.tour={active:false,done:true,step:0,resumeSpeed:0};
  const t=s.tour;
  if(t.v!==TOUR_VERSION){
    // Part-way through the old room-by-room tour: start this one from the top; done steps are passed over.
    t.v=TOUR_VERSION;t.step=0;t.id=TOUR_STEPS[0].id;t.arrivedDone=false;
  }
  const at=TOUR_STEPS.findIndex(x=>x.id===t.id);
  t.step=at>=0?at:Math.max(0,Math.min(TOUR_STEPS.length-1,t.step|0));t.id=TOUR_STEPS[t.step].id;
  if(typeof t.resumeSpeed!=="number")t.resumeSpeed=0;
  // A hold that outlived its tutorial goes back to cash.
  if(!t.active&&Number(t.escrow)>0){s.cash=(Number(s.cash)||0)+Number(t.escrow);t.escrow=0}
  return t;
}
function tourState(){return normalizeTourState(state)}
function tourActive(){const t=tourState();return !!t.active&&!!state.started&&!!state.walletSetup&&!!state.walletSetup.done&&!state.ended}
function tourStep(){return TOUR_STEPS[tourState().step]}
function tourDone(step,s=state){return !!step.done&&!!step.done(s)}
/* The step's next action, or null on a step with nothing to do (welcome, or a done step). */
function tourNextAction(step=tourStep()){return step.center||tourDone(step)||!step.act?null:step.act()}
/* Browsing: the player pressed Back onto a step that is done, and is looking at it. */
function tourBrowsing(){const t=tourState(),s=tourStep();return !s.center&&!!t.arrivedDone&&tourDone(s)}
/* Whether the clock may run: while the step waits for something to arrive, and on the last step. */
function tourClockAllowed(){
  if(!tourActive())return false;const s=tourStep();if(s.finish)return true;
  if(tourBrowsing()||s.center)return false;const a=tourNextAction(s);return !!(a&&a.wait);
}
/* Why a replay cannot start now, or "". */
function tourStartRefusal(){
  if(state.ended)return "This run has ended.";
  return "";
}
/* Begin, or begin again. The clock's speed is kept and restored if the tutorial is skipped. */
function beginTour(){
  const why=tourStartRefusal();if(why){showToast("The tutorial cannot start yet",why,"warning");return false}
  const t=tourState();
  t.active=true;t.done=false;t.payoutKept=false;t.lastDone="";t.notice="";t.resumeSpeed=state.speed>0?state.speed:(t.resumeSpeed||0);
  tourReserve();
  state.speed=0;setTimer();
  tourEnsureSigner();
  tourGo(0);return true;
}
function tourBlocked(){
  if(state.pendingSettlement)return "A bill is waiting for a decision. Settle it first.";
  if(typeof pendingLoss==="function"&&pendingLoss())return "A loss is waiting to be read. Read it first.";
  if(state.activeEvent)return "A historical chapter is open. Close it first.";
  return "";
}
/* The first step that is not done, or -1 when everything is. */
function tourFirstOpen(){for(let i=1;i<TOUR_STEPS.length;i++)if(!tourDone(TOUR_STEPS[i]))return i;return -1}
function tourGo(index,openIt=true){
  const t=tourState(),s=TOUR_STEPS[Math.max(0,Math.min(TOUR_STEPS.length-1,index))];
  t.step=TOUR_STEPS.indexOf(s);t.id=s.id;t.arrivedDone=tourDone(s);
  if(s.tab&&openIt){activeTab=openTab(s.tab);mobileMenuOpen=false}
  tourCardSignature="";save();render(false);
}
function endTour(why){
  const t=tourState();
  t.active=false;t.done=true;t.notice="";t.endedWhy=why||"";
  tourRefund();
  // Put the clock back as it was, unless the player never had it running or has just started it.
  if(!state.ended&&state.speed===0&&t.resumeSpeed>0&&!tourBlocked()){state.speed=t.resumeSpeed;state.returnSpeed=t.resumeSpeed}
  state.lastReal=Date.now();setTimer();save();render(false);
  if(why)showToast("Tutorial ended",why,"info");
  window.scrollTo({top:0,behavior:"instant"});
}
function tourForward(){const to=tourFirstOpen();if(to<0)endTour();else tourGo(to)}
function tourAction(a){
  const t=tourState();
  if(a==="tour-start"){beginTour();return}
  if(!tourActive())return;
  const s=tourStep();
  if(a==="tour-next"){if(s.center||tourDone(s))tourForward()}
  else if(a==="tour-back"){if(t.step>0){t.notice="";tourGo(t.step-1)}}
  else if(a==="tour-goto"){if(s.tab){activeTab=openTab(s.tab);mobileMenuOpen=false;tourCardSignature="";render(false)}}
  else if(a==="tour-do"){
    if(tourBlocked())return;
    const act=tourNextAction(s);if(!act||act.wait)return;
    if(s.tab&&!tourOnTab(s)){activeTab=openTab(s.tab);mobileMenuOpen=false}
    act.run();tourCheck();
  }
  else if(a==="tour-keep-hot"){if(s.keep&&!tourDone(s)){t.payoutKept=true;tourCheck()}}
  else if(a==="tour-skip")endTour();
}
/* The game moved on: put the card on the first open step, and run or hold the clock. Called after every full render
   and on a short interval, because the Mine tab repaints only its content and a delivery can land between renders. */
function tourCheck(){
  if(!tourState().active)return;
  if(state.ended){endTour("The run has ended, so the tutorial has too.");return}
  if(!tourActive())return;
  // A bill, a loss or a chapter is on screen: nothing moves and nothing is decided until it is closed.
  if(tourBlocked()){tourRefreshCard();return}
  const t=tourState();
  // A signer arriving too late, or lost with too little cash to replace it, is handled here without a word (tourEnsureSigner).
  tourEnsureSigner();
  const first=tourFirstOpen(),cur=t.step,s=tourStep();
  if(first<0){if(s.finish)t.lastDone=s.title;endTour();return}
  if(cur>first){
    // Something done earlier has come undone: back to it, saying what changed.
    t.notice=TOUR_STEPS[first].again||"";t.lastDone="";tourGo(first);
  } else if(cur<first&&!s.center&&!(t.arrivedDone&&tourDone(s))){
    if(tourDone(s))t.lastDone=s.title;
    t.notice="";
    if(s.pauseWhenDone&&state.speed>0){state.speed=0;setTimer()}
    tourGo(first);
  }
  // The clock: a step that is waiting runs it; anything else holds it.
  if(tourClockAllowed()){
    const step=tourStep(),a=step.finish?null:tourNextAction(step);
    if(a&&a.wait&&state.speed===0){state.speed=TOUR_WAIT_SPEED;state.lastReal=Date.now();setTimer();if(typeof refreshSpeedControls==="function")refreshSpeedControls()}
  } else if(state.speed>0){state.speed=0;setTimer();if(typeof refreshSpeedControls==="function")refreshSpeedControls()}
  tourRefreshCard();
}

/* ---- drawing it ----------------------------------------------------------------------- */

function tourVisible(selector){
  for(const el of document.querySelectorAll(selector))if(el.getClientRects().length&&!el.closest("details:not([open])"))return el;
  return null;
}
function tourFindTarget(step){
  const a=tourNextAction(step);
  for(const c of [...((a&&a.ring)||[]),...(step.target||[])]){
    const el=typeof c==="function"?c():tourVisible(c);
    if(el){
      // A card taller than most of the screen is not something to ring: ring what it is called.
      const h=el.querySelector&&el.classList.contains("card")&&el.getBoundingClientRect().height>window.innerHeight*.9?el.querySelector("h2,h3"):null;
      return h||el;
    }
  }
  return null;
}
function tourOnTab(step){
  if(!step.tab)return true;
  const r=resolveTab(step.tab);
  return activeTab===r.tab&&(!r.section||state.treasurySection===r.section);
}
function tourTabName(step){return {custody:"Custody",pools:"Pools",mine:"Mine"}[step.tab]||step.tab}
function tourCardHtml(){
  const t=tourState(),s=tourStep(),n=t.step,total=TOUR_STEPS.length,first=n===0,done=!s.center&&tourDone(s);
  const pct=Math.round(TOUR_STEPS.filter(x=>x.center||tourDone(x)).length/total*100);
  const dots=TOUR_STEPS.map((x,i)=>`<li class="${i===n?"current":x.center||tourDone(x)?"done":""}" title="${i+1}. ${x.title}"></li>`).join("");
  const a=s.center||done?null:tourNextAction(s);
  const goto=!s.center&&!done&&!tourOnTab(s)?`<button class="action small" data-action="tour-goto">Go to ${tourTabName(s)}</button>`:"";
  const notice=!done&&t.notice?`<div class="tour-notice">↺ ${t.notice}</div>`:"";
  const doing=s.center?"":done?`<div class="tour-do done"><b>✓ Done.</b> ${s.finish?"":"Press Next to carry on."}</div>`:a?`<div class="tour-do"><b>${a.wait?"On its way:":"Do this:"}</b> ${a.hint}</div>`:"";
  const clock=!s.center&&!done?(tourClockAllowed()?`<div class="tour-clock run">${a&&a.wait?"The clock is running until it arrives.":"The clock may run for this step."}</div>`:`<div class="tour-clock">The clock is held while you do this.</div>`):"";
  const doBtn=a&&!a.wait&&a.label?`<button class="action small primary tour-do-btn" data-action="tour-do">${a.label}</button>`:"";
  const keep=s.keep&&!done&&a&&a.label!=="Keep it in the online wallet"?`<button class="action small" data-action="tour-keep-hot">Keep it in the online wallet</button>`:"";
  const actions=first?`<button class="action primary" data-action="tour-next">Start</button><button class="action-link" data-action="tour-skip">Skip tutorial</button>`
    :`${doBtn}${keep}${goto}${done&&!s.finish?`<button class="action small primary" data-action="tour-next">Next</button>`:""}<button class="action small" data-action="tour-back">Back</button><button class="action-link" data-action="tour-skip">Skip tutorial</button>`;
  return `${s.center?`<div class="tour-dim"></div>`:""}<aside class="tour-card${s.center?" tour-center":""}" role="dialog" aria-live="polite" aria-label="Tutorial" data-step="${s.id}">
    <div class="tour-bar"><i style="width:${pct}%"></i></div>
    <div class="tour-kicker">Step ${n+1} of ${total} · ${s.chapter}</div><ol class="tour-dots" aria-hidden="true">${dots}</ol>
    ${t.lastDone&&!first?`<div class="tour-last">✓ ${t.lastDone}</div>`:""}${notice}<h3>${s.title}</h3><p>${s.body}</p>${doing}${clock}
    <div class="tour-actions">${actions}</div></aside>`;
}
function tourSignature(){
  const s=tourStep();
  const a=s.center||tourDone(s)?null:tourNextAction(s);
  return [s.id,tourDone(s),tourOnTab(s),tourClockAllowed(),a?(a.label||"")+a.hint:"",tourState().notice||"",tourState().lastDone].join("|");
}
/* Redraw the card only when what it says has changed, and keep the ring on its target through partial repaints. */
function tourRefreshCard(force=false){
  const app=document.getElementById("app");if(!app)return;
  document.body.classList.toggle("tour-on",tourActive());
  document.body.classList.toggle("tour-clock-on",tourClockAllowed());
  if(!tourActive()){app.querySelectorAll(".tour-card,.tour-dim").forEach(e=>e.remove());document.querySelectorAll(".tour-target").forEach(e=>e.classList.remove("tour-target"));tourCardSignature="";return}
  const sig=tourSignature();
  if(force||sig!==tourCardSignature||!app.querySelector(".tour-card")){
    app.querySelectorAll(".tour-card,.tour-dim").forEach(e=>e.remove());
    app.insertAdjacentHTML("beforeend",tourCardHtml());
  }
  // A decision that opens while the tutorial is up (a bill, a loss, an event) takes the screen; the card comes back when it closes.
  document.body.classList.toggle("tour-modal",!!app.querySelector(".modal-backdrop"));
  const s=tourStep(),el=s.center||!tourOnTab(s)?null:tourFindTarget(s),had=document.querySelector(".tour-target");
  if(had&&had!==el)had.classList.remove("tour-target");
  if(sig!==tourCardSignature){tourScrolledByPlayer=false;tourCardSignature=sig;tourSettleUntil=Date.now()+4000}
  if(el){
    el.classList.add("tour-target");
    /* The page keeps settling after a render (enhancers add cards above the ring), so keep it in view for a few
       seconds, and stop the moment the player scrolls for themselves. */
    if(!tourScrolledByPlayer&&Date.now()<tourSettleUntil)tourBringIntoView(el);
  }
}
/* Called at the end of every full render. */
function tourAfterRender(){
  tourCardSignature="";
  document.querySelectorAll(".tour-target").forEach(e=>e.classList.remove("tour-target"));
  if(tourActive())setTimeout(tourCheck,0);
  tourRefreshCard(true);
}
/* Bring it into the open part of the screen: below the sticky bars, and above the card on a phone, where the card is a
   sheet across the bottom. Left alone if it is already there. */
function tourBringIntoView(el){
  if(el.closest(".topbar,.mobile-pause-button"))return;
  const r=el.getBoundingClientRect(),narrow=window.innerWidth<=800,card=document.querySelector(".tour-card");
  const floor=narrow&&card?card.getBoundingClientRect().top-24:window.innerHeight-40;
  const ceiling=Math.max(...[".topbar",".treasury-sections",".mine-sections",".toast"].map(q=>{const e=document.querySelector(q);if(!e)return 0;const b=e.getBoundingClientRect();return b.bottom>0&&b.top<200?b.bottom:0}),0)+16;
  if(r.top>=ceiling&&Math.min(r.bottom,r.top+120)<=floor)return;
  window.scrollBy({top:r.top-ceiling-Math.max(0,Math.min(80,(floor-ceiling-r.height)/3)),behavior:"instant"});
}

// A reload lands on the step it left, on that step's page.
if(typeof state==="object"&&state&&tourActive()){const s=tourStep();if(s.tab)activeTab=openTab(s.tab)}
setInterval(tourCheck,300);
document.addEventListener("keydown",e=>{
  if(!tourActive()||e.target&&/input|textarea|select/i.test(e.target.tagName))return;
  if(e.key==="ArrowRight"){e.preventDefault();tourAction("tour-next")}
  else if(e.key==="ArrowLeft"){e.preventDefault();tourAction("tour-back")}
  else if(e.key==="Escape"&&!document.querySelector(".modal-backdrop")){e.preventDefault();tourAction("tour-skip")}
});
// A player who scrolls or swipes is looking for themselves; the tutorial stops moving the page for this step.
["wheel","touchstart"].forEach(type=>window.addEventListener(type,()=>{if(tourActive())tourScrolledByPlayer=true},{passive:true}));
