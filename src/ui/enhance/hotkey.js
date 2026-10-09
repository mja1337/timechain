"use strict";

/* YOUR ONLINE WALLET - the first key, on the computer in the mine.

   The engine is in engine/hotkey.js. This says what the player needs to decide about it: where it
   lives, whether anything else holds it, and what losing the computer would cost. Moving its backup is
   done from the places card below, like any other backup. */

function hotWalletCard(){
  const key=hotKey();if(!key)return "";
  const hot=state.wallets.hot||0,backed=hotKeyBackedUp(),b=key.backup;
  const chance=hotKeyRisk()*100,year=(1-Math.pow(1-HOT_DISK_RATE,12))*100;
  const where=backed?`${b.durability==="steel"?"on steel":"on paper"} at ${placeSay(custodyPlaceId(b.place))}`:"nowhere";
  const together=backed&&custodyPlaceId(b.place,state)==="site";
  const tone=!backed&&hot>0?"high":together||(backed&&b.durability!=="steel")?"medium":"low";
  const buy=CUSTODY_PRODUCTS.filter(p=>p.kind==="backup"&&custodyProductAvailable(p));
  const buttons=backed?"":buy.map(p=>`<button class="action small ${p.id==="paperbackup"?"primary":""}" data-action="custody-backup" data-id="${key.id}" data-value="${p.id}"${(p.cost||0)>0&&(state.custody.parts[p.id]||0)<1?" disabled title=\"Order it in the supply card below first\"":""}>${p.id==="paperbackup"?"Write it down":`Back up on ${p.name}`}</button>`).join("");
  return `<section class="card span-12 hot-wallet"><div class="card-head"><h2>Your online wallet</h2><div class="meta">${key.software.toUpperCase()} · ${key.label}${key.fingerprint?` · ${key.fingerprint}`:""}</div></div><div class="card-pad">
    <div class="metric-row">
      <div class="metric"><div class="label">In the wallet</div><strong>${fmtBtc(hot)}</strong><small>${typeof utxoState==="function"?utxoState().hot:0} coin${utxoState().hot===1?"":"s"} · sellable today</small></div>
      <div class="metric"><div class="label">The key lives</div><strong>On the mining computer</strong><small>at the mine, so what happens to the mine happens to it</small></div>
      <div class="metric"><div class="label">Backup</div><strong class="${backed?"profit-positive":hot>0?"profit-negative":""}">${backed?"Written down":"None"}</strong><small>${backed?where:"one dead disk takes everything in it"}</small></div>
      <div class="metric"><div class="label">The computer fails</div><strong>${year.toFixed(1)}% a year</strong><small>${hot>0?`${chance.toFixed(2)}% a month`:"nothing in it to lose"}</small></div>
    </div>
    <div class="risk ${tone}">${!backed?(hot>0?"There is one copy of this key, on the computer. A fire, a break-in or a failed disk would take every coin in the wallet.":"There is one copy of this key. Back it up before the first coins arrive."):together?"The backup is kept at the mine, beside the computer: a fire or a flood takes both. Move it to a bank box or a trusted person's house.":b.durability!=="steel"?"The backup is on paper, which a fire or a flood destroys wherever it is kept.":"The key survives the loss of the computer."}</div>
    ${buttons?`<div class="actions">${buttons}</div>`:""}
    <p class="modal-note">This is the working balance, not the reserve. It is never part of a wallet policy, and what you do not need this month belongs in cold storage.</p>
  </div></section>`;
}
