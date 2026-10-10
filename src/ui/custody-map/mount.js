"use strict";

/* THE CUSTODY MAP.

   This is a state map, not a showroom. The nodes are deliberately still, and only a working
   path pulses: money location, spending approval and network verification remain visible even
   when WebGL is unavailable through the fallback markup beside the canvas.
*/
let custodyMapLoadState="idle",custodyMapRenderer=null,custodyMapCanvas=null,custodyMapCamera=null,custodyMapScene=null,custodyMapRoot=null,custodyMapRaf=0,custodyMapSignature="";
const CUSTODY_MAP_SCRIPT="vendor/three.floor.js";
const CUSTODY_MAP_NODES=[
  {id:"hot",label:"Daily wallet",role:"online money",pos:[-4,0,0],color:0xf0a92f},
  {id:"cold",label:"Reserve wallet",role:"offline money",pos:[-4,0,2.4],color:0x75e3b2},
  {id:"custodial",label:"Venue claim",role:"held by others",pos:[-4,0,-2.4],color:0xd95d9c},
  {id:"lightning",label:"Lightning",role:"locked channels",pos:[-1.2,0,-2.4],color:0x68bafa},
  {id:"signer",label:"Signer",role:"approves spending",pos:[0,2,1.1],color:0xffc36b},
  {id:"recovery",label:"Recovery",role:"rebuilds authority",pos:[0,2,3.1],color:0x9ab7ff},
  {id:"policy",label:"Spending rule",role:"decides how many keys",pos:[1.8,2,1.1],color:0xc59cff},
  {id:"node",label:"Your node",role:"checks the chain",pos:[3.8,0,1.1],color:0x75e3b2},
  {id:"backup",label:"Remote node",role:"independent backup",pos:[3.8,0,3.1],color:0x9ab7ff},
  {id:"chain",label:"Bitcoin record",role:"public history",pos:[6,0,1.1],color:0xf0a92f}
];
const CUSTODY_MAP_LINKS=[["hot","signer"],["cold","signer"],["signer","policy"],["policy","node"],["node","chain"],["cold","recovery"],["recovery","policy"],["custodial","chain"],["lightning","node"],["backup","chain"]];
function custodyMapMarkup(){
  return `<div class="custody-map-shell"><div class="custody-map-heading"><span>CONTROL MAP</span><strong>Follow a payment from coins to approval to the public record.</strong></div><div class="custody-map-viewport"><div class="custody-map-fallback" data-custody-map-fallback><div><b>Money</b><span>Daily wallet · reserve · venue · Lightning</span></div><div><b>Approval</b><span>Signer · recovery copy · spending rule</span></div><div><b>Verification</b><span>Your node · backup node · Bitcoin record</span></div></div><div class="custody-map-canvas" data-custody-map-canvas aria-label="Three-dimensional custody and node map"></div></div><p class="modal-note">The map is a picture of the jobs in a payment. Select a part below to see its exact status and next action. If 3D is unavailable, the same three jobs remain available in the plain-language view.</p></div>`;
}
function custodyMapDetail(id="money"){
  const s=custodyMapState(),m=s.money,a=s.approval,v=s.verification;
  return {money:{title:"Where the coins are",copy:`${fmtBtc(m.hot)} BTC is hot and ready to trade, ${fmtBtc(m.cold)} BTC is in slower reserve storage, and ${fmtBtc(m.custodial)} BTC is a claim on venues.`,next:s.next.setup==="test-payment"?"Plan a test payment before a bill is due.":"Finish the reserve setup before moving more coins into cold storage."},approval:{title:"Who can spend",copy:`${a.distinct} of ${a.required} required key${a.required===1?"":"s"} is assigned and ${a.backedUp} recovery cop${a.backedUp===1?"y":"ies"} is recorded. A signer creates the authorising signature; the spending rule says how many keys are needed.`,next:a.configOk?"Rehearse recovery with the recorded backup.":"Complete the signer and wallet configuration checks."},verification:{title:"Who checks the record",copy:`Your ${v.deployment} is ${v.online?"online and checking the chain":"offline"} in ${v.mode} mode. It verifies the public record but does not hold private keys.`,next:v.online?"Compare the node result with the signer result during a test payment.":"Bring the node online and let it catch up before relying on its answer."}}[id]||null;
}
function custodyMapSelect(id){
  const detail=custodyMapDetail(id);if(!detail)return;document.querySelectorAll("[data-custody-map-node]").forEach(button=>button.classList.toggle("active",button.dataset.custodyMapNode===id));const target=document.querySelector("[data-custody-map-detail]");if(target)target.innerHTML=`<b>${detail.title}</b><span>${detail.copy}</span><small>NEXT: ${detail.next}</small>`;
}
function custodyMapBindControls(){
  let controls=document.querySelector(".custody-map-controls");if(!controls){const shell=document.querySelector(".custody-map-shell");if(!shell)return;shell.insertAdjacentHTML("beforeend",`<div class="custody-map-controls" role="group" aria-label="Custody map explanations"><button data-custody-map-node="money">Money</button><button data-custody-map-node="approval">Approval</button><button data-custody-map-node="verification">Verification</button><div class="custody-map-detail" data-custody-map-detail></div></div>`);controls=shell.querySelector(".custody-map-controls");}
  controls.querySelectorAll("[data-custody-map-node]").forEach(button=>{if(button.dataset.custodyMapBound)return;button.dataset.custodyMapBound="1";button.addEventListener("click",()=>custodyMapSelect(button.dataset.custodyMapNode));});custodyMapSelect("money");
}
function custodyMapLoadThree(){
  if(typeof FloorThree!=="undefined"){custodyMapLoadState="ready";return Promise.resolve();}
  if(custodyMapLoadState==="loading")return custodyMapLoadPromise;
  custodyMapLoadState="loading";
  custodyMapLoadPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[data-custody-map="${CUSTODY_MAP_SCRIPT}"]`);if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",reject,{once:true});return}
    const script=document.createElement("script");script.src=`${CUSTODY_MAP_SCRIPT}?v=${APP_VERSION}`;script.dataset.custodyMap=CUSTODY_MAP_SCRIPT;script.onload=resolve;script.onerror=reject;document.head.appendChild(script);
  }).then(()=>{custodyMapLoadState="ready"}).catch(()=>{custodyMapLoadState="failed"});
  return custodyMapLoadPromise;
}
let custodyMapLoadPromise=null;
function custodyMapBuild(){
  if(!custodyMapRenderer||!custodyMapCanvas||typeof FloorThree==="undefined")return false;
  const T=FloorThree,s=custodyMapState(),root=new T.Group(),nodes=new Map(),materials=[];
  const scene=new T.Scene();scene.background=new T.Color(0x101b24);
  const camera=new T.OrthographicCamera(-8,8,5, -5,.1,60);camera.position.set(10,9,13);camera.lookAt(0,1,1);
  scene.add(new T.AmbientLight(0xffffff,.7));const key=new T.DirectionalLight(0xffffff,1.25);key.position.set(4,8,6);scene.add(key);
  const money=s.money,approval=s.approval,verification=s.verification;
  for(const spec of CUSTODY_MAP_NODES){
    const active=spec.id==="hot"?money.hot>0:spec.id==="cold"?money.cold>0:spec.id==="custodial"?money.custodial>0:spec.id==="lightning"?money.lightning>0:spec.id==="signer"?approval.assigned>0:spec.id==="recovery"?approval.backedUp>0:spec.id==="node"?verification.primary.online:spec.id==="backup"?verification.backup.online:true;
    const material=new T.MeshStandardMaterial({color:active?spec.color:0x44545b,emissive:active?spec.color:0x000000,emissiveIntensity:active?.18:0,roughness:.72,metalness:.15});materials.push(material);
    const mesh=new T.Mesh(new T.BoxGeometry(spec.id==="chain"?1.7:1.2,spec.id==="chain"?1.1:1,.8),material);mesh.position.set(...spec.pos);mesh.userData.active=active;root.add(mesh);nodes.set(spec.id,{mesh,active,spec});
  }
  const byId=id=>nodes.get(id)?.mesh;
  for(const [from,to] of CUSTODY_MAP_LINKS){const a=byId(from),b=byId(to);if(!a||!b)continue;const geometry=new T.BufferGeometry().setFromPoints([a.position,b.position]);const material=new T.LineBasicMaterial({color:0x71888d,transparent:true,opacity:.72});root.add(new T.Line(geometry,material));}
  scene.add(root);custodyMapScene=scene;custodyMapRoot=root;custodyMapCamera=camera;custodyMapSignature=JSON.stringify({m:money,a:approval,v:verification});return true;
}
function custodyMapDraw(time=0){
  if(!custodyMapRenderer||!custodyMapCanvas||!custodyMapScene)return;
  const host=custodyMapCanvas.parentElement;if(!host)return;
  const width=Math.max(1,host.clientWidth),height=Math.max(260,Math.round(width*.48));custodyMapRenderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));custodyMapRenderer.setSize(width,height,false);custodyMapCamera.left=-8;custodyMapCamera.right=8;custodyMapCamera.top=5;custodyMapCamera.bottom=-5;custodyMapCamera.updateProjectionMatrix();
  const pulse=(Math.sin(time*.002)+1)/2;for(const child of custodyMapRoot.children){if(!child.material?.emissive)continue;const base=child.userData?.active?"active":"idle";child.material.emissiveIntensity=base==="active"?.12+pulse*.16:0;}
  custodyMapRenderer.render(custodyMapScene,custodyMapCamera);custodyMapRaf=requestAnimationFrame(custodyMapDraw);
}
function custodyMapMount(){
  if(typeof uiConfigAllows==="function"&&!uiConfigAllows("custodyMap"))return;
  let host=document.querySelector("[data-custody-map-canvas]");
  if(!host){const pad=document.querySelector(".custody-control-overview .card-pad"),next=pad?.querySelector(".custody-next-move");if(pad&&next){next.insertAdjacentHTML("beforebegin",custodyMapMarkup());host=pad.querySelector("[data-custody-map-canvas]");}}
  if(!host)return;
  custodyMapBindControls();
  if(!custodyMapCanvas){
    custodyMapLoadThree().then(()=>{
      if(custodyMapLoadState!=="ready"||typeof FloorThree==="undefined")return;
      try{custodyMapRenderer=new FloorThree.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});custodyMapCanvas=custodyMapRenderer.domElement;custodyMapCanvas.className="custody-map-webgl";custodyMapCanvas.setAttribute("aria-hidden","true");
        if(!custodyMapBuild())return;host.appendChild(custodyMapCanvas);document.querySelector("[data-custody-map-fallback]")?.classList.add("is-hidden");custodyMapDraw();
      }catch(error){custodyMapLoadState="failed";custodyMapRenderer=null;custodyMapCanvas=null;}
    });return;
  }
  if(custodyMapCanvas.parentElement!==host)host.appendChild(custodyMapCanvas);document.querySelector("[data-custody-map-fallback]")?.classList.add("is-hidden");
}
