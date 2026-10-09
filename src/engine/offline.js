"use strict";

/* THE INTERNET, CUT.

   The internet is a recurring cost that could not be stopped: a plan was always bought, and always billed. A player who wants to put a
   run on hold had no way to do it, because the one cost left standing was the line. Cutting it is now a plan of its own, "No internet",
   which costs nothing and lets nothing mine, and the clock carries on. The way to hibernate is therefore the player's own: stop the
   machines (the laptop included), sell what is spare, cut the line, and wait for a date they have to guess.

   They have to guess it because an operator with no internet has no idea what is happening in the world. Most of the screens lock
   (src/ui/offline.js), the ticker and the news go dark, and the major chapters of the story that fall while the line is cut are held
   back and shown, one at a time, when it is reconnected. Their effects on the operation still happen on the day; only the knowing waits.
   Nothing here draws anything. */

const OFFLINE_PLAN_ID="offline";
function internetCut(s=state){return s.connectivity===OFFLINE_PLAN_ID}

/* A chapter that would have stopped the game, held until the player can see it. */
function queueMissedEvent(e){(state.missedEvents=state.missedEvents||[]).push(e.id)}
/* Surface the next held chapter as the open one, and award its skill point as it is read. Returns whether one was opened. */
function surfaceMissedEvent(){
  const queue=state.missedEvents||[];
  while(queue.length){
    const id=queue.shift(),e=EVENTS.find(x=>x.id===id);if(!e)continue;
    state.points+=1;state.returnSpeed=state.speed||state.returnSpeed||1;state.speed=0;state.activeEvent=e.id;
    if(typeof setTimer==="function")setTimer();
    return true;
  }
  return false;
}

function cutInternet(){
  if(internetCut())return;
  state.connectivityBefore=state.connectivity;state.connectivity=OFFLINE_PLAN_ID;state.offlineSince=state.time;state.missedEvents=state.missedEvents||[];
  log("Internet cut","the line is cancelled: no mining, no lookups, no internet bill","operations");
  showToast("The line is cut","Nothing can mine and most screens are dark until you reconnect. The clock is still running, and whatever happens in the world will wait for you.","notice","dashboard");
  save();render();
}
function restoreInternet(){
  if(!internetCut())return;
  const plan=CONNECTIVITY_PLANS.find(x=>x.id===state.connectivityBefore);
  state.connectivity=plan&&plan.id!==OFFLINE_PLAN_ID&&connectivityAvailable(plan)?plan.id:"fixed";
  const days=Math.max(0,Math.round((state.time-(state.offlineSince||state.time))/DAY)),held=(state.missedEvents||[]).length;
  delete state.connectivityBefore;delete state.offlineSince;state.lastReal=Date.now();
  log("Internet reconnected",`${connectivityPlan().name} · after ${days} day${days===1?"":"s"} offline`,"operations");
  const opened=surfaceMissedEvent();
  showToast("Back online",`${connectivityPlan().name} is up again after ${days} day${days===1?"":"s"}. ${held?`${held} major chapter${held===1?"":"s"} of the story happened while you were away${opened?"; the first is open now":""}.`:"Nothing major happened while you were away."}`,"status","dashboard");
  save();render();
}
/* The question put to the player before the line goes: what is still drawing power, and what it will cost to be away. */
function cutInternetPrompt(){
  const fs=fleet(),mc=monthlyCost(),running=fs.activeCount||0;
  return `Cut the internet?\n\n• Nothing can mine, and most screens go dark until you reconnect.\n• The clock keeps running; prices, news and releases wait for you.\n• The internet bill stops. Still due each month: ${fmtUsd(mc.total-mc.internet-mc.nodeNetwork)}${running>0?`, and ${running} machine${running===1?"":"s"} still switched on keep${running===1?"s":""} drawing power. Stop them first if you want the bill to be as small as it can be`:""}.`;
}
function requestCutInternet(){
  if(typeof confirm==="function"&&!confirm(cutInternetPrompt()))return;
  cutInternet();
}
