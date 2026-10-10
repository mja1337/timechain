"use strict";

/* NOTIFICATIONS - transient toasts and the bad-event impact effect. These
   are presentation, not simulation; they lived in the engine only because
   the engine raises them. Every entry patches the DOM directly rather than
   triggering a render, so a burst of events cannot rebuild the page. */

function feedbackKind(title,kind="info"){if(kind!=="info")return kind;return /not enough|unavailable|required|blocked|failed|invalid|too small|no (?:running|spendable|saleable|asic)|still due|power down|already (?:on|scheduled)|one-way|limit/i.test(title)?"blocked":"success"}
function feedbackLabel(kind){return({bad:"Action needed",warning:"Advance warning",notice:"Rules change",blocked:"Cannot do that",milestone:"Milestone reached",success:"Completed",status:"Update",info:"Update"})[kind]||"Update"}
function toastMarkup(t){if(typeof uiConfigAllows==="function"&&!uiConfigAllows("toasts"))return "";const linked=!!t.tab,kind=feedbackKind(t.title,t.kind),assertive=["bad","warning","notice","blocked"].includes(kind),repeats=Math.max(0,Number(t.repeats)||0);return `<div class="toast toast-${kind} ${linked?"toast-clickable":""} ${repeats?"toast-repeated":""}" role="${assertive?"alert":"status"}" aria-live="${assertive?"assertive":"polite"}" ${linked?`data-action="tab" data-value="${t.tab}"${t.anchor?` data-anchor="${t.anchor}"`:""}`:`data-action="dismiss-toast"`}><div class="toast-copy"><small>${feedbackLabel(kind)}${repeats?` · ${repeats+1} together`:""}</small><b>${escapeHtml(t.title)}</b><span>${escapeHtml(t.message)}</span>${repeats?`<em class="toast-repeat">and ${repeats} more like it just now</em>`:""}</div>${linked?`<i class="toast-go"><span>Open ${escapeHtml(t.tab)}</span> →</i>`:""}<button class="toast-dismiss" data-action="dismiss-toast" aria-label="Dismiss this message" title="Dismiss">×</button></div>`}
function dismissToast(){clearTimeout(toastTimer);toastTimer=null;toast=null;document.querySelector(".toast")?.remove()}
/* WHEN THE SAME THING KEEPS HAPPENING.

   A fleet of five thousand machines breaks constantly, and every fault raised its own toast.
   Each one replaced the last, restarted the eight-second timer and - for anything bad - fired
   the screen flash again. The result was a strobe: a notice was on screen at all times, none
   of them stayed long enough to read, and the flash that is supposed to mean "something just
   went wrong" meant "you have a large fleet".

   Repeats of the same notice now fold into the one already showing. It keeps its place, gains
   a count, and gets a little longer on screen for each one so it can actually be read. The
   flash fires for the first of a run and not for the rest, which restores what a flash means.

   Coalescing is by TITLE, because the title is what a notice is about and the message is the
   particulars - "Mining capacity lost to a fault" is one situation whether it is an S19 or an
   S21 this time. A genuinely different notice still interrupts immediately, because a burst of
   faults must never bury the one that says a settlement is due. */
/* A TOAST DOES NOT SIT ON A DECISION.

   Good news (a milestone, a finished lesson) used to land on top of whatever modal was open, over its
   heading and, on a phone, over half its buttons. While a modal is up, a notice that is only good news
   waits, and the newest few are shown when it closes. Anything that warns, blocks or says "bad" still
   appears at once: those are about the thing the player is doing. */
const TOAST_DEFERRABLE=["success","milestone","info","status"];
let deferredToasts=[];
function blockingModalOpen(){return !!document.querySelector(".modal-backdrop")}
function flushDeferredToasts(){
  updateNotificationPrompt();
  if(!deferredToasts.length||blockingModalOpen())return;
  const t=deferredToasts[deferredToasts.length-1];deferredToasts=[];
  showToast(t.title,t.message,t.kind,t.tab,t.anchor,t.lifeMs);
}
/* The header's save pill, and the one toast that says the browser will not store the game. Called by
   writeSave() when that changes, never per save. */
function saveStateHtml(){return `<i class="save-dot"></i>${saveFailing?"NOT SAVING":"LOCAL SAVE"}`}
function announceSaveState(){
  const pill=document.querySelector(".save-state");
  if(pill){pill.classList.toggle("save-failing",saveFailing);pill.innerHTML=saveStateHtml()}
  if(saveFailing)showToast("Your game is not being saved","This browser is refusing to store it: a private window, blocked site data or a full disk. Use Export save in the footer to keep your progress.","warning");
}
const TOAST_COALESCE_MS=9000,TOAST_BASE_MS=8500,TOAST_MAX_MS=20000;
let toastRepeats=0,toastLastTitle="",toastLastAt=0;
function toastLife(){return Math.min(TOAST_MAX_MS,TOAST_BASE_MS+toastRepeats*1200)}
/* This is a presentation preference only: do not spend simulation randomness or
   discard the underlying event. Skip work before toast markup, timers and flashes. */
const NOTIFICATION_BURST_MS=30000,NOTIFICATION_BURST_COUNT=20;
let notificationArrivals=[],notificationPromptOpen=false,notificationPromptAfter=0,notificationSkipCredit=0;
const notificationFaultLast=new Map();
function notificationReduction(){const value=Number(state.notificationReduction);return Number.isFinite(value)?Math.max(0,Math.min(100,value)):0}
function notificationPromptHtml(){
  if(!notificationPromptOpen||blockingModalOpen())return "";
  const reduction=notificationReduction();
  return `<aside class="notification-prompt" aria-label="Notification volume"><h3>Give the messages some breathing room</h3><p>Routine notifications are arriving frequently. Show fewer to reduce interruptions and toast rendering work.</p><p>Reduce routine toasts by <strong>${reduction}%</strong>. The first fault alert, critical alerts, warnings, milestones and blocked actions still appear. Repeated faults and completion messages can be reduced; the simulation keeps running normally.</p><div class="actions">${[0,25,50,75,90,100].map(value=>`<button class="action small ${value===reduction?"primary":""}" data-action="notification-reduction" data-value="${value}" aria-pressed="${value===reduction}">${value}%</button>`).join("")}</div><button class="action small" data-action="notification-prompt-close">Keep current setting</button><p class="modal-note">Change this any time using Notifications in the footer.</p></aside>`;
}
function updateNotificationPrompt(){
  document.querySelector(".notification-prompt")?.remove();
  const markup=notificationPromptHtml();if(markup&&state.started)document.getElementById("app")?.insertAdjacentHTML("beforeend",markup);
}
function notificationAction(action,value){
  if(action==="notification-settings"){notificationPromptOpen=true;updateNotificationPrompt();return}
  if(action==="notification-reduction"){
    const amount=Number(value);if(![0,25,50,75,90,100].includes(amount))return;
    state.notificationReduction=amount;notificationSkipCredit=0;notificationPromptOpen=false;
    notificationPromptAfter=Date.now()+5*60*1000;notificationArrivals=[];save();updateNotificationPrompt();return;
  }
  notificationPromptOpen=false;notificationPromptAfter=Date.now()+5*60*1000;notificationArrivals=[];updateNotificationPrompt();
}
function suppressRoutineNotification(title,kind){
  const now=Date.now();let routine=["success","status","info"].includes(kind);
  if(kind==="bad"&&title==="Mining capacity lost to a fault"){
    const previous=notificationFaultLast.get(title);routine=previous!==undefined&&now-previous<60000;
    // Keep the first fault in each minute, even at a 100% routine reduction.
    if(!routine)notificationFaultLast.set(title,now);
  }
  if(!routine)return false;
  notificationArrivals=notificationArrivals.filter(time=>now-time<NOTIFICATION_BURST_MS);
  notificationArrivals.push(now);
  if(notificationArrivals.length>=NOTIFICATION_BURST_COUNT&&now>=notificationPromptAfter&&!notificationPromptOpen&&notificationReduction()===0){
    notificationPromptOpen=true;updateNotificationPrompt();
  }
  // The bounded window counts arrivals even when hidden, without keeping an event queue.
  notificationArrivals=notificationArrivals.slice(-NOTIFICATION_BURST_COUNT);
  notificationSkipCredit+=notificationReduction();
  if(notificationSkipCredit>=100){notificationSkipCredit-=100;return true}
  return false;
}
function showToast(title,message,kind="info",tab=null,anchor=null,lifeMs=0){
  kind=feedbackKind(title,kind);
  if(suppressRoutineNotification(title,kind))return;
  if(TOAST_DEFERRABLE.includes(kind)&&blockingModalOpen()){deferredToasts=[...deferredToasts.filter(t=>t.title!==title),{title,message,kind,tab,anchor,lifeMs}].slice(-3);return}
  const now=Date.now(),repeat=title===toastLastTitle&&now-toastLastAt<TOAST_COALESCE_MS&&!!document.querySelector(".toast");
  toastRepeats=repeat?toastRepeats+1:0;
  toastLastTitle=title;toastLastAt=now;
  toast={title,message,kind,tab,anchor,repeats:toastRepeats,life:lifeMs};
  const markup=toastMarkup(toast),existing=document.querySelector(".toast"),host=document.getElementById("app");
  if(existing)existing.outerHTML=markup;else if(host&&state.started)host.insertAdjacentHTML("beforeend",markup);
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{toast=null;document.querySelector(".toast")?.remove()},lifeMs>0?lifeMs:toastLife());
  // The flash marks the START of a run of trouble, not each item in it.
  if(kind==="bad"&&state.started&&!repeat)triggerImpactEffect();
}
let lastImpactAt=0,flashNode=null,flashTimer=null,shakeTimer=null;
function reducedMotion(){return window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}
function clearImpactFlash(){clearTimeout(flashTimer);flashTimer=null;if(flashNode){flashNode.remove();flashNode=null}
  // Anything a previous session leaked is swept up on the next impact.
  document.querySelectorAll(".impact-flash").forEach(node=>node.remove());}
function triggerImpactEffect(){
  if(reducedMotion())return;
  const now=performance.now(),recent=now-lastImpactAt<4000;lastImpactAt=now;
  // One node, reused. Restarting its animation is what makes a second hit read as a second
  // hit; appending another node only costs a compositing layer.
  clearImpactFlash();
  flashNode=document.createElement("div");flashNode.className="impact-flash";document.body.appendChild(flashNode);
  flashNode.addEventListener("animationend",clearImpactFlash,{once:true});
  // A timer as well, because animationend is not guaranteed to arrive.
  flashTimer=setTimeout(clearImpactFlash,1200);
  // The shake translates the whole app, so a run of faults reads as the page
  // throwing itself around. Flash every time; shake at most once every 4s.
  if(recent)return;
  const shell=document.querySelector(".app");
  if(!shell)return;
  clearTimeout(shakeTimer);
  shell.classList.remove("impact-shake");void shell.offsetWidth;shell.classList.add("impact-shake");
  const drop=()=>shell.classList.remove("impact-shake");
  shell.addEventListener("animationend",drop,{once:true});
  shakeTimer=setTimeout(drop,900);
}
