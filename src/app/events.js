"use strict";

let recentTouchTab=null;
installEventPerspectiveInteractions();
document.getElementById("app").addEventListener("click",e=>{
  const b=e.target.closest("[data-action]");if(!b||b.disabled)return;const a=b.dataset.action,v=b.dataset.value,id=b.dataset.id,part=b.dataset.part;
  if(b.closest(".toast")){dismissToast();if(a==="dismiss-toast")return}
  if(["notification-settings","notification-reduction","notification-prompt-close"].includes(a)){notificationAction(a,v);return}
  if(a==="settings"){adminPageOpen=true;render();return}
  if(a==="admin-close"){adminPageOpen=false;render();return}
  if(a==="admin-toggle"){toggleAdminConfig(b.dataset.adminKey,b.checked);return}
  if(a==="admin-reset"){resetAdminConfig();return}
  if(a==="tab"&&recentTouchTab&&recentTouchTab.value===v&&Date.now()-recentTouchTab.at<800){recentTouchTab=null;return}
  if(a==="blocked-help"){showToast("Why this is unavailable",b.dataset.help||"This action is not available in the current state.");return}
  if(a==="trade-preset"){setTradeAmount(b.dataset.tradeKey,Number(v));return}
  if(a==="percent-snap"){updateTradePercentage(id,Number(v));return}
  if(a==="close-hardware-alert"){closeHardwareAlert(false);return}
  if(a==="inspect-hardware-release"){closeHardwareAlert(true);return}
  if(a==="hardware-power"){if(b.classList.contains("power-pending"))return;const on=v==="on",qty=Number(b.dataset.qty)||1;b.disabled=true;b.classList.add("power-pending",on?"to-on":"to-off");setTimeout(()=>setHardwarePower(id,on,qty),1000);return}
  if(a==="cancel-transaction"){cancelTransactionConfirmation();return}
  if(a==="confirm-transaction"){confirmTransaction();return}
  if(CONFIRMABLE_ACTIONS.has(a)||(a==="transfer"&&b.dataset.from==="cold")){requestTransactionConfirmation(b);return}
  if(a==="activity-filter"){activityFilter=ACTIVITY_CATEGORIES.includes(v)?v:"all";activityLimit=100;render();return}
  if(a==="activity-more"){activityLimit+=100;render();return}
  if(a==="starting-mode"){if(STARTING_MODES.some(mode=>mode.id===v)){introDifficulty=v;introStep=1;render()}return}
  if(a.indexOf("tour-")===0){tourAction(a);return}
  // The tour promises the clock is held, so the speed buttons say so rather than quietly starting it. Pausing is always allowed.
  if(a==="speed"&&Number(v)>0&&tourActive()){showToast("The tour is holding the clock","Finish or skip the tour to start playing.","blocked");return}
  if(a==="copy-debug"){copyDebugInfo(b);return}
  if(a==="export-unreadable"){const raw=unreadableSaveText();if(raw)downloadText(raw,"timechain-save-unreadable.json");return}
  if(a==="save-notice-dismiss"){saveProblem=null;render();return}
  if(a==="dismiss-guidance"){if(id&&!state.guidance.dismissed.includes(id)){state.guidance.dismissed.push(id);save()}render();return}
  if(a==="mobile-menu"){mobileMenuOpen=!mobileMenuOpen;render(false);return}
  if(a==="mobile-menu-section"){mobileMenuSection=v;mobileMenuOpen=true;render(false);return}
  if(a==="begin"){const mode=startingMode(introDifficulty),liquidity=clampStartingLiquidity(introStartingCash);state.cash=liquidity;state.startingCash=liquidity;state.time=mode.start;state.campaignStart=mode.start;state.lastMonth=new Date(mode.start).toISOString().slice(0,7);state.difficulty=mode.id;state.started=true;state.seen=["genesis"];log("Campaign start selected",`${mode.label} · ${dateFmt(mode.start)} · ${fmtUsd(liquidity)} starting liquidity`,"operations");awardLearning(LEARNING.find(x=>x.id==="cryptomailinglist"));if(!state.startingGrant){state.points+=1;state.startingGrant=true;log("Genesis operator grant","+1 skill point")}state.walletSetup={done:false,step:0,rolls:[],keyHex:"",required:true,resumeSpeed:mode.id==="hard"||mode.id==="impossible"?0:1};state.speed=0;save();setTimer();render()}
  else if(a==="intro-next"){introStep=Math.min(INTRO_SLIDES.length-1,introStep+1);render()}
  else if(a==="intro-back"){introStep=Math.max(0,introStep-1);render()}
  else if(a==="wallet-demo"){state.walletSetup={done:false,step:0,rolls:[],keyHex:"",demo:true,resumeSpeed:state.speed};state.speed=0;save();setTimer();render()}
  else if(a==="wallet-setup-start"){state.walletSetup.step=1;save();render()}
  else if(a==="dice-roll")rollDie();
  else if(a==="dice-record")recordDieRoll(v||document.querySelector("[data-dice-face]")?.value);
  else if(a==="dice-finish")finishRolling();
  else if(a==="wallet-paper-recorded")recordWalletPaper();
  else if(a==="wallet-paper-destroyed")destroyWalletPaper();
  else if(a==="wallet-oath")takeWalletOath();
  else if(a==="wallet-setup-skip")skipWalletSetup();
  else if(a==="wallet-setup-done")completeWalletSetup(v==="backup");
  else if(a==="upgrade-wallet-software")upgradeWalletSoftware();
  else if(a==="claim-faucet")claimFaucet();
  else if(a==="start-learning")startLearning(id);
  else if(a==="learning-check")answerLearningCheck(v);
  else if(a==="order-parts")orderParts(id,Number(v));
  else if(a==="service-hw")serviceHardware(id);
  else if(a==="service-part")serviceHardwarePart(id,part);
  else if(a==="price-range"){state.priceChartRange=v;save();render(false)}
  else if(a==="floor3d-zoom"){if(typeof floor3dZoomBy==="function")floor3dZoomBy(v==="in"?1.35:1/1.35)}
  else if(a==="floor3d-reset"){if(typeof floor3dResetView==="function")floor3dResetView()}
  else if(a==="mine-section"){state.mineSection=v;save();renderMineContent();window.scrollTo({top:0,behavior:"smooth"})}
  else if(a==="convert-immersion")convertToImmersion(id,Number(v));
  else if(a==="drain-immersion")revertFromImmersion(id,Number(v));
  else if(a==="repair-remove-old")repairRemoveOldPart(id);
  else if(a==="repair-tap")repairTapSlot(id,b.dataset.slot);
  else if(a==="repair-cable")repairCableClick(id,b.dataset.slot);
  else if(a==="repair-nudge")repairNudgeDial(id,b.dataset.delta);
  else if(a==="focus-service")focusServiceRow(id);
  else if(a==="payout-destination")setPayoutDestination(v);else if(a==="payout-threshold")setPayoutThreshold(v);else if(a==="sell-cooling")sellCooling(id);else if(a==="cancel-cooling")cancelCoolingOrder(id);else if(a==="buy-cooling")buyCooling(id);
  else if(a==="gift-card")buyGiftCard(id,Number(v));
  else if(a==="workshop-select")selectWorkshop(id,v);
  else if(a==="workshop-focus")focusWorkshopDevice(id,v);
  else if(a==="workshop-inspect")inspectWorkshopDevice(id);
  else if(a==="workshop-prepare")prepareWorkshopDevice(id);
  else if(a==="workshop-locations"){const el=document.querySelector('.workshop-locations');if(el){el.open=true;el.scrollIntoView({block:"center",behavior:"smooth"})}}
  else if(a==="custody-buy")orderCustodyProduct(id,1);
  else if(a==="custody-assemble")assembleCustodyBuild(id);
  else if(a==="custody-genkey")generateCustodyKey(id);
  else if(a==="custody-restore"){
    // Restoring the newest seed onto a spare device, which is the common real mistake:
    // it looks like adding a signer and adds no key at all.
    const spare=state.custody.keys[state.custody.keys.length-1];
    if(spare)restoreCustodyKey(id,spare.id);
  }
  else if(a==="custody-backup")backupCustodyKey(id,v);
  else if(a==="custody-assign")assignCustodyKey(id);
  else if(a==="custody-unassign")unassignCustodyKey(id);
  else if(a==="custody-policy")setCustodyPolicy(id);
  else if(a==="custody-config")backupCustodyConfig();
  else if(a==="custody-audit")commissionCustodyAudit();
  else if(a==="custody-cover")toggleCoinCover();
  else if(a==="secured-borrow")borrowSecured(b.dataset.mode,Number(v),{use:securedUseChoice});
  else if(a==="secured-use")setSecuredUse(Number(v));
  else if(a==="secured-repay")repaySecuredLoan(Number(v)||1);
  else if(a==="secured-topup")addSecuredCollateral(Number(v));
  else if(a==="settle-borrow")borrowForSettlement(v);
  else if(a==="custody-holder")setKeyHolder(id,v);
  else if(a==="custody-rotate")rotateCustodyKey(id,v,b.dataset.rush==="1");
  else if(a==="custody-wipe")wipeCustodySigner(id);
  else if(a==="custody-move")moveCustodyItem(b.dataset.kind,id,v);
  else if(a==="custody-restore-key")restoreCustodyKey(id,v);
  else if(a==="custody-lesson"){custodyLesson=v;render()}
  else if(a==="select-venue"){selectedVenue=v;render()}
  else if(a==="patch-firmware")patchFirmware();
  else if(a==="node-storage")upgradeNodeStorage(Number(v));
  else if(a==="node-prune")toggleNodePruning();
  else if(a==="node-mode")setNodeMode(v);
  else if(a==="buy-backup-node")buyBackupNode();
  else if(a==="buy-phone")buyPhone();
  else if(a==="toggle-account-2fa")toggleAccountTwoFA(v);
  else if(a==="upgrade-account-security")upgradeAccountSecurity();
  else if(a==="donate-btc")donateBtc(id,Number(v));
  else if(a==="buy-strategy")buyStrategy(id,Number(v));
  else if(a==="sell-strategy")sellStrategy(id,Number(v));
  else if(a==="contract")setContract(id);
  else if(a==="connectivity")setConnectivityPlan(id);
  else if(a==="reconnect-internet")restoreInternet();else if(a==="cut-internet")requestCutInternet();
  else if(a==="settle-btc"){state.settlementSaleMode=true;activeTab=openTab("market");save();render()}
  else if(a==="cancel-settlement-sale"){state.settlementSaleMode=false;render()}
  else if(a==="settle-liquidate")liquidateForSettlement();
  else if(a==="settle-bridge")takeBridgeFinance();
  else if(a==="settle-receivership")enterReceivership();
  else if(a==="hire-staff")hireStaff(id);
  else if(a==="dismiss-staff")dismissStaff(id);
  else if(a==="insurance")toggleInsurance();
  else if(a==="project-loan")takeProjectLoan();
  else if(a==="repay-loan")repayProjectLoan();
  else if(a==="speed"){state.speed=Number(v);state.returnSpeed=state.speed||state.returnSpeed;setTimer();save();refreshSpeedControls();refreshLive()}
  else if(a==="treasury-section")setTreasurySection(v);
  else if(a==="tab"){activeTab=openTab(v);mobileMenuOpen=false;render(false);const anchor=b.dataset.anchor;if(anchor)setTimeout(()=>revealMethodAnchor(anchor),60);else window.scrollTo({top:0,behavior:"smooth"})}
  else if(a==="method-chapter")revealMethodAnchor(id);
  else if(a==="glossary"){glossaryOpen=true;render(true);setTimeout(()=>document.querySelector("[data-glossary-search]")?.focus(),0)}
  else if(a==="close-glossary"){glossaryOpen=false;render(true)}
  else if(a==="glossary-method"){glossaryOpen=false;activeTab="method";render(false);const anchor=b.dataset.anchor;setTimeout(()=>revealMethodAnchor(anchor),60)}
  else if(a==="activate-hw")activateHardware(id);else if(a==="decommission-hw")decommissionHardware(id,Number(v));else if(a==="buy-hw")buyHardware(id,Number(v));else if(a==="buy-hw-btc")buyHardwareBtc(id,Number(v));else if(a==="sell-hw")sellHardware(id,Number(v));else if(a==="sell-hw-btc")sellHardwareBtc(id,Number(v));else if(a==="facility")upgradeFacility(id);else if(a==="region")moveRegion(id);else if(a==="buy-node")buyNode(Number(v));
  else if(a==="buy-btc")buyBtc(id,actionFraction(b));else if(a==="sell-btc")sellBtc(id,actionFraction(b));else if(a==="lightning")deployLightning(Number(v));else if(a==="lightning-withdraw")withdrawLightning();else if(a==="transfer")transfer(b.dataset.from,b.dataset.to,actionFraction(b));else if(a==="speculate")takeSpeculation(id,Number(v));else if(a==="skill")unlockSkill(id);
  else if(a==="mode"){if(state.mode!==v){state.mode=v;log(v==="pool"?"Pool mining selected":"Solo mining selected",v==="pool"?poolData().name:"No pool fee","operations")}save();render()}else if(a==="pool"){const selected=poolData(v);if(availablePool()&&selected&&!poolClosed(v)&&poolEligible(selected)){state.pool=v;state.mode="pool";log("Mining pool changed",`${selected.name} · ${(poolFee()*100).toFixed(2)}% fee`,"operations");save();render()}}else if(a==="toggle-power")toggleSitePower();else if(a==="toggle-overdrive"){state.overdrive=!state.overdrive;log(state.overdrive?"Overdrive engaged":"Overdrive disengaged",state.overdrive?"+15% hash · +25% power draw · elevated wear and fault risk":"Back to rated settings","fleet");save();render()}else if(a==="toggle-auto-repair"){if(fieldTechnicianCount()<1)return;state.autoRepair=!state.autoRepair;log(state.autoRepair?"Auto-repair enabled":"Auto-repair disabled",state.autoRepair?"Technician crew will service faulted units automatically while parts are in stock":"Repairs need to be started manually again","fleet");save();renderMineContent()}
  else if(a==="settle-defer")deferSettlement();else if(a==="settle-fetch")fetchReserve(false);else if(a==="settle-fetch-rush")fetchReserve(true);else if(a==="pay-debt")payDebt();else if(a==="story"){state.activeEvent=id;state.eventResume=false;render()}
  else if(a==="close-loss")dismissLoss();
  else if(a==="close-event"){state.activeEvent=null;resumeAfterModals();if(surfaceMissedEvent()){save();render();return}activateNextHardwareAlert();setTimer();save();render()}
  else if(a==="continue-run"){state.ended=false;state.endDismissed=true;state.sandbox=true;state.speed=state.returnSpeed||1;log("Sandbox continuation started","historical feed complete");save();setTimer();render()}
  else if(a==="close-end"){state.endDismissed=true;save();render()}else if(a==="story-pause"){state.storyPause=!state.storyPause;save();render()}
  else if(a==="reset")resetGame();else if(a==="export")exportSave();else if(a==="import")document.getElementById("importSave").click();
});
// A horizontally-scrollable tab strip can occasionally consume a touch click as a scroll gesture.
// Commit the selected tab on touch release, then ignore its synthetic click.
document.getElementById("app").addEventListener("pointerup",e=>{
  if(e.pointerType!=="touch")return;
  const b=e.target.closest('[data-action="tab"]');if(!b||b.disabled)return;
  recentTouchTab={value:b.dataset.value,at:Date.now()};activeTab=openTab(b.dataset.value);mobileMenuOpen=false;render(false);window.scrollTo({top:0,behavior:"smooth"});
});
document.getElementById("app").addEventListener("input",e=>{if(e.target.matches("[data-starting-cash]")){introStartingCash=clampStartingLiquidity(e.target.value);document.querySelectorAll("[data-starting-cash]").forEach(input=>{if(input!==e.target)input.value=introStartingCash});const output=document.querySelector("[data-starting-cash-output]");if(output)output.textContent=fmtUsd(introStartingCash)}else if(e.target.matches("[data-percent-input]"))updateTradePercentage(e.target.dataset.percentInput,e.target.value,e.target);else if(e.target.matches("[data-trade-input]"))refreshTradeAmount(e.target.dataset.tradeInput,e.target.value);else if(e.target.matches("[data-glossary-search]"))filterGlossary(e.target.value);else if(e.target.matches("[data-pool-history]"))updatePoolExplorer(Number(e.target.value))});
document.getElementById("app").addEventListener("change",e=>{
  if(e.target.matches("[data-workshop-client]")){setWorkshopClient(e.target.dataset.device,e.target.dataset.workshopClient,e.target.value);return}
  if(e.target.matches("[data-hardware-qty],[data-hardware-currency]")){
    const wrap=e.target.closest(".hardware-buy-controls");if(!wrap)return;
    const h=HARDWARE.find(item=>item.id===wrap.dataset.id);if(!h)return;
    const qtySel=wrap.querySelector("[data-hardware-qty]"),currencySel=wrap.querySelector("[data-hardware-currency]"),btn=wrap.querySelector('[data-action^="buy-hw"]');
    if(!qtySel||!currencySel||!btn)return;
    const currency=currencySel.value==="btc"?"btc":"usd",maxQty=Math.max(0,Math.floor(Number(currency==="btc"?wrap.dataset.maxBtc:wrap.dataset.maxFiat)||0));
    if(e.target===currencySel){const options=hardwareQuantityOptions(maxQty);qtySel.innerHTML=options.map(o=>`<option value="${o.qty}">${o.label}</option>`).join("");qtySel.disabled=maxQty<1}
    const qty=Math.max(1,Math.floor(Number(qtySel.value)||1)),unitBtc=hardwareUnitCost(h)/Math.max(1e-9,priceAt(state.time)),costLabel=currency==="btc"?fmtCompactBtc(unitBtc*qty):fmtCompactUsd(hardwareUnitCost(h)*qty);
    /* Remembered, because a repaint rebuilds this control from scratch. A toast arriving while
       the player is choosing a quantity used to snap it back to one, which is worse than
       useless: they press Buy having already chosen forty. */
    hardwarePurchaseChoice[h.id]={qty,currency};
    btn.dataset.action=currency==="btc"?"buy-hw-btc":"buy-hw";btn.dataset.value=String(qty);btn.disabled=maxQty<1;btn.textContent=`Buy ${fmtCompactNumber(qty)} · ${costLabel}`;
    return;
  }
  if(e.target.id==="importSave"&&e.target.files&&e.target.files[0])importSave(e.target.files[0])
});
document.getElementById("app").addEventListener("toggle",e=>{if(e.target.classList?.contains("method-chapter")||e.target.classList?.contains("method-detail"))rememberMethodChapter(e.target);else if(e.target.classList?.contains("context-help"))rememberContextHelp(e.target)},true);
/* A tech node's detail opens below it and to the right. In the last row, or the last column, the lattice's scroll area would
   cut that off, so it opens upward or to the left when that is where the room is. Measured when the node is pointed at or
   focused, because the room depends on where the page has been scrolled and how wide the lattice is. */
function placeTechDetail(node){
  const detail=node.querySelector(".tech-node-detail"),scroll=node.closest(".tech-tree-scroll");if(!detail||!scroll)return;
  node.classList.remove("flip-up","align-right");
  const box=scroll.getBoundingClientRect(),at_=node.getBoundingClientRect(),h=detail.offsetHeight,w=detail.offsetWidth;
  const below=box.bottom-at_.bottom-6,above=at_.top-box.top-6;
  if(h>below&&above>below)node.classList.add("flip-up");
  if(at_.left+w>box.right)node.classList.add("align-right");
}
["mouseover","focusin"].forEach(type=>document.getElementById("app").addEventListener(type,e=>{const node=e.target.closest&&e.target.closest(".tech-node");if(node)placeTechDetail(node)}));
document.getElementById("app").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches(".story-item"))e.target.click()});
