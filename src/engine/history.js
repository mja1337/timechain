"use strict";

/* HISTORICAL LAYER - interpolation and protocol rules are isolated for easy replacement. */
const ANCHOR_TIMES=new WeakMap();
function anchorTime(anchor){let value=ANCHOR_TIMES.get(anchor);if(value===undefined){value=at(anchor[0]);ANCHOR_TIMES.set(anchor,value)}return value}
function upperAnchorIndex(list,time){let low=1,high=list.length-1;while(low<high){const mid=(low+high)>>1;if(anchorTime(list[mid])<time)low=mid+1;else high=mid}return low}
function interp(list,time,log=true){
  if(time<=anchorTime(list[0]))return list[0][1];
  if(time>=anchorTime(list[list.length-1]))return list[list.length-1][1];
  const i=upperAnchorIndex(list,time),a=list[i-1],b=list[i],ta=anchorTime(a),tb=anchorTime(b),t=(time-ta)/(tb-ta);
  return log&&a[1]>0&&b[1]>0?Math.exp(Math.log(a[1])+(Math.log(b[1])-Math.log(a[1]))*t):a[1]+(b[1]-a[1])*t;
}
function stepAt(list,time){if(time<=anchorTime(list[0]))return list[0][1];if(time>=anchorTime(list[list.length-1]))return list[list.length-1][1];const i=upperAnchorIndex(list,time);return anchorTime(list[i])===time?list[i][1]:list[i-1][1]}
function hashFrac(x){const s=Math.sin(x*12.9898+78.233)*43758.5453;return s-Math.floor(s)}
const priceAt=t=>t>END?futurePriceAt(t):interp(PRICE,t),hashAt=t=>t>END?futureHashAt(t):interp(HASH,t),txAt=t=>t>END?Math.round(futureTxAt(t)):Math.round(interp(TX,t)),heightAt=t=>t>END?futureHeightAt(t):(HEIGHT.length?interp(HEIGHT,t,false):Math.max(0,(t-GENESIS)/DAY*144));
/* Market capitalisation, the anchor for order-book depth. Recorded weekly through the
   cutoff; past it, capitalisation tracks the modelled price, since after 2026 over 99.5%
   of the supply is already mined and the remainder changes the total by a few percent
   across the whole continuation. */
const LAST_CAP=CAP.length?CAP[CAP.length-1][1]:0;
function marketCapAt(t){
  if(!CAP.length)return 0;
  if(t>END){const base=priceAt(END);return base>0?LAST_CAP*futurePriceAt(t)/base:LAST_CAP}
  return Math.max(0,interp(CAP,t));
}
const difficultyAt=t=>t>END?hashAt(t)*600/2**32:(DIFFICULTY.length?stepAt(DIFFICULTY,t):hashAt(t)*600/2**32);
const targetHashAt=t=>difficultyAt(t)*2**32/600;
function competitiveHashAt(t,playerHash=0){const historicalFloor=Math.max(hashAt(t),targetHashAt(t))*interp(NETWORK_COMPETITION_SCALE,t,false),responsiveFloor=Math.max(0,playerHash)*interp(NETWORK_RESPONSE,t,false);return Math.max(historicalFloor,responsiveFloor)}
function playerNetworkShareAt(t,playerHash){const competition=competitiveHashAt(t,playerHash);return playerHash>0?playerHash/(competition+playerHash):0}
function expectedBlocksPerDayForHash(hash,t=START){if(hash<=0)return 0;const recorded=hash*86400/(Math.max(1,difficultyAt(t))*2**32),competitionCap=144*playerNetworkShareAt(t,hash);return Math.min(recorded,competitionCap)}
function yieldDampingAt(t,hash){
  if(!(hash>0))return 1;
  const uncapped=hash*86400/(Math.max(1,difficultyAt(t))*2**32),modelled=expectedBlocksPerDayForHash(hash,t);
  return uncapped>0?modelled/uncapped:1;
}
function approxHeight(t){return Math.max(0,Math.floor(heightAt(t)))}
const chainSizeAt=t=>t>END?futureChainSizeAt(t):interp(CHAIN_GB,t,false);
const FUTURE_HALVING_INTERVAL=210000*600*1000;
/* Bitcoin's subsidy is an integer number of satoshis halved by integer division. Projected epochs must floor the same way, or the sandbox pays fractions of the smallest unit that can exist. */
/* Halving days are UTC days of the block that triggers them: block 840,000 was mined at 00:09 UTC on 20 April 2024, which is still the 19th in the Americas. */
const INITIAL_SUBSIDY_SATS=5000000000, RECORDED_HALVINGS=[at("2012-11-28"),at("2016-07-09"),at("2020-05-11"),at("2024-04-20")], LAST_RECORDED_HALVING=RECORDED_HALVINGS[RECORDED_HALVINGS.length-1];
function subsidyHalvingIndex(t){for(let i=0;i<RECORDED_HALVINGS.length;i++)if(t<RECORDED_HALVINGS[i])return i;return RECORDED_HALVINGS.length+Math.floor((t-LAST_RECORDED_HALVING)/FUTURE_HALVING_INTERVAL)}
function subsidySatsAt(t){const halvings=subsidyHalvingIndex(t);return halvings>=64?0:Math.floor(INITIAL_SUBSIDY_SATS/2**halvings)}
function subsidyAt(t){return subsidySatsAt(t)/1e8}
function halvingTimeAt(index){return index<=0?GENESIS:index<=RECORDED_HALVINGS.length?RECORDED_HALVINGS[index-1]:LAST_RECORDED_HALVING+FUTURE_HALVING_INTERVAL*(index-RECORDED_HALVINGS.length)}
function halvingIsProjected(index){return index>RECORDED_HALVINGS.length}
function nextHalvingTime(t){return halvingTimeAt(subsidyHalvingIndex(t)+1)}
/* A sandbox halving is real protocol behaviour on a projected date, so it announces itself as modelled rather than as recorded history. */
function announceProjectedHalving(previousSubsidy,nextSubsidy,silent){
  const was=fmtSubsidy(previousSubsidy),now=fmtSubsidy(nextSubsidy);
  log("Projected protocol halving",`Modelled, not recorded: subsidy ${was} to ${now} per block`,"reward");
  if(!silent)showToast("Projected protocol halving",`The block subsidy falls from ${was} to ${now} per block. Bitcoin's issuance schedule is real, but this date is projected from a constant ten-minute block interval, not recorded history. Review your mining margin: the same hash rate now earns half the subsidy it did yesterday.`,"notice","mine");
}
/* THE NEXT STEP UP. The list's earliest entries not yet released (several, if they share a date), so a screen can tease
   what is coming without showing everything that will ever exist. Anything already released, or with no date, is not "next". */
function nextReleases(list,t=state.time){
  const upcoming=list.filter(x=>x&&x.date&&at(x.date)>t);
  if(!upcoming.length)return[];
  const first=Math.min(...upcoming.map(x=>at(x.date)));
  return upcoming.filter(x=>at(x.date)===first);
}
/* The recorded fee rate in sat/vB on a day, median by default and the 90th percentile for the series passed, or null when
   there is no record (before the series, after the recorded history, or a bundle without it). */
function recordedFeeRate(t,series=FEERATE){return !series.length||t>END?null:Math.max(0,interp(series,t,false))}
function feeAt(t){if(t>END)return futureFeeAt(t);return FEES.length?Math.max(0,interp(FEES,t,false)):t<at("2013-01-01")?.02:t<at("2017-01-01")?.15:t<at("2020-01-01")?.35:t<at("2023-01-01")?.22:.45}
/* PROCEDURAL CONTINUATION - deterministic, pure functions of t only; never touches nextRand()/state.rng so repeated renders stay stable. */
function futureYears(t){return Math.max(0,(Math.min(t,SANDBOX_END)-END)/(DAY*365.25))}
function decayedTrend(v0,g0,gInf,halfLifeYears,years){const k=Math.LN2/halfLifeYears;return v0*Math.exp(gInf*years+(g0-gInf)/k*(1-Math.exp(-k*years)))}
function instRate(g0,gInf,halfLifeYears,years){const k=Math.LN2/halfLifeYears;return gInf+(g0-gInf)*Math.exp(-k*years)}
function halvingPhase(t){const epoch=FUTURE_HALVING_INTERVAL,anchor=at("2024-04-20");return(((t-anchor)%epoch)+epoch)%epoch/epoch}
const PRICE_G0=.22,PRICE_GINF=.03,PRICE_HALFLIFE=15,HASH_G0=.15,HASH_GINF=.02,HASH_HALFLIFE=12;
/* The cycle and the volatility below are measured from the recorded history the run has
   just replayed, not invented. Detrending each of the three complete halving epochs and
   averaging the log residual by phase gives this shape: a trough just after the halving,
   a peak about a third of the way through the epoch, a long drawdown, then a recovery
   into the next one. Its peak-to-trough span is 7.4x, where the sine it replaces was
   ±15%. Amplitude starts below the historical figure because the most recent epoch was
   already far flatter than the first, and decays as the asset matures. */
const HALVING_CYCLE_SHAPE=[-1.028,-0.372,.091,.702,.969,.702,.153,-.336,-.377,-.171,-.217,-.116];
const CYCLE_AMP0=.55,CYCLE_HALFLIFE=25;
/* Realised daily volatility fell from about 139% annualised across 2011-13 to 46% across
   2023-26. The projection continues that decay rather than holding a flat wobble. */
const VOL_ANNUAL_0=.46,VOL_ANNUAL_INF=.18,VOL_HALFLIFE=20;
function cycleShapeAt(phase){
  const n=HALVING_CYCLE_SHAPE.length,x=(((phase%1)+1)%1)*n,i=Math.floor(x),f=x-i;
  const a=HALVING_CYCLE_SHAPE[i%n],b=HALVING_CYCLE_SHAPE[(i+1)%n];
  return a+(b-a)*f;
}
/* Deterministic by construction: a pure function of the date, never of state.rng, so a
   repeated render or a reloaded save always produces the same projection. */
function futureWobble(t,years,seed){
  const monthly=VOL_ANNUAL_0*Math.exp(-years*Math.LN2/VOL_HALFLIFE)+VOL_ANNUAL_INF*(1-Math.exp(-years*Math.LN2/VOL_HALFLIFE));
  const sd=monthly/Math.sqrt(12),index=Math.floor((t-END)/(DAY*30));
  const draw=(hashFrac(index*seed)+hashFrac(index*seed*1.7+11)+hashFrac(index*seed*2.9+23)-1.5)/1.5;
  return Math.exp(draw*sd*Math.sqrt(3));
}
function futurePriceAt(t){
  const years=futureYears(t),v0=interp(PRICE,END),trend=decayedTrend(v0,PRICE_G0,PRICE_GINF,PRICE_HALFLIFE,years);
  const amplitude=CYCLE_AMP0*Math.exp(-years*Math.LN2/CYCLE_HALFLIFE);
  const cycle=Math.exp(cycleShapeAt(halvingPhase(t))*amplitude);
  return Math.max(v0*.05,trend*cycle*futureWobble(t,years,2.7));
}
function futureHashAt(t){
  const years=futureYears(t),v0=interp(HASH,END),trend=decayedTrend(v0,HASH_G0,HASH_GINF,HASH_HALFLIFE,years);
  const heat=Math.min(1,Math.max(0,(instRate(PRICE_G0,PRICE_GINF,PRICE_HALFLIFE,years)-PRICE_GINF)/(PRICE_G0-PRICE_GINF))),coupling=1+.12*heat;
  const lag=.14,amplitude=CYCLE_AMP0*Math.exp(-years*Math.LN2/CYCLE_HALFLIFE)*.35;
  const cycle=Math.exp(cycleShapeAt(halvingPhase(t)-lag)*amplitude);
  return Math.max(v0*.1,trend*coupling*cycle*futureWobble(t,years,4.1)**.4);
}
function futureFeeAt(t){const years=futureYears(t),v0=Math.max(.01,interp(FEES,END,false));return decayedTrend(v0,.05,.005,10,years)}
function futureTxAt(t){const years=futureYears(t),v0=interp(TX,END);return decayedTrend(v0,.03,.005,10,years)}
function futureHeightAt(t){return interp(HEIGHT,END,false)+Math.floor((Math.min(t,SANDBOX_END)-END)/600000)}
function futureChainSizeAt(t){const years=futureYears(t),v0=interp(CHAIN_GB,END,false),ceil=3500,k=Math.LN2/20;return v0+(ceil-v0)*(1-Math.exp(-k*years))}
function eraAt(t){return t<at("2011-01-01")?"The CPU frontier":t<at("2013-01-01")?"The GPU arms race":t<at("2017-01-01")?"ASIC industrialisation":t<at("2020-01-01")?"Global speculation":t<at("2024-01-01")?"Macro asset, sovereign question":"Institutional & geopolitical era"}
/* The same eras in a few words, for the topbar when it is too narrow for the full name (the full name stays in its tooltip). */
function eraShortAt(t){return t<at("2011-01-01")?"CPU frontier":t<at("2013-01-01")?"GPU arms race":t<at("2017-01-01")?"ASIC industry":t<at("2020-01-01")?"Global speculation":t<at("2024-01-01")?"Macro & sovereign":"Institutional era"}
const NARRATIVE_ERAS=[
  {until:"2011-01-01",label:"An unknown experiment",copy:{dashboard:"A few strangers are testing whether money can exist without an issuer. The network is fragile, liquidity is almost nonexistent, and every block you find materially helps it survive. Watch the header for cash runway more than price - there is no price yet.",mine:"Mining is still a hobbyist act of participation: your laptop and a spare CPU are the whole fleet. Keep an eye on room temperature on the live floor even here - a hot desk wears hardware faster than a cool one, long before real servicing exists to fix it.",market:"There is barely a market to observe. Bitcoin moves through forum trades and informal experiments, so conviction matters long before liquidity exists. Every dollar spent on hardware now is a bet with no exit yet.",custody:"At this stage Bitcoin is mostly keys, software and personal responsibility. Losing a wallet can matter more than any market movement - self-custody isn't a strategy yet, it's the only option.",facilities:"Your infrastructure is a desk, a wall socket and an internet connection. Reliability is personal, not industrial - the biggest cost you can control here is the internet bill, not rent.",energy:"Electricity is cheap in absolute terms because the network is tiny, but energy is already the bridge between digital rules and physical cost. A single CPU barely dents your power bill; that will not stay true.",finance:"No lender understands this activity yet. Growth comes from personal fiat, mined coins and a willingness to fund an unproven protocol - there is no project finance to draw on if you overspend.",learn:"There is no established canon - only the whitepaper, source code and conversations among early participants trying to discover what they have built. Spend early knowledge time here; it is cheap and the payoff compounds.",tech:"Every operational improvement is improvised. The useful advantage is understanding the system before specialised industries form around it - bank early skill points on fundamentals you'll lean on for the rest of the campaign."}},
  {until:"2014-01-01",label:"Price discovery and the first arms race",copy:{dashboard:"Bitcoin has acquired a price and a growing community, but remains experimental, volatile and easy to dismiss. GPUs, pools and early exchanges begin turning participation into an industry - check your settlement forecast now that bills are starting to bite.",mine:"GPU and FPGA miners professionalise the first hardware race. Hash rate is growing faster than most operators can reinvest, making efficiency a survival question - and machines run hot enough now that a fan failure is a real, not theoretical, event.",market:"A quoted price creates opportunity and fragility at once. Early exchanges make bitcoin liquid enough to trade while concentrating keys in institutions that may not endure - decide early how much you're willing to leave on a venue.",custody:"As coins become valuable, custody failures stop being theoretical. The distinction between controlling keys and holding an exchange claim becomes financially consequential - this is the moment to start moving mined coins to a wallet you actually hold.",facilities:"Heat, noise and circuit limits push mining out of bedrooms. The operation begins to need deliberate ventilation, wiring and a place in the physical world - a cheap box fan from the cooling shop now is far less painful than a fault later.",energy:"Power cost starts separating profitable miners from enthusiastic amateurs. A few cents per kilowatt-hour can decide who survives the next difficulty increase - this is when it's worth comparing regions instead of just running hardware and hoping.",finance:"Bitcoin can now be sold for working capital, but credit remains scarce and counterparties are primitive. Treasury discipline matters more than financial engineering - build a cash buffer before leaning on mined coins to cover a bill.",learn:"Forums are documenting attacks, mistakes and new business models in real time. Learning quickly can prevent expensive lessons from being learned through loss - a knowledge check now is cheaper than an exchange failure later.",tech:"Pools, GPUs and early custody practices create the first real operating playbooks. Technical competence is becoming an economic moat - Compute and Operations skills both start paying for themselves here."}},
  {until:"2017-01-01",label:"Industrialisation and hard lessons",copy:{dashboard:"ASICs, exchange failures and a rising global network have ended the innocence of the hobby era. Bitcoin survives institutional collapse by continuing to produce valid blocks - your own operation now needs the same resilience: watch condition and faults on the Mine floor, not just hash rate.",mine:"Purpose-built silicon makes yesterday's hardware obsolete with brutal speed. Mining is becoming a capital-intensive competition in procurement, uptime and joules per hash - and for the first time individual hashboards, power PCBs and fans fail on their own, each needing its own targeted repair rather than one generic fix.",market:"Liquidity is deeper, but Mt. Gox demonstrates that a large balance on a famous venue can still disappear. The asset survives even when its intermediaries fail - treat every exchange balance as a claim, not a holding.",custody:"Self-custody is no longer a philosophical preference; it is a defence against demonstrated counterparty failure. Running a node separates verification from trust - if you haven't moved coins off an exchange yet, Mt. Gox is the reason to do it now.",facilities:"Three-phase power, airflow and repair logistics now matter as much as raw machine count. A mining site is becoming an engineered system - this is where hiring a field technician starts paying for itself, buying back the hours you would otherwise spend on the bench yourself.",energy:"Industrial miners search globally for stranded and low-cost power. Cheap energy offers advantage only when policy, grid access and connectivity remain dependable - check the energy tariff desk before assuming a lower rate is free money.",finance:"Mining expansion demands serious fiat, yet borrowing against a volatile and poorly understood business can turn growth into forced failure - keep enough liquid cash to survive a bad month before drawing project finance.",learn:"The ecosystem is converting crisis into doctrine: verify independently, secure keys, distrust concentrated custody and understand the incentives beneath the software - these lessons map directly onto the custody and maintenance choices you're making right now.",tech:"Operational maturity now spans firmware, monitoring, storage and security. The winners are building repeatable systems rather than assembling faster machines alone - Operations skills that cut repair time and outage risk are worth as much as raw hash upgrades here."}},
  {until:"2021-01-01",label:"A global monetary network",copy:{dashboard:"Bitcoin has survived civil war, bubbles and repeated obituaries. It is becoming global settlement infrastructure, while mining consolidates into professional fleets and large pools - and unpatched ASIC firmware is now a real risk to your reward, not a footnote.",mine:"The S9 era proves that well-run hardware can remain useful across cycles. Scale helps, but efficiency, maintenance and access to power decide who compounds - a fleet this size needs a real parts inventory, not spare fans bought one at a time.",market:"Bitcoin now trades around the clock across a global market. Liquidity improves access while leverage and custodial concentration create new systemic risks - bigger balances mean a venue freeze or failure now costs a lot more than it used to.",custody:"Hardware wallets, mature nodes and multisignature practices make sovereignty more usable. The remaining question is whether convenience will tempt users back into trusted claims - multisig is worth unlocking here if your hot wallet has grown with your fleet.",facilities:"Warehouses and international mining regions connect Bitcoin to grids, logistics and political jurisdictions. Location becomes a portfolio of risks rather than a cheap tariff - a relocation now is a real capital decision, not a click.",energy:"Mining is now an energy business with a monetary output. Flexible demand and stranded power create opportunities, while inefficient fleets are exposed at every downturn - this is where a curtailment or spot contract can start beating a flat tariff.",finance:"Professional operators can raise capital, but debt service does not care about hashprice. Liquidity reserves determine whether volatility becomes opportunity or insolvency - model your runway before taking on project finance at this scale.",learn:"A deeper body of technical, monetary and historical work is forming. Understanding Bitcoin now means connecting consensus, custody, incentives and monetary history - the knowledge slot is worth keeping busy as skill costs climb.",tech:"The frontier shifts from simply owning ASICs to running them better: monitoring, firmware, power engineering and resilient treasury operations - patch firmware on schedule from here on, or an unpatched fleet quietly bleeds reward to an attacker."}},
  {until:"2024-01-01",label:"Sovereign stress and institutional adoption",copy:{dashboard:"Companies and states now treat Bitcoin as a treasury, policy and energy question. It acts as both a risk asset and an escape route when banks, currencies or borders become restrictive - your settlement forecast matters more than ever when energy shocks can hit without warning.",mine:"Nation-scale hash rate and supply shocks make mining a geopolitical industry. Operators must survive crackdowns, energy crises and a subsidy that keeps shrinking - a fleet this large needs disciplined servicing, or faults compound faster than one technician crew can clear them.",market:"Institutional balance sheets enter the market just as leverage failures expose familiar counterparty risks. Bitcoin's price can collapse while its settlement rules continue unchanged - a market crash tests your cash runway, not your conviction.",custody:"The case for controlling keys sharpens during freezes, failures and political stress. Bitcoin can provide an exit from financial intermediaries only when the holder can actually move it - this is a bad era to leave meaningful BTC sitting on a venue.",facilities:"Mining migrates across continents in response to bans, grid constraints and new power markets. Mobility and jurisdictional resilience become core infrastructure - insurance against a forced relocation starts to look cheap next to the alternative.",energy:"Energy shocks can erase apparently safe margins overnight. Fixed supply meets variable power markets, forcing operators to treat contracts and curtailment as strategic tools - a fixed-price PPA earns its premium the first time a shock hits.",finance:"Cheap capital can build enormous fleets, but leverage magnifies every fall in hashprice. Fiat collateral and cash runway are now as important as installed machines - check the financing exposure desk before a downturn, not after.",learn:"The debate expands from code into macroeconomics, human rights, energy systems and state power. Competing interpretations reveal what different users need Bitcoin to be - the knowledge you bank here pays off in judgment, not just skill points.",tech:"Resilience becomes the objective: relocation, hardened nodes, responsive load and robust custody must work together when external systems fail - this is the era to finish the Operations and Treasury skills you've been postponing."}},
  {until:null,label:"Institutional asset, permissionless escape valve",copy:{dashboard:"Bitcoin now sits inside ETFs, corporate treasuries and national debates, yet the base network remains open to anyone with keys and a connection. Its institutional scale and permissionless exit function coexist in tension - your own header still separates self-held BTC from everything else for exactly this reason.",mine:"Mining is a global energy and infrastructure industry defending an increasingly valuable settlement network. Margins are thin, capital is sophisticated and operational mistakes are unforgiving - at this scale, a well-staffed technician crew and a stocked parts inventory are the difference between a fault and an outage.",market:"Brokerage products make price exposure ordinary, but an ETF share is not spendable bitcoin. The market now offers many wrappers around an asset whose distinctive property is settlement without permission - know which of your holdings actually count as BTC before relying on them.",custody:"Institutions broaden access while self-custody preserves the escape valve. The difference between owning exposure and possessing transferable bearer money has never been clearer - your final score only counts what your own keys control.",facilities:"Utility-scale campuses compete for power, grid services and political legitimacy. Mining can monetise flexible demand, but every megawatt deepens regulatory and capital exposure - a facility this size lives or dies on the operational risk desk, not the building itself.",energy:"At scale, the operation lives or dies by energy engineering. Grid participation, curtailment, heat, density and long-term contracts shape the economics more than headline machine speed - cooling capacity is now as strategic a purchase as the miners themselves.",finance:"Bitcoin-linked securities and fiat credit broaden the capital stack, but they also reintroduce issuers, covenants and settlement risk. Liquidity remains the defence against forced dependence - treat Strategy-linked equities as fiat exposure, not a BTC substitute.",learn:"The curriculum now spans protocol engineering, monetary theory, market structure and geopolitics. The task is to distinguish Bitcoin's verified properties from the stories institutions build around it - the Method tab is the fastest way to check a claim against what the simulation actually does.",tech:"Mature operations construct block templates, run hardened relays and integrate power, treasury and custody systems. Sophistication should strengthen independent verification rather than replace it - by now, unspent skill points are a rounding error next to keeping the fleet serviced and the reserve funded."}}
];
function narrativeEra(t=state.time){return NARRATIVE_ERAS.find(era=>!era.until||t<at(era.until))||NARRATIVE_ERAS[NARRATIVE_ERAS.length-1]}
function narrativeCopy(kind,t=state.time){const era=narrativeEra(t);return era.copy[kind]||era.copy.dashboard}
function energyShock(t){return t>=at("2022-02-24")&&t<at("2023-07-01")?1.65:t>=at("2020-03-12")&&t<at("2021-01-01")?.88:1}
function faucetActive(t){return t>=FAUCET_START&&t<FAUCET_END}
function faucetAmount(t){const f=Math.min(1,Math.max(0,(t-FAUCET_START)/(FAUCET_END-FAUCET_START)));return Math.max(.05,5-f*4.9)}
