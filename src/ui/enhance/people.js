"use strict";

/* PEOPLE, AS THE PLAYER MEETS THEM - who holds each key, what it takes to replace one, and the
   warning on the staff card before somebody who knows a key is let go.

   The engine is engine/keyholders.js. This only draws it. */

function custodyExposureWords(key){
  const e=key.exposed;if(!e)return "";
  return e.cause==="former-employee"
    ?`known to a former ${(STAFF.find(r=>r.id===e.role)?.name||"employee").toLowerCase()}`
    :"its backup was stolen";
}

/* How dangerous the exposure is today, in the words a player can act on. The chance shown is
   averaged over the two kinds of person; the game does not say which one it is. */
function custodyExposureRisk(){
  if(!custodyExposedKeys().length)return "";
  if(!custodyInsiderCanSpend())return "On its own this key spends nothing: the wallet needs more keys than are known.";
  const days=insiderDaysExposed(),pct=insiderShownHazard()*100;
  return `Known for ${days} day${days===1?"":"s"}. Chance it is used today: ${pct<.1?"under 0.1":pct<10?pct.toFixed(1):Math.round(pct)}%, and it rises every day. Replace it before it is.`;
}


function custodyHolderControls(key){
  if(key.retired){
    const still=!wipeBlockReason(key.id);
    return `<div class="holder-row"><small>Retired: it no longer controls anything.${still?" Its signer still holds it, so it cannot be a spare yet.":""}</small>${still?`<div class="actions"><button class="action small" data-action="custody-wipe" data-id="${key.id}" title="Resets the signer. The seed backup is untouched and the key stays retired.">Wipe the signer</button></div>`:""}</div>`;
  }
  const holder=custodyHolder(key),assigned=state.custody.assigned.includes(key.id);
  const give=CUSTODY_HOLDERS.filter(h=>h!==holder&&custodyHolderAvailable(h))
    .map(h=>`<button class="action small" data-action="custody-holder" data-id="${key.id}" data-value="${h}">Give to ${custodyHolderName(h)}</button>`).join("");
  const spare=custodySpareSigners(),rotating=custodyRotation();
  let rotate="";
  if(assigned&&!rotating){
    rotate=spare.length
      ?spare.map(d=>`<button class="action small ${key.exposed||key.weakEntropy?"primary":""}" data-action="custody-rotate" data-id="${key.id}" data-value="${d.uid}" title="Generates a new key on this signer, sweeps every coin to it and retires ${key.label}. ${rotationDays()} days.">Rotate onto ${custodyProduct(d.product)?.name||"a spare signer"} · ${rotationDays()}d</button><button class="action small" data-action="custody-rotate" data-rush="1" data-id="${key.id}" data-value="${d.uid}" title="Pays three times the sweep fee to skip the careful steps: ${rotationDays(true)} days instead of ${rotationDays()}, and never fewer than two.">Rush · ${rotationDays(true)}d · ${fmtBtc(transferNetworkFee("cold",1,{rush:true}))}</button>`).join("")
      :`<small class="modal-note">Replacing this key needs a spare signer with no key on it.</small>`;
  }
  return `<div class="holder-row"><small>Held by <b>${custodyHolderName(holder)}</b>${key.exposed?` · <b class="profit-negative">exposed: ${custodyExposureWords(key)}</b>`:""}${key.weakEntropy?` · <b class="profit-negative">weak seed</b>`:""}</small>${key.exposed&&assigned?`<small class="modal-note">${custodyExposureRisk()}</small>`:""}
    <div class="actions">${give}${rotate}</div></div>`;
}

function custodyRotationRows(){
  const job=custodyRotation();if(!job)return "";
  const old=custodyKey(job.old),fresh=custodyKey(job.new),left=Math.max(0,Math.ceil((job.due-state.time)/DAY)),done=Math.max(0,Math.min(100,Math.round((1-(job.due-state.time)/Math.max(DAY,job.due-job.started))*100)));
  return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>Rotating ${old?old.label:"a key"} → ${fresh?fresh.label:"a new key"}</b><small>${left}d remaining · coins being swept to the new wallet · ${fmtBtc(job.fee)} network fee · signing is paused</small><div class="bar" style="--w:${done}%;--bar:var(--blue)"><i></i></div></div></div>`;
}
