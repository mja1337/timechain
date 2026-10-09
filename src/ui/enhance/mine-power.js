"use strict";

/* WHAT THE SITE IS DRAWING, AS A PICTURE.

     The numbers were all there - draw, capacity, a load percentage - spread across a metric
     tile and a footnote, so working out how much room was left meant doing arithmetic on a tab
     you were looking at in order to avoid doing arithmetic. And the split that actually matters
     was invisible: a site at 80% load is a different proposition depending on whether the
     cooling plant is taking a tenth of that or a third, because one of those you fix by buying
     a better chiller and the other by buying fewer miners.

     So it is one bar to capacity, segmented by what is drawing it: machines, then plant, then
     what is left. The peak marker sits separately and matters more than the bar - peak is what
     has to fit, and a site drawing 60% today whose peak is 105% is a site that trips the moment
     every machine comes back from repair at once. */
function powerLoadCard(){
  const fs=fleet();
    const cap=Math.max(.001,fs.cap),minerKw=fs.minerW/1000,coolKw=fs.coolingW/1000;
    const pct=v=>Math.max(0,Math.min(100,v/cap*100));
    const minerPct=pct(minerKw),coolPct=pct(coolKw),usedPct=Math.min(100,minerPct+coolPct);
    const peakPct=pct(fs.potentialKw),over=fs.potentialKw>cap;
    const freeKw=Math.max(0,cap-fs.kw);
    const share=fs.kw>0?coolKw/fs.kw*100:0;
    const band=usedPct>=95?"critical":usedPct>=80?"hot":usedPct>=55?"warm":"cool";
    const kw=v=>v<10?v.toFixed(2):fmtNum(Math.round(v));
    return `<section class="card span-12 power-card"><div class="card-head"><h2>Electrical load</h2><div class="meta ${band}">${usedPct.toFixed(0)}% OF ${fmtNum(Math.round(cap))} kW${over?" · PEAK EXCEEDS SUPPLY":""}</div></div>
      <div class="card-pad">
        <div class="power-bar" role="img" aria-label="${escapeHtml(`Drawing ${kw(fs.kw)} of ${kw(cap)} kilowatts: ${kw(minerKw)} machines, ${kw(coolKw)} cooling, ${kw(freeKw)} free`)}">
          <i class="power-seg miners" style="width:${minerPct.toFixed(2)}%"></i>
          <i class="power-seg cooling" style="width:${coolPct.toFixed(2)}%"></i>
          <b class="power-peak ${over?"over":""}" style="left:${Math.min(100,peakPct).toFixed(2)}%" title="Peak draw if every machine runs at once"></b>
        </div>
        <div class="power-split">
          <div><i class="power-key miners"></i><span>Machines</span><strong>${kw(minerKw)} kW</strong><small>${(fs.kw>0?100-share:0).toFixed(0)}% of the draw</small></div>
          <div><i class="power-key cooling"></i><span>Cooling plant</span><strong>${kw(coolKw)} kW</strong><small>${share.toFixed(0)}% of the draw</small></div>
          <div><i class="power-key free"></i><span>Headroom</span><strong>${kw(freeKw)} kW</strong><small>${(100-usedPct).toFixed(0)}% unused</small></div>
          <div><i class="power-key peak"></i><span>Peak if all run</span><strong class="${over?"down":""}">${kw(fs.potentialKw)} kW</strong><small>${peakPct.toFixed(0)}% of supply${over?" · will not fit":""}</small></div>
        </div>
        <p class="modal-note">Peak is what has to fit, not today's draw: machines in repair and manually stopped miners come back. ${share>=30?`Cooling is ${share.toFixed(0)}% of everything this site draws - at that share a more efficient plant buys more headroom than retiring miners does.`:"Cooling scales with the heat the machines make, so it rises with them."}</p>
      </div></section>`;
}

