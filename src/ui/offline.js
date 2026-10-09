"use strict";

/* WHAT YOU CAN SEE WITH THE LINE CUT.

   With the internet cut (src/engine/offline.js) a run is on hold, and the screen has to say so rather than quietly show everything it
   knew a minute ago. An operator with no connection cannot look up a price, reach an exchange, read the news, study, or arrange a
   move; they can still stand in their own mine and read their own books. So:

     open     the Dashboard (replaced by an offline summary), the Mine (the floor, servicing and cooling; the catalogue is
              locked), the Ledger and the Method, because all four are on the machine in front of them;
     locked   everything else, each with a short line about why, and a way back;
     dark     the ticker's outside numbers (price, network hash, difficulty, subsidy, fees, transactions, market value) and the
              Bitcoin story down the side.

   The clock keeps running throughout. Nothing here changes a rule. */

const OFFLINE_OPEN_TABS=["dashboard","mine","ledger","method"];
const OFFLINE_DARK_TICKS=["Illiquid fiat","Custodial BTC","BTC / USD","Network hash","Difficulty","Subsidy","Fees / block","Transactions","Net worth"];
const OFFLINE_TAB_COPY={
  pools:["Pools","You cannot reach a pool, and a pool cannot reach you.","Switching payout scheme, threshold or pool all need a connection."],
  treasury:["Treasury","There is no price to look at, no exchange to reach and no network to send a coin on.","Your keys are safe where you left them; nothing can be bought, sold, moved or borrowed against until you are back online."],
  market:["Market","There is no price to look at and no exchange to reach.","Nothing can be bought or sold."],
  custody:["Custody","Wallets, signers and the coins behind them are all reached over the network.","Nothing can be moved or checked until you are back online."],
  finance:["Finance","Loans, lenders and the bill's options all need a connection.","The bill still arrives: it is on the Dashboard."],
  facilities:["Facilities","You cannot arrange a new site, a move or a different line without a connection.","Rent still falls due at the current one."],
  energy:["Energy","You cannot negotiate a tariff or read the grid without a connection.","The bill for the power you use still arrives."],
  learn:["Learn","There is nothing to study without a connection.","Knowledge comes from reading, and nothing can be read."],
  tech:["Tech","The skill tree is built from what you have studied, and nothing can be studied.","Points you have already earned wait for you."]
};
function offlineTabLocked(tab){return typeof internetCut==="function"&&internetCut()&&!OFFLINE_OPEN_TABS.includes(tab)}

function offlineReconnectButton(label="Reconnect the internet"){
  const before=CONNECTIVITY_PLANS.find(x=>x.id===state.connectivityBefore);
  return `<button class="action primary" data-action="reconnect-internet">${label}</button><span class="label">${before?`${before.name} · ${fmtUsd(internetMonthlyCostFor(before))}/month`:"back to the local line"}</span>`;
}
function internetMonthlyCostFor(plan){return internetMonthlyCost({...state,connectivity:plan.id})}

/* A locked screen: a card that says what cannot be done, and how to get it back. Deliberately not a `.grid`, so no enhancer for the tab
   finds one and fills it with the cards it would have shown. */
function offlineLockHtml(tab){
  const [name,why,more]=OFFLINE_TAB_COPY[tab]||[String(tab),"This needs a connection.",""];
  return `<div class="offline-lock"><section class="card offline-card"><div class="offline-icon" aria-hidden="true">${typeof disasterGlyph==="function"?disasterGlyph("net",54):""}</div><div class="hero-kicker">${name} · no internet</div><h1>You are offline.</h1><p class="lead">${why}</p><p>${more}</p><div class="actions">${offlineReconnectButton()}</div></section></div>`;
}
function offlineHardwareLockCard(){
  return `<section class="card span-12 offline-card"><div class="offline-icon" aria-hidden="true">${typeof disasterGlyph==="function"?disasterGlyph("net",54):""}</div><div class="hero-kicker">Hardware catalogue · no internet</div><h2>You cannot order anything offline.</h2><p>Prices, stock and delivery all need a connection. What is already in transit or in the racks is below.</p><div class="actions">${offlineReconnectButton()}</div></section>`;
}

/* The Dashboard while offline: what the line being cut has done, what is still costing money, and the only thing to do about it. */
function offlineDashboardHtml(){
  const fs=fleet(),mc=monthlyCost(),days=Math.max(0,Math.floor((state.time-(state.offlineSince||state.time))/DAY));
  const still=[["Rent",mc.rent],["Staff",mc.staff],["Insurance",mc.insurance],["Electricity",mc.energy]].filter(x=>x[1]>0.005);
  const runway=mc.total>0.005?state.cash/mc.total:Infinity;
  const drawing=fs.activeCount||0;
  return `<div class="offline-lock offline-dashboard"><section class="card offline-card"><div class="offline-icon" aria-hidden="true">${typeof disasterGlyph==="function"?disasterGlyph("net",54):""}</div>
    <div class="hero-kicker">No internet · since ${dateFmt(state.offlineSince||state.time)} · ${days} day${days===1?"":"s"}</div>
    <h1>The line is cut. You are on hold.</h1>
    <p class="lead">Nothing can mine, and you cannot look anything up. Prices, news, new hardware and the state of the network will all be waiting when you reconnect, and nothing will tell you when to.</p>
    <p>The clock is running. Use the speed buttons at the top to pass the time, and choose when to come back: there is no way to know what you are missing until you do.</p>
    <div class="actions">${offlineReconnectButton()}</div></section>
    <section class="card"><div class="card-head"><h2>What it costs while you wait</h2><div class="meta">${mc.total>0.005?`${fmtUsd(mc.total)} / month`:"NOTHING"}</div></div><div class="card-pad">
      <div class="metric-row"><div class="metric"><div class="label">Cash</div><strong>${fmtUsd(state.cash)}</strong><small>${Number.isFinite(runway)?`lasts about ${runway.toFixed(1)} months at these costs`:"nothing is costing you anything"}</small></div><div class="metric"><div class="label">Internet</div><strong>$0.00</strong><small>cancelled</small></div><div class="metric"><div class="label">Mining</div><strong style="color:var(--red)">STOPPED</strong><small>no line, no pool, no network</small></div><div class="metric"><div class="label">Machines switched on</div><strong style="color:${drawing?"var(--orange2)":"var(--green)"}">${drawing}</strong><small>${drawing?"still drawing power while they earn nothing":"nothing drawing power"}</small></div></div>
      ${still.length?`<p class="modal-note" style="margin-top:12px">Still billed each month: ${still.map(([n,v])=>`${n} ${fmtUsd(v)}`).join(" · ")}. ${drawing?"Stop the machines (the laptop included) in the Mine and the electricity stops with them.":""}`:`<p class="modal-note" style="margin-top:12px">Nothing is billed each month. The bill stays at zero for as long as you stay offline.</p>`}
    </div></section></div>`;
}

function offlineSidebarHtml(){
  return `<aside class="sidebar offline-sidebar"><div class="story-head"><h2>The Bitcoin story</h2></div><p class="modal-note" style="padding:16px">No connection, so no news. Whatever has happened is waiting for you, and arrives when you reconnect.</p></aside>`;
}

/* Called at the end of every full render: dim the outside numbers in the ticker, and mark the locked tabs. */
function applyOfflineChrome(){
  const cut=typeof internetCut==="function"&&internetCut();
  document.body.classList.toggle("is-offline",cut);
  document.querySelectorAll(".ticker .tick").forEach(t=>{const name=t.querySelector(".label")?.textContent.trim();t.classList.toggle("offline-masked",cut&&OFFLINE_DARK_TICKS.includes(name))});
}
