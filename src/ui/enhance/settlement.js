"use strict";

/* THE SETTLEMENT MODAL - what the player is offered when a bill cannot be met.

   It used to be a base template patched by a chain of string replacements, each pinned by an exact-text
   contract: a later change to a sentence in one place silently stopped the patch matching in another, and
   the card for a new way of paying had to be spliced in by finding a class name in the markup. It is a
   list of options now, and the template says what it shows.

   Every option is data (a tone, a heading, what happens at once and what it costs, and one button), so
   a new way of meeting a bill is one more entry, and the reserve and loan cards that Treasury adds sit
   at the head of the list because they are the ones that keep the coins. */

function settlementOption(o){
  const b=o.button;
  return `<article class="venue"><div class="risk ${o.tone}">${o.label}</div><h3>${o.title}</h3><p>${o.text}</p>
    <button class="action small ${b.cls||""}" data-action="${b.action}" ${b.disabled?"disabled":""}${b.title?` title="${b.title}"`:""}>${b.text}</button></article>`;
}

function settlementOptions(short,strike){
  const plan=fleetLiquidationPlan(short,null,true),noMarket=state.time<MARKET,haircut=Math.round(Math.min(.25,.1+state.operator.restructures*.05)*100);
  const saleable=HARDWARE.filter(h=>!h.permanent&&(state.hardware[h.id]||0)>0).reduce((sum,h)=>sum+resaleHardwareValue(h)*(state.hardware[h.id]||0),0);
  return [
    {tone:"medium",label:"TREASURY RESCUE",title:"Sell on an exchange",
      text:"Immediate effect: move BTC to an exchange and sell enough to raise cash. Consequence: the month is recorded as a rescue rather than a clean settlement.",
      button:{action:"settle-btc",cls:"primary",text:"Go to the exchange",disabled:state.time<MARKET||controlled()<=1e-12}},
    {tone:"medium",label:"FLEET RESCUE",title:"Sell miners to cover it",
      text:plan.qty?`Immediate effect: sell ${liquidationPlanLabel(plan)} for ${fmtUsd(plan.total)}.${plan.covered?" The bill will clear.":` ${fmtUsd(plan.remaining)} will still be due.`}`:"Immediate effect: no non-permanent mining hardware remains to sell.",
      button:{action:"settle-liquidate",text:plan.qty?`Sell ${fmtCompactNumber(plan.qty)} miner${plan.qty===1?"":"s"} · raise ${fmtUsd(plan.total)}`:"No saleable miners",disabled:saleable<=0}},
    {tone:"high",label:"15% ORIGINATION PENALTY",title:"Emergency bridge finance",
      text:`Immediate effect: receive ${fmtUsd(short)} cash. Consequence: ${fmtUsd(short*1.15)} is added to project debt, including the 15% penalty.`,
      button:{action:"settle-bridge",text:`Borrow ${fmtUsd(short*1.15)}`,disabled:state.time<MARKET}},
    {tone:"medium",label:"GRACE UNTIL THE NEXT BILL",title:"Miss this month's bill",
      text:`Immediate effect: ${fmtUsd(short)} goes into arrears and the site keeps running. Consequence: if the arrears are still owed at the next bill date, power and internet are cut until they are paid, and the month is recorded as a rescue.`,
      button:{action:"settle-defer",text:`Carry ${fmtUsd(short)} into arrears`,disabled:state.debt>0||noMarket,title:noMarket?NO_MARKET_RULE:state.debt>0?"You are already carrying arrears; the grid is cut at the next bill date":""}},
    {tone:"high",label:`FAIL FORWARD · STRIKE ${strike}`,title:"Enter receivership",
      text:`Immediate effect: lose ${haircut}% of self-held BTC and 25% of installed miners. Consequence: strike ${strike} of 3; the third ends the scored campaign.`,
      button:{action:"settle-receivership",cls:"danger",text:strike>=3?"End scored campaign":"Restructure and continue",disabled:noMarket,title:noMarket?NO_MARKET_RULE:""}}
  ];
}

function settlementModal(){
  const p=state.pendingSettlement,short=Math.max(0,p.due-state.cash),strike=state.operator.restructures+1;
  const btcNeeded=state.time>=MARKET?short/(priceAt(state.time)*(1-RESERVE_FEE)):Infinity;
  const saleable=HARDWARE.filter(h=>!h.permanent&&(state.hardware[h.id]||0)>0).reduce((sum,h)=>sum+resaleHardwareValue(h)*(state.hardware[h.id]||0),0);
  const reserve=typeof settlementReserveCard==="function"?settlementReserveCard():"";
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="settlement-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Monthly settlement · time paused</div><h2 id="settlement-title">${fmtUsd(short)} is needed before the operation can continue.</h2><p class="lead">The ${fmtUsd(p.due)} operating bill is due now and only ${fmtUsd(state.cash)} is available in cash. Time remains paused until you choose. ${state.time<MARKET?`There is no market for Bitcoin yet, so mined coins cannot be sold: selling miners is the only way to raise the cash, and the bill cannot be missed or restructured away.`:"Missing the bill is a route, not a failure state - it costs you the grid if it runs past the next bill date."}</p><div class="intro-grid"><div class="intro-fact"><b>${fmtUsd(state.cash)}</b><span>liquid cash</span></div><div class="intro-fact"><b>${state.time>=MARKET?fmtBtc(btcNeeded):"No market"}</b><span>self-held BTC needed</span></div><div class="intro-fact"><b>${fmtUsd(saleable)}</b><span>estimated miner resale</span></div><div class="intro-fact"><b>${strike} / 3</b><span>next receivership strike</span></div></div><div class="venue-grid settlement-choice-grid">${reserve}${settlementOptions(short,strike).map(settlementOption).join("")}</div><p class="modal-note" style="margin-top:12px">A clean monthly settlement earns solvency points. Emergency BTC sales, liquidation and bridge finance keep the run alive but do not count as a clean solvent month.</p></div></section></div>`;
}
