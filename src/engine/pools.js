"use strict";

/* POOLS - selection, market share, fees and payout schemes. The scheme is
   what decides whether transaction fees reach the miner and who carries the
   variance; see POOL_SCHEMES. Loaded after simulation.js; nothing here runs
   at load time. */

function poolEligible(p=poolData()){return !!p&&(!p.requires||hasSkill(p.requires))}
function availablePool(){return state.time>=at("2010-12-16")}
function poolData(id=state.pool){return POOLS.find(x=>x.id===id)||POOLS.find(x=>x.id==="f2pool")}
function poolClosed(id,t=state.time){const p=POOLS.find(x=>x.id===id);return !!p?.closed&&t>=at(p.closed)}
function poolShareAt(id,t){const p=poolData(id);if(!p||id==="solo")return id==="solo"?0:0;const a=p.anchors.map(([d,v])=>[at(d),v]).sort((x,y)=>x[0]-y[0]);if(t<a[0][0])return 0;for(let i=0;i<a.length-1;i++){const [t0,v0]=a[i],[t1,v1]=a[i+1];if(t>=t0&&t<=t1){const f=(t-t0)/(t1-t0);return v0+(v1-v0)*f}}return a[a.length-1][1]}
// A pool's payout scheme is not a fixed property: schemes were invented at
// particular moments and pools migrated between them. Resolve against the date.
function poolTermsAt(id=state.pool,t=state.time){
  const p=poolData(id),rows=p?.schemes;
  if(!rows||!rows.length)return{scheme:"fpps",fee:p?.fee??.02};
  let picked=rows[0];
  for(const row of rows)if(t>=at(row[0]))picked=row;
  return{scheme:picked[1],fee:picked[2]};
}
function poolFee(){return Math.max(0,poolTermsAt().fee-(hasSkill("poolops")?.004:0))}
function poolFeeAt(id,t){return Math.max(0,poolTermsAt(id,t).fee-(hasSkill("poolops")?.004:0))}
function poolScheme(id=state.pool,t=state.time){return poolTermsAt(id,t).scheme}
// PPS keeps the transaction fees; every other scheme passes them through.
function poolRewardFactorAt(t,id=state.pool){const full=blockRewardAt(t);return poolScheme(id,t)==="pps"&&full>0?subsidyAt(t)/full:1}
const POOL_SCHEMES={
  fpps:{name:"FPPS",label:"Full pay-per-share",desc:"A flat rate per share covering both the subsidy and an average of transaction fees, paid whether or not the pool finds a block. The pool absorbs all the variance and charges for it."},
  pps:{name:"PPS",label:"Pay-per-share",desc:"A flat rate per share on the block subsidy only - transaction fees stay with the pool. Almost irrelevant early on, increasingly expensive as fees grow into a real share of the reward."},
  ppsplus:{name:"PPS+",label:"Pay-per-share plus",desc:"Subsidy paid as pay-per-share, transaction fees paid on what the pool actually collects. Steady on the big half of the reward, slightly lumpy on the rest."},
  pplns:{name:"PPLNS",label:"Pay per last N shares",desc:"You are paid only out of blocks the pool actually finds, weighted by your recent shares. Same expected return, real variance, and the cheapest fees - a bet on the pool's luck."},
  tides:{name:"TIDES",label:"Transparent index of deserving entities",desc:"A pay-per-last-N-shares scheme run against a published share window. Same variance profile as PPLNS, with the accounting made auditable."},
  prop:{name:"Proportional",label:"Proportional to shares this round",desc:"The original scheme. When the pool finds a block it is split across every share submitted in that round, so a long round pays everyone less and a short one pays more. Simple, and gameable: miners could hop in on fresh rounds and leave on stale ones, which is why the field moved on."},
  score:{name:"Score",label:"Time-weighted proportional",desc:"Slush's answer to pool hopping: proportional, but each share is scored by when in the round it arrived, so late shares in a long round are worth more. Steadier than proportional and much harder to game."},
  solo:{name:"Solo",label:"No pool",desc:"You keep whole blocks and nothing in between."}
};
// Scheme decides two real things: whether transaction fees reach you, and how
// much variance you carry. Expected value is otherwise the same.
function poolPayoutFor(lambda,t){
  const scheme=poolScheme(state.pool,t),fee=poolFee(),subsidy=subsidyAt(t),full=blockRewardAt(t),feePart=Math.max(0,full-subsidy);
  const jitter=(spread)=>1+(nextRand()*2-1)*spread;
  if(scheme==="pps")return lambda*subsidy*(1-fee)*jitter(.01);
  if(scheme==="ppsplus")return lambda*(1-fee)*(subsidy*jitter(.01)+feePart*jitter(.35));
  if(scheme==="pplns"||scheme==="tides")return lambda*full*(1-fee)*jitter(.42);
  if(scheme==="score")return lambda*full*(1-fee)*jitter(.5);
  if(scheme==="prop")return lambda*full*(1-fee)*jitter(.62);
  return lambda*full*(1-fee)*jitter(.03);
}
