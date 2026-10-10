"use strict";

/* The sandbox decision has to be honest about three different things: what stops at the cutoff, what continues as a model, and what continues because it is protocol. */
function sandboxContinuationNote(){
  const next=nextHalvingTime(END);
  const level=volatilityLevel(),enabled=volatilityEnabled(),label=level<25?"Smooth":level<50?"Calm":level<75?"Balanced":"Choppy";
  return `<section class="sandbox-decision"><h3>What continues after ${dateFmt(END)}</h3><p>The historical feed ends here. Continue 100 modelled years.</p><dl><div><dt>Stops at the cutoff</dt><dd>No new historical chapters and no new hardware releases are invented after ${dateFmt(END)}. Nothing you read after this point is recorded history.</dd></div><div><dt>Continues as a model</dt><dd>Price and hash rate continue; chain size and block height continue through deterministic modelled projections.</dd></div><div><dt>Continues as protocol</dt><dd>Issuance keeps running and halvings keep reducing mining income. The next is projected for ${dateFmt(next,true)}, from ${fmtSubsidy(subsidyAt(END))} to ${fmtSubsidy(subsidyAt(next))} per block. Dates assume a constant ten-minute block interval.</dd></div></dl><div class="volatility-control"><div class="volatility-control-head"><div><strong>Volatility Mode</strong><span>Seeded continuation shocks.</span></div><button class="action small ${enabled?"primary":""}" data-action="volatility-toggle" aria-pressed="${enabled}">Volatility Mode: ${enabled?"On":"Off"}</button></div><label class="volatility-slider-label" for="volatility-level"><span>Path choppiness</span><output data-volatility-output>${label} · ${level}</output></label><input id="volatility-level" class="range-input" type="range" min="${VOLATILITY_MIN}" max="${VOLATILITY_MAX}" step="1" value="${level}" data-volatility-level ${enabled?"":"disabled"}/><div class="range-limits"><span>Smooth</span><span>Balanced</span><span>Choppy</span><span>Extreme</span></div><p class="modal-note">Middle keeps trend; lower smooths, higher chops paths. War, aliens and alien war include a 90% drawdown.</p></div></section>`;
}
function removeClarkReference(){const kicker=document.querySelector(".content .hero-kicker");if(kicker&&kicker.textContent.includes("Clark Moody"))kicker.textContent="Operator ledger"}
function enhanceEndModal(){const body=document.querySelector(".leaderboard")?.closest(".modal-body");if(!body||body.querySelector('[data-action="continue-run"]')||state.endReason||state.time<END)return;const actions=body.querySelector(".modal-actions");if(!actions)return;actions.insertAdjacentHTML("beforebegin",sandboxContinuationNote());actions.insertAdjacentHTML("beforeend",`<button class="action" data-action="continue-run">Continue for 100 modelled years</button>`)}
function enhanceLearn(){const grid=document.querySelector(".content .grid");if(grid&&!grid.querySelector(".tab-command-learn"))grid.insertAdjacentHTML("afterbegin",tabCommandVisual("learn"))}
/* The lattice is wider than the page, so it has its own horizontal scroll - and a repaint
   rebuilds it, which puts the player back at Compute every time a fault toast lands. At 16x
   that is several times a second. Remembered here and restored after the rebuild, the same
   problem and the same answer as the purchase quantity. */
let techScrollLeft=0;
function rememberTechScroll(node){
  if(!node)return;
  node.addEventListener("scroll",()=>{techScrollLeft=node.scrollLeft},{passive:true});
}
function enhanceTech(){
  const grid=document.querySelector(".content .grid");
  if(grid&&!grid.querySelector(".tab-command-tech"))grid.insertAdjacentHTML("afterbegin",tabCommandVisual("tech"));
  const lattice=document.querySelector(".tech-tree-scroll");
  if(!lattice)return;
  if(techScrollLeft)lattice.scrollLeft=techScrollLeft;
  rememberTechScroll(lattice);
}
const PAGE_HELP={
  mine:{anchor:"method-hardware",label:"mining hardware",terms:[["Hash rate","How much mining work a machine performs each second. More hash improves its chance of earning a reward."],["Power draw","The electricity a machine uses while running, measured here in watts or kilowatts."],["Efficiency (J/TH)","Energy used for each unit of mining work. Lower is better."]]},
  pools:{anchor:"method-mining",label:"solo and pool rewards",terms:[["Reward variance","How unevenly rewards arrive. Solo results can swing widely; a pool makes them steadier."],["Pool fee","The share a pool keeps before paying miners."],["Payout scheme","The rule a pool uses to turn submitted work into payments, such as FPPS or PPLNS."]]},
  market:{anchor:"method-market",label:"markets and asset liquidity",terms:[["Bid","The price a venue pays when you sell BTC there."],["Ask","The price you pay when buying BTC from a venue."],["Venue exposure","BTC deposited with an exchange is controlled by that company until you withdraw it."]]},
  custody:{anchor:"method-custody",label:"keys, nodes and custody",terms:[["Private key","The secret that authorises spending. Whoever controls it can move the BTC."],["Hot / cold wallet","A hot wallet is readily available and more exposed; cold storage is kept offline for stronger protection."],["Full node","Software that independently checks Bitcoin's ledger and rules. It does not hold keys or mine BTC by itself."]]},
  facilities:{anchor:"method-facilities",label:"facilities and operating capacity",terms:[["Electrical capacity","The maximum power the site can safely supply to miners and supporting equipment."],["Floor space","The number of machine positions the site can physically accommodate."],["Base uptime","The share of time the regional grid is expected to be available before other incidents."]]},
  energy:{anchor:"method-energy",label:"energy costs and contracts",terms:[["kWh","A kilowatt-hour: using one kilowatt of power for one hour. Electricity bills charge for this energy."],["Tariff","The price paid for each kWh under the selected contract."],["All-in rate","The regional price after contract, historical shock, density and skill adjustments."]]},
  finance:{anchor:"method-finance",label:"bills, runway and financing",terms:[["Liquid cash","Dollars available to spend now. BTC and investments do not count until sold."],["Monthly cost","The expected electricity, rent, internet, staffing, service and financing bill for a month."],["Cash runway","How many months current cash could cover at today's recurring cost."]]},
  learn:{anchor:"method-progression",label:"learning and progression",terms:[["Knowledge","Progress earned by finishing learning items."],["Skill point","A spendable point awarded at knowledge thresholds and selected milestones."],["Learning slot","The single item currently progressing as simulation days pass."]]},
  tech:{anchor:"method-progression",label:"skills and operator progression",terms:[["Branch","A group of related capabilities. The tree has six: Compute, Energy, Operations, Electronics, Security and Resilience."],["Tier","A step in a branch. Later tiers require the earlier capability and may have era or facility gates."],["Capability","A permanent change to a real operating cost, risk or available action."]]},
  ledger:{anchor:"method-ledger",label:"the operation ledger",terms:[["Ledger entry","A saved action, payment, reward or event with the balances immediately afterward."],["Amount","The BTC, cash or operating value changed by that entry."],["Balance after","The resulting total, useful for tracing exactly when a later balance changed."]]},
  method:{anchor:"method-reference",label:"sources and modelling boundaries",terms:[["Recorded","A value taken from a historical data series or dated historical event."],["Derived","A value calculated from recorded inputs and the current operation."],["Modelled","A gameplay assumption used where history cannot specify this operation's outcome."]]}
};
/* The glossary is a modal rather than a page so a term can be looked up from wherever it
   confused the player, without losing their place. Search matches abbreviations, their
   expansions and common synonyms, because a newcomer rarely knows which one to type. */
let glossaryOpen=false;
function glossaryEntryHtml(entry){
  return `<li class="glossary-entry" data-glossary-key="${escapeHtml(glossarySearchKey(entry))}"><div class="glossary-term"><b>${escapeHtml(entry.term)}</b>${entry.aka&&entry.aka.length?`<span>also ${entry.aka.slice(0,3).map(escapeHtml).join(", ")}</span>`:""}</div><p>${escapeHtml(entry.def)}</p><button class="action-link" data-action="glossary-method" data-anchor="${entry.anchor}">How this works in Method →</button></li>`;
}
function glossaryModalHtml(){
  return `<div class="modal-backdrop"><section class="modal glossary-modal" role="dialog" aria-modal="true" aria-labelledby="glossary-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Reference</div><h2 id="glossary-title">Glossary</h2><p class="lead">Plain-English definitions of every term the simulation relies on. Search an abbreviation or its full name - both find the same entry.</p><label class="glossary-search"><span class="sr-only">Search the glossary</span><input type="search" data-glossary-search placeholder="Search a term, e.g. FPPS, hash rate, runway" autocomplete="off"></label><p class="glossary-count" data-glossary-count>${GLOSSARY.length} terms</p><ul class="glossary-list">${GLOSSARY.map(glossaryEntryHtml).join("")}</ul><p class="glossary-empty" data-glossary-empty hidden>No term matches that search. Try the abbreviation, or the word as it appears on screen.</p><div class="modal-actions"><button class="action primary" data-action="close-glossary">Close</button></div></div></section></div>`;
}
function filterGlossary(query){
  const needle=String(query||"").trim().toLowerCase();
  let shown=0;
  document.querySelectorAll(".glossary-entry").forEach(node=>{
    const match=!needle||(node.dataset.glossaryKey||"").includes(needle);
    node.hidden=!match;if(match)shown++;
  });
  const count=document.querySelector("[data-glossary-count]");if(count)count.textContent=`${shown} of ${GLOSSARY.length} terms`;
  const empty=document.querySelector("[data-glossary-empty]");if(empty)empty.hidden=shown>0;
}
const openContextHelp=new Set();
function rememberContextHelp(node){const tab=node?.dataset?.helpTab;if(!tab)return;if(node.open)openContextHelp.add(tab);else openContextHelp.delete(tab)}
function contextualHelp(tab){const help=PAGE_HELP[tab];if(!help)return"";return `<details class="context-help" data-help-tab="${tab}" ${openContextHelp.has(tab)?"open":""}><summary>Terms and help <span>What do these numbers mean?</span></summary><div class="context-help-body"><dl>${help.terms.map(([term,definition])=>`<div><dt>${term}</dt><dd>${definition}</dd></div>`).join("")}</dl><button class="action small context-method-link" data-action="tab" data-value="method" data-anchor="${help.anchor}">How ${help.label} works in this simulation →</button><button class="action small context-glossary-link" data-action="glossary">Open the glossary</button></div></details>`}
/* Method chapter ids and section ids are now written into the markup, so nothing has to
   be matched by heading text at runtime. What is still needed is opening the chapter a
   deep link points inside: a collapsed <details> cannot be scrolled to. */
function revealMethodAnchor(id){
  const target=document.getElementById(id);if(!target)return false;
  for(let node=target;node;node=node.parentElement)if(node.tagName==="DETAILS")node.open=true;
  target.scrollIntoView({behavior:"smooth",block:"start"});
  return true;
}
function disabledControlReason(control){const title=(control.getAttribute("title")||"").trim(),label=(control.textContent||"").replace(/\s+/g," ").trim();if(title)return title;if(/selected|current method|operating here|current region|already/i.test(label))return"This option is already active.";if(/unlock|require|need|available|occupied|in progress|offline|no /i.test(label))return label.replace(/[·]+/g," · ")+(/[.!?]$/.test(label)?"":".");return"This action is unavailable in the current state. Check the requirement shown on its card or in the page guidance above."}
function enhanceDisabledControls(){document.querySelectorAll("button.action:disabled").forEach((control,index)=>{if(control.closest(".blocked-control"))return;const reason=disabledControlReason(control),id=`blocked-help-${renderRevision}-${index}`,wrapper=document.createElement("span"),help=document.createElement("button"),description=document.createElement("span");wrapper.className="blocked-control";control.parentNode.insertBefore(wrapper,control);wrapper.appendChild(control);control.setAttribute("aria-describedby",id);help.type="button";help.className="blocked-help";help.dataset.action="blocked-help";help.dataset.help=reason;help.setAttribute("aria-label",`Why ${((control.textContent||"this action").trim())} is unavailable`);help.textContent="?";description.className="sr-only";description.id=id;description.textContent=reason;help.appendChild(description);wrapper.appendChild(help)})}
function sectionPulse(){
  const fs=fleet(),energy=siteEnergyDaily(),monthly=monthlyCost(),offline=fs.offlineCount,runway=monthly.total?state.cash/monthly.total:Infinity,load=fs.cap?fs.kw/fs.cap*100:0,fleetCondition=fs.count?HARDWARE.reduce((sum,h)=>sum+(state.hardware[h.id]||0)*maintenanceCondition(h),0)/fs.count:100,learning=learningItem();
  const pages={
    mine:{purpose:"Buy, run and repair mining machines.",situation:offline?`${offline} machine${offline===1?" is":"s are"} unavailable and earning less than the installed fleet could.`:load>=90?`The fleet is using ${load.toFixed(0)}% of the site's electrical capacity.`:`${fs.count} machine${fs.count===1?" is":"s are"} installed, producing ${fmtHash(fs.hash)} at ${fs.kw.toFixed(2)} kW.`,next:offline?"Inspect the mining floor and repair the failed equipment.":load>=90?"Compare efficiency before buying; the next machine may need a larger site.":"Compare purchase price, expected income and electricity cost before adding a machine.",why:"A miner earns BTC only while it is online, but its purchase and electricity costs still determine whether it pays for itself.",metrics:[["Fleet hash",fmtHash(fs.hash)],["Fleet condition",`${fleetCondition.toFixed(0)}%`],["Power draw",`${fs.kw.toFixed(2)} kW`],["Unavailable",fmtNum(offline)]]},
    pools:{purpose:"Choose how mining rewards arrive.",situation:availablePool()?state.mode==="pool"?`${poolData().name} smooths your payouts and currently charges an effective ${(poolFee()*100).toFixed(2)}% fee.`:"You are solo mining: there is no pool fee, but rewards can be separated by long dry spells.":"Public pool access has not reached this point in Bitcoin's history, so the fleet must mine solo.",next:availablePool()?"Compare the fee with payout timing. A pool makes income steadier; solo mining preserves the full reward when you find a block.":"Keep mining solo until the first public pool becomes available in late 2010.",why:"Solo and pool mining have the same underlying expected work. The choice changes reward timing, variance and fees - not your physical hash rate.",metrics:[["Method",state.mode==="pool"?poolData().name:"Solo"],["Effective fee",state.mode==="pool"?`${(poolFee()*100).toFixed(2)}%`:"0.00%"],["Expected / day",fmtBtc(expectedDay())],["Pool access",availablePool()?"Open":"Locked"]]},
    market:{purpose:"Turn cash into BTC - or BTC back into operating cash.",situation:state.time<MARKET?"There is no continuous BTC/USD market yet. Your mined BTC has no usable dollar price in this simulation.":state.pendingSettlement?`The operation needs more liquid cash to complete its ${fmtUsd(state.pendingSettlement.due)} settlement.`:`You have ${fmtUsd(state.cash)} of spendable cash and ${fmtBtc(marketLiquidBtc())} available to sell through a venue.`,next:state.time<MARKET?"Keep mining and preserve enough cash for bills until continuous trading opens in July 2010.":state.pendingSettlement?"Deposit self-held BTC to a venue, then sell enough to cover the cash shortfall.":"Choose a venue, then review its buy or sell quote before confirming a trade.",why:"BTC cannot pay a dollar bill until it is sold. BTC left on a venue is controlled by that counterparty until you withdraw it.",metrics:[["Liquid cash",fmtUsd(state.cash)],["BTC / USD",state.time<MARKET?"No market":fmtUsd(priceAt(state.time))],["Ready to sell",fmtBtc(marketLiquidBtc())],["BTC held by others",fmtBtc(claims())]]},
    custody:{purpose:"Decide who controls your bitcoin.",situation:claims()>0?`${fmtBtc(claims())} is held by exchanges or other custodians; ${fmtBtc(controlled())} is held under your own keys.`:`Your own keys control ${fmtBtc(controlled())}; there is no BTC currently held by a custodian.`,next:claims()>0?"Keep only the BTC you need for trading on a venue, then withdraw the rest to a wallet you control.":"Use the hot wallet for access and cold storage for BTC you do not need to move quickly.",why:"A node checks Bitcoin's rules. Private keys control spending. An exchange balance is a claim on someone else, even when it is labelled in BTC.",metrics:[["Self-held BTC",fmtBtc(controlled())],["BTC held by others",fmtBtc(claims())],["Node",nodeOnline()?"Checking the chain":"Offline"],["Lightning locked",fmtBtc(lightningLocked())]]},
    facilities:{purpose:"Find enough power and room for the fleet.",situation:relocating()?"The fleet is in transit and cannot mine until the new site is commissioned.":upgradingFacility()?"The site upgrade is underway and mining remains offline until commissioning finishes.":`The ${facility().name} is using ${fs.kw.toFixed(1)} of ${fs.cap.toFixed(1)} kW and ${fs.space} of ${facility().space} floor units.`,next:relocating()||upgradingFacility()?"Keep enough cash for fixed costs while the fleet is offline.":load>=90?"Compare a larger facility before ordering more equipment.":"Check both power and floor space before approving the next hardware order.",why:"A cheaper region can lower electricity cost, but moving takes time and reliability determines how often the fleet can earn.",metrics:[["Current site",facility().name],["Power used",`${fs.kw.toFixed(1)} / ${fs.cap.toFixed(1)} kW`],["Region",region().name],["Logistics",relocating()?`Relocating · ${Math.ceil((state.relocationJob.due-state.time)/DAY)}d`:upgradingFacility()?`Upgrading · ${Math.ceil((state.facilityUpgradeJob.due-state.time)/DAY)}d`:"Ready"]]},
    energy:{purpose:"Control the operation's largest recurring cost.",situation:`The selected contract costs ${fmtUsd(energy.rate)}/kWh. At today's load, mining electricity costs about ${fmtUsd(energy.total)} per day.`,next:"Compare contract savings with shock risk, then confirm the monthly bill still fits your cash reserve.",why:"A powerful miner can still lose money when its electricity cost is greater than the BTC it is expected to earn.",metrics:[["All-in rate",`${fmtUsd(energy.rate)}/kWh`],["Energy / day",fmtUsd(energy.total)],["Contract",powerContract().name],["Bill so far",fmtUsd(state.bill)]]},
    finance:{purpose:"Keep enough cash to pay the next bill.",situation:gridCutOff()?`${fmtUsd(state.debt)} of unpaid bills has disconnected the grid.`:state.debt>0?`${fmtUsd(state.debt)} is in arrears. The site keeps running until ${dateFmt(state.arrearsDue)}, then power and internet are cut.`:Number.isFinite(runway)?`${fmtUsd(state.cash)} covers about ${runway.toFixed(1)} months at the current ${fmtUsd(monthly.total)} monthly cost.`:`The operation currently has no recurring monthly cash burn.`,next:state.debt>0?"Raise liquid cash and clear the arrears before trying to restart mining.":runway<2?"Raise cash or reduce recurring costs before the next settlement.":"Review the cost breakdown before taking debt or adding recurring staff costs.",why:"Mining rewards arrive in BTC, but electricity, rent, salaries and interest settle in cash. Net worth cannot pay a bill unless the asset is liquid.",metrics:[["Liquid cash",fmtUsd(state.cash)],["Monthly cost",fmtUsd(monthly.total)],["Debt + arrears",fmtUsd((state.projectLoan||0)+(state.debt||0))],["Cash runway",Number.isFinite(runway)?`${runway.toFixed(1)} mo`:"-"]]},
    learn:{purpose:"Study Bitcoin's history and earn knowledge.",situation:learning?`${learning.title} is occupying the learning slot at ${state.learning.progress||0} of ${learning.days} days.`:`The learning slot is free. You have ${state.knowledge.toFixed(1)} knowledge and need ${state.nextKnowledge.toFixed(1)} for the next skill point.`,next:learning?"Keep the simulation moving until the item finishes, then complete its knowledge check if one appears.":"Choose one available book, post or podcast whose subject matches your operating strategy.",why:"Learning awards knowledge. Reaching a knowledge threshold awards a point you can spend on a lasting Tech capability.",metrics:[["Knowledge",state.knowledge.toFixed(1)],["Unspent points",fmtNum(state.points)],["Learning slot",learning?"Occupied":"Available"],["Next point",state.nextKnowledge.toFixed(1)]]},
    tech:{purpose:"Turn knowledge into operating advantages.",situation:state.points?`You have ${state.points} unspent skill point${state.points===1?"":"s"}. Each branch changes a different part of the operation.`:"No skill points are available yet. Learning and major milestones can award more.",next:state.points?"Choose the branch that addresses your current bottleneck, then check the stated era and facility requirements.":"Complete learning items or reach milestones, then return when a point is available.",why:"Skills change real costs, reliability or operating options. Later skills require earlier ones, so each point commits you to a strategy.",metrics:[...new Set(SKILLS.map(x=>x.branch))].map(branch=>[branch,fmtNum(SKILLS.filter(x=>x.branch===branch&&hasSkill(x.id)).length)])},
    ledger:{purpose:"Review what changed and why.",situation:state.activity.length?`${fmtNum(state.activity.length)} actions, payments and events are recorded. The latest entry is dated ${dateFmt(state.activity[0].time,true)}.`:"No activity has been recorded yet.",next:"Filter the history when you need to trace a balance change, bill, reward, trade or fleet decision.",why:"Each entry preserves the balances immediately after it happened, so you can audit the operation instead of guessing from today's totals.",metrics:[["Entries",fmtNum(state.activity.length)],["This month",fmtNum(state.activity.filter(x=>new Date(x.time).toISOString().slice(0,7)===new Date(state.time).toISOString().slice(0,7)).length)],["Latest",state.activity[0]?dateFmt(state.activity[0].time,true):"-"],["Net worth",fmtUsd(netWorth())]]},
    method:{purpose:"Inspect the simulation's rules and sources.",situation:`This ${startingMode(state.difficulty).label} campaign began ${dateFmt(state.campaignStart||START,true)} and is now at ${dateFmt(state.time,true)}.`,next:"Use this manual when you want the exact formula, historical source or modelling boundary behind a number.",why:"The primary interface explains decisions. Method keeps recorded history, derived values and gameplay assumptions precise and separate.",metrics:[["Campaign start",dateFmt(state.campaignStart||START,true)],["Campaign date",dateFmt(state.time,true)],["Difficulty",startingMode(state.difficulty).label],["Simulation",state.speed?`${state.speed}× live`:"Paused"]]}
  };
  const page=pages[activeTabKey()];if(!page)return"";return `<section class="card section-pulse section-orientation" aria-labelledby="section-purpose-${activeTabKey()}"><div class="orientation-intro"><div><div class="hero-kicker">What this page is for</div><h2 id="section-purpose-${activeTab}">${page.purpose}</h2></div><div class="orientation-guide"><div class="orientation-next"><span>Next move</span><p>${page.next}</p></div><div><span>Right now</span><p>${page.situation}</p></div></div></div><div class="metric-row">${page.metrics.map(([label,value])=>`<div class="metric"><div class="label">${label}</div><strong${label==="Simulation"?` data-live-simulation`:""}>${value}</strong></div>`).join("")}</div><p class="orientation-principle"><b>The trade-off</b>${page.why}</p>${contextualHelp(activeTab)}</section>`;
}
let renderRevision=0;
const TAB_ENHANCERS={mine:()=>enhanceMine(),market:()=>enhanceMarket(),custody:()=>enhanceCustody(),facilities:()=>enhanceFacilitiesV2(),energy:()=>enhanceEnergy(),finance:()=>enhanceFinance(),learn:()=>enhanceLearn(),tech:()=>enhanceTech(),method:()=>enhanceMethod()};
/* Runs immediately after the markup is in the DOM, in the same task, so a repaint that
   lands a moment later cannot cancel the half of the page that has not been built yet. */
function enhanceActiveTab(){
  removeClarkReference();enhanceEndModal();
  const enhancer=TAB_ENHANCERS[activeTabKey()];
  if(enhancer)enhancer();
}
function content(revision=renderRevision){
  /* The orientation panel used to be injected on a deferred tick, after the tab had already
     painted, so it popped in a beat late - and in a background tab, where timers are
     throttled to about a second, very late indeed. It is part of the page, so it is part of
     the same string. The Dashboard is excluded deliberately: it is already an overview. */
  const orientation=activeTab==="dashboard"||activeTab==="treasury"?"":sectionPulse();
  return orientation+tabContent();
}
function tabContent(){
  if(typeof internetCut==="function"&&internetCut()){if(activeTab==="dashboard")return offlineDashboardHtml();if(offlineTabLocked(activeTab))return offlineLockHtml(activeTab)}
  if(activeTab==="dashboard")return dashboard();if(activeTab==="mine")return mine();if(activeTab==="treasury")return treasury();if(activeTab==="pools")return pools();if(activeTab==="market")return market();if(activeTab==="custody")return custody();if(activeTab==="facilities")return facilities();if(activeTab==="energy")return energy();if(activeTab==="finance")return finance();if(activeTab==="learn")return learn();if(activeTab==="tech")return techV2();if(activeTab==="ledger")return activityLedger();
  return method()
}
/* THE FIRST FIVE MINUTES. A player arriving here has no idea whether this is an idle clicker
   or a spreadsheet, how long a run takes, or what they are supposed to be optimising. The
   old three beats explained the mining loop well and never said any of that, so people
   learned what the game was by losing to it.

   Four beats now, in the order the questions actually arrive: what am I looking at, what
   will kill me, what should I expect, and what do I choose. The third one is new and it is
   the honest one - most eras are unprofitable for a small operator, and a player who knows
   that going in reads a bad month as the game working rather than as their own mistake. */
const INTRO_SLIDES=[
  {kicker:"Chapter one · the spare room",title:"An experiment worth keeping alive.",
    lead:"What happens to Bitcoin is already written. What happens to your operation is not.",
    body:"It is 2009. Bitcoin is running on ordinary computers, passed around by people who want to find out whether money can work without a central operator. You have a laptop and cash to begin. Keep the lights on: before trading opens, the coins you mine cannot pay the bills.",
    facts:[["1 laptop","your first operation"],["BTC","what mining earns"],["Cash","what pays the bills"]]}
];
function introModal(){
  const i=Math.max(0,Math.min(INTRO_SLIDES.length-1,introStep)),s=INTRO_SLIDES[i],last=i===INTRO_SLIDES.length-1;
  const selectedMode=startingMode(introDifficulty),capital=last?`<div class="starting-capital"><div class="capital-head"><span>Campaign start</span><output>${selectedMode.label} · ${dateFmt(selectedMode.start)}</output></div>${careerSummaryHtml("intro")}<div class="difficulty-grid" role="radiogroup" aria-label="Campaign start date">${STARTING_MODES.map(mode=>`<button class="difficulty-option ${mode.id===selectedMode.id?"active":""}" data-action="starting-mode" data-value="${mode.id}" role="radio" aria-checked="${mode.id===selectedMode.id}"><span>${mode.label}</span><strong>${dateFmt(mode.start)}</strong><small>${mode.desc}</small></button>`).join("")}</div><div class="capital-head liquidity-head"><span>Starting Liquidity · cash available on day one</span><output data-starting-cash-output>${fmtUsd(introStartingCash)}</output></div><input class="range-input" type="range" min="${STARTING_LIQUIDITY_MIN}" max="${STARTING_LIQUIDITY_MAX}" step="${STARTING_LIQUIDITY_STEP}" value="${introStartingCash}" data-starting-cash aria-label="Starting Liquidity"><div class="range-limits"><span>${fmtUsd(STARTING_LIQUIDITY_MIN)}</span><span>${fmtUsd(STARTING_LIQUIDITY_MAX)}</span></div><div class="capital-exact"><label for="starting-cash-exact">Exact amount</label><input id="starting-cash-exact" type="number" min="${STARTING_LIQUIDITY_MIN}" max="${STARTING_LIQUIDITY_MAX}" step="1" value="${introStartingCash}" data-starting-cash></div><p class="modal-note" style="margin:10px 0 0">Your start date and opening cash are recorded in the Ledger. Starting with more cash improves survival but does not directly add score.</p></div>`:"";
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="intro-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">${s.kicker}</div><h2 id="intro-title">${s.title}</h2><p class="lead">${s.lead}</p><div class="intro-purpose"><b>What this game is for</b><p>${GAME_PURPOSE_COPY}</p></div>${typeof introChatHtml==="function"?introChatHtml(selectedMode):""}<p>${(selectedMode.id==="easy"||selectedMode.id==="medium")?`It is 2009. Bitcoin is running on ordinary computers, passed around by people who want to find out whether money can work without a central operator. You have a laptop and cash to begin. Keep the lights on: before trading opens, the coins you mine cannot pay the bills.`:`${selectedMode.desc} ${selectedMode.id==="medium"?"Keep your laptop running and cover the first operating bill.":"Start paused and plan your first upgrade."}`}</p><details class="intro-customise"><summary>What changes as the years pass?</summary><p>Mining will grow from spare-room computers into industrial fleets. Places to trade will appear, make promises, and sometimes fail. Through it all, spending your coins depends on somebody being able to produce the right signatures.</p><p>At first, that somebody is you, with a key on the same laptop doing the mining. Keep a way back if the machine dies. Learn what you are trusting as the world around it changes.</p></details><div class="intro-grid">${s.facts.map(([b,sp])=>`<div class="intro-fact"><b>${b}</b><span>${sp}</span></div>`).join("")}</div><details class="intro-customise" ${introStep?"open":""}><summary>Customise your run</summary>${capital}</details><p class="modal-note">Recorded Bitcoin history, with derived and modelled operations. Pause anytime; the Method tab explains the numbers.</p><div class="modal-actions">${i>0?`<button class="action" data-action="intro-back">Back</button>`:""}${last?`<button class="action primary" data-action="begin">${(selectedMode.id==="easy"||selectedMode.id==="medium")?"Start your laptop":"Open your operation"}</button>`:`<button class="action primary" data-action="intro-next">Next</button>`}<span class="modal-note">${selectedMode.label} · ${dateFmt(selectedMode.start)}</span></div></div></section></div>`
}
function faucetMarkup(f){return `<div class="faucet-pop"><div class="faucet-bar"></div><div class="faucet-body"><b>Bitcoin Faucet · ${dateFmt(state.time)}</b><span>Free coins for anyone who asks - a real early-Bitcoin giveaway. Grab it before it's gone.</span><div class="modal-actions" style="margin-top:10px"><button class="action small primary" data-action="claim-faucet">Claim ${fmtBtc(f.amount)}</button></div></div></div>`}
function walletConceptSvg(){return `<div class="wallet-visual" role="img" aria-label="A block reward is assigned to an address. The address is watched by the wallet, and a private key creates the signature that lets the network spend the coins."><svg viewBox="0 0 760 184" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><linearGradient id="wallet-visual-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#182527"/><stop offset="1" stop-color="#0b1112"/></linearGradient><linearGradient id="wallet-visual-accent" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe1a1"/><stop offset="1" stop-color="#d9871c"/></linearGradient></defs><rect x="1" y="1" width="758" height="182" rx="8" fill="url(#wallet-visual-bg)" stroke="#33413e"/><g font-family="ui-monospace,monospace"><g fill="#101718" stroke="#82948f" stroke-width="2"><rect x="20" y="42" width="128" height="72" rx="5"/><rect x="214" y="42" width="128" height="72" rx="5"/><rect x="408" y="42" width="128" height="72" rx="5"/><rect x="602" y="42" width="138" height="72" rx="5"/></g><g fill="#dfe9e3" font-size="12" text-anchor="middle"><text x="84" y="64">BLOCK</text><text x="278" y="64">ADDRESS</text><text x="472" y="64">PRIVATE KEY</text><text x="671" y="64">SIGNATURE</text></g><g fill="#9ba8a3" font-size="10" text-anchor="middle"><text x="84" y="83">reward output</text><text x="84" y="98">recorded on-chain</text><text x="278" y="83">where coins</text><text x="278" y="98">are assigned</text><text x="472" y="83">kept secret</text><text x="472" y="98">spends coins</text><text x="671" y="83">nodes verify</text><text x="671" y="98">without trusting you</text></g><g fill="url(#wallet-visual-accent)" font-size="23" text-anchor="middle"><text x="181" y="85">→</text><text x="375" y="85">→</text><text x="569" y="85">→</text></g><path d="M44 132h672" stroke="#526560" stroke-width="2" stroke-dasharray="4 7"/><g fill="#86c79a" font-size="10" text-anchor="middle"><text x="84" y="153">the chain sees the output</text><text x="278" y="153">the wallet finds it</text><text x="472" y="153">the signer proves control</text><text x="671" y="153">the network checks the proof</text></g></g></svg><div class="wallet-visual-caption">A wallet does not store your bitcoin. It helps you find the coins assigned to you and prove that you are allowed to spend them.</div></div><div class="wallet-risk-visual" aria-label="The main wallet risks are generation, secrecy, backup and recovery"><div><span>1 · Generate</span><b>Unpredictable key</b><small>bad randomness can make guesses practical</small></div><div><span>2 · Protect</span><b>Keep it secret</b><small>a copied key is authority in somebody else's hands</small></div><div><span>3 · Back up</span><b>Survive failure</b><small>hardware can die without taking the wallet with it</small></div><div><span>4 · Recover</span><b>Practise the way back</b><small>a backup that cannot rebuild the wallet is not enough</small></div></div>`}
/* The ceremony's die: one button, pressed and held to shake, released to roll (src/ui/dice-shake.js). There is no way
   to pick a face; the browser's secure random source decides each throw when the die is released. */
function dieRollerSvg(face){
  const pip={1:[[50,50]],2:[[30,30],[70,70]],3:[[30,30],[50,50],[70,70]],4:[[30,30],[70,30],[30,70],[70,70]],5:[[30,30],[70,30],[50,50],[30,70],[70,70]],6:[[30,25],[70,25],[30,50],[70,50],[30,75],[70,75]]}[face];
  return `<svg class="die-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect x="4" y="4" width="92" height="92" rx="16"/><g>${pip?pip.map(([x,y])=>`<circle cx="${x}" cy="${y}" r="7"/>`).join(""):`<text x="50" y="66" text-anchor="middle">?</text>`}</g></svg>`;
}
function physicalDieModal(w,rolls,bits,sequence){
  const view=typeof diceView==="function"?diceView():{cls:"",face:rolls[rolls.length-1]||0,status:"",busy:false};
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dice-title"><div class="modal-body"><div class="modal-kicker">Dice ceremony · ${rolls.length} of 99</div><h2 id="dice-title">Shake the die, then roll it.</h2><p class="lead">Press and hold the die to shake it; the longer you hold, the harder it shakes. Let go to roll. Where it lands is chance: the browser's secure random source decides every throw, so nobody, you included, can pick the number.</p><div class="dice-stage"><button type="button" class="die-roller${view.cls}" data-dice-roller aria-describedby="dice-help" aria-label="Die. Press and hold to shake, release to roll."${view.busy?' aria-disabled="true"':""}>${dieRollerSvg(view.face)}</button></div><p id="dice-help" class="dice-help">Press and hold to shake, release to roll · Space or Enter works too</p><p class="dice-status" aria-hidden="true">${view.status||"&nbsp;"}</p><div class="dice-tally"><b>${rolls.length} / 99 rolls recorded</b><span>${bits} / 256 bits of entropy</span><small>Recent paper record: ${sequence||"—"} · after 8 rolls the browser can finish the rest.</small></div><div class="modal-actions"><button class="action" data-action="dice-finish"${view.busy||rolls.length<8?" disabled":""}${rolls.length<8?' title="Roll at least 8 times first"':""}>Let the browser finish the remaining rolls</button></div><p class="modal-note">Six outcomes per roll give log₂(6) ≈ 2.585 bits; 99 independent rolls give about 256 bits. Never use this demonstration key for real bitcoin.</p></div></section></div>`;
}
function walletCeremonyModal(){
  const w=state.walletSetup,rolls=w.rolls||[],bits=(rolls.length*Math.log2(6)).toFixed(1),sequence=rolls.slice(-18).join(" ");
  if(w.step===1)return physicalDieModal(w,rolls,bits,sequence);
  if(w.step===2)return '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-body"><div class="modal-kicker">Paper checkpoint</div><h2>Write the record, then destroy it.</h2><p class="lead">Copy the roll sequence onto paper by hand and check it once. Paper can carry authority, so anyone who finds it can copy the key.</p><div class="wallet-key-reveal">'+rolls.join(" ")+'</div>'+(w.paperRecorded?'<div class="risk medium">Paper record marked complete. Keep no photograph or digital copy.</div><div class="modal-actions"><button class="action danger" data-action="wallet-paper-destroyed">Destroy the paper record</button></div>':'<div class="modal-actions"><button class="action primary" data-action="wallet-paper-recorded">I wrote the roll sequence on paper</button></div>')+'<p class="modal-note">In a real wallet, destroy only a temporary ceremony sheet after verifying the protected signer and recovery plan. Never destroy your only tested backup.</p></div></section></div>';
  return '<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-body"><div class="modal-kicker">Key-holder oath</div><h2>Promise to manage the authority.</h2><p class="lead">A passkey authenticates you to an everyday service. A Bitcoin private key can authorise spending. The network checks the signature with maths, but cannot tell whether the signer is you or undo a payment.</p><div class="oath-card"><p>I will keep signing authority secret, verify destinations, maintain tested recovery, and treat the device, backup, encryption and randomness as separate responsibilities.</p><small>Hashing makes tampering visible; hash rate makes rewriting history expensive. Neither protects a stolen private key.</small></div><div class="modal-actions"><button class="action primary" data-action="wallet-oath">I accept the key-holder oath</button></div><p class="modal-note">This is an educational demonstration, not production wallet cryptography. The browser save is not encrypted.</p></div></section></div>';
}
function walletSetupModal(){
  const w=state.walletSetup;
  if(!w.done&&w.step>=1&&w.step<=3)return walletCeremonyModal();
  if(w.step===0){
    return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="wallet-setup-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">${dateFmt(state.time,true)} · one thing first</div><h2 id="wallet-setup-title">A block reward needs somewhere to go.</h2><p class="lead">${state.walletSetup.required&&!state.walletSetup.demo?"Solo mining and pool mining pay in different ways. In solo mining, if your machine finds a block, that block contains a coinbase transaction creating the block subsidy plus transaction fees for your payout address. In pool mining, your machine submits proof-of-work shares to the pool; the pool's coinbase pays the pool when it finds a block, then the pool credits you under its payout rules, usually in smaller but more regular payments after its fee. ":""}${WALLET_UTXO_COPY}{walletConceptSvg()}<p>This ceremony is a lesson about how wallets begin, not a real wallet generator. Real operators care about entropy, address verification, backups, device failure and recovery because a copied or lost key can matter more than the hardware that held it. Roll the dice yourself, then let the browser finish the 99-roll example. Never use the result for real bitcoin: this game leaves the key unencrypted in the browser and does not implement production wallet cryptography.</p><details class="intro-customise"><summary>What are you responsible for?</summary><p>Generate the key from unpredictable randomness, keep it secret, and preserve enough information to rebuild the wallet after a lost laptop, dead signer or damaged backup. Check the destination before sending: Bitcoin can verify that a signature is valid, but it cannot reverse a payment sent to the wrong address or know that somebody else copied your key.</p><p>A password protects an app. A PIN protects a device. A security key can protect an account. The spending key is different: it is the authority the network accepts. Hardware wallets, offline signing, multisig and geographically separate backups reduce different risks; none of them removes the need to understand what you are protecting.</p></details><p class="modal-note">The browser supplies fresh randomness for the dice. The campaign seed does not recreate this key.</p><div class="modal-actions"><button class="action primary" data-action="wallet-setup-start">Create the wallet</button><button class="action-link" data-action="wallet-setup-skip">${state.walletSetup.required&&!state.walletSetup.demo?"Generate the key for me":"Skip the demonstration"}</button></div></div></section></div>`;
  }
  const tier=WALLET_SOFTWARE[walletSoftwareTierAt(state.campaignStart)];
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Wallet ready · return to your operation</div><h2>Your operation can now receive mining rewards.</h2><p class="lead">The rolls produced this illustrative private key:</p><div class="wallet-key-reveal">${w.keyHex}</div><p class="modal-warning"><b>Do not use this key for real bitcoin.</b> A real wallet derives addresses and backups through additional cryptography that this demonstration does not implement, and this key is kept unencrypted in your browser.</p><p>Your ${dateFmt(state.campaignStart,true)} campaign uses <b>${tier.name}</b>: ${tier.desc}</p><p class="modal-note">Every page carries a panel saying what it is for and what to do next, and the Method tab explains where any number on screen comes from.</p>${state.walletSetup.demo?`<div class="modal-actions"><button class="action primary" data-action="wallet-setup-done">Open the operation</button></div>`:`<p>This is the key behind your online wallet, a file on the computer in the mine. If that computer is lost and nothing else holds the key, so are the coins in it.</p><div class="modal-actions"><button class="action primary" data-action="wallet-setup-done" data-value="backup">Write it down, then open the operation</button><button class="action-link" data-action="wallet-setup-done">Open the operation without a backup</button></div>`}</div></section></div>`;
}
function transactionImpactBase(transaction){if(transaction.action==="transfer")return "This transfer puts the coins in flight in the game until signing finishes. Keeping signing access separate reduces online exposure, but gathering the required signatures takes time: check the next bill date before you commit. The network fee pays for transaction space, and grows with the inputs being spent rather than simply with the BTC amount.";if(transaction.action==="order-parts-bulk")return "Cash leaves now; the parts arrive after the lead time and cannot be cancelled. Spare parts do not expire, but capital tied up in a shelf is capital not buying machines or paying a bill.";if(transaction.action==="buy-btc")return transaction.id==="etf"?"You buy a security whose value follows bitcoin. It cannot be withdrawn to your own Bitcoin wallet or used to sign a Bitcoin payment. The cash committed here is unavailable for operating bills until you sell.":"You exchange bill-paying cash for bitcoin held by this operator. A login and a displayed balance do not give you the spending keys: withdrawal is the step that puts the coins under your control. Check the cash left for your next bill.";if(transaction.action==="sell-btc")return"You sell part of this position to raise bill-paying cash. Fees and, for bitcoin trades, modelled order-book impact reduce the proceeds. A quoted price is a reference; the amount received is what the operation can spend.";if(transaction.action==="buy-hw"||transaction.action==="buy-hw-btc")return"You commit money before these machines can earn. Delivery and commissioning take time, and capacity is reserved immediately. Compare the extra expected BTC with electricity, cooling and fixed costs; a larger hash rate alone does not guarantee a profitable purchase.";if(transaction.action==="sell-hw"||transaction.action==="sell-hw-btc")return"You turn retired equipment into cash or bitcoin and give up the option to restart those machines. Cash can pay a bill directly; bitcoin may need a further sale. Check which asset this transaction returns.";if(transaction.action==="buy-strategy")return"You buy a security rather than bitcoin controlled by your keys. Its value and any distributions follow its own terms in the game. Money invested here cannot pay an operating bill until you sell the position.";if(transaction.action==="sell-strategy")return"The security position falls and its modelled sale value becomes spendable cash.";if(transaction.action==="buy-backup-node")return`Independent verification can continue when the primary site fails. This backup does not replace the local mining or Lightning services. Keeping it running adds ${fmtUsd(BACKUP_NODE.monthly)} to monthly costs.`;if(transaction.action==="buy-node")return"A node checks blocks and transactions against Bitcoin rules, reducing reliance on someone else reporting the chain honestly. It needs connectivity, storage and time to catch up. Buying it adds verification capacity rather than mining income.";return"The balances shown below become final when you confirm."}
function transactionImpact(transaction){if(transaction.action==="deposit-sell")return "This convenience route moves hot-wallet BTC to the selected venue and sells it immediately. It is one reviewed action, but it still crosses a custody boundary and pays the transfer cost, venue fee and any market impact.";return transactionImpactBase(transaction)}
function transactionConfirmationModal(){
  const transaction=pendingTransaction;if(!transaction)return"";
  return `<div class="modal-backdrop"><section class="modal transaction-feedback-modal" role="dialog" aria-modal="true" aria-labelledby="transaction-confirm-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Decision review · nothing has moved · ${dateFmt(transaction.quoteTime)}</div><h2 id="transaction-confirm-title">${escapeHtml(transaction.title)}</h2><p class="lead">The simulation and quote are paused. Check what leaves now, when the return becomes usable, and what remains for your next bill before confirming.</p><div class="confirm-exchange"><div class="confirm-side"><span>You give now</span><strong>${escapeHtml(transaction.give)}</strong><small>${escapeHtml(transaction.giveSub)}</small></div><div class="confirm-arrow" aria-hidden="true">→</div><div class="confirm-side receive"><span>You receive</span><strong>${escapeHtml(transaction.receive)}</strong><small>${escapeHtml(transaction.receiveSub)}</small></div></div><div class="confirmation-impact"><span>Operational consequence</span><p>${escapeHtml(transactionImpact(transaction))}</p></div><div class="confirm-breakdown"><div><span>Locked reference</span><b>${escapeHtml(transaction.reference)}</b></div><div><span>Cost and fees</span><b>${escapeHtml(transaction.fees)}</b></div>${transaction.depth?`<div class="confirm-depth"><span>Order-book depth</span><b>${escapeHtml(transaction.depth)}</b></div>`:""}<div><span>Position afterward</span><b>${escapeHtml(transaction.after)}</b></div></div><div class="modal-actions"><button class="action" data-action="cancel-transaction">Cancel · change nothing</button><button class="action ${transaction.confirmClass||"primary"}" data-action="confirm-transaction">${escapeHtml(transaction.confirmLabel||"Confirm transaction")}</button></div></div></section></div>`
}
function endModal(){
  const score=operatorScoreBreakdown(),peers=[{name:"Cycle architect",score:940},{name:"Antifragile operator",score:860},{name:"Industrial compounder",score:775},{name:"Disciplined miner",score:680},{name:"Surviving operator",score:540},{name:"Passive early holder",score:260},{name:"Insolvent hasher",score:120},{name:"You",score:score.total,you:true}].sort((a,b)=>b.score-a.score),rank=peers.findIndex(x=>x.you)+1,reason=state.endReason==="receivership"?"The scored campaign ended in a third receivership.":state.endReason==="nomarket"?"The cash ran out before Bitcoin had a market price. There was nothing to sell the coins into and no miner left to sell, so the bill could not be met and the scored campaign ends.":state.endReason==="sandbox-complete"?"100 simulated years of procedural continuation have now passed.":"The historical record is complete.";
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Operator campaign complete</div><h2>You finished #${rank} of ${peers.length} · ${operatorGrade(score.total)}.</h2><p class="lead">${reason} Final Operator Score: ${score.total} / 1,000.</p><div class="intro-grid"><div class="intro-fact"><b>${score.performance}</b><span>operations · max 740</span></div><div class="intro-fact"><b>${score.mastery}</b><span>operator mastery · max 60</span></div><div class="intro-fact"><b>${score.milestones+score.holdings}</b><span>milestones + holdings · max 120</span></div><div class="intro-fact"><b>${score.balance+score.resilience}</b><span>reserves + resilience · max 80</span></div><div class="intro-fact"><b>${fmtBtc(totalBtc()+lightningLocked())}</b><span>total BTC · any custody</span></div></div><p class="modal-note">Peak operator level ${state.xp.peakLevel} contributed ${score.mastery} of a possible 60 mastery points, earned from ${fmtNum(Math.round(state.xp.total))} lifetime XP: ${fmtNum(Math.round(state.xp.sources.shares))} from difficulty-1 shares found, ${fmtNum(Math.round(state.xp.sources.record))} from new best-share records (best: ${state.xp.bestDifficulty?fmtDifficulty(state.xp.bestDifficulty):"none"}), ${fmtNum(Math.round(state.xp.sources.deploy))} from machines deployed and ${fmtNum(Math.round(state.xp.sources.repair))} from repairs completed.</p><p class="modal-note">The score rewards operating through every era. Total BTC held at the end counts the same whether it sits in self-held keys, an exchange balance or a Lightning channel - but it cannot replace profitable months, paid bills, uptime and competitive reinvestment.</p>${runRecap()}${careerSummaryHtml("end")}<div class="leaderboard">${peers.map((x,i)=>`<div class="rank ${x.you?"you":""}"><span>#${i+1}</span><span>${x.name}</span><b>${x.score}</b></div>`).join("")}</div><p class="modal-note">Synthetic comparison strategies for gameplay - not real miners or investment results.</p><div class="modal-actions"><button class="action primary" data-action="close-end">Inspect final ledger</button><button class="action" data-action="export">Export run</button></div></div></section></div>`
}
let pointerHeld=false,deferredRender=null,deferredSince=0;
function runDeferredRender(){const run=deferredRender;deferredRender=null;deferredSince=0;if(run)run()}
function holdRendersDuringPress(){
  document.addEventListener("pointerdown",()=>{pointerHeld=true},true);
  // Flush after the click has been dispatched, never before: releasing and repainting in
  // the same task would destroy the target again on the way to the handler.
  document.addEventListener("click",()=>{pointerHeld=false;runDeferredRender()},false);
  for(const type of ["pointerup","pointercancel"]) document.addEventListener(type,()=>{pointerHeld=false},true);
  window.addEventListener("blur",()=>{pointerHeld=false;runDeferredRender()});
  // A press that never reports a release must not freeze the interface.
  setInterval(()=>{if(deferredRender&&!pointerHeld&&performance.now()-deferredSince>350){runDeferredRender()}else if(deferredRender&&performance.now()-deferredSince>1500){pointerHeld=false;runDeferredRender()}},150);
}
function deferWhilePressed(repaint){
  if(!pointerHeld)return false;
  deferredRender=repaint;if(!deferredSince)deferredSince=performance.now();
  return true;
}
/* THE BANNERS ARE ONLY BUILT BY render().

   The tick repaints with refreshLive(), which patches text, or renderMineContent(), which
   replaces the tab's content and nothing above it. Neither touches the banner strip - so on
   the Mine tab an incident banner was never rebuilt by the clock at all, and sat there
   advertising a restoration date that had already passed until some unrelated action forced
   a full render. Cheap scalars only: this runs on every repaint. */
let lastBannerSignature=null;
function migrationStatus(){
  if(typeof fleetGrounded!=="function"||!fleetGrounded())return null;
  const move=state.relocationJob,upgrade=state.facilityUpgradeJob;
  const job=move||upgrade;if(!job)return null;
  const name=move?(REGIONS.find(r=>r.id===move.id)?.name||move.id)
    :(FACILITIES.find(f=>f.id===upgrade.id)?.name||upgrade.id);
  return{kind:move?"Relocation":upgrade.down?"Downsizing":"Site upgrade",
    name,due:job.due,days:Math.max(0,Math.ceil((job.due-state.time)/DAY)),
    region:!!move};
}
function bannerSignature(){
  const incident=typeof activeSiteIncident==="function"?activeSiteIncident():null;
  const migration=migrationStatus();
  return [incident?`${incident.kind}:${incident.until}`:"",
    typeof floorSceneSignature==="function"?floorSceneSignature():"",
    migration?`${migration.kind}:${migration.due}`:"",
    typeof fleet==="function"&&!fleet().within?"overcapacity":"",
    state.debt>0?"debt":"",state.policyLock||"",
    state.pendingSettlement?"settlement":"",state.settlementSaleMode?"sale":"",
    typeof gridCutOff==="function"&&gridCutOff()?"cut":""].join("|");
}
function bannerStateChanged(){
  const current=bannerSignature();
  if(current===lastBannerSignature)return false;
  lastBannerSignature=current;
  return true;
}
/* THE MODAL THAT NEVER ARRIVED.

   Modals live in render()'s markup and nowhere else. renderMineContent() patches the .content
   div, which sits inside the layout a modal is drawn OUTSIDE of - so on the Mine tab it cannot
   put one on screen, and on every other tab it falls back to render() and the problem is
   invisible. A major event sets state.speed to 0 and state.activeEvent, then the tick repaints
   through renderMineContent(). The clock stopped, the dialog explaining why did not appear, and
   the player sat looking at a dead timeline until some unrelated change forced a full render.

   Which modal ought to be on screen is therefore structural, exactly like the banner strip
   above the tabs: when it changes, only a full render can be right. */
let lastModalSignature=null;
function modalSignature(){
  return [!state.started?"intro":"",state.started&&!state.walletSetup.done?"wallet":"",
    typeof pendingLoss==="function"&&pendingLoss()?`loss:${pendingLoss().id}`:"",
    state.activeEvent||"",glossaryOpen?"glossary":"",state.hardwareAlerts.active||"",
    state.pendingSettlement&&!state.settlementSaleMode?"settlement":"",
    state.ended&&!state.endDismissed?"end":""].join("|");
}
function modalStateChanged(){
  const current=modalSignature();
  if(current===lastModalSignature)return false;
  lastModalSignature=current;
  return true;
}
/* KEYBOARD FOCUS SURVIVES A REPAINT.

   A full render replaces #app wholesale, so the focused control used to be destroyed and focus fell back
   to <body>: a keyboard player lost their place every time the clock ticked a repaint, and after a modal
   opened Tab walked the page behind it. Before the repaint the focused control is noted by what it does
   (its id, or its data-action and the values that tell it from its neighbours); afterwards the same
   control is focused again. A modal or the tour card takes focus only when nothing else in the page has it. */
function captureFocus(){
  const el=document.activeElement,app=document.getElementById("app");
  if(!el||el===document.body||!app||!app.contains(el))return null;
  if(el.id)return `#${CSS.escape(el.id)}`;
  const d=el.dataset||{};if(!d.action)return null;
  return el.tagName.toLowerCase()+["action","value","id","part","from","to"].filter(k=>d[k]!==undefined).map(k=>`[data-${k}="${CSS.escape(d[k])}"]`).join("");
}
function restoreFocus(selector){
  if(selector){const el=document.querySelector(selector);if(el&&!el.disabled&&el!==document.activeElement)el.focus({preventScroll:true})}
  const active=document.activeElement,app=document.getElementById("app");
  if(active&&active!==document.body&&app&&app.contains(active)&&!(active.closest(".modal-backdrop")===null&&document.querySelector(".modal-backdrop")))return;
  const layer=[...document.querySelectorAll(".modal-backdrop")].pop()||document.querySelector(".tour-card");
  const target=layer&&(layer.querySelector(".action.primary:not([disabled])")||layer.querySelector("button:not([disabled])"));
  if(target)target.focus({preventScroll:true});
}
function render(preserveScroll=true){
  if(deferWhilePressed(()=>render(preserveScroll)))return;
  deferredRender=null;deferredSince=0;
  const focusSelector=captureFocus();
  const revision=++renderRevision;
  const app=document.getElementById("app"),scrollX=window.scrollX,scrollY=window.scrollY||document.documentElement.scrollTop||0,keepPosition=preserveScroll&&scrollY>0,previousHeight=keepPosition?app.offsetHeight:0;
  const anchor=keepPosition?captureScrollAnchor():null;
  if(keepPosition)app.style.minHeight=`${previousHeight}px`;
  const banner=state.debt>0||state.policyLock?`<div class="status-banner ${state.debt>0&&!gridCutOff()?"warning":""}"><strong>${state.policyLock?"Policy shutdown":gridCutOff()?"Grid disconnected":"Operating bill in arrears"}</strong><span>${state.policyLock||fmtUsd(state.debt)+" must be paid before mining resumes."}</span><div class="push actions">${state.debt>0?`<button class="action small primary" data-action="pay-debt" ${state.cash<state.debt?"disabled":""}>Pay ${fmtUsd(state.debt)}</button>`:""}<button class="action small" data-action="tab" data-value="${state.policyLock?"facilities":"market"}">${state.policyLock?"Relocate":"Raise cash"}</button></div></div>`:"",overCapacity=(()=>{const fs=fleet();return fs.within?null:{fs,f:facility()}})(),
    overCapacityBanner=overCapacity?`<div class="status-banner overcapacity-banner"><strong>Fleet exceeds the site · nothing is hashing</strong><span>${escapeHtml(siteStopReason())}</span><div class="push actions"><button class="action small primary" data-action="tab" data-value="facilities">Open Facilities</button><button class="action small" data-action="tab" data-value="mine">Retire machines</button></div></div>`:"",
    migration=migrationStatus(),migrationBanner=migration?`<div class="incident-banner migration-banner"><strong>${migration.kind} in progress · fleet offline</strong><span>Every machine is powered down, crated and in transit to ${migration.name} · ${migration.days} simulation day${migration.days===1?"":"s"} remaining, arriving ${dateFmt(migration.due)}. Rent, payroll, finance and ${migration.region?"the new region's":"the site's"} fixed costs keep accruing while nothing is hashing, and no machine can be serviced until it is racked again.</span><button class="action small" data-action="tab" data-value="facilities">Open Facilities</button></div>`:"",incident=activeSiteIncident(),incidentBanner=incident?`<div class="incident-banner"><strong>${incident.kind} · fleet offline</strong><span>${region().name} / ${facility().name} · estimated restoration ${dateFmt(incident.until)} · ${Math.max(0,Math.ceil((incident.until-state.time)/DAY))} simulation days remaining</span><button class="action small" data-action="tab" data-value="facilities">Open Operations</button></div>`:"",settlementBanner=state.pendingSettlement&&state.settlementSaleMode?`<div class="status-banner settlement-sale-banner"><strong>Settlement paused · ${fmtUsd(Math.max(0,state.pendingSettlement.due-state.cash))} short</strong><span>Deposit self-held BTC onto an exchange and sell it there - the bill clears automatically once cash covers it.</span><div class="push actions"><button class="action small primary" data-action="tab" data-value="market">Open Market</button><button class="action small" data-action="cancel-settlement-sale">Choose a different rescue</button></div></div>`:"",forecast=!state.pendingSettlement&&state.started?settlementForecast():null,forecastBanner=forecast&&forecast.cashAfter<0?`<div class="status-banner forecast-warning-banner"><strong>Cash shortfall ahead · ${fmtUsd(-forecast.cashAfter)} short</strong><span>At today's burn rate, the bill due ${dateFmt(forecast.dueAt,true)} (${fmtUsd(forecast.estimated)}) won't be covered by current cash. Raise fiat now, or the month-end settlement will force a rescue.${forecast.cold>0?` ${fmtBtc(forecast.cold)} of your treasury is in cold storage and a signing ceremony takes ${forecast.reachDays} day${forecast.reachDays===1?"":"s"}${forecast.coldTooSlow?` - longer than the ${forecast.days} day${forecast.days===1?"":"s"} you have. Start the transfer now or those coins cannot reach this bill.`:`, so start the transfer with time to spare.`}`:""}</span><div class="push actions"><button class="action small primary" data-action="tab" data-value="market">Open Market</button></div></div>`:"",exposureBanners=EXPOSURE_WARNINGS.filter(w=>state.time>=at(w.date)&&state.time<at(EVENTS.find(e=>e.id===w.eventId)?.date||0)&&(w.wallet?state.wallets[w.wallet]>0:state.region===w.region)).map(w=>`<div class="status-banner exposure-warning-banner"><strong>${w.title}</strong><span>${w.wallet?`${fmtBtc(state.wallets[w.wallet])} exposed on ${walletName(w.wallet)}`:`${region().name} exposure`}</span><div class="push actions"><button class="action small primary" data-action="tab" data-value="${w.wallet?"market":"facilities"}">${w.wallet?"Open Market":"Open Facilities"}</button></div></div>`).join("");
  document.getElementById("app").innerHTML=`${svgSpriteDefs()}<div class="app">${renderHeader()}${banner}${overCapacityBanner}${migrationBanner}${incidentBanner}${settlementBanner}${forecastBanner}${exposureBanners}<div class="shell"><main class="main">${nav()}<div class="content">${content(revision)}</div></main>${typeof internetCut==="function"&&internetCut()?offlineSidebarHtml():sidebar()}</div>${footerHtml()}</div>${!state.started?introModal():""}${state.started&&!state.walletSetup.done?walletSetupModal():""}${typeof pendingLoss==="function"&&pendingLoss()?lossModal():state.activeEvent?eventModal():""}${glossaryOpen?glossaryModalHtml():""}${state.hardwareAlerts.active?hardwareReleaseModal():""}${state.pendingSettlement&&!state.settlementSaleMode?settlementModal():""}${state.ended&&!state.endDismissed?endModal():""}${toast?toastMarkup(toast):""}${faucet?faucetMarkup(faucet):""}${saveNoticeHtml()}`;
  enhanceActiveTab();
  measureTabRow();
  if(typeof tourAfterRender==="function")tourAfterRender();
  flushDeferredToasts();
  if(typeof applyOfflineChrome==="function")applyOfflineChrome();
  if(typeof maybeCelebrate==="function")maybeCelebrate();
  if(typeof applyAdminUiConfig==="function")applyAdminUiConfig();
  // A full render has just drawn the banners, so the next tick has nothing to catch up on.
  lastBannerSignature=bannerSignature();lastModalSignature=modalSignature();
  if(pendingTransaction)document.getElementById("app").insertAdjacentHTML("beforeend",transactionConfirmationModal());
  restoreFocus(focusSelector);
  setTimeout(()=>{if(revision===renderRevision)enhanceDisabledControls()},0);
  if(keepPosition){window.scrollTo({left:scrollX,top:scrollY,behavior:"instant"});restoreScrollAnchor(anchor);requestAnimationFrame(()=>{app.style.minHeight=""})}else app.style.minHeight="";
}
function scrollAnchorCards(){return [...document.querySelectorAll(".content .card, .content section")]}
function scrollAnchorKey(card){
  // Index is useless here: the whole point is that cards get inserted and
  // removed above the reader. Key on the heading, which survives a rebuild.
  const heading=card.querySelector("h1,h2,h3,h4");
  const text=heading&&heading.textContent?heading.textContent.trim().slice(0,60):"";
  return text||String(card.className||"").trim().slice(0,60);
}
function captureScrollAnchor(){
  const cards=scrollAnchorCards(),top=window.scrollY||document.documentElement.scrollTop||0;
  for(let i=0;i<cards.length;i++){
    const rect=cards[i].getBoundingClientRect();
    if(rect.bottom>4)return{key:scrollAnchorKey(cards[i]),index:i,offset:rect.top,scroll:top};
  }
  return{key:"",index:-1,offset:0,scroll:top};
}
function restoreScrollAnchor(anchor){
  if(!anchor)return;
  const apply=()=>{
    const cards=scrollAnchorCards();
    let card=anchor.key?cards.find(c=>scrollAnchorKey(c)===anchor.key):null;
    if(!card&&anchor.index>=0)card=cards[anchor.index];
    if(!card){window.scrollTo({left:0,top:anchor.scroll,behavior:"instant"});return}
    const delta=card.getBoundingClientRect().top-anchor.offset;
    if(Math.abs(delta)>1)window.scrollBy({left:0,top:delta,behavior:"instant"});
  };
  apply();
  requestAnimationFrame(apply);
}
/* The tab row's height changes with the breakpoint, and anything sticking beneath it needs
   to know. Measured rather than hardcoded so the two cannot drift apart. */
function measureTabRow(){
  // What sticks beneath the topbar on a phone sits at the topbar's real height, not a guess.
  const topbar=document.querySelector(".topbar");
  if(topbar){
    const bar=Math.round(topbar.getBoundingClientRect().height);
    if(bar>0)document.documentElement.style.setProperty("--topbar-live-h",bar+"px");
  }
  const tabs=document.querySelector("nav.tabs");
  if(!tabs)return;
  const height=Math.round(tabs.getBoundingClientRect().height);
  if(height>0)document.documentElement.style.setProperty("--tabs-h",height+"px");
}
// Rotating a phone or resizing a window changes the topbar's height without a repaint.
window.addEventListener("resize",()=>measureTabRow());
function renderMineContent(){
  if(deferWhilePressed(renderMineContent))return;
  if(activeTab!=="mine")return render();
  const host=document.querySelector(".content");if(!host)return render();
  const scrollY=window.scrollY||document.documentElement.scrollTop||0,keepPosition=scrollY>0,previousHeight=keepPosition?host.offsetHeight:0;
  const anchor=keepPosition?captureScrollAnchor():null;
  if(keepPosition)host.style.minHeight=`${previousHeight}px`;
  ++renderRevision;
  // Build, enhance and restore position in one synchronous task. Deferring the
  // enhancement let the browser paint the short un-enhanced tab first, which
  // is what made a fault notification visibly kick the page down.
  host.innerHTML=mine();
  enhanceMine();refreshMinePricing();measureTabRow();
  enhanceDisabledControls();
  if(keepPosition){restoreScrollAnchor(anchor);requestAnimationFrame(()=>{host.style.minHeight=""})}
  else host.style.minHeight="";
  refreshLive();
}
