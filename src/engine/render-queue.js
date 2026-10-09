"use strict";

/* WHEN THE SCREEN GETS REDRAWN.

   Split out of simulation.js, which owns the clock; this owns the question of when the clock's
   effects reach the glass. They are separate concerns and the module ceiling was right to say
   so - simulation.js had been sitting a few hundred bytes under the limit for a while, and the
   honest fix was a seam rather than shorter comments.

   Loaded BEFORE simulation.js as a precaution, not a live requirement. These are top-level
   `let` bindings, so they sit in the temporal dead zone until this file is evaluated, and
   simulation.js runs 146 top-level statements at load. Checked: none of them reaches a repaint
   flag today, and loading this second does in fact boot cleanly. But "none of 146 statements
   happens to touch it" is a property of today's migrations, not a rule anyone is keeping - the
   next migration that sets renderFullQueued would be a ReferenceError before the first frame,
   for whichever saves take that path. Ordering it correctly costs nothing; discovering this
   later would cost a crash on load that only some players see. Same trap that already forces
   operator.js ahead of simulation.js, where it is load-bearing rather than precautionary. */
let renderQueued=false,renderUrgentQueued=false,renderFullQueued=false,renderScheduleToken=0,lastRenderAt=0;

/* Long enough that a visible tab paints from the frame, short enough that a hidden one is not
   visibly behind when brought forward. */
const RENDER_FRAME_GRACE=140;
function queueRender(full=false){
  const now=performance.now();
  renderFullQueued=renderFullQueued||full;
  /* A modal opening or closing is not a repaint, it is an answer. A major event stops the
     clock; the dialog saying why must not sit behind up to 600ms of repaint throttle and then
     wait for an animation frame - a frame the browser owes a backgrounded tab nothing at all.
     Urgency is therefore decided BEFORE the already-queued check: a lazy paint scheduled by
     the previous tick used to swallow the very repaint that puts the dialog on screen, which
     is what left the timeline stopped with nothing to explain it. */
  const urgent=typeof modalSignature==="function"&&modalSignature()!==lastModalSignature;
  if(renderQueued&&!(urgent&&!renderUrgentQueued))return;
  const paint=()=>{
    // A superseded rAF callback can still arrive after an urgent paint has run; it has
    // nothing left to draw.
    if(!renderQueued)return;
    const needsFull=renderFullQueued;renderQueued=false;renderUrgentQueued=false;renderFullQueued=false;lastRenderAt=performance.now();
    /* An incident starting or ending changes the strip above the tab content, which only a
       full render draws - patching the tab would leave a stale banner counting down to a
       date already gone. A modal appearing or clearing is the same kind of change for the same
       reason: renderMineContent() patches the tab body, and a modal is not inside it. On every
       tab but Mine that fell through to render() and the bug stayed invisible. */
    if(state.started&&typeof bannerStateChanged==="function"&&bannerStateChanged())render();
    else if(typeof modalStateChanged==="function"&&modalStateChanged())render();
    else if(!needsFull&&state.started&&!state.activeEvent&&!state.ended)refreshLive();else renderMineContent();
  };
  renderQueued=true;
  if(urgent){renderUrgentQueued=true;setTimeout(paint,0);return}
  // Faster clocks repaint less often, not more: at 16x the simulation covers
  // eight days a second, so a repaint every frame is unreadable jitter.
  const refreshInterval=state.speed>=16?600:state.speed>=8?420:state.speed>=4?320:250;
  const delay=Math.max(0,refreshInterval-(now-lastRenderAt));
  /* Frame aligns the write; timer covers the tab the frame never comes to. On rAF alone a
     hidden tab never painted and renderQueued stayed true, so later repaints were dropped
     too. Token stops a stale fallback outrunning a newer schedule. Contract has the detail. */
  const token=++renderScheduleToken;
  const paintIfCurrent=()=>{if(token===renderScheduleToken)paint()};
  setTimeout(()=>requestAnimationFrame(paintIfCurrent),delay);
  setTimeout(paintIfCurrent,delay+RENDER_FRAME_GRACE);
}
