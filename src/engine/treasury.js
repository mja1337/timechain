"use strict";

/* TREASURY - how far away the money is, and what it costs to bring it here.

   Mining pays in BTC and the operating bill is due in cash, so every month the operator is
   really deciding how much of the treasury to keep close and how much to keep safe. Those two
   pull against each other, and custody is what prices the difference: coins in cold storage are
   hard to spend, which includes being hard for the owner to spend, in days and in fees.

   THE FEE IS THE REAL ONE. A transaction pays by weight, not by value, and every separate
   payout the pool ever sent is a separate coin to gather when it comes time to spend. So the
   cost of leaving cold storage is the weight of the coins being gathered multiplied by what a
   unit of weight cost on that date - and the second half is already in the game: the fees a
   block collects, on the dashboard and in the mempool card. A block holds about a million
   virtual bytes and when fees matter it is full, so the average rate is the block's fees
   divided by that. A miner on a low payout threshold in December 2017 pays for it twice, once
   in the pool's own fee and again when the pile of small payouts has to be spent.

   Pool payouts and ordinary payments are priced in payouts.js, by the same rate (paymentRateSatPerVb,
   which holds a fixed-fee floor before 2017). Everything the PLAYER sweeps from cold storage is priced here.

   Loaded after signing.js, which it extends. Nothing here is called before the page has
   finished parsing. */

const SWEEP_BASE_VBYTES=10,SWEEP_VIN_SINGLE=68,SWEEP_VIN_QUORUM=105,SWEEP_VOUT=31;
const BLOCK_VBYTES=1e6,RUSH_FEE_MULTIPLE=3,UTXO_SEED_CAP=150;
// BTC the reserve needs to sell for a bill, with headroom for the exchange fee and the book's impact.
const RESERVE_FEE=.006,RESERVE_BUFFER=1.05;

/* ---- coins you have to gather ------------------------------------------------------- */

/* A count of separate coins in each self-held wallet, not a list: nobody needs to know which
   payout is which, only how many have to be gathered.

   An old save has none, so the first read builds one from what it can see - every pool payout
   to cold storage is a coin there - rather than starting an established reserve at zero coins,
   which would make a long-running save the cheapest to spend from. */
function utxoState(s=state){
  if(!s.utxo||typeof s.utxo!=="object"){
    const paid=Math.max(0,Math.floor(Number(s.poolAccount?.payouts)||0));
    s.utxo={cold:(s.wallets?.cold||0)>0?Math.max(1,s.poolAccount?.destination==="cold"?Math.min(UTXO_SEED_CAP,paid):1):0,
      hot:(s.wallets?.hot||0)>0?1:0};
  }
  s.utxo.cold=Math.max(0,Math.floor(Number(s.utxo.cold)||0));
  s.utxo.hot=Math.max(0,Math.floor(Number(s.utxo.hot)||0));
  return s.utxo;
}
function utxoAdd(bucket,s=state,n=1){
  if(bucket!=="hot"&&bucket!=="cold")return;
  utxoState(s)[bucket]+=n;
}
/* How many coins a spend of this fraction has to gather. Never zero for a wallet holding coins. */
function utxoInputsFor(bucket,fraction,s=state){
  const held=s.wallets?.[bucket]||0,n=utxoState(s)[bucket];
  if(held<=0&&n<=0)return 0;
  return Math.max(1,Math.ceil(Math.max(n,1)*Math.min(1,Math.max(0,fraction))));
}
/* Spending consumes the coins it gathered and leaves any remainder as one change coin. */
function utxoConsume(bucket,fraction,s=state){
  if(bucket!=="hot"&&bucket!=="cold")return;
  const u=utxoState(s),inputs=utxoInputsFor(bucket,fraction,s);
  u[bucket]=Math.max(0,u[bucket]-inputs)+(fraction<.999&&(s.wallets?.[bucket]||0)>0?1:0);
}

/* ---- what leaving costs ------------------------------------------------------------- */

/* Satoshis per virtual byte on a date, from the fees a block collected. Floored at one: the
   relay minimum, and the rate in every year before fees were a market at all. */
function feeRateSatPerVb(t=state.time){
  const recorded=recordedFeeRate(t);
  return Math.max(1,recorded!==null?recorded:feeAt(t)*1e8/BLOCK_VBYTES);
}
/* What jumping the queue costs, as a multiple of the ordinary rate: the day's 90th-percentile fee over its median, as the
   blocks recorded it. A quiet day's queue is cheap to jump and a spike's is not. Outside the record it is the old flat three. */
function rushMultiple(t=state.time){
  const median=recordedFeeRate(t),high=recordedFeeRate(t,FEERATE_HIGH);
  return median!==null&&high!==null?Math.min(6,Math.max(2,high/Math.max(1,median))):RUSH_FEE_MULTIPLE;
}
function sweepVbytes(inputs,outputs,quorum){
  return SWEEP_BASE_VBYTES+inputs*(quorum?SWEEP_VIN_QUORUM:SWEEP_VIN_SINGLE)+outputs*SWEEP_VOUT;
}
function sweepFeeBtc(inputs,outputs,quorum,t=state.time){
  return sweepVbytes(inputs,outputs,quorum)*feeRateSatPerVb(t)*1e-8;
}
/* The fee for moving coins out of a wallet. The single funnel transfer() and the settlement
   card both ask, so the number a player is shown is the number that is charged.

   Leaving cold storage is a sweep and is priced as one. Every other move is an ordinary
   payment and keeps the payment fee. */
function transferNetworkFee(from,fraction,opts={},s=state){
  if(from!=="cold")return flatNetworkFee(s);
  const quorum=(custodySetup(s).policy.threshold||1)>1,inputs=utxoInputsFor("cold",fraction,s);
  const fee=sweepFeeBtc(Math.max(1,inputs),fraction>=.999?1:2,quorum,s.time);
  return opts.rush?fee*rushMultiple(s.time):fee;
}
/* An ordinary move between wallets is instant, so its effect on the coin count is too. */
function utxoMoved(from,to,fraction,s=state){
  if(from==="hot")utxoConsume("hot",fraction,s);
  if(to==="hot"||to==="cold")utxoAdd(to,s);
}

/* ---- how far away it is ------------------------------------------------------------- */

/* Coins that have left cold storage and not yet arrived. They are the operator's and spendable
   by no one, so they belong in net worth and in nothing that can be sold today. */
function coldInFlightBtc(s=state){
  return (s.coldSpends||[]).reduce((sum,job)=>sum+Math.max(0,(Number(job.gross)||0)-(Number(job.fee)||0)),0);
}
function treasuryReach(s=state){
  const cold=coldLockedBtc(s),hot=s.wallets?.hot||0,inFlight=coldInFlightBtc(s);
  const reachDays=treasuryDistanceDays(s),daysToBill=Math.max(0,Math.ceil((nextSettlementDate()-s.time)/DAY));
  const price=s.time>=MARKET?priceAt(s.time):0,burn=monthlyCost().total/30.4375;
  // Cash plus the hot wallet at today's price, less the exchange fee: what could meet a bill today.
  const liquidUsd=Math.max(0,s.cash)+hot*price*(1-RESERVE_FEE);
  return{cold,hot,inFlight,reachDays,daysToBill,coldTooSlow:cold>0&&reachDays>daysToBill,
    liquidRunwayDays:burn>0?liquidUsd/burn:null,coins:utxoState(s).cold};
}

/* ---- the bill, and the reserve that is days away ------------------------------------ */

/* WHY THIS CARRIES THE BILL AS WELL.

   The clock is stopped while a settlement waits for a decision, and a signing ceremony is
   measured in days of clock. Starting one from inside the stopped moment would never finish: the
   coins would be on their way and the time they were on their way through would never pass. So
   fetching the reserve is one decision that does both halves - it uses the grace month the game
   already offers, which restarts the clock with the shortfall carried as arrears, and it sets
   the coins moving. They land during the grace period and the player sells them and clears the
   arrears. That is what a real operator short on cash with the reserve in a vault does. */
function fetchReserveBlockReason(s=state){
  if(!s.pendingSettlement)return "There is no bill waiting.";
  if(s.time<MARKET)return "There is no market yet to sell the coins on.";
  if(coldLockedBtc(s)<=1e-9)return "Nothing is held in cold storage.";
  const sign=coldSpendBlockReason(s,{settling:true});if(sign)return sign;
  return "";
}
function reserveNeededBtc(s=state){
  const p=s.pendingSettlement;if(!p||s.time<MARKET)return 0;
  // A cold-only operation must also be able to clear an earlier arrear. Before this,
  // debt made the reserve card refuse while the paused settlement blocked the ordinary
  // cold-to-hot transfer: the run stayed alive, but there was no route to liquidity.
  const fiatNeeded=Math.max(0,p.due-s.cash)+Math.max(0,s.debt||0);
  return fiatNeeded/(priceAt(s.time)*(1-RESERVE_FEE))*RESERVE_BUFFER;
}
/* The reserve to fetch: what the bill needs, or everything cold if that is not enough. */
function reservePlan(rush=false,s=state){
  const cold=s.wallets?.cold||0,need=reserveNeededBtc(s),gross=Math.min(cold,need),fraction=cold>0?gross/cold:0;
  return{cold,need,gross,fraction,covers:gross>=need-1e-9,days:coldSpendDays(s,{rush}),
    fee:transferNetworkFee("cold",fraction,{rush},s)};
}
function fetchReserve(rush=false){
  const reason=fetchReserveBlockReason();
  if(reason)return showToast("Cannot fetch the reserve",reason,"bad","custody");
  const plan=reservePlan(rush);
  if(plan.gross<=plan.fee)return showToast("Not worth fetching",`The ${fmtBtc(plan.fee)} network fee is more than the ${fmtBtc(plan.gross)} the bill needs.`,"bad","custody");
  // Carry the current shortfall and restart the clock first; an earlier arrear is
  // carried forward too, so the landed coins can clear both from Finance.
  deferSettlement();
  beginColdSpend("hot",plan.gross,plan.fee,{rush,purpose:"settlement",fraction:plan.fraction});
}
