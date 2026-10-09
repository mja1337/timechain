"use strict";

/* THE ADAPTER between the operation and the floor renderer.

   In the prototype, FloorModel was a self-contained demo: its own site presets, its own
   fleet, its own faults, its own repair queue. Here it computes nothing. Every value is
   already a decision the game has made - which machines are installed, which are faulted,
   who is on the payroll, how hot the room is - and this only puts them in the shape the
   assembler reads. If a number appears here that is not already true elsewhere in the
   engine, it is in the wrong file.

   In particular the batch list comes straight from floorBatches(), the same array the SVG
   floor draws, so the two renderers cannot disagree about what is standing on the floor. */

/* Room geometry, in metres. Deliberately NOT derived from a facility's kilowatts or floor
   space: those describe how much a site can hold, which is not the same as a room you can
   see. These are drawn to read at each scale and to grow the way the sites do. */
const FLOOR_SITES=[
  {id:"home",      year:2009, width:9,  depth:7,  cols:3},
  {id:"garage",    year:2010, width:13, depth:10, cols:4},
  {id:"workshop",  year:2012, width:18, depth:14, cols:5},
  {id:"warehouse", year:2015, width:23, depth:18, cols:6},
  {id:"campus",    year:2018, width:29, depth:21, cols:8},
  {id:"container", year:2020, width:31, depth:25, cols:8, outdoor:true},
  {id:"hydroplant",year:2023, width:34, depth:25, cols:8, outdoor:true},
  {id:"megacampus",year:2025, width:38, depth:28, cols:10,outdoor:true},
];

const FloorModel=(()=>{
  /* The renderer speaks of a machine as hashing, faulted, being repaired or off. The engine
     distinguishes a machine that is powered down from one the site cannot power, which is a
     real difference to the operator and not one you can see across a room. */
  const STATUS={online:"online",paused:"off",broken:"fault",repair:"repair"};

  const site=id=>FLOOR_SITES.find(s=>s.id===id)||FLOOR_SITES[0];

  /* The site is dressed for whichever machine there are most of: a room holding six hundred
     S19s and one laptop is an S19 room. */
  function dominantHardware(){
    const owned=floorOwnedHardware();
    if(!owned.length)return HARDWARE[0];
    return owned.reduce((best,h)=>(state.hardware[h.id]||0)>(state.hardware[best.id]||0)?h:best,owned[0]);
  }
  /* Every installed and on-order piece of plant, in the order the ladder defines them, so
     the room can be dressed with the equipment actually bought rather than a generic vent
     count derived from how big the site is. Quantities are real: the renderer decides how
     many it can legibly draw, not this. */
  function cooling(){
    const equipment=state.thermal?.equipment||{},running=typeof thermalPowerAvailable==="function"?thermalPowerAvailable():true;
    const installed=COOLING_EQUIPMENT.filter(item=>(equipment[item.id]||0)>0)
      .map(item=>({id:item.id,name:item.name,qty:Math.max(0,Math.floor(equipment[item.id])),coolingKw:item.coolingKw,units:item.units||0,running}));
    const orders={};
    for(const order of (state.thermal?.orders||[]))orders[order.id]=(orders[order.id]||0)+Math.max(1,Number(order.qty)||1);
    const pending=COOLING_EQUIPMENT.filter(item=>orders[item.id]).map(item=>({id:item.id,name:item.name,qty:orders[item.id]}));
    /* How full the tanks are, for the tanks that hold miners. */
    const submerged=typeof immersionTotal==="function"?immersionTotal():0;
    const slots=typeof immersionCapacity==="function"?immersionCapacity():0;
    return{installed,pending,running,submerged,slots};
  }
  function installedCooling(){
    const installed=COOLING_EQUIPMENT.filter(item=>(state.thermal?.equipment?.[item.id]||0)>0);
    return installed.length?installed[installed.length-1]:null;
  }

  function definitions(){
    const f=facility();
    return {p:site(f.id),h:dominantHardware(),f,c:installedCooling()};
  }

  /* One entry per sprite on the floor, in the assembler's vocabulary. The heavy lifting -
     how many sprites a type earns, and which of them are faulted - was done by the engine. */
  function batches(){
    return floorBatches().map((b,i)=>({id:i,qty:b.qty,status:STATUS[b.status]||"online",
      hardware:b.hardware,label:b.label,clickable:b.clickable,
      condition:b.condition,ailing:b.ailing,reason:b.reason}));
  }

  /* How close the room is to the heat it can shed. The renderer tints by this; the figure is
     the engine's own, not a second thermal model. */
  function metrics(){
    const fs=fleet(),capacity=typeof coolingCapacityKw==="function"?coolingCapacityKw():0;
    const load=fs.kw||0;
    return {active:fs.count-(fs.offlineCount||0),offline:fs.offlineCount||0,hash:fs.hash,
      miningKw:load,capacity,heatRatio:capacity>0?Math.min(2,load/capacity):(load>0?1:0)};
  }

  /* The people you are actually paying, one sprite each. */
  function crew(){
    const roster=typeof STAFF!=="undefined"?STAFF:[];
    const hired={};
    for(const id of (state.staff||[]))hired[id]=(hired[id]||0)+1;
    return roster.flatMap(role=>Array.from({length:Math.min(8,hired[role.id]||0)},
      (_,index)=>({role:role.id,name:role.name,index})));
  }

  /* The description the assembler is handed. It is a projection, not a store: there is no
     floor state to keep in sync, because the operation is the state. */
  function describe(){
    const f=facility();
    return {preset:f.id,hardware:dominantHardware().id,power:state.power&&!gridCutOff()&&!state.policyLock,
      cooling:typeof thermalPowerAvailable==="function"?thermalPowerAvailable():true,
      /* Nothing is selected until something is selected. This was pinned at 0, so batch
         zero wore an orange selection ring in every room the game has ever drawn. */
      showStaff:true,selected:Number.isInteger(state.floorSelected)?state.floorSelected:-1};
  }

  return {presets:FLOOR_SITES,definitions,batches,metrics,crew,cooling,describe,site};
})();
