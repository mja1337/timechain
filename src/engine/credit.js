"use strict";

/* CREDIT - what borrowing costs, and what the lender asks to see.

   The operating loan's rate used to be written out in seven places: the month-end bill, the
   settlement forecast, the reserve milestone, the Finance screen three times and a label. They
   agreed only because nobody had changed one. Anything that is about to make the rate depend on
   something has to start by making it one thing, so this is that, and nothing else yet.

   Loaded after keyholders.js; nothing here runs before the page has finished parsing. */

/* What the optional migration cover costs: a share of the fleet's value. */
function migrationInsuranceCost(){return state.insured?fleet().value*.0015:0}

/* The monthly rate on the operating loan. */
function projectLoanRate(){return hasStaff("treasurer")?.009:.012}
/* What all outstanding borrowing adds to the next bill. */
function financeInterestMonthly(){return (state.projectLoan||0)*projectLoanRate()+(typeof securedInterestMonthly==="function"?securedInterestMonthly():0)}

/* ---- what a lender or an insurer sees ----------------------------------------------------- */

/* CUSTODY POSTURE: one word for how well the keys are kept, so that whoever prices a risk on them
   does not have to read the whole setup.

     NONE      no wallet that can sign, or one that could not be rebuilt if a signer were lost
     BASIC     it can sign and it can be rebuilt
     STRONG    and nothing about it is a known weakness: no key anybody else knows, no seed with a
               known flaw, the places recorded and no single one of them holding everything needed,
               and every backup on something that survives a fire
     AUDITED   strong, and somebody independent has looked within the last year

   Every finding says what is wrong in a sentence, and which rung it blocks. The audit reports the
   same list, because an audit that found something the player could not already see would be
   a trick rather than a service. */

const AUDIT_START=Date.parse("2014-01-01T00:00:00Z");   // the first firms that would look at a bitcoin custody setup
const AUDIT_COST=4000,AUDIT_DAYS=14,AUDIT_VALID_DAYS=365;
const POSTURE_TIERS=["none","basic","strong","audited"];

function custodyAuditUntil(s=state){return Number(s.custody&&s.custody.auditUntil)||0}
function custodyAuditValid(s=state){return custodyAuditUntil(s)>s.time}
function custodyAuditJob(s=state){return (s.custody&&s.custody.audit)||null}

function custodyPostureFindings(s=state){
  const set=custodySetup(s),out=[],add=(id,text,blocks)=>out.push({id,text,blocks});
  if(!set.ready)add("unsigned","No wallet can sign yet: not every key the policy needs is assigned.","basic");
  else if(!custodyRecoverable(s))add("unrecoverable","The wallet could not be rebuilt if a signer were lost: a backup or the quorum's configuration is missing.","basic");
  if(typeof hotKeyUnbacked==="function"&&hotKeyUnbacked(s))add("hotkey","The key to your online wallet exists only on the mining computer: one dead disk takes everything in it.","strong");
  if(set.exposed>0)add("exposed","A key of this wallet is known to somebody else. Replace it.","strong");
  if(custodyAssignedKeys(s).some(k=>k.weakEntropy))add("weak","A key was generated from a seed with a known flaw. Replace it.","strong");
  if(set.ready&&!set.placed)add("unplaced","Nothing records where the keys are kept, so nobody can say what a fire would take.","strong");
  if(set.placed&&set.fragile)add("fragile",`Losing ${custodyPlaceName(set.fragileAt)} would leave the wallet unrecoverable.`,"strong");
  if(set.ready&&set.steelBacked<set.assigned.length)add("paper","Some seed backups are on paper, which a fire or a flood destroys.","strong");
  if(set.ready&&set.liveDistinct<set.policy.threshold)add("signers","Too few working signers: a device was destroyed or is on its way.","strong");
  return out;
}
function custodyPosture(s=state){
  const findings=custodyPostureFindings(s),blocks=tier=>findings.some(f=>f.blocks===tier);
  let rank=0;
  if(!blocks("basic")){rank=1;if(!blocks("strong")){rank=2;if(custodyAuditValid(s))rank=3}}
  return{tier:POSTURE_TIERS[rank],rank,findings};
}

/* ---- the audit --------------------------------------------------------------------------------- */

function auditBlockReason(s=state){
  if(s.time<AUDIT_START)return "Nobody audits bitcoin custody this early.";
  if(custodyAuditJob(s))return "An audit is already under way.";
  if(!hasStaff("security"))return "An audit is run by your security officer. Hire one first.";
  if(s.cash<AUDIT_COST)return `An audit costs ${fmtUsd(AUDIT_COST)} and you have ${fmtUsd(s.cash)}.`;
  if(!custodySetup(s).ready)return "There is no wallet to audit yet.";
  return "";
}
function commissionCustodyAudit(){
  const reason=auditBlockReason();
  if(reason)return showToast("Cannot start an audit",reason,"bad","custody");
  state.cash-=AUDIT_COST;
  state.custody.audit={started:state.time,due:state.time+AUDIT_DAYS*DAY,cost:AUDIT_COST};
  log("Custody audit commissioned",`${fmtUsd(AUDIT_COST)} · ${AUDIT_DAYS} days`,"custody");
  showToast("Audit under way",`Your security officer is reviewing the keys. It takes ${AUDIT_DAYS} days and reports every finding, whether or not it passes.`,"info","custody");
  save();render();
}
function advanceAudit(silent=false){
  const c=state.custody,job=custodyAuditJob();
  if(!job||pendingAt(job,state.time))return;
  const findings=custodyPostureFindings(),blocking=findings.filter(f=>f.blocks==="basic"||f.blocks==="strong"),passed=blocking.length===0;
  c.audit=null;c.lastAudit={at:state.time,passed,findings:findings.map(f=>f.text)};
  if(passed)c.auditUntil=state.time+AUDIT_VALID_DAYS*DAY;
  log(passed?"Custody audit passed":`Custody audit: ${blocking.length} finding${blocking.length===1?"":"s"}`,
    passed?`Valid until ${dateFmt(c.auditUntil)}`:blocking.map(f=>f.text).join(" "),"custody");
  if(!silent)showToast(passed?"Audit passed":"Audit found problems",
    passed?`Your custody is audited until ${dateFmt(c.auditUntil)}. Anybody who prices a risk on your keys can see it.`:`${blocking.map(f=>f.text).join(" ")} Fix them and ask again.`,passed?"success":"bad","custody");
  renderFullQueued=true;
}

/* ---- cover against theft ------------------------------------------------------------------------ */

/* COIN COVER pays when coins are STOLEN, and what it will pay for is the whole point of it.

   It prices the keys, so it asks the same question the loan does: how well are they kept? The better
   the posture, the cheaper the premium and the more of a loss it pays. It pays for what you could not
   reasonably have prevented, the online wallet taken or a break-in, and not for what you left lying
   about: a seed you knew had a flaw, a key you knew somebody else held, or a seed you typed into a
   fake. An insurer that paid for those would be paying you to be careless.

   It does not cover a venue failing (those are claims, not thefts), or coins nobody can spend any
   more (that is loss, not theft). A new policy does not pay for 30 days, so it cannot be bought
   after the fact.

   Premium is a share of the self-held coins at today's price, so it moves with the market. */

const COVER_START=Date.parse("2016-01-01T00:00:00Z");
const COVER_ANNUAL_RATE=.0035;                             // of insured value a year, for a STRONG posture. It was 1.5%, which was 17 to 280 times what it could be expected to pay
const COVER_PREMIUM_FACTOR={basic:1.5,strong:1,audited:.6};
const COVER_PAYS={basic:.5,strong:.7,audited:.85};
const COVER_WAIT_DAYS=30;
const COVER_COVERED=["hotwallet","burglary"];
const COVER_EXCLUDED={
  entropy:"a key generated from a seed with a known flaw, which the policy treats as a known weakness left in place",
  phishing:"a seed you typed into a fake, which the policy treats as handing it over",
  insider:"a key you knew somebody else held and had not replaced",
  seizure:"a government opening a box in its own country, which no policy covers"
};

function coinCover(s=state){return s.coinCover&&typeof s.coinCover==="object"?s.coinCover:null}
function coinCoverActive(s=state){return !!coinCover(s)}
function coinCoverInsuredBtc(s=state){return (s.wallets?.hot||0)+(s.wallets?.cold||0)}
/* The monthly premium, in dollars, at today's holdings and price. */
function coinCoverPremium(s=state){
  const cover=coinCover(s);if(!cover||s.time<MARKET)return 0;
  const factor=COVER_PREMIUM_FACTOR[custodyPosture(s).tier];if(!factor)return 0;
  return coinCoverInsuredBtc(s)*priceAt(s.time)*COVER_ANNUAL_RATE*factor/12;
}
/* The same premium for a given posture, for the screen to show before anything is bought. */
function coinCoverQuote(tier,s=state){
  const factor=COVER_PREMIUM_FACTOR[tier];if(!factor||s.time<MARKET)return null;
  return{premium:coinCoverInsuredBtc(s)*priceAt(s.time)*COVER_ANNUAL_RATE*factor/12,pays:COVER_PAYS[tier]};
}
function coinCoverBlockReason(s=state){
  if(s.time<COVER_START)return "Nobody insures self-held bitcoin this early.";
  if(coinCoverActive(s))return "";
  const p=custodyPosture(s);
  if(p.rank<1)return "An insurer will not quote on keys that cannot sign, or could not be rebuilt if a signer were lost.";
  if(coinCoverInsuredBtc(s)<=0)return "There is nothing self-held to insure.";
  return "";
}
function toggleCoinCover(){
  if(coinCoverActive()){
    state.coinCover=null;log("Coin cover cancelled","","custody");
    showToast("Cover cancelled","The policy ends now. A new one will not pay for thirty days after it is bound.","info","custody");
    save();render();return;
  }
  const reason=coinCoverBlockReason();
  if(reason)return showToast("No cover available",reason,"bad","custody");
  state.coinCover={since:state.time,tier:custodyPosture().tier};
  log("Coin cover bound",`${fmtUsd(coinCoverPremium())}/month · pays ${Math.round(COVER_PAYS[custodyPosture().tier]*100)}% of a covered theft after ${COVER_WAIT_DAYS} days`,"custody");
  showToast("Cover bound",`${fmtUsd(coinCoverPremium())} a month. It pays ${Math.round(COVER_PAYS[custodyPosture().tier]*100)}% of a covered theft, from ${dateFmt(state.time+COVER_WAIT_DAYS*DAY)}.`,"success","custody");
  save();render();
}
/* An insurer withdraws from a risk it can no longer price. Rolled monthly with the other operational risks. */
function advanceCoinCover(next,silent=false){
  if(!coinCoverActive())return;
  if(custodyPosture().rank<1){
    state.coinCover=null;
    log("Coin cover withdrawn","The insurer can no longer price your keys","custody");
    if(!silent)showToast("Your insurer withdrew cover","Your keys can no longer sign or be rebuilt, so the policy has been cancelled. Rebuild the wallet and ask again.","bad","custody");
  }
}

/* What a covered claim pays, and the sentence that goes in the loss notice either way. Called by
   reportCoinLoss for every loss, and says nothing unless there is cover and the loss is a theft. */
function coinCoverClaim(entry,btc,s=state){
  const cover=coinCover(s);
  if(!cover||entry.kind!=="stolen"||btc<=0)return null;
  const cause=entry.cause,price=s.time>=MARKET?priceAt(s.time):0,usd=btc*price;
  if(COVER_EXCLUDED[cause])return{paid:0,note:` Your cover does not pay for this: it is ${COVER_EXCLUDED[cause]}.`};
  if(!COVER_COVERED.includes(cause))return{paid:0,note:""};
  if(s.time<cover.since+COVER_WAIT_DAYS*DAY)return{paid:0,note:` Your cover was bound ${Math.floor((s.time-cover.since)/DAY)} days ago and does not pay for the first ${COVER_WAIT_DAYS}.`};
  const tier=custodyPosture(s).tier,share=COVER_PAYS[tier]||0,paid=usd*share;
  if(paid<=0)return{paid:0,note:""};
  return{paid,note:` Your cover paid ${fmtUsd(paid)}, ${Math.round(share*100)}% of the ${fmtUsd(usd)} lost, at your ${tier} posture. It is cash, not coins.`};
}
