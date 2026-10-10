"use strict";

const originalApplyEvent=applyEvent;applyEvent=function(e){originalApplyEvent(e);if(e.imp===3&&state.storyPause)state.eventResume=true};
const originalTick=tick;tick=function(silent=false){const old=state.speed;originalTick(silent);if(!silent&&old!==state.speed)setTimer()};
/* A hidden tab pauses the game. It used to keep ticking at whatever rate the browser allowed and then
   fast-forward on return, so a player came back to months of faults and a bill they had not watched
   arrive. Pausing costs nothing a player wanted; the speed they had is kept, and play does not resume
   by itself. */
let pausedWhileAway=false;
document.addEventListener("visibilitychange",()=>{
  if(!state.started||state.ended)return;
  if(document.visibilityState==="hidden"){
    if(state.speed>0){state.returnSpeed=state.speed;state.speed=0;pausedWhileAway=true;setTimer();save();refreshSpeedControls()}
  }else if(pausedWhileAway){
    pausedWhileAway=false;state.lastReal=Date.now();refreshSpeedControls();
    showToast("Paused while you were away","The clock stops when this tab is hidden. Press play to carry on.","status");
  }
});
holdRendersDuringPress();if(state.ended)state.speed=0;setTimer();startMempoolTimer();
// Existing runs can meet a new letter's condition while paused. Observe them on
// boot too, and persist only after the first render succeeds.
const bootLettersBefore=JSON.stringify(state.correspondence||[]);
updateCorrespondence();render();window.gameBooted=true;
if(JSON.stringify(state.correspondence||[])!==bootLettersBefore)save();
