"use strict";

/* THE PRICE CHART.

   The Market tab carried a decorative squiggle: a hand-drawn SVG path that never moved and
   never meant anything. The one number the whole game turns on had no picture of where it
   had been.

   Three things decide how this is drawn.

   It is drawn in SVG rather than with the 3D renderer. A price line wants hairline strokes,
   axis labels and real text; that is what SVG is good at, it stays crisp at any zoom, and it
   costs nothing next to a second WebGL surface.

   It is drawn on a LOG scale, because bitcoin's recorded price runs from about six cents to
   six figures. On a linear axis every year before 2017 is a flat line on the floor, which is
   not a chart of anything - it is a chart of the last two years with a decade of nothing
   attached.

   And it stops at the simulation's own clock. This is a historical replay: sampling past
   state.time would hand the player the answer to the only question the game asks. The series
   is clipped, not faded, so there is nothing to read ahead. */

const PRICE_CHART_RANGES=[
  {id:"all",label:"All",days:0},
  {id:"5y",label:"5Y",days:1825},
  {id:"1y",label:"1Y",days:365},
  {id:"90d",label:"90D",days:90}
];
function priceChartRange(){
  const wanted=PRICE_CHART_RANGES.find(r=>r.id===state.priceChartRange);
  return wanted||PRICE_CHART_RANGES[0];
}
/* Sample the same interpolation the rest of the game prices against, so the chart cannot
   disagree with the number in the header. */
function priceChartSeries(points=240){
  const now=state.time,first=Math.max(MARKET,GENESIS);
  if(now<=first)return[];
  const range=priceChartRange();
  const from=range.days?Math.max(first,now-range.days*DAY):first;
  if(now-from<DAY)return[];
  const out=[];
  for(let i=0;i<points;i++){
    const t=from+(now-from)*(i/(points-1));
    const price=priceAt(t);
    if(Number.isFinite(price)&&price>0)out.push([t,price]);
  }
  return out;
}
/* Round decade-and-a-half gridlines: 1, 10, 100 and so on, plus the halves, so a log axis
   still reads as money rather than as exponents. */
function priceChartTicks(low,high){
  const ticks=[];
  for(let e=-2;e<=6;e++)for(const mult of [1,3]){
    const value=mult*Math.pow(10,e);
    if(value>=low&&value<=high)ticks.push(value);
  }
  return ticks.length>2?ticks:[low,Math.sqrt(low*high),high];
}
function priceChartSvg(){
  const series=priceChartSeries();
  if(series.length<2)return `<div class="price-chart-empty">No quoted market yet. Bitcoin had no price until a market existed to give it one.</div>`;
  const W=1000,H=300,padL=52,padR=14,padT=14,padB=26;
  const times=series.map(p=>p[0]),prices=series.map(p=>p[1]);
  const t0=times[0],t1=times[times.length-1];
  const low=Math.min(...prices),high=Math.max(...prices);
  // A flat stretch would otherwise divide by zero; give it a little room either side.
  const lo=Math.max(1e-6,low*.85),hi=high*1.15;
  const logLo=Math.log(lo),logHi=Math.log(hi);
  const x=t=>padL+(W-padL-padR)*((t-t0)/Math.max(1,t1-t0));
  const y=v=>padT+(H-padT-padB)*(1-(Math.log(Math.max(1e-6,v))-logLo)/Math.max(1e-9,logHi-logLo));
  const line=series.map((p,i)=>`${i?"L":"M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join("");
  const area=`${line}L${x(t1).toFixed(1)} ${H-padB}L${x(t0).toFixed(1)} ${H-padB}Z`;
  const ticks=priceChartTicks(lo,hi).map(v=>
    `<line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W-padR}" y2="${y(v).toFixed(1)}"/><text x="${padL-6}" y="${(y(v)+3).toFixed(1)}" text-anchor="end">${fmtCompactUsd(v)}</text>`).join("");
  /* Halvings are the game's own calendar, and the only annotations here that are facts
     rather than commentary. Nothing is claimed about what the price did after one. */
  const halvings=[];
  for(let i=1;i<=12;i++){
    const time=halvingTimeAt(i);
    if(time<t0||time>t1)continue;
    if(halvingIsProjected(i))continue;
    halvings.push(`<line class="halving" x1="${x(time).toFixed(1)}" y1="${padT}" x2="${x(time).toFixed(1)}" y2="${H-padB}"/><text class="halving-label" x="${(x(time)+4).toFixed(1)}" y="${padT+9}">halving</text>`);
  }
  const dates=[t0,t0+(t1-t0)/2,t1].map((t,i)=>
    `<text x="${x(t).toFixed(1)}" y="${H-6}" text-anchor="${i===0?"start":i===2?"end":"middle"}">${dateFmt(t,true)}</text>`).join("");
  const last=series[series.length-1];
  return `<svg class="price-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Bitcoin price on a logarithmic scale from ${dateFmt(t0,true)} to ${dateFmt(t1,true)}, ${fmtUsd(low)} to ${fmtUsd(high)}">
    <g class="grid">${ticks}</g>
    <g class="marks">${halvings.join("")}</g>
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    <circle class="now" cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="4"/>
    <g class="dates">${dates}</g>
  </svg>`;
}
/* Provenance, stated rather than assumed. Everything up to the dataset's cutoff is a
   recorded observation; past it the continuation is a model, and this game labels the two
   separately everywhere else. A chart that says RECORDED over modelled prices is exactly the
   kind of quiet dishonesty the footer promises the reader it avoids. */
function priceChartProvenance(){
  const series=priceChartSeries();
  if(!series.length)return "RECORDED";
  const first=series[0][0],last=series[series.length-1][0];
  if(last<=END)return "RECORDED";
  return first<=END?"RECORDED + MODELLED":"MODELLED";
}
function priceChartCard(){
  const series=priceChartSeries();
  const active=priceChartRange().id;
  const prices=series.map(p=>p[1]);
  const now=series.length?series[series.length-1][1]:0;
  const first=series.length?series[0][1]:0;
  const change=first>0?(now/first-1)*100:0;
  /* Over a decade the honest figure is "+84,430,000%", which is a true number nobody can
     read. Past a factor of ten it becomes a multiple instead. */
  const changeText=first<=0?"-":now/first>=10?`×${fmtCompactNumber(Math.round(now/first))}`
    :now/first<=.1?`÷${fmtCompactNumber(Math.round(first/now))}`
    :`${change>=0?"+":""}${fmtNum(Math.round(change))}%`;
  const stats=series.length?`<div class="price-chart-stats">
      <div><span>Now</span><strong>${fmtUsd(now)}</strong></div>
      <div><span>Range high</span><strong>${fmtUsd(Math.max(...prices))}</strong></div>
      <div><span>Range low</span><strong>${fmtUsd(Math.min(...prices))}</strong></div>
      <div><span>Over the range</span><strong class="${change>=0?"up":"down"}">${changeText}</strong></div>
    </div>`:"";
  return `<section class="card span-12 price-chart-card"><div class="card-head"><h2>Bitcoin price</h2><div class="meta">${priceChartProvenance()} · LOG SCALE · TO ${dateFmt(state.time,true).toUpperCase()}</div></div>
    <div class="price-chart-controls">${PRICE_CHART_RANGES.map(r=>`<button class="action small ${r.id===active?"primary":""}" data-action="price-range" data-value="${r.id}">${r.label}</button>`).join("")}</div>
    <div class="price-chart-plot">${priceChartSvg()}</div>
    ${stats}
    <p class="modal-note">${series.length&&series[series.length-1][0]>END?`Recorded daily observations to ${dateFmt(END,true)}, and a model past it - the continuation is not a forecast. `:"Recorded daily observations from the bundled dataset, "}interpolated the same way every other price in the game is. The series stops at the simulation's current date - this is a historical replay, and what happens next is the question.</p></section>`;
}
