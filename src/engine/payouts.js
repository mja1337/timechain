"use strict";

/* WHERE THE COINS ACTUALLY ARRIVE.

   Custody was a tab. You went to it, bought a signing device, generated a key, set a policy,
   and then went back to mining - and nothing you decided there touched anything you did
   afterwards. Every satoshi the fleet earned appeared in the hot wallet by magic, on the day
   it was earned, regardless of what you had built. The most important idea in self-custody
   was a side quest.

   It is the other way round now, because the way to teach custody is not to explain it. It is
   to make every day of mining pass through it.

   THREE THINGS ARE TRUE OF REAL MINING INCOME, and none of them were modelled.

   1. A pool balance is not your bitcoin. Pool mining credits an account AT THE POOL. The pool
      holds those coins, in its wallet, under its keys, and pays you when your balance crosses
      a threshold. Between payouts you are an unsecured creditor of a company you have never
      met. Poolin froze withdrawals in September 2022 owing miners real money; that is not a
      cautionary tale bolted onto the side of the game, it is the default state of pool mining
      and this game now shows the balance sitting there every single day.

   2. The threshold is a custody decision with two edges. Set it low and you are paid often,
      and you pay an on-chain fee every time. Set it high and you save fees while lending the
      pool more of your money for longer. There is no correct answer - there is a trade-off
      between cost and counterparty exposure, which is the actual shape of nearly every custody
      question, and the player has to pick a side of it every time fees move.

   3. Coins arrive SOMEWHERE, and that somewhere is chosen. A payout address is the one custody
      decision a miner cannot avoid making, because the pool will not pay without it. Pay to a
      hot wallet and the income is spendable and reachable. Pay to cold storage and it is safe
      and slow, and you cannot pay a power bill with it this afternoon. Pay to an exchange and
      it is ready to sell and entirely somebody else's.

   Solo mining pays none of this. The coinbase output goes straight to an address you control -
   no threshold, no withdrawal fee, no counterparty - which is the half of the solo trade-off
   the game never showed. It has worse variance and better custody, and now both are visible.

   WHAT THIS TIES TOGETHER. Cold storage cannot be a payout destination until you have actually
   built a wallet capable of receiving into it, so the custody tab stops being optional the
   moment you want your income somewhere safe. An exchange payout destination means an exchange
   failure takes your income stream and not merely your trading balance. And a settlement that
   needs cash this month is a different problem depending on where six months of mining went,
   which is a lesson the game can now teach by arithmetic rather than by paragraph. */

const PAYOUT_DEFAULT_THRESHOLD=.01;
/* Real pools offer a band rather than a free number, and the band moved with fees: paying out
   0.001 BTC was normal when a transaction cost a few cents and absurd once it cost eight
   dollars. These are the rungs, and which of them a pool will actually honour depends on what
   the payout costs at the time. */
const PAYOUT_THRESHOLDS=[.001,.005,.01,.05,.1,.5];

function poolAccount(s=state){
  const a=s.poolAccount||(s.poolAccount={});
  a.balance=Math.max(0,Number(a.balance)||0);
  a.frozen=Math.max(0,Number(a.frozen)||0);
  a.paidTotal=Math.max(0,Number(a.paidTotal)||0);
  a.feesPaid=Math.max(0,Number(a.feesPaid)||0);
  a.payouts=Math.max(0,Math.floor(Number(a.payouts)||0));
  if(!PAYOUT_THRESHOLDS.includes(a.threshold))a.threshold=PAYOUT_DEFAULT_THRESHOLD;
  if(typeof a.destination!=="string")a.destination="hot";
  return a;
}

/* WHAT A PAYOUT COSTS. The same transaction the player pays for when they move coins by hand,
   because it is the same transaction - a pool sending to your address is an on-chain payment,
   and a payout to a multisig address costs more to spend from later for the same reason a
   multisig transfer costs more: there is more of it.

   IT COSTS WHAT THE DATE CHARGED. An ordinary payment is about 250 virtual bytes, priced at what a
   byte cost on the day (treasury.js reads that from the fee rates blocks recorded). Before 2017
   fees were not a market but a habit: wallets paid a fixed 0.0001-0.0005 BTC whatever the network
   was doing, so those years keep a floor that comes to the 0.0002 BTC this game always charged
   and the early economy is exactly what it was. From 2017 the market sets it: December 2017 costs
   several times the old figure and 2025 a small fraction, which is the whole reason the payout
   thresholds are a choice. Running a node still buys a cheaper payment. */
const PAYMENT_VBYTES=250,HABIT_FEE_SAT_VB=80,HABIT_FEE_ENDS=Date.parse("2017-01-01T00:00:00Z");
function paymentRateSatPerVb(t=state.time){
  // Before 2017 the recorded median is a mix of habits and one-off generosity; a payment keeps the fixed fee wallets paid.
  return t<HABIT_FEE_ENDS?HABIT_FEE_SAT_VB:feeRateSatPerVb(t);
}
function flatNetworkFee(s=state){
  const base=PAYMENT_VBYTES*paymentRateSatPerVb(s.time)*1e-8;
  const node=nodeOnline()&&s.nodeMode==="relay"?.175:nodeOnline()&&s.nodeMode!=="pruned"?.25:1;
  return base*node*(custodySetup(s).policy.threshold>1?1.35:1);
}
function payoutNetworkFee(s=state){return flatNetworkFee(s)}

/* WHERE INCOME MAY LAND. Each of these is a real answer a real miner gives, and each is wrong
   in a different way. */
function payoutDestinations(s=state){
  const out=[
    {id:"hot",name:"Hot wallet",kind:"self",
     summary:"Your own key, online and ready to sign.",
     teaches:"Spendable within the hour, and reachable by anyone who reaches the machine holding the key. Fine for working float; the wrong home for a treasury."},
    ...(venueAvailable("cold")?[{id:"cold",name:"Cold storage",kind:"self",
     summary:"Your own keys, offline.",
     teaches:"The safest destination and the slowest to spend from. Income that lands here cannot pay a bill this afternoon without a transfer first - which is exactly the trade you are making."}]:[])
  ];
  /* Whichever venues actually exist on this date, decided by the same function the Market tab
     uses - so a payout destination can never outlive the exchange it points at. */
  for(const id of ["mtgox","bitfinex","quadriga","frontier","exchange"]){
    if(!venueAvailable(id))continue;
    out.push({id,name:walletName(id),kind:"venue",
      summary:"An account balance at an exchange.",
      teaches:"Ready to sell the moment it arrives, and not yours. The venue holds the coins and the keys; your balance is a promise it will pay. Every failure in this game's record began with a balance exactly like this one."});
  }
  return out;
}
function payoutDestination(id=poolAccount().destination,s=state){
  return payoutDestinations(s).find(d=>d.id===id)||payoutDestinations(s)[0];
}
/* Cold storage is not a place you can be paid until you have built somewhere to be paid TO.
   This is the moment the custody tab stops being optional. */
function payoutDestinationBlockReason(id,s=state){
  const dest=payoutDestinations(s).find(d=>d.id===id);
  if(!dest)return "That destination is not available at this date.";
  if(id==="cold"&&!custodySetup(s).ready)
    return "Cold storage needs a wallet that can actually receive: generate a key, back it up and assign it to a policy in Custody first. A payout address you cannot spend from is a donation.";
  return "";
}
function setPayoutDestination(id){
  const reason=payoutDestinationBlockReason(id);
  if(reason)return showToast("Cannot pay out there",reason,"bad","custody");
  const dest=payoutDestination(id);
  poolAccount().destination=id;
  log("Payout destination changed",`Mining income now arrives in ${dest.name}`,"custody");
  showToast("Payout destination set",`${dest.name}. ${dest.teaches}`,"info","pools");
  save();render();
}
function setPayoutThreshold(value){
  const wanted=Number(value);
  if(!PAYOUT_THRESHOLDS.includes(wanted))return;
  const a=poolAccount();a.threshold=wanted;
  log("Payout threshold changed",`Paid out at ${fmtBtc(wanted)}`,"custody");
  showToast("Threshold set",`The pool will hold your balance until it reaches ${fmtBtc(wanted)}, then send it on. A higher threshold pays fewer network fees and leaves more of your money with the pool for longer.`,"info","pools");
  save();render();
}

/* Crediting a destination, wherever it is. One place, so a new destination cannot be added
   without deciding what receiving into it means. */
function creditPayout(id,btc,s=state){
  if(!(btc>0))return 0;
  const dest=payoutDestination(id,s);
  if(!dest)return 0;
  if(dest.kind==="venue")s.wallets[dest.id]=(s.wallets[dest.id]||0)+btc;
  else if(dest.id==="cold"){s.wallets.cold+=btc;utxoAdd("cold",s)}
  else{s.wallets.hot+=btc;utxoAdd("hot",s)}
  return btc;
}

/* THE DAY'S EARNINGS. Solo goes straight to the address; pool goes onto the pool's books. */
function creditMiningIncome(btc){
  if(!(btc>0))return;
  const a=poolAccount();
  if(state.mode!=="pool"){
    /* A block you find yourself pays its coinbase to an address you named. Nobody holds it for
       you, nobody charges you to send it, and nobody can decide not to. */
    creditPayout(a.destination,btc);
    return;
  }
  a.balance+=btc;
}

/* Paying out. The pool sends when the balance clears the threshold; the network takes its fee
   out of the payment, which is why a low threshold in a high-fee year quietly eats the income
   it is trying to protect. */
function advancePoolPayouts(){
  const a=poolAccount();
  if(a.balance<=0)return;
  const fee=payoutNetworkFee();
  if(a.balance<Math.max(a.threshold,fee*2))return;
  /* One fee, named once. It used to be written as Math.min(fee,sent) in the accounting and
     again in the log line, which is two chances to be wrong and no way for the numbers to
     disagree loudly - the ledger would say one thing and the activity feed another. What
     leaves the pool balance is what arrives plus what the network took: net+paidFee===sent. */
  const sent=a.balance,paidFee=Math.min(fee,sent),net=Math.max(0,sent-paidFee);
  a.balance=0;a.paidTotal+=net;a.feesPaid+=paidFee;a.payouts++;a.lastPayout=state.time;
  const dest=payoutDestination(a.destination);
  creditPayout(a.destination,net);
  // The payout card is balance, total paid and a count - structure, not a text patch.
  renderFullQueued=true;
  log("Pool payout received",`+${fmtBtc(net)} to ${dest.name} · -${fmtBtc(paidFee)} network fee`,"custody");
}

/* WHEN THE POOL STOPS PAYING.

   A pool that closes while holding your balance does not post it to you. Poolin suspended
   withdrawals in September 2022 and miners with large unpaid balances waited years for
   fractions. What you lose is exactly what you had chosen to leave there, which is the whole
   argument about thresholds made concrete. */
function seizePoolBalance(reason,recoveredShare=.15){
  const a=poolAccount();
  if(a.balance<=0)return 0;
  const held=a.balance,recovered=held*recoveredShare,lost=held-recovered;
  a.balance=0;a.frozen+=recovered;
  log("Pool balance stranded",`-${fmtBtc(lost)} · ${fmtBtc(recovered)} treated as a claim`,"custody");
  if(typeof reportCoinLoss==="function")reportCoinLoss({
    title:"The pool stopped paying with your balance inside",kind:"counterparty",btc:lost,recovered,cause:"poolfail",
    from:"your unpaid balance at the pool",
    what:`${reason} ${fmtBtc(held)} of mined income had not been paid out yet. ${fmtBtc(recovered)} survives as a claim of uncertain value and timing; the rest is gone.`,
    why:"A pool balance is not your bitcoin. It is an account entry at a company that holds the coins in its own wallet under its own keys, and it exists for exactly as long as that company keeps paying. Between payouts, a miner is an unsecured creditor.",
    remedy:`Lower the payout threshold so less of your income sits on somebody else's books between payments - you pay a network fee more often and you lend the pool less. Your threshold was ${fmtBtc(a.threshold)}. Solo mining removes the counterparty entirely, at the cost of variance.`,
    tab:"pools"});
  return lost;
}
