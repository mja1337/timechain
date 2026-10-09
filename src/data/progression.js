"use strict";

/* SPECULATIONS AND DONATIONS ARE MOMENTS, NOT A MENU.

   Both lists were gated on a start date alone, so once a window opened it never shut: in 2026
   the game was still offering the Bitcoin Cash fork trade and the WikiLeaks donation drive as
   live options, nine and fifteen years late. That is not how either worked.

   A fork claim is available while the fork is being claimed. A launch punt is a launch punt -
   the asymmetry that makes it a gamble worth modelling exists for months, and anyone buying
   SHIB in 2026 is making a different decision from the one this entry describes. Each now
   carries an `until`, and the window is the period during which the trade actually looked
   like this.

   Donations are the same shape for a different reason. A relief fund answers something
   happening now; a legal-defence campaign runs while the case does. Leaving them permanently
   listed turns a moment somebody had to choose to meet into a chore sitting in a list, which
   is exactly backwards for the thing the game most wants the player to feel. */
const SPECULATIONS=[
  // SatoshiDice blocked US players in May 2013 and was sold that summer.
  {id:"dice",date:"2012-04-18",until:"2013-07-31",name:"Satoshi Dice",kind:"Bitcoin gambling",chance:.34,payout:2.1,desc:"A transparent-looking on-chain dice game offers a quick double-or-nothing-style punt."},
  {id:"doge",date:"2013-12-06",until:"2014-09-30",name:"Dogecoin launch",kind:"Meme coin",chance:.28,payout:3.2,desc:"A viral fork is gathering a community. Most early meme bets fade; this one might run."},
  {id:"monero",date:"2014-04-18",until:"2015-06-30",name:"Monero launch",kind:"Privacy coin",chance:.30,payout:2.5,desc:"Privacy technology is compelling, but adoption and regulatory pressure make the trade uncertain."},
  // Through the DAO fork, after which "a new programmable chain" was a different question.
  {id:"ethereum",date:"2015-07-30",until:"2016-09-30",name:"Ethereum launch",kind:"Smart-contract platform",chance:.38,payout:2.7,desc:"A new programmable chain asks you to rotate BTC into an unproven network token."},
  // A fork claim is a claim on a split that has just happened.
  {id:"bch",date:"2017-08-01",until:"2018-02-28",name:"Bitcoin Cash hard fork",kind:"Bitcoin hard-fork claim",chance:.32,payout:2.4,desc:"A contentious block-size fork creates a separate asset. Risk hot-wallet BTC on the fork trade without making it part of the core operation."},
  {id:"bsv",date:"2018-11-15",until:"2019-06-30",name:"Bitcoin SV hard fork",kind:"Bitcoin Cash hard-fork claim",chance:.18,payout:3.6,desc:"A second contentious split offers volatile fork exposure with severe technical, liquidity and counterparty risk."},
  {id:"solana",date:"2020-03-16",until:"2021-09-30",name:"Solana launch",kind:"High-throughput chain",chance:.25,payout:4.0,desc:"A fast new chain is promising scale. The upside is large; the early execution risk is larger."},
  {id:"shib",date:"2020-08-01",until:"2021-12-31",name:"Shiba Inu launch",kind:"Meme coin",chance:.16,payout:7.0,desc:"A meme-token punt with enormous upside on paper and a strong chance of becoming worthless."}
];
const DONATION_CAMPAIGNS=[
  // The banking blockade, and the months in which Bitcoin was the answer to it.
  {id:"wikileaks",date:"2011-06-14",until:"2012-12-31",name:"WikiLeaks publishing fund",kind:"Press freedom",desc:"WikiLeaks turns to Bitcoin donations after conventional payment channels are cut off.",url:"https://wikileaks.org/donate.html"},
  // Conviction through the end of the appellate road.
  {id:"ross",date:"2015-02-04",until:"2018-06-30",name:"Ross Ulbricht legal-defense fund",kind:"Legal defense",desc:"A Bitcoin-era court case drives a public campaign for legal-defense and appellate support.",url:"https://freeross.org/"},
  // The years the independent funders were founded and were raising in order to exist at all.
  {id:"devfund",date:"2020-01-01",until:"2023-12-31",name:"Open-source Bitcoin development",kind:"Protocol resilience",desc:"Support independent work that maintains Bitcoin's open-source infrastructure.",url:"https://brink.dev/"},
  // The acute months, when the addresses were published and the need was immediate.
  {id:"ukraine",date:"2022-02-26",until:"2022-12-31",name:"Ukraine humanitarian & defense relief",kind:"Humanitarian aid",desc:"Ukraine publishes cryptocurrency donation channels as Russia's invasion creates an urgent funding need.",url:"https://donate.thedigital.gov.ua/"}
];
const STRATEGY_SECURITIES=[
  {id:"mstr",ticker:"MSTR",name:"Strategy common stock",date:"2020-08-11",base:145,btcBeta:1.65,yield:0,desc:"Equity in the operating company and its leveraged Bitcoin-treasury strategy. No stated fiat income."},
  {id:"strk",ticker:"STRK",name:"Strike preferred",date:"2025-01-31",base:100,btcBeta:.35,yield:.08,desc:"Perpetual preferred exposure designed around an 8% annual cash dividend, subject to issuer terms."},
  {id:"strf",ticker:"STRF",name:"Strife preferred",date:"2025-03-20",base:100,btcBeta:.2,yield:.10,desc:"Senior perpetual preferred exposure with a modelled 10% annual fiat dividend."},
  {id:"strd",ticker:"STRD",name:"Stride preferred",date:"2025-06-10",base:100,btcBeta:.25,yield:.10,desc:"Higher-yield preferred exposure; its payment profile is simplified here as a 10% annual fiat dividend."},
  {id:"strc",ticker:"STRC",name:"Stretch preferred",date:"2025-07-29",base:100,btcBeta:.08,yield:.09,desc:"Variable-rate preferred designed for cash income. This game models its initial 9% annual fiat yield, paid daily."}
];
/* THE OPERATOR TREE.

   Two things were wrong with it. Ten of twenty-three skills required a facility upgrade, and
   the early Energy branch needed one before its first rung - so a 2009 operator in a spare
   room could buy exactly three things, then bank points with nothing to spend them on until
   they could afford a garage. Saving with no way to spend is not a decision.

   And whole systems added since had no presence here at all: consumables, immersion, key
   custody beyond a single line, connectivity failover, outage recovery. The branches now
   follow what an operator actually does - Electronics is hands-on hardware work, Security is
   keys and firmware, Resilience is what happens when the site goes down - and the new rungs
   are weighted to the years when there was nothing to buy.

   Every skill here changes engine behaviour. A contract walks this list and fails the build
   if an id is never read by the simulation, because a skill that costs points and does
   nothing is worse than no skill at all. */
const SKILLS=[
  {id:"undervolt",branch:"Compute",name:"Undervolt",desc:"Hardware consumes 5% less power.",cost:2},
  {id:"firmware",branch:"Compute",name:"Custom firmware",desc:"Hardware produces 4% more hash.",cost:3,req:"undervolt",date:"2010-07-17"},
  {id:"procurement",branch:"Compute",name:"Direct procurement",desc:"New hardware costs 6% less.",cost:4,req:"firmware",date:"2012-01-01",minFacility:2},
  {id:"asictune",branch:"Compute",name:"ASIC autotuning",desc:"ASIC and hydro-ASIC hash rate rises 5%.",cost:5,req:"procurement",date:"2013-01-01",minFacility:3},
  {id:"immersiontuning",branch:"Compute",name:"Immersion tuning",desc:"Submerged miners clock higher still: 35% more hash instead of 25%, for the same extra power.",cost:5,req:["asictune","liquidcool"],date:"2021-01-01",minFacility:3},

  {id:"metering",branch:"Energy",name:"Smart metering",desc:"Energy costs fall 4%.",cost:2,minFacility:2},
  {id:"heat",branch:"Energy",name:"Heat reuse",desc:"Energy costs fall a further 4%.",cost:3,req:"metering",date:"2011-01-01",minFacility:2},
  {id:"capacity",branch:"Energy",name:"Power engineering",desc:"Facility electrical capacity rises 10%.",cost:4,req:"heat",date:"2012-01-01",minFacility:3},
  {id:"substation",branch:"Energy",name:"Dedicated substation",desc:"Facility electrical capacity rises a further 10%.",cost:5,req:"capacity",date:"2015-01-01",minFacility:4},
  {id:"liquidcool",branch:"Energy",name:"Liquid-cooling plant",desc:"Unlocks hydro-ASIC hardware.",cost:6,req:"substation",date:"2020-01-01",minFacility:4},
  {id:"curtailment",branch:"Energy",name:"Demand-response control",desc:"Energy costs fall a further 4%.",cost:5,req:["substation","monitoring"],date:"2020-01-01",minFacility:4},

  {id:"poolops",branch:"Operations",name:"Pool operations",desc:"Pool fees fall 0.4 percentage points.",cost:2,date:"2010-12-16"},
  {id:"monitoring",branch:"Operations",name:"Fleet monitoring",desc:"Uptime improves and connectivity incidents become less likely.",cost:3,req:"poolops",date:"2011-01-01",minFacility:2},
  {id:"fieldservice",branch:"Operations",name:"Field service technique",desc:"Repair complications happen half as often.",cost:4,req:"monitoring",date:"2014-01-01",minFacility:3},
  {id:"blocktemplate",branch:"Operations",name:"Block-template construction",req:"monitoring",desc:"Solo mining on your own node earns the block's fees as well as its subsidy.",cost:4,date:"2012-01-01"},

  /* Hands-on hardware work. Deliberately ungated: this is the branch a solo operator in a
     spare room can commit to from the first day, which is the gap the tree had. */
  {id:"benchskills",branch:"Electronics",name:"Bench repair skills",desc:"Cuts the chance of damaging a machine you are working on to 40% of its value.",cost:2,date:"2009-01-03"},
  {id:"thermalwork",branch:"Electronics",name:"Thermal discipline",req:"benchskills",desc:"A tube of thermal paste covers twice as many boards, and a dry-fitted repair fails far less often.",cost:2,date:"2009-01-03"},
  {id:"partssourcing",branch:"Electronics",name:"Parts sourcing",desc:"Every spare part costs 20% less.",cost:3,req:"benchskills",date:"2010-01-01"},
  {id:"diagnostics",branch:"Electronics",name:"Diagnostic method",desc:"An ignored fault spreads to a second part half as often.",cost:3,req:"thermalwork",date:"2010-01-01"},
  {id:"salvage",branch:"Electronics",name:"Salvage and cannibalise",desc:"Retiring a machine to storage recovers a usable fan from it.",cost:3,req:["diagnostics","partssourcing"],date:"2011-01-01"},
  {id:"supplychain",branch:"Electronics",name:"Supply-chain contacts",desc:"Spare-part orders arrive 40% sooner, supply shock included.",cost:3,req:"partssourcing",date:"2011-01-01"},
  {id:"practisedhands",branch:"Electronics",name:"Practised hands",desc:"A familiar repair can complete itself with no puzzle at all.",cost:4,req:["supplychain","fieldservice"],date:"2011-06-01"},

  /* Keys and firmware. Custody had one line in the tree while the game grew devices, key
     policies and multisig behind it. */
  {id:"backups",branch:"Security",name:"Key backups",desc:"Hot-wallet incidents become less likely.",cost:1},
  {id:"counterparty",branch:"Security",name:"Counterparty radar",desc:"Venue failures are flagged a month before they land.",cost:2,req:"backups",date:"2010-07-17"},
  {id:"multisig",branch:"Security",name:"Multisig discipline",desc:"Unlocks multi-key spending policies.",cost:4,req:"backups",date:"2012-01-01"},
  {id:"airgap",branch:"Security",name:"Air-gapped signing",desc:"Signing offline cuts the chance a key compromise reaches your coins by a further 30%.",cost:3,req:"multisig",date:"2013-01-01"},
  {id:"firmwarehygiene",branch:"Security",name:"Firmware hygiene",req:["counterparty","firmware"],desc:"Signed firmware holds for 30 months instead of 18, and an unpatched fleet is hijacked half as often.",cost:3,date:"2017-04-26"},

  /* What happens when the site goes down. */
  {id:"runbook",branch:"Resilience",name:"Incident runbook",desc:"Grid and connectivity outages are a quarter shorter.",cost:2,date:"2011-01-01"},
  {id:"spares",branch:"Resilience",name:"Critical spares inventory",desc:"Hardware failures happen half as often.",cost:4,req:"runbook",date:"2015-01-01"},
  {id:"relocation",branch:"Resilience",name:"Relocation playbook",desc:"Relocation costs 20% less.",cost:4,req:"runbook",date:"2013-01-01"},
  {id:"dualupstream",branch:"Resilience",name:"Dual upstream",desc:"A second independent route cuts connectivity incidents by a further 40%.",cost:4,req:"runbook",date:"2016-01-01",minFacility:2},
  {id:"standbypower",branch:"Resilience",name:"Standby generator",desc:"The first two days of any grid outage no longer stop the fleet.",cost:4,req:["runbook","substation"],date:"2014-01-01",minFacility:3}
];
const LEARNING=[
  {id:"cryptomailinglist",type:"Mailing list",date:"2008-10-31",title:"The Cryptography Mailing List",author:"cryptography@metzdowd.com",days:1,reward:1,desc:"Where Satoshi Nakamoto actually posted \"Bitcoin P2P e-cash paper\" on 31 October 2008, two months before the Genesis Block - the same cypherpunk-descended list a working cryptographer would already have been reading."},
  {id:"bitcoindev",type:"Mailing list",date:"2009-01-09",title:"Bitcoin-development mailing list",author:"Subscribe to the list",days:14,reward:2,check:{q:"What distinguishes this list from the general Bitcoin Talk forum?",options:["Focused, technical protocol-development discussion","It requires payment to join","It replaced Bitcoin Core entirely"],answer:0},desc:"Protocol discussion moves to a dedicated developer mailing list - hosted first on SourceForge, later the Linux Foundation, and eventually Google Groups."},
  {id:"whitepaper",type:"Paper",date:"2009-01-03",title:"Bitcoin: A Peer-to-Peer Electronic Cash System",author:"Satoshi Nakamoto",days:7,reward:1,check:{q:"What replaces a trusted third party in Bitcoin's payment system?",options:["Proof-of-work and a peer-to-peer network","A central clearing bank","A fixed exchange rate"],answer:0},desc:"Read Bitcoin's nine-page founding paper and understand the double-spend problem, proof-of-work and peer-to-peer consensus."},
  {id:"bitcointalk",type:"Forum",date:"2009-11-22",title:"Bitcoin Talk forum",author:"Read the early threads",days:10,reward:1,check:{q:"What is the main trade-off of leaving coins on an exchange?",options:["You rely on the operator's custody","Blocks stop being mined","Your wallet becomes faster"],answer:0},desc:"Learn the early culture, technical debates and hard-won operational lessons directly from the Bitcoin community."},
  {id:"mastering",type:"Book",date:"2014-12-01",title:"Mastering Bitcoin",author:"Andreas M. Antonopoulos",days:45,reward:3,check:{q:"What does a full node independently verify?",options:["Blocks and consensus rules","The BTC price","Exchange solvency"],answer:0},desc:"A technical foundation for running and securing Bitcoin infrastructure."},
  {id:"digitalgold",type:"Book",date:"2015-05-01",title:"Digital Gold",author:"Nathaniel Popper",days:32,reward:2,desc:"A history of the people, incentives and conflicts behind Bitcoin's early years."},
  {id:"bitcoinstandard",type:"Book",date:"2018-04-01",title:"The Bitcoin Standard",author:"Saifedean Ammous",days:38,reward:3,check:{q:"Which property makes a fixed supply schedule meaningful?",options:["Independent verification","A high marketing budget","A central issuer"],answer:0},desc:"A monetary-history lens on scarcity, money and Bitcoin's fixed issuance."},
  {id:"bookofsatoshi",type:"Book",date:"2014-10-01",title:"The Book of Satoshi",author:"Phil Champagne",days:24,reward:2,desc:"Primary writings and public statements from Bitcoin's earliest years."},
  {id:"layeredmoney",type:"Book",date:"2021-05-01",title:"Layered Money",author:"Nik Bhatia",days:30,reward:2,desc:"A framework for understanding monetary layers, settlement and the role of Bitcoin."},
  {id:"blocksizewar",type:"Book",date:"2021-07-01",title:"The Blocksize War",author:"Jonathan Bier",days:34,reward:3,check:{q:"What did the blocksize debate demonstrate about Bitcoin?",options:["Rule changes require broad coordination","Mining hardware sets all protocol rules","Prices set consensus"],answer:0},desc:"A detailed account of Bitcoin's scaling conflict and decentralized governance."},
  {id:"softwar",type:"Book",date:"2022-10-01",title:"Softwar",author:"Jason P. Lowery",days:28,reward:2,desc:"A provocative national-security perspective on proof-of-work and power projection."},
  {id:"priceTomorrow",type:"Book",date:"2020-01-14",title:"The Price of Tomorrow",author:"Jeff Booth",days:28,reward:2,desc:"Technology-driven deflation and the monetary friction created by debt-based money."},
  {id:"progressiveCase",type:"Book",date:"2023-04-14",title:"A Progressive's Case for Bitcoin",author:"C. Jason Maier",days:30,reward:2,desc:"A social-justice and environmental case for Bitcoin beyond partisan framing."},
  {id:"brokenMoney",type:"Book",date:"2023-08-20",title:"Broken Money",author:"Lyn Alden",days:42,reward:3,desc:"A technological history of money, monetary systems and financial freedom."},
  {id:"cryptosovereignty",type:"Book",date:"2023-08-23",title:"Cryptosovereignty",author:"Erik Cason",days:32,reward:2,desc:"Bitcoin, cryptography and the political philosophy of individual sovereignty."},
  {id:"genesisBook",type:"Book",date:"2024-01-03",title:"The Genesis Book",author:"Aaron van Wirdum",days:36,reward:3,desc:"The people, projects and ideas that inspired Bitcoin before its launch."},
  {id:"bigPrint",type:"Book",date:"2024-12-01",title:"The Big Print",author:"Lawrence Lepard",days:36,reward:3,desc:"A sound-money critique of monetary expansion and its economic consequences."},
  {id:"wbd",type:"Podcast",date:"2017-01-01",title:"What Bitcoin Did",author:"Subscribe to the feed",days:12,reward:1,desc:"Fast operator interviews and current-cycle context. Subscribe once; complete the featured episode."},
  {id:"slp",type:"Podcast",date:"2018-01-01",title:"Stephan Livera Podcast",author:"Subscribe to the feed",days:14,reward:1,check:{q:"Why can cheap electricity still be a bad mining decision?",options:["Policy and reliability can erase the saving","ASICs need no power","Hash rate sets the rent"],answer:0},desc:"A deeper technical and sovereignty-focused mining conversation."},
  {id:"audible",type:"Podcast",date:"2019-01-01",title:"Bitcoin Audible",author:"Subscribe to the feed",days:11,reward:1,desc:"Long-form readings and discussions of Bitcoin research, history and technical writing."},
  {id:"tftc",type:"Podcast",date:"2020-01-01",title:"Tales from the Crypt",author:"Subscribe to the feed",days:10,reward:1,desc:"Builder and operator interviews from the Bitcoin industry."},
  {id:"miningpod",type:"Podcast",date:"2021-01-01",title:"The Mining Pod",author:"Subscribe to the feed",days:12,reward:1,desc:"Mining-market discussion focused on fleets, energy and infrastructure."},
  {id:"podsignal",type:"Podcast",date:"2020-01-01",title:"Market Signal briefing",author:"Subscribe to the feed",days:9,reward:1,desc:"Short cycle briefings that help frame market and treasury decisions."}
];
const NODE_STORAGE=[
  {gb:50,cost:0,date:"2009-01-03",name:"50 GB disk"},
  {gb:250,cost:85,date:"2011-01-01",name:"250 GB disk"},
  {gb:1000,cost:140,date:"2014-01-01",name:"1 TB disk"},
  {gb:2000,cost:220,date:"2016-01-01",name:"2 TB disk"},
  {gb:4000,cost:360,date:"2018-01-01",name:"4 TB disk"},
  {gb:8000,cost:620,date:"2020-01-01",name:"8 TB disk"}
];
const CHAIN_GB=[["2009-01-03",.1],["2011-01-01",2],["2012-12-31",8],["2014-12-31",30],["2016-12-31",90],["2018-12-31",210],["2020-12-31",310],["2022-12-31",460],["2024-12-31",620],["2026-08-08",830]];
const NODE_MODES=[
  {id:"pruned",name:"Pruned verifier",watts:12,monthly:5,connections:8,desc:"Validates consensus with a rolling block window. Lowest cost, but no Lightning or local block-template service."},
  {id:"archival",name:"Archival node",watts:25,monthly:20,connections:16,desc:"Stores the full chain and independently supplies transactions to your operation. A dedicated deployment also supports Lightning."},
  {id:"relay",name:"Mining relay",watts:120,monthly:180,connections:64,requires:2,desc:"A hardened, high-connectivity relay stack that improves block propagation, routing income and mining reliability."}
];
const BACKUP_NODE={date:"2018-01-01",cost:2400,watts:40,monthly:90,connections:24,name:"Geographic backup node"};
const WALLET_SOFTWARE=[
  {id:"original",name:"The original client",date:"2009-01-03",desc:"The rough, all-in-one reference client - wallet, node and miner in a single command-line-flavored executable, run mostly by typing at a prompt."},
  {id:"qt",name:"Bitcoin-Qt",date:"2011-01-01",desc:"A proper GUI wallet becomes standard; by now dedicated mining software has split off entirely, matching how mining hardware itself has moved on."},
  {id:"core",name:"Bitcoin Core",date:"2014-03-19",desc:"The project renames itself Bitcoin Core, distinguishing the reference implementation from a growing ecosystem of alternative wallets and node software."},
  {id:"modern",name:"Modern Bitcoin Core",date:"2021-11-14",desc:"A fully modern, Taproot-ready release - descriptor wallets, PSBT support and a decade of hardening beyond the original client."}
];
function walletSoftwareTierAt(t){let tier=0;for(let i=WALLET_SOFTWARE.length-1;i>=0;i--){if(t>=at(WALLET_SOFTWARE[i].date)){tier=i;break}}return tier}

/* GIFT CARDS - for years this was how you actually spent bitcoin on anything. Not a payment
   terminal at the till: a website that took your coins and gave you a code for a shop that
   had never heard of bitcoin and never needed to. Gyft did it from 2013, eGifter followed,
   Bitrefill made a business of it, and for a long stretch it was the honest answer to "what
   can you buy with it".

   You get experience for spending, because you learn something by using the thing rather
   than only accumulating it. You get nothing else. The ledger keeps a note of what those
   coins would be worth now, which is its own kind of lesson and the reason anyone still
   talks about a pizza. */
const GIFT_CARD_VENDORS=[
  {id:"gyft",name:"Gyft",date:"2013-05-01",desc:"One of the first places that would take bitcoin and hand back a code for a shop that had never heard of it."},
  {id:"egifter",name:"eGifter",date:"2013-11-01",desc:"Added bitcoin during the first boom, when a lot of people were suddenly looking for something to buy."},
  {id:"bitrefill",name:"Bitrefill",date:"2015-06-01",desc:"Started with mobile top-ups and grew into the widest catalog of things you could actually pay for."},
  {id:"bitpayvisa",name:"Prepaid card top-up",date:"2016-09-01",desc:"Loads a prepaid card instead of a single retailer's code. Closest thing to simply spending it."},
];
/* Experience scales with what you spent, with heavy diminishing returns: buying a
   twenty-dollar card teaches you most of what buying a five-thousand-dollar one does. */
const GIFT_CARD_XP_BASE=14;
