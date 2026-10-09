"use strict";

/* THE BENCH, DRAWN AS THE MACHINE IN FRONT OF YOU.

   These were three abstract shapes - four arrows in a grid, six identical dots, a number to
   hit - with no relationship to the machine or the part. Two problems, and the visual one was
   the smaller.

   The real problem was that all three punished the player for information they were never
   given. The mount order was a hidden shuffle, so a "wrong mount" was a coin flip that could
   damage the machine. The cable pairs were unlabelled, so the first pick of every pair was a
   guess with a penalty attached. Neither is a test of anything.

   A service manual prints the torque diagram. A wiring loom has the terminals marked. So now
   the sequence is shown, the terminals carry their pair, and the torque spec has a tolerance
   band you work into rather than an exact integer to land on. Getting it wrong is carelessness
   instead of luck - which is the only version of this worth putting a damage risk behind.

   And it is the machine: the face is drawn from the same profile the 3D floor uses, so an S19
   shows its four fans in two stacked pairs, an S9 shows its one, and the part you are working
   on is highlighted where it actually sits. */
/* The 3D silhouettes own the authoritative part layout, but they are a LAZY module: a player
   who has only ever opened Servicing has never loaded them, and reading through an undefined
   FloorMiners quietly drew every machine with one fan and no supply. So the profile is used
   when it is there and inferred from the machine's own nameplate when it is not - the
   correlation is real, because the reason a 3,250 W machine carries four fans in two stacked
   pairs is that it has 3,250 W of heat to move. */
function repairBenchLayout(h){
  const p=(typeof FloorMiners!=="undefined"&&FloorMiners.profiles&&FloorMiners.profiles[h.id])||null;
  if(p&&p.type==="asic")return{fans:Math.max(1,p.fans||1),psu:!!p.psu};
  return{fans:h.w>=2500?2:1,psu:h.w>=1000};
}
function repairBenchFace(h,job,slots){
  const layout=repairBenchLayout(h);
  const fans=layout.fans;
  const partDef=sparePart(job.part);
  const kind=job.part&&/fan/i.test(job.part)?"fan":job.part&&/hashboard/i.test(job.part)?"board":job.part&&/powerPcb/i.test(job.part)?"psu":"other";
  const boards=3;
  return `<div class="bench-face" aria-hidden="true">
    <div class="bench-case">
      <div class="bench-fans">${Array.from({length:fans},(_,i)=>`<i class="bench-fan ${kind==="fan"?"target":""}"></i>`).join("")}</div>
      <div class="bench-boards">${Array.from({length:boards},(_,i)=>`<i class="bench-board ${kind==="board"&&i===1?"target":""}"></i>`).join("")}</div>
      ${layout.psu?`<div class="bench-psu ${kind==="psu"?"target":""}"></div>`:""}
    </div>
    <small>${h.name}${partDef?` · ${partDef.name} highlighted`:""}</small>
  </div>`;
}
function repairWorkPuzzle(h,job){
  const partDef=sparePart(job.part),partName=job.part?(partDef?.name?.toLowerCase()||"part"):"unit";
  if(!job.oldRemoved)return `<div class="repair-puzzle">${repairBenchFace(h,job)}<p class="repair-puzzle-note">The faulted ${partName} is still mounted on ${h.name}. Pull it before fitting the replacement.</p><button class="action small primary" data-action="repair-remove-old" data-id="${h.id}">Remove old ${partDef?.name||job.part}</button></div>`;
  if(job.puzzleType===1){
    const locked=Array.isArray(job.cableLocked)?job.cableLocked:[],selected=job.cableSelected;
    const pairs=job.cableSlots||[];
    const names=["A","B","C"];
    return `<div class="repair-puzzle">${repairBenchFace(h,job)}<p class="repair-puzzle-note">Reconnect the ${partName}'s loom: every terminal is marked with the pair it belongs to, so join <strong>A to A, B to B, C to C</strong>. Forcing two that do not match will not seat.</p><div class="repair-cable-grid">${pairs.map((pair,i)=>`<button class="repair-cable ${locked[i]?"done":""} ${selected===i?"selected":""}" data-action="repair-cable" data-id="${h.id}" data-slot="${i}" ${locked[i]?"disabled":""} title="Terminal ${names[pair]||pair}">${names[pair]||pair}</button>`).join("")}</div><div class="repair-puzzle-progress">${locked.filter(Boolean).length/2} / 3 pairs connected</div></div>`;
  }
  if(job.puzzleType===2){
    const tol=Math.max(1,Number(job.dialTolerance)||2),off=job.dialValue-job.dialTarget;
    const lo=job.dialTarget-tol,hi=job.dialTarget+tol;
    const inBand=Math.abs(off)<=tol;
    const span=Math.max(24,Math.abs(off)*2+tol*6);
    const pos=v=>Math.max(0,Math.min(100,((v-(job.dialTarget-span/2))/span)*100));
    return `<div class="repair-puzzle">${repairBenchFace(h,job)}<p class="repair-puzzle-note">Torque the ${partName} to the manual's figure: <strong>${job.dialTarget} Nm ±${tol}</strong>. Anywhere inside the band is correct - carry on past it and you strip the thread.</p>
      <div class="torque-gauge"><i class="band" style="left:${pos(lo).toFixed(1)}%;width:${(pos(hi)-pos(lo)).toFixed(1)}%"></i><b class="needle ${inBand?"good":off>tol?"over":"under"}" style="left:${pos(job.dialValue).toFixed(1)}%"></b></div>
      <div class="torque-readout"><span>Spec <b>${lo}–${hi} Nm</b></span><span class="${inBand?"good":"off"}">Wrench <b>${job.dialValue} Nm</b></span></div>
      <div class="repair-dial-buttons"><button class="action small" data-action="repair-nudge" data-id="${h.id}" data-delta="-5">−5</button><button class="action small" data-action="repair-nudge" data-id="${h.id}" data-delta="-1">−1</button><button class="action small" data-action="repair-nudge" data-id="${h.id}" data-delta="1">+1</button><button class="action small" data-action="repair-nudge" data-id="${h.id}" data-delta="5">+5</button></div>
      <div class="repair-puzzle-progress">${inBand?"On spec":off>0?`${off} Nm over - back it off`:`${-off} Nm under`}</div></div>`;
  }
  const corners=[["↖","Top-left"],["↗","Top-right"],["↙","Bottom-left"],["↘","Bottom-right"]];
  const tapped=Array.isArray(job.tapProgress)?job.tapProgress:[];
  const order=Array.isArray(job.tapOrder)?job.tapOrder:[0,1,2,3];
  const next=order[tapped.length];
  const fromMemory=!!job.tapFromMemory;
  const diagram=order.map((slot,i)=>`<span class="${tapped.length>i?"done":tapped.length===i?"next":""}">${i+1}. ${corners[slot][1]}</span>`).join("<i>→</i>");
  return `<div class="repair-puzzle">${repairBenchFace(h,job)}<p class="repair-puzzle-note">Seat the ${partName} and torque its mounts in the manual's cross pattern${fromMemory?" - you have done enough of these to know it without looking":""}. Going out of sequence pulls the board crooked and starts the pattern again.</p>
    ${fromMemory?`<p class="repair-puzzle-memory">Bench repair skills: the sequence is not printed for you. Diagonal opposites, always.</p>`:`<div class="torque-pattern">${diagram}</div>`}
    <div class="repair-puzzle-grid">${corners.map((c,i)=>`<button class="repair-bolt ${tapped.includes(i)?"done":""} ${!fromMemory&&next===i?"next":""}" data-action="repair-tap" data-id="${h.id}" data-slot="${i}" ${tapped.includes(i)?"disabled":""} title="${c[1]} mount">${c[0]}</button>`).join("")}</div>
    <div class="repair-puzzle-progress">${tapped.length} / 4 torqued down</div></div>`;
}
