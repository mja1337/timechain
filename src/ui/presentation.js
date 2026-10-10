"use strict";

function eventStakePerspective(event){
  return EVENT_PRACTICAL_PERSPECTIVES[event.id]||"";
}
function eventReactionsHtml(event,compact=false){
  const reactions=EVENT_REACTIONS[event.id];if(!reactions)return "";
  const icons=['<path d="M4 12h15m-5-5 5 5-5 5M5 5v14"/>','<rect x="3" y="8" width="7" height="8" rx="2"/><rect x="14" y="8" width="7" height="8" rx="2"/><path d="M8 12h8"/>','<path d="M4 4h6c2 0 2 2 2 2s0-2 2-2h6v15h-6c-2 0-2 2-2 2s0-2-2-2H4zM12 6v15"/>'];
  const labels=['The opportunity','The dependency','Back at your operation'];
  const texts=[reactions[0],reactions[1],eventStakePerspective(event)];
  return `<div class="event-perspectives${compact?' event-perspectives-compact':''}" role="group" aria-label="Explore three perspectives">${texts.map((text,i)=>{const id=`perspective-${event.id}-${compact?'sidebar':'modal'}-${i}`;return `<div class="event-perspective"><button type="button" class="perspective-trigger" aria-label="${labels[i]}" aria-controls="${escapeHtml(id)}" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icons[i]}</svg></button><aside id="${escapeHtml(id)}" class="perspective-panel" popover="auto" aria-label="${labels[i]}"><b>${labels[i]}</b><p>${escapeHtml(text)}</p><small>Fictional perspective · ${i===2?'an illustrative situation, not an extra game effect':'a viewpoint, not historical testimony'}</small></aside></div>`}).join('')}</div>`;
}
/* Shared by the game and review pages. Native popovers escape scroll containers,
   dismiss with Escape/outside click, and remain readable while hovered. */
function installEventPerspectiveInteractions(root=document){
  let current=null,pinned=false,timer;
  const close=()=>{clearTimeout(timer);if(current){const panel=current.querySelector('.perspective-panel');if(panel.matches(':popover-open'))panel.hidePopover();current.querySelector('button').setAttribute('aria-expanded','false')}current=null;pinned=false};
  const show=item=>{if(current===item&&item.querySelector('.perspective-panel').matches(':popover-open'))return;close();current=item;const button=item.querySelector('button'),panel=item.querySelector('.perspective-panel');panel.showPopover();button.setAttribute('aria-expanded','true');const anchor=button.getBoundingClientRect(),box=panel.getBoundingClientRect(),gap=10;panel.style.left=`${Math.max(gap,Math.min(anchor.left,window.innerWidth-box.width-gap))}px`;panel.style.top=`${anchor.bottom+box.height+gap<=window.innerHeight?anchor.bottom+gap:Math.max(gap,anchor.top-box.height-gap)}px`};
  const leave=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(current&&!pinned&&!current.matches(':hover')&&!current.contains(document.activeElement))close()},140)};
  root.addEventListener('pointerover',e=>{const item=e.target.closest('.event-perspective');if(item){clearTimeout(timer);if(!pinned)show(item)}});
  root.addEventListener('pointerout',e=>{if(e.target.closest('.event-perspective'))leave()});
  root.addEventListener('focusin',e=>{const item=e.target.closest('.event-perspective');if(item)show(item)});
  root.addEventListener('focusout',e=>{if(e.target.closest('.event-perspective'))leave()});
  root.addEventListener('click',e=>{const button=e.target.closest('.perspective-trigger');if(!button)return;const item=button.closest('.event-perspective');if(current===item&&pinned)close();else{show(item);pinned=true}});
  root.addEventListener('toggle',e=>{if(e.target.matches('.perspective-panel')&&e.newState==='closed'){e.target.previousElementSibling.setAttribute('aria-expanded','false');if(current?.contains(e.target)){current=null;pinned=false}}},true);
  window.addEventListener('resize',close);
}
function conferenceSceneHtml(event){
  if(!event.conference)return "";
  const visit=event.conference;
  return `<section class="conference-scene"><div class="modal-kicker">${escapeHtml(visit.visit)}</div><h3>Your conference chapter</h3><p class="modal-note">Fictional player experience around a real event. Travel is narrative only.</p>${visit.scene.map(paragraph=>`<p>${escapeHtml(paragraph)}</p>`).join("")}<div class="story-source"><a href="${escapeHtml(event.url)}" target="_blank" rel="noopener">${escapeHtml(event.src)}</a>${(event.sources||[]).map(source=>` · <a href="${escapeHtml(source.url)}" target="_blank" rel="noopener">${escapeHtml(source.label)}</a>`).join("")}</div></section>`;
}

/* These are model assessments, not a description of who controls a balance. */
function custodyAssessmentLabel(tier){
  return {none:"Reserve setup incomplete",basic:"Recovery recorded",strong:"Model checks passed",audited:"Audit current"}[tier]||"Review setup";
}

/* PRESENTATION HELPERS. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function fmtUsd(n){n=Number(n);if(!Number.isFinite(n))return"-";const abs=Math.abs(n),sign=n<0?"-":"";if(abs===0)return"$0.00";if(abs<1e-8)return`${sign}<$0.00000001`;if(abs<.001)return`${sign}$${abs.toFixed(8).replace(/0+$/,"")}`;if(abs<1)return`${sign}$${abs.toFixed(abs<.01?6:4).replace(/0+$/,"").replace(/\.$/,"")}`;return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:abs<100?2:0}).format(n)}
function fmtBtc(n){n=Number(n);if(!Number.isFinite(n))return"-";const abs=Math.abs(n),sign=n<0?"-":"";if(abs===0)return"0 BTC";if(abs<1e-8)return`${sign}<0.00000001 BTC`;if(abs>=1000)return new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(n)+" BTC";if(abs>=1)return n.toFixed(4)+" BTC";return n.toFixed(8)+" BTC"}
function fmtCompactNumber(n){n=Number(n);if(!Number.isFinite(n))return"-";const abs=Math.abs(n),units=[[1e12,"t"],[1e9,"b"],[1e6,"m"],[1e3,"k"]],unit=units.find(([value])=>abs>=value);if(abs>0&&abs<.01)return new Intl.NumberFormat("en-US",{maximumSignificantDigits:3}).format(n);if(!unit)return new Intl.NumberFormat("en-US",{maximumFractionDigits:abs<10?2:abs<100?1:0}).format(n);const scaled=n/unit[0],digits=Math.abs(scaled)>=10?1:2;return scaled.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/,"$1")+unit[1]}
function fmtCompactUsd(n){return `${n<0?"-$":"$"}${fmtCompactNumber(Math.abs(n))}`}
function fmtCompactBtc(n){return Math.abs(n)<1000?fmtBtc(n):`${fmtCompactNumber(n)} BTC`}
/* The projected subsidy shrinks to a handful of satoshis late in the sandbox, where BTC notation stops being readable. */
function fmtSubsidy(btc){const sats=Math.round(Number(btc)*1e8);if(!Number.isFinite(sats)||sats<=0)return"0 BTC";return sats<100000?`${fmtNum(sats)} sat${sats===1?"":"s"}`:`${Number((sats/1e8).toFixed(8))} BTC`}
function fmtNum(n){return new Intl.NumberFormat("en-US",{notation:n>=1e6?"compact":"standard",maximumFractionDigits:2}).format(n)}
function fmtPct(n){if(!Number.isFinite(n))return"0.00%";if(n===0)return"0.00%";if(Math.abs(n)>=1)return n.toFixed(2)+"%";if(Math.abs(n)>=.01)return n.toFixed(4)+"%";if(Math.abs(n)>=.0001)return n.toFixed(6)+"%";return n.toFixed(8)+"%"}
function fmtHash(n){const u=[[1e21,"ZH/s"],[1e18,"EH/s"],[1e15,"PH/s"],[1e12,"TH/s"],[1e9,"GH/s"],[1e6,"MH/s"],[1e3,"kH/s"]];for(const [v,s] of u)if(n>=v)return(n/v).toFixed(n/v>=100?0:n/v>=10?1:2)+" "+s;return n.toFixed(0)+" H/s"}
function fmtJth(n){if(!Number.isFinite(n))return"-";return new Intl.NumberFormat("en-US",{maximumFractionDigits:n>=100?0:n>=10?1:2}).format(n)}
function fmtDiff(n){return n>=1e12?(n/1e12).toFixed(2)+" T":n>=1e9?(n/1e9).toFixed(2)+" B":n>=1e6?(n/1e6).toFixed(2)+" M":fmtNum(n)}
function dateFmt(t,short=false){return new Intl.DateTimeFormat("en-GB",short?{month:"short",year:"numeric"}:{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(t))}
function sourceTag(kind){return `<span class="source-tag ${kind}">${kind}</span>`}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]))}
function formatPercent(value){return Number(value).toFixed(1).replace(/\.0$/,"")}
function tradePercentage(key){return clamp(Number(tradePercentages[key]??25),1,100)}
function actionFraction(button){return button.dataset.percentId?tradePercentage(button.dataset.percentId)/100:clamp(Number(button.dataset.value)||0,0,1)}
function updateTradePercentage(key,value,source=null){
  if(value===""||!Number.isFinite(Number(value)))return;const pct=Math.round(clamp(Number(value),1,100)*10)/10,label=formatPercent(pct);tradePercentages[key]=pct;
  document.querySelectorAll(`[data-percent-input="${key}"]`).forEach(input=>{if(input!==source)input.value=String(pct)});document.querySelectorAll(`[data-percent-output="${key}"]`).forEach(output=>output.textContent=`${label}%`);document.querySelectorAll(`[data-percent-amount="${key}"]`).forEach(output=>{try{const amounts=JSON.parse(output.dataset.percentAmounts||"{}");output.textContent=`At ${label}%: `+Object.entries(amounts).map(([name,total])=>`${name} ${fmtBtc(Number(total)*pct/100)}`).join(" · ")}catch{}});document.querySelectorAll(`[data-percent-id="${key}"][data-percent-label]`).forEach(button=>button.textContent=`${button.dataset.percentLabel} ${label}%${button.dataset.percentSuffix||""}`);document.querySelectorAll(`[data-action="percent-snap"][data-id="${key}"]`).forEach(button=>button.classList.toggle("active",Number(button.dataset.value)===pct));
}
function percentageControl(key,help="Choose the share used by the action buttons below.",amounts={}){
  const pct=tradePercentage(key),label=formatPercent(pct),snaps=[1,25,50,100],amountText=Object.entries(amounts).map(([name,total])=>`${name} ${fmtBtc(Number(total)*pct/100)}`).join(" · ");
  return `<div class="percent-control" data-percent-control="${key}"><div class="percent-head"><span>Transaction size</span><output data-percent-output="${key}">${label}%</output></div><input class="range-input" type="range" min="1" max="100" step="1" value="${pct}" data-percent-input="${key}" aria-label="Transaction size for ${key}"><div class="percent-exact"><label>Exact %</label><input type="number" min="1" max="100" step="0.1" value="${pct}" data-percent-input="${key}" aria-label="Exact transaction percentage for ${key}"><div class="percent-snaps">${snaps.map(value=>`<button class="percent-snap ${pct===value?"active":""}" data-action="percent-snap" data-id="${key}" data-value="${value}">${value}%</button>`).join("")}</div></div><small class="percent-amount" data-percent-amount="${key}" data-percent-amounts="${escapeHtml(JSON.stringify(amounts))}">At ${label}%: ${amountText||"enter a balance to see the BTC amount"}</small><small class="percent-help">${help}</small></div>`
}
function hardwareProfitability(h){
  const fs=fleet(),owned=state.hardware[h.id]||0,qty=owned||1,reason=hardwareOfflineReason(h),asic=h.era==="ASIC"||h.era==="HYDRO ASIC";
  const unitHash=h.hash*hardwareLaunchFactor(h)*(hasSkill("asictune")&&asic?1.05:1)*(hasSkill("firmware")?1.04:1),unitWatts=h.w*(hasSkill("undervolt")?.95:1);
  const activeContribution=reason?0:unitHash*qty,fromHash=owned?Math.max(0,fs.hash-activeContribution):fs.hash,toHash=owned?fs.hash:fs.hash+activeContribution;
  const btcPerUnit=Math.max(0,expectedDailyBtcForHash(toHash)-expectedDailyBtcForHash(fromHash))/qty;
  const energyPerUnit=reason?0:dailyEnergyCostForWatts(unitWatts*contractLoadFactor()),marketOpen=state.time>=MARKET,grossPerUnit=marketOpen?btcPerUnit*priceAt(state.time):null,netPerUnit=grossPerUnit===null?null:grossPerUnit-energyPerUnit;
  const costPerBtc=btcPerUnit>0?energyPerUnit/btcPerUnit:null,paybackDays=netPerUnit>0?hardwareUnitCost(h)/netPerUnit:null,capacityOk=owned||siteRackHeadroom(h)>=1;
  let signal="Unpriced",signalClass="profit-neutral";
  if(reason){signal=reason;signalClass="profit-negative"}
  /* Not being able to rack it yet is no longer a reason you cannot buy it - the crates wait in
     storage and go in when there is room - so this reports a delay, not a refusal. */
  else if(!capacityOk){signal="Waits for site capacity";signalClass="profit-neutral"}
  else if(netPerUnit!==null&&netPerUnit<0){signal=owned?"Shutdown improves cash":"Loss-making";signalClass="profit-negative"}
  else if(netPerUnit!==null){signal=owned?"Keep hashing":"Positive margin";signalClass="profit-positive"}
  return{owned,qty,btcPerUnit,energyPerUnit,grossPerUnit,netPerUnit,costPerBtc,paybackDays,powerPct:fs.cap?unitWatts/1000/fs.cap*100:0,spacePct:facility().space?h.space/facility().space*100:0,signal,signalClass};
}
function profitPaybackLabel(days){if(!Number.isFinite(days))return"-";if(days<365)return `${Math.ceil(days)} days`;return `${(days/365).toFixed(1)} years`}
function profitabilityRowsHtml(){
  const visible=HARDWARE.filter(h=>(state.hardware[h.id]||0)>0||state.time>=at(h.date)).sort((a,b)=>((state.hardware[b.id]||0)>0)-((state.hardware[a.id]||0)>0)||at(b.date)-at(a.date));
  return visible.map(h=>{const p=hardwareProfitability(h),netClass=p.netPerUnit===null?"profit-neutral":p.netPerUnit>=0?"profit-positive":"profit-negative";return `<tr data-profit-id="${h.id}"><td class="profit-machine"><b>${h.name}</b><small>${p.owned?`${fmtCompactNumber(p.owned)} owned · marginal average per miner`:"Purchase candidate · one miner"}</small></td><td>${fmtBtc(p.btcPerUnit)}<small style="display:block;color:var(--dim)">${p.grossPerUnit===null?"No USD market":fmtUsd(p.grossPerUnit)}</small></td><td>${fmtUsd(p.energyPerUnit)}</td><td class="${netClass}">${p.netPerUnit===null?"Unpriced":fmtUsd(p.netPerUnit)}</td><td>${p.costPerBtc===null?"-":fmtUsd(p.costPerBtc)}</td><td>${profitPaybackLabel(p.paybackDays)}</td><td>${fmtJth(hardwareEfficiency(h))} J/TH</td><td>${fmtPct(p.powerPct)} power<small style="display:block;color:var(--dim)">${fmtPct(p.spacePct)} floor</small></td><td><span class="profit-signal ${p.signalClass}">${p.signal}</span></td></tr>`}).join("")
}
function profitabilityDeskHtml(){
  const fs=fleet(),btc=expectedDailyBtcForHash(fs.hash),marketOpen=state.time>=MARKET,gross=marketOpen?btc*priceAt(state.time):null,energyCost=dailyEnergyCostForWatts(fs.w*contractLoadFactor()),net=gross===null?null:gross-energyCost;
  const released=HARDWARE.filter(h=>state.time>=at(h.date)),best=released.reduce((winner,h)=>!winner||hardwareEfficiency(h)<hardwareEfficiency(winner)?h:winner,null),fleetEfficiency=fs.hash>0?fs.w/(fs.hash/1e12):Infinity;
  return `<section id="mine-profitability" class="card span-12"><div class="card-head"><h2>Does the fleet earn more than it costs to power?</h2><div class="meta">${operating()?"LIVE FLEET":"ONLINE POTENTIAL"} · MARGINAL MODEL · EXCLUDES FIXED OVERHEAD</div></div><p class="concept-caption">Mining margin = expected BTC revenue minus electricity. A positive margin helps pay the rest of the operating bill; rent, staff and finance still come out of it.</p><div class="profit-summary"><div><span class="label">Expected fleet output</span><b>${fmtBtc(btc)}</b><small>Average output, not a promised daily payout</small></div><div><span class="label">Gross revenue / day</span><b>${gross===null?"No USD market":fmtUsd(gross)}</b><small>${marketOpen?fmtUsd(priceAt(state.time))+" / BTC":"Coins are not yet priced"}</small></div><div><span class="label">Fleet energy / day</span><b>${fmtUsd(energyCost)}</b><small>${fmtUsd(powerRate(region()))}/kWh · contract load included</small></div><div><span class="label">After electricity / day</span><b class="${net===null?"profit-neutral":net>=0?"profit-positive":"profit-negative"}">${net===null?"Unpriced":fmtUsd(net)}</b><small>Before rent, staff, insurance and finance</small></div><div><span class="label">Fleet efficiency</span><b>${fmtJth(fleetEfficiency)} J/TH</b><small>Lower J/TH uses less energy for the same work</small></div><div><span class="label">Best available efficiency</span><b>${best?`${fmtJth(hardwareEfficiency(best))} J/TH`:"-"}</b><small>${best?best.name:"No hardware released yet"}</small></div></div><div class="profit-wrap"><table class="profit-table"><thead><tr><th>Miner</th><th>Revenue / day / miner</th><th>Energy / day</th><th>After electricity / day</th><th>Energy cost / BTC</th><th>Simple payback</th><th>Efficiency</th><th>Site use / miner</th><th>Operating signal</th></tr></thead><tbody>${profitabilityRowsHtml()}</tbody></table></div><details class="context-help"><summary>How to read this comparison</summary><div class="context-help-body"><dl><div><dt>Owned or new?</dt><dd>Owned rows show each hardware type's marginal contribution divided across that type. Candidate rows model adding one miner.</dd></div><div><dt>When should I stop a miner?</dt><dd>"Shutdown improves cash" compares mining revenue with avoidable electricity only; fixed site costs continue.</dd></div><div><dt>What does efficiency mean?</dt><dd>Efficiency (J/TH) is watts divided by physical TH/s - lower is better. Solo results are expected values, not guaranteed daily payouts.</dd></div></dl></div></details></section>`
}
function runBalanceBenchmarks(){return BALANCE_SCENARIOS.map(s=>{
  const t=at(s.date),f=FACILITIES.find(x=>x.id===s.facility),r=REGIONS.find(x=>x.id===s.region);let hash=0,watts=0,space=0,count=0;
  Object.entries(s.hardware).forEach(([id,qty])=>{const h=HARDWARE.find(x=>x.id===id);if(!h)return;hash+=h.hash*qty;watts+=h.w*qty;space+=h.space*qty;count+=qty});
  const share=playerNetworkShareAt(t,hash),btcDay=expectedBlocksPerDayForHash(hash,t)*(subsidyAt(t)+feeAt(t))*r.rely,marketOpen=t>=MARKET,grossYear=marketOpen?btcDay*priceAt(t)*365:0,energyMonth=watts/1000*24*30.4375*r.kwh,tier=Math.max(1,FACILITIES.findIndex(x=>x.id===f.id)+1),internet=(r.internet||75)*([1,1.5,4,15,55,150,300,600][tier-1]||1),monthly=energyMonth+f.rent+internet,runway=monthly?s.cash/monthly:Infinity,endCash=s.cash+grossYear-monthly*12,within=watts/1000<=f.kw&&space<=f.space,pass=Number.isFinite(share)&&share<=s.maxShare&&within&&runway>=3&&endCash>=0;
  return{...s,t,count,hash,share,btcDay,monthly,runway,endCash,within,pass}
})}
function runLaunchBenchmarks(){return HARDWARE.filter(h=>!h.permanent&&at(h.date)>=MARKET).map(h=>{const t=at(h.date)+DAY*90,effectiveHash=h.hash*(h.edge||1),btcDay=expectedBlocksPerDayForHash(effectiveHash,t)*(subsidyAt(t)+feeAt(t))*.995,gross=btcDay*priceAt(t),energy=h.w/1000*24*.12*energyShock(t),margin=gross-energy,paybackMonths=margin>0?h.cost/margin/30.4375:Infinity,pass=margin>0&&paybackMonths<=30;return{h,t,gross,energy,margin,paybackMonths,pass}})}
function launchBalanceHtml(){const rows=runLaunchBenchmarks(),passed=rows.filter(x=>x.pass).length;return `<h3 style="margin-top:22px">Hardware launch windows · ${passed} / ${rows.length} positive within 30 months</h3><div class="profit-wrap"><table class="profit-table"><thead><tr><th>Generation</th><th>Launch edge</th><th>Gross / day</th><th>Energy / day</th><th>Margin / day</th><th>Payback</th><th>Guard</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="profit-machine"><b>${x.h.name}</b><small>${dateFmt(x.t,true)} · 90-day launch snapshot</small></td><td>${(x.h.edge||1).toFixed(1)}×</td><td>${fmtUsd(x.gross)}</td><td>${fmtUsd(x.energy)}</td><td class="${x.margin>=0?"profit-positive":"profit-negative"}">${fmtUsd(x.margin)}</td><td>${profitPaybackLabel(x.paybackMonths*30.4375)}</td><td><span class="profit-signal ${x.pass?"profit-positive":"profit-negative"}">${x.pass?"Pass":"Review"}</span></td></tr>`).join("")}</tbody></table></div><p class="modal-note">Launch snapshots use one machine, North American power, the historical price/network path, the applicable energy shock and no skills. Selected generations receive a labelled one-to-two-year early-mover edge. Exceptional first-ASIC windfalls are allowed; the guard only rejects loss-making or slower-than-30-month launches.</p>`}
function balanceLabHtml(){const rows=runBalanceBenchmarks(),passed=rows.filter(x=>x.pass).length;return `<details class="card" style="margin-top:18px"><summary style="cursor:pointer;font:600 12px var(--mono);padding:16px;color:var(--orange2)">Era balance lab · ${passed} / ${rows.length} reference scenarios passing</summary><div class="card-pad"><p>These deterministic snapshots are regression guards, not suggested strategies. Each uses the named fleet at one historical date with no skills, pool fee, incidents or future-price knowledge. A pass requires facility fit, at least three months of starting cash runway, non-negative cash after one unchanged snapshot year, and network share below the era ceiling.</p><div class="profit-wrap"><table class="profit-table"><thead><tr><th>Scenario</th><th>Reference fleet</th><th>Network share</th><th>Expected BTC / day</th><th>Monthly burn</th><th>Cash runway</th><th>Year-end cash</th><th>Guard</th></tr></thead><tbody>${rows.map(x=>`<tr><td class="profit-machine"><b>${x.name}</b><small>${dateFmt(x.t,true)} · ${FACILITIES.find(f=>f.id===x.facility)?.name}</small></td><td>${fmtCompactNumber(x.count)} miners<small style="display:block;color:var(--dim)">${fmtHash(x.hash)}</small></td><td>${fmtPct(x.share*100)}</td><td>${fmtBtc(x.btcDay)}</td><td>${fmtUsd(x.monthly)}</td><td>${Number.isFinite(x.runway)?x.runway.toFixed(1)+" mo":"∞"}</td><td>${fmtUsd(x.endCash)}</td><td><span class="profit-signal ${x.pass?"profit-positive":"profit-negative"}">${x.pass?"Pass":"Review"}</span></td></tr>`).join("")}</tbody></table></div><p class="modal-note">The lab runs from stored offline anchors every time Method opens. It does not query an API or mutate the active save.</p>${launchBalanceHtml()}</div></details>`}
function chart(points,color="var(--orange)",log=true,overlay=null,opts={}){
  if(points.length<2)points=[points[0]??1,points[0]??1];
  const normalise=(arr)=>{const base=Math.max(1e-12,arr[0]??1);return arr.map(x=>x/base*100)};
  const mainRaw=points.map(x=>Math.max(log?1e-9:0,x));
  const overlayRaw=overlay?.points?.map(x=>Math.max(1e-9,x));
  const mainVals=normalise(mainRaw);
  const overlayVals=overlayRaw?normalise(overlayRaw):null;
  const all=overlayVals?[...mainVals,...overlayVals]:mainVals;
  const vals=all.map(x=>log?Math.log(x):x);
  const min=Math.min(...vals),max=Math.max(...vals),range=max-min||1,w=700,h=190,p=10,denom=Math.max(1,mainVals.length-1);
  const makePath=(arr)=>arr.map((v,i)=>{const vv=log?Math.log(v):v;return `${i?"L":"M"}${(p+i*(w-2*p)/denom).toFixed(1)},${(h-p-(vv-min)/range*(h-2*p)).toFixed(1)}`}).join(" ");
  const path=makePath(mainVals), overlayPath=overlayVals?makePath(overlayVals):null;
  const area=path+` L${w-p},${h-p} L${p},${h-p} Z`;
  /* The key sits above the plot so it can never run into the lines, and each swatch is drawn in
     its series' style: the filled main series as a line over a tint, the overlay as a dash. */
  const scale=log?"log scale":"linear scale";
  const legend=overlay?chartLegendHtml([
    {label:overlay.mainLabel||"BTC/USD",color,style:"area",value:chartMultipleLabel(mainRaw[0],mainRaw[mainRaw.length-1])},
    {label:overlay.label||"Network hash rate",color:overlay.color||"#86c79a",style:"dash",value:chartMultipleLabel(overlayRaw?.[0],overlayRaw?.[overlayRaw.length-1])}
  ],{note:`${scale} · change since start`,label:"Price and competition key"}):opts.label?chartLegendHtml([{label:opts.label,color,style:"area",value:opts.value}],{note:opts.note||scale,label:`${opts.label} key`}):"";
  const svg=`<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${overlay?"Historical line chart comparing BTC price and network hash rate":(opts.label||"Historical line chart")}"><line class="gridline" x1="0" y1="47" x2="700" y2="47"/><line class="gridline" x1="0" y1="95" x2="700" y2="95"/><line class="gridline" x1="0" y1="143" x2="700" y2="143"/><path class="area" d="${area}" fill="${color}"/><path class="line" d="${path}" stroke="${color}"/>${overlayPath?`<path class="line" d="${overlayPath}" stroke="${overlay.color||"#86c79a"}" stroke-dasharray="5 4"/>`:""}</svg>`;
  return legend+svg
}
function sampled(fn,count=null){
  const end=Math.max(START+DAY,state.time),days=Math.max(1,Math.ceil((end-START)/DAY));
  const safeCount=count??Math.min(900,Math.max(240,Math.ceil(days/7)+1)),arr=[];
  for(let i=0;i<safeCount;i++)arr.push(fn(START+(end-START)*i/(safeCount-1)));
  return arr
}
function donut(share){
  const size=148,stroke=20,r=(size-stroke)/2,cx=size/2,cy=size/2,c=2*Math.PI*r;
  const frac=Math.max(0,Math.min(1,share)),len=c*frac,pct=frac*100;
  const label=fmtPct(pct).replace("%","");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Your share of network hash rate"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1a2325" stroke-width="${stroke}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--orange)" stroke-width="${stroke}" stroke-dasharray="${len.toFixed(2)} ${(c-len).toFixed(2)}" stroke-linecap="butt" transform="rotate(-90 ${cx} ${cy})"/><text x="${cx}" y="${cy-2}" text-anchor="middle" class="donut-value">${label}%</text><text x="${cx}" y="${cy+15}" text-anchor="middle" class="donut-label">your share</text></svg>`
}
function btcBreakdown(){
  const rows=[["hot","Hot self-custody","Spendable · keys controlled","var(--orange)"],["cold","Cold / hardware","Keys controlled · slower","var(--green)"],["exchange","Regulated exchange","Custodial claim","var(--blue)"],["frontier","Frontier exchange","Higher counterparty risk","var(--red)"],["bitfinex","Bitfinex","Custodial hack exposure","var(--red)"],["quadriga","QuadrigaCX","High counterparty risk","var(--red)"],["mtgox","Mt. Gox","Historic counterparty","var(--red)"],["frozen","Frozen claims","Not spendable","#777"],["etf","ETF exposure","Price exposure only","#b9a4ce"]];
  const total=Math.max(.00000001,rows.reduce((a,[id])=>a+state.wallets[id],0));return rows.filter(([id])=>state.wallets[id]>0||id==="hot").map(([id,name,sub,color])=>`<div class="balance-row"><div class="balance-name">${name}<small>${sub}</small><div class="bar" style="--bar:${color};--w:${Math.max(1,state.wallets[id]/total*100)}%"><i></i></div></div><div class="balance-num">${fmtBtc(state.wallets[id])}<small>${fmtUsd(state.wallets[id]*priceAt(state.time))}</small></div></div>`).join("")
}
function dashboardMiningCopy(online,share){
  return online?`Your fleet contributes ${fmtPct(share)} of the work competing for rewards. Mining earns BTC; keeping the site running costs cash.`:"Mining is paused. Check the site constraint below; fixed costs can continue while machines are offline.";
}
function networkShareCard(){
  const fs=fleet(),competition=competitiveHashAt(state.time,fs.hash),share=playerNetworkShareAt(state.time,fs.hash);
  return `<section class="card span-4"><div class="card-head"><h2>Network share</h2><div class="meta">EFFECTIVE COMPETITION</div></div><div id="dashboard-network-share" class="card-pad donut-wrap">${donut(share)}${networkShareLegendHtml(fs.hash,competition)}<p class="modal-note">A larger share means more expected rewards, not a guaranteed payout. Competitors combine the recorded network baseline with a modelled response to your fleet.</p></div></section>`
}
function operatorScoreVisual(){
  const era=operatorEraAt(),stats=operatorEraStats(era),score=operatorScoreBreakdown(),months=Math.max(1,stats.months),eraScore=operatorEraScore(stats),ratios=[{label:"Bills paid",value:stats.solvent/months,weight:35},{label:"Profitable",value:stats.profitable/months,weight:30},{label:"Uptime",value:stats.uptime/months,weight:20},{label:"Competitive",value:stats.competitive/months,weight:15}];
  return `<section class="card span-12"><div class="card-head"><h2>Operator Score</h2><div class="meta">${operatorGrade(score.total).toUpperCase()} · ${score.total} / 1,000</div></div><div class="card-pad"><div class="metric-row"><div class="metric"><div class="label">Campaign score</div><strong style="color:var(--orange2)">${score.total}</strong><small>Operations dominate; passive holdings cannot carry the run</small></div><div class="metric"><div class="label">Current era</div><strong>${eraScore} / 100</strong><small>${era.name} · ${stats.months} scored months</small></div><div class="metric"><div class="label">Rescue record</div><strong>${state.operator.bridgeLoans} bridge · ${state.operator.restructures} receiver</strong><small>Three receiverships end the scored campaign</small></div><div class="metric"><div class="label">Bills paid from cash</div><strong>${state.operator.solventMonths} / ${state.operator.totalMonths}</strong><small>Selling BTC to meet a bill is a rescue, not a solvent month</small></div><div class="metric"><div class="label">Operator level</div><strong style="color:var(--orange)">LV ${state.xp.level}</strong><small>${score.mastery} / 60 mastery points · peak LV ${state.xp.peakLevel}</small></div><div class="metric"><div class="label">Best share found</div><strong>${state.xp.bestDifficulty?fmtDifficulty(state.xp.bestDifficulty):"-"}</strong><small>${fmtNum(Math.round(state.xp.shares))} ${shareUnitLabel()}</small></div></div><div class="xp-breakdown"><div class="xp-breakdown-head"><b>Experience · ${fmtNum(Math.round(state.xp.total))} XP lifetime</b><span>${fmtNum(Math.ceil(xpProgress().remaining))} XP to level ${state.xp.level+1}</span></div><div class="xp-track"><i style="width:${xpProgress().percent.toFixed(1)}%"></i></div><div class="xp-source-row">${[["shares","Shares found"],["record","Best-share records"],["deploy","Machines deployed"],["repair","Repairs completed"]].map(entry=>`<span>${entry[1]}<b>${fmtNum(Math.round(state.xp.sources[entry[0]]))}</b></span>`).join("")}</div></div><div class="venue-grid" style="margin-top:12px">${ratios.map(x=>`<article class="venue"><div class="risk ${x.value>=.75?"low":x.value>=.4?"medium":"high"}">${x.weight} ERA POINTS</div><h3>${x.label}</h3><div class="trade-value">${Math.round(x.value*100)}%</div><div class="bar" style="--w:${x.value*100}%;--bar:${x.value>=.75?"var(--green)":x.value>=.4?"var(--orange)":"var(--red)"}"><i></i></div></article>`).join("")}</div><p class="modal-note" style="margin-top:10px">Each historical era awards up to 100 points for solvency, realised mining profitability, uptime and a competitive fleet. Campaign bonuses reward milestones, custody, reserves and avoiding rescue finance.</p></div></section>`;
}
function settlementOutlookVisual(){
  const mined=state.operator.periodMined,marketOpen=state.time>=MARKET;
  const forecast=settlementForecast(),shortfall=Math.max(0,forecast.estimated-state.cash),reach=treasuryReach();
  return `<section class="card span-12"><div class="card-head"><h2>Settlement</h2><div class="meta">NOTHING IS SOLD FOR YOU</div></div><div class="card-pad"><p class="lead" style="margin-top:0">Mining pays you in BTC and the operating bill is due in cash. Nothing converts one into the other on your behalf: if cash does not cover the bill at settlement, time stops and you raise the money yourself. Selling BTC at the Market is the usual way.</p><div class="metric-row"><div class="metric"><div class="label">Production this month</div><strong>${fmtBtc(mined)}</strong><small>Mined since the last settlement</small></div><div class="metric"><div class="label">Forecast shortfall</div><strong>${marketOpen?fmtUsd(shortfall):"No market"}</strong><small>${shortfall>0?"Cash is short of the next bill by this much. Sell BTC at the Market before settlement, or the run will pause.":"Liquid cash already covers the next bill"}</small></div><div class="metric"><div class="label">Reserve in cold storage</div><strong>${reach.cold>0?fmtBtc(reach.cold):"None"}</strong><small>${reach.cold>0?(reach.coldTooSlow?`${reach.reachDays} day${reach.reachDays===1?"":"s"} away and the bill is due in ${reach.daysToBill}. Too slow: start fetching it now.`:`${reach.reachDays} day${reach.reachDays===1?"":"s"} to reach · ${fmtNum(reach.coins)} coin${reach.coins===1?"":"s"} to gather`):"Everything you hold can be sold today"}${reach.inFlight>0?` · ${fmtBtc(reach.inFlight)} on its way`:""}</small></div><div class="metric"><div class="label">Accrued bill</div><strong>${fmtUsd(state.bill)}</strong><small>Settlement pauses if cash cannot cover it</small></div><div class="metric"><div class="label">If you cannot pay</div><strong>Up to one month's grace</strong><small>Missing a bill carries it into arrears until the next bill date; after that power and internet are cut</small></div></div>${shortfall>0?`<div class="modal-actions" style="margin-top:12px"><button class="action small primary" data-action="tab" data-value="market">Go to the Market</button></div>`:""}</div></section>`;
}
let mempoolFrame=0;
function mempoolViz(){
  mempoolFrame++;
  const tip=approxHeight(state.time),txDay=txAt(state.time),perBlock=Math.max(.15,txDay/144),seed=(state.rng||1)+mempoolFrame*97.31;
  const rnd=i=>{const x=Math.sin(seed*.0001+i*12.9898)*43758.5453;return x-Math.floor(x)};
  const spread=perBlock<4?1.8:perBlock<40?1.1:perBlock<400?.55:.3,jitterAbs=Math.max(0,1.6-perBlock*.4);
  const blocks=[];for(let i=5;i>=0;i--){const h=Math.max(0,tip-i),variance=rnd(i*7+3)+rnd(i*13+11)-1,tx=Math.max(0,Math.round(perBlock+perBlock*spread*variance+jitterAbs*variance));blocks.push({h,tx})}
  const blocksHtml=blocks.map((b,i)=>`<div class="mp-block${i===blocks.length-1?" latest":""}"><span class="mp-block-h">#${fmtNum(b.h)}</span><span class="mp-block-tx">${fmtNum(b.tx)} tx</span></div>`).join(`<div class="mp-arrow">→</div>`);
  const TX_COUNT=Math.max(0,Math.min(300,txDay)),cells=[];for(let i=0;i<TX_COUNT;i++){const r=rnd(100+i),tier=r>.88?"hi":r>.55?"mid":"lo",sr=rnd(900+i),size=sr>.95?"sz3":sr>.8?"sz2":"";cells.push(`<span class="mp-cell ${tier} ${size}"></span>`)}
  const waitMin=(2+rnd(777)*8).toFixed(1);
  return `<div class="mempool-viz"><div class="mp-chain">${blocksHtml}</div><div class="mp-arrow big">→</div><div class="mp-next"><div class="mp-next-label"><span>Next block</span><b>~${waitMin} min</b></div><div class="mp-mosaic">${cells.join("")}</div>${chartLegendHtml([{label:"High fee",color:"var(--orange)",style:"block"},{label:"Medium fee",color:"#c98a3f",style:"block"},{label:"Low fee",color:"#3d4a44",style:"block"}],{note:`${fmtNum(txDay)} tx/day network-wide`,label:"Fee priority key",className:"chart-key-mempool"})}</div></div>`
}

/* How far off a date is, in the game's own time and in words a person would use: "in 9 days", "in 5 months", "in about 2 years". */
function unlockInText(date,t=state.time){
  const days=Math.max(1,Math.ceil((at(date)-t)/DAY));
  if(days<14)return `in ${days} day${days===1?"":"s"}`;
  if(days<60)return `in ${Math.round(days/7)} weeks`;
  if(days<730)return `in ${Math.round(days/30.4)} months`;
  const years=days/365.25,whole=Math.round(years*2)/2;
  return `in about ${Number.isInteger(whole)?whole:whole.toFixed(1)} years`;
}

/* Historical chapter impact copy shares the presentation helpers. */
function eventGameplayEffect(e){const effects={mtgox:"If you held BTC on Mt. Gox, 80% was lost and 20% became a frozen claim.",bitfinex:"If you held BTC on Bitfinex, the security loss removed 36% of that balance.",quadriga:"If you held BTC on QuadrigaCX, 80% was lost and 20% became a frozen claim.",ftx:"If you held BTC on the Frontier venue, 30% was lost and 70% became a frozen claim.",china:"A Sichuan operation is now prohibited and remains offline until relocated.",kazakh:"A Kazakhstan operation is offline during the modelled internet shutdown.",computenorthx:"Liquidated equipment lowers secondary-market miner prices by 15% for 120 days.",corescix:"Liquidated equipment lowers secondary-market miner prices by 22% for 180 days.",riotx:"A Texas operation pays 12% more for power for 90 days."},subsidy=/^halving/.test(e.id)?subsidyAt(at(e.date)):null,direct=subsidy?`Each block now pays a ${subsidy} BTC subsidy, down from ${subsidy*2} BTC. The same hash rate therefore earns less unless transaction fees compensate.`:effects[e.fx],point=e.imp===3?" This major chapter also awards 1 skill point.":"";return`${direct||"No balances, costs or operating rules change directly."}${point}`}
