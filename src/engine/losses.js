"use strict";

/* WHEN COINS LEAVE AND DO NOT COME BACK.

   Every way this game takes bitcoin off a player announced itself with a toast: a strip in the
   corner, five seconds, gone. That is the same weight the game gives a delivery arriving or a
   fan being replaced. It works when nothing else is happening. It does not work at the moment
   these incidents actually fire, which is in the middle of a large fleet breaking - the notice
   that a third of the treasury just walked lands between two fault toasts and is gone before
   it is read.

   The severity of a message should match the severity of what it reports, and losing coins is
   the most severe thing that happens here. It is also the only class of loss that is
   irreversible: a miner can be repaired, a bill can be paid late, a bad month can be traded
   out of. Coins that moved are gone.

   So a coin loss stops the clock and takes the screen, exactly as a major historical event
   does, and it says four things a toast has no room for: what left, from where, why it was
   possible, and what would have prevented it. The last one is the point - every incident in
   this file corresponds to a real failure mode with a real remedy, and the remedy is worth
   more to the player than the apology.

   Losses queue rather than overwrite. Two incidents in one month is a bad month, not a reason
   to show one of them. */

const LOSS_KINDS={
  stolen:{label:"Stolen",note:"Someone else can spend these coins now."},
  unrecoverable:{label:"Unrecoverable",note:"These coins are still on the chain. Nobody can move them, including you."},
  counterparty:{label:"Held by someone else",note:"The coins were on a venue's balance sheet, not in your keys."},
  seized:{label:"Seized",note:"Sold out from under the operation to settle what it owed."}
};

function lossQueue(s=state){return (s.pendingLosses||(s.pendingLosses=[]))}
function pendingLoss(s=state){return lossQueue(s)[0]||null}

/* The value is stamped at the moment of loss rather than recomputed later: what these coins
   are worth today is a different and much crueller number, and the game already shows it in
   the ledger. What the modal reports is what left, when it left. */
/* HOW LIKELY WAS THIS, AND WHAT WOULD HAVE LOWERED IT.

   A loss modal that only says what happened teaches the player to fear the game rather than to read it. Most of
   the incidents here are rolled once a month at a small stated chance, so the modal says what the chance was, how
   that adds up over a year, and, where there is something a player could have done, what it would have made the
   chance. A run that is hit in its first month should read "that was a 1 in 450 month", not "I did something wrong".
   `odds` is {monthly, better?, betterWhy?, note?}; an incident with no stated chance passes none. */
function lossOddsText(o){
  const m=Number(o&&o.monthly);if(!(m>0&&m<1))return"";
  const oneIn=p=>`1 in ${fmtNum(Math.max(2,Math.round(1/p)))}`,year=1-Math.pow(1-m,12),pct=x=>x<.01?(x*100).toFixed(2):x<.1?(x*100).toFixed(1):(x*100).toFixed(0);
  let t=`How likely was this? About ${oneIn(m)} in the month it happened (${pct(m)}%). The same roll comes round every month, so over a year of play it is about ${pct(year)}%.`;
  if(o.better>0&&o.better<m*.8)t+=` ${o.betterWhy||"With better precautions"} it would have been about ${oneIn(o.better)} a month.`;
  if(o.note)t+=` ${o.note}`;
  if(typeof state!=="undefined"&&state.time-(Number(state.campaignStart)||state.time)<DAY*120)t+=" It happened early in the run, which makes it mostly bad luck.";
  return t;
}
function reportCoinLoss(entry){
  const btc=Math.max(0,Number(entry.btc)||0);
  if(btc<=0&&!entry.always)return;
  const price=state.time>=MARKET?priceAt(state.time):0;
  // Cover, if there is any, pays here, so no incident has to know that it exists.
  const claim=typeof coinCoverClaim==="function"?coinCoverClaim(entry,btc):null;
  if(claim&&claim.paid>0){state.cash+=claim.paid;log("Coin cover claim paid",`+${fmtUsd(claim.paid)}`,"custody")}
  lossQueue().push({
    id:`${entry.cause||"loss"}-${state.time}-${lossQueue().length}`,cause:entry.cause||"loss",
    title:entry.title,kind:entry.kind||"stolen",btc,
    usd:price>0?btc*price:0,quoted:price>0,
    from:entry.from||"self-held keys",
    what:(entry.what||"")+(claim?claim.note:""),why:entry.why||"",remedy:entry.remedy||"",paid:claim?claim.paid:0,
    tab:entry.tab||"custody",time:state.time,oddsText:lossOddsText(entry.odds),scene:entry.scene||"",
    recovered:Math.max(0,Number(entry.recovered)||0)
  });
  /* The clock stops for the same reason it stops for a major event: the player is being asked
     to take in something that changes their position, and the simulation racing on underneath
     is how they end up reading it three months late. */
  if(state.speed>0){state.returnSpeed=state.speed;state.speed=0;if(typeof setTimer==="function")setTimer()}
  state.lossResume=true;
  /* Ask for the repaint here rather than leaving a flag for the next tick to notice. The clock
     has just been stopped, so there is no next tick - a loss reported at speed would otherwise
     queue a modal that nothing ever draws. queueRender defers past the end of the current tick,
     so this never paints half-applied state. */
  if(typeof queueRender==="function")queueRender(true);
}
/* Two things can have stopped the clock - a historical chapter and a loss - and either can
   arrive while the other is already up. Whichever is dismissed last is the one that restarts
   the simulation, so the decision lives in one place rather than in each handler, where the
   pair that never resumes is only ever one missing flag away. */
function resumeAfterModals(){
  if(lossQueue().length||state.activeEvent||state.pendingSettlement||state.ended)return false;
  if(!state.lossResume&&!state.eventResume)return false;
  state.speed=state.returnSpeed||1;
  state.lossResume=false;state.eventResume=false;
  return true;
}
function dismissLoss(){
  lossQueue().shift();
  resumeAfterModals();
  if(typeof setTimer==="function")setTimer();
  save();render();
}

/* THE HOT WALLET.

   A key that is online to sign is a key that can be taken. This is the one incident the player
   controls almost entirely: the risk scales with how much of the self-held balance sits hot,
   so the remedy is not a purchase, it is a habit. */
function advanceHotWalletRisk(){
  const hotRisk=hotWalletIncidentRisk();
  if(!(hotRisk>0)||(typeof hotKeyGrace==="function"&&hotKeyGrace())||nextRand()>=hotRisk)return;
  // Worked out before the coins leave, from the balance the roll was made against.
  const hotNow=state.wallets.hot||0,coldNow=state.wallets.cold||0,mostlyCold={...state,wallets:{...state.wallets,hot:hotNow*.1,cold:coldNow+hotNow*.9}};
  const odds={monthly:hotRisk,better:hotWalletIncidentRisk(mostlyCold),betterWhy:"With most of your coins in cold storage and only a working float online,"};
  const lost=state.wallets.hot*(.12+nextRand()*.28);
  if(lost<=0)return;
  state.wallets.hot=Math.max(0,state.wallets.hot-lost);
  log("Hot-wallet key compromise",`-${fmtBtc(lost)} · cold storage unaffected`,"custody");
  if(typeof hotKeyCompromised==="function")hotKeyCompromised();
  reportCoinLoss({
    title:"Your hot wallet was emptied",kind:"stolen",btc:lost,cause:"hotwallet",scene:"hack",odds,
    from:"the online hot wallet",
    what:"An online signing key was compromised and the balance it could reach was swept in a single transaction.",
    why:`The hot wallet holds a key that is available to sign at any moment, which is what makes it convenient and what makes it reachable. Cold storage and custodial venue balances were untouched - only what the online key could spend went.`,
    remedy:`Keep working float hot and everything else cold. This risk scales directly with the share of your self-held balance that sits in the hot wallet${state.skills?.includes("backups")?"":", and the Backup discipline skill reduces it further"}.`,
    tab:"custody"
  });
}

/* THE VENUES.

   Mt. Gox, Bitfinex, QuadrigaCX and FTX are in the game because they are in the record, and
   what they share is that the player's balance was never the player's coins. Each one splits
   differently between gone and frozen, because that is how they actually settled: Gox and
   Quadriga left creditors with a claim worth a fraction, Bitfinex socialised a haircut across
   every account, and FTX froze first and lost the rest. */
const VENUE_FAILURES={
  mtgox:{wallet:"mtgox",lost:.8,frozen:.2,title:"Mt. Gox stopped withdrawals with your coins inside",
    what:"The exchange halted withdrawals and filed for bankruptcy protection. 80% of your balance is gone; the remainder becomes a creditor claim of uncertain value and timing.",
    why:"An exchange balance is an IOU. The coins backing it were held - and, it turned out, not held - by the exchange, and the account line was a promise about them.",
    remedy:"Withdraw to your own keys after trading rather than leaving working balances on a venue between decisions."},
  bitfinex:{wallet:"bitfinex",lost:.36,frozen:0,title:"Bitfinex socialised its breach across your balance",
    what:"The exchange was breached and spread the shortfall across every account rather than closing. 36% of your balance was written down.",
    why:"You were not targeted. Holding a balance on a venue means holding a share of that venue's worst day, whether or not your own account was touched.",
    remedy:"Withdraw to your own keys after trading. A venue's security is a risk you take on by having a balance there at all."},
  quadriga:{wallet:"quadriga",lost:.8,frozen:.2,title:"QuadrigaCX's keys died with its founder",
    what:"The exchange ceased operating and the keys to its reserves could not be produced. 80% of your balance is gone; the remainder is a creditor claim.",
    why:"A venue with no key management succession is a single point of failure you cannot inspect from the outside - and by the time it matters, it is far too late to.",
    remedy:"Withdraw to your own keys. You cannot audit a custodian's backups, and its failure is indistinguishable from fraud from where you stand."},
  ftx:{wallet:"frontier",lost:.3,frozen:.7,title:"The venue froze withdrawals overnight",
    what:"Withdrawals were suspended and the venue entered bankruptcy. 70% of your balance is frozen pending proceedings; 30% is written off outright.",
    why:"Customer balances had been lent against. The account page showed coins that were not there - which is a thing an account page can do.",
    remedy:"Withdraw to your own keys. A balance you cannot move on demand is not a balance you hold."}
};
function applyVenueFailure(fx){
  const spec=VENUE_FAILURES[fx];if(!spec)return false;
  /* If the operator was having their mining income paid straight to this venue, the failure
     takes the income stream too - the destination has to move, and they should be told rather
     than discovering it when the next payout vanishes. */
  const account=typeof poolAccount==="function"?poolAccount():null;
  const wasDestination=account&&account.destination===spec.wallet;
  if(wasDestination){account.destination="hot";
    log("Payout destination reset",`${walletName(spec.wallet)} can no longer receive · mining income now arrives in the hot wallet`,"custody")}
  const held=state.wallets[spec.wallet]||0;
  if(held<=0){
    if(wasDestination&&typeof showToast==="function")showToast("Your payout address just failed",`${walletName(spec.wallet)} is gone, and it was where your mining income was being paid. Income now arrives in your hot wallet until you choose somewhere else.`,"bad","pools");
    return true;
  }
  const lost=held*spec.lost,frozen=held*spec.frozen;
  state.wallets[spec.wallet]=Math.max(0,held-lost-frozen);
  if(frozen>0)state.wallets.frozen+=frozen;
  log(spec.title,`-${fmtBtc(lost)}${frozen>0?` · ${fmtBtc(frozen)} frozen`:""}`,"custody");
  reportCoinLoss({
    title:spec.title,kind:"counterparty",btc:lost,recovered:frozen,cause:fx,
    from:`your ${walletName(spec.wallet)} balance`,
    what:spec.what+(wasDestination?" Your mining income was being paid to this venue; it now arrives in your hot wallet until you choose somewhere else.":""),
    why:spec.why,remedy:spec.remedy,tab:"custody"
  });
  return true;
}
