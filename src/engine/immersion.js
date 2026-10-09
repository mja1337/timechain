"use strict";

/* IMMERSION COOLING - dielectric tanks, the conversion of air-cooled miners, and what
   submerging a machine actually changes.

   Single-phase immersion became a real deployment option for bitcoin miners around 2020-21,
   which is why the tank is dated 2021 rather than being available from the workshop era. Two-
   phase immersion is deliberately absent: it depended on 3M's Novec fluids, and 3M announced
   in December 2022 that it would exit PFAS manufacturing, so a two-phase ladder entry would
   be a dead end the game would then have to take away.

   Four things change when a miner goes in the fluid, and all four are things operators
   actually report:

     1. It can be clocked harder. Stock firmware limits are set by what air can carry away.
     2. It draws more power for that, and worse efficiency per hash. Immersion does not make
        a miner efficient - it makes headroom usable. Whether that trade is worth taking is
        the decision, and it flips with the power price and the coin price.
     3. Its heat stops being the room's problem. The load goes into fluid and out through the
        tank loop, so a converted fleet does not fight the room temperature that drives wear
        and failure in this engine. In a hot region this is worth more than the overclock.
     4. It has no fans left to fail, and it stops eating dust and thermal cycling.

   Hydro miners are excluded because they are already liquid-cooled, and the mining laptop is
   excluded for the obvious reason. */

const IMMERSION_TANK="immersion";
/* Conversion multipliers. Applied per converted unit, on top of whatever else the fleet
   already does - overdrive included, because immersion is precisely what makes pushing a
   machine past its air rating survivable. */
const IMMERSION_HASH_GAIN=1.25;
const IMMERSION_POWER_GAIN=1.35;
/* Wear and failure both fall, but neither disappears: boards still age, pumps still stop. */
const IMMERSION_WEAR=.55;
const IMMERSION_FAULT=.5;
/* Tank losses and the pipework between the tank and the heat exchanger still warm the room
   a little. The rest of the heat leaves the building without passing through the air. */
const IMMERSION_ROOM_HEAT_SHARE=.06;

function immersionTankDef(){return COOLING_EQUIPMENT.find(item=>item.id===IMMERSION_TANK)}
function immersionTankCount(s=state){return Math.max(0,Math.floor(Number(s.thermal?.equipment?.[IMMERSION_TANK])||0))}
function immersionUnitsPerTank(){return immersionTankDef()?.units||0}
function immersionCapacity(s=state){return immersionTankCount(s)*immersionUnitsPerTank()}
function immersionAvailable(s=state){const def=immersionTankDef();return !!def&&s.time>=at(def.date)}

/* A machine you could sensibly submerge. Hydro miners already carry their own loop, and the
   starting laptop is not going in a bath of dielectric fluid. */
function immersionEligible(h){return !!h&&h.era!=="HYDRO ASIC"&&!h.permanent}

/* Converted counts are stored per hardware type but clamped to what is still owned, so
   selling or decommissioning machines can never leave a phantom conversion behind. */
function immersionCount(id,s=state){
  const owned=Math.max(0,Math.floor(Number(s.hardware?.[id])||0));
  return Math.max(0,Math.min(owned,Math.floor(Number(s.immersion?.[id])||0)));
}
function immersionTotal(s=state){return HARDWARE.reduce((sum,h)=>sum+immersionCount(h.id,s),0)}
function immersionFree(s=state){return Math.max(0,immersionCapacity(s)-immersionTotal(s))}
function immersionShare(h,s=state){const n=s.hardware?.[h.id]||0;return n?immersionCount(h.id,s)/n:0}

/* How many of a type's currently-running units are submerged. Repairs and manual shutdowns
   come off the air-cooled units first, which keeps the split stable while a job runs. */
function immersionActive(h,active,s=state){return Math.max(0,Math.min(active,immersionCount(h.id,s)))}
/* Immersion tuning buys clock headroom, not efficiency: the extra hash rises, the extra
   power does not, so the trade stays a trade and only gets better at it. */
function immersionHashGain(s=state){return s.skills?.includes("immersiontuning")?1.35:IMMERSION_HASH_GAIN}

/* Fans that are not there cannot seize. The weight does not vanish - it is redistributed
   across whatever else the machine can break - and it only falls in proportion to how much
   of the fleet is actually in fluid. */
function immersionAdjustedWeights(h,weights,s=state){
  const share=immersionShare(h,s);
  if(share<=0)return weights;
  const fanTier=fanTierFor(h);
  if(!(fanTier in weights))return weights;
  const adjusted={...weights};
  adjusted[fanTier]=weights[fanTier]*(1-share);
  if(adjusted[fanTier]<=1e-9)delete adjusted[fanTier];
  return adjusted;
}

function immersionConversionLabour(h,qty){return Math.max(60,Math.round(18*qty))}
function immersionKitsFor(qty){return Math.max(1,Math.floor(qty))}

/* Why a conversion cannot go ahead, as a sentence, or "" when it can. One function so the
   button's disabled state and the refusal toast can never drift apart. */
function immersionBlockReason(h,qty,s=state){
  if(!immersionAvailable(s))return `Immersion tanks are not available until ${dateFmt(at(immersionTankDef()?.date||0),true)}.`;
  if(!immersionEligible(h))return h.era==="HYDRO ASIC"?`${h.name} is already liquid-cooled - it runs its own closed loop.`:`${h.name} cannot be submerged.`;
  if(!immersionTankCount(s))return "No immersion tank installed. Order one from the cooling plant first.";
  const owned=s.hardware?.[h.id]||0,converted=immersionCount(h.id,s);
  if(owned-converted<qty)return `Only ${owned-converted} air-cooled ${h.name} unit${owned-converted===1?"":"s"} remain to convert.`;
  if(immersionFree(s)<qty)return `Tank capacity is full: ${immersionTotal(s)} of ${immersionCapacity(s)} slots used. Another tank holds ${immersionUnitsPerTank()} more.`;
  const kits=immersionKitsFor(qty);
  if((s.maintenance?.inventory?.immersionKit||0)<kits)return `Converting ${qty} unit${qty===1?"":"s"} needs ${kits} immersion conversion kit${kits===1?"":"s"}; order them from spare parts first.`;
  if(s.cash<immersionConversionLabour(h,qty))return `Conversion labour costs ${fmtUsd(immersionConversionLabour(h,qty))}.`;
  return "";
}

/* Why a drain cannot go ahead, as a sentence, or "" when it can. Coming out of the fluid is not
   free - the fans go back on and somebody does the work - so it can be refused for want of
   cash, and the button offering it has to know that. It did not, so an operator with no money
   saw an enabled "Drain 10" that did nothing when pressed. */
function immersionDrainBlockReason(h,qty=null,s=state){
  if(!h)return "That machine does not exist.";
  const submerged=immersionCount(h.id,s);
  if(!submerged)return `No ${h.name} units are currently submerged.`;
  const count=Math.max(1,Math.min(Number(qty)||submerged,submerged));
  const labour=immersionConversionLabour(h,count);
  if(s.cash<labour)return `Draining and refitting ${count} unit${count===1?"":"s"} costs ${fmtUsd(labour)}; you have ${fmtUsd(s.cash)}.`;
  return "";
}
function convertToImmersion(id,qty=1){
  const h=HARDWARE.find(x=>x.id===id);if(!h)return;
  qty=Math.max(1,Math.floor(Number(qty)||1));
  const owned=state.hardware[id]||0,converted=immersionCount(id);
  qty=Math.min(qty,Math.max(0,owned-converted),Math.max(0,immersionFree()));
  if(qty<1)return showToast("Nothing to convert",immersionBlockReason(h,1)||"No air-cooled units of this type remain.");
  const reason=immersionBlockReason(h,qty);
  if(reason)return showToast("Conversion not possible",reason);
  const kits=immersionKitsFor(qty),labour=immersionConversionLabour(h,qty);
  state.maintenance.inventory.immersionKit-=kits;
  state.cash-=labour;
  state.immersion[id]=converted+qty;
  awardXp(8+4*Math.log2(1+qty),"immersion");
  log(`${h.name} converted to immersion`,`${qty} unit${qty===1?"":"s"} submerged · ${kits} kit${kits===1?"":"s"} · ${fmtUsd(labour)} · ${immersionTotal()} of ${immersionCapacity()} tank slots used`,"fleet");
  showToast("Miners submerged",`${qty} × ${h.name} moved into the tank: fans removed, clocks raised. Expect about ${Math.round((IMMERSION_HASH_GAIN-1)*100)}% more hash for about ${Math.round((IMMERSION_POWER_GAIN-1)*100)}% more power, and their heat now leaves through the tank loop instead of the room.`,"good","mine");
  save();renderMineContent();
}

/* Reversible, but not free: the kit is destroyed coming out, the fans have to go back on,
   and the machine loses the clock headroom it was bought for. */
function revertFromImmersion(id,qty=1){
  const h=HARDWARE.find(x=>x.id===id);if(!h)return;
  qty=Math.max(1,Math.min(Math.floor(Number(qty)||1),immersionCount(id)));
  if(qty<1)return showToast("Nothing to drain",`No ${h.name} units are currently submerged.`);
  const labour=immersionConversionLabour(h,qty);
  if(state.cash<labour)return showToast("Not enough cash",`Draining and refitting ${qty} unit${qty===1?"":"s"} costs ${fmtUsd(labour)}.`);
  state.cash-=labour;
  state.immersion[id]=Math.max(0,immersionCount(id)-qty);
  log(`${h.name} returned to air`,`${qty} unit${qty===1?"":"s"} drained and refitted with fans · ${fmtUsd(labour)} · conversion kit${qty===1?"":"s"} scrapped`,"fleet");
  showToast("Drained and refitted",`${qty} × ${h.name} is back on air cooling at stock clocks. The conversion kit${qty===1?" was":"s were"} not recoverable.`,"info","mine");
  save();renderMineContent();
}
