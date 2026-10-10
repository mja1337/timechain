"use strict";

/* WHAT A DATED EVENT DOES TO THE PLAYER. The calendar says an event happened; this is the part that reaches into
   the operation: a lender failing, a vendor's customer list leaking, a ban closing a site. Pulled out of
   simulation.js, which is at its size ceiling, and loaded straight after it. Called only from the tick. */

/* A vendor losing its customer list is a privacy event with a date and a scope. It reaches
   the people who bought from that vendor inside the window the disclosure describes, and it
   keeps reaching them: a leaked record cannot be un-leaked by buying a different device.
   What it never does is move coins by itself, or prove the device was compromised. */
function applyEvent(e){
  if(typeof e.fx==="string"&&e.fx.indexOf("lender")===0)applyLenderFailure(e.fx.split(":")[1]||"celsius");
  if(e.fx==="coldcardentropy"){
    state.custody.entropyAlert={since:state.time};
    const weak=custodyWeakKeys();
    if(weak.length)log("Your seeds are in the affected window",
      `${weak.length} key${weak.length===1?"":"s"} generated on a Coldcard between March 2021 and the patch`,"custody");
  }
  if(e.fx==="ledgerleak"){
    state.custody.exposure.push({supplier:"ledger",at:state.time,from:"2016-06-01",to:"2020-06-30",
      source:e.src||e.source||"vendor disclosure"});
    const hit=custodyExposedPurchases();
    if(hit.length)log("Your purchase is in the leaked records",
      `${hit.length} device order${hit.length===1?"":"s"} bought from Ledger in the affected window`,"custody");
  }
  applyVenueFailure(e.fx);
  if(e.fx==="china"&&state.region==="sichuan"){state.policyLock="Mining prohibited in Sichuan - relocate your fleet";state.power=false;log("Sichuan site closed","policy");if(typeof custodyOnRegionalBan==="function")custodyOnRegionalBan(e.fx)}
  if(e.fx==="kazakh"&&state.region==="kazakhstan"){state.policyLock="Kazakhstan internet shutdown - relocate or wait";state.power=false;log("Kazakhstan site offline","network")}
  if(e.fx==="computenorthx"){state.hardwareGlut={discount:.15,until:state.time+DAY*120};log("Compute North liquidation glut","Secondary ASIC prices soften for a season","fleet")}
  if(e.fx==="corescix"){state.hardwareGlut={discount:.22,until:state.time+DAY*180};log("Core Scientific liquidation glut","Secondary ASIC prices soften further","fleet")}
  if(e.fx==="riotx"&&state.region==="texas"){state.powerRateShock={multiplier:1.12,until:state.time+DAY*90};log("Regional grid strain","Texas power rates tick up while a large neighboring miner scales its load","operations")}
  // With the line cut nobody hears of it: the chapter is held, and its skill point and its modal come when the line is back.
  if(e.storyPopup&&internetCut()&&state.storyPause){queueMissedEvent(e);return}
  if(e.imp===3&&internetCut()&&(state.storyPause||e.celebrate)){queueMissedEvent(e);return}
  if(e.imp===3)state.points+=1;
  // Opening of the market is shown whether or not story pauses are on: it is the moment the first months were building towards.
  if(e.imp===3&&(state.storyPause||e.celebrate)){state.returnSpeed=state.speed||state.returnSpeed||1;state.speed=0;state.activeEvent=e.id}
  if(e.storyPopup&&state.storyPause){state.returnSpeed=state.speed||state.returnSpeed||1;state.speed=0;state.activeEvent=e.id}
}
