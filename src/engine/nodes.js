"use strict";

/* NODE LAYER - independent verification, synchronization and Lightning capability. */
function nodeProfile(){return NODE_MODES.find(x=>x.id===state.nodeMode)||NODE_MODES[1]}
function nodeDeploymentName(){return state.node===2?"Hardened node":state.node===1?"Dedicated full node":"Laptop full node"}
function nodeModeWatts(profile=nodeProfile()){if(state.node===0)return 0;if(state.node===2)return profile.id==="relay"?profile.watts:profile.id==="archival"?80:35;return profile.watts}
function nodeModeMonthly(profile=nodeProfile()){if(state.node===0)return 0;if(state.node===2&&profile.id!=="relay")return profile.monthly*2;return profile.monthly}
function nodeModeConnections(profile=nodeProfile()){if(state.node===0)return profile.id==="pruned"?8:12;if(state.node===2&&profile.id!=="relay")return profile.connections*2;return profile.connections}
function nodePowerWatts(){return nodeModeWatts()}
function nodeMonthlyOverhead(){return nodeModeMonthly()}
function backupNodeMonthlyOverhead(){return state.backupNode?.enabled?BACKUP_NODE.monthly:0}
function totalNodeMonthlyOverhead(){return nodeMonthlyOverhead()+backupNodeMonthlyOverhead()}
function nodeConnections(){return nodeModeConnections()}
function nodeHostPowered(){if(gridCutOff()||state.policyLock)return false;if(state.node>=1)return true;const laptop=HARDWARE.find(x=>x.id==="laptop");return !!state.power&&!!laptop&&!hardwareOfflineReason(laptop)&&hardwarePoweredDownCount(laptop)<1}
function nodeStorageReady(){const p=nodeProfile();return p.id==="pruned"?state.nodeStorage>=25:state.nodeStorage>=chainSizeAt(state.time)}
function primaryNodeReady(){return nodeHostPowered()&&!siteOutage()&&nodeStorageReady()}
function backupNodeOutage(){return state.time<(state.backupNode?.outageUntil||0)}
function backupNodeReady(){return !!state.backupNode?.enabled&&state.debt<=0&&!backupNodeOutage()}
function primaryNodeOnline(){return primaryNodeReady()&&(state.nodeSync?.primaryLag||0)<=0}
function backupNodeOnline(){return backupNodeReady()&&(state.nodeSync?.backupLag||0)<=0}
function nodeOnline(){return primaryNodeOnline()||backupNodeOnline()}
function primaryNodeOfflineReason(){if(gridCutOff())return"grid arrears";if(state.policyLock)return"site policy shutdown";if(siteOutage())return"site connectivity outage";if(state.node===0&&!state.power)return"mining laptop powered off";if(state.node===0&&hardwarePoweredDownCount(HARDWARE.find(x=>x.id==="laptop"))>=1)return"mining laptop powered off";if(state.node===0&&hardwareOfflineReason(HARDWARE.find(x=>x.id==="laptop")))return"laptop hardware unavailable";if(!nodeStorageReady())return"storage below chain requirement";if((state.nodeSync?.primaryLag||0)>0)return`catching up · ${fmtNum(state.nodeSync.primaryLag)} days behind`;return"primary node offline"}
function backupNodeOfflineReason(){if(!state.backupNode?.enabled)return"not deployed";if(gridCutOff())return"hosting account in arrears";if(backupNodeOutage())return"remote provider outage";if((state.nodeSync?.backupLag||0)>0)return`catching up · ${fmtNum(state.nodeSync.backupLag)} days behind`;return"backup node offline"}
function nodeOfflineReason(){if(primaryNodeReady()&&(state.nodeSync?.primaryLag||0)>0)return primaryNodeOfflineReason();if(backupNodeReady()&&(state.nodeSync?.backupLag||0)>0)return backupNodeOfflineReason();return state.backupNode?.enabled?`primary: ${primaryNodeOfflineReason()} · backup: ${backupNodeOfflineReason()}`:primaryNodeOfflineReason()}
function nodeVerificationPath(){if(primaryNodeOnline()&&backupNodeOnline())return"two independent nodes at tip";if(primaryNodeOnline())return"primary node at tip";if(backupNodeOnline())return"remote backup carrying verification";return nodeOfflineReason()}
function primaryNodeCatchupRate(){return state.node===2?6:state.node===1?3:1.5}
function nodeSyncProgress(lag,peak){return peak>0?Math.max(0,Math.min(100,(1-lag/peak)*100)):lag<=0?100:0}
function initialBackupSyncLag(){return Math.max(5,Math.ceil(chainSizeAt(state.time)/40))}
function nodeVerificationCoverage(){const elapsed=Math.max(1,Math.floor((state.time-START)/DAY));return Math.max(0,Math.min(1,(state.nodeDays||0)/elapsed))}
function nodeMiningFactor(){return !nodeOnline()?0.97:!primaryNodeOnline()?0.99:state.nodeMode==="relay"?1.015:state.nodeMode==="pruned"?0.99:1}
function blockRewardAt(t){const localTemplates=hasSkill("blocktemplate")&&primaryNodeOnline()&&state.nodeMode!=="pruned",feeMultiplier=(localTemplates?1.08:1)*(state.nodeMode==="relay"&&primaryNodeOnline()?1.03:1);return subsidyAt(t)+feeAt(t)*feeMultiplier}
function lightningAvailable(){return state.time>=LIGHTNING&&state.node>=1&&primaryNodeOnline()&&state.nodeMode!=="pruned"}
function lightningRate(){const activity=Math.max(.25,Math.min(3,txAt(state.time)/250000));return .00003*activity}
function lightningDailyFee(){return lightningAvailable()?lightningLocked()*lightningRate()*(hasSkill("monitoring")?1.08:1)*(state.nodeMode==="relay"?1.2:1):0}
