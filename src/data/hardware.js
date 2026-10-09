"use strict";

const HARDWARE=[
  {id:"laptop",name:"Basic laptop",maker:"Your faithful terminal",date:"2009-01-03",era:"CPU",hash:5e6,w:65,space:0,cost:0,permanent:true,fan:"laptopfan",desc:"Always yours. Slow, inefficient and historically plausible at Genesis."},
  {id:"cpu",name:"Quad-core tower",maker:"Home build",date:"2009-06-01",era:"CPU",hash:2e7,w:230,space:1,cost:720,desc:"More cores, more heat - the final CPU step before GPUs."},
  {id:"5870",name:"Radeon HD 5870",maker:"GPU pioneer",date:"2010-07-01",era:"GPU",hash:4e8,w:220,space:1,cost:410,desc:"A step-change in parallel SHA-256 throughput."},
  {id:"gpurig",name:"Six-GPU open rig",maker:"Garage frame",date:"2011-02-01",era:"GPU",hash:2.4e9,w:1250,space:4,cost:3100,edge:3,desc:"Fast enough to turn a spare room into an electrical problem."},
  {id:"fpga",name:"FPGA board",maker:"Icarus class",date:"2011-09-01",era:"FPGA",hash:8e8,w:85,space:1,cost:1450,edge:8.5,desc:"Lower raw speed than a GPU rack, radically better efficiency."},
  {id:"avalon",name:"Avalon batch one",maker:"Canaan",date:"2013-01-29",era:"ASIC",hash:6.6e10,w:620,space:2,cost:1300,desc:"Purpose-built silicon changes mining forever."},
  {id:"s1",name:"Antminer S1",maker:"Bitmain",date:"2013-12-01",era:"ASIC",hash:1.8e11,w:360,space:2,cost:520,desc:"Compact, accessible and quickly obsolete."},
  {id:"s3",name:"Antminer S3",maker:"Bitmain",date:"2014-07-01",era:"ASIC",hash:4.78e11,w:366,space:2,cost:450,desc:"A large efficiency gain during industrialisation."},
  {id:"s5",name:"Antminer S5",maker:"Bitmain",date:"2014-12-01",era:"ASIC",hash:1.15e12,w:590,space:2,cost:370,desc:"Terahash mining reaches the workshop."},
  {id:"s7",name:"Antminer S7",maker:"Bitmain",date:"2015-09-01",era:"ASIC",hash:4.73e12,w:1293,space:2,cost:1820,desc:"A defining pre-halving workhorse."},
  {id:"s9",name:"Antminer S9",maker:"Bitmain",date:"2016-06-01",era:"ASIC",hash:1.35e13,w:1323,space:2,cost:2100,desc:"The long-lived machine that professionalised a generation."},
  {id:"s17",name:"Antminer S17 Pro",maker:"Bitmain",date:"2019-04-01",era:"ASIC",hash:5.3e13,w:2094,space:2,cost:2250,desc:"Higher density, higher operational stakes."},
  {id:"s19",name:"Antminer S19 Pro",maker:"Bitmain",date:"2020-05-01",era:"ASIC",hash:1.1e14,w:3250,space:2,cost:2700,edge:2,desc:"The post-halving industrial standard."},
  {id:"s19xp",name:"Antminer S19 XP",maker:"Bitmain",date:"2022-07-01",era:"ASIC",hash:1.4e14,w:3010,space:2,cost:8900,edge:3,desc:"Premium joules per terahash during an energy squeeze."},
  {id:"s19hydro",name:"Antminer S19 Pro Hydro",maker:"Bitmain",date:"2022-03-01",era:"HYDRO ASIC",hash:1.98e14,w:5445,space:3,cost:10500,edge:2,requires:"liquidcool",minFacility:"warehouse",desc:"An early high-density hydro unit with a heavy power draw and closed-loop cooling requirement."},
  {id:"s21",name:"Antminer S21",maker:"Bitmain",date:"2024-01-01",era:"ASIC",hash:2e14,w:3500,space:2,cost:4200,desc:"Built for a 3.125 BTC subsidy world."},
  {id:"s21hydro",name:"Antminer S21 Hydro",maker:"Bitmain",date:"2024-02-01",era:"HYDRO ASIC",hash:3.35e14,w:5360,space:3,cost:7200,edge:1.7,requires:"liquidcool",minFacility:"warehouse",desc:"High-density water-cooled hashing. It needs liquid loops, industrial distribution and a serious site."},
  {id:"s21xp",name:"Antminer S21 XP",maker:"Bitmain",date:"2025-01-01",era:"ASIC",hash:2.7e14,w:3645,space:2,cost:6500,edge:1.6,desc:"Efficiency becomes the entire business model."}
];
/* Which fan and which hashboard a machine takes. Defined here rather than in
   maintenance.js because simulation.js migrates saves against them at load time,
   and maintenance.js is parsed after simulation.js. */
function fanTierFor(h){return h.fan||(h.era==="ASIC"||h.era==="HYDRO ASIC"?"asicfan":"fan")}
/* Moved here from maintenance.js for the same reason as its two neighbours: the save
   migration in simulation.js calls it at load time, and maintenance.js is parsed later. Left
   where it was, a save carrying legacy fault counts threw a ReferenceError partway through
   the migration, which aborted the rest of simulation.js and left every const declared below
   that point uninitialised - the whole app dead on load, not just the faults. */
function partFaultWeights(h){
  const fanTier=fanTierFor(h),boardTier=hashboardTierFor(h);
  if(h.era==="HYDRO ASIC")return{[boardTier]:.30,powerPcb:.25,[fanTier]:.15,coolantPump:.15,coolingManifold:.15};
  if(h.era==="ASIC")return{[boardTier]:.45,powerPcb:.35,[fanTier]:.20};
  if(h.era==="FPGA")return{powerPcb:.55,[fanTier]:.45};
  if(h.era==="GPU")return{[fanTier]:.55,powerPcb:.45};
  return{[fanTier]:1};
}
function hashboardTierFor(h){if(h.era==="HYDRO ASIC")return"hashboardmodern";if(h.era!=="ASIC")return null;if(at(h.date)<at("2016-01-01"))return"hashboardearly";if(at(h.date)<at("2020-01-01"))return"hashboard";return"hashboardmodern"}

const SPARE_PARTS=[
  {id:"laptopfan",name:"Laptop cooling fan",cost:15,desc:"A small internal fan for the mining laptop's chassis."},
  {id:"fan",name:"120mm case fan",cost:45,desc:"Standard case airflow for home-built towers, GPU rigs and FPGA boards."},
  {id:"asicfan",name:"ASIC blower fan",cost:55,desc:"Compact, high-static-pressure blower fans for dense ASIC racks."},
  {id:"hashboardearly",name:"Early hashboard",cost:180,desc:"SHA-256 compute board for first-generation ASICs."},
  {id:"hashboard",name:"Hashboard",cost:480,desc:"SHA-256 compute board for mid-generation ASICs."},
  {id:"hashboardmodern",name:"High-density hashboard",cost:900,desc:"SHA-256 compute board for current-generation ASIC and hydro miners."},
  {id:"powerPcb",name:"Power PCB",cost:180,desc:"Power-control and distribution boards for mining hardware."},
  {id:"coolantPump",name:"Coolant pump",cost:420,desc:"Circulation pumps for closed-loop hydro ASIC cooling systems."},
  {id:"coolingManifold",name:"Cooling manifold",cost:260,desc:"Quick-connect hoses, manifolds and seals for hydro-miner racks."},
  /* A consumable rather than a part that fails. Nothing breaks BECAUSE the paste is old;
     the paste is what you use up every time a heatsink comes off a chip, and a hashboard
     swap always does. Cheap enough to be an afterthought, which is the point: forgetting it
     costs far more than the tube. */
  {id:"immersionKit",name:"Immersion conversion kit",cost:35,consumable:true,fits:"immersion",desc:"Fan-delete blanking plates, dielectric-safe gaskets and immersion-rated interface compound for one air-cooled miner. Consumed by the conversion and not recoverable if the machine is later drained."},
  {id:"thermalpaste",name:"Thermal paste",cost:12,consumable:true,fits:"repaste",desc:"Thermal interface compound. Consumed whenever a hashboard is reseated - a dry-fitted board runs hot and comes back off the bench in worse condition."}
];
/* Replacing these means breaking the seal between a chip and its heatsink, so the interface
   compound has to be renewed. Fans and manifolds bolt on without disturbing it. */
const REPASTE_PARTS=["hashboardearly","hashboard","hashboardmodern"];
