"use strict";

/* FOOTER AND NOTICES - the page's last line: where to send feedback, what the game stores, and the
   one notice that says a save had to be set aside.

   Feedback is a plain link to a GitHub issue form. Nothing is sent from here and nothing is
   collected: the link carries the version and the in-game date, the player writes the rest, and
   "Copy debug info" gives them text to paste. There is no analytics call to add and the network
   contract would refuse one. */

const FEEDBACK_REPO="https://github.com/mja1337/timechain";
/* So people without a GitHub account can write. The footer shows the link only when this is set. */
const FEEDBACK_EMAIL="satoshistaysrad@proton.me";
/* A tip over Lightning, through a payment page. A plain outbound link: no address is shown here, nothing is
   embedded, and nothing is requested until the player follows it. */
const TIP_URL="https://strike.me/@jandex";
const TIP_BOLT=`<svg width="11" height="13" viewBox="0 0 11 13" aria-hidden="true"><path d="M6.6 0 0 7.4h4.1L3.4 13 11 5H6.8z" fill="currentColor"/></svg>`;

function feedbackUrl(template="bug.yml"){
  const query=new URLSearchParams({template,version:APP_VERSION,ingame_date:dateFmt(state.time)});
  return `${FEEDBACK_REPO}/issues/new?${query}`;
}
function feedbackLinks(){
  const mail=FEEDBACK_EMAIL?` · <a href="mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Timechain "+APP_RELEASE)}">Email</a>`:"";
  return `<a href="${escapeHtml(feedbackUrl("bug.yml"))}" target="_blank" rel="noopener noreferrer">Report a bug</a> · <a href="${escapeHtml(feedbackUrl("idea.yml"))}" target="_blank" rel="noopener noreferrer">Suggest something</a>${mail} · <button data-action="copy-debug">Copy debug info</button>`;
}
function footerHtml(){
  const unreadable=unreadableSaveKept?` · <button data-action="export-unreadable">Export unreadable save</button>`:"";
  return `<footer class="footer"><span>Historical simulation · recorded, derived and modelled data are labelled separately · not financial advice</span><span><button data-action="tour-start">Tour</button> · ${feedbackLinks()} · <button data-action="notification-settings">Notifications</button> · <button data-action="settings">Settings</button> · <button data-action="story-pause">Story pause: ${state.storyPause?"on":"off"}</button> · <button data-action="export">Export save</button> · <button data-action="import">Import save</button> · <button data-action="reset">New run</button>${unreadable}<input id="importSave" type="file" accept="application/json,.json" hidden></span><span class="footer-privacy">No accounts, no tracking, no analytics. Your game is saved only in this browser (local storage) and nothing leaves it. Clearing site data deletes it, so use Export save to keep a copy.</span><span class="footer-tipline"><a class="footer-tip" href="${TIP_URL}" target="_blank" rel="noopener noreferrer" title="Opens a Lightning payment page in a new tab">${TIP_BOLT}Lightning Tips</a></span></footer>`;
}
/* Shown once after a load that set a save aside, above everything including modals. */
function saveNoticeHtml(){
  if(!saveProblem)return "";
  const kept=saveProblem.kept;
  return `<div class="save-notice" role="alert"><div><strong>Your previous save could not be read</strong><span>${kept?"A copy of it was kept in this browser, so nothing is lost. Export it and send it with a bug report and we can try to recover it.":"This browser would not keep a copy of it."} Reason: ${escapeHtml(saveProblem.reason)}.</span></div><div class="push actions">${kept?`<button class="action small" data-action="export-unreadable">Export it</button>`:""}<button class="action small primary" data-action="save-notice-dismiss">Dismiss</button></div></div>`;
}
