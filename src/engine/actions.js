"use strict";

/* ACTION LAYER - all player mutations pass through here. */
/* A second-hand machine does not come from the factory that stopped building it. Brokers and
   hosting liquidations ship from a warehouse in days rather than weeks, they are not subject
   to an allocation queue, and the counterparty is materially worse: the seller has what they
   have, so a partial fill is the normal outcome rather than the exception. */
function secondaryProcurementTerms(h){
  const covid=state.time>=at("2020-03-12")&&state.time<at("2021-07-01");
  const glutOn=state.hardwareGlut&&state.time<state.hardwareGlut.until;
  const days=(h.era==="HYDRO ASIC"?16:10)+(covid?12:0);
  return{days,
    risk:Math.min(.5,.1+(covid?.1:0)+(glutOn?.06:0)),
    partialRisk:Math.min(.55,.22+(glutOn?.14:0)+(covid?.08:0)),
    label:glutOn?"Liquidation auction":"Second-hand broker",
    vendor:glutOn?"Liquidation auction":"Reseller",
    channel:"secondary"};
}
function procurementTerms(h){
  if(hardwareChannel(h)==="secondary")return secondaryProcurementTerms(h);
  return factoryProcurementTerms(h);
}
function factoryProcurementTerms(h){const covid=state.time>=at("2020-03-12")&&state.time<at("2021-07-01"),early=h.era==="ASIC"&&state.time<at("2016-01-01"),hydro=h.era==="HYDRO ASIC",bitmain=/Bitmain/.test(h.maker),canaan=/Canaan/.test(h.maker),allocation=bitmain&&((state.time>=at("2017-01-01")&&state.time<at("2018-06-01"))||(state.time>=at("2020-09-01")&&state.time<at("2022-01-01"))),frontier=canaan&&early;const days=(early?55:hydro?50:h.era==="ASIC"?28:h.era==="FPGA"?21:10)+(covid?42:0)+(allocation?21:0);const risk=Math.min(.62,(early?.18:0)+(hydro?.12:0)+(covid?.24:0)+(allocation?.17:0)+(frontier?.12:0));const partialRisk=Math.min(.42,(hydro?.16:0)+(covid?.18:0)+(allocation?.12:0)+(frontier?.1:0));const label=covid?"COVID freight market":allocation?"Bitmain allocation market":frontier?"Canaan frontier batch":hydro?"Specialist hydro freight":early?"Early ASIC batch":"Established-channel delivery";return{days,risk,partialRisk,label,vendor:bitmain?"Bitmain":canaan?"Canaan":h.maker,channel:"factory"}}
function plannedFleetProjection(id=null,qty=0){const trial=JSON.parse(JSON.stringify(state));state.procurementOrders.forEach(o=>trial.hardware[o.id]=(trial.hardware[o.id]||0)+Number(o.qty));HARDWARE.forEach(h=>trial.hardware[h.id]=(trial.hardware[h.id]||0)+Number(state.inactiveHardware?.[h.id]||0));if(id)trial.hardware[id]=(trial.hardware[id]||0)+Number(qty||0);return fleet(trial)}
/* What ONE more of this machine adds to the site's peak draw. Not its nameplate wattage:
   the fleet projection applies undervolting and overdrive to the whole fleet, so a machine
   bought with overdrive engaged costs a quarter more headroom than the catalogue says. The
   purchase limit divided free watts by the raw figure and therefore offered a quarter too
   many - 21 where the game allowed 17. Cooling plant draw does not scale with miner count,
   so this stays linear and the limit can be computed rather than searched for. */
function hardwarePeakWatts(h,s=state){
  return Math.max(1,h.w)*(s.skills?.includes("undervolt")?.95:1)*(s.overdrive?1.25:1);
}
function hardwarePurchaseLimits(h){
/* Free capacity is measured against the INSTALLED fleet. It used to be measured against a
     projection that counted every outstanding order and every staged crate as already racked,
     which made sense while ordering was capacity-gated and is exactly wrong now: an order in
     transit that holds capacity hostage is what would stop crates already in the warehouse
     from ever going in. The projection is still the right thing for the pipeline card, which
     is about what is coming; it is the wrong thing for what the room can take today. */
  const reserved=fleet(),cost=Math.max(.000001,hardwareUnitCost(h)),freeWatts=Math.max(0,(reserved.cap-reserved.potentialKw)*1000),freeSpace=Math.max(0,facility().space-reserved.space),cashMax=Math.max(0,Math.floor(state.cash/cost)),powerMax=Math.max(0,Math.floor(freeWatts/Math.max(1,hardwarePeakWatts(h)))),spaceMax=Math.max(0,Math.floor(freeSpace/Math.max(1,h.space))),supplyMax=hardwareSupplyLimit(h),siteMax=Math.min(powerMax,spaceMax,supplyMax),fiatMax=Math.min(cashMax,supplyMax),marketOpen=state.time>=MARKET,hotBtcMax=marketOpen?Math.max(0,Math.floor(state.wallets.hot/(cost/priceAt(state.time)))):0;
  return{reserved,cost,freeWatts,freeSpace,cashMax,powerMax,spaceMax,supplyMax,siteMax,fiatMax,hotBtcMax,marketOpen,
    channel:hardwareChannel(h),listed:hardwareSupplyLimit(h)};
}
/* WHAT THE CARD HAS TO SAY NOW.

   Capacity used to block the order, so this card was written as a refusal: "Facility capacity
   blocks this order", with power and floor space listed as reasons you could not buy. Capacity
   no longer blocks anything - it decides how much of a delivery the site accepts on the day it
   lands. So the same two numbers are still here and they still matter, but as a forecast of
   what will be racked rather than a wall in front of the till. What can still stop a purchase
   is money, and what somebody is actually selling. */
function hardwarePurchaseStatusHtml(h){
  if(h.permanent)return"";
  const limits=hardwarePurchaseLimits(h),available=state.time>=at(h.date);
  const supplyBinding=limits.supplyMax<=limits.cashMax,cashBinding=limits.cashMax<limits.supplyMax;
  const ordered=state.procurementOrders.filter(o=>o.id===h.id).reduce((sum,o)=>sum+Number(o.qty||0),0);
  const staged=Math.max(0,Math.floor(Number(state.inactiveHardware?.[h.id])||0));
  let tone="",headline="",explanation="";
  if(!available){tone="blocked";headline=`Not purchasable until ${dateFmt(at(h.date))}`;explanation="This generation has been announced but has not reached its release date."}
  else if(limits.fiatMax<1){tone="blocked";
    if(supplyBinding&&limits.supplyMax<1){headline=limits.listed===0?"Nothing listed on the second-hand market":"Sold out for now";
      explanation="This generation is no longer sold new. Second-hand supply is whatever other operators are retiring, and there is none listed this month. Listings refresh as machines come off other sites."}
    else{headline="Not enough cash for one miner";explanation=`One miner costs ${fmtUsd(limits.cost)}; available cash is ${fmtUsd(state.cash)}.`}}
  else{
    const labels=[];if(cashBinding)labels.push("cash");if(supplyBinding)labels.push("what is listed second-hand");
    tone=limits.siteMax<limits.fiatMax?"limited":"";
    headline=`Maximum fiat order: ${fmtCompactNumber(limits.fiatMax)} miner${limits.fiatMax===1?"":"s"}`;
    explanation=`${labels.map(x=>x[0].toUpperCase()+x.slice(1)).join(" and ")||"Available cash"} ${labels.length===1?"is":"are"} limiting this order.`;
  }
  const deployment=[];if(h.requires&&!state.skills.includes(h.requires))deployment.push(`needs ${SKILLS.find(x=>x.id===h.requires)?.name||h.requires}`);if(h.minFacility&&facilityTier()<facilityTier({...state,facility:h.minFacility}))deployment.push(`needs ${FACILITIES.find(f=>f.id===h.minFacility)?.name||h.minFacility}`);
  /* The forecast, in the card's own words. This is the sentence that replaces the refusal:
     buying more than the room holds is allowed, and this says exactly what happens to the
     remainder rather than leaving the player to find out at the loading bay. */
  const rackable=Math.max(0,Math.min(limits.powerMax,limits.spaceMax));
  const intake=available?`<div class="purchase-intake"><b>The site can rack ${fmtCompactNumber(rackable)} more of these today</b><small>${(limits.freeWatts/1000).toFixed(2)} kW and ${fmtNum(limits.freeSpace)} floor units are free. Order as many as you like - whatever fits is racked automatically as it arrives, and the rest waits in storage at no cost until capacity frees up.</small></div>`:"";
  const pipeline=ordered||staged?`<span class="purchase-pipeline">${ordered?`${fmtCompactNumber(ordered)} on order`:""}${ordered&&staged?" · ":""}${staged?`${fmtCompactNumber(staged)} in storage awaiting room`:""}. Neither reserves capacity: the site accepts what fits on the day it is offered.</span>`:"";
  const terms=procurementTerms(h);
  const band=secondaryConditionRange(h);
  const channelRow=limits.channel==="secondary"
    ? `<div class="purchase-channel secondary"><b>${terms.label}</b><span>${fmtCompactNumber(limits.listed)} listed · arrives in about ${terms.days} days · condition ${band.low}–${band.high}% on arrival${state.hardwareGlut&&state.time<state.hardwareGlut.until?" · a liquidation is clearing stock cheaply":""}</span></div>`
    : `<div class="purchase-channel factory"><b>${terms.label}</b><span>New from ${terms.vendor} · arrives in about ${terms.days} days · condition 100% on arrival</span></div>`;
  return `<div class="purchase-capacity ${tone}" data-purchase-capacity>${channelRow}<div class="purchase-capacity-head"><b>${headline}</b><small>${explanation}</small></div>${intake}<div class="purchase-limits"><span>Cash allows<strong>${fmtCompactNumber(limits.cashMax)} units</strong></span><span>Power racks<strong>${fmtCompactNumber(limits.powerMax)} · ${(limits.freeWatts/1000).toFixed(2)} kW free</strong></span><span>Space racks<strong>${fmtCompactNumber(limits.spaceMax)} · ${fmtNum(limits.freeSpace)} free</strong></span>${limits.channel==="secondary"?`<span>Listed allows<strong>${fmtCompactNumber(limits.supplyMax)} · second-hand only</strong></span>`:""}</div><span class="purchase-capacity-note">Each miner uses ${(h.w/1000).toFixed(2)} kW and ${h.space} floor units.${limits.marketOpen?` Hot-wallet BTC funds up to ${fmtCompactNumber(limits.hotBtcMax)}.`:""} ${pipeline}${deployment.length?` <strong style="color:var(--red)">It can be ordered, but will remain offline: ${deployment.join(" and ")}.</strong>`:""}${available&&rackable<1?`<br><button class="action small" data-action="tab" data-value="facilities">Open Facilities to add capacity</button>`:""}</span></div>`;
}
function placeHardwareOrder(id,qty,btcCost=0){const h=HARDWARE.find(x=>x.id===id),terms=procurementTerms(h);
  /* Buying a listing removes it. Without this the market is a shop window with an infinite
     stockroom behind it, which is what it used to be. */
  if(terms.channel==="secondary"){
    const took=consumeSecondaryStock(id,qty);
    if(took<qty){
      // Put back what was taken from the listing, so a refused order changes nothing at all.
      if(took>0)state.secondary.stock[id]=(state.secondary.stock[id]||0)+took;
      showToast("Not enough listed",`Only ${fmtCompactNumber(secondaryStock(id))} ${h?.name||"units"} are listed on the second-hand market right now.`);
      return false;
    }
  }state.procurementOrders.push({id,qty,due:state.time+terms.days*DAY,risk:terms.risk,partialRisk:terms.partialRisk,vendor:terms.vendor,slips:0,label:terms.label,channel:terms.channel,
    // Drawn once for the batch: these came off one site with one maintenance history.
    condition:terms.channel==="secondary"?rollSecondaryCondition(h):100});const paid=btcCost>0?fmtBtc(btcCost):fmtUsd(hardwareUnitCost(h)*qty);log(`Ordered ${qty} × ${h.name}`,`-${paid} · ${terms.vendor} · ${terms.days}-day lead time`,"fleet");showToast("Miner order placed",`${qty} × ${h.name} via ${terms.vendor}: ETA ${dateFmt(state.time+terms.days*DAY)} · ${Math.round(terms.risk*100)}% delay risk.${hardwarePurchaseLimits(h).siteMax<qty?" The site will rack what it has room for and hold the rest in storage.":""}`,"info","mine");save();renderMineContent();return true}
function buyHardware(id,requested=1){
  const h=HARDWARE.find(x=>x.id===id);if(!h||h.permanent||state.time<at(h.date))return;
  const unitCost=hardwareUnitCost(h);
  let qty=Math.max(1,Math.floor(Number(requested)||1));qty=Math.min(qty,Math.floor(state.cash/unitCost));
  if(qty<1)return showToast("Not enough cash",`You need ${fmtUsd(unitCost)} for one ${h.name}.`);
  qty=Math.min(qty,hardwareSupplyLimit(h));
  if(qty<1)return showToast("None available",`There are no ${h.name} units to buy right now.`);
  const cost=unitCost*qty;state.cash-=cost;if(!placeHardwareOrder(id,qty))state.cash+=cost;
}
function buyHardwareBtc(id,requested=1){
  const h=HARDWARE.find(x=>x.id===id);if(!h||h.permanent||state.time<at(h.date))return;
  if(state.time<MARKET)return showToast("BTC checkout unavailable","A quoted BTC/USD market is required to price hardware in bitcoin.");
  const unitUsd=hardwareUnitCost(h),unitBtc=unitUsd/priceAt(state.time);
  let qty=Math.max(1,Math.floor(Number(requested)||1));qty=Math.min(qty,Math.floor(state.wallets.hot/unitBtc));
  if(qty<1)return showToast("Not enough hot BTC",`One ${h.name} costs ${fmtBtc(unitBtc)} at today's quoted rate.`);
  qty=Math.min(qty,hardwareSupplyLimit(h));
  if(qty<1)return showToast("None available",`There are no ${h.name} units to buy right now.`);
  const cost=unitBtc*qty;state.wallets.hot-=cost;if(!placeHardwareOrder(id,qty,cost))state.wallets.hot+=cost;
}
function sellHardware(id,requested=1){
  const h=HARDWARE.find(x=>x.id===id),owned=state.decommissionedHardware?.[id]||0;if(!h||owned<1||h.permanent)return showToast("Power down required",`Power down ${h?.name||"this hardware"} before selling it.`);
  let qty=Math.max(1,Math.floor(Number(requested)||1));qty=Math.min(qty,owned);
  const value=resaleHardwareValue(h)*qty;state.decommissionedHardware[id]-=qty;state.cash+=value;
  log(`Sold ${qty} × ${h.name}`,`+${fmtUsd(value)}`,"fleet");showToast("Miner sale complete",`${qty} × ${h.name} left the operation and ${fmtUsd(value)} is now spendable cash.`,"info","mine");save();renderMineContent();
}
function sellHardwareBtc(id,requested=1){
  const h=HARDWARE.find(x=>x.id===id),owned=state.decommissionedHardware?.[id]||0;if(!h||owned<1||h.permanent)return showToast("Power down required",`Power down ${h?.name||"this hardware"} before selling it.`);
  if(state.time<MARKET)return showToast("BTC resale unavailable","A quoted BTC/USD market is required to settle hardware resale in bitcoin.");
  const qty=Math.min(Math.max(1,Math.floor(Number(requested)||1)),owned),value=resaleHardwareValue(h)*qty,btc=value/priceAt(state.time);
  state.decommissionedHardware[id]-=qty;state.wallets.hot+=btc;log(`Sold ${qty} × ${h.name}`,`+${fmtBtc(btc)} · ${fmtUsd(value)} resale value`,"fleet");showToast("Miner sale complete",`${qty} × ${h.name} left the operation and ${fmtBtc(btc)} is now in the hot wallet.`,"info","mine");save();renderMineContent();
}
/* What a machine fetches is what it is worth on the market, less the spread you give up
   selling it. It used to depreciate on its own curve, independent of the purchase price;
   once purchase prices started depreciating too, the two curves crossed at about three and a
   half years and a decade-old machine could be bought and instantly resold for 2.4x what it
   cost. Pricing the sale off the same market factor makes that impossible by construction. */
const RESALE_HAIRCUT=.65;
function resaleHardwareValue(h){return h.cost*hardwareMarketFactor(h)*RESALE_HAIRCUT}
function facilityReserve(f){
  const r=region(),fs=fleet(),nodeW=nodePowerWatts();
  const rate=powerRate(r,state.time);
  let energy=(fs.w+nodeW)/1000*24*30.4375*rate;if(hasSkill("heat"))energy*=.96;
  const targetTier=Math.max(1,FACILITIES.findIndex(x=>x.id===f.id)+1),scale=[1,1.5,4,15,55,150,300,600][targetTier-1]||1,internet=(r.internet||75)*connectivityPlan().mult*scale;
  return (energy+f.rent+internet+staffMonthlyCost()+insuranceMonthlyCost()+totalNodeMonthlyOverhead())*2;
}
/* MOVING DOWN THE LADDER.

   The facility ladder used to be one-way: having taken a warehouse you kept it, whatever
   happened next. That is not how mining works. Operators shrink - after a halving, after a
   price collapse, after selling half a fleet to meet a bill - and a site sized for the fleet
   you used to have is a rent bill that does not shrink with you. Being unable to leave it was
   the single most expensive thing the game would not let a player do.

   The condition is physical, not financial: the fleet has to fit. Both ways - floor space AND
   electrical capacity at peak draw, because a machine that fits on the floor and trips the
   panel is not installed, it is stored. Peak is the right measure rather than today's draw:
   overdrive and a repaired fleet coming back online both push the number up, and discovering
   the new site cannot hold your own machines at full tilt is not a lesson worth teaching by
   surprise. Sell or decommission first, then move.

   What it costs is the lease you are walking away from - two months' rent on the site you
   leave, which is what a break clause is - plus re-racking the fleet somewhere smaller. It
   does NOT cost the smaller site's fit-out capital: that site already exists, which is the
   entire reason for moving into it. And none of the original fit-out comes back, because it
   never does.

   It is still a physical move, so it still carries risk and still stops mining while the fleet
   is powered down and transported. Less risk than an expansion - fewer machines, a simpler
   destination, no new contract to negotiate - but not none. */
const FACILITY_BREAK_MONTHS=2;
function facilityDownsizeCost(target,s=state){
  const leaving=FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0];
  return Math.round(leaving.rent*FACILITY_BREAK_MONTHS+target.cost*.12);
}
/* One function behind both the disabled button and the refusal, so the card can never offer a
   move the action then declines. */
/* THE PLANT DOES NOT COME WITH YOU.

   Cooling equipment is tiered: a dry cooler bank is not something a light industrial unit can
   host, and the catalogue already refuses to sell one at that tier. So a warehouse-sized plant
   made downsizing arithmetically impossible - its peak draw alone exceeded the smaller site's
   whole supply, and nothing in the game could remove it. The player was told to sell miners
   they had already sold.

   What actually happens is that the plant is sold with the site. It is bolted to a building
   the operator is leaving, it is worth something to whoever takes that building on, and it is
   worth nothing in a unit that cannot host it. So the move sheds every unit the target tier
   cannot hold and credits salvage for it - disclosed on the card before the move is dispatched,
   because it is a large number and it is not reversible. */
/* A distressed price, because that is the position. The plant is bolted into a building the
   operator has already decided to leave, the buyer knows it, and moving it is not an option -
   the destination is not rated to host it. A quarter of cost is what that fetches. It still
   comes back as real money, which is the point: shrinking should be a relief, not a windfall. */
const COOLING_SALVAGE=.25;
function facilityCoolingShed(targetId,s=state){
  const target=FACILITIES.find(x=>x.id===targetId);
  const tier=target?FACILITIES.findIndex(x=>x.id===targetId)+1:0;
  const items=[];let credit=0,watts=0;
  for(const item of COOLING_EQUIPMENT){
    const owned=Math.max(0,Math.floor(Number(s.thermal?.equipment?.[item.id])||0));
    if(!owned||tier>=item.minTier&&tier<=item.maxTier)continue;
    const value=Math.round(item.cost*COOLING_SALVAGE*owned);
    items.push({id:item.id,name:item.name,qty:owned,credit:value});
    credit+=value;watts+=item.watts*owned;
  }
  return{items,credit,watts};
}
/* The state the operator would actually arrive in: the smaller site, without the plant that
   cannot go there. Fit is judged against that, not against a fleet carrying equipment the
   destination is not allowed to have. */
function facilityArrivalProbe(id,s=state){
  const shed=facilityCoolingShed(id,s),equipment={...(s.thermal?.equipment||{})};
  /* Plant on order is plant that will be running here. A cooling order placed in a site with
     room to spare installs into whichever site the operator is standing in when the fitters
     finish, and the gate measured installed equipment only - so tens of kW of inbound plant
     were invisible to the very check that exists to ask whether it fits. pendingCoolingOrdersFor
     was written to answer this and was never called by anything. */
  for(const item of COOLING_EQUIPMENT){
    for(const order of pendingCoolingOrdersFor(item.id,s))
      equipment[item.id]=(equipment[item.id]||0)+Math.max(1,Number(order.qty)||1);
  }
  shed.items.forEach(item=>{delete equipment[item.id]});
  return{...s,facility:id,thermal:{...(s.thermal||{}),equipment}};
}
function facilityDownsizeBlockReason(id,s=state){
  const target=FACILITIES.find(x=>x.id===id);
  if(!target)return "That site does not exist.";
  if(target.id===s.facility)return "You are already operating here.";
  if(s.time<at(target.date))return `${target.name} is not available until ${dateFmt(at(target.date),true)}.`;
  if(s.facilityUpgradeJob)return "A facility move is already underway; it must finish first.";
  if(s.relocationJob)return "The fleet is in transit between regions and cannot also change site.";
  const fs=fleet(facilityArrivalProbe(id,s)),inbound=committedLoad(s);
  /* Machines already paid for and part-way through commissioning arrive whether or not the
     site shrank under them. Judging fit on the installed fleet alone lets an operator move
     into a site the inbound crates then overflow, and the whole floor drops offline. */
  const space=fs.space+inbound.space,kw=fs.potentialKw+inbound.watts/1000;
  const alsoInbound=inbound.space>0||inbound.watts>0?` - ${fmtNum(inbound.space)} floor units and ${(inbound.watts/1000).toFixed(1)} kW of that is hardware still being commissioned, which arrives regardless`:"";
  if(space>target.space)return `The fleet needs ${fmtNum(space)} floor units and ${target.name} has ${fmtNum(target.space)}${alsoInbound}. Sell or decommission machines until the fleet fits.`;
  if(kw>fs.cap)return `At full draw the fleet would need ${kw.toFixed(1)} kW at ${target.name}, which supplies ${fs.cap.toFixed(1)} kW${fs.coolingW>0?` - ${(fs.coolingW/1000).toFixed(1)} kW of that is cooling plant the smaller site can still host`:""}${alsoInbound}. Sell, decommission or turn down overdrive until the fleet fits.`;
  const cost=Math.max(0,facilityDownsizeCost(target,s)-facilityCoolingShed(id,s).credit);
  if(s.cash<cost)return `Breaking the ${(FACILITIES.find(x=>x.id===s.facility)||FACILITIES[0]).name} lease and re-racking at ${target.name} costs ${fmtUsd(cost)}.`;
  return "";
}
function downsizeFacility(id){
  const f=FACILITIES.find(x=>x.id===id);if(!f)return;
  const reason=facilityDownsizeBlockReason(id);
  if(reason)return showToast("Cannot move to a smaller site",reason,"bad","facilities");
  const leaving=facility(),cost=facilityDownsizeCost(f),saving=Math.max(0,leaving.rent-f.rent);
  const shed=facilityCoolingShed(id);
  const risk=facilityMoveRisk(id)*(hasStaff("logistics")?.8:1);
  const days=Math.max(3,Math.ceil(3+fleet().count/90))*(hasStaff("logistics")?.8:1);
  state.cash-=cost-shed.credit;
  shed.items.forEach(item=>{delete state.thermal.equipment[item.id]});
  if(shed.items.length)log("Cooling plant sold with the site",`${shed.items.map(i=>`${i.qty} × ${i.name}`).join(" · ")} · +${fmtUsd(shed.credit)} salvage`,"operations");
  state.facilityUpgradeJob={id,due:state.time+Math.ceil(days)*DAY,cost,risk,down:true};
  state.power=false;
  log(`Downsizing to ${f.name}`,`${Math.ceil(days)} days · -${fmtUsd(cost)} · rent falls ${fmtUsd(saving)}/month`,"operations");
  showToast("Downsizing underway",`Mining is paused while the fleet is powered down, moved and re-racked at ${f.name}. Rent falls from ${fmtUsd(leaving.rent)} to ${fmtUsd(f.rent)} a month once commissioning finishes.${shed.items.length?` ${shed.items.reduce((n,i)=>n+i.qty,0)} unit${shed.items.reduce((n,i)=>n+i.qty,0)===1?"":"s"} of cooling plant were sold with the old site for ${fmtUsd(shed.credit)} - ${f.name} cannot host them.`:""} ETA ${dateFmt(state.facilityUpgradeJob.due)}.`,"info","facilities");
  save();render();
}
function upgradeFacility(id){
  const f=FACILITIES.find(x=>x.id===id);if(!f||f.id===state.facility)return;
  const current=FACILITIES.findIndex(x=>x.id===state.facility),target=FACILITIES.findIndex(x=>x.id===id);
  if(target<current)return downsizeFacility(id);
  if(state.time<at(f.date))return;
  if(state.facilityUpgradeJob)return showToast("Upgrade underway","The current facility upgrade must finish before another can begin.");
  if(state.relocationJob)return showToast("Relocation underway","The fleet must arrive before a facility upgrade can begin.");
  const reserve=facilityReserve(f),required=f.cost+reserve;
  if(state.cash<f.cost)return showToast("Capital required",`Fit-out costs ${fmtUsd(f.cost)}.`);
  if(state.cash<required)return showToast("Cash reserve required",`Keep ${fmtUsd(reserve)} in liquid cash for two months of expected power, rent, connectivity, staff and node costs after the move.`);
  const risk=facilityMoveRisk(id)*(hasStaff("logistics")?.8:1);
  const days=Math.max(3,Math.ceil(4+fleet().count/70+(target-current-1)*2))*(hasStaff("logistics")?.8:1);
  state.cash-=f.cost;state.facilityUpgradeJob={id,due:state.time+Math.ceil(days)*DAY,cost:f.cost,risk};state.power=false;
  log(`Facility upgrade dispatched to ${f.name}`,`${Math.ceil(days)} days · -${fmtUsd(f.cost)}`,"operations");
  showToast("Upgrade underway",`Mining is paused while the fleet is powered down, moved and re-commissioned at ${f.name}. ETA ${dateFmt(state.facilityUpgradeJob.due)}.`);
  save();render();
}
function takeSpeculation(id,fraction){
  const s=SPECULATIONS.find(x=>x.id===id);if(!s||state.speculations.includes(id))return;
  if(!offerOpen(s))return showToast("That window has closed",`${s.name} was a trade you could take between ${offerWindowLabel(s)}. Taking it now would be a different decision from the one described here.`,"blocked","market");
  const stake=state.wallets.hot*fraction;if(stake<=0)return showToast("No spendable BTC","Speculative launches can only use BTC in your hot wallet.");
  state.wallets.hot-=stake;state.speculations.push(id);
  if(nextRand()<s.chance){const returnBtc=stake*s.payout;state.wallets.hot+=returnBtc;log(`${s.name} paid off`,`+${fmtBtc(returnBtc-stake)}`);showToast("Speculation paid off",`${s.name} returned ${s.payout.toFixed(1)}× your BTC stake.`)}
  else{log(`${s.name} went to zero`,`-${fmtBtc(stake)}`);showToast("Speculation lost",`${s.name} wiped out the BTC you allocated. The stake cannot be recovered.`,"bad")}
  save();render();
}
/* A WINDOW THAT CLOSES.

   `announced()` answers "has this happened yet", which is the right question for hardware and
   facilities - a warehouse does not stop existing. It is the wrong question for a moment. One
   helper for both lists, so the card that offers a trade and the action that takes it can
   never disagree about whether the moment has passed. */
function offerOpen(item,t=state.time){
  if(!item)return false;
  if(t<at(item.date))return false;
  return !item.until||t<=at(item.until);
}
function offerWindowLabel(item){
  return item&&item.until?`${dateFmt(at(item.date),true)} – ${dateFmt(at(item.until),true)}`:"";
}
function offerDaysLeft(item,t=state.time){
  return item&&item.until?Math.max(0,Math.ceil((at(item.until)-t)/DAY)):Infinity;
}
function donateBtc(id,fraction){
  const campaign=DONATION_CAMPAIGNS.find(x=>x.id===id);if(!campaign||state.donations.some(x=>x.id===id))return;
  if(!offerOpen(campaign))return showToast("That moment has passed",`The ${campaign.name} ran from ${offerWindowLabel(campaign)}. A campaign is a response to something happening at the time; it is not a standing option.`,"blocked","custody");
  const btc=state.wallets.hot*fraction;if(btc<=0)return showToast("No spendable BTC","Donations use BTC from your hot wallet.");
  /* GIVING COINS AWAY IS THE MOST EXPENSIVE THING AN OPERATOR CAN DO, and the only one the
     score cannot repay: every other use of BTC in this game comes back as machines, capacity
     or cash. XP is what the game has to say "that mattered", so a donation pays a great deal
     of it - scaled by how much of the hot wallet was given rather than by the absolute amount,
     because a tenth of a small treasury is the same decision as a tenth of a large one, and
     because otherwise this is a mechanic that only rewards being late and rich. */
  const share=Math.max(0,Math.min(1,fraction));
  const xp=Math.round(420*share+180*Math.log2(1+share*8)+140);
  state.wallets.hot-=btc;state.donations.push({id,btc,time:state.time});
  awardXp(xp,"spend");
  log(`Donated: ${campaign.name}`,`-${fmtBtc(btc)} · +${fmtNum(xp)} XP`,"custody");
  showToast("BTC donated",`${fmtBtc(btc)} sent to ${campaign.name}, and ${fmtNum(xp)} operator XP for it. Nothing else in this game spends bitcoin without expecting it back.`,"milestone","custody");
  save();render();
}
function moveRegion(id){
  const r=REGIONS.find(x=>x.id===id);if(!r||state.time<at(r.date)||id===state.region)return;
  if(state.relocationJob)return showToast("Relocation underway","The fleet must arrive before another move can be scheduled.");if(state.facilityUpgradeJob)return showToast("Upgrade underway","The fleet must finish its facility upgrade before a region move can begin.");if(id==="sichuan"&&state.time>=at("2021-06-21"))return showToast("Region closed","Industrial Bitcoin mining is prohibited here after the 2021 crackdown.");
  let cost=(r.move+fleet().value*.05)*(hasSkill("relocation")?.8:1)*(hasStaff("logistics")?.8:1);
  if(state.cash<cost)return showToast("Relocation blocked",`Moving the fleet costs ${fmtUsd(cost)}.`);
  const days=Math.max(7,Math.ceil(10+fleet().count/35+(r.move>40000?12:0)))*(hasStaff("logistics")?.8:1);state.cash-=cost;state.relocationJob={id,due:state.time+Math.ceil(days)*DAY,cost};state.power=false;log(`Relocation dispatched to ${r.name}`,`${Math.ceil(days)} days · -${fmtUsd(cost)}`,"operations");showToast("Fleet in transit",`Mining is paused while the fleet moves to ${r.name}. ETA ${dateFmt(state.relocationJob.due)}.`);custodyRelocationNotice();save();render();
}
function buyNode(level){
  const costs={1:260,2:1200},dates={1:START,2:at("2016-01-01")};if(level<=state.node||state.time<dates[level])return;
  if(state.cash<costs[level])return showToast("Not enough cash",`Node setup costs ${fmtUsd(costs[level])}.`);
  state.cash-=costs[level];state.node=level;log(level===1?"Dedicated full node online":"Hardened node online",`-${fmtUsd(costs[level])}`);showToast(level===1?"Continuous verification":"Hardened node online",level===1?"The dedicated node keeps validating when the mining fleet is manually powered down.":"Higher-throughput synchronization and relay profiles are now available.");save();render();
}
function buyBackupNode(){
  if(state.backupNode.enabled||state.node<1||state.time<at(BACKUP_NODE.date))return;
  if(state.cash<BACKUP_NODE.cost)return showToast("Not enough cash",`${BACKUP_NODE.name} setup costs ${fmtUsd(BACKUP_NODE.cost)}.`);
  const lag=initialBackupSyncLag();state.cash-=BACKUP_NODE.cost;state.backupNode.enabled=true;state.nodeSync.backupLag=lag;state.nodeSync.backupPeak=lag;log("Geographic backup node deployed",`${fmtNum(lag)} days of block history queued for validation`);showToast("Initial block download",`The remote node is installed, but it must independently validate ${fmtNum(lag)} modelled days of backlog before it can protect verification continuity.`);save();render();
}
function upgradeNodeStorage(gb){
  const tier=NODE_STORAGE.find(x=>x.gb===Number(gb));if(!tier||tier.gb<=state.nodeStorage||state.time<at(tier.date))return;
  if(state.cash<tier.cost)return showToast("Not enough cash",`${tier.name} costs ${fmtUsd(tier.cost)}.`);
  state.cash-=tier.cost;state.nodeStorage=tier.gb;log("Node storage upgraded",`${tier.name} · -${fmtUsd(tier.cost)}`);save();render();
}
function setNodeMode(id){const profile=NODE_MODES.find(x=>x.id===id);if(!profile||(profile.requires&&state.node<profile.requires))return;state.nodeMode=id;state.nodePruned=id==="pruned";log(`Node profile: ${profile.name}`,`${nodeModeWatts(profile)} W · ${nodeModeConnections(profile)} peers · ${fmtUsd(nodeModeMonthly(profile))}/month network`);save();render()}
function toggleNodePruning(){setNodeMode(state.nodeMode==="pruned"?"archival":"pruned")}
function deriveWalletKeyHex(rolls){
  let n=0n;for(const r of rolls)n=n*6n+BigInt(r-1);
  return n.toString(16).padStart(64,"0").slice(-64);
}
/* Dice for a key come from the browser's own source of randomness, and a byte that would favour
   some faces is thrown away (256 does not divide by six). The game's seeded stream is never used
   here: that seed is printed in the header, and a key made from it could be made again. */
function secureDice(count){
  const rolls=[],buf=new Uint8Array(Math.max(16,count*2));
  while(rolls.length<count){crypto.getRandomValues(buf);for(const b of buf)if(b<252&&rolls.length<count)rolls.push((b%6)+1)}
  return rolls;
}
function rollDie(){
  if(state.walletSetup.done||state.walletSetup.rolls.length>=99)return;
  state.walletSetup.rolls.push(secureDice(1)[0]);
  save();render();
}
function finishRolling(){
  if(state.walletSetup.done||state.walletSetup.rolls.length<8)return;
  secureDice(99-state.walletSetup.rolls.length).forEach(r=>state.walletSetup.rolls.push(r));
  state.walletSetup.step=2;state.walletSetup.keyHex=deriveWalletKeyHex(state.walletSetup.rolls);
  save();render();
}
function skipWalletSetup(){
  if(state.walletSetup.done)return;
  if(state.walletSetup.demo){completeWalletSetup();return}
  const rolls=secureDice(99);
  state.walletSetup.rolls=rolls;state.walletSetup.keyHex=deriveWalletKeyHex(rolls);
  // Show the result and offer the backup, as the dice do: the key is real now, and what is done with it is a choice.
  state.walletSetup.step=2;save();render();
}
function completeWalletSetup(withBackup=false){
  if(state.walletSetup.done)return;
  const tier=walletSoftwareTierAt(state.campaignStart);
  if(!state.walletSetup.demo)state.walletSoftware=tier;state.walletSetup.done=true;
  // The key the ceremony made is a real key: the one behind the online wallet.
  if(!state.walletSetup.demo&&typeof createHotWallet==="function")createHotWallet({keyHex:state.walletSetup.keyHex,backup:!!withBackup});
  if(!state.walletSetup.demo)log("Game wallet ready",`Installed ${WALLET_SOFTWARE[tier].name} · illustrative keys only`,"custody");
  state.speed=state.walletSetup.demo?(state.walletSetup.resumeSpeed||0):(typeof state.walletSetup.resumeSpeed==="number"?state.walletSetup.resumeSpeed:1);save();setTimer();render();
  // A new run is walked round the game before it starts, with the clock held; the speed it would have had comes back at the end.
  if(!state.walletSetup.demo&&state.walletSetup.required&&typeof beginTour==="function")beginTour();
}
function upgradeWalletSoftware(){
  const next=state.walletSoftware+1;if(next>=WALLET_SOFTWARE.length)return;
  const tier=WALLET_SOFTWARE[next];if(state.time<at(tier.date))return;
  state.walletSoftware=next;state.points++;
  log(`Upgraded to ${tier.name}`,"+1 skill point","milestone");
  showToast(`Upgraded to ${tier.name}`,`${tier.desc} +1 skill point.`,"milestone","custody");
  save();render();
}
function triggerFaucet(t){
  faucet={amount:faucetAmount(t)};
  const host=document.getElementById("app");
  document.querySelector(".faucet-pop")?.remove();
  if(host&&state.started)host.insertAdjacentHTML("beforeend",faucetMarkup(faucet));
  clearTimeout(faucetTimer);
  faucetTimer=setTimeout(()=>{faucet=null;document.querySelector(".faucet-pop")?.remove()},6500);
}
function claimFaucet(){
  if(!faucet)return;const amt=faucet.amount;
  state.wallets.hot+=amt;log("Bitcoin Faucet claimed",`+${fmtBtc(amt)}`);
  clearTimeout(faucetTimer);faucet=null;document.querySelector(".faucet-pop")?.remove();save();refreshLive();
}
function deployLightning(fraction){
  if(!lightningAvailable())return showToast("Lightning unavailable","Lightning routing unlocks in 2018 and requires a synchronized dedicated primary node in archival or relay mode.");
  const btc=state.wallets.hot*fraction;if(btc<=0)return showToast("No spendable BTC","Move bitcoin into the hot wallet first.");
  state.wallets.hot-=btc;state.lightning.locked+=btc;log("Lightning liquidity deployed",`-${fmtBtc(btc)} locked`);save();render();
}
function withdrawLightning(){
  const btc=state.lightning?.locked||0;if(btc<=0)return;
  const fee=btc*.0005;state.lightning.locked=0;state.wallets.hot+=btc-fee;log("Lightning liquidity withdrawn",`+${fmtBtc(btc-fee)}`);save();render();
}
function payDebt(){
  if(state.debt<=0)return;if(state.cash<state.debt)return showToast("Bill still due",`You need ${fmtUsd(state.debt-state.cash)} more.`);
  state.cash-=state.debt;log("Grid service restored",fmtUsd(state.debt),"finance");state.debt=0;state.arrearsDue=0;state.gridCutAnnounced=false;state.power=sitePowerAfterBill();showToast("Arrears cleared","Power and internet are restored. The next operating bill is due at the month boundary as usual.","success","dashboard");save();render();
}
function setContract(id){if(!POWER_CONTRACTS.some(x=>x.id===id)||id===state.contract)return;state.contract=id;log("Power contract changed",powerContract().name);save();render()}
function setConnectivityPlan(id){const plan=CONNECTIVITY_PLANS.find(x=>x.id===id);if(!plan||id===state.connectivity)return;
  if(id===OFFLINE_PLAN_ID)return requestCutInternet();
  if(internetCut()){state.connectivityBefore=id;return restoreInternet()}
  // One availability rule, read by both the chooser and this switch, so they cannot disagree.
  if(!connectivityAvailable(plan))return showToast("Connectivity unavailable",`${plan.name}: ${connectivityUnavailableReason(plan)}.`);state.connectivity=id;log("Connectivity plan changed",`${plan.name} · ${fmtUsd(internetMonthlyCost())}/month`);save();render()}
function hireStaff(id){const s=STAFF.find(x=>x.id===id);if(!s||(id!=="fieldtech"&&hasStaff(id)))return;
  /* Two tiers of the same job are one job. Hiring up replaces the junior post rather than
     stacking two salaries for overlapping work; hiring down while the senior is in post is
     refused, because it would be paying twice for less. */
  if(s.supersededBy&&hasStaff(s.supersededBy))return showToast("Already covered",`${STAFF.find(x=>x.id===s.supersededBy)?.name||"A senior post"} already plans materials for this site.`);
  if(s.supersedes&&hasStaff(s.supersedes)){
    const junior=STAFF.find(x=>x.id===s.supersedes);
    state.staff=state.staff.filter(x=>x!==s.supersedes);
    log(`${junior?.name||s.supersedes} role absorbed`,`${s.name} takes over materials planning`,"operations");
  }if(!staffHiringAvailable())return showToast("Staffing unavailable","Move into the tier 3 Light industrial unit or a larger facility before building an internal team.");state.staff.push(id);const count=fieldTechnicianCount();log(`Hired ${s.name}`,id==="fieldtech"?`${count} technicians · ${fmtUsd(s.salary*count)}/month total`:`${fmtUsd(s.salary)}/month`);save();render()}
function dismissStaff(id){
  const role=STAFF.find(x=>x.id===id);if(!role||!hasStaff(id))return;
  if(id==="fieldtech"){
    const committed=(state.maintenance.serviceJobs||[]).reduce((sum,job)=>sum+(job.contracted?0:Number(job.crew||0)),0);
    if(fieldTechnicianCount()-1<committed)return showToast("Technician still on a job",`${committed} technician${committed===1?" is":"s are"} assigned to active repairs. Wait for a service job to finish before cutting the crew.`);
  }
  const countBefore=state.staff.filter(x=>x===id).length;
  state.staff.splice(state.staff.indexOf(id),1);
  state.billLedger.staff=(state.billLedger.staff||0)+role.salary;state.bill+=role.salary;
  const techs=fieldTechnicianCount();
  if(!techs&&state.autoRepair)state.autoRepair=false;
  log(`Dismissed ${role.name}`,`One month notice · ${fmtUsd(role.salary)} added to this month's bill${id==="fieldtech"?` · ${techs} technician${techs===1?"":"s"} remaining`:""}`);
  showToast(`${role.name} dismissed`,`Salary stops now. One month's notice (${fmtUsd(role.salary)}) is added to the accrued bill.${id==="fieldtech"&&!techs?" You are back to servicing the fleet yourself.":""}`,"info");
  custodyOnDismiss(id,countBefore);
  save();render();
}
function toggleInsurance(){state.insured=!state.insured;log(state.insured?"Migration insurance bound":"Migration insurance cancelled",state.insured?`${fmtUsd(migrationInsuranceCost())}/month`:"");save();render()}
function fiatCollateral(){return Math.max(0,state.cash-state.projectLoan)}
function reserveMilestoneStatus(){const monthlyBurn=monthlyCost().total+financeInterestMonthly(),required=monthlyBurn*6,collateral=fiatCollateral(),days=Math.max(0,state.uptimeDays||0),tier=facilityTier();return{monthlyBurn,required,collateral,days,tier,ok:tier>=2&&days>=180&&state.debt<=0&&collateral>=required}}
function reserveMilestoneProgress(){const r=reserveMilestoneStatus();if(state.milestones.includes("reserve"))return"Six-month reserve achieved";if(r.tier<2)return"Reserve goal: move into a tier 2 facility";if(r.days<180)return`Reserve goal: ${180-r.days} operating day${180-r.days===1?"":"s"} remaining`;if(state.debt>0)return"Reserve goal: clear grid arrears";return`Reserve goal: ${fmtUsd(r.collateral)} / ${fmtUsd(r.required)} unborrowed fiat`}
function projectLoanLimit(){return Math.max(fiatCollateral()*.5,(state.operator?.lastRevenueUsd||0)*6)}
function projectLoanHeadroom(){return state.time<PROJECT_FINANCE_START?0:Math.max(0,projectLoanLimit()-state.projectLoan)}
function projectFinanceReason(){if(state.time<PROJECT_FINANCE_START)return`Unavailable until ${dateFmt(PROJECT_FINANCE_START,true)}: lenders do not yet finance experimental Bitcoin mining`;const collateral=fiatCollateral(),revenue=state.operator?.lastRevenueUsd||0,headroom=projectLoanHeadroom();if(headroom>0)return`${fmtUsd(headroom)} available against fiat collateral or six months of recent mining revenue`;if(collateral<=0&&revenue<=0)return"Unavailable: establish liquid collateral or a revenue-producing mining record";return"Unavailable: operating-credit capacity is fully drawn; repay principal or grow monthly mining revenue"}
function takeProjectLoan(){const max=projectLoanHeadroom(),amount=Math.min(max,Math.max(1000,Math.round(projectLoanLimit()*.25/1000)*1000));if(amount<=0)return showToast("Growth funding unavailable",projectFinanceReason());state.projectLoan+=amount;state.cash+=amount;log("Fiat-backed finance drawn",`+${fmtUsd(amount)}`);save();render()}
function repayProjectLoan(){const amount=Math.min(state.cash,state.projectLoan);if(amount<=0)return;state.cash-=amount;state.projectLoan-=amount;log("Project finance repaid",`-${fmtUsd(amount)}`);save();render()}
function checkMilestones(){MILESTONES.forEach(m=>{if(!state.milestones.includes(m.id)&&m.check()){state.milestones.push(m.id);state.milestoneLog.push({id:m.id,time:state.time});state.points++;log(`Milestone: ${m.label}`,"+1 skill point","milestone");showToast(m.label,`${m.blurb} +1 skill point.`,"milestone")}})}
/* ORDER-BOOK DEPTH - a book whose depth scales with the size of the market moves against
   you in proportion to the fraction of that market your order represents. Market
   capitalisation is recorded; the constant, and the premise that depth tracks
   capitalisation, are modelled.

   This is what stops an early fortune from being a free one. In December 2010 the whole
   market was capitalised at $1.3M, so an idle run's holdings were most of a percent of every
   bitcoin in existence and could not be sold at the quote at any price. The same order is a
   rounding error by 2020, so the effect retires itself as the market grows - no era-specific
   tuning, and nothing to unwind once the market is deep.

   Proportional rather than square-root impact: the recorded capitalisation spans six orders
   of magnitude across the campaign, and a square-root law compresses that into a range too
   narrow to be either honest about 2010 or fair to 2026.

   Pressure carries between trades and decays with a three-day half-life. Slicing one
   unsellable order into a hundred small ones saves at most half the impact, the same
   advantage real execution algorithms get, while genuinely waiting for the book to refill
   works properly - which is the decision the era actually posed. Buying relieves your own
   selling pressure, so only a same-direction imbalance counts against you. */
const IMPACT_K=66,IMPACT_MAX=.85,IMPACT_FLOOR=.001,PRESSURE_HALFLIFE=3*DAY;
function recentPressure(){const p=state.marketPressure;if(!p||!p.usd)return 0;const elapsed=Math.max(0,state.time-p.at);if(elapsed>PRESSURE_HALFLIFE*20)return 0;return p.usd*Math.pow(.5,elapsed/PRESSURE_HALFLIFE)}
function addPressure(usd,side){state.marketPressure={usd:recentPressure()+side*Math.max(0,usd),at:state.time}}
function tradeImpact(usd,side){const cap=marketCapAt(state.time);if(!(cap>0)||!(usd>0))return 0;const standing=Math.max(0,side*recentPressure()),impact=IMPACT_K*(standing+usd)/cap;return impact<IMPACT_FLOOR?0:Math.min(IMPACT_MAX,impact)}
function impactNote(impact){return impact>=IMPACT_FLOOR?`${(impact*100).toFixed(impact<.01?2:1)}% market impact`:""}
function venueTradeFee(bucket){return bucket==="mtgox"?.008:bucket==="frontier"?.004:bucket==="etf"?.0025:.006}
function buyBtc(bucket,fraction){
  if(state.time<MARKET)return;fraction=clamp(Number(fraction)||0,0.01,1);const usd=state.cash*fraction;if(usd<1)return showToast("Order too small","Increase the selected percentage so the buy order is at least $1.");
  const fee=venueTradeFee(bucket);
  const impact=bucket==="etf"?0:tradeImpact(usd,-1),btc=usd*(1-fee)/(priceAt(state.time)*(1+impact));
  if(impact>0)addPressure(usd,-1);
  state.cash-=usd;state.wallets[bucket]+=btc;log(bucket==="etf"?"Bought ETF exposure":"Bought bitcoin",`+${fmtBtc(btc)} · -${fmtUsd(usd)} at ${fmtUsd(priceAt(state.time))}`,"trade");showToast(bucket==="etf"?"ETF purchase complete":"Bitcoin purchase complete",`${fmtUsd(usd)} became ${fmtBtc(btc)} in ${walletName(bucket)}. ${fmtUsd(state.cash)} cash remains.`,"info","market");save();render();
}
function sellBtc(bucket,fraction){
  if(venueFrozen(bucket))return showToast("Withdrawals frozen",`${walletName(bucket)} has paused withdrawals until ${dateFmt(state.ops.venueFreezes[bucket])}.`);
  fraction=clamp(Number(fraction)||0,0.01,1);const btc=state.wallets[bucket]*fraction;if(btc<=0)return;
  const fee=venueTradeFee(bucket);
  const price=priceAt(state.time),notional=btc*price,impact=bucket==="etf"?0:tradeImpact(notional,1),usd=notional*(1-fee)*(1-impact);
  if(impact>0)addPressure(notional,1);
  state.wallets[bucket]-=btc;state.cash+=usd;log(bucket==="etf"?"Sold ETF exposure":"Sold bitcoin",`-${fmtBtc(btc)} · +${fmtUsd(usd)} at ${fmtUsd(price)}${impact>=.001?` · ${impactNote(impact)}`:""}`,"trade");
  if(state.settlementSaleMode&&state.pendingSettlement&&state.cash+1e-8>=state.pendingSettlement.due){state.settlementSaleMode=false;finishMonthlySettlement("btc-rescue");return}
  showToast(bucket==="etf"?"ETF sale complete":"Bitcoin sale complete",impact>=.01?`${fmtBtc(btc)} became ${fmtUsd(usd)}. The order was ${formatPercent(impact*100)}% of its quoted value larger than the book could absorb, so it filled below the quote. ${fmtUsd(state.cash)} cash is now available.`:`${fmtBtc(btc)} became ${fmtUsd(usd)} after fees. ${fmtUsd(state.cash)} cash is now available.`,"info","market");save();render();
}
/* Spending it. The coins leave, a code arrives, and the only thing the operation gains is
   the experience of having used the money as money. That is the joke and it is also the
   point: a fortune you never spend is a number, and the people who did spend it in 2013 are
   the reason anyone knows what these things were worth. */
function giftCardVendor(id){return GIFT_CARD_VENDORS.find(v=>v.id===id)||null}
function giftCardXpFor(usd){return GIFT_CARD_XP_BASE*Math.log2(1+Math.max(0,usd)/25)}
function buyGiftCard(id,usd){
  const vendor=giftCardVendor(id);
  if(!vendor)return;
  if(state.time<at(vendor.date))return showToast("Not available yet",`${vendor.name} does not take bitcoin until ${dateFmt(at(vendor.date),true)}.`);
  if(state.time<MARKET)return showToast("No exchange rate yet","Nobody can price a gift card in bitcoin before bitcoin has a price.");
  usd=Math.max(5,Math.round(Number(usd)||0));
  const price=priceAt(state.time),btc=usd/price;
  const held=state.wallets.hot||0;
  if(btc>held)return showToast("Not enough in the hot wallet",`A ${fmtUsd(usd)} card costs ${fmtBtc(btc)} at today's price; you hold ${fmtBtc(held)} hot.`);
  state.wallets.hot=Math.max(0,held-btc);
  state.giftCards.spentBtc+=btc;state.giftCards.spentUsd+=usd;state.giftCards.cards+=1;
  const xp=giftCardXpFor(usd);
  awardXp(xp,"spend");
  log(`Spent bitcoin at ${vendor.name}`,`-${fmtBtc(btc)} for a ${fmtUsd(usd)} card · +${Math.round(xp)} XP`,"trade");
  showToast("You actually spent some",
    `${fmtBtc(btc)} became a ${fmtUsd(usd)} code. You are ${Math.round(xp)} XP wiser and ${fmtBtc(btc)} lighter.`,"info","market");
  save();render();
}
/* The pizza line. What everything you ever spent would be worth if you had not. */
function giftCardHindsight(t=state.time){
  const spent=state.giftCards?.spentBtc||0;
  if(spent<=0)return null;
  return {btc:spent,thenUsd:state.giftCards.spentUsd,nowUsd:spent*priceAt(t),cards:state.giftCards.cards};
}
function transfer(from,to,fraction,opts={}){
  if(venueFrozen(from))return showToast("Withdrawals frozen",`${walletName(from)} has paused withdrawals until ${dateFmt(state.ops.venueFreezes[from])}.`);
  fraction=clamp(Number(fraction)||0,0.01,1);const gross=state.wallets[from]*fraction;if(gross<=0)return;
  if(to==="cold"&&!custodySetup().ready)return showToast("Cold storage needs a signer first","A wallet nobody can sign for is a place coins go to be lost. Follow the steps in Set up cold storage on the Custody section: a signer, a key, a backup, then assign the key.","blocked","custody");
  const fee=transferNetworkFee(from,fraction,opts);if(gross<=fee)return showToast("Transfer too small",`The selected ${formatPercent(fraction*100)}% is not enough to cover the ${fmtBtc(fee)} network fee.`);const btc=gross-fee;
  /* Everything except cold storage moves the moment it is asked to. Cold does not, because
     that is what cold storage IS - see signing.js. */
  if(from==="cold")return beginColdSpend(to,gross,fee,{fraction,rush:opts.rush});
  utxoMoved(from,to,fraction);
  state.wallets[from]-=gross;state.wallets[to]+=btc;log(`Moved BTC: ${walletName(from)} → ${walletName(to)}`,`${fmtBtc(gross)} sent · -${fmtBtc(fee)} fee`);showToast("BTC transfer complete",`${fmtBtc(btc)} reached ${walletName(to)} after a ${fmtBtc(fee)} network fee.`,"info","custody");save();render();
}
/* A bulk parts order is its own action rather than a quantity on the ordinary one, so that
   ordering a single fan stays a single click and ordering five hundred does not. Five hundred
   hashboards is a five-figure commitment against a lead time - the kind of spend the rest of
   the game already stops to confirm. */
const CONFIRMABLE_ACTIONS=new Set(["buy-btc","sell-btc","buy-hw","buy-hw-btc","sell-hw","sell-hw-btc","buy-strategy","sell-strategy","buy-node","buy-backup-node","order-parts-bulk"]);
function transactionPreviewValid(preview){return !!preview&&[preview.give,preview.receive,preview.reference,preview.fees,preview.after].every(value=>!/(?: -|NaN|Infinity)/.test(String(value)))}
function requestTransactionConfirmation(button){const preview=transactionPreview(button);if(!preview)return;if(!transactionPreviewValid(preview))return showToast("Quote unavailable","One or more transaction values could not be calculated. No balances were changed.");state.lastReal=Date.now();state.speed=0;pendingTransaction=preview;setTimer();render()}
function restoreTransactionSpeed(transaction){state.speed=transaction?.resumeSpeed||0;if(state.speed>0)state.returnSpeed=state.speed;state.lastReal=Date.now();setTimer()}
function cancelTransactionConfirmation(){const transaction=pendingTransaction;pendingTransaction=null;restoreTransactionSpeed(transaction);render()}
function confirmTransaction(){
  const transaction=pendingTransaction;if(!transaction)return;pendingTransaction=null;restoreTransactionSpeed(transaction);
  if(transaction.action==="transfer"){transfer(transaction.from,transaction.to,transaction.fraction,{rush:transaction.rush});return}
  if(transaction.action==="order-parts-bulk")orderParts(transaction.id,transaction.qty);else if(transaction.action==="buy-btc")buyBtc(transaction.id,transaction.fraction);else if(transaction.action==="sell-btc")sellBtc(transaction.id,transaction.fraction);else if(transaction.action==="buy-hw")buyHardware(transaction.id,transaction.requested);else if(transaction.action==="buy-hw-btc")buyHardwareBtc(transaction.id,transaction.requested);else if(transaction.action==="sell-hw")sellHardware(transaction.id,transaction.requested);else if(transaction.action==="sell-hw-btc")sellHardwareBtc(transaction.id,transaction.requested);else if(transaction.action==="buy-strategy")buyStrategy(transaction.id,transaction.fraction);else if(transaction.action==="sell-strategy")sellStrategy(transaction.id,transaction.fraction);else if(transaction.action==="buy-node")buyNode(transaction.requested);else if(transaction.action==="buy-backup-node")buyBackupNode();
  if(document.querySelector('[data-action="confirm-transaction"]'))render();
}
function unlockSkill(id){
  const s=SKILLS.find(x=>x.id===id);if(!s||hasSkill(id)||state.points<s.cost||skillGateReason(s))return;
  state.points-=s.cost;state.skills.push(id);log(`Unlocked ${s.name}`,`-${s.cost} point${s.cost===1?"":"s"}`);save();render();
}
function startLearning(id){
  const item=LEARNING.find(x=>x.id===id);if(!item||state.learning||state.completedLearning.includes(id)||state.time<at(item.date))return;
  state.learning={id,progress:0,waiting:false};log(item.type==="Podcast"?`Subscribed: ${item.title}`:`Started reading: ${item.title}`,`${item.days} days`);save();render();
}
function answerLearningCheck(answer){
  const item=learningItem();if(!item||!state.learning.waiting||!item.check)return;
  const correct=Number(answer)===item.check.answer;awardLearning(item,correct?1:.6);if(!correct)showToast("Knowledge check missed",`You completed ${item.title}, but received 60% of the available knowledge. Review the explanation before the next lesson.`,"warning","learn");save();render();
}
function venueAvailable(id){
  if(id==="mtgox")return state.time>=MARKET&&state.time<at("2014-02-24");
  if(id==="bitfinex")return state.time>=at("2012-10-01");
  if(id==="quadriga")return state.time>=at("2013-01-01")&&state.time<at("2019-02-05");
  if(id==="frontier")return state.time>=at("2011-06-01")&&state.time<at("2022-11-11");
  if(id==="exchange")return state.time>=at("2015-01-01");
  if(id==="etf")return state.time>=at("2024-01-10");return true;
}
function walletName(id){return({hot:"Node-connected hot wallet",cold:"Cold / hardware wallet",mtgox:"Mt. Gox",bitfinex:"Bitfinex",quadriga:"QuadrigaCX",frontier:"Frontier exchange",exchange:"Regulated exchange",etf:"ETF exposure",frozen:"Frozen claims"})[id]||id}
function resetGame(){if(!confirm("Erase this run and return to the Genesis Block?"))return;state=initialState();OPERATOR_ERAS.forEach(era=>state.operator.eras[era.id]={months:0,solvent:0,profitable:0,uptime:0,competitive:0});migrateActivity(state);activeTab="dashboard";activityFilter="all";activityLimit=100;tradePercentages={};introDifficulty="medium";introStartingCash=STARTING_LIQUIDITY_DEFAULT;introStep=0;clearTimeout(faucetTimer);faucet=null;save();setTimer();render()}
function exportSave(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="timechain-save.json";a.click();URL.revokeObjectURL(url);
}
function importSave(file){
  const reader=new FileReader();reader.onload=()=>{try{const parsed=JSON.parse(String(reader.result));if(!parsed||parsed.version!==1||!parsed.wallets||!parsed.hardware||saveShapeProblem(parsed))throw new Error("invalid");const restored=Object.assign(initialState(),parsed,{lastReal:Date.now()});restored.points=Number.isFinite(Number(restored.points))?Math.max(0,Math.floor(Number(restored.points))):0;restored.skills=Array.isArray(restored.skills)?[...new Set(restored.skills.filter(id=>SKILLS.some(s=>s.id===id)))]:[];restored.seen=Array.isArray(restored.seen)?restored.seen:[];restored.milestones=Array.isArray(restored.milestones)?restored.milestones:[];restored.milestoneLog=Array.isArray(restored.milestoneLog)?restored.milestoneLog:[];restored.exposureWarned=Array.isArray(restored.exposureWarned)?restored.exposureWarned:[];restored.maintenance.selfRepairs=restored.maintenance.selfRepairs&&typeof restored.maintenance.selfRepairs==="object"?restored.maintenance.selfRepairs:{};restored.xp=normalizeXp(restored.xp);restored.exposureWarned=Array.isArray(restored.exposureWarned)?restored.exposureWarned:[];restored.startingGrant=!!restored.startingGrant;restored.difficulty=STARTING_MODES.some(mode=>mode.id===restored.difficulty)?restored.difficulty:(startingModeForCash(restored.startingCash)?.id||"legacy");delete restored.treasuryPolicy;if(restored.custody)normalizeCustodyPlaces(restored.custody);restored.operator=Object.assign(initialState().operator,restored.operator||{});restored.operator.eras=restored.operator.eras||{};OPERATOR_ERAS.forEach(era=>restored.operator.eras[era.id]=Object.assign({months:0,solvent:0,profitable:0,uptime:0,competitive:0},restored.operator.eras[era.id]||{}));restored.poweredDownHardware=restored.poweredDownHardware&&typeof restored.poweredDownHardware==="object"?restored.poweredDownHardware:{};restored.thermal=Object.assign({temperature:22,equipment:{}},restored.thermal||{});restored.thermal.equipment=restored.thermal.equipment&&typeof restored.thermal.equipment==="object"?restored.thermal.equipment:{};COOLING_EQUIPMENT.forEach(item=>restored.thermal.equipment[item.id]=Math.max(0,Math.floor(Number(restored.thermal.equipment[item.id])||0)));HARDWARE.forEach(h=>restored.poweredDownHardware[h.id]=Math.max(0,Math.min(restored.hardware[h.id]||0,Math.floor(Number(restored.poweredDownHardware[h.id])||0))));migrateActivity(restored);migrateHardwareAlerts(restored,!!parsed.hardwareAlerts);state=restored;activeTab="dashboard";activityFilter="all";activityLimit=100;clearTimeout(faucetTimer);faucet=null;save();setTimer();render();showToast("Run restored","The imported ledger is now active.")}catch(e){showToast("Import failed","That file is not a valid Timechain save.")}};reader.readAsText(file);
}
