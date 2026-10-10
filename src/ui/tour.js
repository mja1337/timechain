"use strict";

/* THE FIRST-RUN TOUR - a guided walk through every area, once, with the clock stopped.

   A new player meets a ticker of fourteen numbers, ten tabs and a sidebar of history all at once, and the
   page that explains each of them is the page they have not opened yet. The tour opens each one in turn,
   puts a ring around the part that matters, and says in a few sentences what it is for and what you can
   do there. Nothing in it can go wrong: the clock is stopped for the whole walk and put back at the end.

   It is a coach, not a gate. It starts by itself after the first-wallet ceremony of a new run, it can be
   left at any step, and it can be replayed from the footer whenever the page has stopped making sense. A
   save from before it existed is treated as having had it already, so nobody is walked through a game
   they have been playing for months.

   The tour talks about what each place is for. What to do next, in the moment, is the briefing on the
   Dashboard, which keeps going after the tour has ended.

   A step names the tab to open (any name the tab has ever had, via openTab) and where to point: a list of
   candidates, each a CSS selector or a heading's text, of which the first that exists is used. A step
   whose target is missing still shows; the ring just is not drawn. */

const TOUR_STEPS=[
  {id:"welcome",center:true,chapter:"Welcome",title:"A three-minute tour",
    body:"You are about to run a Bitcoin mining operation through the real history of the network. There is a lot on screen, so this walk visits every area once and says what it is for and what you can do there. <b>The clock is stopped</b> while you read, and nothing can go wrong. You can leave at any step and replay it from the footer."},
  {id:"clock",chapter:"The basics",tab:"dashboard",target:[".topbar"],title:"Time",
    body:"The game runs in simulated days. The date and your level are up here, with buttons to pause or to run at up to sixteen times speed. <b>Time stops by itself</b> when something needs a decision: a major event, a loss, a bill you cannot pay. Pause whenever you want to think."},
  {id:"ticker",chapter:"The basics",tab:"dashboard",target:[".ticker"],title:"Your numbers",
    // A phone has no room for the ticker and hides it; a step about something that is not there is skipped.
    skip:()=>{const t=document.querySelector(".ticker");return !t||getComputedStyle(t).display==="none"},
    body:"<b>Cash available</b> is the cash that pays the bills. <b>Self-held BTC</b> is coins whose keys you hold; <b>custodial BTC</b> is a promise from an exchange, and promises fail. <b>Your hash</b> is the work you contribute to the network, and <b>net worth</b> is everything marked to market. BTC does not pay a bill until it has been sold."},
  {id:"briefing",chapter:"The basics",tab:"dashboard",target:[".operator-briefing"],title:"Your briefing",
    body:"This panel says what matters right now and what to do about it: your first shift, your first bill, a faulty machine, a cash warning. <b>When you do not know what to do next, read it.</b> It carries on after the tour has ended."},
  {id:"command",chapter:"The basics",tab:"dashboard",target:[{text:"Your next decisions"}],title:"Choose your next move",
    body:"Start with cash, mining costs, site limits and key safety. The other cards explain payout timing and chain verification. Each question links to the page where you can act."},
  {id:"story",chapter:"The basics",tab:"dashboard",target:[".sidebar"],title:"The Bitcoin story",
    body:"The history is real and it is happening to you: halvings, exchange collapses, bans, new machines. Dated events pause the game and explain what happened and why it mattered, and some of them reach into your operation. This is the timeline of what has happened and what is coming."},
  {id:"mine",chapter:"Mining",tab:"mine",target:[{text:"Fleet command"},".content .card"],title:"Mine: your machines",
    body:"Here you buy machines as they are released, switch them on and off, repair faults and watch the floor. <b>More hash gives you a better chance of a reward, and costs more electricity.</b> The load meter shows how much of the site's power you are using, and a machine that is too hot or too old fails."},
  {id:"pools",chapter:"Mining",tab:"pools",target:[{text:"Choose payout method"},".content .card"],title:"Pools: how you get paid",
    body:"<b>Solo</b> pays only when your own work finds a block: rare, large and lumpy. A <b>pool</b> shares the work and pays smaller, steadier rewards less its fee, under a payout scheme that decides who carries the luck. Below, you choose a payout threshold and where income lands: the online wallet, cold storage or an exchange."},
  {id:"treasury",chapter:"Money",tab:"market",target:[".treasury-strip"],title:"The Treasury",
    body:"One place for the money. The strip shows what you can spend today and for how many days of bills, your online wallet, your reserve, how safely it is kept, and when the next bill lands and whether it is covered. Underneath are three sections: <b>Market</b>, <b>Custody</b> and <b>Finance</b>."},
  {id:"market",chapter:"Money",tab:"market",target:[".treasury-sections"],title:"Market: BTC into cash",
    body:"Buy and sell bitcoin at the exchanges of the day. Each quotes its own price and fee, a very large sale moves the price against you, and a balance held on an exchange is a claim, not your coins. It is where you come when a bill needs cash. <b>There is no market at all until July 2010</b>, so until then nothing you mine can be sold: cash is the only way to pay a bill. That is why you start with $2,500."},
  {id:"custody",chapter:"Money",tab:"custody",target:[{text:"Your online wallet"},".treasury-sections"],title:"Custody: who holds the keys",
    body:"This card is the key you made at the start, and <b>it lives on one computer</b>: the one in the mine. A fire, a thief or a failed disk takes the coins unless the key is written down somewhere else. Whatever you will not spend this month belongs in <b>cold storage</b>, which is a key that is never on that computer."},
  {id:"coldsetup",chapter:"Money",tab:"custody",target:[".cold-setup"],title:"Cold storage in five steps",
    body:"This card walks you through it, and the button for the next step is on its line: <b>get a signer</b> (in 2009 an old beige PC from the basement that never goes online; hardware wallets come later), <b>make a key on it</b>, <b>write it down</b>, <b>put it in your wallet</b>, then <b>move coins in</b>. Coins cannot go to cold storage before the first four are done: a wallet nobody can sign for is where coins go to be lost."},
  {id:"custodypage",chapter:"Money",tab:"custody",target:[".custody-group"],title:"The rest of the page, in order",
    body:"The page is numbered. <b>1 Your coins</b> is where they are and how to move them. <b>2 Equipment and backups</b> is the shop, your devices, your keys and where each is kept. <b>3 Spending and standing</b> is what it takes to get coins back out. <b>4 Verification</b> is your node, and <b>5 Learn</b> is optional. Until you have something to protect, step 1 is all you need."},
  {id:"finance",chapter:"Money",tab:"finance",target:[{text:"Settlement"},".treasury-sections"],title:"Finance: the bill",
    body:"Power, rent, staff and internet are billed monthly. If cash falls short <b>the clock stops and you choose how to raise it</b>: sell coins, borrow against them, miss the bill into a grace month, take bridge finance, or enter receivership. Nothing is ever sold for you. <b>Before July 2010 there is no market, so a bill can only be paid from cash or by selling a miner, and if neither covers it the run ends.</b> Loans and the score live here too."},
  {id:"facilities",chapter:"The site",tab:"facilities",target:[{text:"Home office"},".content .card"],title:"Facilities: where it is",
    body:"The site decides how much power and cooling you have and what it costs. A home office is a wall socket; larger sites hold more machines, in regions with different electricity prices, reliability and politics. <b>Moving the fleet takes it offline for weeks</b>, and anything kept at the mine goes with it. This is also where your internet line lives, and you can <b>cut it</b> to put a run on hold: nothing can mine and most screens go dark until you reconnect."},
  {id:"energy",chapter:"The site",tab:"energy",target:[{text:"Energy tariff desk"},".content .card"],title:"Energy: the biggest cost",
    body:"Electricity is the largest recurring bill. The regional tariff, your contract and your efficiency combine into one all-in rate, and a site near its limit pays a penalty. Negotiate contracts and cut waste here, because every watt is billed every month."},
  {id:"learn",chapter:"Growing",tab:"learn",target:[{text:"Knowledge desk"},".content .card"],title:"Learn: earn knowledge",
    body:"Study the history of Bitcoin, one subject at a time. Studying earns knowledge, and each knowledge threshold you cross gives you a skill point. Some lessons end in a short check. It is cheap early on and the benefit compounds."},
  {id:"tech",chapter:"Growing",tab:"tech",target:[{text:"Skill tree"},".content .card"],title:"Tech: spend your skill points",
    body:"Skill points buy lasting capabilities in six branches, from undervolting and smart metering to multisig discipline and monitoring. Nothing here is an instant multiplier: each unlock changes what you can do or what can go wrong."},
  {id:"ledger",chapter:"The record",tab:"ledger",target:[{text:"Operator milestones"},".content .card"],title:"Ledger: what changed",
    body:"Milestones you have reached and a filterable history of every trade, repair, payout and decision, with your cash, coins and hash after each. When something looks wrong, this is where you find out when it changed."},
  {id:"method",chapter:"The record",tab:"method",target:[{text:"Understand the numbers"},".content .card"],title:"Method: the rules",
    body:"How the simulation works and where each number comes from, with every figure marked as recorded history or as the game's own model. If a number surprises you, the explanation is here."},
  {id:"finish",center:true,finish:true,chapter:"Ready",tab:"dashboard",title:"That is every room",
    body:"Your first job is small: <b>keep one laptop mining and pay the first bill</b>. Watch your briefing for what to do next, and press the pause button whenever you need time to think. You can replay this tour from the footer at any point."}
];

let tourScrolledByPlayer=false;
function tourState(){
  // A save from before the tour is treated as having done it.
  if(!state.tour||typeof state.tour!=="object")state.tour={active:false,done:true,step:0,resumeSpeed:0};
  return state.tour;
}
function tourActive(){const t=tourState();return !!t.active&&state.started&&state.walletSetup&&state.walletSetup.done}
function tourStep(){return TOUR_STEPS[Math.max(0,Math.min(TOUR_STEPS.length-1,tourState().step|0))]}

/* Begin, or begin again. The clock's speed is kept and restored when the tour ends. */
function beginTour(){
  const t=tourState();
  t.active=true;t.done=false;t.step=0;t.resumeSpeed=state.speed>0?state.speed:(t.resumeSpeed||0);
  state.speed=0;setTimer();
  tourGo(0);
}
function tourBlocked(){
  if(state.pendingSettlement)return "A bill is waiting for a decision. Settle it first.";
  if(typeof pendingLoss==="function"&&pendingLoss())return "A loss is waiting to be read. Read it first.";
  if(state.activeEvent)return "A historical chapter is open. Close it first.";
  return "";
}
/* The next step in a direction that has anything to show, or -1 past either end. */
function tourNeighbour(from,dir){
  for(let i=from+dir;i>=0&&i<TOUR_STEPS.length;i+=dir){
    const s=TOUR_STEPS[i];
    if(!s.skip||!s.skip())return i;
  }
  return -1;
}
function tourGo(index){
  const t=tourState();t.step=Math.max(0,Math.min(TOUR_STEPS.length-1,index));
  const s=tourStep();
  if(s.tab)activeTab=openTab(s.tab);
  save();render(false);
}
function endTour(){
  const t=tourState();
  t.active=false;t.done=true;
  // Put the clock back as it was, unless the player never had it running.
  if(state.speed===0&&t.resumeSpeed>0&&!tourBlocked()){state.speed=t.resumeSpeed;state.returnSpeed=t.resumeSpeed}
  state.lastReal=Date.now();setTimer();save();render(false);
  window.scrollTo({top:0,behavior:"instant"});
}
function tourAction(a){
  const t=tourState();
  if(a==="tour-start"){
    const why=tourBlocked();if(why)return showToast("Not now",why,"warning");
    beginTour();return;
  }
  if(!tourActive())return;
  if(a==="tour-next"){const to=tourNeighbour(t.step,1);if(to<0)endTour();else tourGo(to)}
  else if(a==="tour-back"){const to=tourNeighbour(t.step,-1);if(to>=0)tourGo(to)}
  else if(a==="tour-skip")endTour();
}

/* ---- drawing it ----------------------------------------------------------------------- */

function tourFindTarget(step){
  for(const c of step.target||[]){
    let el=null;
    if(typeof c==="string")el=document.querySelector(c);
    else if(c&&c.text){
      const h=[...document.querySelectorAll(".content h2, .content h3")].find(x=>x.textContent.includes(c.text));
      el=h?h.closest(".card, section, article")||h:null;
      // A card taller than most of the screen is not something to ring: ring what it is called.
      if(el&&h&&el!==h&&el.getBoundingClientRect().height>window.innerHeight*.9)el=h;
    }
    if(el)return el;
  }
  return null;
}
function tourCardHtml(){
  const t=tourState(),s=tourStep(),n=t.step,last=n===TOUR_STEPS.length-1,first=n===0;
  // Counted over the steps that are being shown, so a phone that skips one still reads 1 of 16, not 1 of 17.
  const shown=TOUR_STEPS.map((x,i)=>({x,i})).filter(({x})=>!x.skip||!x.skip()||x===s),total=shown.length,position=shown.findIndex(({x})=>x===s);
  const chapter=first||last?s.chapter:`${s.chapter} · ${position} of ${total-2}`;
  const pct=Math.round(position/(total-1)*100);
  return `${s.center?`<div class="tour-dim"></div>`:""}<aside class="tour-card${s.center?" tour-center":""}" role="dialog" aria-live="polite" aria-label="Guided tour">
    <div class="tour-bar"><i style="width:${pct}%"></i></div>
    <div class="tour-kicker">${chapter}</div><h3>${s.title}</h3><p>${s.body}</p>
    <div class="tour-actions">
      ${first?`<button class="action primary" data-action="tour-next">Start the tour</button><button class="action-link" data-action="tour-skip">Skip, I will explore</button>`
        :last?`<button class="action primary" data-action="tour-next">Start playing</button><button class="action small" data-action="tour-back">Back</button>`
        :`<button class="action primary" data-action="tour-next">Next</button><button class="action small" data-action="tour-back">Back</button><button class="action-link" data-action="tour-skip">Skip the tour</button>`}
    </div></aside>`;
}
/* Called at the end of every full render: put the card on the page and ring what it is talking about. */
function tourAfterRender(){
  document.body.classList.toggle("tour-on",tourActive());
  const app=document.getElementById("app");if(!app)return;
  app.querySelectorAll(".tour-card,.tour-dim").forEach(e=>e.remove());
  document.querySelectorAll(".tour-target").forEach(e=>e.classList.remove("tour-target"));
  if(!tourActive())return;
  app.insertAdjacentHTML("beforeend",tourCardHtml());
  // A decision that opens while the tour is up (a bill, a loss) takes the screen; the card comes back when it closes.
  document.body.classList.toggle("tour-modal",!!app.querySelector(".modal-backdrop"));
  const s=tourStep(),el=s.center?null:tourFindTarget(s);
  if(el){
    el.classList.add("tour-target");
    tourBringIntoView(el);
    /* The page keeps settling after a render: the section's enhancer adds cards and artwork, and the layout grows above the ring. Look
       again for a few seconds, so the ring is never left below the fold, and stop the moment the player scrolls for themselves. */
    const id=s.id;tourScrolledByPlayer=false;
    let tries=0;const settle=()=>{
      if(!tourActive()||tourStep().id!==id||tourScrolledByPlayer||++tries>14)return;
      const now=document.querySelector(".tour-target");if(now)tourBringIntoView(now);
      setTimeout(settle,300);
    };
    setTimeout(settle,160);
  } else if(!s.center)window.scrollTo({top:0,behavior:"instant"});
}
/* Bring it to the top of the page, under the sticky bars, unless it is already comfortably in view. */
function tourBringIntoView(el){
  const top=el.getBoundingClientRect().top;
  if(top<110||top>window.innerHeight*.45)el.scrollIntoView({block:"start",behavior:"instant"});
}

document.addEventListener("keydown",e=>{
  if(!tourActive()||e.target&&/input|textarea|select/i.test(e.target.tagName))return;
  if(e.key==="ArrowRight"){e.preventDefault();tourAction("tour-next")}
  else if(e.key==="ArrowLeft"){e.preventDefault();tourAction("tour-back")}
  else if(e.key==="Escape"){e.preventDefault();tourAction("tour-skip")}
});
// A player who scrolls or swipes is looking for themselves; the tour stops moving the page for this step.
["wheel","touchstart"].forEach(type=>window.addEventListener(type,()=>{if(tourActive())tourScrolledByPlayer=true},{passive:true}));
