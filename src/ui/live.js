"use strict";

/* LIVE TICK - the cheap per-tick DOM patches that keep the header, charts and a few
   tab panels current without rebuilding the page. These are presentation: they read
   simulation state and write text and innerHTML, and they lived in the engine only
   because the engine drives the clock. */

/* Changing speed used to rebuild the entire application to toggle one class. That
   destroyed the control under the player's finger on every single click - losing the
   active state, the focus ring and any press that overlapped the rebuild. Only four
   things actually depend on the speed, so patch those and leave the DOM alone. */
function refreshSpeedControls(){
  document.querySelectorAll('button.speed[data-action="speed"]').forEach(button=>{
    button.classList.toggle("active",Number(button.dataset.value)===state.speed);
  });
  const pause=document.querySelector(".mobile-pause-button");
  if(pause){
    pause.classList.toggle("running",!!state.speed);pause.classList.toggle("paused",!state.speed);
    pause.dataset.value=String(state.speed?0:(state.returnSpeed||1));
    pause.setAttribute("aria-label",state.speed?"Pause simulation":"Run simulation");
    const icon=pause.querySelector(".pause-icon"),label=pause.querySelector(".pause-label");
    if(icon)icon.textContent=state.speed?"Ⅱ":"▶";
    if(label)label.textContent=state.speed?"Pause":"Run";
  }
  const panel=document.querySelector("[data-live-speed-panel]");
  if(panel)panel.textContent=state.speed?`${state.speed}× running`:"Paused";
  document.querySelectorAll("[data-live-simulation]").forEach(el=>{
    el.textContent=state.speed?`${state.speed}× live`:"Paused";
  });
}
function refreshDashboard(){
  if(activeTab!=="dashboard")return;
  const chapter=document.querySelector("[data-opening-stage]");
  if(chapter&&chapter.dataset.openingStage!==openingChapterStage()){chapter.dataset.openingStage=openingChapterStage();chapter.innerHTML=operatorBriefing()}
  const fs=fleet(),monthly=monthlyCost(),share=playerNetworkShareAt(state.time,fs.hash)*100,online=operating(),exp=online?expectedDay():0;
  const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set("dashboard-status",online?"Your machines are securing the network.":state.policyLock?"Politics has shut the site.":gridCutOff()?"The grid has cut you off.":state.debt>0?"An unpaid bill is in arrears.":"Mining is offline.");
  set("dashboard-copy",`${narrativeCopy("dashboard")} ${online?`You currently control ${fmtPct(share)} of effective hash.`:"Resolve the operational constraint or deliberately remain offline while history continues without you."}`);
  set("dashboard-yield",fmtBtc(exp));set("dashboard-controlled",fmtBtc(controlled()));set("dashboard-claims",fmtBtc(claims()));set("dashboard-runway",`${monthly.total?Math.max(0,state.cash/monthly.total).toFixed(1):"∞"} mo`);set("dashboard-runway-cost",`${fmtUsd(monthly.total)} expected monthly`);set("dashboard-load",`${(fs.kw/fs.cap*100).toFixed(1)}%`);set("dashboard-load-sub",`${fs.space} / ${facility().space} floor units`);set("dashboard-chart-date",dateFmt(state.time,true));set("dashboard-history-value",fmtBtc(controlled()));set("dashboard-bill",`Next bill accrued: ${fmtUsd(state.bill)}`);
  // Large visual cards deliberately wait for monthly/unlock renders so live
  // timeline ticks do not cause layout reflow while the player is reading.
}
function refreshMarket(){
  if(activeTabKey()!=="market"||state.time<MARKET)return;
  const price=priceAt(state.time),set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  set("market-price-headline",`${fmtUsd(price)} per bitcoin`);set("market-total-value",fmtUsd(totalBtc()*price));
  document.querySelectorAll("[data-live-bid]").forEach(el=>{el.textContent=fmtUsd(price*(1-venueTradeFee(el.dataset.liveBid)))});
  document.querySelectorAll("[data-live-ask]").forEach(el=>{el.textContent=fmtUsd(price/(1-venueTradeFee(el.dataset.liveAsk)))});
}
function refreshDashboardVisuals(){
  if(activeTab!=="dashboard")return;
  const fs=fleet(),treasury=document.getElementById("dashboard-treasury");
  if(treasury)treasury.innerHTML=btcBreakdown();
  const shareCard=document.getElementById("dashboard-network-share");if(shareCard){const competition=competitiveHashAt(state.time,fs.hash);shareCard.innerHTML=`${donut(playerNetworkShareAt(state.time,fs.hash))}<div class="pie-legend"><span><i class="sw" style="background:var(--orange)"></i>You · ${fmtHash(fs.hash)}</span><span><i class="sw" style="background:#1a2325;border:1px solid var(--line)"></i>Effective competitors · ${fmtHash(competition)}</span></div><p class="modal-note">Historical baseline plus modelled competitive response.</p>`}
  const marketChart=document.getElementById("dashboard-market-chart");if(marketChart)marketChart.innerHTML=chart(sampled(priceAt),"#f7931a",true,{points:sampled(hashAt),color:"#86c79a",label:"Network hash rate",mainLabel:"BTC/USD"});
  const historyChart=document.getElementById("dashboard-history-chart");if(historyChart){const history=state.history.length?state.history.map(x=>x.btc):[0,controlled()];historyChart.innerHTML=chart(history,"#86c79a",true)}
  const mempool=document.getElementById("dashboard-mempool");if(mempool)mempool.innerHTML=mempoolViz();
}
function refreshSettlementForecast(){
  if(!document.getElementById("settlement-forecast"))return;const x=settlementForecast(),stateClass=x.cashAfter<0?"short":x.cashAfter<x.estimated*.2?"tight":"",status=x.cashAfter<0?`SHORT ${fmtUsd(Math.abs(x.cashAfter))} · fleet will disconnect if you do not raise cash or shut down`:x.cashAfter<x.estimated*.2?`TIGHT · only ${fmtUsd(x.cashAfter)} remains after settlement`:`COVERED · ${fmtUsd(x.cashAfter)} projected cash after settlement`,set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const panel=document.getElementById("settlement-forecast-panel");if(panel)panel.className=`settlement-forecast ${stateClass}`;set("forecast-heading",`Forthcoming obligations · next settlement ${dateFmt(x.dueAt)}`);set("forecast-next-total",fmtUsd(x.estimated));set("forecast-next-note",`${x.days} day${x.days===1?"":"s"} remaining · current accrued costs included`);set("forecast-accrued",fmtUsd(state.bill));set("forecast-remaining",fmtUsd(x.remaining));set("forecast-total",fmtUsd(x.estimated));set("forecast-cash-after",fmtUsd(x.cashAfter));Object.entries(x.breakdown).forEach(([key,value])=>set(`forecast-line-${key}`,fmtUsd(value)));const bar=document.getElementById("forecast-bar");if(bar)bar.style.setProperty("--forecast",`${x.coverage}%`);set("forecast-status",status);
}
function refreshLearning(){
  if(activeTab!=="learn"||!state.learning)return;
  const item=learningItem();if(!item)return;
  const days=Math.min(item.days,Math.max(0,state.learning.progress||0)),percent=Math.min(100,Math.round(days/item.days*100));
  const dayEl=document.getElementById("learning-progress-days"),percentEl=document.getElementById("learning-progress-percent");
  if(dayEl)dayEl.textContent=`${days} / ${item.days} days`;
  if(percentEl)percentEl.textContent=`${percent}% complete`;
}
function refreshMinePricing(){
  if(activeTab!=="mine")return;
  const profitDesk=document.getElementById("mine-profitability");if(profitDesk){const shell=document.createElement("div");shell.innerHTML=profitabilityDeskHtml();profitDesk.innerHTML=shell.firstElementChild.innerHTML}
  const reserved=plannedFleetProjection(),availableKw=Math.max(0,reserved.cap*1000-reserved.w),availableSpace=Math.max(0,facility().space-reserved.space),marketOpen=state.time>=MARKET;
  document.querySelectorAll(".catalog .item").forEach(card=>{
    const firstBuy=card.querySelector('[data-action="buy-hw"]');if(!firstBuy)return;
    const h=HARDWARE.find(x=>x.id===firstBuy.dataset.id);if(!h||h.permanent)return;
    const available=state.time>=at(h.date),owned=state.hardware[h.id]||0,retired=state.decommissionedHardware?.[h.id]||0,cost=hardwareUnitCost(h),resale=resaleHardwareValue(h),capacityMax=Math.max(0,Math.min(Math.floor(availableKw/Math.max(1,h.w)),Math.floor(availableSpace/Math.max(1,h.space)))),fiatMax=Math.max(0,Math.min(Math.floor(state.cash/cost),capacityMax)),price=card.querySelector(".price");
    if(price)price.innerHTML=`Buy · ${fmtCompactUsd(cost)} <small>Sell now · ${fmtCompactUsd(resale)}${marketOpen?` · ${fmtCompactBtc(resale/priceAt(state.time))}`:""}</small>`;
    const buyWrap=card.querySelector(".hardware-buy-controls");
    if(buyWrap){
      const unitBtc=marketOpen?cost/Math.max(1e-9,priceAt(state.time)):Infinity,btcMax=marketOpen?Math.max(0,Math.min(Math.floor(Math.max(0,Number(state.wallets.hot)||0)/unitBtc),capacityMax)):0,currency=buyWrap.querySelector("[data-hardware-currency]")?.value==="btc"?"btc":"usd",selectedQty=Number(buyWrap.querySelector("[data-hardware-qty]")?.value)||1;
      buyWrap.outerHTML=hardwareBuyControls(h,cost,fiatMax,btcMax,available,marketOpen,selectedQty,currency);
    }
    const fiatSells=[...card.querySelectorAll('[data-action="sell-hw"]')],btcSells=[...card.querySelectorAll('[data-action="sell-hw-btc"]')];
    if(fiatSells[0]){fiatSells[0].disabled=retired<1;fiatSells[0].textContent=`Sell 1 · ${fmtCompactUsd(resale)}`}
    if(fiatSells[1]){fiatSells[1].dataset.value=String(retired);fiatSells[1].disabled=retired<1;fiatSells[1].textContent=`Sell all · ${fmtCompactUsd(resale*retired)} (${fmtCompactNumber(retired)} miners)`}
    if(btcSells[0]){btcSells[0].disabled=!marketOpen||retired<1;btcSells[0].textContent=`Sell 1 · ${marketOpen?fmtCompactBtc(resale/priceAt(state.time)):"BTC unavailable"}`}
    if(btcSells[1]){btcSells[1].dataset.value=String(retired);btcSells[1].disabled=!marketOpen||retired<1;btcSells[1].textContent=`Sell all · ${marketOpen?fmtCompactBtc(resale*retired/priceAt(state.time)):"BTC unavailable"} (${fmtCompactNumber(retired)} miners)`}
  });
}
function refreshLive(){
  const fs=fleet(),mc=monthlyCost(),online=operating(),p=priceAt(state.time),set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value};
  const tickerBtc=value=>fmtBtc(value).replace(/ BTC$/,"");set("live-date",dateFmt(state.time));set("live-block",`BLOCK ~${fmtNum(approxHeight(state.time))}`);const xpNow=xpProgress();set("live-xp-level",`LV ${xpNow.level}`);set("live-xp-remaining",`${fmtNum(Math.ceil(xpNow.remaining))} XP to go`);set("live-xp-best",`Best share ${state.xp.bestDifficulty?fmtDifficulty(state.xp.bestDifficulty):"-"}`);const xpFill=document.getElementById("live-xp-fill");if(xpFill)xpFill.style.width=`${xpNow.percent.toFixed(1)}%`;set("live-fiat",fmtUsd(state.cash));set("live-illiquid-fiat",fmtUsd(equityValue()));set("live-controlled-btc",tickerBtc(controlled()));set("live-custodial-btc",tickerBtc(claims()));set("live-lightning-btc",tickerBtc(lightningLocked()));set("live-price",state.time<MARKET?"NO MARKET":fmtUsd(p));set("live-network-hash",fmtHash(competitiveHashAt(state.time,fs.hash)));set("live-difficulty",fmtDiff(difficultyAt(state.time)));set("live-subsidy",fmtSubsidy(subsidyAt(state.time)));set("live-fees",fmtBtc(feeAt(state.time)));set("live-your-hash",fmtHash(online?fs.hash:0));set("live-your-status",online?"online":`offline · ${fmtHash(fs.hash)} idle`);set("live-power",`${fs.kw.toFixed(2)} kW`);set("live-power-rate",`${fmtUsd(mc.rate)}/kWh`);set("live-transactions",fmtNum(txAt(state.time)));set("live-worth",fmtUsd(netWorth()));
  const hash=document.getElementById("live-your-hash");if(hash){hash.classList.toggle("green",online);hash.classList.toggle("red",!online)}const lightningTick=document.getElementById("live-lightning-btc");if(lightningTick)lightningTick.classList.toggle("dim",!lightningAvailable());refreshDashboard();refreshMarket();refreshSettlementForecast();refreshLearning();
}
