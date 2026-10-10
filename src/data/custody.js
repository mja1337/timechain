"use strict";

/* CUSTODY EQUIPMENT - the things you buy, build and back up in order to hold your own keys.

   Three separate ideas, deliberately not collapsed into one:
     a DEVICE is a physical object you own
     a KEY is a secret a device can sign with
     a WALLET is a policy describing which keys may spend

   Three devices carrying the same seed are still one key, and that distinction is the whole
   point of the model. Buying equipment protects nothing until a key is generated on it and
   that key is assigned to a wallet.

   Release dates are the year a product actually reached customers. Where only the year is
   firmly attested the date is set to a plausible month within it and the record says so;
   prices are period-typical rather than quoted invoices, and are modelled. */

const CUSTODY_PRODUCTS=[
  /* --- Commercial signing devices ------------------------------------------------ */
  /* The first signer there ever was: a computer that is simply never connected. Wallet files were kept this way
     from the first week, which is why cold storage is available from the first day rather than from 2012. */
  // Keep the original ID so existing devices and saved orders still resolve.
  {id:"beigepc",name:"Basic PC",kind:"signer",supplier:"generic",date:"2009-01-03",cost:175,lead:1,computer:true,art:"basic-pc",
    desc:"Budget parts. Nothing special, but brand new. One complete computer for offline signing: prepare its software, keep it separate from everyday browsing, and carry proposed and signed payments by transfer media. Buying the box does not create a key or a recovery plan."},
  {id:"minipc",name:"Small-form-factor PC",kind:"signer",supplier:"generic",date:"2009-01-03",cost:295,lead:7,computer:true,art:"mini-pc",
    desc:"A smaller complete computer for the same offline signing job. The smaller case changes the footprint, not the authority of its key or the need for recovery."},
  {id:"pikit",name:"Raspberry Pi signing kit",kind:"signer",supplier:"generic",date:"2012-02-29",cost:205,lead:11,computer:true,art:"pi-kit",source:"https://www.raspberrypi.com/news/happy-birthday-2018/",
    desc:"A single-board computer with power, case and storage included. The kit price is a game assumption, not the launch price of the board. Check compatible signing software and disable networking for its offline role."},
  {id:"trezorone",art:"trezorone",name:"Trezor One",kind:"signer",supplier:"trezor",date:"2014-08-01",cost:99,lead:9,
    desc:"The first commercial hardware wallet. A screen, two buttons and a seed you write down yourself."},
  {id:"nanos",art:"nanos",name:"Ledger Nano S",kind:"signer",supplier:"ledger",date:"2016-06-01",cost:79,lead:9,
    desc:"Secure-element signer, sold through a direct e-commerce channel that keeps customer records."},
  {id:"coldcard",art:"coldcard",name:"Coldcard Mk1",kind:"signer",supplier:"coinkite",date:"2018-05-01",cost:120,lead:14,
    desc:"Bitcoin-only, air-gappable, built to be used without ever touching a computer."},
  {id:"coldcardmk4",art:"coldcardmk4",name:"Coldcard Mk4",kind:"signer",supplier:"coinkite",date:"2021-11-01",cost:158,lead:14,
    desc:"USB-C, NFC and a faster secure element. Ships with the firmware line whose entropy defect surfaced in 2026."},
  {id:"nanox",art:"nanox",name:"Ledger Nano X",kind:"signer",supplier:"ledger",date:"2019-05-01",cost:119,lead:9,
    desc:"Bluetooth signer from the same direct channel as the Nano S."},
  {id:"bitbox02",art:"bitbox02",name:"BitBox02",kind:"signer",supplier:"shiftcrypto",date:"2019-09-01",cost:109,lead:12,
    desc:"Microcontroller signer with a Bitcoin-only edition and a paired desktop app."},
  {id:"jade",art:"jade",name:"Blockstream Jade",kind:"signer",supplier:"blockstream",date:"2021-01-01",cost:65,lead:12,
    desc:"Open-source signer with a camera, usable fully air-gapped over QR codes."},
  {id:"passport",art:"passport",name:"Foundation Passport",kind:"signer",supplier:"foundation",date:"2021-08-01",cost:259,lead:18,
    desc:"Air-gapped by design: no USB data path at all, everything moves by QR and microSD."},

  /* --- The DIY signer, assembled from parts --------------------------------------- */
  {id:"seedsigner",name:"SeedSigner",kind:"signer",supplier:"selfbuilt",date:"2020-09-01",build:"seedsigner",lead:0,cost:0,
    stateless:true,
    desc:"Built from generic single-board-computer parts and stateless by design: it holds no seed between uses, so losing the device is not losing the wallet."},

  /* --- SeedSigner components, orderable individually or as a kit ------------------- */
  {id:"pizero",name:"Raspberry Pi Zero v1.3",kind:"part",supplier:"generic",date:"2016-05-01",cost:5,lead:11,
    desc:"The v1.3 board specifically: no wireless of any kind, which is the reason this revision is the one specified."},
  {id:"ssdcamera",name:"Compatible camera module",kind:"part",supplier:"generic",date:"2016-05-01",cost:14,lead:11,
    desc:"Reads seed words and unsigned transactions as QR codes. The device has no other input path."},
  {id:"sslcd",name:"240x240 LCD with joystick and buttons",kind:"part",supplier:"generic",date:"2018-01-01",cost:19,lead:13,
    desc:"Display and controls in one hat. The whole interface, and the only thing that ever shows a seed word."},
  {id:"ssmicrosd",name:"microSD card",kind:"part",supplier:"generic",date:"2009-01-03",cost:8,lead:7,
    desc:"Carries the software. It carries no key material, which is what stateless means in practice."},
  {id:"ssenclosure",name:"Printed enclosure",kind:"part",supplier:"generic",date:"2020-09-01",cost:12,lead:9,optional:true,
    desc:"Optional. Protects the assembly and makes it look like a thing you meant to build."},
  {id:"sskit",name:"SeedSigner component kit",kind:"kit",supplier:"generic",date:"2020-09-01",cost:64,lead:14,
    contains:{pizero:1,ssdcamera:1,sslcd:1,ssmicrosd:1,ssenclosure:1},
    desc:"Every component in one order. Faster and dearer than sourcing the parts separately."},

  /* --- Seed backup products -------------------------------------------------------- */
  {id:"transferusb",name:"USB transfer stick",kind:"part",supplier:"generic",date:"2009-01-03",cost:6,lead:1,art:"usb-drive",
    desc:"Carries a proposed payment to the offline PC and returns its signed transaction. Do not put recovery secrets on this courier. Check recipient and amount on the signer before approving."},
  {id:"paperbackup",name:"Paper and pencil",kind:"backup",supplier:"none",date:"2009-01-03",cost:0,lead:0,durability:"paper",
    desc:"Free, immediate, and destroyed by the first flood or fire it meets."},
  {id:"cryptosteel",name:"Stainless steel letter tiles",kind:"backup",supplier:"cryptosteel",date:"2015-06-01",cost:79,lead:16,durability:"steel",
    desc:"Seed words assembled from steel tiles. Survives what paper does not."},
  {id:"steelplate",name:"Stamped steel plate",kind:"backup",supplier:"generic",date:"2018-01-01",cost:45,lead:12,durability:"steel",
    desc:"A blank plate and a centre punch. Cheaper than tiles and no less durable once stamped."},
];

/* What a SeedSigner needs before it can be assembled. The enclosure is genuinely optional:
   the build completes without it, and the device works. */
/* THE COLDCARD ENTROPY WINDOW. Coinkite's advisory: a configuration error introduced with
   the March 2021 libNgU migration (first public release v4.0.1) caused some devices to fall
   back on a software random number generator instead of the hardware source when generating
   a seed. Any seed generated on an affected device in this window is weak whatever firmware
   the device runs today - "updating corrects future seed generation but does not repair an
   existing affected seed". The window closes at the patch, which the game dates to the
   disclosure rather than tracking firmware versions it does not model. */
const COLDCARD_ENTROPY_WINDOW={supplier:"coinkite",from:"2021-03-01",to:"2026-07-30"};

const CUSTODY_BUILDS={
  seedsigner:{
    id:"seedsigner",name:"SeedSigner",days:2,
    required:{pizero:1,ssdcamera:1,sslcd:1,ssmicrosd:1},
    optional:{ssenclosure:1},
  },
};

/* Suppliers exist as records because a consequence has to be able to find the people who
   bought from one particular vendor in one particular window, rather than everybody who
   happens to own a hardware wallet. */
const CUSTODY_SUPPLIERS={
  trezor:{name:"Trezor"},
  ledger:{name:"Ledger"},
  coinkite:{name:"Coinkite"},
  shiftcrypto:{name:"Shift Crypto"},
  blockstream:{name:"Blockstream"},
  foundation:{name:"Foundation Devices"},
  cryptosteel:{name:"Cryptosteel"},
  generic:{name:"General electronics suppliers"},
  selfbuilt:{name:"Self-built"},
  none:{name:"-"},
  basement:{name:"The basement"},
};

const CUSTODY_POLICIES=[
  {id:"single",name:"Single signature",keys:1,threshold:1,
    desc:"One key spends. Simple to set up and to recover, and there is nothing between a compromised key and your coins."},
  {id:"2of3",name:"2-of-3 multisig",keys:3,threshold:2,
    desc:"Three independently generated keys; any two can spend. One compromised key cannot move anything, and one lost key does not strand the wallet."},
];

/* PLACES - where a device, a seed backup or the wallet's descriptor is KEPT.

   A backup is only a backup if it does not share a fate with the thing it backs up. Two seed
   cards in the same drawer as the signer are one point of failure with three labels on it, and
   the game already refuses to count three devices holding one seed as three keys; this extends
   the same honesty to where they are.

   Each place trades the same three things against each other. ACCESS is how many days it takes
   to get something out, which is added to every signing that needs it. The RATES are the chance
   per month of a fire, a flood and a break-in reaching what is kept there. And a few places cost
   money. Nothing is free of all three: the mine is the closest and the likeliest to burn, a bank
   box is the safest and the slowest and is billed monthly.

   Rates are modelled, set to give roughly one incident per run at the mine and almost none in a
   bank, and are meant to be tuned by simulation rather than argued from. */
const CUSTODY_PLACES=[
  {id:"site",name:"The mine",access:0,fee:0,rates:{fire:.0015,flood:.0010,burglary:.0020},
    blurb:"Where the fleet is. Nothing is closer to the signers, and it burns, floods and is broken into with them."},
  {id:"home",name:"Home",access:1,fee:0,rates:{fire:.0010,flood:.0007,burglary:.0015},
    blurb:"Away from the fleet, so a fire at the mine does not reach it. An ordinary house."},
  {id:"bank",name:"Bank deposit box",access:2,fee:15,rates:{fire:.0001,flood:.0001,burglary:.00005},
    blurb:"Fireproof and guarded, and open only in banking hours. It costs a fee every month, and it is in a country: a state that bans your business can open it."},
  {id:"trusted",name:"A trusted person's house",access:2,fee:0,rates:{fire:.0008,flood:.0006,burglary:.0010,betrayal:.0006},
    blurb:"Free, and away from your own address. There is also a very small chance your friend learns what the seed can spend and helps themselves. In the game, that chance matches this house's flood rate; a bank deposit box has no friend-access roll."},
];
const CUSTODY_PLACE_KINDS=["fire","flood","burglary","betrayal"];

function custodyPlace(id){return CUSTODY_PLACES.find(p=>p.id===id)||null}
function custodyPlaceName(id){return id==="transit"?"In transit":(custodyPlace(id)?.name||"Unrecorded")}
/* While the mine IS the house, "home" and "the mine" are the same building. Once the fleet moves
   out they are different places, and anything kept at home stays there. */
function custodyPlaceId(place,s=state){return place==="home"&&s.facility==="home"?"site":place}

/* A deterministic number in [0,1) from the run's seed and whatever names the event. A new risk
   uses this rather than nextRand(): drawing from the shared stream would shift every outcome
   after it in every seeded run, and a risk that only fires when something is actually kept in a
   place must not change the history of a run that keeps nothing anywhere. */
function hashRoll(seed,...parts){
  const text=[seed,...parts].join("|");
  let h=2166136261>>>0;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619)>>>0}
  h^=h>>>15;h=Math.imul(h,2246822507)>>>0;h^=h>>>13;h=Math.imul(h,3266489909)>>>0;h^=h>>>16;
  return (h>>>0)/4294967296;
}

/* An old save has no places, and a hand-edited or damaged one may carry nonsense. Unrecorded is
   a legal answer and must stay one: every rule written before places existed relies on it. */
function normalizeCustodyPlaces(c){
  if(!c||typeof c!=="object")return c;
  const ok=id=>typeof id==="string"&&(id==="transit"||CUSTODY_PLACES.some(p=>p.id===id));
  (c.devices||[]).forEach(d=>{if(d.place!==undefined&&!ok(d.place))delete d.place;
    if(d.destroyed&&typeof d.destroyed!=="object")d.destroyed={cause:"lost"}});
  (c.keys||[]).forEach(k=>{if(k.backup&&typeof k.backup==="object"&&k.backup.place!==undefined&&!ok(k.backup.place))delete k.backup.place});
  if(c.configPlace!==undefined&&!ok(c.configPlace))delete c.configPlace;
  c.configCopies=(Array.isArray(c.configCopies)?c.configCopies:[]).filter(p=>ok(p)&&p!=="transit");
  c.moves=(Array.isArray(c.moves)?c.moves:[]).filter(m=>m&&ok(m.to)&&m.to!=="transit"&&Number.isFinite(Number(m.due))&&typeof m.kind==="string");
  // A restore under way needs a device to put the key on; one whose device has gone, or that is already a signer, is dropped.
  c.restores=(Array.isArray(c.restores)?c.restores:[]).filter(r=>r&&Number.isFinite(Number(r.due))&&(c.devices||[]).some(d=>d.uid===r.uid&&!d.keyId));
  (c.devices||[]).forEach(d=>{if(d.restoring&&!c.restores.some(r=>r.uid===d.uid))delete d.restoring});
  // Something marked in transit with no journey under way would be stuck there for ever.
  const travelling=(kind,id)=>c.moves.some(m=>m.kind===kind&&m.id===id);
  (c.devices||[]).forEach(d=>{if(d.place==="transit"&&!travelling("device",d.uid))d.place="site"});
  (c.keys||[]).forEach(k=>{if(k.backup&&k.backup.place==="transit"&&!travelling("backup",k.id))k.backup.place="site"});
  if(c.configPlace==="transit")c.configPlace="site";
  return c;
}

/* WHO CAN HOLD A KEY. The owner always can. The rest are the people on the payroll who could
   reasonably be trusted with one, and each is a role rather than a named person, which is how
   the rest of the staff are modelled. A field technician is one of several, so the engine treats
   a dismissed technician as the holder only in proportion to how many there were. */
const CUSTODY_HOLDERS=["owner","treasurer","security","fieldtech"];
