"use strict";

/* ENGINE LAYER - cross-run career persistence and the end-of-run narrative recap.
   Kept in its own file rather than simulation.js, which is already past the agreed module ceiling. */
const CAREER_KEY="hashrate-career-v1";
function loadCareer(){
  try{const raw=localStorage.getItem(CAREER_KEY);if(raw)return Object.assign({runs:0,bestScore:0,bestGrade:"At risk",bestDifficulty:null,sandboxCompletions:0,milestonesEverHit:0},JSON.parse(raw))}catch(e){}
  return{runs:0,bestScore:0,bestGrade:"At risk",bestDifficulty:null,sandboxCompletions:0,milestonesEverHit:0};
}
function saveCareer(career){try{localStorage.setItem(CAREER_KEY,JSON.stringify(career))}catch(e){}}
function recordCareerRun(){
  const career=loadCareer(),score=operatorScoreBreakdown();
  career.runs+=1;
  if(score.total>career.bestScore){career.bestScore=score.total;career.bestGrade=operatorGrade(score.total);career.bestDifficulty=state.difficulty}
  if(state.endReason==="sandbox-complete")career.sandboxCompletions+=1;
  career.milestonesEverHit=Math.max(career.milestonesEverHit,state.milestones.length);
  saveCareer(career);
}
function careerSummaryHtml(context="intro"){
  const career=loadCareer();if(career.runs<1)return"";
  const kicker=context==="end"?`Career record · run ${career.runs} complete`:`Career record · about to start run ${career.runs+1}`;
  return `<div class="career-summary"><span class="career-summary-kicker">${kicker}</span><div class="career-summary-stats"><div><b>${fmtNum(career.runs)}</b><span>run${career.runs===1?"":"s"} completed</span></div><div><b>${career.bestGrade} · ${fmtNum(career.bestScore)}</b><span>best score${career.bestDifficulty?` · ${startingMode(career.bestDifficulty).label}`:""}</span></div><div><b>${fmtNum(career.sandboxCompletions)}</b><span>centur${career.sandboxCompletions===1?"y":"ies"} completed</span></div><div><b>${career.milestonesEverHit} / ${MILESTONES.length}</b><span>best milestone haul</span></div></div></div>`;
}
function settlementRescueFeedback(kind,paid,cashAfter){
  if(kind==="btc-rescue")return["Bill paid by selling BTC",`${fmtUsd(paid)} was settled. ${fmtUsd(cashAfter)} cash remains; this month counts as a rescue, not a clean settlement.`];
  if(kind==="liquidation")return["Bill paid by selling miners",`${fmtUsd(paid)} was settled. ${fmtUsd(cashAfter)} cash remains. Those miners can no longer earn for you; check whether the smaller fleet can cover its remaining costs.`];
  if(kind==="secured")return["Bill paid by borrowing against your coins",`${fmtUsd(paid)} was settled. ${fmtUsd(cashAfter)} cash remains; the loan adds interest to every bill until it is repaid and a fall in the price can call it.`];
  if(kind==="bridge")return["Bill paid with emergency debt",`${fmtUsd(paid)} was settled. The debt remains, and interest adds to future bills. You have bought time to improve cash flow; borrowing again cannot make an ongoing operating loss disappear.`];
  return null;
}
function runRecap(){
  const eras=OPERATOR_ERAS.map(era=>({era,stats:operatorEraStats(era),score:operatorEraScore(operatorEraStats(era))})).filter(x=>x.stats&&x.stats.months>0);
  const best=eras.reduce((top,x)=>!top||x.score>top.score?x:top,null),worst=eras.reduce((low,x)=>!low||x.score<low.score?x:low,null);
  const lived=EVENTS.filter(e=>e.imp===3&&state.seen.includes(e.id)),sample=lived.slice(0,3).map(e=>e.title);
  const rescues=(state.operator.bridgeLoans||0)+(state.operator.restructures||0),years=((state.time-(state.campaignStart||START))/DAY/365.25).toFixed(1),score=operatorScoreBreakdown(),months=Math.max(1,state.operator.totalMonths||0),solvency=Math.round((state.operator.solventMonths||0)/months*100),profitability=Math.round((state.operator.profitableMonths||0)/months*100);
  const eraLine=best&&worst&&best.era.id!==worst.era.id?`Operations were strongest through the ${best.era.name} and weakest through the ${worst.era.name}.`:best?`Operations held a steady standard through the ${best.era.name}.`:"";
  const historyLine=sample.length?`Along the way this operation lived through ${sample.join(", ")}${lived.length>3?`, and ${lived.length-3} other major event${lived.length-3===1?"":"s"}`:""}.`:"The campaign opened and closed before any major historical event crossed its timeline.";
  const rescueLine=rescues>0?`It leaned on emergency bridge finance or receivership ${rescues} time${rescues===1?"":"s"} to stay solvent.`:"It never needed emergency bridge finance or receivership to stay solvent.";
  const milestoneLine=`${state.milestones.length} of ${MILESTONES.length} operator milestones were reached.`,verdict=score.total>=800?"You built an exceptional mining business that kept adapting as Bitcoin industrialised.":score.total>=650?"You ran a disciplined operation and survived Bitcoin's changing economics with real resilience.":score.total>=500?"The operation survived, but uneven economics kept it from becoming consistently resilient.":"The operation reached the finish, but repeated pressure exposed a fragile business model.",lesson=rescues?"The defining lesson is liquidity: productive miners and valuable BTC could not always meet a cash bill at the moment it arrived.":profitability<60?"The defining lesson is margin: survival was stronger than month-to-month profitability.":"The defining lesson is adaptation: protecting margin and uptime prevented an emergency rescue.";
  return `<section class="run-recap"><h3>Your run, in plain English</h3><div class="run-verdict"><span>Final assessment</span><b>${verdict}</b><p>${lesson}</p></div><div class="recap-outcomes"><div><span>Financial resilience</span><b>${solvency}%</b><p>of recorded months settled without insolvency</p></div><div><span>Profitable months</span><b>${profitability}%</b><p>of recorded months met the era's profitability test</p></div><div><span>Legacy</span><b>${fmtBtc(totalBtc()+lightningLocked())}</b><p>held across wallets and venues at the finish</p></div></div><p>Starting on ${dateFmt(state.campaignStart||START,true)} in ${startingMode(state.difficulty).label}, the operation ran for ${years} simulated years. ${eraLine} ${historyLine} ${rescueLine} ${milestoneLine}</p><p>Final Operator Score: <b>${score.total} / 1,000 · ${operatorGrade(score.total)}</b>.</p></section>`;
}
