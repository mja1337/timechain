"use strict";

/* EACH SITE, ITS OWN PLACE.

   Past the home office every site was the same room at a different size: one slate grid floor, one orange stripe,
   the same steel posts and strip lights, the same shelf of cardboard boxes. That is realistic of industrial units, and
   it is also why a player who moved from a garage to a warehouse saw the same picture get bigger. Each site now has its
   own palette (the floor, the walls, the trim, the lines painted on the concrete) and a handful of details that belong
   to that kind of building and nowhere else: a garage has tyres, an oil drum and a pegboard; a light industrial unit has
   breeze blocks, a fire point and a three-phase board; a warehouse has racking and dock markings; a data campus has
   chilled-water pipes and tiled floors; a container yard has weathered containers and floodlights; a hydro plant has
   the river and the trees; the megacampus has a solar field and battery cabinets.

   Everything is the same instanced geometry the rest of the floor uses. This draws and decides nothing. */

const FloorSites=(()=>{
  /* yard   - the ground outside the pad (large sites)      floor - the pad or room floor        grid  - joints in it
     line   - painted lines          hazard - the stripe and chevrons            wall  - walls
     trim   - skirting and bands     post   - the uprights between lights       door  - the roller door */
  const STYLE={
    garage:   {slab:0x3b3834,yard:0x6f6a62,floor:0x77726b,grid:0x666158,line:0x8f8a80,hazard:0xd7b23a,wall:0xcec7b6,trim:0x8d5a3e,post:0x6a6257,door:0x8b8f8c},
    workshop: {slab:0x2d3338,yard:0x6d777c,floor:0x6e787d,grid:0x5e686d,line:0xdcc84a,hazard:0xdcc84a,wall:0x939999,trim:0x2f6fa8,post:0x465159,door:0x3f6f8f},
    warehouse:{slab:0x2b3234,yard:0x3d4446,floor:0x7b8685,grid:0x6a7675,line:0xe3e3d4,hazard:0xe6c43a,wall:0xbcb7a2,trim:0x2f7f6f,post:0x3b4950,door:0x5d7a73},
    campus:   {slab:0x2c353c,yard:0x3a444b,floor:0xaeb9bc,grid:0x93a0a5,line:0x4f9ad8,hazard:0x4f9ad8,wall:0xe2e8ea,trim:0x3f8ac8,post:0xb2bdc1,door:0x9fb0b6},
    container:{slab:0x5a5546,yard:0x8a7f66,floor:0x6f6b5f,grid:0x5f5b50,line:0xd2cdb8,hazard:0xe0b23a,wall:0x426e83,trim:0xe0b23a,post:0x59666a,door:0x426e83},
    hydroplant:{slab:0x4a5b50,yard:0x4d6a44,floor:0x62756f,grid:0x52645e,line:0xcfe0d8,hazard:0x3fb5a8,wall:0x637b70,trim:0x3fb5a8,post:0x4c5f58,door:0x637b70},
    megacampus:{slab:0x25292c,yard:0x31383b,floor:0x4a5459,grid:0x3d474b,line:0xe6e6e0,hazard:0xe6c43a,wall:0x70888a,trim:0x5fb0d8,post:0x4b565b,door:0x70888a}
  };
  const style=(id,large)=>STYLE[id]||{slab:0x17262d,yard:large?0x374952:0x516267,floor:0x516267,grid:0x3f5056,line:0xc8d5c9,hazard:0xf7a13d,wall:0x768588,trim:0xf7a13d,post:0x283b43,door:0x485f68};

  function details(id,api,ctx){
    const {box,part,lamp,label,C}=api,{w,d,site}=ctx,back=-d/2,left=-w/2;
    const cyl=(size,pos,col,rot=[0,0,0])=>part('cylinder',size,pos,col,rot);
    const st=style(id,site.large);
    /* THE OTHER TWO SIDES. A room is drawn as a cutaway: its back and left walls stand and the rest is left off, so the
       machines can be seen. That reads as a cutaway at home or in a garage. A warehouse or a data campus sits in a yard,
       with a fence, a gatehouse and plant outside it, and with only two walls the building looks half built. Its front and
       right walls are kerb height instead, so the footprint is closed and the floor is still in view, with a tall post at
       each corner to say the walls go up, and a gap on the front for the loading door. */
    if(site.large&&id!=='container'&&id!=='hydroplant'&&id!=='megacampus'){
      const h=.8,gapX=w/2-6,gap=3;
      box([.16,h,d],[w/2,h/2,0],st.wall);box([.2,.08,d+.1],[w/2,h+.04,0],st.trim);
      for(const [x0,x1] of [[-w/2,gapX-gap/2],[gapX+gap/2,w/2]]){const len=x1-x0,cx=(x0+x1)/2;box([len,h,.16],[cx,h/2,d/2],st.wall);box([len+.1,.08,.2],[cx,h+.04,d/2],st.trim)}
      for(const [x,z] of [[w/2,-d/2],[-w/2,d/2],[w/2,d/2],[gapX-gap/2,d/2],[gapX+gap/2,d/2]])box([.26,2.9,.26],[x,1.45,z],st.post);
      for(const x of [gapX-gap/2,gapX+gap/2])box([.28,.5,.28],[x,.25,d/2+.2],st.hazard);
    }
    // Courses of block or brick, drawn as thin lines on the two walls that can be seen.
    const courses=(step,col)=>{for(let y=step;y<2.8;y+=step){box([w,.018,.02],[0,y,back+.09],col);box([.02,.018,d],[left+.09,y,0],col)}};
    const fireExtinguisher=(x,z,wall)=>{
      // A red cylinder on a bracket, with a red sign above it: the fire point every unit with a lease has.
      const px=wall==='left'?left+.2:x,pz=wall==='left'?z:back+.2;
      cyl([.085,.5,.085],[px,.78,pz],0xd4392f);box([.1,.06,.1],[px,1.07,pz],0x2a2a2a);
      box(wall==='left'?[.03,.34,.34]:[.34,.34,.03],[wall==='left'?left+.1:x,1.55,wall==='left'?z:back+.1],0xd4392f);
      box(wall==='left'?[.035,.2,.05]:[.05,.2,.035],[wall==='left'?left+.12:x,1.55,wall==='left'?z:back+.12],0xf1ece0);box(wall==='left'?[.035,.05,.2]:[.2,.05,.035],[wall==='left'?left+.12:x,1.55,wall==='left'?z:back+.12],0xf1ece0);
    };
    const greenSign=(x,y,z,onLeft)=>{box(onLeft?[.04,.22,.5]:[.5,.22,.04],[onLeft?left+.12:x,y,onLeft?z:back+.12],0x2f9a5a,-1,true)};

    if(id==='garage'){
      courses(.3,0xb0a894);
      // Oil on the concrete, where a car has stood.
      box([1.6,.008,1.0],[-2.4,.082,.8],0x56514a);box([.9,.008,.7],[1.8,.082,2.6],0x5d5851);box([1.2,.008,.8],[3.6,.082,-1.2],0x57524b);
      // A pegboard of tools, an oil drum and a stack of tyres.
      box([2.4,1.2,.04],[-1.3,1.55,back+.1],0xb89c6a);
      for(let k=0;k<6;k++){box([.07,.4,.03],[-2.3+k*.32,1.55+(k%2?.15:-.1),back+.13],0x3a3a3a);box([.16,.05,.03],[-2.3+k*.32,1.78+(k%3)*.1,back+.13],C.red)}
      for(let k=0;k<3;k++)cyl([.34,.2,.34],[left+3.4,.2+k*.21,back+.7],0x1c1c1c);cyl([.2,.04,.2],[left+3.4,.2,back+.7],0x9a9a9a);
      cyl([.3,.9,.3],[left+.6,.55,back+.65],0x2f5f8f);cyl([.31,.05,.31],[left+.6,.99,back+.65],0x24486c);cyl([.31,.04,.31],[left+.6,.75,back+.65],0x24486c);
      // A paint shelf, a bare bulb on a bracket and a high frosted window.
      box([1.6,.05,.3],[1.8,1.5,back+.2],0x7a5a3c);for(let k=0;k<5;k++)cyl([.09,.2,.09],[1.2+k*.28,1.63,back+.22],[0xc0504a,0xd8c24a,0x4f7fa8,0x5f9a5a,0xd8d0be][k]);
      box([.1,.05,.1],[left+.2,2.3,2.2],0x3a3a3a);lamp([.1,.12,.1],[left+.3,2.22,2.2],0xffd9a0,-1,2.4);
      box([.05,.7,1.2],[left+.1,2.0,-1.2],0xcfe6f2,-1,true);box([.07,.76,.06],[left+.1,2.0,-1.8],st.post);box([.07,.76,.06],[left+.1,2.0,-.6],st.post);
    }else if(id==='workshop'){
      courses(.4,0x7d8383);
      // A painted dado and yellow bay lines round the bench.
      box([w,.14,.04],[0,1.15,back+.1],st.trim);box([.04,.14,d],[left+.1,1.15,0],st.trim);
      box([3.2,.012,.07],[left+1.5,.09,d/2-3.4],st.line);box([3.2,.012,.07],[left+1.5,.09,d/2-.55],st.line);box([.07,.012,2.9],[left+.2,.09,d/2-2],st.line);box([.07,.012,2.9],[left+3.1,.09,d/2-2],st.line);
      // The fire point, the exit and the three-phase board with its conduit.
      fireExtinguisher(-w/2+4.2,0,'back');fireExtinguisher(0,-2.6,'left');
      box([1.0,2.1,.06],[-w/2+6.2,1.1,back+.1],0x4a5a62);greenSign(-w/2+6.2,2.45,0,false);
      box([1.1,1.5,.3],[1.4,1.2,back+.22],0x8a9395);box([.9,.5,.04],[1.4,1.5,back+.38],0x6a7376);
      for(let k=0;k<3;k++){cyl([.035,1.4,.035],[.95+k*.45,2.6,back+.2],C.orange);lamp([.06,.06,.04],[1.1+k*.3,.95,back+.4],[C.green,C.orange,C.red][k],-1,1.6)}
      // A tea point: a small bench, a kettle and a mug.
      box([1.2,.05,.6],[left+.8,.86,-d/2+7],0x9a7549);for(const dz of [-.22,.22])for(const dx of [-.5,.5])box([.05,.82,.05],[left+.8+dx,.42,-d/2+7+dz],0x6a4c32);
      box([.18,.22,.18],[left+.5,.99,-d/2+7],0xd8dcd9);box([.1,.1,.1],[left+1.0,.93,-d/2+7],0xc0504a);
      // A bay of racking with blue boxes.
      for(const dz of [-.6,.6]){box([.07,2.2,.07],[left+.45,1.15,-d/2+4.4+dz],0x2f6faa);box([.07,2.2,.07],[left+1.55,1.15,-d/2+4.4+dz],0x2f6faa)}
      for(let j=0;j<3;j++){box([1.2,.05,1.3],[left+1,.45+j*.65,-d/2+4.4],C.orange);for(let k=0;k<2;k++)box([.46,.34,.55],[left+.7+k*.55,.65+j*.65,-d/2+4.4],0x3f7fb0)}
    }else if(id==='warehouse'){
      // Profiled cladding on the walls, and the high-bay racking of a unit that holds stock.
      for(let x=-w/2+.5;x<w/2;x+=.55)box([.05,2.7,.04],[x,1.4,back+.1],0xa7a28d);for(let z=-d/2+.5;z<d/2;z+=.55)box([.04,2.7,.05],[left+.1,1.4,z],0xa7a28d);
      for(let b=0;b<3;b++){
        const x=w/2-7.4+b*2.8;
        for(const dx of [-1.3,1.3])for(const dz of [-.4,.4])box([.07,2.8,.07],[x+dx,1.45,back+.75+dz],0x2f6faa);
        for(let j=0;j<3;j++){box([2.7,.08,.12],[x,.55+j*.9,back+.35],C.orange);box([2.7,.08,.12],[x,.55+j*.9,back+1.15],C.orange);
          for(let k=0;k<2;k++){box([1.0,.6,.8],[x-.65+k*1.3,.9+j*.9,back+.75],(b+j+k)%2?0xa58460:0xd8d4c4);box([1.02,.04,.82],[x-.65+k*1.3,1.22+j*.9,back+.75],0xc9d6dc)}}
      }
      // A pedestrian route, painted, and the signs that go with it.
      box([w-3,.012,.9],[0,.085,d/2-1.5],0x3f8a55);box([w-3,.014,.06],[0,.09,d/2-1.05],0xe3e3d4);box([w-3,.014,.06],[0,.09,d/2-1.95],0xe3e3d4);
      fireExtinguisher(-w/2+7,0,'back');fireExtinguisher(0,3.4,'left');greenSign(0,2.5,-3,true);greenSign(w/2-8,2.5,0,false);
      for(let k=0;k<4;k++)box([.5,.5,.04],[-w/2+9.5+k*.7,1.4+((k*3)%2)*.4,back+.1],[0xe6c43a,0xd4392f,0x2f9a5a,0x3f7fb0][k]);
    }else if(id==='campus'){
      // A data hall: wall panels, chilled-water supply and return along the back, a fire main on the left wall, a tiled floor.
      for(let x=-w/2+1.2;x<w/2;x+=1.2)box([.025,2.8,.03],[x,1.4,back+.1],0xc2cbce);for(let z=-d/2+1.2;z<d/2;z+=1.2)box([.03,2.8,.025],[left+.1,1.4,z],0xc2cbce);
      box([w,.1,.05],[0,2.75,back+.11],0x4f9ad8,-1,true);box([.05,.1,d],[left+.11,2.75,0],0x4f9ad8,-1,true);
      for(const [y,col] of [[2.35,0x3f7fd8],[2.6,0xd45a4a]]){cyl([.07,w-1,.07],[0,y,back+.4],col,[0,0,Math.PI/2]);for(let x=-w/2+1.5;x<w/2-1;x+=3){box([.05,.3,.08],[x,y+.15,back+.35],0x6a7478);cyl([.1,.05,.1],[x,y,back+.4],0x9aa6aa,[0,0,Math.PI/2])}}
      cyl([.06,d-1,.06],[left+.45,2.6,0],0xd4392f,[Math.PI/2,0,0]);for(let z=-d/2+2;z<d/2-1;z+=3)box([.07,.14,.07],[left+.45,2.5,z],0xd4392f);
      box([.1,.9,.9],[left+.2,1.2,3],0x2a3138);box([.04,.5,.5],[left+.28,1.3,3],0x4f9ad8,-1,true);
    }else if(id==='container'){
      // Weathered stock: a spare stack in other colours, floodlights on masts, and the ruts a lorry leaves.
      for(const [dx,col,lvl] of [[-3.2,0xa5543a,0],[3.2,0x3f7a4a,0],[-3.2,0x2f6a9a,1]])box([6,2.5,2.6],[dx,1.38+lvl*2.55,back-3.4],col);
      for(const dz of [d/2+1.6,d/2+3.1])box([w+8,.01,.5],[0,.1,dz],0x6d6450);
      for(const [x,z] of [[w/2-1,d/2-.8],[-w/2+1,d/2-.8],[w/2-1,-d/2+.8]]){cyl([.09,5.2,.09],[x,2.7,z],0x59666a);box([.6,.18,.26],[x,5.3,z],0x2a2f33);lamp([.5,.1,.2],[x,5.18,z+.06],0xfff1c8,-1,2.2)}
    }else if(id==='hydroplant'){
      // The river that the intake draws from, banked with rock, and trees round the edge of the site.
      box([3.4,.1,16],[left+3,-.04,back-8.4],0x2f7aa6);box([3.1,.03,16],[left+3,.03,back-8.4],0x5aa8cc,-1,true);
      for(let z=back-.4;z>back-16;z-=1.7){box([.6,.4,.7],[left+1.1,.1,z],0x7d8683);box([.5,.3,.6],[left+4.9,.08,z-.5],0x6f7976)}
      for(const [x,z,s] of [[-w/2+9,back-5,1],[-w/2+13,back-6.5,1.25],[w/2-11,back-4.4,1.1],[w/2-5,back-6,.9],[-w/2-1.2,d/2-3,1.1],[-w/2-1.8,d/2-8,.9]]){
        cyl([.12*s,1.2*s,.12*s],[x,.65*s,z],0x6a4c32);box([1.2*s,1*s,1.2*s],[x,1.7*s,z],0x3f7a4a);box([.9*s,.9*s,.9*s],[x,2.45*s,z],0x4f8f55);
      }
      for(let k=0;k<5;k++)box([.5,.03,.5],[-w/2+5+k*1.4,.08,d/2+.4],0x5c8a4a);
    }else if(id==='megacampus'){
      // A solar field down the left edge, battery cabinets, and painted bays.
      for(let r=0;r<2;r++)for(let k=0;k<7;k++){const x=left-.7-r*1.9,z=back+2.2+k*3.1;
        part('box',[1.6,.06,2.8],[x,.8,z],0x1f3b5c,[-.45,0,0]);part('box',[1.66,.03,2.86],[x,.78,z],0xaab5b8,[-.45,0,0]);box([.07,.8,.07],[x,.4,z+.5],0x6a7478);box([.07,.5,.07],[x,.25,z-.9],0x6a7478)}
      for(let k=0;k<3;k++){box([2.2,1.9,1],[left-1.6,.97,d/2-4+k*1.3-3.9],0xdfe5e6);box([.3,.1,.04],[left-1.6,1.6,d/2-3.45+k*1.3-3.9],C.green,-1,true)}
      for(let x=-w/2+3;x<w/2-6;x+=3.2)box([.08,.014,2.4],[x,.09,d/2-2.1],st.line);
    }
  }
  return {style,details};
})();
