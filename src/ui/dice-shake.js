"use strict";

/* THE CEREMONY DIE - press and hold to shake, release to roll.

   The opening wallet ceremony used to ask the player to roll a real die and tap the matching face, which in practice
   meant picking numbers: the outcome was whatever they chose. Now the die on screen is the die. Holding it (mouse,
   touch, pen, or Space/Enter on the focused die) shakes it, harder the longer it is held, up to a cap; letting go
   throws it, it tumbles (longer, and with more turns, after a longer shake) and lands on a face.

   WHO DECIDES THE FACE. rollDie() in src/engine/actions.js, at the moment of release, from secureDice: the browser's
   crypto.getRandomValues with rejection sampling, the same source "Generate the key for me" and "Let the browser
   finish" already use. Not the game's seeded stream: the dice feed only the illustrative wallet key, never the world,
   and a key derived from the seed the header prints could be made again (check-engine-behaviour holds that). So
   same-seed-same-run, the headless harness and the tutorial guarantee are untouched. How long the die was held never
   reaches rollDie(); it sets only the shake and the length of the tumble. The faces that flick past while it tumbles
   are drawn from a small local wobble generator that is decoration only and never decides anything.

   ACCESSIBILITY. The die is a real button with instructions (aria-describedby); the result is announced once in a
   polite live region that lives outside #app, so re-rendering the modal cannot swallow it; a keyboard player keeps
   focus on the die from throw to throw. With prefers-reduced-motion the die does not move: holding dims it, and the
   throw is a short flicker of faces that fades to the result. On touch, the die takes the gesture (touch-action:none,
   no long-press menu) so holding it neither scrolls the page nor opens a menu. A buzz on press and on landing where
   the device has navigator.vibrate. */

const DICE_MAX_SHAKE_MS=1600;
let diceAnim=null,diceLanded=0;
let diceWobble=(Date.now()>>>0)||1;
/* Decoration only: jitter for the shake and the faces that flick past mid-tumble. Never decides a result. */
function diceJitter(){diceWobble=(Math.imul(diceWobble,1664525)+1013904223)>>>0;return diceWobble/4294967296*2-1}
function diceReducedMotion(){return !!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}
function diceEl(){return document.querySelector("[data-dice-roller]")}
function diceBusy(){return !!diceAnim&&diceAnim.phase==="tumble"}
function diceBuzz(ms){try{if(navigator.vibrate)navigator.vibrate(ms)}catch(e){}}
function diceAnnounce(text){
  let live=document.getElementById("dice-live");
  if(!live){live=document.createElement("div");live.id="dice-live";live.className="sr-only";live.setAttribute("role","status");live.setAttribute("aria-live","polite");document.body.appendChild(live)}
  live.textContent="";setTimeout(()=>{live.textContent=text},30);
}
function diceSetStatus(text){const s=document.querySelector(".dice-status");if(s)s.innerHTML=text||"&nbsp;"}
function diceDraw(face){const el=diceEl();if(el&&typeof dieRollerSvg==="function"){const old=el.querySelector("svg"),tf=old?old.style.transform:"";el.innerHTML=dieRollerSvg(face);if(tf)el.querySelector("svg").style.transform=tf}}
/* What render.js draws for the die, so a repaint mid-shake or mid-tumble keeps the die in the same state. */
function diceView(){
  const w=state.walletSetup,rolls=(w&&w.rolls)||[],last=rolls[rolls.length-1]||0;
  if(diceAnim&&diceAnim.phase==="shake")return {cls:diceAnim.rm?" is-held":" is-shaking",face:last,status:"Shaking… let go to roll",busy:false};
  if(diceAnim&&diceAnim.phase==="tumble")return {cls:diceAnim.rm?" is-flicker":" is-tumbling",face:diceAnim.shown||last,status:"Rolling…",busy:true};
  const landed=diceLanded&&diceLanded===last;
  return {cls:landed?" is-landed":"",face:last,status:last?`Rolled a ${last}`:"",busy:false};
}
function diceCanStart(){const w=state.walletSetup;return !!w&&!w.done&&w.step===1&&(w.rolls||[]).length<99&&!diceAnim}
function diceStart(by){
  if(!diceCanStart())return false;
  diceLanded=0;
  diceAnim={phase:"shake",t0:performance.now(),by,rm:diceReducedMotion(),last:0};
  const el=diceEl();if(el){el.classList.remove("is-landed");el.classList.add(diceAnim.rm?"is-held":"is-shaking")}
  diceSetStatus("Shaking… let go to roll");diceBuzz(8);
  if(!diceAnim.rm)requestAnimationFrame(diceShakeFrame);
  return true;
}
/* The shake: a new jitter target every 70ms at first and every 18ms at full strength, each eased into, with the
   swing growing from a tremble to a hard rattle over DICE_MAX_SHAKE_MS. */
function diceShakeFrame(now){
  if(!diceAnim||diceAnim.phase!=="shake")return;
  const k=Math.min(1,(now-diceAnim.t0)/DICE_MAX_SHAKE_MS),gap=70-52*k;
  const el=diceEl(),svg=el&&el.querySelector("svg");
  if(el)el.style.setProperty("--shake",k.toFixed(2));
  if(svg&&now-diceAnim.last>=gap){
    diceAnim.last=now;const amp=1.5+9*k,rot=3+17*k;
    svg.style.transition=`transform ${Math.round(gap)}ms linear`;
    svg.style.transform=`translate(${(diceJitter()*amp).toFixed(1)}px,${(diceJitter()*amp).toFixed(1)}px) rotate(${(diceJitter()*rot).toFixed(1)}deg)`;
  }
  requestAnimationFrame(diceShakeFrame);
}
function diceCancel(){
  if(!diceAnim||diceAnim.phase!=="shake")return;
  diceAnim=null;const el=diceEl();
  if(el){el.classList.remove("is-shaking","is-held");el.style.removeProperty("--shake");const svg=el.querySelector("svg");if(svg){svg.style.transition="";svg.style.transform=""}}
  diceSetStatus("");
}
function diceRelease(){
  if(!diceAnim||diceAnim.phase!=="shake")return;
  const rm=diceAnim.rm,k=Math.min(1,(performance.now()-diceAnim.t0)/DICE_MAX_SHAKE_MS);
  // The throw. rollDie() draws the face from the browser's secure source; k (how long it was held) is not passed to it.
  const face=rollDie();
  if(!face){diceCancel();return}
  const dur=rm?320:Math.round(650+550*k),spins=rm?0:1+Math.round(2*k);
  diceAnim={phase:"tumble",face,t0:performance.now(),dur,rm,shown:0,lastFlip:0};
  const el=diceEl();
  if(el){
    el.classList.remove("is-shaking","is-held");el.classList.add(rm?"is-flicker":"is-tumbling");
    el.style.setProperty("--tumble-ms",dur+"ms");el.style.setProperty("--spins",String(spins));el.setAttribute("aria-disabled","true");
    const svg=el.querySelector("svg");if(svg){svg.style.transition="";svg.style.transform=""}
  }
  const fin=document.querySelector('[data-action="dice-finish"]');if(fin)fin.disabled=true;
  diceSetStatus("Rolling…");
  requestAnimationFrame(diceTumbleFrame);
}
function diceTumbleFrame(now){
  if(!diceAnim||diceAnim.phase!=="tumble")return;
  const t=(now-diceAnim.t0)/diceAnim.dur;
  if(t>=1){diceSettle();return}
  // Faces flick past, slowing as it settles.
  const gap=diceAnim.rm?105:45+t*t*190;
  if(now-diceAnim.lastFlip>=gap){
    diceAnim.lastFlip=now;let f;do{f=1+Math.floor((diceJitter()+1)*3)%6}while(f===diceAnim.shown);
    diceAnim.shown=f;diceDraw(f);
  }
  requestAnimationFrame(diceTumbleFrame);
}
function diceSettle(){
  const a=diceAnim,hadFocus=document.activeElement===diceEl();diceAnim=null;diceLanded=a.face;
  const n=(state.walletSetup.rolls||[]).length;
  render(false);
  if(hadFocus){const el=diceEl();if(el)el.focus({preventScroll:true})}
  diceAnnounce(`Rolled a ${a.face}. ${n} of 99 rolls recorded.${n===8?" You can now let the browser finish the rest.":""}`);
  diceBuzz(18);
}

/* Input. Pointer events cover mouse, touch and pen; the die captures the pointer, so a release outside it still throws. */
document.addEventListener("pointerdown",e=>{
  const el=e.target&&e.target.closest&&e.target.closest("[data-dice-roller]");if(!el)return;
  if(e.pointerType==="mouse"&&e.button!==0)return;
  e.preventDefault();
  try{el.setPointerCapture(e.pointerId)}catch(err){}
  el.focus({preventScroll:true});
  diceStart(e.pointerId);
});
document.addEventListener("pointerup",e=>{if(diceAnim&&diceAnim.phase==="shake"&&diceAnim.by===e.pointerId)diceRelease()});
document.addEventListener("pointercancel",e=>{if(diceAnim&&diceAnim.phase==="shake"&&diceAnim.by===e.pointerId)diceCancel()});
document.addEventListener("contextmenu",e=>{if(e.target&&e.target.closest&&e.target.closest("[data-dice-roller]"))e.preventDefault()});
const diceKey=e=>e.key===" "||e.key==="Enter"||e.key==="Spacebar";
document.addEventListener("keydown",e=>{
  if(!diceKey(e)||!document.activeElement||!document.activeElement.matches||!document.activeElement.matches("[data-dice-roller]"))return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!e.repeat)diceStart("key");
},true);
document.addEventListener("keyup",e=>{
  if(!diceKey(e)||!diceAnim||diceAnim.by!=="key")return;
  e.preventDefault();e.stopImmediatePropagation();diceRelease();
},true);
window.addEventListener("blur",()=>diceCancel());
