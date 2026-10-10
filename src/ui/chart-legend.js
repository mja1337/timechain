"use strict";

/* CHART LEGENDS.

   Every chart used to hand-roll its own key: a 9px row of 12x2 bars under the price chart, a
   9x3 tick under the tariff model, round-cornered squares beside the pies, a key on the Finance
   strip whose green swatch matched no segment of the bar it described. Each was a little
   different in size, spacing and placement, and several drew a solid swatch for a dashed line.

   One helper now draws them all, so a key reads the same wherever it appears:

   - the swatch is drawn in the series' own style - solid line, dashed line, line over a filled
     area, a block for a slice or bar segment, a dot for a marker - so it can be matched to the
     plot by shape as well as by colour;
   - the label is followed by the value it stands for, in tabular figures, where there is one;
   - the units or scale go in a trailing note rather than being left for the reader to guess;
   - the key sits above the plot, inside the card's own padding, and wraps on a phone instead
     of clipping or sliding under an axis.

   items: [{label, color, style, value, note, emphasis, ring}]
     style: "line" | "dash" | "area" | "block" | "dot" | "ring"
   opts:  {layout: "inline" | "list", note, label, className} */
function chartLegendHtml(items,opts={}){
  const layout=opts.layout==="list"?"list":"inline";
  const rows=(items||[]).filter(Boolean).map(item=>{
    const style=["line","dash","area","block","dot","ring"].includes(item.style)?item.style:"line";
    const hasValue=item.value!==undefined&&item.value!==null&&item.value!=="";
    return `<li class="chart-key-item${item.emphasis?" is-emphasis":""}"><i class="chart-key-swatch is-${style}" style="--key:${item.color||"var(--muted)"}" aria-hidden="true"></i><span class="chart-key-label">${item.label}</span>${hasValue?`<b class="chart-key-value">${item.value}</b>`:""}${item.note?`<small class="chart-key-note">${item.note}</small>`:""}</li>`;
  }).join("");
  const note=opts.note?`<li class="chart-key-meta">${opts.note}</li>`:"";
  return `<ul class="chart-key chart-key-${layout}${opts.className?" "+opts.className:""}" aria-label="${opts.label||"Chart key"}">${rows}${note}</ul>`;
}
/* The Network share card is redrawn by the live refresh as well as by the full render; one
   definition keeps the two from drifting apart. */
function networkShareLegendHtml(hash,competition){
  return chartLegendHtml([
    {label:"You",value:fmtHash(hash),color:"var(--orange)",style:"block"},
    {label:"Effective competitors",value:fmtHash(competition),color:"#1a2325",style:"ring"}
  ],{layout:"list",label:"Network share key",className:"chart-key-share"});
}
/* "×12.4" since the start of the series, or "÷3.1" when it fell: the indexed lines on the
   Dashboard are compared by slope, so the multiple is the number worth printing. */
function chartMultipleLabel(first,last){
  if(!(first>0)||!(last>0))return "";
  const m=last/first;
  if(m>=1)return `×${m>=100?fmtCompactNumber(Math.round(m)):m.toFixed(m>=10?1:2)}`;
  const d=1/m;return `÷${d>=100?fmtCompactNumber(Math.round(d)):d.toFixed(d>=10?1:2)}`;
}
const SELF_HELD_CHART_KEY={label:"Self-held BTC",note:"log scale · run start to today"};
