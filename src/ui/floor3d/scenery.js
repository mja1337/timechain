"use strict";

/* SITE DRESSING - the room around the machines: floor, walls, cooling plant, cable trays,
   and the staff you have actually hired. Ported unchanged from the floor prototype.

   None of it runs simulation logic. The crew are sprites standing where the roster says they
   are. Cooling plant moved to its own module once it stopped being generic dressing and
   started being drawn from what the operation actually installed. Nothing here decides
   anything. */

/* Static site dressing and staff. No vehicles or people run simulation logic.
   Landmark positions also drive the lightweight 2D plan. */
const FloorScenery=(()=>{
  const roleColors={fieldtech:0xf7a13d,logistics:0xe7ce68,procurementlead:0x68bafa,treasurer:0xb69ce0,security:0x5fd0c0};
  function plan(s){
    const {p,h}=FloorModel.definitions(s),large=FloorModel.presets.indexOf(p)>=3,w=p.width,d=p.depth;
    const items=[{type:'workbench',name:'Service bay',x:-w/2+1.4,z:d/2-2,w:2.1,d:1.1},
      {type:'shelves',name:'Spares',x:-w/2+1.25,z:-d/2+2.2,w:1.5,d:1.2}];
    /* No desk at home: the laptop draws its own, and a spare room with a second desk
       carrying a monitor plugged into nothing reads as scenery placed for its own sake. */
    if(p.id==='home'){
      // A spare room, not a bay: the bench is a corner of a desk and the shelving is a bookcase against the wall.
      items[0].name='Repair corner';
      items[1]={type:'shelves',name:'Bookcase',x:-w/2+.45,z:-d/2+2.6,w:.9,d:1.8};
    }
    if(p.id!=='home')items.push({type:'pallets',name:'Deliveries',x:w/2-1.8,z:d/2-1.7,w:1.6,d:1.1});
    if(FloorModel.presets.indexOf(p)>=2)items.push({type:'forklift',name:'Loading bay',x:w/2-1.8,z:-d/2+2.3,w:1.4,d:2});
    if(large){
      items.push({type:'transformer',name:'Substation',x:w/2+3,z:-d/2+2.7,w:3.6,d:3.2},
        {type:'cooler',name:'Heat rejection',x:w/2+3,z:1,w:3.2,d:4.2},
        {type:'office',name:'Operations',x:w/2+3,z:d/2-3.5,w:3.6,d:3.2},
        {type:'generator',name:'Standby generator',x:0,z:-d/2-3.4,w:5,d:2.7});
    }
    if(p.id==='campus'||p.id==='megacampus'){
      items.push({type:'hall',name:'Adjacent mining hall',x:-w/2+6,z:-d/2-3.5,w:9,d:4.3});
    }
    if(p.id==='container'){
      items.push({type:'container',name:'Closed mining module',x:-w/2+5.3,z:-d/2-3.3,w:8.3,d:2.8},
        {type:'container',name:'Expansion module',x:w/2-5.3,z:-d/2-3.3,w:8.3,d:2.8});
    }
    if(p.id==='hydroplant')items.push({type:'penstock',name:'Hydro intake',x:-w/2+3,z:-d/2-3.4,w:5,d:4.5});
    if(p.id==='megacampus')items.push({type:'tower',name:'Cooling towers',x:w/2-4.2,z:-d/2-3.3,w:6.8,d:3.6},
      {type:'hall',name:'Expansion hall',x:-2,z:-d/2-3.5,w:7,d:4.3});
    if(h.era==='HYDRO ASIC')items.push({type:'pump',name:'Liquid-cooling skid',x:w/2-1.8,z:0,w:1.8,d:3.2});
    return {items,large,width:w+(large?10:0),depth:d+(large?9:0),cx:large?2.5:0,cz:large?-2.5:0};
  }
  function crewLayout(s){
    const {p}=FloorModel.definitions(s),crew=FloorModel.crew(s);
    return crew.map((c,i)=>{
      let x,z;
      if(c.role==='fieldtech'){x=-p.width/2+2.5+(c.index%4)*1.3;z=p.depth/2-2.2-Math.floor(c.index/4)*.9;}
      else if(c.role==='logistics'){x=p.width/2-2.8;z=p.depth/2-2.7;}
      else if(c.role==='procurementlead'){x=p.width/2-2.5;z=-p.depth/2+4;}
      else{x=plan(s).large?p.width/2+2.7:p.width/2-2;z=p.depth/2-1.6;}
      return {...c,x,z,id:i,color:roleColors[c.role]};
    });
  }
  /* THE HOME OFFICE. The first site is a spare room, and it used to be dressed as a small factory: a concrete slab, a ruled
     grid on the floor, hazard chevrons, steel posts with strip lights, a switch cabinet with an emergency stop and a
     cardboard-box shelf. Everything here is the same instanced geometry the industrial rooms use, drawn as what a spare
     room has: floorboards and a rug, painted walls with skirting, a window with curtains, a bookcase, a filing cabinet,
     a plant, pictures and a clock. Positions keep clear of the middle of the floor, where the machines are drawn. */
  function homeOffice(api,w,d,s){
    const {box,part,lamp,C}=api,back=-d/2;
    const cyl=(size,pos,col,rot=[0,0,0])=>part('cylinder',size,pos,col,rot);
    // Floor: a dark subfloor edge, then boards in a few tones, then a rug.
    box([w+.4,.38,d+.4],[0,-.25,0],0x4b3a2c);
    box([w,.13,d],[0,-.015,0],0x6f573f);
    const tones=[0xb48d62,0xa98259,0xbd9669,0xa07a52,0xb88f65];
    for(let k=0,x=-w/2;x<w/2-.01;x+=.2,k++)box([.19,.016,d],[x+.1,.062,0],tones[(k*3+(k>>2))%tones.length]);
    box([4.6,.02,3.2],[.4,.078,.5],0x44586f);box([4.3,.024,2.9],[.4,.082,.5],0x6a84a2);
    for(const dz of [-.75,.75])box([4.3,.026,.07],[.4,.084,.5+dz],0xd9cdb4);
    // Walls: warm paint, a pale skirting board and cornice, and two wall lights.
    const paint=0xd9ceb8,trim=0xf1ece0;
    box([w,2.9,.16],[0,1.45,back],paint);box([.16,2.9,d],[-w/2,1.45,0],paint);
    box([w,.2,.06],[0,.16,back+.11],trim);box([.06,.2,d],[-w/2+.11,.16,0],trim);
    box([w,.1,.08],[0,2.84,back+.12],trim);box([.08,.1,d],[-w/2+.12,2.84,0],trim);
    for(const x of [-3.1,4.1]){box([.16,.3,.1],[x,1.95,back+.17],0x8a7a62);lamp([.12,.2,.07],[x,1.98,back+.24],0xffd9a0,-1,1.9)}
    // A window on the back wall, with a sill, mullions and a pair of curtains on a rod.
    const wx=1.2;
    box([2.5,1.6,.06],[wx,1.8,back+.1],trim);box([2.3,1.4,.05],[wx,1.8,back+.13],0xcfe6f2,-1,true);
    box([.06,1.4,.07],[wx,1.8,back+.15],trim);box([2.3,.06,.07],[wx,1.8,back+.15],trim);
    box([2.7,.07,.28],[wx,1.0,back+.2],trim);
    cyl([.03,3.3,.03],[wx,2.72,back+.22],0x7a6a58,[0,0,Math.PI/2]);
    for(const dx of [-1.45,1.45]){box([.6,1.95,.1],[wx+dx,1.72,back+.24],0xa5705a);for(let k=0;k<3;k++)box([.03,1.9,.11],[wx+dx-.2+k*.2,1.72,back+.25],0x8d5c49)}
    // Pictures and a clock.
    for(const [x,y,pw,ph,art] of [[-2.4,1.85,.9,.65,0xc7b98e],[-1.3,1.7,.5,.4,0x9fbcc4]]){box([pw,ph,.04],[x,y,back+.12],0x4a3a2c);box([pw-.12,ph-.12,.05],[x,y,back+.13],art);box([pw*.4,ph*.28,.055],[x+pw*.1,y-ph*.12,back+.135],0x7a8f6a)}
    cyl([.24,.04,.24],[3.4,2.2,back+.12],0xf1ece0,[Math.PI/2,0,0]);cyl([.26,.03,.26],[3.4,2.2,back+.1],0x4a3a2c,[Math.PI/2,0,0]);
    box([.02,.15,.02],[3.4,2.26,back+.15],0x2a2a2a);box([.11,.02,.02],[3.44,2.2,back+.15],0x2a2a2a);
    // The consumer unit, on the left wall: the room's only plant, and the thing that tells you the power is on.
    box([.14,.6,.42],[-w/2+.15,1.5,.6],0xe7e2d6);box([.05,.4,.3],[-w/2+.24,1.5,.6],0xcfc8b8);
    if(s.power)lamp([.04,.07,.09],[-w/2+.27,1.7,.6],C.green,-1,1.5);else box([.04,.07,.09],[-w/2+.27,1.7,.6],C.dark,-1,true);
    // Storage: a bookcase against the left wall, books and archive boxes.
    const bx=-w/2+.4,bz=-d/2+2.6,bookTones=[0x9c3d3a,0x3d6f9c,0x4f8f5a,0xc9a24a,0x6b4f8f,0xd8d0be,0x2f4f4f,0xb86a3a];
    box([.45,2.05,.04],[bx,1.05,bz-.9],0x7a5a3c);box([.45,2.05,.04],[bx,1.05,bz+.9],0x7a5a3c);box([.04,2.05,1.84],[bx-.2,1.05,bz],0x6a4c32);box([.45,.05,1.84],[bx,2.08,bz],0x7a5a3c);
    for(let j=0;j<5;j++){
      const y=.08+j*.5;box([.45,.04,1.84],[bx,y,bz],0x7a5a3c);
      if(j===0){for(let k=0;k<3;k++){box([.34,.3,.5],[bx+.02,y+.18,bz-.55+k*.55],0xcdbf9f);box([.02,.12,.3],[bx+.2,y+.2,bz-.55+k*.55],0xf4f0e4)}continue}
      let zz=bz-.85,i=j*7;
      while(zz<bz+.8){const bw=.04+((i*5)%4)*.012,bh=.27+((i*3)%5)*.035;box([.28,bh,bw],[bx+.04,y+.02+bh/2,zz+bw/2],bookTones[i%bookTones.length]);zz+=bw+.008;i++;if(j===3&&zz>bz+.1)break}
    }
    // A filing cabinet and a plant in the back corner.
    const fx=-w/2+1.5;box([.52,1.3,.62],[fx,.72,back+.45],0x8c9a93);
    for(let k=0;k<3;k++){box([.46,.34,.02],[fx,.35+k*.42,back+.77],0x7d8b85);box([.2,.03,.03],[fx,.42+k*.42,back+.79],0xd4d9d6)}
    const px=-w/2+.55,pz=back+.55;
    cyl([.25,.34,.25],[px,.24,pz],0xb4623f);cyl([.27,.05,.27],[px,.43,pz],0x9c5334);
    for(let k=0;k<7;k++)part('box',[.07,.55,.2],[px+Math.sin(k*.9)*.1,.78,pz+Math.cos(k*.9)*.1],k%2?0x4f8f5a:0x3f7a4c,[Math.cos(k*.9)*.45,k*.9,Math.sin(k*.9)*.45]);
  }
  function populate(s,api){
    const {box,part,fan,label,C}=api,{p}=FloorModel.definitions(s),site=plan(s),w=p.width,d=p.depth;
    const cylinder=(size,pos,col,rot=[0,0,0])=>part('cylinder',size,pos,col,rot);
    const home=p.id==='home',st=FloorSites.style(p.id,site.large);
    if(home)homeOffice(api,w,d,s);
    if(!home){
    const gridColor=st.yard;
    box([site.width+.4,.38,site.depth+.4],[site.cx,-.25,site.cz],st.slab);
    box([site.width,.13,site.depth],[site.cx,-.015,site.cz],gridColor);
    box([w,.015,d],[0,.061,0],st.floor);
    if(!p.outdoor){
      box([w,2.9,.16],[0,1.45,-d/2],st.wall);box([.16,2.9,d],[-w/2,1.45,0],st.wall);
      box([w,.2,.2],[0,.25,-d/2+.1],st.trim);box([.2,.2,d],[-w/2+.1,.25,0],st.trim);
      for(let x=-w/2+.5;x<w/2;x+=3.6){box([.16,2.75,.22],[x,1.4,-d/2+.14],st.post);api.lamp([2.2,.07,.12],[x+.9,2.55,-d/2+.26],0xe0f3ec,-1,1.7);}
      if(p.id==='garage'||p.id==='workshop'){
        const x=w/2-2.2;box([2.5,2.35,.08],[x,1.2,-d/2+.12],st.door);
        for(let y=.2;y<2.4;y+=.16)box([2.45,.025,.035],[x,y,-d/2+.18],C.edge);
      }
    }
    for(let x=-w/2+1;x<w/2;x+=1.7)box([.012,.008,d],[x,.078,0],st.grid);
    for(let z=-d/2+1;z<d/2;z+=1.7)box([w,.008,.012],[0,.078,z],st.grid);
    box([w-1,.015,.065],[0,.09,d/2-3.1],st.hazard);
    for(let x=-w/2+.6;x<w/2-.4;x+=.55)part('box',[.09,.015,.48],[x,.09,d/2-.65],st.hazard,[0,.55,0]);
    for(const x of [-w/2+2.9,w/2-2.9])box([.035,.015,d-4],[x,.09,0],st.line);
    // Elevated cable trays along the back, clear of the miner selection area.
    if(p.id!=='home'){
      box([w-1,.13,.48],[0,2.85,-d/2+.65],C.steel);
      for(let x=-w/2+1;x<w/2-1;x+=.55)box([.05,.035,.6],[x,2.94,-d/2+.65],C.edge);
      /* Colour carries meaning on a real floor: orange is power, blue is data, bare copper
         is earth. Three grey bundles told you there was cabling and nothing else. */
      for(let k=0;k<3;k++)box([w-1,.025,.035],[0,2.95,-d/2+.5+k*.12],k===0?C.orange:k===1?0x4a9fe0:0x8a6a3c);
    }
    box([.8,1.75,.48],[-w/2+.7,.95,d/2-.65],C.steel);
    if(s.power)api.lamp([.57,.34,.04],[-w/2+.7,1.42,d/2-.38],C.green,-1,1.5);
    else box([.57,.34,.04],[-w/2+.7,1.42,d/2-.38],C.dark,-1,true);
    // Emergency stop, red and unmissable, because that is what one looks like.
    part('cylinder',[.09,.05,.09],[-w/2+.7,1.12,d/2-.4],0xd4392f,[Math.PI/2,0,0]);
    for(let i=0;i<3;i++)box([.12,.16,.04],[-w/2+.49+i*.21,.8,d/2-.38],C.orange);
    }
    if(!home)FloorSites.details(p.id,api,{w,d,site,s});
    // Roofs removed on the live containers so racks and their status stay legible.
    if(p.id==='container')for(let row=0;row<3;row++){
      const z=(row-1)*4.4;
      for(const dz of [-1.75,1.75]){box([w-7,.12,.09],[0,.22,z+dz],0xb8c6c4);box([w-7,.13,.09],[0,2.7,z+dz],0x385f70);}
      for(const x of [-(w-7)/2,(w-7)/2]){box([.12,2.6,3.6],[x,1.4,z],0x386277);for(let k=0;k<3;k++)fan(x-.07,1.15+k*.45,z+1.83,.19);}
      label('MODULE '+String(row+1).padStart(2,'0'),[0,2.7,z+1.78],2.5,.25);
    }
    if(p.id==='hydroplant'){
      for(const [x,color] of [[-w/2+3.3,0x5fb7df],[w/2-3.3,0xdc8063]]){
        cylinder([.14,d-5,.14],[x,.25,0],color,[Math.PI/2,0,0]);
        for(let z=-d/2+3;z<d/2-3;z+=2.4)cylinder([.07,1.2,.07],[x+(x<0?.55:-.55),.25,z],color,[0,0,Math.PI/2]);
      }
    }
    const darkRoof=0x244653;
    for(const item of site.items){
      const {x,z}=item;
      const B=(size,offset,col)=>box(size,[x+offset[0],offset[1],z+offset[2]],col);
      if(home&&item.type==='shelves')continue;
      if(home&&item.type==='workbench'){
        B([1.6,.06,.75],[0,.74,0],0x9a7549);for(const dx of [-.72,.72])for(const dz of [-.3,.3])B([.06,.72,.06],[dx,.37,dz],0x6a4c32);
        B([.5,.2,.26],[.45,.87,.05],C.red);B([.5,.03,.28],[.45,.99,.05],0x9a2f24);B([.14,.03,.1],[.45,1.03,.05],C.edge);
        B([.55,.025,.38],[-.45,.79,.05],0x286b60);for(let k=0;k<4;k++)B([.07,.07,.14],[-.62+k*.16,.84,.05],C.edge);
        B([.04,.3,.04],[-.1,.95,-.2],0x3a3a3a);B([.3,.05,.04],[-.02,1.1,-.2],0x3a3a3a);api.lamp([.1,.05,.1],[x+.12,1.07,z-.18],0xffd9a0,-1,2);
      }else if(item.type==='workbench'){
        B([2.1,.12,1.03],[0,.9,0],C.wood);for(const dx of [-.85,.85])B([.1,.85,.85],[dx,.47,0],C.steel);
        B([.65,.15,.4],[.35,1.06,.1],C.red);B([.8,.045,.55],[-.55,1,.05],0x286b60);
        for(let k=0;k<4;k++)B([.08,.09,.18],[-.84+k*.2,1.07,.07],C.edge);
        B([1.95,.72,.06],[0,1.3,-.48],C.steel);for(let k=0;k<6;k++)B([.025,.27,.035],[-.7+k*.27,1.3,-.43],C.orange);
      }else if(item.type==='shelves'){
        for(const dx of [-.68,.68])B([.08,2.15,1.05],[dx,1.15,0],C.steel);
        for(let j=0;j<3;j++){B([1.5,.07,1.12],[0,.3+j*.65,0],C.edge);for(let k=0;k<3;k++)B([.38,.39,.65],[-.48+k*.48,.54+j*.65,0],k%2?0xa58460:0x887559);}
      }else if(item.type==='pallets'){
        for(let j=0;j<2;j++){B([1.5,.13,.97],[0,.15+j*.62,0],C.wood);for(let k=0;k<2;k++)B([.62,.47,.75],[-.37+k*.74,.45+j*.62,0],0x9b8867);}
      }else if(item.type==='forklift'){
        B([1.15,.48,1.7],[0,.65,0],C.orange);B([.75,.39,.8],[0,1.03,-.3],C.dark);
        for(const dx of [-.48,.48]){B([.075,1.3,.08],[dx,1.36,.23],C.steel);cylinder([.27,1.3,.27],[x,.33,z+dx],C.dark,[0,0,Math.PI/2]);}
        B([1.2,.09,1.15],[0,2.02,-.13],C.steel);for(const dx of [-.34,.34]){B([.1,1.8,.1],[dx,1.05,.84],C.steel);B([.12,.08,1],[dx,.22,1.23],C.edge);}
      }else if(item.type==='transformer'){
        B([3.6,.14,3.2],[0,.18,0],0x829191);B([2.1,1.5,1.75],[0,1,0],0x738e83);
        for(let k=0;k<9;k++)B([.08,1.25,2.1],[-1+k*.25,.98,0],0x536c65);
        for(const dx of [-.65,0,.65]){cylinder([.095,.6,.095],[x+dx,2.01,z],C.edge);for(let k=0;k<4;k++)cylinder([.15,.035,.15],[x+dx,1.83+k*.12,z],0xb9c5c1);}
        B([2.7,.05,.04],[0,2.38,0],C.orange);
      }else if(item.type==='cooler'){
        B([3.2,1.25,4.2],[0,.86,0],0xa6bbb7);
        for(const dx of [-.85,.85])for(const dz of [-1.15,1.15]){cylinder([.59,.08,.59],[x+dx,1.54,z+dz],C.dark);part('torus',[.56,.56,.56],[x+dx,1.59,z+dz],C.edge,[Math.PI/2,0,0]);}
        for(let k=0;k<7;k++)B([3.1,.045,.07],[0,.39+k*.14,2.13],C.steel);
      }else if(item.type==='office'){
        // Only ever the operations building on a large site now, so there is one shape.
        B([3.6,2.1,3.2],[0,1.14,0],0x91a6a9);B([3.9,.12,3.5],[0,2.25,0],darkRoof);
        for(const dx of [-.9,.15])B([.85,.7,.025],[dx,1.55,1.62],0x284b5d);
        B([.6,1.6,.03],[1.27,.95,1.63],C.steel);
      }else if(item.type==='generator'){
        B([5,1.8,2.7],[0,1,0],0x557062);for(let k=0;k<10;k++)B([.22,1.25,.035],[-2.1+k*.43,1,1.37],C.dark);
        cylinder([.12,1,.12],[x+1.4,2.34,z],C.steel);B([1.1,.1,1.1],[-1.2,1.95,0],C.steel);
      }else if(item.type==='hall'){
        B([item.w,2.8,item.d],[0,1.48,0],0x70888a);B([item.w+.25,.16,item.d+.3],[0,2.93,0],darkRoof);
        for(let k=0;k<Math.floor(item.w);k++)B([.08,2.4,.035],[-item.w/2+.6+k,1.4,item.d/2+.03],0x45646e);
        for(let k=0;k<3;k++)B([1.2,.26,1],[(-1+k)*item.w*.25,3.12,0],C.edge);
      }else if(item.type==='container'){
        const boxCol=item.name==='Expansion module'?0xa5543a:0x426e83;B([item.w,2.5,item.d],[0,1.38,0],boxCol);
        for(let k=0;k<Math.floor(item.w*3);k++)B([.07,2.25,.05],[-item.w/2+.2+k*.33,1.4,item.d/2+.04],0x8aa5af);
        B([item.w+.12,.1,item.d+.1],[0,2.7,0],0x254753);for(let k=0;k<4;k++)fan(x-2.5+k*1.65,1.1,z+item.d/2+.12,.35);
      }else if(item.type==='penstock'){
        B([5,2.6,3],[0,1.35,-.5],0x637b70);for(const dx of [-1.25,1.25])cylinder([.56,5.5,.56],[x+dx,1.15,z+.4],0x809ca5,[Math.PI/2,0,0]);
        B([5,.25,.75],[0,2.85,-.3],C.edge);for(const dx of [-1.25,1.25])part('torus',[.58,.58,.58],[x+dx,1.15,z+1.65],C.orange,[0,0,0]);
      }else if(item.type==='tower'){
        for(const dx of [-1.7,1.7]){B([3.1,2.5,3.6],[dx,1.45,0],0x9ab1b0);cylinder([1.1,.33,1.1],[x+dx,2.85,z],C.steel);cylinder([.86,.03,.86],[x+dx,3.03,z],C.dark);for(let k=0;k<7;k++)B([2.8,.1,.06],[dx,.5+k*.28,1.84],0x597c83);}
      }else if(item.type==='pump'){
        B([1.8,.2,3.2],[0,.25,0],C.steel);for(const dz of [-.8,.8]){cylinder([.35,.75,.35],[x,.75,z+dz],0x61a1b2,[0,0,Math.PI/2]);cylinder([.08,1.5,.08],[x,.5,z+dz],0xdb886a,[0,0,Math.PI/2]);}
        for(const dx of [-.73,.73])cylinder([.07,2.6,.07],[x+dx,.45,z],dx<0?0x5fb7df:0xdc8063,[Math.PI/2,0,0]);
      }
      if(!home&&(site.large||item.type==='workbench'))label(item.name.toUpperCase(),[x,item.type==='hall'?3.45:item.type==='tower'?3.55:2.65,z+item.d/2+.12],Math.min(item.w+.8,4),.25);
    }
    if(site.large){
      // Open mesh fence, bollards, utility poles and a marked service road.
      const right=w/2+7,back=-d/2-5.1;
      for(let z=back;z<d/2+1.4;z+=2){box([.075,1.85,.075],[right,.97,z],C.edge);for(const y of [.4,1,1.65])box([.026,.035,1.95],[right,y,z+.94],C.steel);}
      for(let x=-w/2;x<right;x+=2){box([.075,1.85,.075],[x,.97,back],C.edge);for(const y of [.4,1,1.65])box([1.98,.035,.026],[x+.94,y,back],C.steel);}
      for(let z=-d/2;z<d/2;z+=2.3)box([.09,.017,1.1],[w/2+.68,.1,z],0xd6d9c7);
      for(const z of [-d/2+1,d/2-1]){cylinder([.075,4.7,.075],[right-.5,2.42,z],C.steel);box([.9,.05,.3],[right-.8,4.82,z],0xd2e2df);}
      for(let x=-w/2+1;x<w/2;x+=3)cylinder([.095,.7,.095],[x,.43,d/2+.2],C.orange);
    }
    const crew=crewLayout(s);
    for(const person of crew){
      const {x,z,color,role}=person;
      for(const dx of [-.105,.105]){box([.135,.51,.15],[x+dx,.38,z],C.steel);box([.15,.095,.27],[x+dx,.125,z+.055],C.dark);}
      box([.38,.46,.23],[x,.88,z],color);
      // Hi-vis, on both bands, because that is what anyone on an industrial floor wears.
      if(!home)for(const y of [.94,.84])box([.39,.045,.025],[x,y,z+.13],0xd8e84a);
      cylinder([.13,.23,.13],[x,1.23,z],0xc19b7d);
      if(home)cylinder([.145,.1,.145],[x,1.38,z],0x5b4636);
      else{cylinder([.155,.09,.155],[x,1.4,z],role==='treasurer'?C.steel:0xe4ddb1);cylinder([.18,.025,.18],[x,1.365,z],role==='treasurer'?C.steel:0xe4ddb1)}
      part('box',[.12,.38,.13],[x-.25,.84,z],color,[0,0,.22]);part('box',[.12,.32,.13],[x+.25,.9,z+.035],color,[-.38,0,-.35]);
      if(role==='fieldtech')box([.34,.19,.2],[x-.28,.57,z],C.red);
      else box([.24,.3,.04],[x+.28,.92,z+.18],role==='logistics'?C.wood:C.dark);
    }
    /* The plant the operation actually bought, drawn last so it can place itself around
       everything else that is already standing in the room. */
    FloorCooling.populate(s,api,site);
    return {...site,crew};
  }
  return {plan,crewLayout,populate,roleColors};
})();
