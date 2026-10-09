"use strict";

/* THE TREASURY - one place for the money, in three sections.

   Market, Custody and Finance were three tabs for one subject. Every decision about the operation's
   money crosses all of them: the bill is a Finance fact, the coins that pay it are a Custody fact, and
   the place they are sold is the Market. A player short of cash had to visit all three to see their
   own position, and the game's own notices pointed at each in turn.

   They are sections of one tab now, with a strip that is the same on all three: what can be spent
   today, how far away the rest is, how well it is kept, and when the next bill lands.

   THE OLD NAMES STILL WORK. Every toast, loss notice, banner and menu entry in the game says
   "custody", "market" or "finance", and there are dozens. They go through openTab(), which turns each
   into the Treasury plus the right section, so none of them had to change and none of them can land on a
   tab that no longer exists. A contract scans the source for every tab id it can find and requires it to
   resolve.

   The sections themselves are unchanged: market(), custody() and finance() draw what they always
   drew, and their enhancers run when their section is showing. activeTabKey() is the one word that
   tells the rest of the interface which of them that is. */

const TREASURY_SECTIONS=[
  {id:"market",name:"Market",hint:"Buy, sell and deposit"},
  {id:"custody",name:"Custody",hint:"Keys, places, people"},
  {id:"finance",name:"Finance",hint:"Bills, credit, cover"}
];
const TREASURY_SECTION_IDS=TREASURY_SECTIONS.map(s=>s.id);

/* The section showing, which an old or damaged save may have wrong. */
function treasurySection(){return TREASURY_SECTION_IDS.includes(state.treasurySection)?state.treasurySection:"market"}
/* What the rest of the interface should treat the current tab as: the section while the Treasury
   is open, the tab itself otherwise. Help terms, orientation copy and enhancers are keyed on it. */
function activeTabKey(){return activeTab==="treasury"?treasurySection():activeTab}
function resolveTab(id){return TREASURY_SECTION_IDS.includes(id)?{tab:"treasury",section:id}:{tab:id,section:null}}
/* Open a tab by any name it has ever had. Returns the tab that is now active. */
function openTab(id){
  const target=resolveTab(id);
  if(target.section)state.treasurySection=target.section;
  return target.tab;
}
/* Whether a button naming `id` is the one showing: a menu entry for a section is active only while
   that section is. */
function tabIsActive(id){
  const target=resolveTab(id);
  return target.section?activeTab==="treasury"&&treasurySection()===target.section:activeTab===id;
}

function setTreasurySection(id){
  if(!TREASURY_SECTION_IDS.includes(id))return;
  state.treasurySection=id;save();render(false);
  const head=document.querySelector(".treasury-strip");
  if(head)window.scrollTo({top:Math.max(0,head.getBoundingClientRect().top+window.scrollY-130),behavior:"instant"});
}

/* What each section would like you to glance at before opening it. */
function treasurySectionBadges(){
  const reach=treasuryReach(),posture=custodyPosture(),forecast=settlementForecast();
  const finance=forecast.cashAfter<0?{text:`short ${fmtUsd(Math.abs(forecast.cashAfter))}`,tone:"halted"}
    :reach.coldTooSlow?{text:"reserve too slow",tone:"halted"}:{text:`bill in ${reach.daysToBill}d`,tone:"good"};
  return{
    market:state.time<MARKET?{text:"no market yet",tone:""}:{text:fmtUsd(priceAt(state.time)),tone:"good"},
    custody:{text:`${posture.tier} posture`,tone:posture.rank>=2?"good":posture.rank<1?"halted":""},
    finance
  };
}
function treasurySectionNav(){
  const active=treasurySection(),badges=treasurySectionBadges();
  return `<nav class="mine-sections treasury-sections" aria-label="Treasury sections"><span class="mine-sections-label">Treasury</span><div class="mine-section-tabs" role="tablist">${TREASURY_SECTIONS.map(s=>{
    const badge=badges[s.id]||{text:"",tone:""};
    return `<button class="mine-section ${s.id===active?"active":""}" data-action="treasury-section" data-value="${s.id}" role="tab" aria-selected="${s.id===active}"><b>${s.name}</b><small>${s.hint}</small><i class="mine-section-badge ${badge.tone}">${badge.text}</i></button>`;
  }).join("")}</div></nav>`;
}

/* The same five numbers on every section: the position, whichever part of it you are looking at. */
function treasuryStrip(){
  const reach=treasuryReach(),posture=custodyPosture(),forecast=settlementForecast(),loan=typeof securedLoan==="function"?securedLoan():null;
  const first=posture.findings[0];
  const runway=reach.liquidRunwayDays===null?"":`${reach.liquidRunwayDays>=100?"100+":Math.round(reach.liquidRunwayDays)} days of bills`;
  const reserve=reach.cold>0?`${reach.reachDays} day${reach.reachDays===1?"":"s"} away · ${fmtNum(reach.coins)} coin${reach.coins===1?"":"s"}`:"nothing in cold storage";
  const moving=[reach.inFlight>0?`${fmtBtc(reach.inFlight)} on its way`:"",loan?`${fmtBtc(securedPledgedBtc())} pledged`:""].filter(Boolean).join(" · ");
  return `<section class="card treasury-strip" aria-label="Treasury position"><div class="metric-row">
    <div class="metric"><div class="label">Spendable</div><strong>${fmtUsd(state.cash)}</strong><small>${runway||"cash"}${state.debt>0?` · ${fmtUsd(state.debt)} overdue`:""}</small></div>
    <div class="metric"><div class="label">Hot wallet</div><strong>${fmtBtc(reach.hot)}</strong><small>sellable today${typeof hotKeyUnbacked==="function"&&hotKeyUnbacked()?" · key not backed up":""}</small></div>
    <div class="metric"><div class="label">Reserve</div><strong>${fmtBtc(reach.cold)}</strong><small>${reserve}${moving?` · ${moving}`:""}</small></div>
    <div class="metric"><div class="label">Custody</div><strong>${posture.tier}</strong><small>${first?first.text:"nothing is holding it back"}</small></div>
    <div class="metric"><div class="label">Next bill</div><strong>${reach.daysToBill} day${reach.daysToBill===1?"":"s"}</strong><small>${fmtUsd(forecast.estimated)}${reach.coldTooSlow?" · the reserve is too slow to meet it":forecast.cashAfter<0?" · cash will not cover it":" · covered"}</small></div>
  </div></section>`;
}

function treasury(){
  const sections={market,custody,finance};
  /* The strip and the section bar are children of the content itself, not wrapped together: a sticky bar sticks
     inside its parent, and a parent only as tall as the strip would release it a screen later. */
  /* The orientation card for the section sits under the bar, not above the strip: the position and the way
     between sections are what you came for, and the card explains whichever section you chose. */
  return `${treasuryStrip()}${treasurySectionNav()}${sectionPulse()}${sections[treasurySection()]()}`;
}
