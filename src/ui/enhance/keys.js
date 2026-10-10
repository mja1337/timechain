"use strict";

/* THE KEY WORKBENCH - policy, signers, backups and supplier exposure in one place, because
   they are one subject. A player needs to see at a glance that they own three devices, that
   two of them hold the same seed, that the wallet therefore has two keys and not three, and
   that the configuration has not been written down. Splitting that across panels is how the
   distinction gets lost. */

function custodyReadinessCard(){
  const set=custodySetup(),ready=custodyReadiness(),exposed=custodyExposedPurchases();
  const tone=ready.tone==="good"?"low":ready.tone==="warn"?"medium":"high";
  const compromise=custodyCompromiseFactor(),loss=custodyLossRisk();
  return `<section class="card span-12 key-workbench"><div class="card-head"><h2>Keys, signers and recovery</h2><div class="meta">${set.policy.name.toUpperCase()} · ${ready.label.toUpperCase()}</div></div>
  <div class="card-pad">
    <div class="metric-row">
      <div class="metric"><div class="label">Wallet policy</div><strong>${set.policy.threshold} of ${set.policy.keys}</strong><small>${set.distinct} distinct key${set.distinct===1?"":"s"} assigned</small></div>
      <div class="metric"><div class="label">Backups</div><strong>${set.backedUp} / ${set.assigned.length||0}</strong><small>${set.steelBacked} on durable media</small></div>
      <div class="metric"><div class="label">Configuration</div><strong>${set.policy.threshold>1?(set.configOk?"Recorded":"Not recorded"):"Not needed"}</strong><small>${set.policy.threshold>1?"The map of keys, spending rule and derivation":"One key authorises spending in this model"}</small></div>
      <div class="metric"><div class="label">If only the signer fails</div><strong class="${custodyRecoverable()?"profit-positive":"profit-negative"}">${custodyRecoverable()?"Recovery material recorded":"Recovery incomplete"}</strong><small>${custodyRecoverable()?"Assumes the backup material survives. Losing a whole location is a separate risk.":ready.detail}</small></div>
    </div>
    <div class="risk ${tone}">Compromise risk ×${compromise.toFixed(2)} · unrecoverable-loss risk ${(loss*100).toFixed(3)}%/month</div>
    ${exposed.length?`<div class="risk high">Supplier exposure · ${exposed.length} purchase${exposed.length===1?"":"s"} in a leaked customer record. ${[...new Set(exposed.map(x=>CUSTODY_SUPPLIERS[x.leak.supplier]?.name||x.leak.supplier))].join(", ")}. This is a leak of customer information, not proof that a spending key was leaked. It can identify you as a target for scams or physical threats. Replacing hardware does not recall those records.</div>`:""}
    <div class="actions">${CUSTODY_POLICIES.map(p=>`<button class="action small ${state.custody.policy===p.id?"primary":""}" data-action="custody-policy" data-id="${p.id}"${p.threshold>1&&!hasSkill("multisig")?" disabled title=\"Requires Multisig discipline\"":""}>${p.name}</button>`).join("")}
    ${set.policy.threshold>1?`<button class="action small ${set.configOk?"":"danger"}" data-action="custody-config"${set.ready?"":" disabled"}>${set.configOk?"Configuration recorded":"Record the configuration"}</button>`:""}</div>
    <p class="modal-note">${set.policy.desc}</p><details class="intro-customise"><summary>Why devices, keys and backups are counted separately</summary><p>The coins stay on the Bitcoin ledger. A key gives authority to spend them; a signer uses that key to approve a transaction; a backup lets you restore it after equipment fails. Two devices holding the same secret are still one approval.</p><p>Multisig spreads authority across independent secrets. Keeping those secrets apart can stop one theft from being enough to spend, and one fire from destroying every recovery path. The cost is coordination: you need the required signatures when you want to pay.</p><p>The risk figures above are gameplay assumptions, not measured odds for your real wallet. A strong setup reduces particular failure modes; it does not make every failure impossible.</p><p>Further reading: <a href="https://developer.bitcoin.org/devguide/wallets.html" target="_blank" rel="noopener">Bitcoin wallet architecture</a> / <a href="https://github.com/bitcoin/bips/blob/master/bip-0380.mediawiki" target="_blank" rel="noopener">Wallet configuration and recovery</a></p></details>
  </div></section>`;
}

function custodyDevicesCard(){
  const c=state.custody,devices=c.devices||[];
  const bySeed={};
  for(const k of c.keys)bySeed[k.seed]=(bySeed[k.seed]||[]).concat(k);
  const rows=devices.map(d=>{
    const p=custodyProduct(d.product),key=d.keyId?custodyKey(d.keyId):null;
    const twin=key?(c.devices.filter(x=>x.keyId&&custodyKey(x.keyId)?.seed===key.seed).length):0;
    const assigned=key&&c.assigned.includes(key.id);
    const leaked=custodySupplierExposed(d.supplier);
    return `<article class="venue"><div class="risk ${key?(assigned?"low":"medium"):"medium"}">${p?p.kind==="signer"?"SIGNER":p.kind.toUpperCase():"DEVICE"}${p&&p.stateless?" · STATELESS":""}${leaked?" · SUPPLIER LEAKED":""}</div>
      <h3>${p?p.name:d.product}</h3>
      <p>${key?`Holds key <b>${key.label}</b>${twin>1?` - also on ${twin-1} other device${twin>2?"s":""}, which is still one key`:""}. ${key.backup?`Backed up on ${custodyProduct(key.backup.product)?.name||key.backup.product}.`:"No backup recorded."}`:"No key generated on this device yet."}</p>
      <div class="actions">
        ${!key?`<button class="action small primary" data-action="custody-genkey" data-id="${d.uid}">Generate a key</button>`:""}
        ${!key&&c.keys.length?`<button class="action small" data-action="custody-restore" data-id="${d.uid}">Restore an existing seed</button>`:""}
        ${key&&!key.backup?CUSTODY_PRODUCTS.filter(x=>x.kind==="backup"&&custodyProductAvailable(x)).map(x=>`<button class="action small" data-action="custody-backup" data-id="${key.id}" data-value="${x.id}"${(x.cost||0)>0&&(c.parts[x.id]||0)<1?" disabled":""}>Back up: ${x.name}${(x.cost||0)>0?` (${c.parts[x.id]||0} in stock)`:""}</button>`).join(""):""}
        ${key&&!assigned&&!key.retired?`<button class="action small primary" data-action="custody-assign" data-id="${key.id}">Assign to wallet</button>`:""}
        ${key&&assigned?`<button class="action small" data-action="custody-unassign" data-id="${key.id}">Remove from wallet</button>`:""}
      </div>${key?custodyHolderControls(key):""}</article>`;
  }).join("");
  return `<section class="card span-12"><div class="card-head"><h2>Devices you own</h2><div class="meta">${devices.length} DEVICE${devices.length===1?"":"S"} · ${new Set(c.keys.filter(k=>!k.hot).map(k=>k.seed)).size} DISTINCT KEY${new Set(c.keys.filter(k=>!k.hot).map(k=>k.seed)).size===1?"":"S"}</div></div>
  <div class="card-pad"><details class="intro-customise"><summary>Individual device records, key holders and recovery actions</summary>${custodyRotationRows()}<div class="venue-grid">${devices.length?rows:`<p class="modal-note">No custody hardware yet. A device is not custody on its own - it becomes custody when a key is generated on it and that key is assigned to a wallet.</p>`}</div></details></div></section>`;
}

function custodyShopCard(){
  const c=state.custody;
  const group=(kind,title,note)=>{
    const items=CUSTODY_PRODUCTS.filter(p=>p.kind===kind&&custodyProductAvailable(p));
    if(!items.length)return"";
    return `<h4>${title}</h4><p class="modal-note">${note}</p><div class="venue-grid">${items.map(p=>{
      const cost=custodyUnitCost(p),lead=custodyLeadDays(p),stock=c.parts[p.id]||0;
      const leaked=custodySupplierExposed(p.supplier);
      return `<article class="venue"><div class="risk ${leaked?"high":"low"}">${CUSTODY_SUPPLIERS[p.supplier]?.name||p.supplier}${leaked?" · RECORDS LEAKED":""}</div>
        <h3>${p.name}</h3><p>${p.desc}</p>
        <div class="actions"><button class="action small" data-action="custody-buy" data-id="${p.id}"${custodyCash(p)<cost||custodyOnceBlocked(p)?" disabled":""}>${p.acquire?`${custodyAcquireLabel(p)} · ${lead}d`:`Order · ${cost>0?fmtUsd(cost):"free"}${lead?` · ${lead}d`:""}`}</button>
        ${kind!=="signer"?`<span class="meta">${stock} in stock</span>`:""}</div></article>`;
    }).join("")}</div>`;
  };
  const build=CUSTODY_BUILDS.seedsigner,product=CUSTODY_PRODUCTS.find(p=>p.build==="seedsigner");
  const missing=custodyBuildShortfall("seedsigner");
  const buildable=custodyProductAvailable(product);
  const inFlight=(c.builds||[]).length;
  return `<section class="card span-12"><div class="card-head"><h2>Custody supply</h2><div class="meta">ORDER, BUILD, BACK UP</div></div><div class="card-pad"><details class="intro-customise"><summary>Full catalogue, component kits and recovery media</summary>
    ${group("signer","Signers","One complete Basic PC SKU, smaller computer formats and dedicated hardware wallets. A vendor can retain a purchase record; generic electronics reduce that specific exposure without making you anonymous.")}
    ${buildable?`<h4>Build your own</h4><p class="modal-note">${product.desc} Components come from general electronics suppliers, so no vendor holds a list of bitcoin customers - that reduces exposure rather than granting anonymity.</p>
    <div class="venue-grid"><article class="venue"><div class="risk ${missing?"medium":"low"}">${inFlight?"ASSEMBLY UNDERWAY":missing?"COMPONENTS MISSING":"READY TO ASSEMBLE"}</div><h3>${build.name}</h3>
      <p>${Object.entries(build.required).map(([pid,n])=>`${custodyProduct(pid)?.name||pid} ${(c.parts[pid]||0)}/${n}`).join(" · ")}${Object.keys(build.optional||{}).map(pid=>` · ${custodyProduct(pid)?.name||pid} ${(c.parts[pid]||0)}/1 (optional)`).join("")}</p>
      <div class="actions"><button class="action small primary" data-action="custody-assemble" data-id="seedsigner"${missing||inFlight?" disabled":""}>${inFlight?"Assembling…":`Assemble · ${build.days} days`}</button></div></article></div>`:""}
    ${group("kit","Component kits","Everything at once, for more than the sum of the parts.")}
    ${group("part","Components","Ordered individually from suppliers who have no idea what you are building.")}
    ${group("backup","Seed backup","A key with no backup is a key you are only borrowing.")}
  </details></div></section>`;
}

function enhanceKeys(){
  const grid=document.querySelector(".content .grid");if(!grid)return;
  if(grid.querySelector(".key-workbench"))return;
  grid.insertAdjacentHTML("beforeend",`${typeof hotWalletCard==="function"?hotWalletCard():""}${custodyWorkshopCard()}${custodyReadinessCard()}${custodyDevicesCard()}${custodyPlacesCard()}${custodyCounterpartiesCard()}${custodyShopCard()}`);
}
