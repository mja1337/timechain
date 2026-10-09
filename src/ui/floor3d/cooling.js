"use strict";

/* THE COOLING PLANT, as installed.

   The room used to grow a number of identical wall vents derived from how big it was: one at
   home, two in a garage, six everywhere else, spinning whenever the site had power. It was
   dressing, not information. A box fan and a seven-million-dollar cooling tower looked the
   same, and buying plant changed nothing you could see - which was a straight downgrade from
   the flat view, where every installed item is drawn with its own icon and a count.

   So each rung of the ladder gets its own silhouette here, placed where that kind of plant
   actually goes: small air movers inside against the walls, industrial rejection outdoors on
   the pad, and immersion tanks on the floor among the miners, because a tank holds them.

   SHAPES is keyed by equipment id on purpose rather than being a chain of comparisons. A
   contract walks COOLING_EQUIPMENT against these keys, so adding an eighth kind of plant
   fails the build until it has been drawn instead of quietly rendering as nothing - which is
   the failure this whole module exists to correct. An earlier version used an if-chain and
   the same contract passed on a mention of the id in an unrelated lookup table.

   Counts are real but the drawing is capped - beyond a handful of identical units you are
   reading a label, not a room - so the surplus is stated on the sign instead.

   Nothing here decides anything. The plant list is what the engine says is installed. */

const FloorCooling=(()=>{
  /* How many of one type are worth drawing before the count stops being legible. */
  const MAX_DRAWN=6;

  /* A run of positions along an edge, centred and evenly spread. Returns fewer positions
     than asked for rather than overlapping them. */
  function run(count,span,gap){
    const fit=Math.max(1,Math.min(count,Math.floor(span/gap)));
    return Array.from({length:fit},(_,i)=>(i-(fit-1)/2)*gap);
  }

  /* Indoor plant shares the back wall; outdoor plant shares the pad to the right, or the
     ground behind when the site has no pad. Each shape advances the cursor it used so two
     kinds of plant never stack up on the same spot. */
  const SHAPES={
    boxfan(c){
      const {drawn,api,d}=c,span=Math.min(c.wallSpan,5.5);
      for(const dx of run(drawn,span,.85)){
        const x=c.layout.wallX+dx,z=-d/2+.95;
        api.tube([.05,.5,.05],[x,.25,z],c.C.steel);
        api.metal([.42,.05,.34],[x,.03,z],c.C.dark);
        api.metal([.56,.56,.12],[x,.72,z],c.C.steel);
        api.fan(x,.72,z+.09,.23,-1,c.live);
      }
      api.label(c.tag,[c.layout.wallX,1.25,-d/2+1.35],2.6,.22);
      c.layout.wallX+=span+1;
    },
    exhaust(c){
      const {drawn,api,d}=c,span=Math.min(c.wallSpan,6);
      for(const dx of run(drawn,span,1.5)){
        const x=c.layout.wallX+dx,z=-d/2+.3;
        api.metal([.95,.95,.5],[x,2.05,z+.1],c.C.steel);
        api.fan(x,2.05,z+.37,.33,-1,c.live);
        api.part('box',[.75,.28,.5],[x,2.62,z+.32],c.C.edge,[.5,0,0],-1,false,false,true);
        for(let k=0;k<5;k++)api.tube([.24,.16,.24],[x,1.9-k*.3,z+.62+k*.16],0x6c8189,[Math.PI/2,0,0]);
      }
      api.label(c.tag,[c.layout.wallX,2.95,-d/2+.45],3,.24);
      c.layout.wallX+=span+1;
    },
    axial(c){
      const {drawn,api,d}=c;
      for(const dx of run(drawn,c.wallSpan,2.1)){
        const x=c.layout.wallX+dx,z=-d/2+.34;
        api.metal([1.9,2.3,.4],[x,1.5,z],c.C.steel);
        for(const dy of [-.5,.5])api.fan(x,1.5+dy,z+.24,.42,-1,c.live);
        api.metal([1.9,.1,.5],[x,2.7,z+.02],c.C.edge);
      }
      api.label(c.tag,[c.layout.wallX,2.95,-d/2+.5],3.4,.26);
      c.layout.wallX+=c.wallSpan+1;
    },
    ahu(c){
      const {drawn,api,d}=c,span=Math.min(c.wallSpan,10);
      for(const dx of run(drawn,span,3.2)){
        const x=c.layout.wallX+dx,z=-d/2+1.15;
        api.metal([2.9,2.2,1.5],[x,1.2,z],0x8fa3a6);
        for(let k=0;k<4;k++)api.metal([.6,1.5,.06],[x-1.05+k*.7,1.25,z+.79],0x4c6265);
        api.metal([2.9,.14,1.6],[x,2.4,z],0x2f4a52);
        api.fan(x+.95,1.2,z+.8,.34,-1,c.live);
        api.metal([1.1,.5,d*.35],[x,2.75,z+d*.2],c.C.steel);
        for(let k=0;k<4;k++)api.metal([1.16,.06,.07],[x,2.75,z+.5+k*(d*.32/4)],c.C.edge);
      }
      api.label(c.tag,[c.layout.wallX,3.15,-d/2+2.1],3.8,.26);
      c.layout.wallX+=span+1;
    },
    /* Tanks go on the floor with the miners, because that is where the miners are. The lid
       is drawn raised so the fluid and the submerged racks are visible - a closed box would
       read as a shipping container and say nothing about what is in it. */
    immersion(c){
      const {api,w,d,item,plant}=c,tanks=Math.min(item.qty,4);
      for(const dx of run(tanks,Math.max(4,w-4),3.4)){
        const x=dx,z=d/2-2.4;
        api.metal([3.1,.9,1.5],[x,.5,z],0x37525c);
        api.box([2.9,.06,1.3],[x,.93,z],0x2f6f7d);
        for(let k=0;k<5;k++)api.metal([.42,.5,1.1],[x-1.12+k*.56,.72,z],0x24343a);
        api.metal([3.2,.09,.2],[x,.97,z-.78],c.C.edge);
        api.metal([3.2,.09,.2],[x,.97,z+.78],c.C.edge);
        api.part('box',[3.1,.07,1.5],[x-.1,1.5,z-1.1],0x5a7681,[-.9,0,0],-1,false,false,true);
        api.metal([.7,.5,.7],[x+1.9,.3,z],c.C.steel);
        api.tube([.16,.5,.16],[x+1.9,.62,z],0x61a1b2,[0,0,0],-1,true);
        for(const [dz,col] of [[-.28,0x5fb7df],[.28,0xdc8063]])
          api.tube([.07,2.6,.07],[x+1.9,.72,z+dz],col,[0,0,Math.PI/2],-1,true);
      }
      api.label(`${c.tag} · ${plant.submerged}/${plant.slots} SUBMERGED${plant.slots&&plant.submerged>=plant.slots?" · FULL":""}`,[0,1.75,d/2-1.5],6,.26);
    },
    evap(c){
      const {drawn,api,w,d,outdoors}=c,positions=run(drawn,10,3.6);
      const baseX=outdoors?w/2+3:c.layout.groundX,baseZ=outdoors?c.layout.padZ+2:-d/2-3.2;
      for(const dx of positions){
        const x=outdoors?baseX:baseX+dx,z=outdoors?baseZ+dx:baseZ;
        api.metal([3.3,2.2,2.4],[x,1.2,z],0x8ea8a4);
        for(let k=0;k<9;k++)api.part('box',[3.2,.12,.5],[x,.45+k*.22,z+1.24],0x53707a,[.35,0,0],-1,false,false,true);
        api.tube([.09,3.3,.09],[x,2.45,z],0x5fb7df,[0,0,Math.PI/2],-1,true);
        for(const dz of [-.7,.7])api.fan(x,2.62,z+dz,.5,-1,c.live);
      }
      api.label(c.tag,[baseX,3.3,outdoors?baseZ:baseZ+1.4],4,.28);
      if(outdoors)c.layout.padZ+=positions.length*3.6+1.5;else c.layout.groundX+=11.5;
    },
    /* A V-bank of finned coils with fans on the crown. No water anywhere: that is the whole
       difference between this and the evaporative bank above it. */
    drycooler(c){
      const {drawn,api,w,d,outdoors}=c,positions=run(drawn,11,3.8);
      const baseX=outdoors?w/2+3:c.layout.groundX,baseZ=outdoors?c.layout.padZ+2:-d/2-3.4;
      for(const dx of positions){
        const x=outdoors?baseX:baseX+dx,z=outdoors?baseZ+dx:baseZ;
        api.metal([3.4,.5,2.8],[x,.35,z],c.C.steel);
        for(const [dz,tilt] of [[-.75,.34],[.75,-.34]])api.part('box',[3.2,1.9,.16],[x,1.5,z+dz],0x6f8b93,[tilt,0,0],-1,false,false,true);
        api.metal([3.4,.16,2.6],[x,2.5,z],0x2f4a52);
        for(const dz of [-.66,.66])api.fan(x,2.62,z+dz,.52,-1,c.live);
        for(const [dz,col] of [[-1.3,0x5fb7df],[1.3,0xdc8063]])api.tube([.1,3.4,.1],[x,.7,z+dz],col,[0,0,Math.PI/2],-1,true);
      }
      api.label(c.tag,[baseX,3.3,outdoors?baseZ:baseZ+1.6],4.2,.28);
      if(outdoors)c.layout.padZ+=positions.length*3.8+1.5;else c.layout.groundX+=12.5;
    },
    coolingtower(c){
      const {drawn,api,w,d,outdoors}=c,positions=run(drawn,12,4.2);
      const baseX=outdoors?w/2+3:c.layout.groundX,baseZ=outdoors?c.layout.padZ+2.4:-d/2-3.6;
      for(const dx of positions){
        const x=outdoors?baseX:baseX+dx,z=outdoors?baseZ+dx:baseZ;
        api.metal([3.4,2.8,3.4],[x,1.6,z],0x9ab1b0);
        for(let k=0;k<7;k++)api.metal([3.3,.12,.07],[x,.6+k*.3,z+1.74],0x597c83);
        api.tube([1.25,.5,1.25],[x,3.2,z],c.C.steel);
        api.tube([1.05,.05,1.05],[x,3.42,z],c.C.dark);
        api.fan(x,3.5,z,.9,-1,c.live);
        api.tube([.11,3.4,.11],[x,.6,z-1.8],0xdc8063,[Math.PI/2,0,0],-1,true);
      }
      api.label(c.tag,[baseX,4,outdoors?baseZ:baseZ+1.9],4.6,.3);
      if(outdoors)c.layout.padZ+=positions.length*4.2+1.8;else c.layout.groundX+=14;
    }
  };

  function populate(s,api,site){
    const {box,part,fan,label,C}=api,{p}=FloorModel.definitions(s),plant=FloorModel.cooling(s);
    const w=p.width,d=p.depth,live=plant.running&&s.power;
    if(!plant.installed.length&&!plant.pending.length){
      /* An unequipped room still has a grille in the wall - it just does nothing, and now it
         is visibly nothing rather than a spinning fan implying cooling never bought. */
      // A spare room has a window for this, drawn by the home-office dressing in scenery.js, not a steel grille.
      if(!p.outdoor&&p.id!=='home'){box([1.1,1.05,.35],[0,1.75,-d/2+.32],C.steel);box([.92,.86,.05],[0,1.75,-d/2+.5],C.dark);}
      return;
    }
    const layout={wallX:-w/2+1.6,padZ:-d/2+1,groundX:-w/2+4};
    for(const item of plant.installed){
      const shape=SHAPES[item.id];
      if(!shape)continue;
      const drawn=Math.min(item.qty,MAX_DRAWN),surplus=item.qty-drawn;
      shape({s,api,site,p,w,d,live,plant,item,drawn,layout,C,
        wallSpan:w-3.2,outdoors:site.large||p.outdoor,
        tag:`${item.name.toUpperCase()}${item.qty>1?` ×${item.qty}`:""}`});
      if(surplus>0&&item.id!=="immersion")label(`+${surplus} MORE`,[layout.wallX-1.5,.55,-d/2+1.6],2,.2);
    }
    /* Plant that is paid for and not yet installed: crated, on the delivery side, inert. */
    if(plant.pending.length){
      const z=p.id==='home'?d/2-1.1:d/2-1.4;
      plant.pending.forEach((order,i)=>{
        const x=Math.min(w/2-1.6,-w/2+2.4+i*2.6);
        box([1.7,1.15,1.1],[x,.62,z],0x6b5f47);
        for(let k=0;k<3;k++)box([1.74,.09,1.14],[x,.28+k*.42,z],0x8a7a5c);
        box([.62,.02,.42],[x,1.2,z],0xd8dfd6,-1,true);
        label(`${order.name.toUpperCase()} ×${order.qty} · ON ORDER`,[x,1.55,z],3.4,.22);
      });
    }
  }
  return {populate,SHAPES,MAX_DRAWN};
})();
