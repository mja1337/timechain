"use strict";

/* CASH IN THE TOPBAR.

   Cash available lived only in the ticker strip, which scrolls away with the page on a desktop
   and is not shown at all on a phone. So the one number that decides whether you can afford a
   machine was off screen exactly when you were looking at machines.

   The topbar is sticky on every tab, so the readout lives there. It is `state.cash` and nothing
   else: the only money a purchase or a bill can draw on. BTC, investments, custodial claims and
   Lightning are not cash, and the accrued bill is still yours until settlement takes it, so
   neither is added or subtracted. What the readout does do is say when that cash is in trouble:
   red when it is overdrawn or the grid is owed arrears, amber when it will not cover the next
   bill.

   Figures are tabular and the box has a fixed minimum width, so a number ticking every frame
   cannot nudge the clock and speed controls beside it. Desktop shows the exact amount; a phone
   shows the compact one. */
function topbarCashState(forecast=settlementForecast()){
  const cash=state.cash,debt=state.debt||0;
  if(cash<0)return{tone:"is-alert",note:`Overdrawn ${fmtCompactUsd(Math.abs(cash))}`};
  if(debt>0)return{tone:"is-alert",note:`Arrears ${fmtCompactUsd(debt)} owed`};
  if(forecast.cashAfter<0)return{tone:"is-warn",note:`Short ${fmtCompactUsd(Math.abs(forecast.cashAfter))} for bill`};
  return{tone:"",note:`Next bill ${fmtCompactUsd(forecast.estimated)} · ${forecast.days} d`};
}
function topbarCashHtml(forecast){
  const s=topbarCashState(forecast);
  return `<div id="topbar-cash" class="topbar-cash ${s.tone}" title="Cash available: what purchases and bills can draw on now. BTC and investments are not cash until sold."><span class="topbar-cash-label">Cash</span><strong><span id="topbar-cash-full" class="cash-full">${fmtUsd(state.cash)}</span><span id="topbar-cash-compact" class="cash-compact">${fmtCompactUsd(state.cash)}</span></strong><small id="topbar-cash-note">${s.note}</small></div>`;
}
function refreshTopbarCash(forecast){
  const box=document.getElementById("topbar-cash");if(!box)return;
  const s=topbarCashState(forecast),set=(id,value)=>{const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value};
  set("topbar-cash-full",fmtUsd(state.cash));set("topbar-cash-compact",fmtCompactUsd(state.cash));set("topbar-cash-note",s.note);
  box.classList.toggle("is-alert",s.tone==="is-alert");box.classList.toggle("is-warn",s.tone==="is-warn");
}
