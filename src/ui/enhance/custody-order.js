"use strict";

/* THE CUSTODY SECTION, IN AN ORDER A PERSON CAN FOLLOW.

   The cards on this page were added one sprint at a time, each appended to the end of the grid by whichever
   enhancer wrote it, so the page read in the order the code was written: a learning lab before the player's own
   coins, the shop between the lender report and the cold spend, the node three times. Nothing was wrong with any
   one card. What was missing was a sequence, and any instruction at all about where to begin.

   Two things live here:

   - the "Set up cold storage" card, which names the five steps from nothing to coins held offline and puts the
     button for the next one in the card itself; and
   - orderCustodyCards(), which runs last and arranges every card the other enhancers drew into five groups:
     your coins, equipment and backups, spending and standing, verification, and learning. It moves existing
     elements rather than redrawing them, so no card needs to know it has been moved, and a card it does not
     recognise is left at the end rather than lost. */

function coldSetupSteps(){
  const c=state.custody,set=custodySetup();
  const isSigner=p=>!!p&&p.kind==="signer";
  const devices=(c.devices||[]).filter(d=>isSigner(custodyProduct(d.product))&&!d.destroyed);
  const ordered=(c.orders||[]).filter(o=>isSigner(custodyProduct(o.id)));
  const keys=(c.keys||[]).filter(k=>!k.hot&&!k.retired);
  const keyless=devices.find(d=>!d.keyId);
  // A key whose signer burnt: it can be put back on a new device from its backup.
  const orphan=keys.find(k=>!custodyDevicesOfKey(k).some(d=>!d.destroyed));
  const unbacked=keys.find(k=>!k.backup||k.backup.destroyed);
  const unassigned=keys.find(k=>!c.assigned.includes(k.id));
  const cheapest=CUSTODY_PRODUCTS.filter(p=>p.kind==="signer"&&!p.build&&custodyProductAvailable(p)).filter(p=>!custodyOnceBlocked(p)).sort((a,b)=>custodyUnitCost(a)-custodyUnitCost(b))[0];
  const hot=state.wallets.hot||0,cold=state.wallets.cold||0;
  const steps=[];
  // 1. A signer
  const waiting=ordered[0];
  steps.push({
    done:devices.length>0,
    title:"Get a signer",
    why:state.time<at("2014-08-01")
      ?"A signer is whatever holds a key and signs for it. Before hardware wallets that was an old computer that never connects to anything, which is exactly what cold storage meant. A beige tower from the late 1990s will do, and there is probably one in the basement."
      :"A signer is the device that holds a key and signs for it: a hardware wallet, or an old computer that never connects to anything.",
    action:waiting?`<span class="label">Ordered · arrives in ${Math.max(1,Math.ceil((waiting.due-state.time)/DAY))} days</span>`
      :cheapest?`<button class="action small primary" data-action="custody-buy" data-id="${cheapest.id}"${state.cash<custodyUnitCost(cheapest)?" disabled":""}>${cheapest.acquire?`${custodyAcquireLabel(cheapest)} · ${custodyLeadDays(cheapest)}d`:`Order ${cheapest.name} · ${custodyUnitCost(cheapest)>0?fmtUsd(custodyUnitCost(cheapest)):"free"}${custodyLeadDays(cheapest)?` · ${custodyLeadDays(cheapest)}d`:""}`}</button>`:""
  });
  // 2. A key made on it
  steps.push({
    done:keys.length>0,
    title:"Make a key on it",
    why:"The key is created on the signer and stays there. Whoever can see it can spend the coins, which is why it is made on something that is not online.",
    action:keyless?(keyless.restoring?`<span class="label">Restoring your key from its backup</span>`:(orphan&&custodyKeyRestorable(orphan))?`<button class="action small primary" data-action="custody-restore-key" data-id="${keyless.uid}" data-value="${orphan.id}">Restore your key from its backup</button>`:`<button class="action small primary" data-action="custody-genkey" data-id="${keyless.uid}">Generate a key</button>`):""
  });
  // 3. A backup
  steps.push({
    done:keys.length>0&&!unbacked,
    title:"Write the key down",
    why:"A signer can fail or burn, and the written seed is the wallet. Without it a dead signer means the coins are gone for good. Paper is free; it burns with the building it is kept in, so move it somewhere else once you can.",
    action:unbacked?`<button class="action small primary" data-action="custody-backup" data-id="${unbacked.id}" data-value="paperbackup">Write it on paper · free</button>`:""
  });
  // 4. Into the wallet
  steps.push({
    done:set.ready,
    title:"Put the key in your wallet",
    why:"Until a key is assigned to your wallet the game treats nothing as cold storage. A single key is the simplest wallet; two-of-three comes later, with its own cost.",
    action:unassigned?`<button class="action small primary" data-action="custody-assign" data-id="${unassigned.id}">Assign to wallet</button>`:""
  });
  // 5. Coins in
  steps.push({
    done:cold>0,
    title:"Move coins in",
    why:hot>0?`${fmtBtc(hot)} sits in the online wallet, on the mining computer. Anything you will not spend this month belongs offline.`:"There is nothing in the online wallet to move yet. Payouts can also be sent straight to cold storage from the Pools tab.",
    action:set.ready&&hot>0?`<button class="action small primary" data-action="transfer" data-from="hot" data-to="cold" data-value=".5">Move half</button><button class="action small" data-action="transfer" data-from="hot" data-to="cold" data-value=".25">Move a quarter</button>`:""
  });
  return steps;
}
function coldSetupCard(){
  const steps=coldSetupSteps(),next=steps.findIndex(s=>!s.done),finished=next<0;
  const annual=hotWalletAnnualRisk(),grace=typeof hotKeyGrace==="function"&&hotKeyGrace();
  const yearly=annual>0?` (about ${(annual*100).toFixed(1)}% a year, more the larger the share of your coins sitting in it)`:"";
  const risk=(state.wallets.hot||0)>0?(grace?`<p class="modal-note">Your online wallet cannot be lost in the first two months of a run. After that a fire, a break-in or a dead disk can take it${state.time>=at("2011-01-01")?`, and so can a compromised key${yearly}`:""}.</p>`
    :`<p class="modal-note">Your online wallet can be taken by a fire, a break-in or a dead disk${state.time>=at("2011-01-01")?`, or by a compromised key${yearly}`:""}. Cold storage is what takes the coins out of that reach.</p>`):"";
  if(finished)return `<section class="card span-12 cold-setup done"><div class="card-head"><h2>Set up cold storage</h2><div class="meta">DONE</div></div><div class="card-pad"><p class="lead" style="margin:0">Cold storage is set up: ${fmtBtc(state.wallets.cold||0)} is held offline. The keys, devices and backups below are where you add a second key, a safer place to keep the backup, or a quorum.</p>${risk}</div></section>`;
  return `<section class="card span-12 cold-setup"><div class="card-head"><h2>Set up cold storage</h2><div class="meta">STEP ${next+1} OF ${steps.length}</div></div><div class="card-pad">
    <p class="lead" style="margin:0 0 10px">Cold storage means a key that does not live on the mining computer. It takes five steps, in this order, and the button for the next one is on its line.</p>${risk}
    <ol class="cold-steps">${steps.map((s,i)=>`<li class="${s.done?"done":i===next?"current":"later"}"><span class="cold-mark" aria-hidden="true">${s.done?"✓":i+1}</span><div><b>${s.title}</b><p>${s.why}</p></div><div class="actions">${i===next?s.action:""}</div></li>`).join("")}</ol></div></section>`;
}

/* The order of the page. Each entry is a heading as the card prints it (lower case) and the group it belongs to. */
const CUSTODY_GROUPS=[
  {id:"coins",title:"Your coins",note:"Where your bitcoin is today, and how to move it.",cards:["your keys decide who can spend your bitcoin","set up cold storage","your online wallet","wallet allocation","self-custody actions"]},
  {id:"equipment",title:"Equipment and backups",note:"Buy a signer, make a key on it, back it up, and decide where each piece is kept.",cards:["custody supply","devices you own","keys, signers and recovery","where things are kept"]},
  {id:"standing",title:"Spending and standing",note:"What it takes to get coins back out, and what a lender or insurer makes of your setup.",cards:["spending from cold storage","what lenders and insurers see","bitcoin calls to action"]},
  {id:"verify",title:"Verification",note:"Your node checks the rules for you. It does not hold your coins.",cards:["your node","full-node operations","wallet client"]},
  {id:"learn",title:"Learn",note:"Optional: the ideas behind all of the above, using your own balances.",cards:["custody map","custody threat lab"]},
];
function orderCustodyCards(grid){
  if(!grid)return;
  grid.querySelectorAll(".cold-setup,.custody-group").forEach(e=>e.remove());
  // Draw the new card, then collect every card by the heading it prints.
  grid.insertAdjacentHTML("beforeend",coldSetupCard());
  const byHeading=new Map();
  for(const el of [...grid.children]){
    const h=el.querySelector("h1,h2");
    if(h)byHeading.set(h.textContent.trim().toLowerCase().replace(/\.+$/,""),el);
  }
  const placed=new Set(),frag=document.createDocumentFragment();
  CUSTODY_GROUPS.forEach((group,n)=>{
    const members=group.cards.map(name=>byHeading.get(name)).filter(Boolean);
    if(!members.length)return;
    const head=document.createElement("div");
    head.className="span-12 custody-group";
    head.innerHTML=`<h2><span>${n+1}</span>${group.title}</h2><p>${group.note}</p>`;
    frag.appendChild(head);
    for(const el of members){
      // The node and the allocation used to share a row; once they are in different groups each takes a full one.
      el.classList.remove("span-5","span-7");el.classList.add("span-12");
      frag.appendChild(el);placed.add(el);
    }
  });
  // Anything unrecognised keeps its place after the groups rather than disappearing.
  for(const el of [...grid.children])if(!placed.has(el)&&!el.classList.contains("custody-group"))frag.appendChild(el);
  grid.appendChild(frag);
}
