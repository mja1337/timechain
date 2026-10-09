"use strict";

/* CONNECTIVITY - how the site reaches the network, what that costs, and how often it stops.

   Extracted from simulation.js when adding satellite pushed that module past the agreed
   ceiling, which is what the ceiling is for. Everything here is a top-level function resolved
   at call time, so load order only needs the plan and region tables to exist first.

   The shape worth knowing: a plan is normally priced as a multiple of the region's rate and
   rated as a multiple of the region's incident risk, because it rides the local
   infrastructure. A plan carrying flatBase and flatRisk does neither - that is a satellite
   terminal, which is the same hardware, the same fee and the same weather wherever it
   points. */

function connectivityPlan(s=state){return CONNECTIVITY_PLANS.find(x=>x.id===s.connectivity)||CONNECTIVITY_PLANS[0]}
/* Shallow on purpose. What a bigger site buys is redundancy and an SLA, not bandwidth, so
   the ladder runs one line to a redundant business pair rather than to a small ISP's entire
   revenue. A plan can damp it further: satellite scales by adding terminals, which is close
   to flat. */
const CONNECTIVITY_TIER_SCALE=[1,1.2,1.8,2.6,3.6,4.8,6.2,8];
function connectivityScale(s=state,plan=connectivityPlan(s)){
  const tier=CONNECTIVITY_TIER_SCALE[Math.max(0,facilityTier(s)-1)]||1;
  const damp=plan&&Number.isFinite(plan.scaleDamp)?plan.scaleDamp:1;
  return 1+(tier-1)*damp;
}
/* A plan with a flat base is priced globally rather than as a multiple of the local rate,
   which is the whole point of a satellite terminal: the same hardware and the same monthly
   fee whether the site is outside Dallas or up a valley in Bhutan. */
function internetMonthlyCost(s=state){
  const r=REGIONS.find(x=>x.id===s.region)||REGIONS[0],plan=connectivityPlan(s);
  const base=Number.isFinite(plan.flatBase)?plan.flatBase:(r.internet||75)*plan.mult;
  return base*connectivityScale(s,plan);
}
/* Availability: a plan can be dated, and can be absent from jurisdictions that did not allow
   it. Both are read here so the chooser and the switch cannot disagree. */
function connectivityAvailable(plan,s=state){
  if(!plan)return false;
  if(plan.date&&s.time<at(plan.date))return false;
  if(Array.isArray(plan.unavailableIn)&&plan.unavailableIn.includes(s.region))return false;
  if(plan.minFacility&&facilityTier(s)<plan.minFacility)return false;
  return true;
}
/* Moving the fleet can move it somewhere the current link is not offered - a satellite
   terminal is not lawfully available everywhere, and the plan does not travel with you. The
   site falls back to the local fixed line rather than silently keeping a service it cannot
   have. */
function enforceConnectivityAvailability(){
  const plan=connectivityPlan();
  if(connectivityAvailable(plan))return false;
  const reason=connectivityUnavailableReason(plan);
  state.connectivity="fixed";
  log("Connectivity plan changed",`${plan.name} unavailable here · fell back to ${connectivityPlan().name}`,"operations");
  showToast("Connectivity fell back",`${plan.name} is not available at the new site (${reason.toLowerCase()}). The site is on ${connectivityPlan().name} until you choose otherwise.`,"warning","facilities");
  return true;
}
function connectivityUnavailableReason(plan,s=state){
  if(!plan)return "";
  if(plan.date&&s.time<at(plan.date))return `Not available until ${dateFmt(at(plan.date),true)}`;
  if(Array.isArray(plan.unavailableIn)&&plan.unavailableIn.includes(s.region))return `Not offered in ${(REGIONS.find(x=>x.id===s.region)||{}).name||"this region"}`;
  if(plan.minFacility&&facilityTier(s)<plan.minFacility)return `Requires a tier ${plan.minFacility} facility`;
  return "";
}
function connectivityMiningFactor(s=state){return connectivityPlan(s).payout||1}
function connectivityIncidentRisk(s=state){
  const r=REGIONS.find(x=>x.id===s.region)||REGIONS[0],plan=connectivityPlan(s);
  /* A terminal pointed at the sky does not care how good the local exchange is, so its
     incident rate is its own rather than a multiple of the region's. That makes it worse than
     fixed line where the ground infrastructure is good and better where it is not, which is
     the actual shape of the decision. */
  const base=Number.isFinite(plan.flatRisk)?plan.flatRisk:(r.netRisk||.02)*(plan.risk||1);
  return base*(s.skills?.includes("monitoring")?.75:1)*(s.skills?.includes("dualupstream")?.6:1);
}
