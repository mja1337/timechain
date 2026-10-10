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
      ?"A signer approves transactions using a private key. In this early era, buy a Basic PC and keep it off the network. Separating that job from the mining laptop limits what malware on the laptop can reach. The new computer can still fail, so prepare recovery before relying on it."
      :"A signer uses a private key to approve transactions. A separate device keeps that secret away from the everyday mining computer. It helps contain a compromise, but you still need to check what you approve and plan for the signer failing.",
    action:waiting?`<span class="label">Ordered · arrives in ${Math.max(1,Math.ceil((waiting.due-state.time)/DAY))} days</span>`
      :cheapest?`<button class="action small primary" data-action="custody-buy" data-id="${cheapest.id}"${custodyCash(cheapest)<custodyUnitCost(cheapest)?" disabled":""}>${cheapest.acquire?`${custodyAcquireLabel(cheapest)} · ${custodyLeadDays(cheapest)}d`:`Order ${cheapest.name} · ${custodyUnitCost(cheapest)>0?fmtUsd(custodyUnitCost(cheapest)):"free"}${custodyLeadDays(cheapest)?` · ${custodyLeadDays(cheapest)}d`:""}`}</button>`:""
  });
  // 2. A key made on it
  steps.push({
    done:keys.length>0,
    title:"Make a key on it",
    why:"Generate an unpredictable secret on the signer. A copied secret gives someone else the same signing power; in a single-key wallet that is enough to spend. Multisig needs independent secrets, so restoring one seed onto several devices does not create several approvals.",
    action:keyless?(!workshopPrepared(keyless)?`<button class="action small primary" data-action="workshop-focus" data-id="${workshopGroup(custodyProduct(keyless.product))}" data-value="${keyless.uid}">Open this signer in the workshop</button>`:keyless.restoring?`<span class="label">Restoring your key from its backup</span>`:(orphan&&custodyKeyRestorable(orphan))?`<button class="action small primary" data-action="custody-restore-key" data-id="${keyless.uid}" data-value="${orphan.id}">Restore your key from its backup</button>`:`<button class="action small primary" data-action="custody-genkey" data-id="${keyless.uid}">Generate a key</button>`):""
  });
  // 3. A backup
  steps.push({
    done:keys.length>0&&!unbacked,
    title:"Write the key down",
    why:"A backup lets you restore the signing secret if the device fails. Keep it private, because it carries the same authority as the original. Keep it apart from the signer, because two copies sharing one fire are not two recovery paths. Paper is free in the game; steel resists damage but can still be read.",
    action:unbacked?`<button class="action small primary" data-action="custody-backup" data-id="${unbacked.id}" data-value="paperbackup">Write it on paper · free</button>`:""
  });
  // 4. Into the wallet
  steps.push({
    done:set.ready,
    title:"Choose which key can authorise spending",
    why:"Assign the key to the spending policy: the rule your reserve wallet uses to accept a payment. One key is simple to coordinate, but a stolen copy gives full authority. A later two-of-three setup can tolerate one missing key and require two approvals; it also needs independent keys and a recorded configuration.",
    action:unassigned?`<button class="action small primary" data-action="custody-assign" data-id="${unassigned.id}">Assign to wallet</button>`:""
  });
  // 5. Coins in
  steps.push({
    done:cold>0,
    title:"Move coins in",
    why:hot>0?`${fmtBtc(hot)} sits in the online wallet, on the mining computer. Moving reserves behind separate keys limits what a compromised laptop can reach. Keep enough accessible for upcoming bills: cold transfers take simulation days.`:"There is nothing in the online wallet to move yet. Payouts can also be sent straight to cold storage from the Pools tab.",
    action:set.ready&&hot>0?`<button class="action small primary" data-action="transfer" data-from="hot" data-to="cold" data-value=".5">Move half</button><button class="action small" data-action="transfer" data-from="hot" data-to="cold" data-value=".25">Move a quarter</button>`:""
  });
  return steps;
}
function coldSetupCard(){
  const steps=coldSetupSteps(),next=steps.findIndex(s=>!s.done),finished=next<0;
  const annual=hotWalletAnnualRisk(),grace=typeof hotKeyGrace==="function"&&hotKeyGrace();
  const yearly=annual>0?` (modelled at about ${(annual*100).toFixed(1)}% a year, more the larger the share of your coins sitting in it)`:"";
  const risk=(state.wallets.hot||0)>0?(grace?`<p class="modal-note">Your online wallet cannot be lost in the first two months of a run. After that a fire, a break-in or a dead disk can take it${state.time>=at("2011-01-01")?`, and so can a compromised key${yearly}`:""}.</p>`
    :`<p class="modal-note">Your online wallet can be taken by a fire, a break-in or a dead disk${state.time>=at("2011-01-01")?`, or by a compromised key${yearly}`:""}. Separate reserve keys reduce online exposure; their backups and locations still need protection.</p>`):"";
  if(finished)return `<section class="card span-12 cold-setup done"><div class="card-head"><h2>Set up cold storage</h2><div class="meta">DONE</div></div><div class="card-pad"><p class="lead" style="margin:0">The reserve wallet is ready: ${fmtBtc(state.wallets.cold||0)} is held offline. The keys, devices and backups below are where you add a second key, a safer place to keep the backup, or a quorum.</p>${risk}</div></section>`;
  return `<section class="card span-12 cold-setup"><div class="card-head"><h2>Set up cold storage</h2><div class="meta">STEP ${next+1} OF ${steps.length}</div></div><div class="card-pad">
    <p class="lead" style="margin:0 0 10px">Cold storage means a key that does not live on the mining computer. These five steps separate daily spending from your reserves. Each one answers a different problem: signing, unpredictable secrets, recovery, spending permission and allocation.</p>${risk}
    <ol class="cold-steps">${steps.map((s,i)=>`<li class="${s.done?"done":i===next?"current":"later"}"><span class="cold-mark" aria-hidden="true">${s.done?"✓":i+1}</span><div><b>${s.title}</b><p>${s.why}</p></div><div class="actions">${i===next?s.action:""}</div></li>`).join("")}</ol></div></section>`;
}

/* The order of the page. Each entry is a heading as the card prints it (lower case) and the group it belongs to. */
const CUSTODY_GROUPS=[
  {id:"start",title:"1. Build the setup",note:"Prepare a signer, create a key, record recovery, then choose the rule that authorises spending.",cards:["your keys decide who can spend your bitcoin","your custody workshop","set up cold storage","custody supply","devices you own","keys, signers and recovery"]},
  {id:"money",title:"2. Put coins in the right place",note:"Keep daily spending money available, and move reserves behind the setup you have prepared.",cards:["your online wallet","wallet allocation","self-custody actions","where things are kept"]},
  {id:"spend",title:"3. Practice spending and recovery",note:"A reserve is useful only when the signing path and recovery plan work when a bill is due.",cards:["spending from cold storage","what lenders and insurers see","bitcoin calls to action"]},
  {id:"verify",title:"4. Check the network",note:"Your node checks the public record. It does not hold private keys or replace a signer.",cards:["your node","full-node operations","wallet client"]},
  {id:"learn",title:"5. Test the weak points",note:"Use the map and scenarios to see what malware, a frozen venue or a lost signer changes.",cards:["custody map","custody threat lab"]},
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
