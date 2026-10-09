"use strict";

/* GLOSSARY - the canonical terminology in plain English. Every entry defines the term
   by what it changes for the player, then points at the Method chapter that carries the
   formula, edge cases and modelling assumptions. `aka` exists so a search for an
   abbreviation, an expansion or a common synonym all find the same entry. */
const GLOSSARY=[
  {term:"Bitcoin",aka:["btc network","protocol"],anchor:"method-start",def:"The network and protocol. Capitalised when you mean the system; lowercase when you mean units of the currency."},
  {term:"BTC",aka:["bitcoin","coins"],anchor:"method-start",def:"A displayed amount of bitcoin. Mining pays you in BTC; your bills are due in cash, so BTC has to be sold before it can pay for anything."},
  {term:"Satoshi",aka:["sat","sats"],anchor:"method-sandbox",def:"The smallest unit Bitcoin can express: one hundred-millionth of a BTC. Nothing in the simulation ever pays a fraction of one."},
  {term:"Mining",aka:["hashing","proof of work"],anchor:"method-mining",def:"Using computation to compete for the right to add the next block. Winning pays a block reward; competing costs electricity whether you win or not."},
  {term:"Hash rate",aka:["hashrate","h/s","mh/s","th/s","ph/s","eh/s"],anchor:"method-mining",def:"How much mining work a machine performs each second. More hash rate improves your chance of earning a reward, and raises your electricity bill."},
  {term:"Network difficulty",aka:["difficulty"],anchor:"method-mining",def:"How hard the network currently makes it to find a block. It adjusts roughly every 2,016 blocks, and as it rises the same machine earns less."},
  {term:"Block",aka:["block height"],anchor:"method-mining",def:"A batch of confirmed transactions added to the chain about every ten minutes. Block height is how many have been added since the start."},
  {term:"Block reward",aka:["reward"],anchor:"method-mining",def:"What the winner of a block receives: the subsidy plus the transaction fees in that block. The two parts move independently."},
  {term:"Block subsidy",aka:["subsidy","issuance"],anchor:"method-mining",def:"The newly created bitcoin paid for a block. It halves on a fixed schedule and is the larger part of mining income for now."},
  {term:"Transaction fees",aka:["fees","fee market"],anchor:"method-mining",def:"What users pay to have transactions included in a block. Fees go to whoever mines the block, and grow in importance as the subsidy shrinks."},
  {term:"Halving",aka:["halvening"],anchor:"method-sandbox",def:"The scheduled event, every 210,000 blocks, that cuts the block subsidy in half. The same hash rate earns half the subsidy from that block onward."},
  {term:"Solo mining",aka:["solo"],anchor:"method-mining",def:"Mining independently. You keep the whole reward when you find a block, but you may go a very long time without finding one."},
  {term:"Mining pool",aka:["pool"],anchor:"method-mining",def:"A service that combines many operators' work and shares the rewards. Payouts are smaller, far steadier and reduced by a fee."},
  {term:"Payout scheme",aka:["scheme"],anchor:"method-mining",def:"The rule a pool uses to decide what your work is worth. It changes reward timing and variance, never your physical hash rate."},
  {term:"FPPS",aka:["full pay per share","full pay-per-share"],anchor:"method-mining",def:"Full pay per share. A flat rate per share covering both the subsidy and an average of transaction fees, paid whether or not the pool finds a block."},
  {term:"PPS",aka:["pay per share","pay-per-share"],anchor:"method-mining",def:"Pay per share. A flat rate on the subsidy only - transaction fees stay with the pool. That matters more as fees grow."},
  {term:"PPS+",aka:["ppsplus","pps plus"],anchor:"method-mining",def:"A flat rate on the subsidy plus a share of the fees the pool actually collected, so fee income varies while subsidy income does not."},
  {term:"PPLNS",aka:["pay per last n shares"],anchor:"method-mining",def:"Pay per last N shares. You are paid only when the pool finds a block, from a window of recent work, so earnings are lumpier but the pool takes less risk."},
  {term:"TIDES",aka:["transparent index of decaying exponential shares"],anchor:"method-mining",def:"A modern variant of the pay-per-last-N-shares idea using a decaying window of recent work, published so participants can audit it."},
  {term:"Share",aka:["shares"],anchor:"method-xp",def:"A unit of proven mining work below the difficulty needed for a real block. Shares are how a pool measures your contribution."},
  {term:"ASIC",aka:["application-specific integrated circuit","application specific"],anchor:"method-hardware",def:"A chip built to do nothing but mine Bitcoin. It cannot be repurposed, which is why obsolete ASICs lose value so sharply."},
  {term:"Power draw",aka:["watts","w","kw","input power","nameplate"],anchor:"method-energy",def:"How much electricity a machine pulls while it runs, in watts or kilowatts. It sets both your energy bill and how much of the site's supply the machine occupies."},
  {term:"J/TH",aka:["joules per terahash","efficiency","j/th","joules"],anchor:"method-hardware",def:"Joules per terahash: how much energy a machine spends for a fixed amount of mining work. Lower is better, and it is the number that decides which generation still earns once electricity is priced in."},
  {term:"All-in rate",aka:["effective rate","electricity rate","tariff"],anchor:"method-energy",def:"What you actually pay per kilowatt-hour once the regional tariff, your power contract, historical energy shocks, efficiency skills and the site's load-density penalty are applied."},
  {term:"Reward variance",aka:["variance","lumpiness","payout timing"],anchor:"method-mining",def:"How unevenly your mining income arrives. Solo mining has the same expected return as a pool and far higher variance: the same BTC, in rarer and larger pieces."},
  {term:"Bid and ask",aka:["bid","ask","spread","quote"],anchor:"method-market",def:"The bid is what a venue pays you to sell; the ask is what it charges you to buy. The gap between them, plus the venue fee, is the cost of using that venue."},
  {term:"Knowledge",aka:["learning","study","research"],anchor:"method-progression",def:"What completed learning activities accumulate. Crossing a knowledge threshold awards a skill point, which Tech spends on a lasting capability."},
  {term:"Condition",aka:["health","wear"],anchor:"method-maintenance",def:"Gradual equipment health from 0–100%. Falling condition raises the chance of a fault; it is not itself a fault."},
  {term:"Fault",aka:["failure","broken part"],anchor:"method-maintenance",def:"A specific failed component on a specific machine. A faulted machine cannot contribute its full hash rate until the part is replaced."},
  {term:"Commissioning",aka:["commission","install"],anchor:"method-hardware",def:"The work that turns a delivered machine into a mining one. Until it is commissioned it earns nothing, though its capacity is already reserved."},
  {term:"Electrical capacity",aka:["power capacity","kw cap","headroom"],anchor:"method-facilities",def:"How much power the site can supply. Your running machines cannot draw more than this, no matter how much floor space is free."},
  {term:"Floor capacity",aka:["space","floor space"],anchor:"method-facilities",def:"Physical room for machines at the site. A site can run out of floor space while power is still available, and the reverse."},
  {term:"kW and kWh",aka:["kilowatt","kilowatt hour","kw","kwh"],anchor:"method-energy",def:"A kilowatt is how fast a machine draws power; a kilowatt-hour is how much it has used. You buy hardware by the kilowatt and pay for it by the kilowatt-hour."},
  {term:"PPA",aka:["power purchase agreement"],anchor:"method-energy",def:"Power purchase agreement. A contracted electricity rate, usually cheaper than the standard tariff in exchange for commitment."},
  {term:"Liquid cash",aka:["liquid fiat","cash"],anchor:"method-treasury",def:"Fiat you can spend right now. It is the only thing that can pay an operating bill without selling something first."},
  {term:"Illiquid fiat",aka:["equities","securities","etf"],anchor:"method-treasury",def:"Fiat-priced holdings such as ETF or Strategy positions. They count toward net worth but must be sold before they can pay a bill."},
  {term:"Starting Liquidity",aka:["starting cash","starting capital"],anchor:"method-reference",def:"The pre-run control that sets how much liquid cash the operation opens with. It changes nothing else about the campaign."},
  {term:"Cash runway",aka:["runway"],anchor:"method-treasury",def:"How many months your current liquid cash covers at current recurring costs. Under three months, expansion is usually the wrong move."},
  {term:"Operating bill",aka:["bill","settlement","monthly bill"],anchor:"method-treasury",def:"The monthly settlement of your recurring costs - electricity, rent, internet, payroll, insurance and finance interest - paid from liquid cash."},
  {term:"Project loan",aka:["finance","borrowing","debt"],anchor:"method-finance",def:"Borrowed cash secured against your unencumbered fiat and recent revenue. It accrues daily interest and enlarges every future bill."},
  {term:"Receivership",aka:["insolvency","seizure"],anchor:"method-finance",def:"What happens when a bill cannot be met by any other route: assets are seized to cover it, mining stops, and the run records a strike."},
  {term:"Hot wallet",aka:["hot"],anchor:"method-custody",def:"A wallet whose keys sit on a device that is connected to the internet. Convenient to spend from, and the exposed surface in most historical thefts."},
  {term:"Cold storage",aka:["cold wallet","cold"],anchor:"method-custody",def:"Keys kept off any connected device. Slower to move, and the reason a compromised machine does not have to mean a lost balance."},
  {term:"Self-custody",aka:["private key","keys","own keys"],anchor:"method-custody",def:"Holding the keys that control your bitcoin yourself. Whoever holds the keys decides who can spend, regardless of whose name is on the account."},
  {term:"Custodial balance",aka:["custodial btc","exchange balance","counterparty"],anchor:"method-custody",def:"BTC or a claim held for you by an exchange or custodian. It is a promise to pay, not bitcoin you control."},
  {term:"Full node",aka:["node","bitcoin core"],anchor:"method-custody",def:"Software that independently checks every rule of the network for itself. It verifies what you are told; it does not hold keys or create rewards."},
  {term:"Lightning liquidity",aka:["lightning","channel","routing"],anchor:"method-custody",def:"BTC committed to Lightning payment channels. It earns routing fees, and it is locked until the channels are closed - it is not interest or yield."},
  {term:"Operator XP",aka:["xp","experience","level"],anchor:"method-xp",def:"Experience earned from sustained mining work, best-share records, deployments and repairs. Levels grant skill points."},
  {term:"Operator Score",aka:["score","final score"],anchor:"method-xp",def:"The 1,000-point end-of-run assessment. Most of it comes from how well you operated in each historical era, not from the size of your final balance."},
  {term:"Recorded",aka:["recorded data","historical record","real"],anchor:"method-sources",def:"A value taken directly from the bundled historical dataset. Recorded values never change during a run."},
  {term:"Derived",aka:["interpolated","derived value"],anchor:"method-sources",def:"A value calculated from recorded inputs - usually by interpolating between two recorded anchors. Accurate at the anchors, an estimate between them."},
  {term:"Modelled",aka:["modeled","simulated","assumption"],anchor:"method-sources",def:"A gameplay assumption rather than a historical fact. Hardware pricing, incidents, uptime and everything after the historical cutoff are modelled."},
  {term:"Procedural sandbox",aka:["sandbox","continuation","post-2026"],anchor:"method-sandbox",def:"The optional 100-year continuation past the recorded history. No new events or hardware are invented; price, network and fee data become deterministic projections."}
];
function glossaryEntries(query=""){
  const needle=String(query||"").trim().toLowerCase();
  if(!needle)return GLOSSARY;
  return GLOSSARY.filter(entry=>glossarySearchKey(entry).includes(needle));
}
function glossarySearchKey(entry){return [entry.term,...(entry.aka||[]),entry.def].join(" ").toLowerCase()}
