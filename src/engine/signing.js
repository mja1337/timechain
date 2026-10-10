"use strict";

/* SPENDING FROM COLD IS AN ACT, NOT A CLICK.

   Cold storage protects coins by making them hard to spend. That is the entire mechanism -
   there is nothing else to it - and it necessarily includes making them hard for YOU to spend.
   A game in which cold-to-hot completes the instant you click it teaches the opposite of the
   thing it is trying to teach: that cold storage is free safety with no cost attached, which
   would make choosing anything else irrational and the whole decision uninteresting.

   The cost is time, and the amount of time is exactly the amount of protection you bought.

     · One key, in a drawer, backed up. You fetch it, sign, broadcast. A day.
     · Air-gapped signing. The signer never touches a network, so the transaction is carried to
       it and the signature carried back by hand. Another day, and a smaller attack surface -
       which is the trade the Tech skill actually buys.
     · A quorum. Two-of-three exists so that the keys can live in three different places, which
       is the point and the price: every additional signature is another journey. A wallet
       whose keys all sit in the same drawer is not a 2-of-3, it is a single key in three
       boxes, and this game already refuses to count it as more.

   AND YOU HAVE TO BE ABLE TO SIGN AT ALL. A quorum you cannot assemble is not slow, it is
   permanent. If the assigned keys no longer satisfy the policy - devices lost, keys never
   assigned, a descriptor never backed up - the coins are not yours in any sense that matters,
   and the refusal says which of those it is rather than greying out a button. This is the
   lesson that "back up your keys" cannot teach on its own: a backup is a belief until the day
   you try to restore from it.

   WHAT THIS TIES TOGETHER. Mining income paid into cold storage is safe and it is not liquid,
   so an operator who chose that destination and then meets a settlement has a problem that is
   arithmetic rather than advice: the bill is due in six days and the coins are four days away.
   That is the trade being made visible, and it is why the settlement forecast now says how far
   away the treasury actually is. */

const COLD_BASE_DAYS=1,COLD_AIRGAP_DAYS=1,COLD_SIGNER_DAYS=1;

function coldSpendDays(s=state,opts={}){
  const set=custodySetup(s);
  let days=COLD_BASE_DAYS;
  if(s.skills?.includes("airgap"))days+=COLD_AIRGAP_DAYS;
  // Every signature beyond the first is another key in another place.
  // Which keys are needed, and how far each is from where they would be signed.
  days+=custodySignerDays(s);
  /* A rush pays a priority fee and skips the slow, careful steps, but it cannot make two keys that
     are kept apart in two places arrive together: a quorum is never faster than two days. */
  if(opts.rush)days=Math.max(set.policy.threshold>1?2:1,Math.ceil(days/2));
  return Math.max(1,days);
}
/* Why a cold spend cannot proceed, as a sentence, or "" when it can. One function so the
   disabled button and the refusal can never disagree. */
function coldSpendBlockReason(s=state,opts={}){
  /* The clock is stopped while a bill waits for a decision, and a signing is measured in days of
     clock, so one started now would never finish. Fetching the reserve from the settlement
     decision is the way to do it: it carries the bill and restarts the clock first. */
  if(s.pendingSettlement&&!opts.settling)return "A bill is waiting for a decision and the clock is stopped, so a signing started now could never finish. Use Fetch the reserve in the settlement decision: it carries the bill into the grace month and restarts the clock.";
  if(s.custody&&s.custody.rotation)return "The coins are being swept to a new key. Signing is paused until the rotation finishes, because the old and new wallets cannot both be spent from at once.";
  const set=custodySetup(s);
  if(!set.ready)return `This wallet cannot sign: ${set.distinct} of the ${set.policy.keys} keys its policy requires are assigned. Coins in cold storage are only yours while a satisfiable quorum exists.`;
  if(set.liveDistinct<set.policy.threshold)return set.usable>=set.policy.threshold
    ?"A signer is gone: its device was destroyed or is still on its way. Restore the key from its backup onto a new device, or wait for it to arrive."
    :"Too few keys survive to sign, and not enough backups remain to rebuild them. The coins in this wallet can no longer be moved.";
  if(!set.configOk)return "A quorum wallet needs its configuration, not just its seeds. Without the descriptor backed up there is nothing to rebuild the wallet from, and nothing to sign with.";
  return "";
}
function coldSpends(s=state){return (s.coldSpends||(s.coldSpends=[]))}
/* What the operator owns but cannot spend today. The gap between this and the hot wallet is
   the whole of what cold storage costs, and treasuryDistanceDays() prices it in days. */
function coldLockedBtc(s=state){return Math.max(0,Number(s.wallets?.cold)||0)}

function beginColdSpend(to,gross,fee,opts={}){
  const reason=coldSpendBlockReason();
  if(reason)return showToast("This wallet cannot sign",reason,"bad","custody");
  const days=coldSpendDays(state,opts),set=custodySetup();
  // How much of the reserve this is decides how many separate coins have to be gathered and spent.
  const held=state.wallets.cold,fraction=opts.fraction||(held>0?Math.min(1,gross/held):1);
  utxoConsume("cold",fraction);
  state.wallets.cold-=gross;
  const job={to,gross,fee,due:state.time+days*DAY,started:state.time,days};
  if(opts.rush)job.rush=true;if(opts.purpose)job.purpose=opts.purpose;
  coldSpends().push(job);
  const detail=set.policy.threshold>1
    ? `${set.policy.threshold} signatures gathered from ${set.policy.keys} keys held apart`
    : "one key retrieved, signed and broadcast";
  log("Cold spend signing started",`${fmtBtc(gross)} → ${walletName(to)} · ${days} day${days===1?"":"s"} · ${detail}`,"custody");
  showToast("Signing under way",`${fmtBtc(gross)} is leaving cold storage for ${walletName(to)}. ${detail[0].toUpperCase()+detail.slice(1)} takes ${days} simulation day${days===1?"":"s"} in this simulation. Keeping signing access separate limits what an online attacker can reach, but you must gather it when you want to pay. The coins are in flight until this finishes; leave time before a bill falls due.`,"info","custody");
  save();render();
}
/* The signature lands and the transaction confirms. Nothing here can fail: the risk of holding
   coins in cold storage is modelled elsewhere, and a signing ceremony that has begun is one the
   operator has already succeeded at. */
function advanceColdSpends(silent=false){
  state.coldSpends=coldSpends().filter(job=>{
    if(pendingAt(job,state.time))return true;
    const net=Math.max(0,(Number(job.gross)||0)-(Number(job.fee)||0));
    state.wallets[job.to]=(state.wallets[job.to]||0)+net;
    if(job.to==="hot")utxoAdd("hot");
    log("Cold spend settled",`${fmtBtc(net)} reached ${walletName(job.to)}`,"custody");
    // A catch-up after the tab was hidden replays days in a burst; the ledger line is enough there.
    if(!silent)showToast("Coins out of cold storage",job.purpose==="settlement"
      ?`${fmtBtc(net)} has reached your hot wallet. Sell it at the Market and pay the arrears before the next bill date, or the grid is cut.`
      :`${fmtBtc(net)} has reached ${walletName(job.to)} and is spendable.`,"success",job.purpose==="settlement"?"market":"custody");
    renderFullQueued=true;
    return false;
  });
}
/* How far away the treasury is, in days, for anything that needs to say so. Zero when the
   money is already liquid. */
function treasuryDistanceDays(s=state){
  return coldLockedBtc(s)>0?coldSpendDays(s):0;
}
