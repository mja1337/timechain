"use strict";

/* Setup records are additive. Old devices with keys retain their working status; nothing
   here manufactures a key, changes the spending threshold or declares recovery tested. */
function workshopGroup(product){return product?.build?"qr":product?.computer||product?.id==="beigepc"?"offline":"hardware"}
function workshopPrepared(device){return device.workshopSetup!==1||!!(device.inspected&&device.softwarePrepared)}
function workshopSteps(device){
  const key=device.keyId?custodyKey(device.keyId):null,b=key?.backup;
  return [!device.destroyed,device.workshopSetup!==1||!!device.inspected,workshopPrepared(device),!!key,!!b&&!b.destroyed,!!key&&state.custody.assigned.includes(key.id)];
}
function workshopProgress(device){return Math.round(workshopSteps(device).filter(Boolean).length/6*100)}
function workshopSeparate(key){
  const b=key.backup;if(!b||b.destroyed||!b.place||b.place==="transit")return false;
  const devices=custodyDevicesOfKey(key).filter(d=>!d.destroyed);
  return devices.length>0&&devices.every(d=>d.place&&d.place!=="transit"&&custodyPlaceId(d.place)!==custodyPlaceId(b.place));
}
function workshopHealth(){
  const keys=(state.custody.keys||[]).filter(k=>!k.hot&&!k.retired);
  const scores=keys.map(k=>{const d=custodyDevicesOfKey(k).find(d=>!d.destroyed),steps=d?workshopSteps(d):[false,false,false,true,!!k.backup&&!k.backup.destroyed,state.custody.assigned.includes(k.id)];return steps.reduce((n,done,i)=>n+(done?[0,10,15,10,20,10][i]:0),0)+(workshopSeparate(k)?20:0)});
  return {score:scores.length?Math.min(...scores):0,keys:keys.length,backups:keys.filter(k=>k.backup&&!k.backup.destroyed).length,separate:keys.filter(workshopSeparate).length};
}
function workshopConcentration(){
  const sites=new Map();
  const site=id=>{id=id&&id!=="transit"?custodyPlaceId(id):"unknown";if(!sites.has(id))sites.set(id,{id,seeds:new Set(),copies:0});return sites.get(id)};
  for(const key of (state.custody.keys||[]).filter(k=>!k.hot&&!k.retired)){
    for(const d of custodyDevicesOfKey(key).filter(d=>!d.destroyed))site(d.place).seeds.add(key.seed||key.id);
    if(key.backup&&!key.backup.destroyed)site(key.backup.place).copies++;
  }
  return [...sites.values()].map(s=>({id:s.id,keys:s.seeds.size,copies:s.copies}));
}
function selectWorkshop(group,uid){
  if(!["offline","qr","hardware","nodes"].includes(group))return;
  state.custody.workshop={group,uid:uid||null};save();render();
}
function focusWorkshopDevice(group,uid){
  if(!["offline","qr","hardware","nodes"].includes(group))return;
  state.custody.workshop={group,uid:uid||null};save();render();
  requestAnimationFrame(()=>document.querySelector(".custody-workshop")?.scrollIntoView({behavior:"smooth",block:"start"}));
}
function inspectWorkshopDevice(uid){
  const d=custodyDevice(uid);if(!d||d.destroyed||d.place==="transit")return;
  d.inspected=true;log("Signer inspected","Delivery and source reviewed; appearance alone cannot prove trust","custody");save();render();
}
function prepareWorkshopDevice(uid){
  const d=custodyDevice(uid);if(!d||d.destroyed||d.place==="transit"||!d.inspected)return;
  if(d.chainSource==="own"&&!nodeOnline())return showToast("Your node is not available","Bring verification online before selecting it as the client’s chain-data source.","blocked","custody");
  d.softwarePrepared=true;log("Signing client prepared","Source and payment-review workflow recorded; no key generated","custody");save();render();
}
function setWorkshopClient(uid,field,value){
  const d=custodyDevice(uid);if(!d||d.destroyed)return;
  const choices={client:["vendor","independent"],chainSource:["provider","own"]};
  if(!choices[field]?.includes(value))return;
  if(field==="chainSource"&&value==="own"&&!nodeOnline())return showToast("Your node is not available","Use an available source or bring your own verification online.","blocked","custody");
  d[field]=value;if(!d.keyId)d.softwarePrepared=false;save();render();
}
