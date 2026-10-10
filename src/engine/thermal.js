"use strict";

/* THERMAL LAYER - installed cooling, active heat load and room response. */
function hardwarePoweredDownCount(h,s=state){return Math.max(0,Math.min(s.hardware?.[h.id]||0,Math.floor(Number(s.poweredDownHardware?.[h.id])||0)))}
function ambientTemperatureC(t=state.time,s=state){const r=REGIONS.find(x=>x.id===s.region)||REGIONS[0],date=new Date(t),start=Date.UTC(date.getUTCFullYear(),0,0),day=(t-start)/DAY,season=Math.sin((day-111)/365*Math.PI*2);return (r.ambientC??18)+(r.seasonalC??8)*season}
function coolingInstallDays(item){const covid=state.time>=at("2020-03-12")&&state.time<at("2021-07-01");return Math.max(1,Math.round((item.install||14)*(covid?1.6:1)))}
function pendingCoolingOrders(id=null){return (state.thermal?.orders||[]).filter(o=>!id||o.id===id)}
function pendingCoolingCount(id){return pendingCoolingOrders(id).reduce((sum,o)=>sum+Number(o.qty||1),0)}
function coolingCapacityKw(s=state){const f=FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0],equipment=COOLING_EQUIPMENT.reduce((sum,item)=>sum+(s.thermal?.equipment?.[item.id]||0)*item.coolingKw,0);return Math.max(.1,(f.passiveCoolingKw||f.kw*.3)+equipment)*(s.skills?.includes("heat")?1.15:1)}
/* One walk of the fleet, two answers. Total draw is what the meter reads and what the plant
   has to be sized against; room heat is only the part that reaches the air. They stopped
   being the same number when miners could be submerged: a converted machine draws MORE and
   warms the room LESS, because its heat goes into the fluid and out through the tank loop. */
function minerWattsSplit(s=state){
  let total=0,room=0;
  HARDWARE.forEach(h=>{
    const n=s.hardware?.[h.id]||0;if(!n||hardwareOfflineReason(h,s))return;
    const repairing=Math.min(n,Math.max(activeServiceJob(h.id,s)?.count||0,hardwareFaultCount(h,s))),paused=Math.min(n-repairing,hardwarePoweredDownCount(h,s));
    const active=Math.max(0,n-repairing-paused);if(!active)return;
    const imm=immersionActive(h,active,s),air=active-imm,submerged=h.w*imm*IMMERSION_POWER_GAIN;
    total+=h.w*air+submerged;
    room+=h.w*air+submerged*IMMERSION_ROOM_HEAT_SHARE;
  });
  const scale=(s.skills?.includes("undervolt")?.95:1)*(s.overdrive?1.25:1),contract=typeof energyContractFor==="function"?energyContractFor(s):null,loadFactor=typeof contractLoadFactorAt==="function"&&contract?contractLoadFactorAt(s.time,contract):1;
  return{total:total*scale*loadFactor,room:room*scale*loadFactor};
}
function activeMinerWatts(s=state){return minerWattsSplit(s).total}
function roomHeatWatts(s=state){return minerWattsSplit(s).room}
function coolingPeakWatts(s=state){return COOLING_EQUIPMENT.reduce((sum,item)=>sum+(s.thermal?.equipment?.[item.id]||0)*item.watts,0)}
function coolingPowerWatts(s=state,minerWatts=activeMinerWatts(s)){if(minerWatts<=0)return 0;const capacity=Math.max(.1,coolingCapacityKw(s)),demand=Math.max(.12,Math.min(1,minerWatts/1000/capacity));return coolingPeakWatts(s)*demand}
function thermalPowerAvailable(s=state){return !!s.power&&!gridCutOff(s)&&!s.policyLock&&s.time>=(s.ops?.powerOutageUntil||0)&&!pendingAt(s.relocationJob,s.time)&&!pendingAt(s.facilityUpgradeJob,s.time)}
/* Cooling ratings are quoted as what the site can reject at a ten-degree room-to-outside
   difference, so a rating divided by ten is the kilowatts it sheds per degree. */
const THERMAL_REFERENCE_DELTA=10;
function thermalLossKwPerC(s=state){return Math.max(.005,coolingCapacityKw(s)/THERMAL_REFERENCE_DELTA)}
/* An enclosed site has a floor: a spare room is inside a heated house, an industrial
   unit holds some background warmth. A container yard has none and tracks the weather. */
function siteBaselineC(s=state){const f=FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0];return Math.max(ambientTemperatureC(s.time,s),f.indoorBaseC??-Infinity)}
function thermalTargetC(s=state){
  const baseline=siteBaselineC(s);
  if(!thermalPowerAvailable(s))return baseline;
  const heatKw=roomHeatWatts(s)/1000;
  if(heatKw<=0)return baseline;
  return Math.min(95,Math.max(baseline,ambientTemperatureC(s.time,s)+heatKw/thermalLossKwPerC(s)));
}
function roomTemperatureC(s=state){const value=Number(s.thermal?.temperature);return Number.isFinite(value)?value:ambientTemperatureC(s.time,s)+2}
function temperatureWearMultiplier(s=state){return 1+Math.max(0,roomTemperatureC(s)-28)*.04}
function temperatureFailureMultiplier(s=state){return 1+Math.max(0,roomTemperatureC(s)-30)*.12}
function advanceThermals(){const target=thermalTargetC(),current=roomTemperatureC(),rate=roomHeatWatts()>0&&thermalPowerAvailable()?0.72:0.8;state.thermal.temperature=Math.max(-10,Math.min(90,current+(target-current)*rate))}

/* THE COOLING PLANT'S WHOLE LIFE, in the file that models what it does.

   Ordering lived in actions.js beside miner purchases and the install tick lived there too,
   which is how the other half of a plant's life came to be missing entirely: you could buy
   cooling and you could never get rid of it. An operator who over-ordered, who moved a fleet
   to immersion, who sold half a farm after a halving, or who simply guessed wrong, was left
   paying for the electricity a machine drew and could not sell.

   A plant has three transitions, not one. It is ordered and installed; an order that has not
   been installed yet can be cancelled; and an installed unit can be sold on. */
function advanceCoolingInstalls(){
  state.thermal.orders=(state.thermal.orders||[]).filter(o=>{
    if(pendingAt(o,state.time))return true;
    const item=COOLING_EQUIPMENT.find(x=>x.id===o.id);if(!item)return false;
    const qty=Math.max(1,Number(o.qty||1));
    state.thermal.equipment[o.id]=(state.thermal.equipment[o.id]||0)+qty;
    /* The tick's ordinary repaint patches text and never rebuilds a tab. A unit landing changes
       the installed count, the order list and the heat-rejection figures, none of which are
       text patches - so without this the Cooling section shows the plant it had yesterday. */
    renderFullQueued=true;
    log(`Cooling commissioned: ${item.name}`,`+${fmtNum(item.coolingKw*qty)} kW heat rejection`,"operations");
    showToast("Cooling commissioned",`${item.name} is installed and thermostatically controlled. The room will move toward its new target temperature over the next few simulated days.`,"success","mine");
    return false;
  });
}
function buyCooling(id){
  const item=COOLING_EQUIPMENT.find(x=>x.id===id),tier=facilityTier();if(!item||state.time<at(item.date)||tier<item.minTier||tier>item.maxTier)return showToast("Cooling unavailable","This equipment does not fit the current facility tier or date.");
  if(state.cash<item.cost)return showToast("Not enough cash",`${item.name} costs ${fmtUsd(item.cost)}.`);
  const trial=JSON.parse(JSON.stringify(state));(trial.thermal.orders||[]).forEach(o=>{trial.thermal.equipment[o.id]=(trial.thermal.equipment[o.id]||0)+Number(o.qty||1)});trial.thermal.equipment[id]=(trial.thermal.equipment[id]||0)+1;const projected=fleet(trial);if(projected.potentialKw>projected.cap)return showToast("Electrical headroom required",`${item.name} adds ${item.watts.toLocaleString("en-US")} W of peak cooling demand. With your fleet and any cooling already on order, the site would need ${fmtNum(projected.potentialKw)} kW against its ${fmtNum(projected.cap)} kW supply. Pause miners or move to a larger facility first.`);
  const days=coolingInstallDays(item);state.cash-=item.cost;state.thermal.orders.push({id,qty:1,due:state.time+days*DAY,cost:item.cost});log(`Ordered cooling: ${item.name}`,`-${fmtUsd(item.cost)} · ${days}-day install`,"operations");showToast("Cooling ordered",`${item.name} is paid for and booked in. The installers need ${days} simulated days, and it rejects no heat until the job is finished on ${dateFmt(state.time+days*DAY)}.`,"info","mine");save();renderMineContent();
}

/* WHAT COMES BACK.

   Two different prices, because they are two different situations. An order not yet installed
   is a cancellation: the money is still with the supplier, and what it costs is the supplier's
   restocking fee. An installed unit is a second-hand sale of working industrial plant that
   you have chosen the moment to sell - better than the quarter of cost a downsize gets for
   plant sold with a building under time pressure, because there the buyer knows you have to
   leave, and worse than new because it is not. */
const COOLING_RESALE=.45,COOLING_RESTOCK=.15;
function coolingResaleValue(item,qty=1){return Math.round(item.cost*COOLING_RESALE*Math.max(1,qty))}
function coolingInstalledCount(id,s=state){return Math.max(0,Math.floor(Number(s.thermal?.equipment?.[id])||0))}
function pendingCoolingOrdersFor(id,s=state){return (s.thermal?.orders||[]).filter(o=>o.id===id)}

/* One function behind the button's disabled state and the refusal, so a card can never offer
   a sale the action then declines. */
function coolingSellBlockReason(id,s=state){
  const item=COOLING_EQUIPMENT.find(x=>x.id===id);
  if(!item)return "That equipment does not exist.";
  if(!coolingInstalledCount(id,s))return `No ${item.name} is installed.`;
  return "";
}
function sellCooling(id){
  const item=COOLING_EQUIPMENT.find(x=>x.id===id);if(!item)return;
  const reason=coolingSellBlockReason(id);
  if(reason)return showToast("Nothing to sell",reason,"bad","mine");
  const value=coolingResaleValue(item);
  const held=coolingInstalledCount(id);
  if(held-1>0)state.thermal.equipment[id]=held-1;else delete state.thermal.equipment[id];
  state.cash+=value;
  const left=coolingCapacityKw();
  log(`Sold cooling: ${item.name}`,`+${fmtUsd(value)} · -${fmtNum(item.coolingKw)} kW heat rejection`,"operations");
  /* The consequence is stated rather than prevented. Selling the plant a running fleet needs
     is a decision the game allows and the room answers: heat rejection falls immediately, and
     the temperature that drives wear and failure starts climbing the same day. */
  showToast("Cooling sold",`${item.name} was removed and sold for ${fmtUsd(value)}. Heat rejection is now ${fmtNum(left)} kW against ${fmtNum(activeMinerWatts()/1000)} kW of miner heat - the room starts moving toward its new equilibrium today.`,
    left*1000<activeMinerWatts()?"bad":"info","mine");
  save();renderMineContent();
}
/* Paid for, not yet delivered, and no longer wanted. The newest order is cancelled first:
   it is the one least likely to be already on a lorry. */
function cancelCoolingOrder(id){
  const item=COOLING_EQUIPMENT.find(x=>x.id===id);if(!item)return;
  const orders=state.thermal.orders||[];
  let index=-1;
  for(let i=0;i<orders.length;i++)if(orders[i].id===id&&(index<0||orders[i].due>orders[index].due))index=i;
  if(index<0)return showToast("Nothing to cancel",`No ${item.name} is on order.`,"bad","mine");
  const order=orders[index],paid=Number(order.cost)||item.cost;
  const fee=Math.round(paid*COOLING_RESTOCK),refund=Math.max(0,paid-fee);
  orders.splice(index,1);
  state.cash+=refund;
  log(`Cancelled cooling order: ${item.name}`,`+${fmtUsd(refund)} refunded · -${fmtUsd(fee)} restocking`,"operations");
  showToast("Order cancelled",`${item.name} will not be delivered. ${fmtUsd(refund)} came back; the supplier kept ${fmtUsd(fee)} as a restocking fee.`,"info","mine");
  save();renderMineContent();
}
