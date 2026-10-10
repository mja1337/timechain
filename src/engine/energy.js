"use strict";

/* ENERGY LAYER - one place for the site's daily electricity ledger.

   Phase 0 deliberately models no new plant. It makes the existing contract math explicit so
   the tick, settlement forecast and UI cannot quietly disagree. The options object also gives
   later solar, storage and demand-response work a stable seam: each source can reduce gridWatts
   before the bill is calculated without teaching every caller another formula.
 */
const ENERGY_STATE_DEFAULT=()=>({plant:{solarKwp:0,batteryKwh:0,gensetKw:0,pods:[]},orders:[],dr:{program:null,from:0,strikes:[],suspendedUntil:0,baselineKw:0,monthCredit:0,events:[]}});
function normalizeEnergyState(target){
  if(!target||typeof target!=="object")return target;
  const defaults=ENERGY_STATE_DEFAULT(),energy=target.energy&&typeof target.energy==="object"?target.energy:{};
  energy.plant=Object.assign(defaults.plant,energy.plant&&typeof energy.plant==="object"?energy.plant:{});
  energy.plant.solarKwp=Math.max(0,Number(energy.plant.solarKwp)||0);
  energy.plant.batteryKwh=Math.max(0,Number(energy.plant.batteryKwh)||0);
  energy.plant.gensetKw=Math.max(0,Number(energy.plant.gensetKw)||0);
  energy.plant.pods=Array.isArray(energy.plant.pods)?energy.plant.pods:[];
  energy.orders=Array.isArray(energy.orders)?energy.orders:[];
  energy.dr=Object.assign(defaults.dr,energy.dr&&typeof energy.dr==="object"?energy.dr:{});
  energy.dr.strikes=Array.isArray(energy.dr.strikes)?energy.dr.strikes:[];
  energy.dr.events=Array.isArray(energy.dr.events)?energy.dr.events:[];
  energy.dr.program=typeof energy.dr.program==="string"?energy.dr.program:null;
  energy.dr.from=Number(energy.dr.from)||0;
  energy.dr.suspendedUntil=Number(energy.dr.suspendedUntil)||0;
  energy.dr.baselineKw=Math.max(0,Number(energy.dr.baselineKw)||0);
  energy.dr.monthCredit=Math.max(0,Number(energy.dr.monthCredit)||0);
  target.energy=energy;
  return target;
}

function energyContractFor(target=state){return POWER_CONTRACTS.find(contract=>contract.id===target?.contract)||POWER_CONTRACTS[0]}
function contractLoadFactorAt(t=state.time,contract=powerContract()){return contract.id==="curtail"?1-curtailmentIntensityAt(t):1}
function energyFleetLoad(target=state,t=target.time,contract=energyContractFor(target)){
  const fs=fleet(target),factor=contractLoadFactorAt(t,contract),minerWatts=Math.max(0,fs.minerW*factor),coolingWatts=coolingPowerWatts(target,minerWatts),watts=minerWatts+coolingWatts;
  return{...fs,contract,contractLoadFactor:factor,minerW:minerWatts,coolingW:coolingWatts,w:watts,kw:watts/1000,within:watts/1000<=fs.cap&&fs.space<=(FACILITIES.find(x=>x.id===target.facility)||FACILITIES[0]).space,baseMinerW:fs.minerW,baseCoolingW:fs.coolingW,baseW:fs.w,baseKw:fs.kw};
}
function siteEnergyDaily(options={}){
  const t=Number.isFinite(Number(options.time))?Number(options.time):state.time,r=options.region||region(),contract=options.contract||powerContract(),fs=options.fleet||fleet(),active=options.active!==false,curtail=contract.id==="curtail"?curtailmentIntensityAt(t):0,explicitLoad=Number.isFinite(Number(options.loadWatts)),physical=explicitLoad?null:energyFleetLoad(state,t,contract),baseWatts=Math.max(0,active?(explicitLoad?Number(options.loadWatts):physical.baseW):0),baseMinerWatts=Math.max(0,active?(explicitLoad?Number(options.minerWatts??options.loadWatts):physical.baseMinerW):0),minerWatts=Math.max(0,active?(explicitLoad?baseMinerWatts*(1-curtail):physical.siteMinerW):0),nodeWatts=Math.max(0,Number.isFinite(Number(options.nodeWatts))?Number(options.nodeWatts):0),gridWatts=Math.max(0,active?(explicitLoad?baseWatts*(1-curtail):physical.siteW):0)+nodeWatts,gross=dailyEnergyCostForWatts(gridWatts,t,r,contract),credit=options.includeCredit===false?0:curtailmentCreditDaily(minerWatts,t,r,contract,baseMinerWatts);
  return{time:t,region:r,contract,baseWatts,baseMinerWatts,minerWatts,nodeWatts,gridWatts,releasedWatts:Math.max(0,baseWatts-(gridWatts-nodeWatts)),curtailment:curtail,rate:powerRate(r,t,contract),gross,credit,total:Math.max(0,gross-credit)};
}
