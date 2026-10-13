"use strict";

/* Custody education card: Shamir shares, DIY drill, Casa/Unchained-shaped arrangements. */

function custodyEducationCard(){
  const arr=typeof activeArrangement==="function"?activeArrangement():{id:"diy",name:"Do it yourself"};
  const owed=typeof companyFeeOwed==="function"?companyFeeOwed():0;
  const outage=state.custody.companyOutageUntil&&state.time<state.custody.companyOutageUntil;
  const keys=(state.custody.keys||[]).filter(k=>!k.retired&&!k.company&&!k.hot);
  const shareRows=keys.filter(k=>typeof keyShares==="function"&&keyShares(k).length).map(k=>{
    const live=liveShares(k),need=keyShareThreshold(k);
    return `<article class="venue"><div class="risk ${live.length>=need?"low":"high"}">${need}-OF-${keyShares(k)[0].total} SHARES</div>
      <h3>${k.label}</h3>
      <p>${live.length} share${live.length===1?"":"s"} still reachable. These are not BIP39 words. Fewer than ${need} in one place.</p>
      <div class="actions"><button class="action small" data-action="custody-shares-discard" data-id="${k.id}">Discard shares</button></div></article>`;
  }).join("");
  const splitButtons=keys.filter(k=>!keyShares(k).length).slice(0,4).map(k=>
    `<button class="action small" data-action="custody-shares-split" data-id="${k.id}">Split ${k.label} · 2-of-3</button>`).join("");
  const arrangementCards=COLLABORATIVE_ARRANGEMENTS.map(a=>{
    const selected=arr.id===a.id;
    return `<article class="venue ${selected?"active":""}"><div class="risk ${selected?"low":"medium"}">${a.fee?`${fmtUsd(a.fee)}/YEAR · MODELLED`:"NO COMPANY FEE"}</div>
      <h3>${a.name}</h3><p>${a.blurb}</p>
      <p class="modal-note"><b>Protects:</b> ${a.protects}<br><b>Fails:</b> ${a.fails}${a.source?`<br><a href="${a.source}" target="_blank" rel="noopener">Source</a> · dated ${a.dated||""}`:""}</p>
      <div class="actions"><button class="action small ${selected?"":"primary"}" data-action="custody-arrangement" data-id="${a.id}" ${selected?"disabled":""}>${selected?"Current arrangement":`Use ${a.name}`}</button></div></article>`;
  }).join("");
  return `<section class="card span-12 custody-education"><div class="card-head"><h2>Custody lessons</h2><div class="meta">${arr.name.toUpperCase()}${outage?" · COMPANY OUTAGE":""}${owed?` · FEE DUE ${fmtUsd(owed)}`:""}</div></div>
  <div class="card-pad">
    <h3>Shamir-style shares</h3>
    <p class="modal-note">Split one secret into paper shares (taught default 2-of-3). Fewer than the threshold reveal nothing. This follows the shape of <a href="https://github.com/satoshilabs/slips/blob/master/slip-0039.md" target="_blank" rel="noopener">SLIP-0039</a>, not BIP39. Converting by splitting an old BIP39 seed is what that slip tells you not to do.</p>
    <div class="actions">${splitButtons||`<span class="label">Generate a cold key first, then split it.</span>`}</div>
    <div class="venue-grid" style="margin-top:10px">${shareRows||`<p class="modal-note">No shares yet.</p>`}</div>
    <h3 style="margin-top:16px">Disaster drill</h3>
    <p class="modal-note">Read-only: shows what a modelled incident would take from a place, using your current layout. Nothing is destroyed.</p>
    <div class="actions">
      <button class="action small" data-action="custody-drill" data-id="site" data-value="fire">Fire at the mine</button>
      <button class="action small" data-action="custody-drill" data-id="home" data-value="fire">Fire at home</button>
      <button class="action small" data-action="custody-drill" data-id="site" data-value="burglary">Break-in at the mine</button>
      <button class="action small" data-action="custody-drill" data-id="bank" data-value="seizure">Seizure of the bank box</button>
    </div>
    <h3 style="margin-top:16px">Collaborative arrangements</h3>
    <p class="modal-note">Company-shaped products teach who holds a key and what it costs. Not recommendations. Inheritance stays named in the copy only. The company key can be lost, hacked or compelled at a low modelled rate.</p>
    ${owed?`<div class="actions"><button class="action small primary" data-action="custody-arrangement-pay">Pay ${fmtUsd(owed)} company fee</button></div>`:""}
    <div class="venue-grid">${arrangementCards}</div>
  </div></section>`;
}

function enhanceCustodyEducation(){
  const grid=document.querySelector(".content .grid");if(!grid||grid.querySelector(".custody-education"))return;
  const anchor=grid.querySelector(".key-workbench");
  if(anchor)anchor.insertAdjacentHTML("afterend",custodyEducationCard());
  else grid.insertAdjacentHTML("beforeend",custodyEducationCard());
}
