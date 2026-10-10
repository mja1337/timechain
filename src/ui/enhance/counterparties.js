"use strict";

/* WHAT LENDERS AND INSURERS SEE - the custody posture, what is holding it back, and the audit that
   certifies it.

   The arithmetic is in engine/credit.js. This draws it. Every finding is shown with the rung it
   blocks, because a rung the player cannot see how to climb is just a number. */

const POSTURE_COPY={
  none:"The reserve's spending policy or recovery plan is incomplete. This assessment concerns the cold reserve; your online wallet can still have its own working key. The findings below explain what is missing.",
  basic:"The reserve has its required keys and recorded recovery material. Other weaknesses remain: read the findings below before relying on the setup. The game uses this level to calculate lending and theft-cover terms.",
  strong:"The setup passes the game's current checks for keys, backups and locations. That improves lending and theft-cover terms in the simulation. It does not prove the setup can survive every theft, mistake or equipment failure.",
  audited:"The setup passes the game's checks and has a current audit certificate. The certificate affects lending and theft-cover terms; it does not guarantee that the coins are safe. A later change can introduce a new weakness."
};
function postureTone(tier){return tier==="none"?"high":tier==="basic"?"medium":"low"}

function custodyPostureSection(){
  const p=custodyPosture();
  const rows=p.findings.map(f=>`<li><b class="${f.blocks==="basic"?"profit-negative":""}">${f.blocks==="basic"?"Spending or recovery incomplete":"Additional weakness"}</b> · ${f.text}</li>`).join("");
  return `<div class="risk ${postureTone(p.tier)}">Game assessment: ${custodyAssessmentLabel(p.tier)}${p.tier==="audited"?` until ${dateFmt(custodyAuditUntil())}`:""}</div>
    <p class="modal-note">${POSTURE_COPY[p.tier]}</p>
    ${rows?`<ul class="posture-findings">${rows}</ul>`:""}`;
}

function custodyAuditSection(){
  if(state.time<AUDIT_START)return "";
  const job=custodyAuditJob(),reason=auditBlockReason(),last=state.custody.lastAudit;
  if(job){
    const left=Math.max(0,Math.ceil((job.due-state.time)/DAY)),done=Math.max(0,Math.min(100,Math.round((1-(job.due-state.time)/Math.max(DAY,job.due-job.started))*100)));
    return `<div class="incoming-fleet-row"><div class="incoming-fleet-name"><b>Audit under way</b><small>${left}d remaining · your security officer is reviewing the keys</small><div class="bar" style="--w:${done}%;--bar:var(--blue)"><i></i></div></div></div>`;
  }
  const result=last?`<p class="modal-note">Last audit, ${dateFmt(last.at)}: <b class="${last.passed?"profit-positive":"profit-negative"}">${last.passed?"passed":"found problems"}</b>${last.passed?"":`. ${last.findings.join(" ")}`}</p>`:"";
  return `<div class="actions"><button class="action small ${reason?"":"primary"}" data-action="custody-audit" ${reason?`disabled title="${escapeHtml(reason)}"`:""}>Commission an audit · ${fmtUsd(AUDIT_COST)} · ${AUDIT_DAYS} days</button></div>
    ${reason?`<p class="modal-note">${reason}</p>`:`<p class="modal-note">Your security officer reviews the setup and reports every finding, whether or not it passes. A pass is a certificate for a year.</p>`}${result}`;
}

/* Cover against theft: what it costs at today's posture, what it pays, and, because it matters more
   than either, what it will not. */
function custodyCoverSection(){
  if(state.time<COVER_START)return "";
  const p=custodyPosture(),cover=coinCover(),reason=coinCoverBlockReason(),quote=coinCoverQuote(p.tier);
  const excluded=Object.values(COVER_EXCLUDED).map(t=>`<li>${t}</li>`).join("");
  const status=cover
    ?`<div class="risk ${state.time<cover.since+COVER_WAIT_DAYS*DAY?"medium":"low"}">Cover bound ${dateFmt(cover.since)} · ${fmtUsd(coinCoverPremium())} a month${state.time<cover.since+COVER_WAIT_DAYS*DAY?` · pays from ${dateFmt(cover.since+COVER_WAIT_DAYS*DAY)}`:""}</div>`
    :quote?`<p class="modal-note">With your current key and recovery assessment, cover would cost about <b>${fmtUsd(quote.premium)}</b> a month and pay <b>${Math.round(quote.pays*100)}%</b> of a covered theft, from thirty days after it is bound. Addressing the findings can reduce the premium and increase the covered share.</p>`:"";
  return `<h4>Cover against theft</h4>${status}
    <div class="actions"><button class="action small ${cover?"":reason?"":"primary"}" data-action="custody-cover" ${!cover&&reason?`disabled title="${escapeHtml(reason)}"`:""}>${cover?"Cancel cover":"Bind cover"}</button></div>
    ${!cover&&reason?`<p class="modal-note">${reason}</p>`:""}
    <p class="modal-note">It pays for the online wallet being emptied and for a break-in. It does not pay for a venue failing, for coins nobody can spend any more, or for neglect:</p><ul class="posture-findings">${excluded}</ul>`;
}

/* Borrowing against the coins: what is owed, how close the price is to calling it, and the two ways to
   take one out. */
/* How much of what the pledged coins allow to borrow. Defaults to 60%: the same coins at the limit were sold
   within a year in a sixth to a third of the weeks since 2018, and at 60% of it in a fiftieth. */
let securedUseChoice=.6;
function setSecuredUse(v){if(SECURED_USE_LEVELS.includes(v))securedUseChoice=v;render()}
function securedUseChooser(){
  return `<div class="actions"><small class="modal-note">Borrow</small>${SECURED_USE_LEVELS.map(u=>`<button class="action small ${u===securedUseChoice?"primary":""}" data-action="secured-use" data-value="${u}">${u===1?"All it allows":Math.round(u*100)+"% of that"}</button>`).join("")}</div>
    <p class="modal-note">Borrowing less than the coins allow is the only way to make a loan safe. A fall in the price raises the share of the coins' value that is owed, and the further you start from the line, the further it has to fall.</p>`;
}
function securedLoanSummary(l){
  const ltv=securedLtv(),m=SECURED_MODES[l.mode],callIn=l.call?Math.max(0,Math.ceil((l.call.until-state.time)/DAY)):null;
  const bucket=l.mode==="collaborative"?"cold storage":"the hot wallet";
  return `<div class="metric-row">
    <div class="metric"><div class="label">Owed</div><strong>${fmtUsd(l.principal)}</strong><small>${m.name}${l.lender&&securedLender(l.lender)?` with ${securedLender(l.lender).name}`:""} · ${(l.rate*100).toFixed(1)}% a month · ${fmtUsd(securedInterestMonthly())} on each bill</small></div>
    <div class="metric"><div class="label">Pledged</div><strong>${fmtBtc(securedPledgedBtc())}</strong><small>${l.pending?`${fmtBtc(l.pending.gross)} on its way, in ${Math.max(0,Math.ceil((l.pending.due-state.time)/DAY))} days`:l.mode==="collaborative"?"in a wallet the lender co-signs":"held by the lender"}</small></div>
    <div class="metric"><div class="label">Loan to value</div><strong class="${l.call?"profit-negative":""}">${l.pledged>0?Math.round(ltv*100)+"%":"-"}</strong><small>called at ${Math.round(m.callLtv*100)}%, sold at ${Math.round(m.liqLtv*100)}%</small></div></div>
    ${l.warned&&!l.call?`<div class="risk medium">Close to a margin call: the loan is at ${Math.round(ltv*100)}% of the coins' value and is called at ${Math.round(m.callLtv*100)}%.</div>`:""}
    ${l.call?`<div class="risk high">Margin call: repay or add coins within ${callIn} day${callIn===1?"":"s"}, or the lender sells.</div>`:""}
    <div class="actions">${[.25,.5,1].map(sh=>{const pay=l.principal*sh,off=state.cash<pay||l.pending;return `<button class="action small ${l.call&&sh===1?"primary":""}" data-action="secured-repay" data-value="${sh}" ${off?`disabled title="${l.pending?"The pledge is still on its way":"You need "+fmtUsd(pay)}"`:`title="Returns ${Math.round(sh*100)}% of the coins${sh<1?" and keeps the same loan to value":""}."`}>${sh===1?`Repay ${fmtUsd(pay)}`:`Repay ${Math.round(sh*100)}% · ${fmtUsd(pay)}`}</button>`}).join("")}
    <button class="action small" data-action="secured-topup" data-value="0.25" ${l.pending||!(state.wallets[l.mode==="collaborative"?"cold":"hot"]>0)?"disabled":""}>Add 25% of ${bucket}</button></div>`;
}
function securedOffers(){
  return Object.values(SECURED_MODES).map(m=>{
    const reason=securedBlockReason(m.id),blurb=m.id==="collaborative"
      ?"The lender holds one key of your 2-of-3. It cannot move the coins on its own, and if it fails your coins do not move. The coins are swept into the wallet it co-signs, which takes days and a real fee."
      :"You send the coins to the lender, at once, from the hot wallet. It needs nothing of your custody. It lends less and costs more, and the coins become a claim on a company: one of several, picked for you, and you will not be told which of them is sound.";
    const buttons=reason?"":[.25,.5,1].map(f=>{const q=securedQuote(m.id,f,state,securedUseChoice);return `<button class="action small" data-action="secured-borrow" data-mode="${m.id}" data-value="${f}">Pledge ${Math.round(f*100)}% · ${fmtUsd(q.principal)}${q.days?` · ${q.days}d`:""}</button>`}).join("");
    return `<article class="venue"><div class="risk ${reason?"medium":"low"}">LENDS ${Math.round(m.ltv*100)}% · ${(securedRate(m.id)*100).toFixed(1)}% A MONTH</div><h3>${m.name}</h3><p>${blurb}</p>
      <p class="modal-note">Starts at ${Math.round(m.ltv*securedUseChoice*100)}% of the coins' value. Called at ${Math.round(m.callLtv*100)}%, sold at ${Math.round(m.liqLtv*100)}%, with a ${Math.round(SECURED_PENALTY*100)}% penalty.</p>
      ${reason?`<p class="modal-note"><b>Not available:</b> ${reason}</p>`:`<div class="actions">${buttons}</div>`}</article>`;
  }).join("");
}
function custodyLoanSection(){
  if(state.time<SECURED_START)return "";
  const l=securedLoan();
  return `<h4>Borrow against your coins</h4>${l?securedLoanSummary(l):`<p class="modal-note">Raise cash from the reserve without selling it. The loan is a fixed sum against coins that move, so a fall in the price can call it, and the lender can fail.</p>${securedUseChooser()}<div class="venue-grid">${securedOffers()}</div>`}`;
}

function custodyCounterpartiesCard(){
  return `<section class="card span-12 custody-counterparties"><div class="card-head"><h2>What lenders and insurers see</h2><div class="meta">GAME ASSESSMENT</div></div>
    <div class="card-pad">${custodyPostureSection()}${custodyAuditSection()}${custodyCoverSection()}${custodyLoanSection()}</div></section>`;
}
