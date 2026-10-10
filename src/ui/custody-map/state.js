"use strict";

/* ONE VIEW OF CUSTODY.

   The map, its accessible fallback and the detail panel must agree about the same three jobs:
   where the coins are, who can approve spending, and who checks the public record. Keep this
   derived object deliberately free of UI markup so a later Three.js scene cannot grow a second
   source of truth.
*/
function custodyMapState(){
  const setup=custodySetup(),posture=custodyReadiness(),primaryOnline=primaryNodeOnline(),primaryReady=primaryNodeReady(),backupOnline=backupNodeOnline(),nodeMode=state.nodeMode||"pruned",lightning=lightningAvailable(),venues={};
  ["mtgox","bitfinex","quadriga","frontier","exchange"].forEach(id=>{const balance=state.wallets?.[id]||0;if(balance>0||venueAvailable(id))venues[id]={balance,online:!venueFrozen(id),frozen:venueFrozen(id)}});
  return {
    money:{hot:state.wallets?.hot||0,cold:state.wallets?.cold||0,custodial:claims(),lightning:lightningLocked(),venues},
    approval:{policy:setup.policy.id,threshold:setup.policy.threshold,required:setup.policy.keys,distinct:setup.distinct,assigned:setup.assigned.length,usable:setup.usable,backedUp:setup.backedUp,configOk:setup.configOk,readiness:posture.label,readinessDetail:posture.detail},
    verification:{
      primary:{online:primaryOnline,ready:primaryReady,status:primaryOnline?"at-tip":primaryReady?"syncing":"offline",lag:state.nodeSync?.primaryLag||0,progress:nodeSyncProgress(state.nodeSync?.primaryLag||0,state.nodeSync?.primaryPeak||0)},
      backup:{enabled:!!state.backupNode?.enabled,online:backupOnline,lag:state.nodeSync?.backupLag||0},
      deployment:nodeDeploymentName(),mode:nodeMode,storage:{installed:state.nodeStorage||0,required:Math.ceil(chainSizeAt(state.time))},peers:nodeConnections(),watts:nodePowerWatts(),online:nodeOnline(),
      lightning:{enabled:lightning,reason:lightning?"Ready":state.time<LIGHTNING?`Available ${dateFmt(LIGHTNING,true)}`:state.node<1?"Requires a dedicated primary node":nodeMode==="pruned"?"Pruned mode cannot run Lightning":"Bring the primary node to the chain tip"}
    },
    next:{setup:!setup.ready?"prepare-signer":!setup.configOk?"backup-wallet-config":setup.unbacked>0?"record-recovery":!nodeOnline()?"bring-node-online":"test-payment"}
  };
}
