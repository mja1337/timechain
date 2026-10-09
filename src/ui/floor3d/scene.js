"use strict";

/* THE ASSEMBLER - turns a floor description into a three.js scene and hands back something
   disposable. Ported unchanged from the floor prototype.

   View only. It reads a description of the floor and returns geometry; it never touches game
   state. Everything is instanced, which is why a megacampus of forty-four thousand miners
   draws in five calls rather than four thousand.

   ONE EDIT from the prototype: each batch is drawn with its OWN machine rather than with a
   single hardware type chosen for the whole scene. The prototype only ever showed one model
   at a time, so a scene-wide silhouette was enough; a real fleet is mixed, and drawing two
   GPU rigs and a laptop as three identical miners is simply wrong. */

/* View-only Three.js assembler. One persistent renderer, disposable instanced scenes. */
const FloorScene=(()=>{
  const T=FloorThree,C={slab:0x17262d,floor:0x516267,wall:0x768588,steel:0x283b43,edge:0x9aafb2,dark:0x111b22,orange:0xf7a13d,green:0x75e3b2,blue:0x68bafa,red:0xff705d,wood:0x916f4b};
  const colors={online:C.green,fault:C.red,repair:C.blue,off:0x52636c};
  /* THE FLOOR HAS TO FIT IN THE ROOM, AND LOOK LIKE IT BELONGS TO IT.

     Two things were wrong at fleet scale, and they were wrong in opposite directions at once.

     The grid took its column count from a number fixed per site rather than from the size of
     the thing being placed. A container yard used eight columns whatever it held, so a rack
     1.54 wide sat on a 3.0 pitch - half the room's width was empty aisle - while the rows it
     forced (nineteen of them, for a five-thousand-machine fleet) were crushed onto a 1.0
     pitch against a rack 1.15 deep. The floor overlapped itself front to back while wasting
     half of itself side to side.

     And the rack was drawn at one size regardless of the building around it. In a spare room
     that reads correctly. In a thirty-megawatt yard it reads as a handful of enormous
     cabinets, because the room is only thirty-one units across and a machine is nearly half
     of one - the picture says "large objects, small site" when the truth is the reverse.

     Both are the same fix. The grid is derived from the rack's actual footprint, so columns
     are however many genuinely fit; and when the batches still overflow, the whole floor is
     drawn to a smaller scale - machines and spacing together - the way a floor plan zooms out
     rather than marching its contents through the wall. A big site therefore draws small,
     dense rows, which is what a big site looks like. */
  const AISLE_X=.36,AISLE_Z=.62,FLOOR_MIN_SCALE=.24;
  function layout(s){
    const {p,h}=FloorModel.definitions(s),bs=FloorModel.batches(s);
    const usableW=p.width-(p.width>=18?7:3.8),usableD=p.depth-(p.width>=18?6:3.6);
    /* The footprint comes from the code that draws the rack, not from a constant kept here.
       A rack widens with the site - a megacampus stands eight machines abreast where a spare
       room stands two - and a pitch that did not follow it would put the rows through each
       other the moment the shape changed. */
    const typical=bs.length?Math.round(bs.reduce((sum,b)=>sum+b.qty,0)/bs.length):1;
    const foot=FloorMiners.rackFootprint(h,typical);
    const pitchX=foot.w+AISLE_X,pitchZ=foot.d+AISLE_Z,n=Math.max(1,bs.length);
    /* Start from the scale at which the batches would exactly fill the floor area, then walk
       it down until the integer grid it implies genuinely fits. The area estimate lands within
       a step or two of the answer, so this settles immediately rather than searching. */
    let scale=Math.min(1,Math.sqrt(usableW*usableD/(n*pitchX*pitchZ))),cols=1,rows=n;
    for(let attempt=0;attempt<24;attempt++){
      cols=Math.max(1,Math.min(n,Math.floor(usableW/(pitchX*scale))));
      rows=Math.ceil(n/cols);
      if(rows*pitchZ*scale<=usableD||scale<=FLOOR_MIN_SCALE)break;
      scale=Math.max(FLOOR_MIN_SCALE,scale*.92);
    }
    const dx=pitchX*scale,dz=pitchZ*scale;
    const cells=bs.map((b,i)=>{
      const col=i%cols,row=Math.floor(i/cols);
      // Container modules stagger their rows either side of the aisle; the offset shrinks
      // with the pitch so a packed yard does not overlap itself.
      const stagger=p.id==='container'?(row%2?1:-1)*Math.min(.8,dz*.18):0;
      /* Positions are emitted at full size and scaled with the geometry in part(), so the
         floor stays one coherent object: shrinking a rack without shrinking the gap between
         racks would leave a small machine adrift in a full-size aisle. */
      return{...b,x:(col-(cols-1)/2)*dx/scale,z:((row-(rows-1)/2)*dz+stagger)/scale-.3};
    });
    cells.scale=scale;cells.cols=cols;cells.rows=rows;
    return cells;
  }
  /* WHETHER THE DETAIL IS WORTH DRAWING.

     This asked whether the detail could be SEEN - below about two-thirds scale a roof ridge is
     sub-pixel - with affordability bolted on as an escape hatch that could only ever turn
     detail back on. That was the wrong way round, and correcting the case dimensions proved
     it: narrower machines make narrower racks, more racks fit, the floor draws at a larger
     scale, and five thousand machines sailed back over the visibility threshold into 459,000
     instances and a 2.9-second build - the exact multi-second freeze this project has twice
     been asked to remove.

     Cost is the constraint, so cost is the test, and it is a ceiling rather than a hint. What
     it counts is machines actually drawn, because that is what instances are proportional to:
     roughly sixty-five per machine with its ridges, louvres, controller board, serial plate
     and two thirteen-part fans, against roughly ten without. A thousand machines is about
     sixty-five thousand instances and seventy milliseconds, which is the budget.

     Nothing here consults scale any more. A floor of two hundred machines drawn small can
     still be zoomed into, and a floor of five thousand cannot afford the detail at any
     zoom. */
  const FLOOR_DETAIL_UNITS=1000;
  function floorDetail(s){
    const fs=typeof fleet==="function"?fleet():null;
    return !fs||fs.count<=FLOOR_DETAIL_UNITS;
  }
  /* A CEILING, BECAUSE THE FLEET HAS NONE.

     Instance count grew with the fleet and stopped nowhere. At a megacampus running fifty-six
     thousand machines that is a hundred and sixty thousand instances and a quarter-second
     build - survivable on the machine it was measured on, and a hard render failure on one
     with less headroom, which is what a player reported. Falling back to the flat floor at
     that point is the worst outcome available: the largest operation in the game is the one
     that most wants to be seen.

     So the floor draws to a budget. Machines per rack are reduced until the estimate fits,
     which costs a representation that was already a representation - nobody was ever drawing
     fifty-six thousand miners - and never costs the room, the racks, the plant or the fault
     beacons, which are what the picture is actually for.

     The per-machine figures are measured, not guessed: a detailed ASIC is about sixty-five
     instances with its ridges, louvres, board, plate and two thirteen-part fans; the coarse
     silhouette is about ten. */
  const FLOOR_INSTANCE_BUDGET=120000,FLOOR_PER_MACHINE_DETAIL=65,FLOOR_PER_MACHINE_COARSE=12;
  /* A rack costs something before it holds anything: uprights, a busway, a data spine and a
     shelf with rails and indicators for every level. That fixed cost is charged per BATCH, so
     the budget has to pay it before it can buy machines - an earlier version divided the whole
     budget by machines alone, concluded a megacampus could afford fifty-seven per rack, and
     never bound at all. */
  const FLOOR_PER_RACK=240;
  function floorUnitCap(batches,detail,relief=1){
    const per=detail?FLOOR_PER_MACHINE_DETAIL:FLOOR_PER_MACHINE_COARSE;
    const rows=Math.max(1,batches);
    const perRack=FLOOR_INSTANCE_BUDGET/(Math.max(1,relief)*rows)-FLOOR_PER_RACK;
    return Math.max(1,Math.floor(perRack/per));
  }
  function build(s,opts={}){
    const root=new T.Group(),{h}=FloorModel.definitions(s),stats=FloorModel.metrics(s),rows=layout(s),floorScale=rows.scale||1,detail=floorDetail(s),unitCap=floorUnitCap(rows.length,detail,opts.relief||1),buckets=new Map(),fanMeshes=[],textures=[],materials=[],signs=[];
    /* Segment counts are the cheapest realism available: every one of these geometries is
       instanced, so raising them costs vertices once and nothing per machine. Twelve-sided
       cylinders read as polygons at fan size, and a four-segment torus is a square ring. */
    const geo={box:new T.BoxGeometry(1,1,1),cylinder:new T.CylinderGeometry(1,1,1,20),torus:new T.TorusGeometry(1,.075,8,20)},dummy=new T.Object3D(),tint=new T.Color();let accentColor=null;
    /* `metal` picks a second lit material rather than a second colour: brushed aluminium and
       a painted steel frame reflect differently, and no per-instance colour can express that.
       It costs one extra draw call per geometry that uses it, which is the whole budget. */
    /* `glow` is the closest this renderer can get to a light that gives off light. The
       bundle is tree-shaken with no post-processing in it, so there is no bloom pass and no
       amount of emissive will bleed past an object's own silhouette. What does read as glow
       is the way a real one is photographed: a small bright core with a larger, dimmer,
       additively blended halo sitting behind it. One extra bucket covers every colour,
       because additive blending still honours the per-instance colour. */
    function part(kind,size,pos,color=C.steel,rot=[0,0,0],batch=-1,unlit=false,fan=false,metal=false,glow=false){
      const key=kind+':'+unlit+':'+fan+':'+metal+':'+glow;
      if(!buckets.has(key))buckets.set(key,{kind,unlit,fan,metal,glow,n:0,m:[],c:[],batch:[],tinted:[],items:fan?[]:null});
      /* Machine content is drawn to the floor's scale; the building it stands in is not.
         Batch parts carry a batch id, scenery carries -1, so the two never scale together -
         a shrinking floor inside a fixed room is the whole effect being aimed for. */
      const k=batch>=0?floorScale:1;
      dummy.position.set(pos[0]*k,pos[1]*k,pos[2]*k);dummy.scale.set(size[0]*k,size[1]*k,size[2]*k);dummy.rotation.set(...rot);dummy.updateMatrix();
      /* ACCUMULATED AS NUMBERS, NOT AS OBJECTS.

         This used to clone a Matrix4 and later allocate a Color for every instance. At
         megacampus scale that is a hundred and eleven thousand of each, and it was the whole
         of a seven-hundred-millisecond scene build - a main-thread block long enough that a
         run of rebuilds can have the browser give up on the GPU process, which surfaces as a
         lost context and a fall back to the flat floor.

         The sixteen matrix elements and three colour channels go straight into flat arrays
         that are copied into the instance buffers in one shot. Only fan buckets keep the
         per-item record, because the spin animation is the only thing that needs to rebuild a
         matrix later - and the scale it was drawn at has to travel with it, or the first
         animated frame snaps every fan back to full size in a shrunken rack. */
      const b=buckets.get(key),e=dummy.matrix.elements;
      /* Whether this instance is wearing the batch's STATUS colour. Status changes constantly on
         a large fleet - a fault appears, a repair finishes - and it changes nothing about the
         geometry, only the paint. Recording which instances are painted by it is what lets that
         be a repaint rather than a rebuild. */
      b.tinted.push(batch>=0&&color===accentColor?1:0);
      // One call with sixteen arguments rather than sixteen calls: at a hundred and eleven
      // thousand instances that is the difference between 1.8 million push calls and 111,000.
      b.m.push(e[0],e[1],e[2],e[3],e[4],e[5],e[6],e[7],e[8],e[9],e[10],e[11],e[12],e[13],e[14],e[15]);
      tint.set(color);b.c.push(tint.r,tint.g,tint.b);
      b.batch.push(batch);b.n++;
      if(b.items)b.items.push({pos,size,rot,k});
    }
    const box=(size,pos,col,batch=-1,unlit=false)=>part('box',size,pos,col,[0,0,0],batch,unlit);
    const metal=(size,pos,col,batch=-1,rot=[0,0,0])=>part('box',size,pos,col,rot,batch,false,false,true);
    /* A lamp is a core and its halo. Callers ask for a light, not for two boxes. */
    function lamp(size,pos,col,batch=-1,spread=2.4){
      part('box',size,pos,col,[0,0,0],batch,true);
      part('box',[size[0]*spread,size[1]*spread,size[2]*spread],pos,col,[0,0,0],batch,true,false,false,true);
    }
    const tube=(size,pos,col,rot=[0,0,0],batch=-1,shiny=false)=>part('cylinder',size,pos,col,rot,batch,false,false,shiny);
    /* A fan reads as a fan when it has a recessed housing, a wire guard and a hub the blades
       actually attach to. Seven blades rather than three, because three is a ceiling fan. */
    /* LEVEL OF DETAIL.

       A fan is thirteen instanced parts - housing, two guard rings, seven blades, a hub and
       four wire spokes - and that is right when a machine fills a third of the frame. On a
       floor drawn at a third of size, every one of those parts is smaller than a pixel, and
       the only thing they cost is the two hundred thousand instances that took a third of a
       second to assemble. Below the threshold a fan becomes a dark disc with a bright hub,
       which is exactly what a fan looks like from across a warehouse. */
    function fan(x,y,z,r,id=-1,spinning=false,facing=1){
      if(!detail){
        part('cylinder',[r*1.06,.05,r*1.06],[x,y,z-facing*.012],C.dark,[Math.PI/2,0,0],id);
        part('cylinder',[r*.4,.055,r*.4],[x,y,z+facing*.03],C.edge,[Math.PI/2,0,0],id,false,spinning,true);
        return;
      }
      part('cylinder',[r*1.06,.05,r*1.06],[x,y,z-facing*.012],C.dark,[Math.PI/2,0,0],id);
      part('torus',[r,r,r],[x,y,z+facing*.027],C.edge,[0,0,0],id,false,false,true);
      part('torus',[r*.66,r*.66,r*.66],[x,y,z+facing*.031],C.edge,[0,0,0],id,false,false,true);
      for(let i=0;i<7;i++)part('box',[r*1.5,r*.34,.022],[x,y,z+facing*.038],C.steel,[0,0,i*Math.PI/3.5],id,false,spinning);
      part('cylinder',[r*.26,.055,r*.26],[x,y,z+facing*.05],C.edge,[Math.PI/2,0,0],id,false,false,true);
      // Four wire spokes across the guard, the way a finger guard is actually made.
      for(let i=0;i<4;i++)part('box',[r*2.02,.022,.022],[x,y,z+facing*.062],C.edge,[0,0,i*Math.PI/4],id,false,false,true);
    }
    const label=(text,pos,width,height=.3)=>signs.push({text,pos,width,height});
    const site=FloorScenery.populate(s,{box,part,fan,label,metal,tube,lamp,C});
    rows.forEach(b=>{
      const {x,z}=b,statusColor=colors[b.status],accent=accentColor=opts.heat?(b.status==='online'?(stats.heatRatio>1?C.red:C.orange):C.dark):statusColor;
      box([1.68,.013,1.3],[x,.088,z],0x34464d,b.id);
      if(s.selected===b.id){
        for(const dz of [-.72,.72])box([1.8,.025,.055],[x,.11,z+dz],C.orange,b.id,true);
        for(const dx of [-.87,.87])box([.055,.025,1.5],[x+dx,.11,z],C.orange,b.id,true);
      }
      FloorMiners.render(b.hardware||h,b,{box,part,fan,metal,tube,lamp,C,accent,detail,unitCap});
      if(b.status==='fault'||b.status==='repair'){
        lamp([.36,.25,.1],[x,2.48,z],statusColor,b.id,1.9);
        box([.035,.11,.02],[x,2.5,z+.07],C.dark,b.id);
        if(b.status==='fault')box([.035,.025,.02],[x,2.4,z+.07],C.dark,b.id);
      }
    });
    for(const bucket of buckets.values()){
      const material=bucket.glow
        // 2 is AdditiveBlending. The constant is not exported by the tree-shaken bundle, but
        // it is only a number, and depth writes are off so haloes never occlude each other.
        ?new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.34,blending:2,depthWrite:false})
        :bucket.unlit?new T.MeshBasicMaterial({color:0xffffff})
        :new T.MeshStandardMaterial({color:0xffffff,roughness:bucket.metal?.34:.78,metalness:bucket.metal?.78:.12});
      materials.push(material);
      const mesh=new T.InstancedMesh(geo[bucket.kind],material,bucket.n);
      // One bulk copy each, rather than a setter call and an allocation per instance.
      mesh.instanceMatrix.array.set(bucket.m);
      if(!mesh.instanceColor)mesh.setColorAt(0,tint);
      mesh.instanceColor.array.set(bucket.c);
      mesh.userData.batchIds=bucket.batch;mesh.userData.tinted=bucket.tinted;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
      // Unlit pieces are status lights and signage: they should not darken the floor.
      if(!bucket.unlit){mesh.castShadow=true;mesh.receiveShadow=true}
      // Haloes are additive light, so they draw after everything they sit in front of.
      if(bucket.glow)mesh.renderOrder=2;
      mesh.userData.lamp=!!bucket.unlit;
      /* Haloes are additive light with depth writes off. They are the largest thing in front
         of a machine and would swallow every pointer hit, so picking has to skip them. */
      mesh.userData.glow=!!bucket.glow;
      root.add(mesh);
      if(bucket.fan)fanMeshes.push({mesh,items:bucket.items});
    }
    if(opts.labels!==false&&typeof document!=='undefined')for(const [i,sign] of signs.entries()){
      const canvas=document.createElement('canvas');canvas.width=768;canvas.height=96;const ctx=canvas.getContext('2d');
      ctx.fillStyle='#15242c';ctx.fillRect(0,0,768,96);ctx.fillStyle='#f7a13d';ctx.font='bold 42px monospace';ctx.textAlign='center';ctx.fillText(sign.text,384,63,730);
      const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;textures.push(tex);
      const mat=new T.MeshBasicMaterial({map:tex,side:T.DoubleSide});materials.push(mat);
      const g=new T.PlaneGeometry(sign.width,sign.height);geo['sign'+i]=g;
      const mesh=new T.Mesh(g,mat);mesh.position.set(...sign.pos);root.add(mesh);
    }
    let lastAngle=0;
    function animate(t){const angle=t*.008;if(Math.abs(angle-lastAngle)<.015)return;lastAngle=angle;
      for(const {mesh,items} of fanMeshes){items.forEach((a,i)=>{const k=a.k||1;dummy.position.set(a.pos[0]*k,a.pos[1]*k,a.pos[2]*k);dummy.scale.set(a.size[0]*k,a.size[1]*k,a.size[2]*k);dummy.rotation.set(a.rot[0],a.rot[1],a.rot[2]+angle);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.instanceMatrix.needsUpdate=true;}}
    function dispose(){root.traverse(o=>{if(o.isInstancedMesh)o.dispose();});Object.values(geo).forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
    /* REPAINTING WITHOUT REBUILDING.

       A machine going faulted changes its colour and nothing else. Rebuilding the scene for it
       cost a third of a second at megacampus scale, and on a large fleet statuses change every
       simulated day - which is several times a second at speed, and enough sustained main-thread
       work for the browser to give up on the GPU process. That surfaces as a lost context and a
       fall back to the flat floor, which is exactly what was reported at fifty thousand miners.

       This walks the instances already on the GPU and rewrites the three colour channels of the
       ones wearing a status colour. */
    function recolour(statusFor){
      root.traverse(mesh=>{
        if(!mesh.isInstancedMesh||!mesh.userData.tinted||!mesh.instanceColor)return;
        const ids=mesh.userData.batchIds,flags=mesh.userData.tinted,arr=mesh.instanceColor.array;
        let touched=false;
        for(let i=0;i<flags.length;i++){
          if(!flags[i])continue;
          const next=statusFor(ids[i]);
          if(next===null||next===undefined)continue;
          tint.set(next);
          const o=i*3;
          if(arr[o]!==tint.r||arr[o+1]!==tint.g||arr[o+2]!==tint.b){
            arr[o]=tint.r;arr[o+1]=tint.g;arr[o+2]=tint.b;touched=true;
          }
        }
        if(touched)mesh.instanceColor.needsUpdate=true;
      });
    }
    return {root,rows,recolour,width:site.width,depth:site.depth,cx:site.cx,cz:site.cz,landmarks:site.items,crew:site.crew,animate,dispose,animated:fanMeshes.length>0,hardware:h};
  }
  return {build,layout,colors};
})();
