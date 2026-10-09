"use strict";

/* MINER SILHOUETTES - one recognisable machine per entry in the catalogue.

   The brief these were first written to was "tell them apart at a glance across a room of two
   hundred", and that produced boxes: a coloured slab with a fan on the front. It works at
   megacampus zoom, where a machine is four pixels, and it looks like nothing at all in a
   spare room where the same machine fills a third of the frame.

   So the shapes are now built the way the hardware is built. An air-cooled Antminer is an
   extruded aluminium shell with a fan at EACH end - one drawing air in, one pushing it out -
   ridged along the roof where the extrusion is pulled, with a small controller board on top
   carrying an Ethernet socket and status LEDs, and a power inlet feeding a cable that drops
   away to a busway. A GPU rig is an open frame with individual cards on risers and a PSU
   hanging off it. Those details are what make a render read as a machine rather than as a
   coloured box, and they cost nothing per unit: every piece here is an instance of one of
   three shared geometries, so a floor of forty thousand miners still draws in a handful of
   calls.

   The fan layout is deliberately one per end on every air-cooled model. An earlier pass put
   two fans on each face of the larger machines, which is not the mainstream layout and is
   not something I can verify model by model; a bigger machine gets a bigger fan instead, and
   the generations stay apart on proportion, rib count, PSU treatment and trim.

   Still deliberately not product CAD. Proportions follow the real machines - an S9 is narrow
   and long, an S19 is wider than it is deep - but nothing here is dimensioned, and the
   colours separate generations rather than matching anodising. */

const FloorMiners=(()=>{
  /* THE CASES ARE THE PUBLISHED DIMENSIONS, TO ONE SCALE.

     These were drawn by eye and the eye was wrong in a consistent direction: every ASIC was
     far too wide and too flat. An Antminer S19 is 370 × 195.5 × 290 mm - deeper than it is
     tall, and TALLER THAN IT IS WIDE - and it was being drawn 0.98 wide by 0.55 high, roughly
     two and a half times too wide for its height. A rack of them read as a shelf of pizza
     boxes rather than a row of upright machines, which is the single thing that most stopped
     the floor looking like a photograph of a mine.

     So the table is now the manufacturers' own figures at one scale, MM_UNIT, and the
     millimetres are written down beside each entry. Anyone changing a case has to change a
     measurement, and the proportions between machines stay honest for free: an S9 really is a
     small flat box next to an S19, and an S21 really is only the S19 made longer.

     Air path is the depth (the manufacturer's length), so the fans face front and back and
     the machine is drawn the way it is racked. */
  const MM=0.0022;                                   // one millimetre, in floor units
  const mm=(l,w,h)=>({d:+(l*MM).toFixed(3),w:+(w*MM).toFixed(3),h:+(h*MM).toFixed(3)});
  /* Every one of these machines is cooled by 120 mm fans - that is the part the whole
     industry standardised on - so the radius is the fan, not a per-model guess. The models
     that carry four (two at each end, stacked, because the face is taller than it is wide)
     are marked with fans:2 rather than an ad-hoc "make the single fan bigger" flag. */
  const FAN120=60*MM;
  const profiles={
    laptop:{type:'laptop'},cpu:{type:'cpu'},'5870':{type:'gpu'},gpurig:{type:'rig'},fpga:{type:'fpga'},
    avalon:{type:'avalon',color:0xc6bbaa},
    s1:{type:'openasic',color:0x788f83,boards:2},
    // Antminer S3 · 331 × 126 × 155 mm
    s3:{type:'asic',color:0x849298,...mm(331,126,155),fan:FAN120,fins:4},
    s5:{type:'openasic',color:0xc2b8a3,boards:3},
    // Antminer S7 · 301 × 123 × 155 mm
    s7:{type:'asic',color:0xaaa998,...mm(301,123,155),fan:FAN120,fins:5},
    // Antminer S9 · 350 × 135 × 158 mm · APW3 supply sits on the case
    s9:{type:'asic',color:0xb7b8ae,...mm(350,135,158),fan:FAN120,fins:8,psu:true},
    // Antminer S17 · 298 × 175 × 304 mm · four fans
    s17:{type:'asic',color:0x9cabb1,...mm(298,175,304),fan:FAN120,fins:4,fans:2},
    // Antminer S19 · 370 × 195.5 × 290 mm · four fans · APW12 on the case
    s19:{type:'asic',color:0xbac0be,...mm(370,195.5,290),fan:FAN120,fins:7,fans:2,psu:true},
    s19xp:{type:'asic',color:0xc5c9c1,...mm(370,195.5,290),fan:FAN120,fins:10,fans:2,psu:true,trim:0x65b7a5},
    // Antminer S19 Hydro · 410 × 170 × 209 mm · no fans, so the case is flatter
    s19hydro:{type:'hydro',color:0x8faeb6,...mm(410,170,209),pipes:2},
    // Antminer S21 · 400 × 195.5 × 290 mm · the S19 case made longer
    s21:{type:'asic',color:0xd2d3ca,...mm(400,195.5,290),fan:FAN120,fins:8,fans:2,psu:true,trim:0xe4a14d},
    // Antminer S21 Hydro · 442 × 196 × 290 mm
    s21hydro:{type:'hydro',color:0xc6d0d0,...mm(442,196,290),pipes:3},
    s21xp:{type:'asic',color:0xb0bdc2,...mm(400,195.5,290),fan:FAN120,fins:12,fans:2,psu:true,trim:0x70c7dd}
  };
  function render(h,b,api){
    const {box,part,fan,C}=api,p=profiles[h.id];if(!p)throw Error('Missing visual: '+h.id);
    /* Whether this machine is being drawn close enough for its detail to exist. Roof ridges,
       flank louvres, the controller board and the serial plate are sub-pixel on a floor drawn
       small, and they are the bulk of a machine's instance count. */
    const detail=api.detail!==false;
    const {x,z}=b,id=b.id,accent=api.accent,on=b.status==='online';
    /* Machines sit side by side on a shelf when the frame is wide enough for them, so every
       piece of a given unit shifts together. Held here rather than threaded through forty
       call sites, which is how the offsets would end up disagreeing. */
    let laneX=0;
    const B=(size,pos,color)=>box(size,[x+laneX+pos[0],pos[1],z+pos[2]],color,id);
    const M=(size,pos,color,rot=[0,0,0])=>api.metal(size,[x+laneX+pos[0],pos[1],z+pos[2]],color,id,rot);
    const T=(size,pos,color,rot=[0,0,0],shiny=false)=>api.tube(size,[x+laneX+pos[0],pos[1],z+pos[2]],color,rot,id,shiny);
    const F=(dx,y,dz,r,facing=1)=>fan(x+laneX+dx,y,z+dz,r,id,on,facing);
    /* Status lights are lamps, not coloured squares: a bright core with an additive halo.
       Wide strips get a tighter spread, because a halo scaled off a 1.3-wide strip would be
       a bar of fog rather than a light. */
    const led=(dx,y,dz,w=.05,spread=w>.4?1.5:2.8)=>api.lamp([w,.035,.024],[x+laneX+dx,y,z+dz],accent,id,spread);
    const screen=(size,pos,col,rot=null)=>{
      if(rot)part('box',size,[x+laneX+pos[0],pos[1],z+pos[2]],col,rot,id,true);
      else api.lamp(size,[x+laneX+pos[0],pos[1],z+pos[2]],col,id,1.35);
    };
    const desk=(height=.78)=>{B([1.6,.09,1.1],[0,height,0],C.wood);for(const dx of [-.66,.66])for(const dz of [-.43,.43])M([.08,height,.08],[dx,height/2,dz],C.steel);};
    /* A short length of cable leaving a machine and dropping out of sight. Nothing in a
       working room is unplugged, and the absence of any cabling was half of why the old
       shapes read as models rather than as equipment. */
    const drop=(dx,y,dz,len=.3,col=0x1b2428)=>{T([.022,len,.022],[dx,y-len/2,dz],col);T([.03,.05,.03],[dx,y,dz],C.dark)};
    /* HOW MANY MACHINES A RACK SHOWS.

       A batch on the floor stands for many real machines - a four-thousand-miner site draws
       around a hundred and fifty of these - and the rack used to show at most `levels` of
       them, which is two for an S19. So a room holding four thousand miners drew three
       hundred, on shelves that were visibly half empty, and read as a sparse warehouse rather
       than a full one.

       The rack now grows with what it represents: shelves up to the height a container rack
       actually reaches, and machines side by side on each shelf where the machine is narrow
       enough for the frame to take them. It is still a representation - nobody is drawing
       four thousand - but a full room now looks full. */
    const rail=(levels,height,railW=1.54)=>{
      const top=height??(RACK_BASE+levels*RACK_SHELF+.24);
      const post=railW/2-.04,spine=railW/2+.05;
      for(const dx of [-post,post])for(const dz of [-.52,.52])M([.05,top,.05],[dx,top/2,dz],0x44585f);
      for(let j=0;j<levels;j++){M([railW,.04,RACK_DEPTH],[0,RACK_BASE+j*RACK_SHELF,0],0x5d737a);
        for(const dz of [-.52,.52])M([railW,.03,.03],[0,RACK_BASE+.22+j*RACK_SHELF,dz],0x44585f);}
      M([railW-.06,.12,.09],[0,top+.05,.53],C.steel);led(0,top+.05,.59,1.3);
      // Busway down the back of the rack, which is what the machines actually plug into,
      // and a data spine beside it. Orange is power, blue is data, here as everywhere else.
      M([.12,top*.92,.12],[spine,top*.48,-.5],0x30444c);
      for(let j=0;j<levels;j++)B([.16,.09,.05],[spine,RACK_BASE+.14+j*RACK_SHELF,-.43],C.orange);
      M([.07,top*.92,.07],[-spine,top*.48,-.5],0x2b4150);
      for(let j=0;j<levels;j++)B([.11,.06,.04],[-spine,RACK_BASE+.18+j*RACK_SHELF,-.44],0x4a9fe0);
    };
    if(p.type==='laptop'){
      desk();
      // Base: chassis, keyboard well, key rows, trackpad, feet.
      M([.87,.05,.62],[0,.865,.1],C.edge);
      B([.72,.012,.44],[0,.892,.08],0x1c2529);
      for(let r=0;r<5;r++)for(let k=0;k<12;k++)B([.045,.012,.03],[-.31+k*.056,.9,-.02+r*.055],0x2c3a3f);
      B([.24,.014,.13],[0,.9,.26],0x33444a);
      part('box',[.9,.6,.04],[x,1.16,z-.2],C.dark,[-.16,0,0],id);
      part('box',[.79,.49,.012],[x,1.16,z-.176],on?0x2f8f7f:0x11191c,[-.16,0,0],id,true);
      if(on)part('box',[.95,.62,.02],[x,1.16,z-.19],0x2f8f7f,[-.16,0,0],id,true,false,false,true);
      part('box',[.2,.02,.008],[x,1.3,z-.212],C.steel,[-.16,0,0],id);
      for(const dx of [-.4,.4])B([.05,.02,.05],[dx,.845,.28],C.dark);
      drop(.44,.87,-.16,.42);led(.36,.885,.4);
      return;
    }
    if(p.type==='cpu'){
      desk();
      // A tower with a mesh front, a side window and a monitor on an arm.
      M([.36,.71,.62],[.44,1.18,.05],C.dark);
      for(let k=0;k<7;k++)B([.3,.02,.02],[.44,.9+k*.055,.36],0x38484e);
      B([.28,.5,.01],[.62,1.2,.05],0x22323a);
      F(.44,1.42,.37,.115);led(.44,.88,.38);
      M([.65,.45,.05],[-.28,1.18,-.18],C.steel);
      screen([.56,.35,.012],[-.28,1.18,-.146],on?0x2c8a76:0x121a1c);
      M([.06,.18,.06],[-.28,.9,-.18],C.edge);M([.22,.02,.16],[-.28,.815,-.18],C.steel);
      B([.58,.018,.2],[-.28,.868,.23],C.dark);
      for(let k=0;k<10;k++)B([.04,.012,.16],[-.53+k*.055,.878,.23],0x2c3a3f);
      drop(.6,.86,.05,.4);
      return;
    }
    if(p.type==='gpu'){
      desk();
      // A single card on a test bench: PCB, shroud, twin fans, backplate, power leads.
      B([1.2,.03,.77],[0,.86,0],0x1e5f52);
      for(let k=0;k<9;k++)B([.02,.012,.5],[-.44+k*.11,.877,-.04],0xc9a942);
      M([1.07,.34,.2],[0,1.09,.04],0x6e2a31);
      F(-.29,1.09,.16,.13);F(.29,1.09,.16,.13);
      M([1.05,.03,.2],[0,1.28,.04],C.dark);
      M([.3,.19,.3],[.42,.98,-.3],C.edge);
      for(const dx of [-.18,.18])drop(dx,1.27,-.02,.3,0x2a1518);
      led(-.45,.9,.36);
      return;
    }
    if(p.type==='rig'){
      // Open aluminium frame, cards hung vertically on risers, PSU under, fans below.
      for(const dx of [-.69,.69])for(const dz of [-.48,.48])M([.06,1.05,.06],[dx,.63,dz],C.edge);
      for(const y of [.22,.68,1.1])for(const dz of [-.48,.48])M([1.45,.05,.05],[0,y,dz],C.edge);
      for(const dx of [-.69,.69])M([.05,.05,.98],[dx,1.1,0],C.edge);
      M([1.38,.05,.94],[0,.3,0],C.dark);
      for(let j=0;j<6;j++){
        const dx=-.5+j*.2;
        B([.16,.5,.78],[dx,.78,0],0x1d3b36);                       // card PCB edge
        M([.13,.42,.7],[dx,.8,.03],j%2?0x5b4b4c:0x77848a);          // cooler shroud
        T([.09,.1,.09],[dx,.8,.3],0x27343a,[Math.PI/2,0,0]);        // card fan hub
        B([.02,.34,.02],[dx-.07,.8,-.34],0xc46a3a);                 // riser ribbon
        led(dx,1.05,.38,.1);
      }
      for(let j=0;j<3;j++)F(-.46+j*.46,.5,.52,.19);
      M([.42,.24,.34],[.39,.46,.12],C.edge);                        // PSU
      for(const dx of [.24,.5])drop(dx,.58,.12,.26,0x1b2428);
      return;
    }
    if(p.type==='fpga'){
      desk(.6);
      B([1.13,.028,.79],[0,.686,0],0x1c5a49);
      for(const dx of [-.31,.31]){
        M([.34,.07,.36],[dx,.74,0],C.dark);
        for(let k=0;k<6;k++)M([.022,.13,.33],[dx-.13+k*.052,.83,0],C.edge);
        B([.14,.03,.14],[dx,.72,0],0x2c3a3f);
      }
      for(let k=0;k<4;k++)B([.07,.035,.11],[-.4+k*.22,.72,.3],0xc4ad68);
      for(let k=0;k<6;k++)B([.015,.01,.4],[-.5+k*.03,.702,-.16],0xc9a942);
      drop(.5,.7,.3,.24);led(.42,.735,.35);
      return;
    }
    if(p.type==='avalon'){
      // A cylindrical-ended box with a bank of intake fans down one flank.
      M([1.38,.1,.97],[0,.2,0],C.steel);
      M([1.32,.48,.86],[0,.5,0],p.color);
      for(let k=0;k<3;k++)F(-.4+k*.4,.5,.45,.145);
      for(let k=0;k<3;k++)F(-.4+k*.4,.5,-.45,.145,-1);
      for(let k=0;k<7;k++)M([.05,.014,.6],[-.51+k*.17,.75,0],C.dark);
      B([.2,.1,.14],[.42,.76,-.3],C.dark);                          // controller
      B([.07,.04,.03],[.42,.76,-.22],0x2f6f7d);
      drop(.55,.26,-.3,.2);led(.55,.67,.45);
      return;
    }
    if(p.type==='openasic'){
      // An open blade chassis: bare hashboards standing on a tray, one big fan across them.
      M([1.25,.07,.98],[0,.23,0],C.steel);
      for(const dx of [-.6,.6])M([.05,.72,.9],[dx,.6,0],C.edge);
      for(let j=0;j<p.boards;j++){
        const dx=(j-(p.boards-1)/2)*.34;
        B([.04,.58,.87],[dx,.61,0],0x24564d);
        for(let k=0;k<6;k++)M([.19,.5,.022],[dx,.61,-.35+k*.14],p.color);
        for(let k=0;k<3;k++)B([.05,.03,.04],[dx,.34+k*.1,.42],0xc9a942);
      }
      F(0,.59,.47,h.id==='s1'?.24:.29);
      M([1.17,.04,.07],[0,.96,0],C.edge);
      B([.26,.09,.16],[.5,.34,-.3],C.dark);
      drop(.62,.3,-.3,.18);led(.48,.31,.53);
      return;
    }
    if(p.type==='hydro'){
      /* Capped by the floor's instance budget as well as by the rack, and capped BEFORE the rack is
      planned rather than after. A frame is most of what a rack costs to draw - four uprights, a
      busway and a data spine, and a shelf with two rails and two indicators per level - so
      planning six levels and then leaving four of them empty spends the instances anyway. The
      rack is built for what it will actually hold. */
    const wanted=Math.min(b.qty,api.unitCap??Infinity);
    const plan=rackPlan(wanted,p.w),units=Math.min(wanted,plan.slots);
      laneX=0;rail(plan.levels,plan.height,plan.railW);
      for(let j=0;j<units;j++){
        const level=Math.floor(j/plan.across);
        laneX=(j%plan.across-(plan.across-1)/2)*(p.w+.06);
        const y=.32+level*RACK_SHELF+p.h/2;
        M([p.w,p.h,p.d],[0,y,0],p.color);
        // Cold plates and the return header running the length of the case.
        for(let k=0;k<5;k++)M([p.w-.1,.028,.04],[0,y-p.h/2+.07+k*.075,p.d/2+.015],C.edge);
        for(let k=0;k<p.pipes;k++){
          const dx=(k-(p.pipes-1)/2)*.33;
          T([.052,.3,.052],[dx,y+.05,p.d/2+.14],k%2?0xdc8063:0x5fb7df,[Math.PI/2,0,0],true);
          T([.068,.06,.068],[dx,y+.05,p.d/2+.27],C.edge,[Math.PI/2,0,0],true);   // quick-connect
        }
        M([.3,.06,.28],[.23,y+p.h/2+.025,0],C.steel);
        B([.12,.04,.1],[-.2,y+p.h/2+.03,.2],C.dark);
        led(-p.w/2+.07,y+.1,p.d/2+.03);
      }
      laneX=0;
      for(const [dx,col] of [[-.65,0x5fb7df],[.65,0xdc8063]])T([.042,2,.042],[dx,1.13,.63],col,[0,0,0],true);
      return;
    }
    /* AIR-COOLED ASIC. The shape everything from an S3 to an S21 XP shares: an extruded shell
       with a fan at each end, ribbed flanks, a controller on the roof and a cable to a
       busway. What separates the generations is proportion, rib count and how the PSU is
       carried - bolted on top in the S9 era, integrated alongside from the S19 on. */
    /* Capped by the floor's instance budget as well as by the rack, and capped BEFORE the rack is
      planned rather than after. A frame is most of what a rack costs to draw - four uprights, a
      busway and a data spine, and a shelf with two rails and two indicators per level - so
      planning six levels and then leaving four of them empty spends the instances anyway. The
      rack is built for what it will actually hold. */
    const wanted=Math.min(b.qty,api.unitCap??Infinity);
    const plan=rackPlan(wanted,p.w),units=Math.min(wanted,plan.slots);
    laneX=0;rail(plan.levels,plan.height,plan.railW);
    for(let j=0;j<units;j++){
      const level=Math.floor(j/plan.across);
      laneX=(j%plan.across-(plan.across-1)/2)*(p.w+.06);
      const y=.32+level*RACK_SHELF+p.h/2,front=p.d/2,back=-p.d/2;
      M([p.w,p.h,p.d],[0,y,0],p.color);
      // Recessed end panels so the fans sit IN the case rather than on it.
      M([p.w-.03,p.h-.03,.03],[0,y,front+.016],0x2b383e);
      M([p.w-.03,p.h-.03,.03],[0,y,back-.016],0x2b383e);
      /* Fan count is the machine's own. A 195 × 290 face takes two 120 mm fans STACKED -
         which is what an S17, S19 or S21 actually carries, four in total - and a 135 × 158
         face takes one. The previous rule made the single fan bigger instead, which produced
         a 200 mm fan no manufacturer has ever fitted and hid the most recognisable thing
         about the modern machines. The radius is clamped to the face so a fan can never
         overhang the case it is bolted to. */
      const perEnd=Math.max(1,p.fans||1);
      const fanR=Math.min(p.fan,p.w*.47,p.h/perEnd*.47);
      for(let f=0;f<perEnd;f++){
        const fy=y+(f-(perEnd-1)/2)*(p.h/perEnd);
        F(0,fy,front+.04,fanR);F(0,fy,back-.04,fanR,-1);
      }
      if(detail){
        /* Ridges along the roof, the way the extrusion is actually pulled. Kept close to the
           shell colour: a first pass drew them dark and added vertical ribs down both flanks
           as well, and eight dark stripes over a light case turns a machine into a cage. */
        /* Ridge count is capped by the roof it has to fit on. The cases are the published
           widths now, which are narrower than they were drawn, and twelve ridges across a
           195 mm roof is not an extrusion, it is a solid block. */
        const fins=Math.max(3,Math.min(p.fins,Math.floor((p.w-.14)/.045)));
        for(let k=0;k<fins;k++){
          const rx=-p.w/2+.07+k*(p.w-.14)/Math.max(1,fins-1);
          M([.02,.018,p.d-.1],[rx,y+p.h/2+.006,0],0x9fb0b4);
        }
        // A louvred band low on each flank, the only break in an otherwise flat side.
        for(let k=0;k<3;k++)for(const sx of [-1,1])
          M([.012,.022,p.d*.52],[sx*(p.w/2+.005),y-p.h*.22+k*.06,0],0x8b9ca2);
        // Controller board on the roof: Ethernet socket, reset, two status LEDs.
        M([p.w*.34,.05,.2],[-p.w*.2,y+p.h/2+.03,-p.d*.18],C.dark);
        B([.075,.045,.06],[-p.w*.2+.06,y+p.h/2+.05,-p.d*.18+.09],0x4a9fe0);
        led(-p.w*.2-.05,y+p.h/2+.06,-p.d*.18+.1,.03);
      }
      if(p.psu){
        /* The supply sits ON the case, not beside it. An APW12 is 285 × 150 × 86 mm against a
           case 195 wide, so it is a little narrower than the machine and about a third as
           tall - it was drawn as a fixed 0.22-wide slab, which on a correctly-proportioned
           195 mm case hung off the side of the machine it is bolted to. */
        const pw=p.w*.77,ph=Math.max(.07,p.h*.3),pd=p.d*.77;
        M([pw,ph,pd],[0,y+p.h/2+ph/2,0],C.steel);
        if(detail)for(let k=0;k<5;k++)M([pw*.92,.016,.03],[0,y+p.h/2+ph*.75,-pd*.38+k*pd*.19],C.dark);
        drop(pw/2-.04,y+p.h/2+ph*.4,-pd*.46,.22);
      }else drop(p.w/2-.05,y-p.h/2+.02,-p.d*.36,.2);
      if(p.trim)M([p.w,.022,.05],[0,y-p.h/2+.02,front+.035],p.trim);
      // Serial label plate, low on the front, where every one of these machines carries it.
      if(detail)B([p.w*.3,.05,.012],[0,y-p.h/2+.07,front+.03],0xcfd6d2);
      /* The status LED stays at every scale. It is the one part of a machine that carries
         information rather than texture, and a floor of five thousand machines is exactly
         where seeing which ones are lit matters most. */
      led(-p.w/2+.04,y+p.h/2-.04,front+.04);
    }
  }
  /* The grid that places these racks needs their real footprint, and the only place that knows
     it is the code that draws them. Published rather than duplicated: a pitch guessed in the
     assembler is a pitch that goes stale the first time a rack changes shape. */
  function rackFootprint(hardware,qty=64){
    const p=profiles[hardware&&hardware.id||hardware]||profiles.default;
    if(!p||p.type==="laptop")return{w:1.9,d:1.6};
    return{w:rackPlan(qty,p.w||.4).railW,d:RACK_DEPTH};
  }
/* RACK GEOMETRY, in one place.

   How many machines stand side by side on one shelf. A spare room holds a two-wide shelf and a
   light industrial unit a three; a warehouse and everything above it holds a row, because that
   is what those buildings contain - long aisles of machines, not furniture. The floor scales
   itself to whatever this produces, so a longer rack does not overflow the room; it makes the
   room read as the industrial site it is.

   This lives at module scope because two callers need it and they must agree: the code that
   DRAWS a rack, and the grid that decides how far apart to place them. A pitch guessed
   separately in the assembler is a pitch that goes stale the first time a rack changes shape,
   and the symptom is rows quietly overlapping. */
const RACK_SHELF=.66,RACK_BASE=.28,RACK_MAX_LEVELS=6,RACK_DEPTH=1.15,RACK_MARGIN=.22,RACK_MIN_W=1.54;
const RACK_ACROSS_BY_TIER=[2,2,3,4,4,6,6,8];
function rackAcrossCap(){
  const tier=typeof facilityTier==="function"?facilityTier():1;
  return RACK_ACROSS_BY_TIER[Math.max(0,Math.min(RACK_ACROSS_BY_TIER.length-1,tier-1))];
}
/* Squarish rather than as-wide-as-allowed: a batch of six wants two shelves of three, not one
   row of six with five empty slots above it. */
function rackPlan(qty,width){
  const across=Math.max(1,Math.min(rackAcrossCap(),Math.ceil(Math.sqrt(Math.max(1,qty)))));
  const levels=Math.max(1,Math.min(RACK_MAX_LEVELS,Math.ceil(qty/across)));
  const railW=Math.max(RACK_MIN_W,across*(Math.max(.2,width)+.06)+RACK_MARGIN);
  return{across,levels,slots:across*levels,railW,height:RACK_BASE+levels*RACK_SHELF+.24};
}
  return {profiles,render,rackFootprint};
})();
