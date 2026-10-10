"use strict";

function poolExplorerBody(t){
  const net=hashAt(t),rows=POOLS.filter(p=>p.id!=="solo"&&p.id!=="other"&&t>=at(p.date)).map(p=>({p,share:poolShareAt(p.id,t)})).filter(x=>x.share>.0005).sort((a,b)=>b.share-a.share),named=rows.reduce((sum,x)=>sum+x.share,0),other=Math.max(0,1-named),shares=[...rows.map(x=>x.share),other].filter(Boolean),hhi=shares.reduce((sum,x)=>sum+x*x,0),top=rows[0],concentration=!top?"No public pools":top.share>=.4?"Critical concentration":top.share>=.25?"High concentration":top.share>=.15?"Competitive field":"Diffuse network",selectedShare=state.mode==="pool"?poolShareAt(state.pool,t):0,colors=["#f0a92f","#86c79a","#79c8d3","#b9a4ce","#e78270","#d5b26e","#7aa6b8","#9385a5"];
  if(!rows.length)return `<div class="pool-era-empty"><b>No public mining pool exists yet.</b><span>Block discovery is entirely solo. Move the timeline forward to December 2010 to see pooled variance reduction emerge.</span></div>`;
  return `<div class="pool-era-summary"><div><span>Network hash rate</span><b>${fmtHash(net)}</b></div><div><span>Largest pool</span><b>${top.p.name} · ${(top.share*100).toFixed(1)}%</b></div><div><span>Concentration index</span><b>${Math.round(hhi*10000)} HHI</b></div><div><span>Readout</span><b class="${top.share>=.4?"profit-negative":top.share>=.25?"profit-neutral":"profit-positive"}">${concentration}</b></div></div><div class="pool-bars">${rows.map((x,i)=>`<div class="pool-bar-row ${state.mode==="pool"&&state.pool===x.p.id?"selected":""}"><span>${x.p.name}</span><div><i style="--pool-width:${Math.min(100,x.share*100)}%;--pool-color:${colors[i%colors.length]}"></i></div><b>${(x.share*100).toFixed(1)}%</b><small>${fmtHash(net*x.share)} · ~${(144*x.share).toFixed(1)} blocks/day</small></div>`).join("")}<div class="pool-bar-row other"><span>Other / solo</span><div><i style="--pool-width:${Math.min(100,other*100)}%;--pool-color:#40504d"></i></div><b>${(other*100).toFixed(1)}%</b><small>${fmtHash(net*other)} estimated</small></div></div><div class="pool-era-foot"><span>Your current method at this date: <b>${state.mode==="solo"?"Solo":`${poolData().name} · ${(selectedShare*100).toFixed(1)}% of blocks`}</b></span><span>HHI rises as hash becomes concentrated in fewer pools.</span></div>`
}
function poolHistoryExplorer(){
  const min=START,max=Math.max(START+DAY,state.time);return `<section class="card span-12 pool-explorer"><div class="card-head"><h2>Explore the hash market</h2><div class="meta">DRAG THROUGH POOL HISTORY</div></div><div class="card-pad"><div class="pool-time-control"><div><span>Historical snapshot</span><output id="pool-history-date">${dateFmt(state.time,true)}</output></div><input type="range" min="${min}" max="${max}" step="${DAY*30}" value="${state.time}" data-pool-history aria-label="Explore mining pool history"><div><span>${dateFmt(min,true)}</span><span>${dateFmt(max,true)}</span></div></div><div id="pool-explorer-body">${poolExplorerBody(state.time)}</div><p class="modal-note">This explorer is read-only: it lets you inspect historical pool share and estimated hash without moving the game clock. Shares are smoothed between stored anchors; block counts are share × the 144-block daily target.</p></div></section>`
}
function updatePoolExplorer(t){const clamped=Math.max(START,Math.min(state.time,Number(t)||state.time)),output=document.getElementById("pool-history-date"),body=document.getElementById("pool-explorer-body");if(output)output.textContent=dateFmt(clamped,true);if(body)body.innerHTML=poolExplorerBody(clamped)}
function rivalStatus(r,t){
  if(t<at(r.date))return"Not yet formed";
  if(r.exitEvent&&state.seen.includes(r.exitEvent))return"Wound down";
  const share=rivalShareAt(r.id,t),earlier=rivalShareAt(r.id,t-DAY*180);
  if(share>earlier*1.05)return"Rising";
  if(share<earlier*.95)return"Struggling";
  return share<=.01?"Marginal":"Established";
}
function poolCommandKpis(){
  const pooled=state.mode==="pool",p=pooled?poolData():null,a=poolAccount(),fs=fleet(),gross=pooled&&poolFee()<1?expectedDay()/Math.max(.0001,1-poolFee()):expectedDay(),feeDrag=Math.max(0,gross-expectedDay()),share=pooled?poolShareAt(state.pool,state.time):0,days=pooled&&expectedDay()>0?Math.max(0,Math.ceil((a.threshold-a.balance)/expectedDay())):null,exposure=pooled?(a.frozen>0?"Stranded":a.balance>=a.threshold?"Ready to pay":"With pool") :"None",risk=pooled?(a.frozen>0?"Critical":a.balance>=a.threshold?"Ready":a.balance>0?"Open claim":"Low") :"None";
  return `<section class="card span-12 pool-command-kpis"><div class="card-head"><div><div class="hero-kicker">Pool command</div><h2>Know what the payout method is doing.</h2></div><div class="meta">${pooled?`${p.name.toUpperCase()} · LIVE POSITION`:`SOLO · NO COUNTERPARTY`}</div></div><div class="pool-kpi-grid"><div class="pool-kpi"><span>Expected net / day</span><strong>${fmtBtc(expectedDay())}</strong><small>${operating()?"After pool fee and uptime":"Fleet not currently earning"}</small></div><div class="pool-kpi"><span>Your pool share</span><strong>${pooled?`${(share*100).toFixed(3)}%`:"—"}</strong><small>${pooled?`${fmtHash(fs.hash*share)} implied pool hash`:`Solo has no pool share`}</small></div><div class="pool-kpi"><span>Fee drag</span><strong>${pooled?fmtBtc(feeDrag):"0 BTC"}</strong><small>${pooled?`${(poolFee()*100).toFixed(2)}% · about ${fmtBtc(feeDrag*30.4375)}/30d`:"No pool fee"}</small></div><div class="pool-kpi"><span>Pool balance</span><strong>${pooled?fmtBtc(a.balance):"Paid direct"}</strong><small>${pooled?(days===null?(a.balance>=a.threshold?"Threshold reached":"Payout timing depends on more shares"):days===0?"Payout is due":"About "+fmtNum(days)+" days to threshold"):"Coinbase pays your address"}</small></div><div class="pool-kpi"><span>Counterparty exposure</span><strong class="${risk==="Critical"?"bad":risk==="With pool"?"warn":"good"}">${exposure}</strong><small>${pooled?(a.frozen>0?"The pool has stopped paying":"Unpaid balance is an unsecured claim"):`No pool holds an unpaid balance`}</small></div></div><p class="modal-note pool-kpi-note">The useful comparison is not only “which pool has the lowest fee”. It is expected BTC after fees, how quickly the balance clears your threshold, and how much income is sitting under somebody else’s keys.</p></section>`;
}
function rivalLandscapeCard(){
  const t=state.time,live=RIVAL_OPERATORS.filter(r=>t>=at(r.date));
  if(!live.length)return `<section class="card span-12"><div class="card-head"><h2>Mining industry landscape</h2><div class="meta">MODELLED · ILLUSTRATIVE</div></div><div class="card-pad"><p class="modal-note">No named rival mining operator has formed yet this early in the timeline.</p></div></section>`;
  const colors=["#f0a92f","#86c79a","#79c8d3","#b99a74","#b9a4ce","#e78270"],rows=live.map((r,i)=>({r,share:rivalShareAt(r.id,t),color:colors[i%colors.length],status:rivalStatus(r,t)})).sort((a,b)=>b.share-a.share);
  const shown=rows.filter(x=>x.share>.001),named=shown.reduce((sum,x)=>sum+x.share,0),segments=[...shown.map(x=>({name:x.r.name,share:x.share,color:x.color})),{name:"Smaller and unnamed operators",share:Math.max(0,1-named),color:"#344344"}].filter(x=>x.share>.001);
  let angle=-90;const polar=a=>({x:110+94*Math.cos(a*Math.PI/180),y:110+94*Math.sin(a*Math.PI/180)}),slices=segments.map(segment=>{const start=angle,end=angle+segment.share*360,from=polar(start),to=polar(end),large=end-start>180?1:0;angle=end;return `<path d="M110 110 L${from.x.toFixed(2)} ${from.y.toFixed(2)} A94 94 0 ${large} 1 ${to.x.toFixed(2)} ${to.y.toFixed(2)} Z" fill="${segment.color}" stroke="#0b1011" stroke-width="2"/>`}).join(""),legend=segments.map(segment=>`<div class="pool-legend-row"><i style="background:${segment.color}"></i><span><b>${segment.name} · ${(segment.share*100).toFixed(1)}%</b></span></div>`).join("");
  const list=rows.map(x=>`<div class="rival-row"><div><b>${x.r.name}</b><span class="rival-status">${x.status}</span></div><p>${x.r.blurb}</p></div>`).join("");
  return `<section class="card span-12"><div class="card-head"><h2>Mining industry landscape</h2><div class="meta">MODELLED · ILLUSTRATIVE, NOT A MINING-ODDS INPUT</div></div><div class="card-pad"><div class="pool-concentration"><svg class="pool-pie" viewBox="0 0 220 220" role="img" aria-label="Illustrative rival mining-operator landscape">${slices}<circle cx="110" cy="110" r="52" fill="#101718" stroke="#263033"/><text x="110" y="105" text-anchor="middle" fill="#e6eee9" font-size="13" font-family="ui-monospace,monospace">RIVALS</text><text x="110" y="122" text-anchor="middle" fill="#9ba8a3" font-size="9" font-family="ui-monospace,monospace">EST. PRESENCE</text></svg><div class="pool-legend">${legend}</div></div><div class="rival-list">${list}</div><p class="modal-note">These shares are illustrative colour for the industry around you and never feed the network-hash or mining-odds figures used elsewhere in this game.</p></div></section>`;
}
function pools(){
  const selected=state.mode==="pool"?poolData():null,fs=fleet(),eligible=POOLS.filter(p=>p.id!=="solo"&&p.id!=="other"&&state.time>=at(p.date)&&!poolClosed(p.id)&&poolEligible(p));
  const expected=operating()?expectedDay():0,fee=selected?poolFee():0,netReward=expected;
  return `<div class="grid">${poolCommandKpis()}
    <section class="card span-12"><div class="hero"><div><div class="hero-kicker">Reward timing</div><h1>${selected?selected.name:"Solo mining"}</h1><p>Solo mining pays the whole reward when your fleet finds a block, but a small fleet may wait a long time. A pool combines many miners' work to provide smaller, steadier payouts after its fee.</p></div><div class="hero-stat"><strong>${fmtBtc(netReward)}</strong><span>expected net BTC / day</span></div></div><div class="metric-row"><div class="metric"><div class="label">Mining method</div><strong>${state.mode==="solo"?"Solo":"Pool"}</strong><small>${state.mode==="solo"?"Irregular rewards · no fee":"Smaller, steadier payouts"}</small></div><div class="metric"><div class="label">Selected fee</div><strong>${(fee*100).toFixed(2)}%</strong><small>${selected?`${POOL_SCHEMES[poolScheme()].name} · ${selected.name}`:"No pool fee"}</small></div><div class="metric"><div class="label">How rewards are calculated</div><strong>${selected?POOL_SCHEMES[poolScheme()].name:"Solo"}</strong><small>${selected?POOL_SCHEMES[poolScheme()].label:"Whole blocks or nothing"}</small></div><div class="metric"><div class="label">Pools you can join</div><strong>${eligible.length}</strong><small>Available to this operation now</small></div><div class="metric"><div class="label">Your physical hash</div><strong>${fmtHash(fs.hash)}</strong><small>Unchanged by payout method</small></div></div></section>
    ${poolHistoryExplorer()}
    <section class="card span-12"><div class="card-head"><h2>Choose payout method</h2><div class="meta">SOLO OR ONE ACTIVE POOL</div></div><div class="card-pad pool-method-grid"><article class="venue ${state.mode==="solo"?"active":""}"><div class="risk high">HIGH VARIANCE · 0% FEE</div><h3>Solo mining</h3><p>Keep the full reward when your fleet finds a block, but accept potentially long dry spells.</p><button class="action small ${state.mode==="solo"?"":"primary"}" data-action="mode" data-value="solo" ${state.mode==="solo"?"disabled":""}>${state.mode==="solo"?"Current method":"Switch to solo"}</button></article>${eligible.map(p=>`<article class="venue ${state.mode==="pool"&&state.pool===p.id?"active":""}">${(()=>{const terms=poolTermsAt(p.id,state.time),sc=POOL_SCHEMES[terms.scheme]||POOL_SCHEMES.fpps,eff=poolFeeAt(p.id,state.time),rows=p.schemes||[],prior=rows.filter(r=>at(r[0])<=state.time),moved=prior.length>1?prior[prior.length-1]:null,earlier=prior.length>1?prior[prior.length-2]:null;
      return `<div class="risk ${eff<=.005?"low":eff>=.03?"high":"medium"}">${sc.name} · ${(eff*100).toFixed(2)}% EFFECTIVE FEE</div><h3>${p.name}</h3><p>${sc.desc}</p><div class="trade-sub">${terms.scheme==="pps"?"Transaction fees stay with the pool":"Transaction fees passed through"} · ${["pplns","tides","score","prop"].includes(terms.scheme)?"variance carried by you":terms.scheme==="ppsplus"?"slight variance on fees only":"variance absorbed by the pool"}${moved&&earlier?` · moved from ${(POOL_SCHEMES[earlier[1]]||{}).name||earlier[1]} in ${new Date(at(moved[0])).getUTCFullYear()}`:""}</div>`})()}<button class="action small ${state.mode==="pool"&&state.pool===p.id?"":"primary"}" data-action="pool" data-value="${p.id}" ${state.mode==="pool"&&state.pool===p.id?"disabled":""}>${state.mode==="pool"&&state.pool===p.id?"Current pool":"Mine with this pool"}</button></article>`).join("")}</div></section>
    ${payoutCustodyCard()}
    ${poolDashboard()}
    ${rivalLandscapeCard()}
    ${networkShareCard()}
  </div>`
}

/* WHERE THE COINS GO, on the tab where the coins are earned.

   This card exists on Pools rather than in Custody deliberately. The custody decision a miner
   cannot avoid is the payout address, and they meet it here, on the day they choose a pool -
   not in a tab they may never open. Everything it says is true of real pool mining and none of
   it is decoration: the balance is a debt, the threshold is a trade, and the destination
   decides who is holding your income while you sleep. */
function payoutCustodyCard(){
  const a=poolAccount(),dest=payoutDestination(),fee=payoutNetworkFee();
  const pooled=state.mode==="pool";
  const price=state.time>=MARKET?priceAt(state.time):0;
  const daily=operating()?expectedDay():0;
  /* An estimate is only worth showing while it means something. A fleet that is stopped, or
     hashing at a rate that would take nine hundred years to clear the threshold, needs to be
     told that rather than shown a number with eight digits in it. */
  const rawDays=pooled&&daily>0?Math.ceil((a.threshold-a.balance)/daily):Infinity;
  const daysToPayout=Number.isFinite(rawDays)&&rawDays<=3650?Math.max(0,rawDays):null;
  const payoutOutOfReach=pooled&&a.balance<a.threshold&&daysToPayout===null;
  const feeShare=a.threshold>0?fee/a.threshold:0;
  const destinations=payoutDestinations();
  return `<section class="card span-12 payout-card"><div class="card-head"><h2>Where your mining income arrives</h2><div class="meta">${pooled?"POOL BALANCE · NOT YET YOURS":"SOLO · PAID DIRECT TO YOUR ADDRESS"}</div></div>
    <div class="card-pad">
      <p class="lead">${pooled
        ? `Pool mining credits an account <em>at the pool</em>. ${poolData().name} holds those coins in its own wallet under its own keys, and sends them on when your balance crosses your payout threshold. Until it does, you are an unsecured creditor of a company you have never met.`
        : `Solo mining pays the coinbase output of any block you find straight to an address you control. No threshold, no withdrawal fee, and nobody who can decide not to pay you - which is the half of the solo trade-off that the variance usually hides.`}</p>
      <div class="intro-grid">
        <div class="intro-fact"><b class="${a.balance>0?"down":""}">${fmtBtc(a.balance)}</b><span>${pooled?"held by the pool right now":"never held by a pool"}</span></div>
        <div class="intro-fact"><b>${fmtBtc(a.threshold)}</b><span>payout threshold${daysToPayout!==null?` · about ${fmtNum(daysToPayout)}d away`:payoutOutOfReach?" · out of reach at this hash rate":""}</span></div>
        <div class="intro-fact"><b>${fmtBtc(a.paidTotal)}</b><span>paid out over ${fmtNum(a.payouts)} payment${a.payouts===1?"":"s"}</span></div>
        <div class="intro-fact"><b>${fmtBtc(a.feesPaid)}</b><span>spent on withdrawal fees</span></div>
      </div>
      ${payoutOutOfReach?`<p class="modal-note" style="color:var(--orange2)">At the current hash rate this balance will not reach ${fmtBtc(a.threshold)} in any reasonable time, so it stays with the pool indefinitely. A lower threshold would pay it out - and would spend ${fmtBtc(fee)} of it doing so.</p>`:""}
      ${a.frozen>0?`<p class="modal-note" style="color:var(--red)">${fmtBtc(a.frozen)} is stranded in a pool that stopped paying. It is a claim, not a balance.</p>`:""}
      <div class="card-head"><h3>Payout threshold</h3><div class="meta">COST AGAINST COUNTERPARTY EXPOSURE</div></div>
      <p class="modal-note">Every payout is an on-chain transaction and costs ${fmtBtc(fee)}${price?` (about ${fmtUsd(fee*price)})`:""}. A low threshold pays you often and spends that fee often - at ${fmtBtc(a.threshold)} it is <strong>${(feeShare*100).toFixed(2)}%</strong> of each payment. A high threshold saves the fee and lends the pool more of your money for longer. There is no right answer; there is a side to pick.</p>
      <div class="payout-thresholds">${PAYOUT_THRESHOLDS.map(v=>`<button class="action small ${v===a.threshold?"primary":""}" data-action="payout-threshold" data-value="${v}" ${v===a.threshold?"disabled":""}>${fmtBtc(v)}<small>${((fee/v)*100).toFixed(2)}% to fees</small></button>`).join("")}</div>
      <div class="card-head"><h3>Payout destination</h3><div class="meta">THE ONE CUSTODY DECISION A MINER CANNOT AVOID</div></div>
      <div class="payout-destinations">${destinations.map(d=>{
        const blocked=payoutDestinationBlockReason(d.id),active=d.id===a.destination;
        return `<article class="payout-destination ${active?"active":""} ${d.kind==="venue"?"custodial":"self"} ${blocked?"locked":""}">
          <div class="risk ${d.kind==="venue"?"high":d.id==="cold"?"low":"medium"}">${d.kind==="venue"?"SOMEBODY ELSE HOLDS IT":d.id==="cold"?"YOUR KEYS · OFFLINE":"YOUR KEYS · ONLINE"}</div>
          <h4>${d.name}</h4><p>${d.summary}</p><small>${d.teaches}</small>
          <button class="action small ${active?"":"primary"}" data-action="payout-destination" data-value="${d.id}" ${active||blocked?"disabled":""} ${blocked?`title="${escapeHtml(blocked)}"`:""}>${active?"Income arrives here":"Send income here"}</button>
        </article>`}).join("")}</div>
      <p class="modal-note">${dest.kind==="venue"
        ? `Your income is currently paid to ${dest.name}, which means it is ready to sell and it is not yours. If that venue fails, it takes the balance and the income stream with it.`
        : dest.id==="cold"
        ? "Your income is currently paid into cold storage. It is as safe as your backups are, and it cannot pay a bill this afternoon without a transfer first."
        : "Your income is currently paid into your hot wallet: spendable immediately, and held by a key that is online to sign."}</p>${typeof payoutReserveNote==="function"?payoutReserveNote():""}
    </div></section>`;
}
