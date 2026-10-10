"use strict";

/* SETTLEMENT - the month boundary, where the operation either pays for itself or does not.
   Costs accrue daily into a ledger; at each boundary that ledger is presented as one bill and
   has to be met from liquid cash. Nothing is sold on the player's behalf: mining pays in BTC
   and the bill is due in cash, so a shortfall stops the clock and the player chooses -- sell on
   an exchange at the Market, liquidate miners, bridge finance, miss the bill, receivership.
   An automatic "cover the bill" sale used to sit here and made idling through the game close to
   free: the treasury quietly paid every bill and nothing ever asked for a decision.

   Split out of simulation.js, which had reached the 70KB per-module ceiling. Nothing here is
   called before the page has finished parsing, so it can load in any order after the engine. */

/* NO MARKET, NO WAY TO KICK THE CAN.

   Before Bitcoin has a market price (July 2010) mined coins cannot be sold: there is nowhere to sell them into. Cash is the only
   thing that pays a bill, apart from selling miners. A run used to survive that gap by restructuring and carrying arrears bill after
   bill, which only deferred the same shortfall, since nothing in the meantime could raise cash. Now a bill that cash and a sale of
   miners cannot meet before the market opens ends the run. This is why the opening cash is $2,500 by default, and why the first
   months are about keeping the cost of the laptop and little else. */
const NO_MARKET_RULE="Bitcoin has no market price yet, so there is nothing to sell into and nobody to restructure with: before the market opens, a bill is paid from cash or by selling miners, and if neither covers it the run ends.";
function endRunNoMarket(due){
  const short=Math.max(0,due-state.cash);
  // Miners on the floor and in storage can still be sold, at resale value, for as much of it as they cover.
  if(fleetLiquidationPlan(short,null,true).covered)return false;
  state.pendingSettlement=null;state.settlementSaleMode=false;state.ended=true;state.endReason="nomarket";state.speed=0;
  log("Scored campaign ended","the cash ran out before Bitcoin had a market");
  if(typeof recordCareerRun==="function")recordCareerRun();
  setTimer();renderFullQueued=true;save();render();return true;
}

/* WHETHER THE SITE IS ON, AFTER A BILL.

   Paying a bill or clearing arrears restores the power that unpaid arrears had cut. It used to do that unconditionally, which also
   undid "Emergency stop all": a player who stopped the site on the 20th found it running again after the bill on the 1st, with the
   electricity accruing. A manual stop (state.manualStop) is the player's to undo, by pressing Start site power; only a policy lock
   keeps power off against the player's wishes. */
/* The button on the mining floor: Emergency stop all, and Start site power. Stopping is remembered as the player's own choice. */
function toggleSitePower(){
  state.power=!state.power;state.manualStop=!state.power;
  log(state.power?"Mining fleet started":"Mining fleet stopped","manual","operations");
  showToast(state.power?"Site power on":"Site stopped",state.power?"Every machine that is not switched off on its own is hashing again.":"Every machine is off: nothing mines and the fleet draws no power. Rent, internet, staff and insurance still fall due, and the site stays stopped, through the monthly bill too, until you press Start site power.","status","mine");
  save();render();
}
function sitePowerAfterBill(){return !state.policyLock&&!state.manualStop}

function deferSettlement(){
  const pending=state.pendingSettlement;if(!pending)return;
  if(state.time<MARKET)return showToast("Not before the market opens",NO_MARKET_RULE,"blocked","finance");
  const paid=Math.min(state.cash,pending.due),carried=pending.due-paid;
  state.cash-=paid;state.debt+=carried;state.arrearsDue=nextBillDate();
  state.operator.restructures=state.operator.restructures;
  recordOperatorMonth(pending.snapshot,false);
  state.bill=0;state.billLedger={energy:0,rent:0,internet:0,staff:0,insurance:0,nodeNetwork:0,other:0};
  state.lastMonth=pending.month;state.pendingSettlement=null;state.settlementSaleMode=false;
  log("Operating bill missed",`${fmtUsd(carried)} carried into arrears`,"finance");
  showToast("Bill missed, grid still on",`${fmtUsd(carried)} is now in arrears. The site keeps running until the next bill on ${dateFmt(state.arrearsDue)}; if the arrears are still owed then, power and internet are cut until they are paid.`,"warning","finance");
  state.speed=pending.resumeSpeed||state.returnSpeed||0;setTimer();save();render();
}

function monthlyCost(){
  const fs=fleet(),r=region(),f=facility(),nodeW=nodePowerWatts();
  const energyDaily=siteEnergyDaily({nodeWatts:state.node>=1?nodeW:0}),energy=energyDaily.total*30.4375,staff=staffMonthlyCost(),insurance=insuranceMonthlyCost(),internet=internetMonthlyCost(),nodeNetwork=totalNodeMonthlyOverhead();return{energy,rent:f.rent,staff,insurance,internet,nodeNetwork,total:energy+f.rent+staff+insurance+internet+nodeNetwork,rate:energyDaily.rate};
}

function blankBillLedger(){return{energy:0,rent:0,internet:0,staff:0,insurance:0,nodeNetwork:0,other:0}}

function accruedBillBreakdown(){const result=Object.assign(blankBillLedger(),state.billLedger||{}),accounted=Object.values(result).reduce((sum,value)=>sum+value,0);if(state.bill>accounted+1e-8)result.other+=state.bill-accounted;return result}

function nextSettlementDate(offset=0){const date=new Date(state.time);return Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1+offset,1)}

function settlementForecast(){
  const fs=fleet(),r=region(),f=facility(),nodeW=nodePowerWatts();
  const energy=siteEnergyDaily({nodeWatts:nodeHostPowered()?nodeW:0,active:state.power&&!gridCutOff()&&!state.policyLock}),daily={energy:energy.total,rent:f.rent/30.4375,internet:internetMonthlyCost()/30.4375,staff:staffMonthlyCost()/30.4375,insurance:insuranceMonthlyCost()/30.4375,nodeNetwork:totalNodeMonthlyOverhead()/30.4375,other:0};
  let cursor=new Date(state.time),days=0,month=cursor.getUTCMonth();do{cursor=new Date(cursor.getTime()+DAY);days++}while(cursor.getUTCMonth()===month);
  const accrued=accruedBillBreakdown(),breakdown={};Object.keys(accrued).forEach(key=>breakdown[key]=accrued[key]+(daily[key]||0)*days);breakdown.finance=financeInterestMonthly();const estimated=Object.values(breakdown).reduce((sum,value)=>sum+value,0),cashAfter=state.cash-estimated,coverage=estimated?Math.max(0,Math.min(100,state.cash/estimated*100)):100;
  /* HOW FAR AWAY THE MONEY IS. A shortfall is a different problem depending on where the
     treasury lives: coins in the hot wallet can be sold this afternoon, coins in cold storage
     are a signing ceremony away, and a ceremony takes as many days as the protection you
     bought. An operator paying mining income into cold storage and meeting a bill in four
     days needs that stated as arithmetic, not as advice. */
  const cold=typeof coldLockedBtc==="function"?coldLockedBtc():0;
  const reachDays=typeof treasuryDistanceDays==="function"?treasuryDistanceDays():0;
  const coldTooSlow=cold>0&&reachDays>days;
  return{days,dueAt:nextSettlementDate(),daily,accrued,breakdown,estimated,cashAfter,coverage,
    remaining:Math.max(0,estimated-state.bill),cold,reachDays,coldTooSlow};
}

function settlementSnapshot(due,month){
  const days=Math.max(1,state.operator.periodDays||1),uptime=state.operator.periodUptime/days,marketOpen=state.time>=MARKET,revenueUsd=marketOpen?state.operator.periodMined*priceAt(state.time):0,expectedGross=marketOpen?expectedDailyBtcForHash(fleet().hash)*priceAt(state.time)*days:0,competitive=operating()&&(marketOpen?expectedGross>=due*.75:playerNetworkShareAt(state.time,fleet().hash)>=.0001);
  return{due,month,era:operatorEraAt(Math.max(START,state.time-DAY)).id,mined:state.operator.periodMined,revenueUsd,days,uptime,profitable:marketOpen?uptime>=.25&&revenueUsd>0&&revenueUsd>=due:uptime>=.65,competitive};
}

function finishMonthlySettlement(kind="cash",automatic=false){
  const pending=state.pendingSettlement;if(!pending||state.cash+1e-8<pending.due)return false;const rescueFeedback=settlementRescueFeedback(kind,pending.due,state.cash-pending.due);state.cash-=pending.due;const interest=pending.loanInterest||0;log("Operating bill settled",fmtUsd(pending.due));if(interest>0)log("Project finance interest",fmtUsd(interest));/* An operation that pays its bills by selling its own treasury is not solvent, it is
   shrinking. It used to be recorded as though it had earned the money: twenty-five solvent
   months out of twenty-five, whether the cash came from mining or from liquidating a
   thousand bitcoin. Only a bill met from operating cash counts now. */
  recordOperatorMonth(pending.snapshot,kind==="cash");state.bill=0;state.billLedger=blankBillLedger();state.lastMonth=pending.month;state.pendingSettlement=null;state.debt=0;state.power=sitePowerAfterBill();clearTimeout(toastTimer);toast=null;
  let hardwareOpened=false;if(!state.ended){state.speed=pending.resumeSpeed||state.returnSpeed||0;hardwareOpened=activateNextHardwareAlert();setTimer()}save();if(automatic&&!hardwareOpened){refreshLive();requestAnimationFrame(()=>{refreshDashboardVisuals();refreshMinePricing()})}else render();if(!automatic&&rescueFeedback)setTimeout(()=>showToast(rescueFeedback[0],rescueFeedback[1],"warning","finance"),0);return true;
}

function enterReceivership(){
  const p=state.pendingSettlement;if(!p)return;
  if(state.time<MARKET)return showToast("Not before the market opens",NO_MARKET_RULE,"blocked","finance");state.operator.restructures++;const haircut=Math.min(.25,.1+(state.operator.restructures-1)*.05),btcSeized=controlled()*haircut;sellControlledBtc(btcSeized);let machines=0;HARDWARE.filter(h=>!h.permanent).forEach(h=>{const qty=Math.ceil((state.hardware[h.id]||0)*.25);state.hardware[h.id]=Math.max(0,(state.hardware[h.id]||0)-qty);state.poweredDownHardware[h.id]=Math.min(state.poweredDownHardware[h.id]||0,state.hardware[h.id]);machines+=qty});recordOperatorMonth(p.snapshot,false);state.bill=0;state.billLedger=blankBillLedger();state.debt=0;state.cash=0;state.lastMonth=p.month;state.pendingSettlement=null;state.power=false;clearTimeout(toastTimer);toast=null;log("Receivership",`${Math.round(haircut*100)}% of self-held BTC and ${machines} miners seized`);
  if(state.operator.restructures>=3){state.ended=true;state.endReason="receivership";state.speed=0;log("Scored campaign ended","third receivership");recordCareerRun()}else state.speed=p.resumeSpeed||state.returnSpeed||0;setTimer();save();render();if(state.operator.restructures<3)reportCoinLoss({
    title:"Receivership seized part of the treasury",kind:"seized",btc:btcSeized,cause:"receivership",
    from:"self-held keys, sold to settle the bill",
    what:`${fmtBtc(btcSeized)} of self-held BTC and ${machines} miner${machines===1?"":"s"} were sold out from under the operation to clear a bill it could not pay. Mining remains off until power is restored.`,
    why:`The monthly settlement went unmet and the operation was restructured rather than closed. This is strike ${state.operator.restructures} of 3; the third ends the scored campaign.`,
    remedy:"Watch the cash-shortfall warning that appears before a settlement is due. Selling on your own terms, a month early, costs a fraction of what a forced sale does.",
    tab:"finance"});
}
