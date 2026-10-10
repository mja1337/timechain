"use strict";

/* THE TUTORIAL - ten short steps, each one thing to do in the real game, with the clock held.

   The first version of this was a guided walk: it opened every room in turn, rang the part that mattered and
   said what it was for. Nobody had to do anything, so nothing stuck, and a player could finish it with a key
   on one disk, no backup and no cold storage, which is exactly how the early custody losses happened. This one
   is a coach with a checklist. Each card asks for one action, points at the button that does it, and moves on
   by itself when the game's own state says it has been done: the key written down, the signer delivered, the
   reserve key assigned. A Next button only appears on a step that was already done when you reached it.

   By the last card the wallet is set up end to end: the online wallet's key is backed up, a signer is
   delivered, checked and holding a reserve key, that key is written down and assigned to the reserve wallet,
   both paper copies are on their way out of the building, and the player has chosen where income lands.

   THE CLOCK. It is held for the whole tutorial, as the tour always held it, with two exceptions that the card
   says out loud: once a signer is on order the clock may run until it arrives (and stops by itself when it
   does), and the last step is pressing play. Nothing here draws from the shared random stream, so a run that
   takes the tutorial has the same history as one that skips it, given the same days played.

   SAVES. The step is kept in state.tour by id, so a reload lands on the same card. A save from before any tour
   existed is treated as having had it, and a save that was part-way through the old room-by-room tour starts
   this one from the top; steps that are already done are passed over, so that costs nothing. It can be
   replayed from the footer.

   A step's target is a list of candidates (a CSS selector, or a function returning an element); the first one
   on screen is ringed. A step whose target is missing still shows; the ring is just not drawn. */

const TOUR_VERSION=2;
function tourColdKeys(s=state){return ((s.custody&&s.custody.keys)||[]).filter(k=>!k.hot&&!k.retired)}
function tourSigners(s=state){return ((s.custody&&s.custody.devices)||[]).filter(d=>!d.destroyed&&custodyProduct(d.product)?.kind==="signer")}
function tourSignerOrdered(s=state){return ((s.custody&&s.custody.orders)||[]).some(o=>custodyProduct(o.id)?.kind==="signer")}
function tourCheapestSigner(){return CUSTODY_PRODUCTS.filter(p=>p.kind==="signer"&&!p.build&&custodyProductAvailable(p)&&!custodyOnceBlocked(p)).sort((a,b)=>custodyUnitCost(a)-custodyUnitCost(b))[0]||null}
function tourBacked(k){return !!k&&!!k.backup&&!k.backup.destroyed}
/* A backup counts as away from the mine once it has left, even while it is still travelling. */
function tourAway(k,s=state){return tourBacked(k)&&!!k.backup.place&&(k.backup.place==="transit"||custodyPlaceId(k.backup.place,s)!=="site")}
/* The paper copies that still share the mine's fate: the online wallet's and every assigned reserve key's. */
function tourBackupsAtMine(s=state){
  const hot=typeof hotKey==="function"?hotKey(s):null;
  return [hot,...custodyAssignedKeys(s)].filter(k=>tourBacked(k)&&!tourAway(k,s));
}
function tourSpeedButton(){return tourVisible('.topbar .speed[data-value="1"]')||tourVisible(".mobile-pause-button")||tourVisible('.speed[data-value="1"]')}
function tourMoveRow(){
  const k=tourBackupsAtMine()[0];if(!k)return null;
  const b=tourVisible(`[data-action="custody-move"][data-kind="backup"][data-id="${k.id}"]`);
  return b?b.closest(".incoming-fleet-row")||b:null;
}

const TOUR_STEPS=[
  {id:"welcome",center:true,chapter:"Tutorial",title:"Finish setting up, one step at a time",
    body:"Your wallet has a key. In the next few minutes you will back it up, build a cold-storage reserve beside it, choose where your income lands and start mining. Each card asks for <b>one thing</b>, points at the button that does it, and moves on by itself once it is done. <b>The clock is held</b> until the last step, apart from the day or so a delivery takes."},
  {id:"walletkey",chapter:"Your wallet",tab:"custody",target:[".hot-wallet"],title:"Make your wallet's key",
    body:"A block reward is paid to an address, and an address comes from a key. You made that key in the opening ceremony: it is the key behind your <b>online wallet</b>.",
    hint:()=>"Done in the opening ceremony.",
    done:s=>!!s.walletSetup&&!!s.walletSetup.done},
  {id:"hotbackup",chapter:"Your wallet",tab:"custody",target:['.hot-wallet [data-action="custody-backup"][data-value="paperbackup"]',".hot-wallet"],title:"Write the key down",
    body:"The ceremony sheet is destroyed, so that key now lives on one computer: the one in the mine. If its disk dies, the coins in it go with it. A copy on paper is free, and turns a dead disk into an afternoon's work.",
    hint:()=>"Press <b>Write it down</b> on the <b>Your online wallet</b> card.",
    done:s=>typeof hotKey!=="function"||!hotKey(s)||hotKeyBackedUp(s)},
  {id:"signer",chapter:"Cold storage",tab:"custody",target:[()=>tourSignerOrdered()?tourSpeedButton():null,'.cold-setup li.current [data-action="custody-buy"]',".cold-setup"],title:"Get a signer",
    body:"Cold storage is a key that never touches the mining computer, so it needs a device of its own. Before hardware wallets that means a cheap computer that never goes online.",
    hint:()=>{
      if(tourSignerOrdered())return "It is on its way. Press <b>1×</b> or faster to let the days pass: <b>the clock stops by itself</b> when it arrives.";
      const p=tourCheapestSigner();if(!p)return "No signer is on sale at this date.";
      const cost=custodyUnitCost(p);
      return state.cash<cost?`A ${p.name} costs ${fmtUsd(cost)} and you have ${fmtUsd(state.cash)}. Raise the cash first, or skip the tutorial for now.`
        :`Press <b>Order ${p.name}</b> on step 1 of the <b>Set up cold storage</b> card (${cost>0?fmtUsd(cost):"free"}, ${custodyLeadDays(p)} day${custodyLeadDays(p)===1?"":"s"}).`;
    },
    clock:s=>tourSignerOrdered(s),pauseWhenDone:true,
    done:s=>tourSigners(s).length>0||tourColdKeys(s).length>0},
  {id:"prepare",chapter:"Cold storage",tab:"custody",target:['.custody-workshop [data-action="workshop-inspect"]','.custody-workshop [data-action="workshop-prepare"]','.cold-setup li.current [data-action="workshop-focus"]',".custody-workshop"],title:"Check it and prepare its software",
    body:"A parcel is not proof. Check where it came from, then record the software that will show you each payment before you sign it. Neither step makes a key.",
    hint:()=>tourVisible('.custody-workshop [data-action="workshop-prepare"]')?"Press <b>Record software and payment-review checks</b> in the workshop."
      :tourVisible('.custody-workshop [data-action="workshop-inspect"]')?"Press <b>Inspect delivery and source</b> in the workshop."
      :"Press <b>Open this signer in the workshop</b> on the <b>Set up cold storage</b> card.",
    done:s=>tourSigners(s).some(d=>workshopPrepared(d))||tourColdKeys(s).length>0},
  {id:"reservekey",chapter:"Cold storage",tab:"custody",target:['.cold-setup li.current [data-action="custody-genkey"]','.cold-setup li.current [data-action="custody-backup"]','.custody-workshop [data-action="custody-genkey"]','.custody-workshop [data-action="custody-backup"]',".cold-setup"],title:"Make a reserve key and write it down",
    body:"Create the secret on the signer, then copy it onto paper. The device can fail; the paper copy is how the key comes back. Anyone who reads it can spend with it, so it is kept private.",
    hint:()=>tourColdKeys().length?"Press <b>Write it on paper · free</b>.":"Press <b>Generate a key</b>.",
    done:s=>{const k=tourColdKeys(s);return k.length>0&&k.every(tourBacked)}},
  {id:"assign",chapter:"Cold storage",tab:"custody",target:['.cold-setup li.current [data-action="custody-assign"]','.custody-workshop [data-action="custody-assign"]',".cold-setup"],title:"Put the key in charge of the reserve",
    body:"A key protects nothing until the reserve wallet's spending rule names it. One key, one signature: simple to use, and the right place to start.",
    hint:()=>"Press <b>Assign to wallet</b>.",
    done:s=>custodySetup(s).ready},
  {id:"offsite",chapter:"Keep it safe",tab:"custody",target:[tourMoveRow,".cold-setup"],title:"Keep the backups away from the mine",
    body:"Both paper copies are in the same building as the computer and the signer, so one fire takes the lot. Send each to a <b>bank deposit box</b> (safest, $15 a month) or <b>a trusted person's house</b> (free, with a very small chance they help themselves).",
    hint:()=>{const n=tourBackupsAtMine().length;return `In <b>Where things are kept</b>, press <b>→ Bank deposit box</b> or <b>→ A trusted person's house</b> beside the seed backup. ${n} still at the mine.`},
    // Only once there is something to protect: the online wallet written down and a reserve wallet ready.
    done:s=>(typeof hotKey!=="function"||!hotKey(s)||hotKeyBackedUp(s))&&custodySetup(s).ready&&tourBackupsAtMine(s).length===0},
  {id:"payout",chapter:"Mining",tab:"pools",target:['[data-action="payout-destination"][data-value="cold"]',".payout-destinations"],title:"Choose where mining income lands",
    body:"Every coin you mine is paid to an address you choose. <b>Cold storage</b> is the safest place and takes days to spend from; the <b>online wallet</b> can pay a bill this afternoon and is reachable by anyone who reaches the computer.",
    hint:()=>`${state.time<MARKET?"Before July 2010 there is no market, so mined coins cannot pay a bill yet and cold storage costs you nothing. ":""}Press <b>Send income here</b> under Cold storage, or keep it online with the button below.`,
    keep:true,done:s=>poolAccount().destination==="cold"||!!(s.tour&&s.tour.payoutKept)},
  {id:"start",finish:true,chapter:"Mining",tab:"mine",target:[tourSpeedButton,".topbar"],title:"Start mining",
    body:"Your laptop is on the floor and switched on. More hash means a better chance of a reward, and a bigger power bill. Your first job is small: <b>keep it mining and pay the first bill</b>. The Dashboard briefing says what to do next.",
    hint:()=>"Press <b>1×</b> to start the clock. The tutorial ends, and you can replay it from the footer.",
    clock:()=>true,done:s=>s.speed>0}
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
  return t;
}
function tourState(){return normalizeTourState(state)}
function tourActive(){const t=tourState();return !!t.active&&state.started&&state.walletSetup&&state.walletSetup.done}
function tourStep(){return TOUR_STEPS[tourState().step]}
function tourDone(step,s=state){return !!step.done&&!!step.done(s)}
/* Whether the speed buttons may start the clock on this step. */
function tourClockAllowed(){return tourActive()&&!!tourStep().clock&&!!tourStep().clock(state)}

/* Begin, or begin again. The clock's speed is kept and restored if the tutorial is skipped. */
function beginTour(){
  const t=tourState();
  t.active=true;t.done=false;t.payoutKept=false;t.lastDone="";t.resumeSpeed=state.speed>0?state.speed:(t.resumeSpeed||0);
  state.speed=0;setTimer();
  tourGo(0);
}
function tourBlocked(){
  if(state.pendingSettlement)return "A bill is waiting for a decision. Settle it first.";
  if(typeof pendingLoss==="function"&&pendingLoss())return "A loss is waiting to be read. Read it first.";
  if(state.activeEvent)return "A historical chapter is open. Close it first.";
  return "";
}
/* The next step that still needs doing, or -1 past the end. Going back stops at any step. */
function tourNextIndex(from){
  for(let i=from+1;i<TOUR_STEPS.length;i++)if(!tourDone(TOUR_STEPS[i]))return i;
  return -1;
}
function tourGo(index,openIt=true){
  const t=tourState(),s=TOUR_STEPS[Math.max(0,Math.min(TOUR_STEPS.length-1,index))];
  t.step=TOUR_STEPS.indexOf(s);t.id=s.id;t.arrivedDone=tourDone(s);
  if(s.tab&&openIt){activeTab=openTab(s.tab);mobileMenuOpen=false}
  tourCardSignature="";save();render(false);
}
function endTour(){
  const t=tourState();
  t.active=false;t.done=true;
  // Put the clock back as it was, unless the player never had it running or has just started it.
  if(state.speed===0&&t.resumeSpeed>0&&!tourBlocked()){state.speed=t.resumeSpeed;state.returnSpeed=t.resumeSpeed}
  state.lastReal=Date.now();setTimer();save();render(false);
  window.scrollTo({top:0,behavior:"instant"});
}
function tourForward(){const to=tourNextIndex(tourState().step);if(to<0)endTour();else tourGo(to)}
function tourAction(a){
  const t=tourState();
  if(a==="tour-start"){
    const why=tourBlocked();if(why)return showToast("Not now",why,"warning");
    beginTour();return;
  }
  if(!tourActive())return;
  const s=tourStep();
  if(a==="tour-next"){if(s.center||t.arrivedDone||tourDone(s))tourForward()}
  else if(a==="tour-back"){if(t.step>0)tourGo(t.step-1)}
  else if(a==="tour-goto"){if(s.tab){activeTab=openTab(s.tab);mobileMenuOpen=false;tourCardSignature="";render(false)}}
  else if(a==="tour-keep-hot"){if(s.keep){t.payoutKept=true;tourCheck()}}
  else if(a==="tour-skip")endTour();
}
/* The game moved on: see whether the step on screen has just been done. Called after every full render and on
   a short interval, because the Mine tab repaints only its content and a delivery can land between renders. */
function tourCheck(){
  if(!tourActive())return;
  const t=tourState(),s=tourStep();
  // The clock is the tutorial's to hold: anything that restarts it on a step that does not allow it is undone.
  if(state.speed>0&&!tourClockAllowed()&&!tourBlocked()){state.speed=0;setTimer();if(typeof refreshSpeedControls==="function")refreshSpeedControls()}
  const done=tourDone(s);
  if(!done&&t.arrivedDone){t.arrivedDone=false}
  if(done&&!t.arrivedDone&&!s.center){
    if(s.pauseWhenDone&&state.speed>0){state.speed=0;setTimer()}
    t.lastDone=s.title;
    if(s.finish){endTour();return}
    tourForward();return;
  }
  tourRefreshCard();
}

/* ---- drawing it ----------------------------------------------------------------------- */

function tourVisible(selector){
  for(const el of document.querySelectorAll(selector))if(el.getClientRects().length&&!el.closest("details:not([open])"))return el;
  return null;
}
function tourFindTarget(step){
  for(const c of step.target||[]){
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
  const goto=!s.center&&!tourOnTab(s)?`<button class="action small primary" data-action="tour-goto">Go to ${tourTabName(s)}</button>`:"";
  const doing=s.center?"":done?`<div class="tour-do done"><b>✓ Done.</b> ${s.finish?"":"Press Next to carry on."}</div>`:`<div class="tour-do"><b>Do this:</b> ${s.hint()}</div>`;
  const clock=!s.center&&!done?(tourClockAllowed()?`<div class="tour-clock run">The clock may run for this step.</div>`:`<div class="tour-clock">The clock is held while you do this.</div>`):"";
  const actions=first?`<button class="action primary" data-action="tour-next">Start</button><button class="action-link" data-action="tour-skip">Skip tutorial</button>`
    :`${goto}${done&&!s.finish?`<button class="action small primary" data-action="tour-next">Next</button>`:""}${s.keep&&!done?`<button class="action small" data-action="tour-keep-hot">Keep it in the online wallet</button>`:""}<button class="action small" data-action="tour-back">Back</button><button class="action-link" data-action="tour-skip">Skip tutorial</button>`;
  return `${s.center?`<div class="tour-dim"></div>`:""}<aside class="tour-card${s.center?" tour-center":""}" role="dialog" aria-live="polite" aria-label="Tutorial" data-step="${s.id}">
    <div class="tour-bar"><i style="width:${pct}%"></i></div>
    <div class="tour-kicker">Step ${n+1} of ${total} · ${s.chapter}</div><ol class="tour-dots" aria-hidden="true">${dots}</ol>
    ${t.lastDone&&!first?`<div class="tour-last">✓ ${t.lastDone}</div>`:""}<h3>${s.title}</h3><p>${s.body}</p>${doing}${clock}
    <div class="tour-actions">${actions}</div></aside>`;
}
function tourSignature(){
  const s=tourStep();
  return [s.id,tourDone(s),tourOnTab(s),tourClockAllowed(),s.hint?s.hint():"",tourState().lastDone].join("|");
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
  if(tourActive()){const t=tourState(),s=tourStep();if(tourDone(s)&&!t.arrivedDone&&!s.center){setTimeout(tourCheck,0);}}
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
