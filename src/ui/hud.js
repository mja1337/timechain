"use strict";

/* KEY-NUMBERS BAR. Adapts James Browning's header HUD (catch-21/ux): five readings
   instead of the 16-cell ticker, with Stats and Decisions as pop-outs. The shutdown
   switch is not in this bar. Arming a stop is interface state only (powerStopArmedUntil);
   it is not saved and it does not add an engine entry. */

let hudPop=null,hudFocusOnOpen=false,hudReturnFocus=null;
let powerStopArmedUntil=0,powerStopTimer=0;

function hudToggle(which){
  if(hudPop===which){hudReturnFocus=which;hudPop=null;hudFocusOnOpen=false}
  else{hudPop=which;hudFocusOnOpen=true;hudReturnFocus=null}
  render();
}
function requestSitePowerToggle(){
  if(state.debt||state.policyLock)return;
  if(state.power&&Date.now()>powerStopArmedUntil){
    powerStopArmedUntil=Date.now()+4000;
    clearTimeout(powerStopTimer);
    powerStopTimer=setTimeout(()=>{powerStopArmedUntil=0;render()},4100);
    render();
    return;
  }
  powerStopArmedUntil=0;clearTimeout(powerStopTimer);
  toggleSitePower();
}
function sitePowerButtonHtml(opts={}){
  const armed=!!state.power&&Date.now()<powerStopArmedUntil,floor=opts.place==="floor";
  const label=armed?"Confirm stop":state.power?(floor?"Emergency stop all":"Shut miners down"):(floor?"Start site power":"Start miners");
  const title=state.debt?"Grid arrears must be paid before power can be toggled.":state.policyLock||(armed?"Press again to stop every machine. One press arms the stop; a second press within 4 seconds confirms it.":state.power?"Stops every machine at once. Press once to arm, then again within 4 seconds to confirm. Rent, internet, staff and insurance still fall due. The site stays stopped until you start it.":"Starts every machine that is not switched off on its own.");
  return `<button class="action${opts.small===false?"":" small"} ${state.power?"danger":"primary"}" data-action="toggle-power" ${state.debt||state.policyLock?"disabled":""} title="${escapeHtml(title)}">${label}</button>`;
}
function hudStat(label,value,sub){
  return `<div class="hud-stat"><div class="label">${label}</div>${value}${sub?`<div class="hud-sub">${sub}</div>`:""}</div>`;
}
function hudMarkup(){
  const fs=fleet(),mc=monthlyCost(),online=operating(),p=priceAt(state.time),forecast=settlementForecast(),runway=mc.total?state.cash/mc.total:Infinity;
  const tickerBtc=value=>fmtBtc(value).replace(/ BTC$/,"");
  const exp=online?expectedDay():0,billTone=forecast.cashAfter<0?"red":forecast.cashAfter<forecast.estimated*.2?"orange":"",runTone=runway<2?"red":runway<6?"orange":"green";
  const mirror=(id,cls,text)=>`<div class="hud-value ${cls}" data-mirror="${id}">${text}</div>`;
  const owned=(id,cls,text)=>`<div id="${id}" class="hud-value ${cls}">${text}</div>`;
  const stats=[
    hudStat("Self-held BTC",mirror("live-controlled-btc","green",tickerBtc(controlled())),"Your keys can spend it · BTC"),
    hudStat("Your hash rate",`${mirror("live-your-hash",online?"green":"red",fmtHash(online?fs.hash:0))}<div class="hud-sub" data-mirror="live-your-status">${online?"online":`offline · ${fmtHash(fs.hash)} idle`}</div>`,"") ,
    hudStat("Cash available",owned("live-fiat","green",fmtUsd(state.cash)),"Pays your operating bills"),
    hudStat("Investments",owned("live-illiquid-fiat","",fmtUsd(equityValue())),"ETF + Strategy shares"),
    hudStat("Custodial BTC",owned("live-custodial-btc","orange",tickerBtc(claims())),"A company holds the keys · BTC"),
    hudStat("Lightning locked",owned("live-lightning-btc",lightningAvailable()?"":"dim",tickerBtc(lightningLocked())),lightningAvailable()?"Set aside for fast payments":"Unlocks 15 Mar 2018"),
    hudStat("Net worth",owned("live-worth","",fmtUsd(netWorth())),"Assets less liabilities"),
    hudStat("Power draw",`${owned("live-power","",`${fs.kw.toFixed(2)} kW`)}<div id="live-power-rate" class="hud-sub">${fmtUsd(mc.rate)}/kWh</div>`,""),
    hudStat("Next bill",`${mirror("live-next-bill",billTone,fmtUsd(forecast.estimated))}<div class="hud-sub" data-mirror="live-next-bill-detail">Due ${dateFmt(forecast.dueAt,true)} · ${fmtUsd(forecast.cashAfter)} after</div>`,""),
    hudStat("Cash runway",`${mirror("live-runway",runTone,Number.isFinite(runway)?`${runway.toFixed(1)} mo`:"∞")}<div class="hud-sub" data-mirror="live-runway-detail">${fmtUsd(mc.total)}/month at current burn</div>`,""),
    hudStat("BTC / USD",owned("live-price","orange",state.time<MARKET?"NO MARKET":fmtUsd(p)),"recorded daily composite"),
    `<div class="hud-stat"><div class="label">Network hash rate</div><div id="live-network-hash" class="hud-value">${fmtHash(competitiveHashAt(state.time,fs.hash))}</div><div class="subvalue">Everyone's combined mining work each second</div></div>`,
    hudStat("Difficulty",owned("live-difficulty","",fmtDiff(difficultyAt(state.time))),"How hard it is to find the next block · holds until the next retarget"),
    hudStat("New BTC / block",owned("live-subsidy","",fmtSubsidy(subsidyAt(state.time))),"New bitcoin paid to the winning miner"),
    hudStat("Fees / block",owned("live-fees","",fmtBtc(feeAt(state.time))),"Fees paid by users in a block · 7-day mean"),
    hudStat("Transactions",owned("live-transactions","",fmtNum(txAt(state.time))),"Payments in a block · 7-day mean")
  ].join("");
  return `<div class="hud" aria-label="Operation status">
    <div class="hud-data">
      <div class="hud-item hud-primary"><span class="hud-label">Next bill</span><strong id="live-next-bill" class="hud-value ${billTone}">${fmtUsd(forecast.estimated)}</strong><small id="live-next-bill-detail" class="hud-sub">Due ${dateFmt(forecast.dueAt,true)} · ${fmtUsd(forecast.cashAfter)} after</small></div>
      <div class="hud-item hud-primary"><span class="hud-label">Cash runway</span><strong id="live-runway" class="hud-value ${runTone}">${Number.isFinite(runway)?`${runway.toFixed(1)} mo`:"∞"}</strong><small id="live-runway-detail" class="hud-sub">${fmtUsd(mc.total)}/month at current burn</small></div>
      <div class="hud-item hud-primary"><span class="hud-label">BTC/day</span><strong id="live-hud-yield" class="hud-value green">${fmtBtc(exp)}</strong><small id="live-hud-yield-state" class="hud-sub">${online?"mining":"offline"}</small></div>
      <div class="hud-item hud-extra"><span class="hud-label">Self-held BTC</span><strong id="live-controlled-btc" class="hud-value green">${tickerBtc(controlled())}</strong><small class="hud-sub">your keys</small></div>
      <div class="hud-item hud-extra"><span class="hud-label">Hash rate</span><strong id="live-your-hash" class="hud-value ${online?"green":"red"}">${fmtHash(online?fs.hash:0)}</strong><small id="live-your-status" class="hud-sub">${online?"online":`offline · ${fmtHash(fs.hash)} idle`}</small></div>
    </div>
    <div class="hud-controls">${state.power?"":`<span class="hud-chip hud-stopped">Stopped</span>`}<button type="button" class="action small hud-pop-btn" data-action="hud-stats" aria-expanded="${hudPop==="stats"?"true":"false"}" aria-controls="hud-stats-pop">Stats</button><button type="button" class="action small hud-pop-btn" data-action="hud-decisions" aria-expanded="${hudPop==="decisions"?"true":"false"}" aria-controls="hud-decisions-pop">Decisions</button></div>
  </div>
  <div class="hud-pop" id="hud-stats-pop" role="region" aria-label="Stats"${hudPop==="stats"?"":" hidden"}><h2 class="hud-pop-title" tabindex="-1">Stats</h2><div class="hud-stats-grid">${stats}</div></div>
  <div class="hud-pop" id="hud-decisions-pop" role="region" aria-label="Decisions"${hudPop==="decisions"?"":" hidden"}><h2 class="hud-pop-title" tabindex="-1">Decisions</h2>${hudPop==="decisions"&&typeof dashboardCommandCentre==="function"?dashboardCommandCentre():""}</div>`;
}
function hudAfterRender(){
  document.querySelectorAll(".hud-pop-btn").forEach(b=>b.setAttribute("aria-expanded",hudPop&&b.dataset.action===`hud-${hudPop}`?"true":"false"));
  if(hudFocusOnOpen&&hudPop){
    hudFocusOnOpen=false;
    const title=document.querySelector(".hud-pop:not([hidden]) .hud-pop-title");
    if(title)title.focus({preventScroll:true});
  }else if(hudReturnFocus){
    const which=hudReturnFocus;hudReturnFocus=null;
    const opener=document.querySelector(`[data-action="hud-${which}"]`);
    if(opener)opener.focus({preventScroll:true});
  }
}
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape"||!hudPop)return;
  if(e.target&&/input|textarea|select/i.test(e.target.tagName))return;
  if(document.querySelector(".modal-backdrop"))return;
  e.preventDefault();e.stopImmediatePropagation();
  hudReturnFocus=hudPop;hudPop=null;hudFocusOnOpen=false;render();
},true);
