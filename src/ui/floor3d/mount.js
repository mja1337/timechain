"use strict";

/* MOUNTING A CANVAS IN A PAGE THAT REBUILDS ITSELF.

   render() replaces the whole of #app with a new string. Anything inside it is destroyed and
   recreated, which is fine for markup and fatal for a WebGL canvas: a new canvas means a new
   context, new buffers, new textures, several times a second. So the canvas is created once
   and kept in a variable here. Each repaint re-attaches that same element into whatever
   placeholder the new markup provides. The element outlives the markup around it.

   The scene inside it is rebuilt only when the floor has actually changed - a signature of
   the site, the fleet and the state of each batch. Repainting because a number ticked over
   must not cost a scene rebuild, and at a megacampus a rebuild is around 17ms.

   Three.js is half a megabyte and this floor is opt-in, so the library is fetched the first
   time somebody turns it on and never for anyone who does not. That is a same-origin script
   tag, the same mechanism index.html uses, deferred - not a call to any outside service.

   Nothing here is required for the game to work. Every failure path ends at the SVG floor. */

const FLOOR3D_SCRIPTS=["vendor/three.floor.js","src/ui/floor3d/silhouettes.js",
  "src/ui/floor3d/cooling.js","src/ui/floor3d/sites.js","src/ui/floor3d/scenery.js","src/ui/floor3d/scene.js",
  "src/ui/floor3d/model.js"];

let floor3dState="idle";      // idle | loading | ready | unsupported | failed
let floor3dRenderer=null,floor3dCanvas=null,floor3dCamera=null;
let floor3dBuilt=null,floor3dSignature="",floor3dStatusSignature="",floor3dRaf=0,floor3dReason="";

/* WHAT HAPPENED, FOR WHOEVER HAS TO FIND OUT. Every interruption leaves a line here, readable as
   window.__floor3dLog, so a crash on a phone can be read off the phone rather than guessed at. */
const floor3dEvents=[];
function floor3dLog(event,detail){
  floor3dEvents.push(Object.assign({t:Date.now(),event,hidden:!!document.hidden},detail||{}));
  if(floor3dEvents.length>40)floor3dEvents.shift();
  try{window.__floor3dLog=floor3dEvents}catch(e){}
}

/* A LOST CONTEXT IS AN INTERRUPTION, NOT AN ENDING.

   Browsers take a WebGL context back for ordinary reasons - a backgrounded tab, a phone short of
   graphics memory, a GPU switched out under the page - and usually hand it straight back. This
   used to treat the first loss as permanent: it switched the player to the flat floor for the
   rest of the session even when the browser had restored the context a moment later. Now the
   renderer and scene are thrown away and rebuilt from the game's own state, which is the one
   thing that cannot be lost, on a short backoff. Only a floor that fails again and again inside
   a minute gives up, and says so. */
const FLOOR3D_RECOVERY_DELAYS=[400,1500,4000];   // ms before each rebuild attempt
const FLOOR3D_STABLE_MS=60000;                    // a floor that lasts this long has recovered
const FLOOR3D_NOTICE_MS=10000;                    // how long the player is told what happened
let floor3dRecoveries=0,floor3dRecoverTimer=0,floor3dLastLossAt=0;

/* Tell the player what happened, in words, for ten seconds. */
function floor3dReport(title,happened,outcome){
  floor3dLog(title,{happened});
  try{if(typeof showToast==="function")showToast(title,`${happened} ${outcome}`,"warning",null,null,FLOOR3D_NOTICE_MS)}catch(e){}
}
function floor3dLossCause(){
  if(document.hidden||document.visibilityState==="hidden")
    return "The tab was in the background, so the browser took back the graphics memory the 3D floor was using.";
  return "The browser reset the graphics card while the floor was on screen. That usually means the device is short of graphics memory, or the graphics driver restarted.";
}

/* ASKED ONCE, NOT ON EVERY REPAINT.

   This used to open a throwaway WebGL context on every call, and it is called from the render
   path - the signature, the floor card's markup twice, the viewport. Opening the Mine tab made
   nine of them and a clock at sixteen times speed made one a second. Browsers allow about
   sixteen live contexts and evict the OLDEST when that is exceeded, and the oldest is the
   real renderer, which is then lost and the floor drops to the flat view for good. Measured: a
   single laptop, 24 probes in 14.5 seconds, context lost. The same run with the answer cached
   made none and held for 60 seconds. Capability does not change within a page's life, so the
   answer is remembered, and the probe context is released at once rather than left for the
   garbage collector. */
let floor3dSupportProbe=null;
function floor3dSupported(){
  if(floor3dState==="unsupported")return false;
  if(floor3dSupportProbe!==null)return floor3dSupportProbe;
  try{
    const probe=document.createElement("canvas");
    const gl=probe.getContext("webgl2")||probe.getContext("webgl");
    floor3dSupportProbe=!!gl;
    const lose=gl&&gl.getExtension&&gl.getExtension("WEBGL_lose_context");
    if(lose)lose.loseContext();
  }catch(e){floor3dSupportProbe=false}
  return floor3dSupportProbe;
}
function floor3dUnavailableReason(){
  if(floor3dReason)return floor3dReason;
  if(!floor3dSupported())return "This browser cannot open a 3D context.";
  return "";
}
/* There is no longer a view to want. The floor is the 3D floor wherever one can be drawn, so
   this asks the only remaining question: did it fail, or can it not run here at all. */
function floor3dWanted(){return state.floorView==="3d"&&!floor3dUnavailableReason()}

/* Loads the library and the view modules once, in order, then paints. A failure here is not
   an error the player has to deal with - it turns the toggle off and says why. */
function ensureFloor3dLoaded(){
  if(floor3dState==="ready"||floor3dState==="loading")return;
  if(!floor3dSupported()){floor3dState="unsupported";floor3dReason="This browser cannot open a 3D context.";render();return}
  floor3dState="loading";
  let chain=Promise.resolve();
  for(const src of FLOOR3D_SCRIPTS){
    chain=chain.then(()=>new Promise((resolve,reject)=>{
      if(document.querySelector(`script[data-floor3d="${src}"]`))return resolve();
      const node=document.createElement("script");
      node.src=`${src}?v=${APP_VERSION}`;node.dataset.floor3d=src;
      node.onload=resolve;node.onerror=()=>reject(new Error(src));
      document.head.appendChild(node);
    }));
  }
  chain.then(()=>{floor3dState="ready";renderFullQueued=true;render()})
    .catch(error=>{
      floor3dState="failed";
      floor3dReason=`The 3D floor could not load (${error.message}). The flat floor is unchanged.`;
      floor3dReport("3D floor could not load",`The game could not fetch one of the files it draws the 3D floor from (${error.message}).`,"The flat floor is showing instead. Check your connection and reload to try again.");
      state.floorView="2d";save();render();
    });
}

/* What the floor looks like, reduced to a string. If this has not changed there is nothing
   to rebuild, however many times the page has repainted. */
function floor3dSignatureNow(){
  const parts=[state.facility,state.region,floor3dWanted()?"3d":"2d",
    state.power?"on":"off",typeof thermalPowerAvailable==="function"&&thermalPowerAvailable()?"cool":"hot",
    (state.staff||[]).slice().sort().join(","),
    Object.keys(state.thermal?.equipment||{}).sort().map(k=>k+state.thermal.equipment[k]).join(","),
    (state.thermal?.orders||[]).map(o=>o.id+(o.qty||1)).sort().join(","),
    typeof immersionTotal==="function"?"imm"+immersionTotal():""];
  /* STRUCTURE ONLY. What a rack IS - which hardware, how many of it - decides the geometry, and
     changing it means rebuilding the scene. What a rack is DOING is paint, and on a large fleet
     it changes every simulated day as faults appear and repairs land. Including status here
     rebuilt the whole floor every tick: a third of a second each, several times a second at
     speed, which is enough sustained main-thread work for the browser to give up on the GPU
     process and drop the player to the flat floor. That is the fifty-thousand-miner crash. */
  for(const b of floorBatches())parts.push(b.id+b.qty);
  return parts.join("|");
}
const FLOOR3D_STATUS_COLORS={online:0x75e3b2,fault:0xff705d,repair:0x68bafa,off:0x52636c};
/* The other half of the same picture, cheap to compute and cheap to answer: repaint, no
   rebuild. */
function floor3dStatusSignatureNow(){
  const parts=[];
  for(const b of floorBatches())parts.push(b.status);
  return parts.join(",");
}
function floor3dApplyStatuses(){
  if(!floor3dBuilt||typeof floor3dBuilt.recolour!=="function")return;
  const byBatch=new Map();
  for(const b of floorBatches())byBatch.set(b.id,b.status);
  /* The same table the assembler paints from. Two copies of a colour map is a colour map that
     drifts, so if a third status ever appears these move together or the contract below fails. */
  floor3dBuilt.recolour(id=>{
    const status=byBatch.get(id);
    if(status===undefined)return null;
    return FLOOR3D_STATUS_COLORS[status]??null;
  });
}

function floor3dEnsureRenderer(){
  if(floor3dRenderer)return true;
  try{
    floor3dRenderer=new FloorThree.WebGLRenderer({antialias:true,alpha:false,powerPreference:"low-power"});
    /* Filmic roll-off rather than a hard clip. With additive haloes stacking on top of lit
       surfaces, linear output blows the bright end out to flat white; ACES compresses it so
       a lamp keeps a hot core and a coloured edge instead of becoming a white rectangle. */
    floor3dRenderer.toneMapping=FloorThree.ACESFilmicToneMapping;
    // ACES compresses the midtones, so the exposure and the lights come up to meet it.
    floor3dRenderer.toneMappingExposure=1.5;
    floor3dRenderer.setClearColor(0x101b24);
    floor3dRenderer.outputColorSpace=FloorThree.SRGBColorSpace;
    floor3dCanvas=floor3dRenderer.domElement;
    floor3dCanvas.className="floor-3d-canvas";
    floor3dCanvas.setAttribute("aria-label","Three-dimensional view of the mining floor. The flat floor above carries the same information.");
    floor3dCamera=new FloorThree.OrthographicCamera(-10,10,10,-10,.1,150);
    floor3dCanvas.addEventListener("webglcontextlost",floor3dOnContextLost);
    floor3dCanvas.addEventListener("webglcontextrestored",floor3dOnContextRestored);
    return true;
  }catch(e){
    floor3dRenderer=null;floor3dCanvas=null;
    if(floor3dRecoveries>0)floor3dScheduleRecovery("The browser would not give the 3D floor a new graphics context.");
    else{
      floor3dReport("3D floor unavailable","The browser would not give the game a graphics context.","The flat floor is showing instead.");
      floor3dFailPermanently("A 3D context could not be created.");
    }
    return false;
  }
}

function floor3dFailPermanently(reason){
  floor3dStop();clearTimeout(floor3dRecoverTimer);floor3dRecoverTimer=0;
  floor3dState="failed";floor3dReason=reason;
  state.floorView="2d";save();render();
}
function floor3dOnContextLost(event){
  event.preventDefault();
  if(event.target!==floor3dCanvas)return;
  floor3dScheduleRecovery(floor3dLossCause());
}
/* The browser handed it back before the timer fired: no reason to wait. */
function floor3dOnContextRestored(event){
  floor3dLog("context restored",{ours:event.target===floor3dCanvas});
  if(event.target===floor3dCanvas&&floor3dRecoverTimer)floor3dRecover();
}
function floor3dScheduleRecovery(happened){
  floor3dStop();
  const now=Date.now();
  if(now-floor3dLastLossAt>FLOOR3D_STABLE_MS)floor3dRecoveries=0;
  floor3dLastLossAt=now;
  if(floor3dRecoveries>=FLOOR3D_RECOVERY_DELAYS.length){
    floor3dReport("3D floor switched off",happened,"It has now failed several times in a row, so the flat floor is showing instead. Reload the page to try 3D again.");
    floor3dFailPermanently("The 3D floor kept losing its graphics context. The flat floor is unchanged.");
    return;
  }
  const delay=FLOOR3D_RECOVERY_DELAYS[floor3dRecoveries++];
  floor3dReport("3D floor interrupted",happened,"It is being rebuilt now and the flat floor shows in the meantime.");
  floor3dReason="Restoring the 3D floor after a graphics interruption.";
  clearTimeout(floor3dRecoverTimer);
  floor3dRecoverTimer=setTimeout(floor3dRecover,delay);
  render();
}
/* Nothing of the old renderer is trusted: the canvas, the camera, the lights and every buffer
   are dropped, and the next mount builds them again from the game's state. */
function floor3dTearDown(){
  floor3dStop();
  if(floor3dHoverRaf){cancelAnimationFrame(floor3dHoverRaf);floor3dHoverRaf=0}
  try{floor3dDisposeScene()}catch(e){}
  try{if(floor3dRenderer)floor3dRenderer.dispose()}catch(e){}
  if(floor3dCanvas&&floor3dCanvas.parentElement)floor3dCanvas.remove();
  floor3dRenderer=null;floor3dCanvas=null;floor3dCamera=null;floor3dScene=null;floor3dKeyLight=null;
  floor3dShadowKey="";floor3dPickTable=null;floor3dBounds=null;floor3dBaseColours=null;floor3dAlertMap=null;floor3dHover=null;
}
function floor3dRecover(){
  clearTimeout(floor3dRecoverTimer);floor3dRecoverTimer=0;
  if(floor3dState!=="ready")return;
  floor3dLog("rebuilding",{attempt:floor3dRecoveries});
  floor3dTearDown();
  floor3dReason="";
  render();
}

/* WHAT A MACHINE IN TROUBLE LOOKS LIKE.

   Colour alone is a poor alarm on a floor of two hundred boxes - it reads as decoration.
   Movement does not, which is why anything that needs a decision pulses and everything
   healthy sits still. Four states, told apart because they need four different responses:

     red      faulted; it has stopped earning and wants a part
     amber    condition inside the last band before the whole type goes offline at 65%
     blue     the grid has cut the site, or a policy has
     violet   the site is hashing but cannot reach the network

   A machine that is simply switched off does not pulse. That is a decision you already made
   and not a problem to solve. */
const FLOOR3D_ALERTS={
  fault:  {colour:0xd9483c, speed:2.9, depth:.85},
  ailing: {colour:0xe0a53a, speed:1.7, depth:.62},
  power:  {colour:0x4f8fd6, speed:1.1, depth:.70},
  network:{colour:0x9b6fd4, speed:1.4, depth:.58},
};
function floor3dAlertFor(batch){
  if(!batch)return null;
  if(batch.status==="fault")return FLOOR3D_ALERTS.fault;
  if(batch.reason==="grid"||batch.reason==="sitepower")return FLOOR3D_ALERTS.power;
  if(batch.reason==="network")return FLOOR3D_ALERTS.network;
  if(batch.ailing&&batch.status!=="repair")return FLOOR3D_ALERTS.ailing;
  return null;
}

/* The assembler already stamps every instance with the batch it belongs to, so the pulse can
   be applied over the top of a finished scene without the renderer knowing anything about
   maintenance. Base colours are captured once; each frame writes base blended toward the
   alert colour and nothing else is touched. */
let floor3dBaseColours=null,floor3dAlertMap=null;
function floor3dPrepareAlerts(){
  floor3dBaseColours=[];floor3dAlertMap=new Map();
  for(const batch of FloorModel.batches()){
    const alert=floor3dAlertFor(batch);
    if(alert)floor3dAlertMap.set(batch.id,alert);
  }
  if(!floor3dBuilt)return;
  /* Only the lights pulse. Blending the whole chassis toward red made a faulted machine
     look repainted rather than alarmed - the shape said "this machine is red", not "this
     machine needs you". Restricting the pulse to the unlit pieces means the status LED, the
     rack strip and the marker above it beat while the aluminium stays aluminium. */
  floor3dBuilt.root.traverse(node=>{
    if(!node.isInstancedMesh||!node.instanceColor||!node.userData.lamp)return;
    floor3dBaseColours.push({mesh:node,base:Float32Array.from(node.instanceColor.array),
      ids:node.userData.batchIds||[]});
  });
}
function floor3dPulse(time){
  if(!floor3dBaseColours||!floor3dAlertMap||!floor3dAlertMap.size)return;
  const target=new FloorThree.Color();
  for(const {mesh,base,ids} of floor3dBaseColours){
    let touched=false;
    for(let i=0;i<ids.length;i++){
      const alert=floor3dAlertMap.get(ids[i]);
      if(!alert)continue;
      const wave=(Math.sin(time*.001*alert.speed*Math.PI)+1)/2;
      const mix=alert.depth*wave;
      /* A warning light gets brighter, it does not merely change hue. Values above 1 are
         legitimate here: the output is tone-mapped, so the peak rolls off to a hot core
         rather than clipping to a flat white rectangle. */
      const gain=1+alert.depth*wave*1.1;
      target.setHex(alert.colour);
      const o=i*3;
      mesh.instanceColor.array[o]  =(base[o]  +(target.r-base[o])  *mix)*gain;
      mesh.instanceColor.array[o+1]=(base[o+1]+(target.g-base[o+1])*mix)*gain;
      mesh.instanceColor.array[o+2]=(base[o+2]+(target.b-base[o+2])*mix)*gain;
      touched=true;
    }
    if(touched)mesh.instanceColor.needsUpdate=true;
  }
}
function floor3dAnythingWrong(){return !!(floor3dAlertMap&&floor3dAlertMap.size)}

/* Small vector helpers. The bundled three.js is tree-shaken and does not carry the maths
   classes, and this is less code than the parts of them that would be needed. */
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}
function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}
function norm(a){const l=Math.hypot(a[0],a[1],a[2])||1;return [a[0]/l,a[1]/l,a[2]/l]}

function floor3dStop(){if(floor3dRaf){cancelAnimationFrame(floor3dRaf);floor3dRaf=0}}
function floor3dDisposeScene(){
  if(floor3dBuilt&&floor3dBuilt.dispose)floor3dBuilt.dispose();
  floor3dBuilt=null;floor3dSignature="";floor3dStatusSignature="";
}

/* Any error while drawing is treated like a lost context: rebuild, and say what happened. */
function floor3dDraw(){
  try{floor3dDrawNow()}
  catch(error){floor3dScheduleRecovery(`The 3D floor hit an error while drawing (${error.message}).`)}
}
function floor3dDrawNow(){
  if(!floor3dBuilt||!floor3dRenderer)return;
  const lostGl=floor3dRenderer.getContext&&floor3dRenderer.getContext();
  if(lostGl&&lostGl.isContextLost())return;   // the loss event is already on its way
  const host=floor3dCanvas.parentElement;
  if(!host)return;
  const width=Math.max(1,host.clientWidth);
  const bounds=floor3dBounds;
  if(!bounds){floor3dRenderer.setSize(width,Math.max(1,Math.round(width*FLOOR3D_MIN_ASPECT)),false);return}
  /* Fit what the camera will actually SEE, not the size of the thing in world space. A
     mining room is wide and flat, so seen down an isometric axis it is far shorter than it is
     broad; sizing both axes from one radius left a third of the frame empty above and below.
     The eight corners of the bounds are projected onto the camera's own right and up vectors
     and the frustum is fitted to those extents. */
  const distance=bounds.radius*6;
  const view=floor3dExtent(bounds,floor3dView.azimuth,floor3dView.elevation,distance);
  const eye=view.eye;
  /* The PANEL is sized from the default vantage, not the current one. Deriving its height
     from whichever way the camera happens to be pointing meant the card grew and shrank
     under the cursor while you dragged, which is unusable. */
  const frame=floor3dViewIsDefault()?view:floor3dExtent(bounds,FLOOR3D_DEFAULT_VIEW.azimuth,FLOOR3D_DEFAULT_VIEW.elevation,distance);
  let halfW=view.halfW,halfH=view.halfH;
  /* The panel takes its shape from the room rather than the other way round. A fixed
     width*0.42 letterbox was 2.38:1 against scenes that project between 1.37:1 (a spare
     room) and 1.76:1 (a megacampus), so the fit - which is bound by whichever axis runs out
     first - left 41% of the width empty and the scene occupying under a third of the frame.
     Sizing the canvas to the extent that is about to be drawn removes the slack at source.
     The clamps stop a tall room turning the panel into a tower, and stop a wide one
     collapsing it to a strip. */
  floor3dFitShadow(bounds);
  const contentAspect=frame.halfW/frame.halfH;
  const height=Math.max(1,Math.round(Math.min(
    Math.max(width/contentAspect, width*FLOOR3D_MIN_ASPECT),
    width*FLOOR3D_MAX_ASPECT,
    Math.max(260,(window.innerHeight||760)*FLOOR3D_VIEWPORT_SHARE))));
  floor3dRenderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  floor3dRenderer.setSize(width,height,false);
  // Whichever axis does not fit its half of the frame decides the zoom.
  const fitW=halfW,fitH=halfH,frameAspect=width/height;
  let viewW=fitW,viewH=fitH;
  if(fitW/fitH>frameAspect)viewH=fitW/frameAspect; else viewW=fitH*frameAspect;
  const zoom=floor3dView.zoom||1;
  floor3dCamera.left=-viewW/zoom;floor3dCamera.right=viewW/zoom;
  floor3dCamera.top=viewH/zoom;floor3dCamera.bottom=-viewH/zoom;
  floor3dCamera.position.set(eye[0],eye[1],eye[2]);
  floor3dCamera.near=-distance*2;floor3dCamera.far=distance*4;
  floor3dCamera.lookAt(bounds.x,bounds.y,bounds.z);
  floor3dCamera.updateProjectionMatrix();
  floor3dRenderer.render(floor3dScene,floor3dCamera);
}

/* Measuring the scene without Box3.

   The bundled three.js is tree-shaken down to thirty exports and Box3 is not among them, so
   the bounds are read straight out of the instance matrices. Done once per rebuild and
   cached, which is where it belonged anyway: the previous attempt rebuilt a bounding box
   every frame to answer a question that only changes when the floor does.

   The size of an instance is its geometry's own local box put through the instance matrix,
   NOT the length of the matrix's basis vectors. A basis vector's length is the SCALE, and a
   BoxGeometry runs from -0.5 to 0.5, so treating scale as a half-extent measured every box
   at twice its size and left a quarter of the frame empty on all four sides. Cylinders and
   the fan torus are not unit-sized either, which is the other reason to ask the geometry.

   Framing off the footprint alone was the bug this replaces. It ignored everything standing
   ON the floor - walls, racks, the service bay - so a short frame clipped the top of the
   room while leaving a gap beneath it, because the camera was aimed at the ground rather
   than at the middle of what there was to look at. */
/* Panel shape limits, as multiples of its width. The floor is the old fixed ratio, so no
   room is ever shorter on screen than it used to be; the ceiling keeps a nearly-square room
   from turning the page into a lift shaft; the viewport share stops a wide monitor handing
   the floor more height than the reader has screen. */
const FLOOR3D_MIN_ASPECT=.42;
const FLOOR3D_MAX_ASPECT=.78;
const FLOOR3D_VIEWPORT_SHARE=.62;

/* PCFSoftShadowMap. The bundle is tree-shaken and does not export the constant, but it is
   only a number, and the shadow pipeline itself survived the shake. */
const FLOOR3D_SOFT_SHADOWS=2;
let floor3dKeyLight=null,floor3dShadowKey="";

/* The shadow camera has to enclose the scene, and the scene changes size by a factor of five
   between a spare room and a megacampus. Refitted only when the bounds actually move. */
/* Where the camera sits for a given orbit, and how much of the scene that vantage spans on
   screen. Separated out because the panel's shape and the camera's frustum need it for two
   different vantages once the view can be dragged. */
function floor3dExtent(bounds,azimuth,elevation,distance){
  const ce=Math.cos(elevation),se=Math.sin(elevation);
  const eye=[bounds.x+distance*ce*Math.sin(azimuth),bounds.y+distance*se,bounds.z+distance*ce*Math.cos(azimuth)];
  const fwd=norm([bounds.x-eye[0],bounds.y-eye[1],bounds.z-eye[2]]);
  const right=norm(cross(fwd,[0,1,0]));
  const up=cross(right,fwd);
  let halfW=0,halfH=0;
  for(const cx of [bounds.minX,bounds.maxX])for(const cy of [bounds.minY,bounds.maxY])for(const cz of [bounds.minZ,bounds.maxZ]){
    const d=[cx-bounds.x,cy-bounds.y,cz-bounds.z];
    halfW=Math.max(halfW,Math.abs(dot(d,right)));
    halfH=Math.max(halfH,Math.abs(dot(d,up)));
  }
  // A little air so the roofline and the front edge of the floor are not touching the frame.
  const margin=1.12;
  return{eye,halfW:Math.max(halfW*margin,.5),halfH:Math.max(halfH*margin,.5)};
}
function floor3dFitShadow(bounds){
  const key=floor3dKeyLight;
  if(!key||!bounds)return;
  const signature=bounds.radius.toFixed(3)+":"+bounds.x.toFixed(2)+":"+bounds.z.toFixed(2);
  if(signature===floor3dShadowKey)return;
  floor3dShadowKey=signature;
  if(floor3dRenderer)floor3dRenderer.shadowMap.needsUpdate=true;
  const reach=bounds.radius*1.35,camera=key.shadow.camera;
  camera.left=-reach;camera.right=reach;camera.top=reach;camera.bottom=-reach;
  camera.near=.5;camera.far=Math.max(20,bounds.radius*14);
  camera.updateProjectionMatrix();
  key.target.position.set(bounds.x,bounds.y,bounds.z);
  key.target.updateMatrixWorld();
}

/* PICKING WITHOUT RAYCASTING THE WHOLE ROOM.

   Raycaster does work against InstancedMesh and returns an instanceId that maps through
   userData.batchIds to a batch - but it tests every instance, and at megacampus that is
   10.8ms for one ray. Two thirds of a frame to answer a single click, and hover impossible.

   A per-batch bounding volume was the obvious fix and is not: a room of open racks is mostly
   empty space, so a ray passing through a nearer rack's box beats the machine it actually
   hits. Loose boxes agreed with brute force 54% of the time, and TIGHTENING them made it
   worse - 36% - because a tight box misses the true batch and the ray falls through to
   something further away.

   What works is the same axis-aligned box per INSTANCE, flattened into typed arrays and
   swept in one loop: 98% agreement with brute force at 1.4ms median, built once per rebuild.
   The 2% are rays grazing a cylinder or torus where the box is a little larger than the
   shape, which is the right way to be wrong about what is under a cursor. */
let floor3dPickTable=null;
function floor3dBuildPickTable(root){
  const min=[],max=[],ids=[];
  root.traverse(node=>{
    // Haloes are additive light sitting in front of everything; four rays in a scan of 576
    // were intercepted by one before reaching the machine behind it.
    if(!node.isInstancedMesh||node.userData.glow)return;
    const g=node.geometry;
    if(!g)return;
    if(!g.boundingBox)g.computeBoundingBox();
    const bb=g.boundingBox;
    if(!bb)return;
    const lx=(bb.min.x+bb.max.x)/2,ly=(bb.min.y+bb.max.y)/2,lz=(bb.min.z+bb.max.z)/2,
          hx=(bb.max.x-bb.min.x)/2,hy=(bb.max.y-bb.min.y)/2,hz=(bb.max.z-bb.min.z)/2;
    const m=node.instanceMatrix.array,batch=node.userData.batchIds||[];
    for(let i=0;i<node.count;i++){
      const o=i*16;
      const cx=m[o]*lx+m[o+4]*ly+m[o+8]*lz+m[o+12],
            cy=m[o+1]*lx+m[o+5]*ly+m[o+9]*lz+m[o+13],
            cz=m[o+2]*lx+m[o+6]*ly+m[o+10]*lz+m[o+14];
      if(!Number.isFinite(cx)||!Number.isFinite(cy)||!Number.isFinite(cz))continue;
      const ex=Math.abs(m[o])*hx+Math.abs(m[o+4])*hy+Math.abs(m[o+8])*hz,
            ey=Math.abs(m[o+1])*hx+Math.abs(m[o+5])*hy+Math.abs(m[o+9])*hz,
            ez=Math.abs(m[o+2])*hx+Math.abs(m[o+6])*hy+Math.abs(m[o+10])*hz;
      min.push(cx-ex,cy-ey,cz-ez);max.push(cx+ex,cy+ey,cz+ez);
      ids.push(Number.isInteger(batch[i])?batch[i]:-1);
    }
  });
  return{min:Float32Array.from(min),max:Float32Array.from(max),id:Int32Array.from(ids),n:ids.length};
}
/* Nearest box the ray enters, by the usual slab test. Returns a batch id, -1 for scenery, or
   null when the ray leaves the room entirely. */
function floor3dSweep(origin,dir){
  const table=floor3dPickTable;
  if(!table||!table.n)return null;
  const {min,max,id,n}=table;
  const ox=origin.x,oy=origin.y,oz=origin.z;
  const ix=1/dir.x,iy=1/dir.y,iz=1/dir.z;
  let best=null,bestT=Infinity;
  for(let k=0,o=0;k<n;k++,o+=3){
    let t0=(min[o]-ox)*ix,t1=(max[o]-ox)*ix;
    if(t0>t1){const t=t0;t0=t1;t1=t}
    let u0=(min[o+1]-oy)*iy,u1=(max[o+1]-oy)*iy;
    if(u0>u1){const t=u0;u0=u1;u1=t}
    if(u0>t0)t0=u0;
    if(u1<t1)t1=u1;
    if(t0>t1)continue;
    let v0=(min[o+2]-oz)*iz,v1=(max[o+2]-oz)*iz;
    if(v0>v1){const t=v0;v0=v1;v1=t}
    if(v0>t0)t0=v0;
    if(v1<t1)t1=v1;
    if(t0>t1||t1<0)continue;
    if(t0<bestT){bestT=t0;best=id[k]}
  }
  return best;
}
/* Built on first use, not at parse time: mount.js is loaded with the application, and the
   three.js bundle is fetched lazily afterwards. Constructing these at the top level threw
   before FloorThree existed, which aborted the rest of this module and surfaced as a
   confusing "cannot access floor3dScene before initialization" somewhere else entirely. */
let floor3dRay=null,floor3dNdc=null;
/* Which batch is under a point on the canvas, in CSS pixels relative to the element. */
function floor3dPickAt(x,y){
  if(!floor3dCanvas||!floor3dCamera||!floor3dPickTable)return null;
  if(!floor3dRay){floor3dRay=new FloorThree.Raycaster();floor3dNdc=new FloorThree.Vector2()}
  const width=floor3dCanvas.clientWidth,height=floor3dCanvas.clientHeight;
  if(!width||!height)return null;
  floor3dNdc.set(x/width*2-1,-(y/height*2-1));
  floor3dRay.setFromCamera(floor3dNdc,floor3dCamera);
  const hit=floor3dSweep(floor3dRay.ray.origin,floor3dRay.ray.direction);
  return hit===null||hit<0?null:hit;
}

let floor3dBounds=null;
function floor3dMeasure(root){
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity,found=false;
  root.traverse(node=>{
    if(!node.isInstancedMesh||!node.instanceMatrix)return;
    const g=node.geometry;
    if(!g)return;
    if(!g.boundingBox)g.computeBoundingBox();
    const bb=g.boundingBox;
    if(!bb)return;
    // Local centre and half-extent of whatever shape this mesh instances.
    const lx=(bb.min.x+bb.max.x)/2,ly=(bb.min.y+bb.max.y)/2,lz=(bb.min.z+bb.max.z)/2,
          hx=(bb.max.x-bb.min.x)/2,hy=(bb.max.y-bb.min.y)/2,hz=(bb.max.z-bb.min.z)/2;
    const m=node.instanceMatrix.array;
    for(let i=0;i<node.count;i++){
      const o=i*16;
      // Centre through the matrix, then the standard transformed-AABB half-extent: each
      // world axis takes a contribution from every local axis it is rotated across.
      const x=m[o]*lx+m[o+4]*ly+m[o+8]*lz+m[o+12],
            y=m[o+1]*lx+m[o+5]*ly+m[o+9]*lz+m[o+13],
            z=m[o+2]*lx+m[o+6]*ly+m[o+10]*lz+m[o+14];
      if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))continue;
      const ex=Math.abs(m[o])*hx+Math.abs(m[o+4])*hy+Math.abs(m[o+8])*hz,
            ey=Math.abs(m[o+1])*hx+Math.abs(m[o+5])*hy+Math.abs(m[o+9])*hz,
            ez=Math.abs(m[o+2])*hx+Math.abs(m[o+6])*hy+Math.abs(m[o+10])*hz;
      minX=Math.min(minX,x-ex);maxX=Math.max(maxX,x+ex);
      minY=Math.min(minY,y-ey);maxY=Math.max(maxY,y+ey);
      minZ=Math.min(minZ,z-ez);maxZ=Math.max(maxZ,z+ez);
      found=true;
    }
  });
  if(!found)return null;
  const x=(minX+maxX)/2,y=(minY+maxY)/2,z=(minZ+maxZ)/2;
  const radius=Math.max(maxX-minX,maxY-minY,maxZ-minZ)/2||1;
  return {x,y,z,radius,minX,minY,minZ,maxX,maxY,maxZ};
}

let floor3dScene=null;
function floor3dBuildScene(){
  const T=FloorThree;
  if(!floor3dScene){
    floor3dScene=new T.Scene();
    /* Rebalanced for contrast rather than legibility alone. A hemisphere light at 2.4 lit
       every surface from every direction, which reads as evenly as a technical drawing and
       leaves nothing for a shadow to darken - machines sat on the floor without touching it.
       The sky term now fills the shadows instead of erasing them, and the key is lower in
       the sky so what it casts is long enough to see. */
    floor3dScene.add(new T.HemisphereLight(0xe6f6ff,0x33424c,1.3));
    const key=new T.DirectionalLight(0xffe8c2,3.2);key.position.set(9,11,6);
    key.castShadow=true;key.shadow.mapSize.width=1024;key.shadow.mapSize.height=1024;
    // Normal bias rather than a heavy depth bias: a large constant bias detaches the shadow
    // from the object that casts it, which is worse than no shadow at all.
    key.shadow.bias=-.0009;key.shadow.normalBias=.02;
    floor3dScene.add(key);floor3dKeyLight=key;
    const fill=new T.DirectionalLight(0x80b9ea,.7);fill.position.set(-8,5,-3);floor3dScene.add(fill);
    floor3dRenderer.shadowMap.enabled=true;
    floor3dRenderer.shadowMap.type=FLOOR3D_SOFT_SHADOWS;
    /* Nothing in the room moves except fan blades, and a fan blade's shadow is invisible at
       this scale, so redrawing the shadow map sixty times a second buys nothing. It is
       refreshed when the floor is rebuilt or the camera is refitted instead, which took the
       worst-frame cost at megacampus from 1.2ms to 0.2ms. */
    floor3dRenderer.shadowMap.autoUpdate=false;
    floor3dRenderer.shadowMap.needsUpdate=true;
  }
  if(floor3dBuilt){floor3dScene.remove(floor3dBuilt.root);floor3dDisposeScene()}
  /* A BUILD THAT FAILS GETS A SMALLER ONE, NOT THE FLAT FLOOR.

     Allocating a scene is the one place this can run out of room on a machine with less
     headroom than the one it was written on, and dropping to the flat floor there is the worst
     outcome available: the largest operation in the game is the one that most wants to be
     seen. The budget is halved and the scene rebuilt, twice, before anything gives up - and
     what a smaller budget costs is machines drawn per shelf, which was always a
     representation. */
  floor3dBuilt=null;
  for(const relief of [1,2,4]){
    try{ floor3dBuilt=FloorScene.build(FloorModel.describe(),{relief}); break }
    catch(error){
      floor3dDisposeScene();
      if(relief===4){
        floor3dReport("3D floor could not be built",`The device ran out of room while building the floor (${error.message}).`,"The flat floor is showing instead.");
        floor3dFailPermanently(`The 3D floor could not be built at this fleet size (${error.message}).`);return;
      }
    }
  }
  floor3dScene.add(floor3dBuilt.root);
  floor3dPickTable=floor3dBuildPickTable(floor3dBuilt.root);
  // New geometry casts new shadows; the cached map has to be told.
  floor3dRenderer.shadowMap.needsUpdate=true;
  floor3dBounds=floor3dMeasure(floor3dBuilt.root)||{x:floor3dBuilt.cx,y:1,z:floor3dBuilt.cz,
    radius:Math.max(floor3dBuilt.width,floor3dBuilt.depth)/2};
  floor3dPrepareAlerts();
}

/* Called after every repaint of the Mine tab. Re-attaches the surviving canvas, rebuilds the
   scene only if the floor actually changed, and runs the fan animation only when the tab is
   visible and the player has not asked for less motion. */
/* POINTER BEHAVIOUR.

   Deliberately no wheel handler. Zooming a canvas under the cursor mid-page means consuming
   the wheel, and a reader who scrolls past a floor that swallows their scroll has been given
   a worse bug than the one that zoom fixes. Drag orbits, the buttons zoom.

   Hover picking is coalesced into a frame: at megacampus one pick is 1.4ms, so picking per
   pointermove event would spend more of the frame answering "what is under the cursor" than
   drawing the room. */
/* The camera as two angles and a zoom, rather than a fixed vantage. The projection is
   orthographic, so the eye's distance changes nothing about framing - only the direction
   and the frustum size matter - which is why orbiting can be this cheap. */
const FLOOR3D_DEFAULT_VIEW={azimuth:Math.PI/4,elevation:Math.atan2(.8,Math.SQRT2),zoom:1};
const FLOOR3D_MIN_ELEVATION=.18,FLOOR3D_MAX_ELEVATION=1.32;
const FLOOR3D_MIN_ZOOM=.55,FLOOR3D_MAX_ZOOM=6;
let floor3dView={...FLOOR3D_DEFAULT_VIEW},floor3dViewTouched=false;
function floor3dViewIsDefault(){
  return !floor3dViewTouched;
}
function floor3dResetView(){
  floor3dView={...FLOOR3D_DEFAULT_VIEW};floor3dViewTouched=false;
  floor3dSyncViewControls();floor3dDraw();
}
function floor3dZoomBy(factor){
  floor3dView.zoom=Math.min(FLOOR3D_MAX_ZOOM,Math.max(FLOOR3D_MIN_ZOOM,floor3dView.zoom*factor));
  floor3dViewTouched=true;floor3dSyncViewControls();floor3dDraw();
}
function floor3dSyncViewControls(){
  const reset=document.querySelector('[data-action="floor3d-reset"]');
  if(reset)reset.disabled=floor3dViewIsDefault();
}
let floor3dHover=null,floor3dHoverRaf=0,floor3dPointer={x:0,y:0},floor3dPressed=null;
/* A press that moves is an orbit; a press that does not is a click. Four pixels of slop,
   because a mouse always moves a little between down and up. */
const FLOOR3D_DRAG_SLOP=4;
function floor3dPointerDown(event){
  if(event.button!==undefined&&event.button!==0)return;
  floor3dPressed={x:event.clientX,y:event.clientY,moved:false,
    azimuth:floor3dView.azimuth,elevation:floor3dView.elevation};
  if(floor3dCanvas.setPointerCapture)try{floor3dCanvas.setPointerCapture(event.pointerId)}catch(e){}
}
function floor3dPointerUp(event){
  if(!floor3dPressed)return;
  const dragged=floor3dPressed.moved;
  floor3dPressed=null;
  if(floor3dCanvas.releasePointerCapture)try{floor3dCanvas.releasePointerCapture(event.pointerId)}catch(e){}
  if(floor3dCanvas)floor3dCanvas.classList.remove("dragging");
  // A drag must not also select whatever happened to be under the finger when it stopped.
  if(dragged)floor3dSuppressClick=true;
}
let floor3dSuppressClick=false;
function floor3dOrbit(event){
  const start=floor3dPressed;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(!start.moved&&Math.hypot(dx,dy)<FLOOR3D_DRAG_SLOP)return;
  if(!start.moved){start.moved=true;floor3dCanvas.classList.add("dragging")}
  floor3dView.azimuth=start.azimuth-dx*.008;
  floor3dView.elevation=Math.min(FLOOR3D_MAX_ELEVATION,Math.max(FLOOR3D_MIN_ELEVATION,start.elevation+dy*.006));
  floor3dViewTouched=true;
  floor3dSyncViewControls();
  floor3dDraw();
}
function floor3dApplyHover(next){
  if(next===floor3dHover)return;
  floor3dHover=next;
  if(floor3dCanvas)floor3dCanvas.style.cursor=next===null?"":"pointer";
  floor3dUpdateReadout();
  floor3dDraw();
}
/* The batch under the cursor, described in words, so hovering says something before you
   commit to a click. The flat floor puts the same text in a title attribute. */
function floor3dUpdateReadout(){
  const host=document.querySelector("[data-floor3d-readout]");
  if(!host)return;
  const batch=floor3dHover===null?null:FloorModel.batches().find(b=>b.id===floor3dHover);
  if(!batch){host.textContent=floor3dSelectedLabel();host.classList.remove("live");return}
  host.classList.add("live");
  host.textContent=`${batch.hardware?.name||"Machine"} · ${batch.qty>1?`${fmtCompactNumber(batch.qty)} units · `:""}${batch.label||batch.status}`;
}
function floor3dSelectedLabel(){
  const id=Number.isInteger(state.floorSelected)?state.floorSelected:-1;
  const batch=id<0?null:FloorModel.batches().find(b=>b.id===id);
  if(!batch)return "Hover a machine to inspect it. Click a faulted one to open its repair.";
  return `Selected: ${batch.hardware?.name||"machine"} · ${batch.label||batch.status}`;
}
function floor3dPointerMove(event){
  const rect=floor3dCanvas.getBoundingClientRect();
  floor3dPointer.x=event.clientX-rect.left;floor3dPointer.y=event.clientY-rect.top;
  if(floor3dPressed){floor3dOrbit(event);return}
  if(floor3dHoverRaf)return;
  floor3dHoverRaf=requestAnimationFrame(()=>{
    floor3dHoverRaf=0;
    if(!floor3dCanvas||!floor3dCanvas.parentElement)return;
    floor3dApplyHover(floor3dPickAt(floor3dPointer.x,floor3dPointer.y));
  });
}
function floor3dPointerLeave(){
  floor3dPointer.x=-1;floor3dPointer.y=-1;
  floor3dApplyHover(null);
}
/* A click selects, and a faulted machine also opens its repair - the same destination the
   flat floor's clickable units reach, so the two views cannot disagree about what clicking a
   broken machine means. */
function floor3dClick(event){
  if(floor3dSuppressClick){floor3dSuppressClick=false;return}
  const rect=floor3dCanvas.getBoundingClientRect();
  const id=floor3dPickAt(event.clientX-rect.left,event.clientY-rect.top);
  if(id===null){
    if(Number.isInteger(state.floorSelected)&&state.floorSelected>=0){
      state.floorSelected=-1;save();floor3dRebuild();
    }
    return;
  }
  state.floorSelected=id;save();
  floor3dRebuild();
  const batch=FloorModel.batches().find(b=>b.id===id);
  if(batch&&(batch.status==="fault"||batch.status==="repair")&&batch.hardware&&typeof focusServiceRow==="function")
    focusServiceRow(batch.hardware.id);
}
/* The selection ring is geometry, so changing the selection means rebuilding - cheap at this
   size, and it keeps one description of the floor rather than a second overlay. */
function floor3dRebuild(){
  floor3dBuildScene();
  floor3dSignature=floor3dSignatureNow();floor3dStatusSignature=floor3dStatusSignatureNow();
  floor3dUpdateReadout();
  floor3dDraw();
}
function floor3dBindPointer(){
  if(!floor3dCanvas||floor3dCanvas.dataset.pointerBound)return;
  floor3dCanvas.dataset.pointerBound="1";
  floor3dCanvas.addEventListener("pointerdown",floor3dPointerDown);
  floor3dCanvas.addEventListener("pointermove",floor3dPointerMove);
  floor3dCanvas.addEventListener("pointerup",floor3dPointerUp);
  floor3dCanvas.addEventListener("pointercancel",floor3dPointerUp);
  floor3dCanvas.addEventListener("pointerleave",floor3dPointerLeave);
  floor3dCanvas.addEventListener("click",floor3dClick);
  /* Deliberately no wheel listener. Zooming under the cursor means consuming the wheel, and
     a reader scrolling past a floor that eats their scroll has a worse problem than the one
     zoom solves. The buttons zoom. */
}

/* ONE UPDATE PER FRAME, NOT ONE PER REPAINT.

   mountFloor3d() is called from every repaint of the Mine tab, and it did its whole job
   synchronously each time: compare signatures, maybe rebuild, upload buffers, render five and
   a half million triangles. At sixteen times speed that is several per second, and a burst of
   them issues renders and buffer uploads back to back with no frame boundary for the driver to
   catch up on. Fifteen in a row is enough to lose the WebGL context outright on this machine -
   which is the crash reported at fifty thousand miners, and it reproduces on a clean page.

   Repaints are now collapsed onto the next animation frame. The floor cannot usefully update
   more often than the display does, so nothing is lost, and a burst of ten repaints costs one
   update instead of ten. */
let floor3dPending=0,floor3dPendingTimer=0;
function mountFloor3d(){
  const host=document.querySelector(".floor-3d-mount");
  if(!host){floor3dStop();return}
  if(floor3dState!=="ready"){ensureFloor3dLoaded();return}
  if(floor3dPending||floor3dPendingTimer)return;
  /* An animation frame is the right moment to draw and the wrong thing to DEPEND on. A hidden
     or backgrounded tab suspends rAF entirely, and this project has already been bitten once by
     work parked behind a frame that never arrived - a modal that never appeared while the clock
     sat stopped. So both are armed and whichever fires first does the work: the frame when the
     page is being looked at, the timer when it is not. */
  const run=()=>{
    if(floor3dPending)cancelAnimationFrame(floor3dPending);
    clearTimeout(floor3dPendingTimer);
    floor3dPending=0;floor3dPendingTimer=0;
    floor3dUpdate();
  };
  floor3dPending=requestAnimationFrame(run);
  floor3dPendingTimer=setTimeout(run,120);
}
function floor3dUpdate(){
  try{floor3dUpdateNow()}
  catch(error){floor3dScheduleRecovery(`The 3D floor hit an error while updating (${error.message}).`)}
}
function floor3dUpdateNow(){
  const host=document.querySelector(".floor-3d-mount");
  if(!host){floor3dStop();return}
  if(floor3dState!=="ready")return;
  if(!floor3dEnsureRenderer())return;
  /* A context that has already gone cannot be drawn into, and hammering it is how a recoverable
     hiccup becomes a permanent fallback. */
  const gl=floor3dRenderer.getContext&&floor3dRenderer.getContext();
  if(gl&&gl.isContextLost())return;
  if(floor3dCanvas.parentElement!==host)host.appendChild(floor3dCanvas);
  floor3dBindPointer();
  const signature=floor3dSignatureNow();
  if(signature!==floor3dSignature){floor3dBuildScene();floor3dSignature=signature;floor3dStatusSignature=floor3dStatusSignatureNow()}
  else{
    const statuses=floor3dStatusSignatureNow();
    if(statuses!==floor3dStatusSignature){floor3dApplyStatuses();floor3dStatusSignature=statuses}
  }
  floor3dDraw();
  floor3dUpdateReadout();
  floor3dSyncViewControls();
  floor3dStop();
  const still=typeof reducedMotion==="function"&&reducedMotion();
  if(!still&&floor3dBuilt&&(floor3dBuilt.animated||floor3dAnythingWrong())){
    const step=time=>{
      if(!floor3dCanvas||document.hidden||!floor3dCanvas.parentElement){floor3dRaf=0;return}
      try{
        if(floor3dBuilt.animated)floor3dBuilt.animate(time);
        floor3dPulse(time);
      }catch(error){floor3dRaf=0;floor3dScheduleRecovery(`The 3D floor hit an error while animating (${error.message}).`);return}
      floor3dDraw();
      floor3dRaf=requestAnimationFrame(step);
    };
    floor3dRaf=requestAnimationFrame(step);
  }
}
