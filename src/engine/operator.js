"use strict";

/* OPERATOR PROGRESSION - experience, levels and the best-share record.
   Loaded before simulation.js: its state migration calls normalizeXp() at
   the top level, so these bindings must already exist. Nothing here runs at
   load time; every function reads state only when called. */

const XP_LEVEL_STEP=60,SHARE_WORK=4294967296;
function normalizeXp(raw){
  const xp=raw&&typeof raw==="object"?raw:{},src=xp.sources&&typeof xp.sources==="object"?xp.sources:{};
  const num=(v,fallback=0)=>Number.isFinite(Number(v))?Math.max(0,Number(v)):fallback;
  const out={total:num(xp.total),bestDifficulty:num(xp.bestDifficulty),shares:num(xp.shares),
    sources:{shares:num(src.shares),record:num(src.record),deploy:num(src.deploy),repair:num(src.repair),
      spend:num(src.spend)}};
  out.level=operatorLevel(out.total);out.peakLevel=Math.max(out.level,Math.max(1,Math.floor(num(xp.peakLevel,1))));
  return out;
}
function operatorLevel(total){return 1+Math.floor(Math.sqrt(Math.max(0,total)/XP_LEVEL_STEP))}
function xpForLevel(level){return XP_LEVEL_STEP*Math.pow(Math.max(0,level-1),2)}
function levelAwardsPoint(level){return level<=6?level>1:level<=20?level%2===0:level%4===0}
function xpProgress(){
  const xp=state.xp,level=xp.level,floorXp=xpForLevel(level),ceilXp=xpForLevel(level+1);
  const span=Math.max(1,ceilXp-floorXp),into=Math.max(0,xp.total-floorXp);
  return{level,total:xp.total,floorXp,ceilXp,into,span,remaining:Math.max(0,ceilXp-xp.total),percent:Math.min(100,into/span*100)};
}
function awardXp(amount,source){
  amount=Number(amount);if(!Number.isFinite(amount)||amount<=0)return 0;
  const xp=state.xp;xp.total+=amount;
  if(source&&xp.sources[source]!==undefined)xp.sources[source]+=amount;
  const next=operatorLevel(xp.total);
  if(next>xp.level){
    let gained=0;
    for(let level=xp.level+1;level<=next;level++)if(levelAwardsPoint(level)){state.points++;gained++}
    xp.level=next;xp.peakLevel=Math.max(xp.peakLevel,next);
    log(`Operator level ${next}`,gained?`+${gained} skill point${gained===1?"":"s"}`:"No skill point at this level","milestone");
    showToast(`Operator level ${next}`,gained?`${gained} skill point${gained===1?"":"s"} available to spend in the Tech tree.`:"Keep going - the next skill point is a level or two away.","milestone","tech");
    renderFullQueued=true;
  }
  return amount;
}
function dailyShareCount(hash){return hash>0?hash*86400/SHARE_WORK:0}
// Difficulty-1 work units. In pool mode these really are shares submitted to
// the pool; solo against your own node nothing is submitted anywhere, so the
// honest label is just the work found.
function shareUnitLabel(plural=true){return state.mode==="pool"?(plural?"shares submitted":"share submitted"):(plural?"difficulty-1 shares found":"difficulty-1 share found")}
function fmtDifficulty(value){value=Math.max(0,Number(value)||0);return value>=1e18?(value/1e18).toFixed(2)+"E":value>=1e15?(value/1e15).toFixed(2)+"P":value>=1e12?(value/1e12).toFixed(2)+"T":value>=1e9?(value/1e9).toFixed(2)+"G":value>=1e6?(value/1e6).toFixed(2)+"M":value>=1e3?(value/1e3).toFixed(2)+"K":value.toFixed(0)}
function advanceOperatorXp(blocksFound=0,silent=false){
  const fs=fleet();if(!operating()||fs.hash<=0)return;
  const shares=dailyShareCount(fs.hash);state.xp.shares+=shares;
  awardXp(1.2*Math.log2(1+shares),"shares");
  // Best-of-N difficulty-1 shares is Pareto(1): P(share >= d) = 1/d, so the
  // daily maximum is well modelled by shares/U.
  const difficulty=Math.max(1,difficultyAt(state.time));
  let best=shares/Math.max(1e-9,nextRand());
  // A share at or above network difficulty IS a block. Solo, that has to agree
  // with what the day actually produced, or the record implies blocks the
  // player was never paid for.
  const solo=state.mode!=="pool"||!availablePool()||!poolEligible();
  if(solo){
    if(blocksFound>0)best=Math.max(best,difficulty/Math.max(1e-9,nextRand()));
    else if(best>=difficulty)best=difficulty*(.55+nextRand()*.44);
  }
  if(best>state.xp.bestDifficulty){
    const previous=Math.max(1,state.xp.bestDifficulty);state.xp.bestDifficulty=best;
    awardXp(Math.min(400,40*Math.log2(best/previous)),"record");
    if(best>=previous*4){
      const blockNote=best>=difficulty?solo?" - that share was your block":` - that share found ${poolData().name}'s block`:"";
      log("New best share difficulty",`${fmtDifficulty(best)} · highest yet${blockNote}`,"fleet");
      if(!silent)showToast("New best share",`Your fleet found a share at difficulty ${fmtDifficulty(best)}${blockNote||" - a personal record"}.`,"milestone","dashboard");
    }
  }
}
