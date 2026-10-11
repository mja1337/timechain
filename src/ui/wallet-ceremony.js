"use strict";

/* THE SHEET AND THE PASSPHRASE - the two choices after the dice.

   The rolls are already on this screen. Keeping the sheet leaves a paper copy that can
   rebuild the online wallet and can be stolen. Destroying it leaves only the backups the
   player makes later. A passphrase is a flag, never a typed secret. Its slip is a
   separate piece of paper, in a place the player chooses. */

function walletPaperStepHtml(w,rolls){
  const recorded=!!w.paperRecorded;
  const choice=recorded?`<p><b>Keep the sheet.</b> It can rebuild the online wallet if the computer dies. Anyone who finds it can copy the key. It starts at home, which is the same building as the mine until you move it.</p>
    <p><b>Destroy the sheet.</b> Finding it later cannot rebuild the key. Recovery then depends on the backups you make afterwards. Destroying this sheet does not destroy those.</p>
    <div class="modal-actions"><button class="action primary" data-action="wallet-paper-kept">Keep the roll sheet</button><button class="action danger" data-action="wallet-paper-destroyed">Destroy the roll sheet</button></div>`
    :`<div class="modal-actions"><button class="action primary" data-action="wallet-paper-recorded">Simulate recording and checking</button></div>`;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="paper-title"><div class="modal-body"><div class="modal-kicker">Paper checkpoint</div><h2 id="paper-title">${recorded?"Keep the sheet, or destroy it.":"Practise the paper step."}</h2><p class="lead">${recorded?"The rolls are on this simulated sheet. Both choices are real. Neither is the backup you write down next.":"No real paper is needed. This is a simulated checkpoint: in a real ceremony you would copy the roll sequence onto paper by hand and check it once. Paper can carry authority, so anyone who finds it can copy the key."}</p><div class="wallet-key-reveal">${(rolls||[]).join(" ")}</div>${recorded?'<div class="risk medium">Simulated record checked. Keep no photograph or digital copy.</div>':""}${choice}<p class="modal-note">In a real wallet, destroy only a temporary ceremony sheet after verifying the protected signer and recovery plan. Never destroy your only tested backup.</p></div></section></div>`;
}
function walletPassphraseStepHtml(w){
  const bank=typeof custodyPlace==="function"?custodyPlace("bank"):null;
  const fee=bank?fmtUsd(bank.fee):"$15";
  const homeSame=typeof custodyPlaceId==="function"&&custodyPlaceId("home")==="site";
  const sheet=!!w.paperKept;
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="passphrase-title"><div class="modal-body"><div class="modal-kicker">Passphrase</div><h2 id="passphrase-title">Add a passphrase?</h2><p class="lead">A passphrase is an extra secret. People call it a 25th word. The spec calls it a passphrase. Someone who finds the seed still cannot spend without it. Lose it, and the coins are gone even when the seed is safe.</p>
    <p><b>No passphrase.</b> The seed alone can spend. This is the wallet if you add nothing.</p>
    <p><b>Add one.</b> You do not type it. The game records only that it exists, so a passphrase you use for real bitcoin never enters this browser. You then store a paper slip in a place of its own.</p>
    <p class="modal-note">The computer's wallet stays open. A break-in there can still spend. The passphrase stops a found seed, not that machine.${sheet?" The roll sheet is a seed copy. Do not keep the slip with it.":""}</p>
    <div class="modal-actions">
      <button class="action" data-action="wallet-passphrase-skip">No passphrase</button>
      <button class="action primary" data-action="wallet-passphrase-place" data-value="bank">Slip in the bank box · ${fee}/month</button>
      <button class="action" data-action="wallet-passphrase-place" data-value="trusted">Slip at a trusted house · free</button>
      <button class="action" data-action="wallet-passphrase-place" data-value="home">Slip at home${homeSame?" · same building as the mine":""}</button>
    </div>
    <p class="modal-note">A bank box is billed while anything is kept there. A trusted house can be read by the person who lives there. Home${homeSame?" is the mine for now":""} shares a fate with the computer${sheet?" and the roll sheet":""}.</p>
  </div></section></div>`;
}
