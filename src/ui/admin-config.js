"use strict";

/* LOCAL SUPER-ADMIN CONFIGURATION.
   This is a content and QA switchboard, not an authentication system. The game has no accounts;
   a real deployment must put authorization on the server rather than trusting this browser flag. */
let adminPageOpen=false;
const ADMIN_CONFIG_DEFAULTS={unlocked:false,copy:true,popups:true,toasts:true,story:true,advanced:true,custodyMap:true};
function adminConfig(){return Object.assign({},ADMIN_CONFIG_DEFAULTS,state.adminConfig||{})}
function uiConfigAllows(key){return adminConfig()[key]!==false}
function adminIsAllowed(){return new URLSearchParams(location.search).get("superadmin")==="1"||!!adminConfig().unlocked}
function adminSettingRows(){
  const c=adminConfig();return [["copy","Educational copy","Show explanatory notes and beginner guidance"],["popups","Pop-ups","Allow historical, risk and consequence dialogs"],["toasts","Toasts","Allow short status notifications"],["story","Bitcoin story","Show the historical story sidebar"],["advanced","Advanced sections","Show optional advanced controls and explanations"],["custodyMap","Custody map","Show the interactive custody and node map"]].map(([id,label,desc])=>`<label class="admin-toggle"><input type="checkbox" data-admin-key="${id}" data-action="admin-toggle" ${c[id]!==false?"checked":""}><span><b>${label}</b><small>${desc}</small></span></label>`).join("")
}
function adminConfiguratorHtml(){
  const c=adminConfig();return `<div class="modal-backdrop"><section class="modal admin-config-modal" data-admin-config-modal role="dialog" aria-modal="true" aria-labelledby="admin-config-title"><div class="modal-top"></div><div class="modal-body"><div class="modal-kicker">Settings · local super-admin tools</div><h2 id="admin-config-title">Configurator</h2><p class="lead">Use this page to test different teaching and interface surfaces before a release. Changes are saved only in this browser.</p><div class="risk medium"><b>Not security</b><br>This is a local QA gate. It does not authenticate an administrator or protect a production deployment. Open this test build with <code>?superadmin=1</code> to unlock it.</div><div class="admin-config-list">${adminSettingRows()}</div><div class="admin-config-status">${c.unlocked?"SUPER-ADMIN MODE ENABLED":"SUPER-ADMIN MODE LOCKED"}</div><div class="modal-actions"><button class="action" data-action="admin-close">Close</button><button class="action danger" data-action="admin-reset">Reset switches</button></div></div></section></div>`;
}
function adminLockedHtml(){return `<div class="modal-backdrop"><section class="modal" data-admin-config-modal role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="modal-body"><div class="modal-kicker">Settings</div><h2 id="settings-title">Local settings</h2><p class="lead">The super-admin configurator is available only in a test build opened with <code>?superadmin=1</code>.</p><p class="modal-note">This gate is deliberately not a security feature: the game runs locally and has no account system. Production administration must be enforced outside the browser.</p><div class="modal-actions"><button class="action primary" data-action="admin-close">Close</button></div></div></section></div>`}
function settingsModalHtml(){return adminIsAllowed()?adminConfiguratorHtml():adminLockedHtml()}
function toggleAdminConfig(key,enabled){if(!Object.prototype.hasOwnProperty.call(ADMIN_CONFIG_DEFAULTS,key))return;state.adminConfig=Object.assign({},ADMIN_CONFIG_DEFAULTS,state.adminConfig||{}, {[key]:!!enabled,unlocked:true});if(key==="popups"&&!enabled){state.activeEvent=null;state.hardwareAlerts.active=null}save();render()}
function resetAdminConfig(){state.adminConfig=Object.assign({},ADMIN_CONFIG_DEFAULTS);save();render()}
function applyAdminUiConfig(){
  const app=document.querySelector(".app");
  if(app){app.classList.toggle("ui-copy-off",!uiConfigAllows("copy"));app.classList.toggle("ui-advanced-off",!uiConfigAllows("advanced"));}
  if(!uiConfigAllows("story"))document.querySelector(".sidebar")?.remove();
  document.querySelectorAll(".account-security-wrap").forEach(el=>el.remove());
  if(typeof accountSecurityCard==="function"&&(activeTab==="market"||activeTab==="pools")){const host=document.querySelector(".content");if(host)host.insertAdjacentHTML("beforeend",`<div class="grid account-security-wrap">${accountSecurityCard(activeTab)}</div>`)}
  document.querySelectorAll("[data-admin-config-modal]").forEach(el=>el.closest(".modal-backdrop")?.remove());
  if(!adminPageOpen)return;
  document.body.insertAdjacentHTML("beforeend",settingsModalHtml());
}
