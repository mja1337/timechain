"use strict";

/* TREASURY, AS THE PLAYER MEETS IT - the cards and reviews that say how far away the money is.

   The arithmetic is in engine/treasury.js. This file only turns it into sentences, and every
   number on a card here is read from the same function that charges it, so what a player is
   shown is what they pay. */

/* What leaving cold storage would cost today, in the units the game already teaches: coins
   gathered, the going rate, and the fee that makes. */
function coldSpendCostLine(){
  const cold=state.wallets.cold||0;if(cold<=0)return "";
  const reach=treasuryReach(),fee=transferNetworkFee("cold",1),rate=feeRateSatPerVb();
  return `<p class="modal-note">Spending all of it now means gathering ${fmtNum(reach.coins)} separate coin${reach.coins===1?"":"s"} at about ${rate<10?rate.toFixed(1):Math.round(rate)} sat/vB: <strong>${fmtBtc(fee)}</strong> in network fees. Every payout sent straight to cold storage is another coin to gather later, and the rate is whatever blocks are charging on the day you need the money.</p>`;
}

/* The review a player sees before coins leave cold storage. Instant moves between hot wallets
   and exchanges are not reviewed: nothing about them takes time. */
function coldTransferPreview(button,base){
  if(base.from!=="cold")return null;
  const reason=coldSpendBlockReason();
  if(reason){showToast("This wallet cannot sign",reason,"bad","custody");return null}
  const fraction=actionFraction(button),gross=(state.wallets.cold||0)*fraction;if(gross<=0)return null;
  const fee=transferNetworkFee("cold",fraction),days=coldSpendDays();
  if(gross<=fee){showToast("Transfer too small",`The selected ${formatPercent(fraction*100)}% is not enough to cover the ${fmtBtc(fee)} network fee.`);return null}
  const coins=utxoInputsFor("cold",fraction),rate=feeRateSatPerVb();
  return{...base,fraction,title:`Review cold spend · ${walletName(base.to)}`,kicker:`Cold storage · ${days}-day signing`,
    give:fmtBtc(gross),giveSub:`${formatPercent(fraction*100)}% of cold storage · ${fmtNum(coins)} coin${coins===1?"":"s"} gathered`,
    receive:fmtBtc(gross-fee),receiveSub:`Reaches ${walletName(base.to)} on ${dateFmt(state.time+days*DAY)}`,
    reference:`${rate<10?rate.toFixed(1):Math.round(rate)} sat/vB, the rate blocks are charging today`,
    fees:`${fmtBtc(fee)} network fee`,after:`${fmtBtc((state.wallets.cold||0)-gross)} left in cold storage`,
    confirmLabel:`Start ${days}-day signing`};
}

/* The card in the settlement modal for a player whose reserve is in cold storage. The clock is
   stopped, so the choice has to be honest about what it does to the clock: it carries the bill
   into the grace month and sets the coins moving, and they land while time is running. */
/* Borrowing against the coins is another way to meet the bill, and the one that does not sell them. */
function settlementBorrowCards(){
  if(state.time<SECURED_START||!state.pendingSettlement)return "";
  return Object.values(SECURED_MODES).map(m=>{
    const plan=settlementBorrowPlan(m.id),reason=securedBlockReason(m.id,state,{settling:true});
    if(!plan&&!reason)return "";
    const effect=reason?`<strong>Not available:</strong> ${reason}`
      :m.id==="collaborative"
        ?`Immediate effect: ${fmtUsd(plan.need)} is carried into arrears and the site keeps running until ${dateFmt(nextBillDate())}, while ${fmtBtc(plan.pledged)} is swept into the wallet the lender co-signs. ${fmtUsd(plan.principal)} arrives in ${plan.days} days at ${(plan.rate*100).toFixed(1)}% a month. Consequence: pay the arrears with it before the next bill or the grid is cut.${plan.covers?"":" It does not cover the whole bill."}`
        :`Immediate effect: ${fmtBtc(plan.pledged)} from the hot wallet goes to the lender and ${fmtUsd(plan.principal)} arrives now at ${(plan.rate*100).toFixed(1)}% a month. Consequence: the coins are a claim on a company until you repay, and a fall in the price can call the loan.${plan.covers?" It clears the bill.":" It does not cover the whole bill."}`;
    return `<article class="venue"><div class="risk medium">BORROW · ${m.name.toUpperCase()}</div><h3>Borrow against your coins</h3><p>${effect}</p><div class="actions"><button class="action small primary" data-action="settle-borrow" data-value="${m.id}" ${reason?`disabled title="${escapeHtml(reason)}"`:""}>${plan?`Borrow ${fmtUsd(plan.principal)}`:"Borrow"}</button></div></article>`;
  }).join("");
}
function settlementReserveCard(){
  return settlementReserveOnly()+settlementBorrowCards();
}
function settlementReserveOnly(){
  const p=state.pendingSettlement;if(!p)return "";
  const cold=state.wallets.cold||0;if(cold<=1e-9)return "";
  const reason=fetchReserveBlockReason(),plan=reservePlan(false),rush=reservePlan(true),short=Math.max(0,p.due-state.cash);
  const saves=rush.days<plan.days,days=`${plan.days} day${plan.days===1?"":"s"}`,rushDays=`${rush.days} day${rush.days===1?"":"s"}`;
  const arrears=state.debt||0,totalNeed=short+arrears;
  const effect=reason?`<strong>Not available:</strong> ${reason}`
    :`Immediate effect: ${fmtUsd(totalNeed)} (${arrears?`${fmtUsd(arrears)} existing arrears plus `:""}${fmtUsd(short)} from this bill) is carried forward while ${fmtBtc(plan.gross)} is signed out of cold storage. It takes ${days} and costs ${fmtBtc(plan.fee)} in network fees. Consequence: it lands in your hot wallet; sell it at the Market and clear Finance before the next bill or the grid stays cut.${plan.covers?"":" It is not enough to cover the whole amount."}`;
  return `<article class="venue"><div class="risk medium">RESERVE · ${days.toUpperCase()} AWAY</div><h3>Fetch the reserve</h3><p>${effect}</p><div class="modal-actions"><button class="action small primary" data-action="settle-fetch" ${reason?`disabled title="${escapeHtml(reason)}"`:""}>Fetch · ${days}</button><button class="action small" data-action="settle-fetch-rush" title="${reason?escapeHtml(reason):saves?`Pays ${RUSH_FEE_MULTIPLE}× the fee to skip the slow steps. A quorum is never faster than two days.`:"A rush would not arrive any sooner for this wallet, so it would only cost more."}" ${reason||!saves?"disabled":""}>${saves?`Rush · ${rushDays} · ${fmtBtc(rush.fee)}`:"Rush · no faster"}</button></div></article>`;
}

/* What it takes to deposit from the reserve instead of the hot wallet: days, a fee and a review, said
   where the deposit is made. */
function marketReserveNote(venue,percentId){
  const cold=state.wallets.cold||0;
  if(cold<=1e-9||venue==="cold")return "";
  const reason=coldSpendBlockReason(),days=coldSpendDays(),fee=transferNetworkFee("cold",1);
  return `<button class="action small" data-action="transfer" data-from="cold" data-to="${venue}" data-percent-id="${percentId}" data-percent-label="Deposit from reserve" ${reason?`disabled title="${escapeHtml(reason)}"`:`title="Signed out of cold storage: ${days} day${days===1?"":"s"}, about ${fmtBtc(fee)} for all of it"`}>From reserve · ${days}d</button>`;
}

/* Where mining income lands decides how much of the treasury is close and how much is a journey away.
   Said on the page where that choice is made, with the real cost of the other half. */
function payoutReserveNote(){
  const reach=treasuryReach();
  if(reach.cold<=0&&reach.inFlight<=0)return `<p class="modal-note">Nothing is in cold storage yet, so everything you mine is within reach of a bill today.</p>`;
  const all=transferNetworkFee("cold",1);
  return `<p class="modal-note">Your reserve is <strong>${fmtBtc(reach.cold)}</strong> in <strong>${fmtNum(reach.coins)}</strong> coin${reach.coins===1?"":"s"}, <strong>${reach.reachDays} day${reach.reachDays===1?"":"s"}</strong> from being spendable. Every payout sent straight to cold is another coin to gather later: spending it all today would cost about ${fmtBtc(all)} in network fees, at the rate blocks are charging now.</p>`;
}
