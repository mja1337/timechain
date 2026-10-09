"use strict";

function hardwareReleaseMetrics(h){
  const previous=previousMiningGeneration(h),hours=24*30.4375,efficiency=hardwareEfficiency(h),rate=powerRate(region(),state.time),oldEquivalentWatts=previous?h.hash/previous.hash*previous.w:null,oldEfficiency=previous?hardwareEfficiency(previous):null,fs=fleet();
  return{previous,hours,efficiency,rate,oldEquivalentWatts,oldEfficiency,hashMultiple:previous?h.hash/previous.hash:null,efficiencyGain:previous?1-efficiency/oldEfficiency:null,equalHashPowerGain:previous?1-h.w/oldEquivalentWatts:null,monthlyKwh:h.w/1000*hours,oldMonthlyKwh:oldEquivalentWatts===null?null:oldEquivalentWatts/1000*hours,thousandMw:h.w/1000,thousandMonthlyGwh:h.w/1000*hours/1000,thousandMonthlyCost:h.w*hours*rate,fleet:fs,fleetHashMultiple:fs.hash>0?h.hash/fs.hash:null};
}
function signedPercent(value){if(!Number.isFinite(value))return"-";return`${value>=0?"+":""}${(value*100).toFixed(1)}%`}
function signedEnergy(value){if(!Number.isFinite(value))return"-";return`${value>0?"+":"−"}${fmtNum(Math.abs(value))} kWh/month`}
function hardwareReleaseModal(){
  const alerts=state.hardwareAlerts,h=asicHardware().find(item=>item.id===alerts.active);if(!h)return"";const m=hardwareReleaseMetrics(h),p=m.previous,monthlyDelta=m.monthlyKwh-(m.oldMonthlyKwh||0),costDelta=monthlyDelta*m.rate,oldMw=m.oldEquivalentWatts===null?null:m.oldEquivalentWatts/1000,fs=m.fleet;
  return `<div class="modal-backdrop"><section class="modal hardware-alert-modal" role="alertdialog" aria-modal="true" aria-labelledby="hardware-release-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">New ASIC generation · ${dateFmt(at(h.date))} · timeline paused</div><h2 id="hardware-release-title">${h.name} is now shipping.</h2><p class="lead">${h.desc} ${h.maker}’s nameplate specification changes the amount of SHA-256 work an operator can buy per watt.</p><div class="release-impact"><div><span>Physical hash rate</span><b>${fmtHash(h.hash)}</b><small>per machine · no gameplay multiplier</small></div><div><span>Nameplate input</span><b>${(h.w/1000).toFixed(h.w<1000?3:2)} kW</b><small>${fmtNum(m.monthlyKwh)} kWh in a 30.4-day month</small></div><div><span>Hardware efficiency</span><b>${fmtJth(m.efficiency)} J/TH</b><small>lower means less energy for the same work</small></div><div><span>Launch acquisition</span><b>${fmtUsd(hardwareUnitCost(h))}</b><small>${h.edge?`${h.edge.toFixed(1)}× modelled launch edge; not physical hash`:"No temporary launch-edge modifier"}</small></div></div>${p?`<div class="card-head"><h3>Step change from ${p.name}</h3><div class="meta">EQUAL-HASH COMPARISON</div></div><div class="release-impact"><div><span>Hash / machine</span><b>${m.hashMultiple.toFixed(m.hashMultiple>=10?1:2)}×</b><small>${fmtHash(p.hash)} → ${fmtHash(h.hash)}</small></div><div><span>J/TH improvement</span><b class="${m.efficiencyGain>=0?"profit-positive":"profit-negative"}">${signedPercent(m.efficiencyGain)}</b><small>${fmtJth(m.oldEfficiency)} → ${fmtJth(m.efficiency)} J/TH</small></div><div><span>Equal-hash demand</span><b>${(m.oldEquivalentWatts/1000).toFixed(2)} → ${(h.w/1000).toFixed(2)} kW</b><small>${signedPercent(-m.equalHashPowerGain)} load change</small></div><div><span>Energy impact / month</span><b class="${monthlyDelta<=0?"profit-positive":"profit-negative"}">${signedEnergy(monthlyDelta)}</b><small>${costDelta<=0?"Saves ":"Adds "}${fmtUsd(Math.abs(costDelta))} at ${fmtUsd(m.rate)}/kWh</small></div></div>`:""}<div class="demand-callout"><b>Demand-response lens · 1,000 machines</b><p>This generation represents <strong>${m.thousandMw.toFixed(2)} MW</strong> of controllable nameplate demand and can avoid <strong>${m.thousandMw.toFixed(2)} MWh</strong> by curtailing for one hour. At full load it consumes ${m.thousandMonthlyGwh.toFixed(2)} GWh per month, costing ${fmtUsd(m.thousandMonthlyCost)} at the current ${region().name} tariff.${oldMw!==null?` For the same hash rate, the prior generation would need ${oldMw.toFixed(2)} MW - a ${Math.abs(oldMw-m.thousandMw).toFixed(2)} MW ${oldMw>=m.thousandMw?"reduction":"increase"}.`:""}</p></div><p style="margin-top:14px"><strong>Your fleet benchmark:</strong> one ${h.name} delivers ${m.fleetHashMultiple>=1?`${fmtCompactNumber(m.fleetHashMultiple)}× your current ${fmtHash(fs.hash)} physical hash rate`:`${(m.fleetHashMultiple*100).toFixed(1)}% of your current physical hash rate`}, while drawing ${(h.w/1000).toFixed(2)} kW versus the fleet’s ${fs.kw.toFixed(2)} kW. Better J/TH lowers energy for a fixed amount of work; it does not guarantee lower total network demand when operators reinvest the savings into more machines.</p><div class="modal-actions"><button class="action primary" data-action="close-hardware-alert">Continue the timeline</button><button class="action" data-action="inspect-hardware-release">Review ${h.name} in Mine</button><span class="modal-note">${alerts.queue.length?`${alerts.queue.length} more release briefing queued`:"Release briefing saved in the Mine timeline"}</span></div></div></section></div>`;
}
/* HOW MANY WILL ACTUALLY RUN.

   Capacity stopped gating the purchase, which is right - you can buy ahead of a substation
   upgrade and take delivery into storage. What that left behind is a till that will happily
   sell forty thousand machines to a site able to power nine hundred, and the only way to find
   out was to read a kilowatt figure off one card and divide it by a wattage off another.

   "Fits now" is that division, done for you and offered as a rung on the quantity list, so the
   useful number is one click rather than arithmetic. It sits alongside Max rather than
   replacing it: buying past what fits is a legitimate move, and the game should not pretend
   otherwise - it should only make it a decision taken on purpose. */
function hardwareQuantityOptions(maxQty,fitQty=null){
  const max=Math.max(0,Math.floor(Number(maxQty)||0));if(max<1)return[{qty:1,label:"1 miner",disabled:true}];
  /* Only a rung when it is genuinely the binding constraint. Clamping it to the cash maximum
     made the two collide, and the top rung then read "Fits now" when what it actually meant was
     "all you can afford" - which is the opposite of the thing this is here to tell you. */
  const raw=fitQty===null?null:Math.max(0,Math.floor(fitQty));
  const fits=raw!==null&&raw>0&&raw<max?raw:null;
  const rungs=[1,2,5,10,100].filter(n=>n<max&&n!==fits);
  if(fits!==null)rungs.push(fits);
  rungs.push(max);
  return [...new Set(rungs)].sort((a,b)=>a-b).map(qty=>({qty,
    label:qty===fits?`Fits now · ${fmtCompactNumber(qty)}`:qty===max?`Max · ${fmtCompactNumber(qty)}`:`${fmtCompactNumber(qty)} miner${qty===1?"":"s"}`,
    disabled:false}));
}
/* WHAT THIS PURCHASE DOES TO THE POWER BUDGET, under the button that makes it.

   The Mine tab already draws the site's load as a bar. This is the same picture scoped to one
   decision - what is drawn now, what the selected quantity adds, and where that lands against
   supply - so choosing a quantity is something you can see rather than a sum done between two
   cards. */
function purchaseLoadBar(h,qty,fits){
  if(h.permanent||!qty)return"";
  const fs=fleet(),cap=Math.max(.001,fs.cap);
  const addKw=qty*hardwarePeakWatts(h)/1000;
  const nowPct=Math.max(0,Math.min(100,fs.potentialKw/cap*100));
  const addPct=Math.max(0,Math.min(100-nowPct,addKw/cap*100));
  const overKw=Math.max(0,fs.potentialKw+addKw-cap);
  const over=overKw>0,waiting=fits!==null&&qty>fits?qty-fits:0;
  const kw=v=>v<10?v.toFixed(2):fmtNum(Math.round(v));
  return `<div class="buy-load ${over?"over":""}" title="${escapeHtml(`Peak now ${kw(fs.potentialKw)} kW · this order adds ${kw(addKw)} kW · site supplies ${kw(cap)} kW`)}">
    <div class="buy-load-bar"><i class="now" style="width:${nowPct.toFixed(2)}%"></i><i class="add" style="width:${addPct.toFixed(2)}%"></i></div>
    <small>${over
      ? `<b>${kw(overKw)} kW over supply</b> · ${fmtNum(waiting)} would wait in storage`
      : `Adds ${kw(addKw)} kW · ${kw(Math.max(0,cap-fs.potentialKw-addKw))} kW still free`}</small>
  </div>`;
}
function hardwareBuyControls(h,cost,maxBuy,maxBtcQty,available,marketOpen,selectedQty=1,selectedCurrency="usd"){
  const fits=typeof siteRackHeadroom==="function"?siteRackHeadroom(h):null;
  const options=hardwareQuantityOptions(selectedCurrency==="btc"?maxBtcQty:maxBuy,fits),selected=options.find(option=>option.qty===Number(selectedQty))||options[0],disabled=!available||selected.disabled;
  const unitBtc=marketOpen?cost/Math.max(1e-9,priceAt(state.time)):0,costLabel=selectedCurrency==="btc"?fmtCompactBtc(unitBtc*selected.qty):fmtCompactUsd(cost*selected.qty),buyAction=selectedCurrency==="btc"?"buy-hw-btc":"buy-hw";
  return `<div class="actions hardware-buy-controls" data-id="${h.id}" data-max-fiat="${maxBuy}" data-max-btc="${maxBtcQty}"><select data-hardware-qty aria-label="Purchase quantity for ${h.name}" ${disabled?"disabled":""}>${options.map(option=>`<option value="${option.qty}" ${option.qty===selected.qty?"selected":""}>${option.label}</option>`).join("")}</select><select data-hardware-currency aria-label="Purchase currency for ${h.name}" ${disabled?"disabled":""}><option value="usd" ${selectedCurrency==="usd"?"selected":""}>USD</option><option value="btc" ${selectedCurrency==="btc"?"selected":""} ${marketOpen?"":"disabled"}>BTC</option></select><button class="action small primary" data-action="${buyAction}" data-id="${h.id}" data-value="${selected.qty}" ${disabled?"disabled":""} title="${!available?`Not purchasable until ${dateFmt(at(h.date))}`:selected.disabled?"Cash, power or floor space currently blocks any purchase - see the capacity panel above":""}">Buy ${fmtCompactNumber(selected.qty)} · ${costLabel}</button>${purchaseLoadBar(h,selected.qty,fits)}</div>`;
}
/* THE MINE TAB, IN THREE PARTS.

   Mine ran to nearly twelve screens of scroll against four to eight for every other tab,
   because it carried the floor, the whole servicing bay and the hardware catalogue at once.
   That is what made it the worst tab to navigate away from: the tab row lives above the
   content, so the further down a page runs the longer it is unreachable. Sticking the tab
   row fixed the reachability; splitting the page fixes the length.

   The split follows what an operator is actually doing rather than the order the markup
   happened to be in: watching the floor, fixing what is on it, or buying more. */
const MINE_SECTIONS=[
  {id:"floor",name:"Floor",hint:"Live machines, temperature and power"},
  {id:"service",name:"Servicing",hint:"Faults, spare parts and repairs"},
  {id:"cooling",name:"Cooling",hint:"Heat rejection plant and immersion tanks"},
  {id:"buy",name:"Hardware",hint:"Catalogue, deliveries and retirement"}
];
function mineSection(){return MINE_SECTIONS.some(s=>s.id===state.mineSection)?state.mineSection:"floor"}

/* Each section carries a live figure rather than only a name. Mine is the one tab in the
   game with a second level of navigation, so it has to announce itself - and a row of four
   inert labels is easy to read straight past. A count that changes is not. */
function mineSectionBadges(){
  const fs=fleet();
  const faults=HARDWARE.reduce((sum,h)=>sum+hardwareFaultCount(h),0);
  const ailing=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0&&maintenanceCondition(h)<65).length;
  const temperature=roomTemperatureC();
  const band=temperature<32?"cool":temperature<42?"warm":temperature<52?"hot":"critical";
  const inbound=(state.procurementOrders||[]).reduce((sum,o)=>sum+Number(o.qty||0),0);
  // Unpatched firmware is a fleet problem the Servicing section can now fix, so it counts.
  const firmware=(typeof firmwarePatchDue==="function"&&firmwarePatchDue())?1:0;
  const needsService=faults+ailing+firmware;
  /* SERVICING CAN BE UNAVAILABLE, AND THE TAB HAS TO SAY SO.

     A fleet in transit between sites, or one sitting through a grid or internet outage, cannot
     be worked on - and the badge cheerfully read "12 need attention" as though a technician
     could be sent. The tab strip is where a player decides which section to open, so a section
     that cannot do anything right now is exactly the thing it should be reporting. The reason
     is named rather than generalised, because "in transit" and "the power is off" are
     different problems with different waits. */
  const incident=typeof activeSiteIncident==="function"?activeSiteIncident():null;
  const moving=typeof fleetGrounded==="function"&&fleetGrounded();
  const movingTo=moving?(state.relocationJob?REGIONS.find(r=>r.id===state.relocationJob.id)?.name:FACILITIES.find(f=>f.id===state.facilityUpgradeJob?.id)?.name):null;
  const movingDue=moving?(state.relocationJob?.due||state.facilityUpgradeJob?.due||0):0;
  const serviceHalted=moving?`offline · in transit${movingTo?` to ${movingTo}`:""}`
    :incident?`offline · ${incident.kind.toLowerCase()}`
    :state.policyLock?"offline · site shut down"
    :typeof gridCutOff==="function"&&gridCutOff()?"offline · grid disconnected"
    :"";
  const haltedDays=moving&&movingDue?Math.max(0,Math.ceil((movingDue-state.time)/DAY))
    :incident?Math.max(0,Math.ceil((incident.until-state.time)/DAY)):0;
  return{
    floor:{text:`${fmtCompactNumber(fs.activeCount)} / ${fmtCompactNumber(fs.count)} hashing`,tone:fs.count&&!fs.activeCount?"bad":""},
    service:serviceHalted
      ?{text:`${serviceHalted}${haltedDays?` · ${haltedDays}d`:""}`,tone:"halted"}
      :{text:needsService?`${fmtCompactNumber(needsService)} need${needsService===1?"s":""} attention`:"all healthy",tone:needsService?"bad":"good"},
    cooling:{text:`${temperature.toFixed(0)} °C · ${band}`,tone:band==="cool"?"good":band==="warm"?"":"bad"},
    buy:{text:inbound?`${fmtCompactNumber(inbound)} arriving`:"catalogue",tone:inbound?"good":""}
  };
}
/* Clicking a faulted machine on the floor takes you to its repair. Splitting Mine into
   sections broke that silently: the service rows moved to Servicing, so the click still
   fired, found no row on the Floor section, and did nothing at all. The jump now carries you
   across the section boundary - which is also the behaviour 3D picking has to match, since
   a machine you click in the room should reach the same place as one you click on the flat
   floor. */
function focusServiceRow(id){
  const flash=()=>{
    const row=document.querySelector(`[data-service-row="${id}"]`);
    if(!row)return false;
    row.scrollIntoView({behavior:"smooth",block:"center"});
    row.classList.add("focus-flash");
    setTimeout(()=>row.classList.remove("focus-flash"),1600);
    return true;
  };
  if(flash())return;
  state.mineSection="service";
  save();renderMineContent();
  // Two frames: one for the section to paint, one for its layout to settle before scrolling.
  requestAnimationFrame(()=>requestAnimationFrame(flash));
}
function mineSectionNav(){
  const active=mineSection(),badges=mineSectionBadges();
  return `<nav class="mine-sections" aria-label="Mine sections"><span class="mine-sections-label">Mine</span><div class="mine-section-tabs" role="tablist">${MINE_SECTIONS.map(s=>{
    const badge=badges[s.id]||{text:"",tone:""};
    return `<button class="mine-section ${s.id===active?"active":""}" data-action="mine-section" data-value="${s.id}" role="tab" aria-selected="${s.id===active}"><b>${s.name}</b><small>${s.hint}</small><i class="mine-section-badge ${badge.tone}">${badge.text}</i></button>`;
  }).join("")}</div></nav>`;
}
function mine(){
  const fs=fleet(),reserved=plannedFleetProjection(),upNext=nextReleases(HARDWARE),items=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0||state.time>=at(h.date)||upNext.includes(h));
  if(mineSection()!=="buy")return `<div class="grid"></div>`;
  if(typeof internetCut==="function"&&internetCut())return `<div class="grid">${offlineHardwareLockCard()}</div>`;
  return `<div class="grid"><section class="card span-12"><div class="hero"><div><div class="hero-kicker">Mining hardware</div><h1>Choose machines that can earn more than they cost to run.</h1><p>Hash rate is the amount of mining work a machine performs. More hash improves its chance of earning BTC; power draw increases the electricity bill. Check both before you buy.</p></div><div class="hero-stat"><strong>${fmtHash(earningHash())}</strong><span>${operating()?`${fmtNum(fs.count)} machines · ${fs.kw.toFixed(2)} kW`:`stopped · ${fmtHash(fs.hash)} installed but idle`}</span></div></div></section>${profitabilityDeskHtml()}<section class="span-12 catalog">${items.map(h=>{
    const owned=state.hardware[h.id]||0,retired=state.decommissionedHardware?.[h.id]||0,available=state.time>=at(h.date),cost=hardwareUnitCost(h),resale=h.permanent?0:resaleHardwareValue(h),trial=JSON.parse(JSON.stringify(state));trial.hardware[h.id]=(trial.hardware[h.id]||0)+1;const fits=fleet(trial).within;
    /* The card used to work out its own headroom from LIVE draw while the purchase path
       enforced PEAK draw, so it offered quantities the game then refused - 34 against 31 on
       a mid-game workshop, and worse with overdrive engaged. Cooling is thermostatic: a cold
       room draws almost nothing, so a live-draw check passes fleets that cannot actually run.
       There is one function that already computes this correctly for the buy path, and the
       card now asks it rather than doing the sum again differently. */
    const limits=hardwarePurchaseLimits(h);
    const availableKw=limits.freeWatts,availableSpace=limits.freeSpace;
    const safeCost=Number.isFinite(Number(cost))?Number(cost):Infinity;const maxBuy=h.permanent?0:limits.fiatMax;
    /* The BTC checkout is the same purchase paid for differently, so it takes the same site
   limit. It was still dividing free watts by a machine's nameplate wattage using bindings
   the cash path no longer defines - a ReferenceError that emptied the whole hardware
   catalogue, and underneath it the same live-versus-peak error fixed on the cash side. */
    const marketOpenNow=limits.marketOpen,unitBtc=marketOpenNow?safeCost/Math.max(1e-9,priceAt(state.time)):Infinity;
    // BTC checkout is bounded by the hot wallet and by what is listed - not by the room,
    // which decides what it accepts when the crates arrive rather than what may be bought.
    const maxBtcQty=h.permanent||!marketOpenNow?0:Math.max(0,Math.min(limits.hotBtcMax,limits.supplyMax));
    return `<article class="item ${owned?"owned":""} ${available?"":"locked teaser"}" data-hw-id="${h.id}"><div class="item-top"><span class="era">${h.era}</span><span class="owned-count push ${owned?"has-fleet":""}">${owned?`<b>${fmtNum(owned)}</b> installed${retired?` · ${fmtNum(retired)} retired`:""}`:retired?`<b>${fmtNum(retired)}</b> retired`:available?dateFmt(at(h.date),true):`<b class="next-up">Next release</b> · ${dateFmt(at(h.date),true)} · ${unlockInText(h.date)}`}</span></div>${typeof hardwareOrderStrip==="function"?hardwareOrderStrip(h):""}<h3>${h.name}</h3><div class="item-maker">${h.maker}</div><p>${h.desc}</p><div class="specs"><div class="spec"><span>Hash</span><b>${fmtHash(h.hash)}${hardwareLaunchFactor(h)>1?` · ${hardwareLaunchFactor(h).toFixed(2)}× launch edge`:""}</b></div><div class="spec"><span>Power</span><b>${h.w} W</b></div><div class="spec"><span>Space</span><b>${h.space||"desk"}</b></div></div><div class="item-foot"><span class="price">${h.permanent?"Permanent":`Buy · ${fmtCompactUsd(cost)}`} ${!h.permanent?`<small>Fiat resale now · ${fmtCompactUsd(resale)}</small>`:""}</span>${owned&&!h.permanent?`<div class="actions"><button class="action small" data-action="decommission-hw" data-id="${h.id}" data-value="1">Retire 1 to storage</button><button class="action small danger" data-action="decommission-hw" data-id="${h.id}" data-value="${owned}">Retire ${fmtCompactNumber(owned)}</button></div>`:""}${retired&&!h.permanent?`<div class="actions"><button class="action small primary" data-action="sell-hw" data-id="${h.id}" data-value="1">Sell retired 1</button><button class="action small danger" data-action="sell-hw" data-id="${h.id}" data-value="${retired}">Sell retired ${fmtCompactNumber(retired)}</button></div>`:""}${!h.permanent?hardwarePurchaseStatusHtml(h):""}${!h.permanent?hardwareBuyControls(h,cost,maxBuy,maxBtcQty,available,marketOpenNow,hardwarePurchaseChoice[h.id]?.qty||1,hardwarePurchaseChoice[h.id]?.currency||"usd"):""}</div></article>`}).join("")}</section></div>`
}
