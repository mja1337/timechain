"use strict";

/* CONFETTI, FOR THE TWO MOMENTS THAT EARN IT.

   Most of this game is a long run of small decisions, and two things in it are genuinely big: the day Bitcoin first has a market price
   (the whole of the opening is building to it) and the day a run is finished and scored. Each gets a burst of confetti over its window.
   One canvas, drawn for a few seconds and then removed, no library and no asset, and nothing at all for a player who has asked their
   browser for reduced motion. A run that ends in failure gets its end screen and no confetti: it is not that kind of moment.

   It draws on top of the page and takes no clicks. It decides nothing. */

const CONFETTI_COLORS=["#f7931a","#ffc267","#86c79a","#77a9c9","#e8ece9","#ff766f","#b69ce0"];
const confettiShown=new Set();
function confettiAllowed(){return !(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)}
function confettiBurst(){
  if(!confettiAllowed()||document.querySelector(".confetti-canvas"))return false;
  const canvas=document.createElement("canvas"),ratio=Math.min(2,window.devicePixelRatio||1),w=window.innerWidth,h=window.innerHeight;
  canvas.className="confetti-canvas";canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.width=w+"px";canvas.style.height=h+"px";canvas.setAttribute("aria-hidden","true");
  document.body.appendChild(canvas);
  const ctx=canvas.getContext("2d");if(!ctx){canvas.remove();return false}
  ctx.scale(ratio,ratio);
  // Two cannons low on either side, and a rain from the top, so it reads as thrown rather than as snow.
  const pieces=[];
  for(let i=0;i<260;i++){
    const cannon=i<140,side=i%2?1:-1;
    pieces.push({
      x:cannon?(side>0?w-20:20):Math.random()*w,y:cannon?h*.85:-20-Math.random()*h*.4,
      vx:cannon?-side*(4+Math.random()*9):(Math.random()-.5)*3,vy:cannon?-(11+Math.random()*11):1+Math.random()*3,
      size:6+Math.random()*7,rot:Math.random()*6.3,vr:(Math.random()-.5)*.35,color:CONFETTI_COLORS[i%CONFETTI_COLORS.length],round:i%5===0
    });
  }
  const born=performance.now(),life=5200;
  (function frame(now){
    const t=now-born;
    ctx.clearRect(0,0,w,h);
    for(const p of pieces){
      p.vy+=.28;p.vx*=.992;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;
      ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,(life-t)/1400));ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.color;
      if(p.round){ctx.beginPath();ctx.arc(0,0,p.size/2,0,6.3);ctx.fill()}else ctx.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);
      ctx.restore();
    }
    if(t<life)requestAnimationFrame(frame);else canvas.remove();
  })(born);
  return true;
}
/* Called at the end of every full render. Each moment is celebrated once per page load, however many times its window is repainted. */
function maybeCelebrate(){
  const ev=state.activeEvent&&EVENTS.find(e=>e.id===state.activeEvent);
  if(ev&&ev.celebrate&&document.querySelector(".event-celebrate")&&!confettiShown.has(ev.id)){confettiShown.add(ev.id);confettiBurst();return}
  const finished=state.ended&&!state.endDismissed&&state.endReason!=="receivership"&&state.endReason!=="nomarket";
  if(finished&&document.querySelector(".modal .leaderboard")&&!confettiShown.has("end")){confettiShown.add("end");confettiBurst()}
}
