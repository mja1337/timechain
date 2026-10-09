"use strict";

/* THE SECOND-HAND MARKET.

   The buy side already depreciated: an S9 that listed near $2,100 in 2016 costs a few percent
   of that by 2022, and arrives worn. What it did NOT do was behave like a market.

   Three things were wrong with it.

   Supply was infinite. You could buy ten thousand six-year-old S9s at three percent of list,
   instantly, in any month. There is no world in which that order fills. Used machines exist
   because somebody else is retiring them, so the quantity available is finite, it is lumpy,
   and it moves with the cycle: a hosting company going under puts thousands of machines on
   the market in a week, and a bull run takes them all off it again.

   It came from the wrong seller. Every purchase, however old the machine, went through the
   manufacturer's channel - a Bitmain allocation queue and a 28-day factory lead for a machine
   Bitmain stopped building four years earlier. Second-hand hardware comes from brokers,
   hosting liquidations and auctions: it ships in days rather than weeks, it is not rationed,
   and the counterparty is worse.

   And it carried no uncertainty. Condition was a pure function of age, so a used purchase was
   a known quantity at a known discount. What you are actually buying is somebody else's
   maintenance record, and you do not get to read it first.

   None of this makes old hardware good. It stays what the depreciation curve already made it:
   cheap, worn, and worth running only where power is cheap. What changes is that you can no
   longer treat it as an unlimited tap. */

/* A machine is new stock until the manufacturer has moved on. Roughly a year and a bit after
   release, which is about when the next generation lands and the channel switches to whoever
   is clearing the last one. */
const SECONDARY_AGE_YEARS=1.2;
function hardwareAgeYears(h,t=state.time){return Math.max(0,(t-at(h.date))/DAY/365)}
function hardwareChannel(h,t=state.time){
  if(!h||h.permanent)return "factory";
  return hardwareAgeYears(h,t)>SECONDARY_AGE_YEARS?"secondary":"factory";
}

/* HOW MANY EXIST TO BUY.

   Supply of a used generation is not flat. Nothing is available while the machine is still
   current; units appear as the first operators upgrade away from it; the peak comes a few
   years after release when the generation is being retired in bulk; and then it thins out as
   machines are scrapped, cannibalised for parts, or simply worn past use.

   The absolute numbers scale with WHEN the machine was built, not with how fast it is. A
   2011 GPU rig generation was a few thousand hobbyists worldwide; an S19 generation is
   hundreds of thousands of machines in warehouses. Mining's installed base roughly doubled
   every couple of years through the industrial era, so the scale doubles with release date
   on that period. A first pass used the machine's own hash rate as the proxy and produced
   almost the same supply for an S9 as for an S21 - true of their hash ratio in logs, and
   nothing like true of how many of each were built. */
const SECONDARY_PEAK_YEARS=2.6,SECONDARY_SPREAD=1.9;
const SECONDARY_SCALE_EPOCH=2013,SECONDARY_SCALE_DOUBLE=2,SECONDARY_BASE_UNITS=60;
function secondaryEraScale(h){
  const year=new Date(at(h.date)).getUTCFullYear();
  const industrial=h.era==="ASIC"||h.era==="HYDRO ASIC"?1:h.era==="FPGA"?.3:.12;
  return industrial*Math.pow(2,(year-SECONDARY_SCALE_EPOCH)/SECONDARY_SCALE_DOUBLE);
}
function secondaryBaseStock(h,t=state.time){
  if(!h||h.permanent)return 0;
  const age=hardwareAgeYears(h,t);
  if(age<=SECONDARY_AGE_YEARS)return 0;
  // A bell in age: slow to appear, a broad peak while the generation is retired in bulk, and
  // a long thin tail as the survivors are scrapped or cannibalised.
  const shape=Math.exp(-Math.pow((age-SECONDARY_PEAK_YEARS)/SECONDARY_SPREAD,2));
  const listed=SECONDARY_BASE_UNITS*secondaryEraScale(h)*shape;
  return listed<1?0:Math.round(listed);
}
/* A liquidation is somebody else's fleet arriving all at once. The same events that soften
   secondary prices put the machines behind that discount on the market. */
function secondaryGlutMultiplier(s=state){
  const glut=s.hardwareGlut;
  if(!glut||s.time>=glut.until)return 1;
  return 1+glut.discount*14;
}
function secondaryStock(id,s=state){
  const listed=s.secondary?.stock?.[id];
  return Math.max(0,Math.floor(Number(listed)||0));
}
/* Listings refresh monthly toward the baseline rather than snapping to it, so a market that
   has just been cleared out stays thin for a while - which is the whole point of it being
   finite. */
function advanceSecondaryMarket(t=state.time){
  const store=state.secondary||(state.secondary={stock:{},month:""});
  const month=new Date(t).toISOString().slice(0,7);
  if(store.month===month)return;
  store.month=month;
  /* Once a month, and it changes what every second-hand card says is available to buy. Cheap to
     ask for a rebuild at that cadence, and wrong to leave a card offering last month's depth. */
  renderFullQueued=true;
  const glut=secondaryGlutMultiplier();
  for(const h of HARDWARE){
    if(h.permanent)continue;
    const target=Math.round(secondaryBaseStock(h,t)*glut);
    const held=secondaryStock(h.id);
    if(target<=0){if(held)delete store.stock[h.id];continue}
    // Restock a third of the gap each month; a glut arrives faster than that.
    const next=held<target?Math.min(target,held+Math.max(1,Math.ceil((target-held)*(glut>1?.6:.34)))):
      Math.max(target,held-Math.ceil((held-target)*.2));
    if(next>0)store.stock[h.id]=next;else delete store.stock[h.id];
  }
}
function consumeSecondaryStock(id,qty){
  const store=state.secondary||(state.secondary={stock:{},month:""});
  const held=secondaryStock(id);
  const taken=Math.max(0,Math.min(held,Math.floor(qty)||0));
  if(!taken)return 0;
  if(held-taken>0)store.stock[id]=held-taken;else delete store.stock[id];
  return taken;
}
/* How many of this machine you could actually buy right now, whatever your cash and site
   allow. Factory stock is not rationed here - allocation queues are modelled as delivery
   risk and lead time in procurementTerms, not as a hard cap. */
function hardwareSupplyLimit(h,s=state){
  if(!h||h.permanent)return 0;
  return hardwareChannel(h,s.time)==="secondary"?secondaryStock(h.id,s):Infinity;
}

/* WHAT ARRIVES.

   incomingConditionFor gives the expected state of a machine of this age. A used purchase
   varies around it, because you are buying somebody else's maintenance record unseen. The
   band is disclosed before you buy - the game does not hide the range, only the draw. */
function secondaryConditionSpread(h,t=state.time){
  const age=hardwareAgeYears(h,t);
  return Math.min(18,Math.round(4+age*2.2));
}
function secondaryConditionRange(h,t=state.time){
  const expected=incomingConditionFor(h,t);
  if(hardwareChannel(h,t)!=="secondary")return{low:expected,high:expected,expected,spread:0};
  const spread=secondaryConditionSpread(h,t);
  return{low:Math.max(55,expected-spread),high:Math.min(100,expected+Math.round(spread*.6)),expected,spread};
}
/* The draw itself, made once per delivered batch rather than per machine: a batch comes from
   one seller and one site, so its units share a history. */
function rollSecondaryCondition(h,t=state.time){
  const band=secondaryConditionRange(h,t);
  if(!band.spread)return band.expected;
  return Math.max(55,Math.min(100,Math.round(band.low+(band.high-band.low)*nextRand())));
}
