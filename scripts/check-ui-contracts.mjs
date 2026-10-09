import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("src/styles/app.css", root), "utf8");
const appScripts = [...html.matchAll(/<script src="(src\/[^"?]+\.js)(?:\?v=[^"]*)?"><\/script>/g)].map(match => match[1]);
const inline = (await Promise.all(appScripts.map(file => readFile(new URL(file, root), "utf8")))).join("\n");
const engineModules = (await readdir(new URL("src/engine/", root))).filter(name => name.endsWith(".js"));
const simulationSource = await readFile(new URL("src/engine/simulation.js", root), "utf8");
const buildSource = await readFile(new URL("scripts/build-historical-data.mjs", root), "utf8");
const renderSource = await readFile(new URL("src/ui/render.js", root), "utf8");
const renderQueueSource = await readFile(new URL("src/engine/render-queue.js", root), "utf8");
const operatorSource = await readFile(new URL("src/engine/operator.js", root), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const modeStart = inline.indexOf("const STARTING_MODES=[");
const modeEnd = inline.indexOf("\n];", modeStart) + 3;
assert(modeStart >= 0 && modeEnd > modeStart, "STARTING_MODES could not be extracted");
const modeContext = {};
const timelineSource = await readFile(new URL("src/config/timeline.js", root), "utf8");
vm.runInNewContext(timelineSource, modeContext);
vm.runInNewContext(inline.slice(modeStart, modeEnd).replace("const STARTING_MODES", "var STARTING_MODES"), modeContext);
assert(JSON.stringify(modeContext.STARTING_MODES.map(({ id, start }) => [id, start])) === JSON.stringify([
  ["easy", 1230940800000],
  ["medium", 1233619200000],
  ["hard", 1359417600000],
  ["impossible", 1735689600000],
]), "Campaign start-date options changed unexpectedly");

const helperNames = ["fmtUsd", "fmtBtc", "fmtCompactNumber", "fmtCompactUsd"];
const helperSource = inline.split(/\r?\n/).filter(line => helperNames.some(name => line.startsWith(`function ${name}(`))).join("\n");
const helperContext = { Intl, Number, Math };
vm.runInNewContext(helperSource, helperContext);
assert(helperContext.fmtUsd(Number.NaN) === "-", "Invalid USD values must not be displayed as zero");
assert(helperContext.fmtUsd(0.0004) === "$0.0004", "Tiny USD values lost precision");
assert(helperContext.fmtBtc(0.000000001) === "<0.00000001 BTC", "Sub-satoshi BTC values must not be displayed as zero");
assert(helperContext.fmtCompactUsd(0.004) !== "$0", "Compact USD formatting rounded a non-zero value to zero");

assert(inline.includes("STARTING_LIQUIDITY_MIN=1500") && inline.includes("STARTING_LIQUIDITY_MAX=1500000"), "Starting Liquidity limits are missing or incorrect");
assert(inline.includes("data-starting-cash") && inline.includes("Starting Liquidity"), "Starting Liquidity controls are missing");
assert(inline.includes("state.cash=liquidity;state.startingCash=liquidity"), "The selected Starting Liquidity is not applied when a run begins");
const introStart = inline.indexOf("const INTRO_SLIDES=[");
const introEnd = inline.indexOf("\n];", introStart) + 3;
const introContext = {};
vm.runInNewContext(inline.slice(introStart, introEnd).replace("const INTRO_SLIDES", "var INTRO_SLIDES"), introContext);
assert(introContext.INTRO_SLIDES.length === 1, "Opening must reach play without a slideshow");
assert(inline.includes('introDifficulty="medium"') && inline.includes('Customise your run'), "Opening must default to the Standard 2009 start and retain custom starts");
assert(inline.includes('id:"first-work"') && inline.includes('id:"first-month"'), "First month needs work and completion guidance");
assert(inline.includes('data-action="wallet-demo"'), "Wallet education must remain available after starting");
assert(inline.includes("guidance:{dismissed:[]}") && inline.includes("state.guidance=Object.assign({dismissed:[]}") && inline.includes('if(a==="dismiss-guidance")'), "Save-compatible Operator briefing dismissals are missing");
assert(inline.includes("function operatorBriefing()") && inline.includes("Operator briefing ·") && inline.includes("Recommended next step") && inline.includes("New to Bitcoin mining? Start with these terms"), "The state-aware newcomer Operator briefing is incomplete");
assert(inline.includes('if(state.pendingSettlement)return""') && inline.includes('id:"grid-arrears"') && inline.includes('id:"high-temperature"') && inline.includes('id:"open-faults"') && inline.includes('id:"capacity-pressure"') && inline.includes('id:"first-run"') && inline.includes('id:"first-bill"') && inline.includes('id:"first-upgrade"') && inline.includes('id:"pool-available"') && inline.includes('id:"low-runway"'), "Operator briefing priority states are incomplete");
assert(inline.includes("A Bitcoin wallet manages private keys") && inline.includes("Do not use this key for real bitcoin"), "Wallet setup is missing its newcomer purpose or safety explanation");
assert(inline.includes('data-action="starting-mode"'), "Difficulty controls are missing");
assert(inline.includes("Starting difficulty"), "Method is missing difficulty documentation");
assert(inline.includes("Transaction sizing and procurement"), "Method is missing transaction documentation");
assert(inline.includes('if(a==="starting-mode")'), "Difficulty action is not handled");
assert(inline.includes("transactionPreviewValid(preview)"), "Invalid transaction quotes are not blocked");
assert(inline.includes("function enhanceActiveTab()") && inline.includes("const enhancer=TAB_ENHANCERS[activeTabKey()];"), "Tab enhancement must be dispatched from one place that always runs");
assert(/document\.getElementById\("app"\)\.innerHTML=`[\s\S]*?\n  enhanceActiveTab\(\);/.test(renderSource), "The enhancer has to run in the same task as the markup it completes: deferring it to a timeout meant any repaint landing in the gap cancelled it, and nothing retried");
assert(!inline.includes("function deferEnhancement("), "The deferred-enhancement helper is what left the Mine tab half-built; it should not come back");
assert(!/deferEnhancement\(revision/.test(inline), "A tab enhancer is being deferred again");
assert(inline.includes('class="card span-12 exchange-balance-desk"'), "Market exchange-balance summary is missing");
assert(inline.includes('class="span-12 facility-grid facility-options"'), "Facilities choices do not have a stable ordering target");
assert(inline.includes('if(command&&facilityOptions)command.insertAdjacentElement("afterend",facilityOptions)'), "Facility choices are not placed directly below the current-facility command");
assert(inline.includes("Math.min(900,Math.max(240,Math.ceil(days/7)+1))"), "Historical charts are not using capped weekly-or-better sampling");
assert(inline.includes('"dashboard","mine","pools","treasury","facilities"'), "Pools is not a standalone navigation destination, or the Treasury has gone from the navigation");
assert(inline.includes('if(activeTab==="pools")return pools()'), "Pools page is not routed");
assert(inline.includes('id:"bch"') && inline.includes('id:"bsv"'), "BCH and BSV fork-risk actions are missing");
// The introduction's kickers used to be pinned as literal strings here. What that guarded is
// now guarded properly above, by what the introduction must TELL a new player rather than by
// the words it happens to use to do it.
assert(inline.includes("const INTRO_SLIDES=["), "The first-run introduction is missing entirely");
assert(inline.includes('class="mobile-pause-button') && inline.includes('class="mobile-speed-panel"'), "Mobile simulation controls are missing");
assert(inline.includes('data-action="mobile-menu-section"') && inline.includes('mobileMenuSection="play"'), "Mobile navigation is not grouped into first-tap sections");
assert(css.includes('.mobile-menu-sections{display:grid;grid-template-columns:repeat(4') && css.includes('.mobile-nav-tabs{display:grid;grid-template-columns:repeat(4'), "Mobile secondary navigation is not condensed for small screens");
assert(css.includes("#dashboard-mempool{overflow:hidden}") && css.includes(".mp-chain{width:100%;flex:0 0 auto"), "Mobile mempool containment rules are missing");
assert(inline.includes('const tickerBtc=value=>fmtBtc(value).replace(/ BTC$/,'), "Ticker BTC values still include a redundant unit suffix");
assert(css.includes(".tick{min-width:115px;overflow:hidden") && css.includes("text-overflow:ellipsis"), "Ticker values can spill into adjacent cards");
assert(inline.includes("retired=state.decommissionedHardware?.[id]||0") && inline.includes("retired=state.decommissionedHardware?.[h.id]||0"), "Miner sale controls do not consistently use retired inventory");
// The laptop stands on a desk rather than a rack. Matched on the class the floor emits
// rather than the whole expression, which moved when the batch model was extracted.
assert(inline.includes("function facilityDeskSvg()") && /floor-miner \$\{b?\.?status\}[^`]*laptop-desk/.test(inline),
  "Mining facilities no longer retain the laptop desk visual");
assert(css.includes('.tier-1 .floor-units,.tier-2 .floor-units{left:28px') && css.includes('.floor-miner.laptop-desk{position:absolute'), "Home-office miners are not arranged around the laptop desk and shelves");

const optionsStart = inline.indexOf("function hardwareQuantityOptions(");
const optionsEnd = inline.indexOf("\nfunction hardwareBuyControls(", optionsStart);
assert(optionsStart >= 0 && optionsEnd > optionsStart, "Mine purchase-option helper could not be extracted");
const optionsContext = { Number, Math, Set, fmtCompactNumber: (n) => String(n) };
vm.runInNewContext(inline.slice(optionsStart, optionsEnd), optionsContext);
for (const [maximum, expected] of [[0, [1]], [1, [1]], [2, [1, 2]], [5, [1, 2, 5]], [6, [1, 2, 5, 6]], [10, [1, 2, 5, 10]], [100, [1, 2, 5, 10, 100]], [150, [1, 2, 5, 10, 100, 150]]]) {
  const actual = optionsContext.hardwareQuantityOptions(maximum).map(option => option.qty);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `Mine purchase quantities are wrong for a maximum of ${maximum}`);
  assert(new Set(actual).size === actual.length, `Mine purchase quantities contain duplicates for a maximum of ${maximum}`);
}
const controlsStart = inline.indexOf("function hardwareBuyControls(");
// Bounded by the next top-level function rather than by `mine()` specifically: this is meant
// to read hardwareBuyControls alone, and naming the neighbour made it silently swallow
// anything later inserted between the two.
const controlsEnd = inline.indexOf("\nfunction ", controlsStart + 1);
const controlsSource = inline.slice(controlsStart, controlsEnd);
assert((controlsSource.match(/<button/g) || []).length === 1, "A Mine card's unified buy control should render exactly one button");
assert(controlsSource.includes("data-hardware-qty") && controlsSource.includes("data-hardware-currency"), "Mine buy control is missing the quantity or currency selector");

assert(inline.includes("internet:45"), "Starter NA region internet bill is not the era-accurate residential figure");
// DEAD SKILLS - a skill the engine never reads is a point sink whose description lies about
// what it buys. "Key backups - self-custody security rises materially" and "Counterparty
// radar - custody warnings arrive earlier" both shipped that way, referenced nowhere but
// their own definitions and each other's prerequisite. This is a reference check rather than
// a pinned expression: it asks whether the id is consulted at all, not how.
{
  const skillIds = [...inline.matchAll(/\{id:"([a-z]+)",branch:"/g)].map(m => m[1]);
  assert(skillIds.length > 20, "the skill roster could not be read");
  const dead = skillIds.filter(id => {
    const reads = new RegExp(`(hasSkill\\("${id}"\\)|skills\\??\\.includes\\("${id}"\\)|requires==="${id}"|requires:"${id}")`);
    return !reads.test(inline);
  });
  assert(dead.length === 0, `these skills cost points but the engine never reads them: ${dead.join(", ")}`);
}

// SECOND-HAND HARDWARE - purchase prices used to be flat forever while resale depreciated, so
// the newest machine won on payback, hash-per-dollar and hash-per-watt at every date in every
// region, and a decade-old machine cost full list to buy but sold for 4% of it.
assert(inline.includes("function hardwareMarketFactor("), "Hardware price depreciation is missing");
// Depreciation is asserted behaviourally: prices must fall after release, resale must never
// exceed purchase, the newest machine must win on dear power and an old one on cheap power.
assert(inline.includes("h.cost*hardwareMarketFactor(h)*(hasSkill(\"procurement\")"),
  "hardwareUnitCost no longer prices against the market, so old hardware costs list price again");
assert(inline.includes("function incomingConditionFor("),
  "Used hardware arrives in mint condition, which a years-old machine is not");
assert(/incomingConditionFor[\s\S]{0,200}Math\.max\(70/.test(inline),
  "Incoming condition is not floored above the 65% threshold that takes a type offline");
assert(inline.includes("const RESALE_HAIRCUT=.65") && inline.includes("h.cost*hardwareMarketFactor(h)*RESALE_HAIRCUT"),
  "Resale is priced independently of purchase again, which allows buying a machine and reselling it for more");
assert(inline.includes("state.hardwareGlut&&t<state.hardwareGlut.until?1-state.hardwareGlut.discount:1"),
  "A liquidation glut no longer reaches the purchase price, so it only ever punishes the player");
assert(inline.includes("method-secondhand"), "Method does not document second-hand hardware pricing");

// DEMAND RESPONSE - a curtailment contract is paid for the capacity it releases. Without the
// credit the contract was strictly worse than every other in every month of the campaign, and
// the game shipped a chapter about an operation whose economics are exactly this payment.
assert(inline.includes("function curtailmentCreditDaily("), "The demand-response credit is missing");
assert(inline.includes("function curtailmentIntensityAt("),
  "Curtailment intensity is not a pure function of time, so the tariff desk cannot price an unselected contract");
// Curtailment calibration is asserted behaviourally: it must deepen under a shock, must pay
// for released capacity, and must never drive the operating bill negative.
assert(inline.includes('state.contract==="curtail"?1-curtailmentIntensity():1'),
  "Curtailment load is a flat duty cycle again rather than tracking the energy shock");
assert(inline.includes("-curtailmentCreditDaily(minerWatts,next,r)"),
  "The daily operating bill does not receive the demand-response credit");
assert(inline.includes("creditFor=c=>c.id===\"curtail\""),
  "The energy tariff desk quotes curtailment without its credit, so contracts cannot be compared");
assert(inline.includes("method-demand-response"), "Method does not document demand response");

// TROUBLE HAS TO BE VISIBLE. A machine that needs a decision pulses; one that is simply
// switched off does not, because that is a decision already made. Four states because they
// need four different responses: a part, a service, paying the grid, or the network.
assert(/const FLOOR3D_ALERTS=\{[\s\S]{0,400}fault:[\s\S]{0,400}ailing:[\s\S]{0,400}power:[\s\S]{0,400}network:/.test(inline),
  "The 3D floor no longer tells faults, wear, power loss and network loss apart");
assert(inline.includes("function floor3dAlertFor(batch)"), "Nothing decides which machines raise an alarm");
assert(/if\(batch\.status==="fault"\)return FLOOR3D_ALERTS\.fault/.test(inline),
  "A faulted machine does not raise the fault alarm");
assert(inline.includes('batch.ailing&&batch.status!=="repair"'),
  "A machine already being repaired still pulses as if it needed attention");
assert(inline.includes("mesh.instanceColor.needsUpdate=true"),
  "The pulse never reaches the GPU, so nothing on the floor would move");
// The model has to carry the reason, or the floor cannot tell the four apart.
assert(/const condition=maintenanceCondition\(h\),ailing=condition<75&&condition>=65/.test(inline),
  "The batch model no longer marks hardware approaching the 65% offline threshold");
assert(/reason:status==="paused"\?\(siteReason\|\|"manual"\)/.test(inline),
  "The batch model no longer distinguishes why a machine stopped");
assert(inline.includes('const gridDown=gridCutOff()||!!state.policyLock'),
  "A grid disconnection is not told apart from a machine somebody switched off");

/* An order that can be refused must not be an order that was already paid for. placeHardwareOrder
   reports whether the order stood, and every path that took money before calling it puts the
   money back when it did not. This is the half a behavioural test cannot reach, because the buy
   paths clamp to the listing before they ever get there. */
assert(inline.includes("if(!placeHardwareOrder(id,qty))state.cash+=cost;") && inline.includes("if(!placeHardwareOrder(id,qty,cost))state.wallets.hot+=cost;"),
  "A purchase path takes payment and ignores whether the order was actually accepted");

/* THE SKILL TREE IS DRAWN AS A TREE.
   Six branches were six lists of cards, each saying "Tier 3" where 3 was its index in an
   array rather than its depth in anything. The layout is computed from the dependencies now -
   a row is one past the deepest prerequisite, a column is a slot in its branch - so adding a
   skill or an edge moves the drawing on its own and there is no second copy of the structure
   here to fall out of step with the data. */
const techArt = await readFile(new URL("src/ui/tabs/tech.js", root), "utf8");
assert(techArt.includes("function techLayout()") && techArt.includes("function skillTier(") && techArt.includes("function techTreeSvg("),
  "The computed lattice, its depth function or its connectors have gone");
assert(/const tier=skillTier\(skill\)/.test(techArt) && /row:tier-1/.test(techArt) && !/Tier \$\{index\+1\}/.test(techArt),
  "A node's row is no longer its dependency depth, so nodes can be drawn above what they depend on");
assert(techArt.includes('viewBox="0 0 ${cols} ${rows}"') && techArt.includes("preserveAspectRatio=\"none\""),
  "The connector layer no longer shares the lattice's coordinate system, so wires will not meet nodes");
/* One SVG behind the whole lattice, because the edges worth drawing are the ones that cross
   branches; a per-branch SVG cannot draw those. */
assert(css.includes(".tech-wires{position:absolute") && css.includes(".tech-edge{fill:none"),
  "The connector layer is not drawn behind the lattice");
assert(/\.tech-edge\{[^}]*stroke-width:1\.5/.test(css),
  "The connector stroke is back to a viewBox fraction under non-scaling-stroke, which renders sub-pixel and invisible");
assert(!inline.includes("function techV2(){") || techArt.includes("function techV2(){"),
  "Two tech renderers exist again; only one can be the live one");
/* And the lattice is wider than the page, so a repaint must not send the player back to
   Compute every time a fault toast lands. */
assert(inline.includes("let techScrollLeft=0") && inline.includes("if(techScrollLeft)lattice.scrollLeft=techScrollLeft"),
  "The skill tree's horizontal scroll resets on every repaint again");

/* EVERY CONTROL THAT SPENDS FROM COLD ASKS WHETHER THE WALLET CAN SIGN.
   Adding the signing gate created a refusal the buttons did not know about: an unsignable
   wallet showed an enabled control with an empty tooltip that did nothing when clicked. There
   are TWO such controls - the Custody tab's transfer and the threat lab's shortcut - and
   fixing only the one that turned up in the first grep is how this class keeps recurring. */
assert(inline.includes("function coldMoveBlockReason()") && inline.includes("function labColdMoveReason()"),
  "A cold-spend control no longer shares the action's refusal");
/* And each of them has to actually ask. A helper that answers only the balance question is the
   original bug wearing the new function's name. */
for (const fn of ["coldMoveBlockReason", "labColdMoveReason"]) {
  const body = (inline.match(new RegExp(`function ${fn}\\(\\)\\{[\\s\\S]*?\\n\\}`)) || [""])[0];
  assert(body.includes("coldSpendBlockReason"),
    `${fn}() no longer consults the signing gate, so it only ever answers the balance question`);
}
{
  const coldControls = [...inline.matchAll(/data-from="cold"[^>]*?\$\{([A-Za-z]+)\(\)\?"disabled"/g)].map(m => m[1]);
  assert(coldControls.length >= 2,
    `only ${coldControls.length} cold-source control(s) gate on a reason function; both the tab and the lab must`);
  for (const fn of coldControls)
    assert(/^(coldMoveBlockReason|labColdMoveReason|coldSpendBlockReason)$/.test(fn),
      `a cold-source control gates on ${fn}(), which is not one of the shared signing refusals`);
}
assert(!/data-from="cold"[^>]*\$\{cold<=0\?"disabled"/.test(inline) && !/data-from="cold"[^>]*\$\{state\.wallets\.cold<=0\?"disabled"/.test(inline),
  "A cold-source control is back to checking only the balance, so an unsignable wallet offers a button that does nothing");

/* THE BENCH IS THE MACHINE, AND IT SHOWS ITS WORKING.
   Three abstract shapes - four arrows, six identical dots, a number to hit - with no
   relationship to the machine or the part, and all three punishing the player for information
   they were never given. A service manual prints the torque diagram and a loom has its
   terminals marked, so now so do these. */
const benchArt = await readFile(new URL("src/ui/enhance/repair-bench.js", root), "utf8");
assert(benchArt.includes("function repairBenchFace(") && benchArt.includes("function repairBenchLayout("),
  "The bench no longer draws the machine being worked on");
assert(/bench-fan \$\{kind==="fan"\?"target":""\}/.test(benchArt) && benchArt.includes('bench-board ${kind==="board"&&i===1?"target":""}'),
  "The part being replaced is no longer highlighted where it actually sits");
/* The 3D silhouettes are a LAZY module: a player who has only opened Servicing has never
   loaded them, and reading through an undefined FloorMiners drew every machine with one fan. */
assert(/return\{fans:h\.w>=2500\?2:1,psu:h\.w>=1000\}/.test(benchArt),
  "The bench face depends on the lazily-loaded 3D module with no fallback, so it misdraws before the floor is opened");
/* Information, not guessing. */
assert(benchArt.includes("torque-pattern") && benchArt.includes("job.tapFromMemory"),
  "The mount sequence is hidden again, which makes a wrong mount a coin flip with a damage penalty");
assert(benchArt.includes("A to A, B to B, C to C") && /title="Terminal \$\{names\[pair\]/.test(benchArt),
  "Cable terminals no longer carry the pair they belong to, so the first pick of each pair is a guess");
assert(benchArt.includes("torque-gauge") && /\$\{job\.dialTarget\} Nm ±\$\{tol\}/.test(benchArt),
  "The torque spec and its tolerance band are no longer shown");
assert(css.includes(".torque-gauge{position:relative") && css.includes(".torque-pattern{"),
  "The torque gauge or the printed pattern has no styling");
/* And the procedure follows the part rather than a die roll. */
assert(inline.includes("const REPAIR_PROCEDURES=") && inline.includes("function repairProcedureFor(") && inline.includes("function crossPattern()"),
  "The bench procedure is random again, or the cross pattern is back to a shuffle");
assert(!inline.includes("job.puzzleType=Math.floor(nextRand()*3)"),
  "The procedure is chosen by a die roll rather than by the part that broke");

/* HOW MANY WILL ACTUALLY RUN, at the point of buying them.
   Capacity stopped gating the purchase - correctly, since you can buy ahead of a substation
   upgrade - which left a till that will sell forty thousand machines to a site able to power
   nine hundred. The only way to find that out was to read a kilowatt figure off one card and
   divide it by a wattage off another. */
assert(inline.includes("function purchaseLoadBar(") && inline.includes("${purchaseLoadBar(h,selected.qty,fits)}"),
  "The buy control no longer shows what the selected quantity does to the power budget");
assert(inline.includes("Fits now · ${fmtCompactNumber(qty)}") && inline.includes("siteRackHeadroom(h):null"),
  "The quantity list no longer offers the number that fits the site");
/* But only when capacity is the binding constraint. Clamping it to the cash maximum made the
   two collide, and the top rung then read "Fits now" when it meant "all you can afford". */
assert(inline.includes("const fits=raw!==null&&raw>0&&raw<max?raw:null;"),
  "A Fits rung is shown when something other than capacity is the limit, which is the opposite of what it means");
assert(inline.includes("kW over supply") && inline.includes("would wait in storage"),
  "Buying past capacity no longer says how far past, or what happens to the remainder");
assert(css.includes(".buy-load-bar{") && css.includes(".buy-load.over .add{"),
  "The purchase load bar has no styling, or no over-capacity state");

/* A BULK PARTS ORDER IS CONFIRMED; A SINGLE FAN IS NOT.
   Five hundred hashboards is a five-figure commitment against a lead time, which is the kind of
   spend the rest of the game already stops to confirm. It is its own action rather than a
   quantity on the ordinary one, so ordering one fan stays one click. */
assert(inline.includes('"order-parts-bulk"') && /CONFIRMABLE_ACTIONS=new Set\(\[[^\]]*order-parts-bulk/.test(inline),
  "The bulk parts order no longer goes through the confirmation ticket");
assert(inline.includes('data-action="order-parts-bulk"') && inline.includes('data-value="500"'),
  "The Order 500 control is gone from the spare parts card");
assert(inline.includes('if(transaction.action==="order-parts-bulk")orderParts(transaction.id,transaction.qty)'),
  "Confirming a bulk parts order does not actually place it");
/* Two counts a player reads constantly and had to squint at. */
assert(inline.includes('<div class="part-stock"><b>${fmtNum(state.maintenance.inventory[part.id]||0)}</b>') && css.includes(".part-stock b{"),
  "Spare part stock is back to a small badge rather than a figure you can read at a glance");
assert(inline.includes("<b>${fmtNum(owned)}</b> installed") && css.includes(".owned-count b{"),
  "The installed count on a hardware card is no longer prominent");

/* WHAT THE SITE IS DRAWING, AS A PICTURE. The numbers were spread across a metric tile and a
   footnote, so working out the headroom meant arithmetic - and the split that matters was
   invisible. A site at 80% load is a different proposition depending on whether cooling is a
   tenth of that or a third: one you fix with a better chiller, the other with fewer miners. */
const powerArt = await readFile(new URL("src/ui/enhance/mine-power.js", root), "utf8");
assert(powerArt.includes("function powerLoadCard()") && inline.includes("metrics+powerLoadCard()+body"),
  "The electrical load card is gone from the Mine tab");
assert(powerArt.includes('class="power-seg miners"') && powerArt.includes('class="power-seg cooling"'),
  "The load bar no longer separates machine draw from cooling plant draw");
assert(powerArt.includes('class="power-peak') && /Peak is what has to fit/.test(powerArt),
  "The peak marker is gone; peak is what has to fit, not today's draw");
assert(/\.power-bar\{position:relative;display:flex;height:1[0-9]px/.test(css) && css.includes(".power-seg.cooling{"),
  "The load bar has no styling to separate its segments");

/* A MIGRATION IS A SITE-WIDE STOPPAGE AND MUST BE BANNERED LIKE ONE.
   A grid outage got a banner; a relocation did not - yet it powers down every machine for
   days. From Market or Custody the only evidence was 0 H/s in the header with no explanation.
   It is a sibling of the incident banner and belongs beside it, in the strip and in the
   signature that decides when the strip is rebuilt. */
assert(inline.includes("function migrationStatus()") && inline.includes("migrationBanner"),
  "A fleet in transit is invisible outside the Facilities tab again");
assert(/migration\?`\$\{migration\.kind\}:\$\{migration\.due\}`:""/.test(inline),
  "The migration is not part of the banner signature, so the strip will not repaint when it starts or ends");
assert(inline.includes("${banner}${overCapacityBanner}${migrationBanner}${incidentBanner}"),
  "The migration or over-capacity banner is not drawn in the banner strip");
/* A SITE THAT CANNOT HOLD ITS OWN FLEET STOPS EVERYTHING, and used to say nothing at all.
   fleet().within going false takes operating() with it; a player reported months of a stopped
   575,000-machine farm with the facilities tab reading OFFLINE and no explanation anywhere. A
   stoppage the game cannot explain is worse than any stoppage it can. */
assert(inline.includes("function siteStopReason()") && inline.includes("overCapacityBanner"),
  "A site stopped because its fleet does not fit says nothing about why");
/* And every heading that reads like production reports what is being EARNED. fleet().hash is
   the right number for comparing hardware and the wrong one under "your hash": a player watched
   sixteen exahash on a site that had been stopped for months and concluded the rewards were
   broken rather than the site. */
assert(inline.includes("function earningHash(") && inline.includes("fmtHash(earningHash())") && inline.includes("fmtHash(online?fs.hash:0)"),
  "A stopped site still reports its installed hash rate as though it were producing it");
assert(inline.includes("installed but idle") && inline.includes("idle`}"),
  "The idle figure is no longer shown beside the earning one, so a stopped fleet looks like a lost fleet");
assert(/typeof fleet==="function"&&!fleet\(\)\.within\?"overcapacity":""/.test(inline),
  "The over-capacity state is not in the banner signature, so the strip will not repaint when it starts or clears");
assert(inline.includes("keep accruing while nothing is hashing"),
  "The migration banner no longer says the costs continue while the income stops, which is the point of it");

/* A CHOSEN QUANTITY MUST SURVIVE A REPAINT. The buy controls are rebuilt from scratch by every
   full render, and mine() was calling them without the selection - so a toast arriving while
   the player was choosing snapped it back to one. Pressing Buy having already chosen forty is
   worse than useless. */
assert(inline.includes("hardwarePurchaseChoice={}") && inline.includes("hardwarePurchaseChoice[h.id]={qty,currency}"),
  "The chosen purchase quantity is no longer remembered when it is chosen");
assert(inline.includes('hardwarePurchaseChoice[h.id]?.qty||1,hardwarePurchaseChoice[h.id]?.currency||"usd"'),
  "The Mine tab rebuilds the buy controls without the quantity the player chose, resetting it to 1");

/* WHEN THE SAME THING KEEPS HAPPENING, PING LESS. A fleet of five thousand machines breaks
   constantly, and every fault raised its own toast: each replaced the last, restarted the
   timer, and re-fired the screen flash. A notice was on screen at all times, none stayed long
   enough to read, and the flash stopped meaning anything. */
assert(inline.includes("const TOAST_COALESCE_MS=") && inline.includes("toastRepeats=repeat?toastRepeats+1:0"),
  "Repeated notices no longer fold together");
assert(inline.includes('if(kind==="bad"&&state.started&&!repeat)triggerImpactEffect()'),
  "The impact flash fires on every repeat again, so it marks fleet size rather than trouble");
assert(inline.includes("function toastLife()") && /TOAST_BASE_MS\+toastRepeats\*/.test(inline),
  "A folded notice is not given longer on screen, so a burst is still unreadable");
assert(inline.includes("more like it just now"),
  "A folded notice does not say how many it stands for, so folding looks like dropped messages");

/* SPENDING FROM COLD IS AN ACT, NOT A CLICK. Cold storage protects coins by making them hard
   to spend, which necessarily includes hard for their owner. A transfer that completes the
   instant it is clicked teaches that cold storage is free safety, which would make choosing
   anything else irrational. */
assert(inline.includes("function coldSpendDays(") && inline.includes("function coldSpendBlockReason(") && inline.includes("function advanceColdSpends("),
  "The cold-spend ceremony, its refusal or its completion tick has gone");
assert(inline.includes('if(from==="cold")return beginColdSpend(to,gross,fee,{fraction,rush:opts.rush});'),
  "Leaving cold storage completes instantly again");
// THE BILL IS A CUSTODY EVENT. The settlement decision has to say how far away the reserve is and
// offer to fetch it, because the clock is stopped and a signing is measured in days of clock.
assert(inline.includes('activeTab==="dashboard"||activeTab==="treasury"?"":sectionPulse()') && inline.includes("${treasuryStrip()}${treasurySectionNav()}${sectionPulse()}${sections[treasurySection()]()}"),
  "The Treasury's orientation card is back above the position strip, or is drawn twice: it belongs under the section bar, once");
assert(/if\(a==="begin"\)\{[^\n]*required:true,resumeSpeed:/.test(inline) && !/if\(a==="begin"\)\{[^\n]*skipWalletSetup\(\)/.test(inline),
  "Beginning a run skips the first-wallet ceremony again: the player never generates a key, and nothing says why there is somewhere to be paid");
assert(inline.includes("state.walletSetup&&state.walletSetup.required&&!state.walletSetup.done)return;"),
  "The clock no longer waits for the first wallet");
{
  const version = /const APP_VERSION="([^"]+)"/.exec(inline)?.[1];
  assert(version, "There is no APP_VERSION: the version has to be written in one place");
  assert(new RegExp(`const CHANGELOG=\\[\\s*\\{date:"[^"]+",title:"(?:Alpha|Beta) ${version.replace(".", "\\.")} `).test(inline),
    `The newest changelog entry is not for ${version}: every round of changes bumps APP_VERSION and adds an entry`);
  assert(inline.includes("${APP_RELEASE} · seed ${state.seed}") && !inline.includes("Historical replay · seed"), "The header does not read the version from APP_VERSION, or does not show the seed beside it");
  const html = await readFile(new URL("index.html", root), "utf8");
  assert(html.includes(`Timechain Beta ${version} -`) && html.includes(`content="Timechain Beta ${version}:`), `index.html's title and description do not say Timechain Beta ${version}`);
  const versions = [...inline.matchAll(/title:"(Alpha|Beta) (\d+)\.(\d+) /g)].map(m => (m[1] === "Beta" ? 1_000_000 : 0) + Number(m[2]) * 1000 + Number(m[3]));
  assert(versions.every((v, i) => i === 0 || versions[i - 1] >= v), "The changelog is out of order: versions must not increase as you read down");
}
assert(inline.includes("createHotWallet({keyHex:state.walletSetup.keyHex,backup:!!withBackup})") && inline.includes('else if(a==="wallet-setup-done")completeWalletSetup(v==="backup");') && inline.includes('data-action="wallet-setup-done" data-value="backup"'),
  "The ceremony's key is no longer made into a real key, or the player is no longer offered a backup of it");
assert(/function skipWalletSetup\(\)\{[\s\S]*?state\.walletSetup\.step=2;save\(\);render\(\);\s*\}/.test(inline),
  "Letting the game generate the key skips the page that shows it and offers the backup");
assert(inline.includes('typeof hotWalletCard==="function"?hotWalletCard():""') && inline.includes("function hotWalletCard()") && inline.includes('if(key.hot)return showToast("That is your online wallet"'),
  "The online wallet's card is not on the Custody section, or its key can be assigned into a wallet policy");
// THE TOUR. A new run is walked round every area once, with the clock held, and an old save is not.
{
  const tourSource = await readFile(new URL("src/ui/tour.js", root), "utf8");
  const treasurySource = await readFile(new URL("src/ui/tabs/treasury.js", root), "utf8");
  const ctx = { globalThis: {}, document: { addEventListener() {}, body: { classList: { toggle() {} } } }, window: { addEventListener() {} }, state: { started: true, walletSetup: { done: true } }, activeTab: "dashboard" };
  ctx.globalThis = ctx;
  vm.runInNewContext(treasurySource + "\n" + tourSource + "\nglobalThis.api={TOUR_STEPS,tourState,tourActive,resolveTab};", ctx);
  const { TOUR_STEPS, tourState, tourActive, resolveTab } = ctx.api;
  // The pages the tour points at, without the tour itself: its own selectors would otherwise vouch for themselves.
  const pages = inline.replace(tourSource, "");
  const navTabs = /\["dashboard","mine","pools","treasury"[^\]]*\]/.exec(inline)[0].match(/"([a-z]+)"/g).map(x => x.replace(/"/g, ""));
  assert(new Set(TOUR_STEPS.map(x => x.id)).size === TOUR_STEPS.length, "Two tour steps share an id");
  assert(TOUR_STEPS[0].center && TOUR_STEPS[TOUR_STEPS.length - 1].center && TOUR_STEPS[TOUR_STEPS.length - 1].finish, "The tour does not open and close with a centred welcome and a finish");
  for (const step of TOUR_STEPS) {
    assert(step.title && step.body && step.chapter, `Tour step "${step.id}" has no title, body or chapter`);
    if (step.center && !step.tab) continue;
    assert(step.tab && navTabs.includes(resolveTab(step.tab).tab), `Tour step "${step.id}" opens "${step.tab}", which is not a tab in the navigation`);
    if (step.center) continue;
    assert(Array.isArray(step.target) && step.target.length, `Tour step "${step.id}" points at nothing`);
    for (const t of step.target) {
      if (typeof t === "string") for (const cls of t.match(/\.[A-Za-z][\w-]*/g) || []) assert(pages.includes(cls.slice(1)), `Tour step "${step.id}" rings ${cls}, which no page draws`);
      else assert(pages.includes(t.text), `Tour step "${step.id}" rings the card headed "${t.text}", which no page draws`);
    }
  }
  const tabsCovered = new Set(TOUR_STEPS.map(x => x.tab && resolveTab(x.tab).tab).filter(Boolean));
  for (const tab of navTabs) assert(tabsCovered.has(tab), `The tour never visits the "${tab}" tab`);
  for (const section of ["market", "custody", "finance"]) assert(TOUR_STEPS.some(x => x.tab === section), `The tour never visits the Treasury's ${section} section`);
  // A save from before the tour has done it; it must not be walked round a game it has been playing for months.
  ctx.state = { started: true, walletSetup: { done: true } };
  assert(tourState().done === true && tourActive() === false, "A save with no tour record is walked through the tour");
  ctx.state = { started: true, walletSetup: { done: true }, tour: { active: true, done: false, step: 3 } };
  assert(tourActive() === true, "A run that is part-way through the tour is not resumed");
  ctx.state = { started: true, walletSetup: { done: false }, tour: { active: true, done: false, step: 0 } };
  assert(tourActive() === false, "The tour opens before the wallet exists");
  assert(inline.includes('if(a.indexOf("tour-")===0){tourAction(a);return}') && inline.includes('tourAfterRender();') && inline.includes('data-action="tour-start">Tour</button>'),
    "The tour is not wired to the click handler, the render, or the footer");
  assert(/state\.walletSetup\.required&&typeof beginTour==="function"\)beginTour\(\)/.test(inline), "A new run no longer starts the tour after its wallet ceremony");
  assert(inline.includes("function endTour()") && /state\.speed=t\.resumeSpeed/.test(inline), "Ending the tour does not put the clock back");
}
for (const act of ["settle-btc","settle-liquidate","settle-bridge","settle-defer","settle-receivership"]) {
  assert(inline.includes(`action:"${act}"`) && inline.includes(`a==="${act}"`),
    `The settlement modal offers "${act}" but the click handler does not know it, or the modal stopped offering it`);
}
assert(/settlement-choice-grid">\$\{reserve\}\$\{settlementOptions\(short,strike\)/.test(inline) && !inline.includes("alpha26SettlementModal") && inline.includes('data-action="settle-fetch"') && inline.includes('data-action="settle-fetch-rush"'),
  "The settlement decision no longer offers to fetch a reserve held in cold storage");
assert(inline.includes('else if(a==="settle-fetch")fetchReserve(false);else if(a==="settle-fetch-rush")fetchReserve(true);'),
  "The fetch-the-reserve buttons are not wired to anything");
assert(/function fetchReserve\(rush=false\)\{[\s\S]*?deferSettlement\(\);\s*beginColdSpend\("hot"/.test(inline),
  "Fetching the reserve starts a signing without restarting the clock first, so it can never land");
assert(inline.includes('if(CONFIRMABLE_ACTIONS.has(a)||(a==="transfer"&&b.dataset.from==="cold")){requestTransactionConfirmation(b);return}') && inline.includes("function coldTransferPreview(button,base)"),
  "A cold spend starts without a review of its days and its fee");
assert(inline.includes("function transferNetworkFee(from,fraction,opts={},s=state)") && inline.includes("const fee=transferNetworkFee(from,fraction,opts);"),
  "The network fee a player is shown and the fee transfer() charges are no longer one function");
assert(/e\.fx==="china"&&state\.region==="sichuan"\{?[\s\S]{0,260}custodyOnRegionalBan\(e\.fx\)/.test(inline.replace(/\n/g," ")) && inline.includes("const BAN_SEIZURE={china:{region:\"sichuan\""),
  "A ban on mining no longer reaches the bank box: applyEvent has to call custodyOnRegionalBan for the China event");
assert(!/baseFee=nodeOnline\(\)&&state\.nodeMode/.test(inline),
  "transfer() has its own copy of the flat network fee again; it has to ask flatNetworkFee()");
assert(inline.includes('utxoAdd("cold",s)') && inline.includes('utxoConsume("cold",fraction)'),
  "Payouts and cold spends no longer count the coins that have to be gathered");
assert(inline.includes("function advanceCustodyRisks(next,silent=false)") && inline.includes("advanceCustodyRisks(next,silent);") && inline.includes('if(!silent)showToast("A signer was lost') && inline.includes('if(!silent)showToast("Someone tried the leaked list on you"'),
  "The monthly custody scares replay as a burst of toasts after a catch-up");
assert(inline.includes("function advanceColdSpends(silent=false)") && inline.includes("advanceColdSpends(silent);") && inline.includes("if(!silent)showToast(\"Coins out of cold storage\""),
  "A cold spend landing during a catch-up replays as a burst of toasts");
assert(inline.includes("${coldSpendCostLine()}") && inline.includes("network fee${j.rush?"),
  "The cold-spend card does not say what leaving costs");

// PLACES. Where a device or a backup is kept decides what a fire, a flood or a burglar can do to it.
{
  const placesSource = await readFile(new URL("src/engine/places.js", root), "utf8");
  const code = placesSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert(!/nextRand\(/.test(code),
    "A place risk draws from the shared random stream, which shifts every seeded run after it. Roll it with hashRoll(state.seed, ...)");
  assert(/hashRoll\(state\.seed,"place",month,place\.id,kind\)/.test(code),
    "The monthly place incident is no longer a hash of the seed, the month, the place and the kind");
}
assert(inline.includes("${custodyDevicesCard()}${custodyPlacesCard()}${custodyCounterpartiesCard()}${custodyShopCard()}"),
  "The custody tab no longer shows where things are kept");
assert(inline.includes('else if(a==="custody-move")moveCustodyItem(b.dataset.kind,id,v);') && inline.includes('else if(a==="custody-restore-key")restoreCustodyKey(id,v);'),
  "The move and restore buttons on the places card are not wired to anything");
assert(inline.includes("function custodyKeyRestorable(key)") && inline.includes("function custodyConfigLocations(c)"),
  "The places card calls a helper that no longer exists, and the custody tab stops drawing");
assert(inline.includes("advanceRestores(silent);") && inline.includes("const days=custodyRestoreDays(key);"),
  "A key restored from a backup no longer takes the days the backup's place takes, so the safest place costs nothing to recover from");
assert(inline.includes('${custodyRestoreDays(k)>0?` · ${custodyRestoreDays(k)}d`:""}'),
  "The restore button no longer says how many days fetching the backup will take");
assert(inline.includes("advancePlaceRisks(next,silent);") && inline.includes("advanceCustodyMoves(silent);") && inline.includes("function advanceOperationalRisks(next,silent=false)"),
  "Place incidents or journeys are no longer advanced by the tick, or ignore silent catch-up");
assert(inline.includes("enforceConnectivityAvailability();custodyOnRelocation(job.id);") && inline.includes("custodyRelocationNotice();save();render();"),
  "Moving the fleet no longer warns what is kept at the mine, or no longer carries it across the border");
assert(inline.includes("normalizeCustodyPlaces(state.custody);") && inline.includes("if(restored.custody)normalizeCustodyPlaces(restored.custody);"),
  "A loaded or imported save is not cleaned of places that do not exist");
assert(inline.includes('boughtAt:order.boughtAt||when,keyId:null,place:"site"') && inline.includes('at:state.time,place:"site"};') && inline.includes('c.configBackedUp=true;c.configPlace="site";'),
  "New devices, backups or descriptors no longer start at the mine, so nothing begins in one place and the lesson is lost");
assert(inline.includes("if(set.placed&&set.fragile)risk*=1.8;"),
  "Keeping the backups and the signers in one place is no longer priced");

// PEOPLE. A key a person knows leaves with them, and replacing one is a job with a price.
{
  const holdersSource = await readFile(new URL("src/engine/keyholders.js", root), "utf8");
  const code = holdersSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert(!/nextRand\(/.test(code),
    "A people risk draws from the shared random stream, which shifts every seeded run after it. Roll it with hashRoll(state.seed, ...)");
}
// THE TREASURY. Market, Custody and Finance are sections of one tab, and every name they ever had still works.
{
  const treasurySource = await readFile(new URL("src/ui/tabs/treasury.js", root), "utf8");
  const api = {};
  vm.runInNewContext(treasurySource + "\nglobalThis.api={TREASURY_SECTION_IDS,treasurySection,activeTabKey,resolveTab,openTab,tabIsActive};",
    { globalThis: api, state: { treasurySection: undefined }, activeTab: "dashboard" });
  const t = api.api;
  assert(["market", "custody", "finance"].every(id => t.TREASURY_SECTION_IDS.includes(id)) && t.TREASURY_SECTION_IDS.length === 3,
    "The Treasury is not the three sections Market, Custody and Finance");
  for (const id of ["market", "custody", "finance"]) {
    const r = t.resolveTab(id);
    assert(r.tab === "treasury" && r.section === id, `The old name "${id}" no longer opens the Treasury at that section: ${JSON.stringify(r)}`);
  }
  assert(t.resolveTab("mine").tab === "mine" && t.resolveTab("mine").section === null, "An ordinary tab was turned into something else");
  // Opening an old name sets the section it meant, and does not disturb anything else.
  const ctx = { state: { treasurySection: "market" }, activeTab: "dashboard" };
  vm.runInNewContext(treasurySource + "\nglobalThis.out={tab:openTab('finance'),section:state.treasurySection,key:(activeTab='treasury',activeTabKey()),active:tabIsActive('finance'),other:tabIsActive('custody')};", { ...ctx, globalThis: ctx });
  assert(ctx.out.tab === "treasury" && ctx.out.section === "finance" && ctx.out.key === "finance" && ctx.out.active && !ctx.out.other,
    `openTab("finance") did not land on the Finance section of the Treasury: ${JSON.stringify(ctx.out)}`);
  // A damaged or missing section is Market, never undefined.
  const bad = { state: { treasurySection: "nonsense" } };
  vm.runInNewContext(treasurySource + "\nglobalThis.out=treasurySection();", { ...bad, globalThis: bad, activeTab: "treasury" });
  assert(bad.out === "market", `A damaged section was read as "${bad.out}"`);
  // The acceptance test: every tab id the source can name must open something. A toast, a loss notice, a
  // banner or a menu entry that names a tab that is not there silently does nothing.
  const navTabs = inline.match(/const tabs=\[("[a-z]+",?)+\];/)[0].match(/"[a-z]+"/g).map(x => x.slice(1, -1));
  const known = new Set([...navTabs, ...t.TREASURY_SECTION_IDS]);
  const named = new Set();
  // A toast names its tab as its fourth argument after a kind, a loss notice as a default, and a card as a field.
  for (const re of [/\btab:"([a-z]+)"/g, /data-action="tab" data-value="([a-z]+)"/g, /\bopenTab\("([a-z]+)"\)/g,
      /,"(?:info|bad|success|warning|notice|good|milestone|blocked)","([a-z]+)"[,)]/g, /\.tab\|\|"([a-z]+)"/g]) for (const m of inline.matchAll(re)) named.add(m[1]);
  for (const m of inline.matchAll(/tabs:\[((?:"[a-z]+",?)+)\]/g)) for (const x of m[1].match(/"[a-z]+"/g)) named.add(x.slice(1, -1));
  // A list of toast kinds looks like "a kind, then a name", and a kind is never a tab.
  const toastKinds = new Set(["info", "bad", "success", "warning", "notice", "good", "milestone", "blocked"]);
  const missing = [...named].filter(id => !known.has(id) && !toastKinds.has(id));
  assert(missing.length === 0, `These tab names open nothing: ${missing.join(", ")}`);
  assert(named.has("custody") && named.has("market") && named.has("finance") && named.size > 6, "The scan found too few tab names to mean anything");
  const toastLinks = [...inline.matchAll(/,"(?:info|bad|success|warning|notice|good|milestone|blocked)","(custody|market|finance)"[,)]/g)].length;
  assert(toastLinks > 50, `The scan found only ${toastLinks} toasts that link to the old section names; there are more than seventy`);
  assert(!navTabs.includes("market") && !navTabs.includes("custody") && !navTabs.includes("finance") && navTabs.includes("treasury"),
    "Market, Custody or Finance are in the navigation as tabs of their own again");
}
assert(inline.includes('else if(a==="treasury-section")setTreasurySection(v);') && inline.includes("activeTab=openTab(b.dataset.value);") && inline.includes('activeTab=openTab("market");'),
  "A tab can be opened without going through the alias layer, so an old name can land nowhere");
assert(inline.includes('if(activeTab==="treasury")return treasury();') && inline.includes("const page=pages[activeTabKey()]") && inline.includes('if(activeTabKey()!=="market"||state.time<MARKET)return;'),
  "The Treasury is not drawn, or its orientation, help and live market patching are not keyed on the section showing");
assert(inline.includes('class="${tabIsActive(t)?"active":""}" data-action="tab"'),
  "The mobile menu's section shortcuts no longer show which section is open");
assert(/@media\(max-width:800px\)\{\s*\.treasury-sections\{position:sticky;top:var\(--topbar-live-h\);flex-direction:row\}/.test(css),
  "The Treasury's section bar is not sticky on a phone, where the Mine tab's rule would have made it static");
assert(css.includes(".treasury-sections .mine-section-tabs{grid-template-columns:repeat(3"),
  "The Treasury's section bar is laid out for four sections");
// COUNTERPARTIES. The operating loan's rate is one number, so that whatever is about to make it depend on something changes it once.
assert(!/hasStaff\("treasurer"\)\?\.009:\.012|hasStaff\("treasurer"\)\?"0\.9":"1\.2"/.test(inline.replace(/function projectLoanRate\(\)\{[^}]*\}/, "")),
  "The operating loan's rate is written out again somewhere other than projectLoanRate()");
assert(inline.includes("function financeInterestMonthly()") && inline.includes("const loanInterest=financeInterestMonthly()") && inline.includes("breakdown.finance=financeInterestMonthly();"),
  "The month-end bill and the settlement forecast no longer price borrowing from the same function");
assert(inline.includes('else if(a==="custody-audit")commissionCustodyAudit();') && inline.includes('data-action="custody-audit"'),
  "The audit button is not wired to anything, or has gone from the custody tab");
assert(inline.includes('else if(a==="custody-cover")toggleCoinCover();') && inline.includes("${custodyPostureSection()}${custodyAuditSection()}${custodyCoverSection()}"),
  "The cover button is not wired to anything, or has gone from the custody tab");
assert(inline.includes('const claim=typeof coinCoverClaim==="function"?coinCoverClaim(entry,btc):null;') && inline.includes("what:(entry.what||\"\")+(claim?claim.note:\"\")"),
  "A theft is no longer offered to the policy, or the loss notice no longer says what it paid or why not");
assert(inline.includes("advanceCoinCover(next,silent);") && inline.includes("function migrationInsuranceCost()"),
  "An insurer can no longer withdraw cover, or the premium is no longer kept apart from the migration cover");
// BORROWING AGAINST COINS. Interest, totals, the tick and the one historical lender failure all have to know about it.
{
  const lendingSource = await readFile(new URL("src/engine/lending.js", root), "utf8");
  const code = lendingSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert(!/nextRand\(/.test(code), "A lending event draws from the shared random stream; a price call and a liquidation are functions of the price, not of dice");
}
assert(inline.includes("advanceSecuredLoan(next,silent);") && inline.includes('applyLenderFailure(e.fx.split(":")[1]||"celsius");'),
  "A loan against coins is no longer advanced by the tick, or the 2022 lender failure no longer reaches it");
assert(inline.includes("+securedPledgedBtc():0)}") && inline.includes('-(typeof securedPrincipal==="function"?securedPrincipal():0)+'),
  "Pledged coins are no longer counted as the borrower's, or the loan is no longer a liability in net worth");
assert(inline.includes('(typeof securedInterestMonthly==="function"?securedInterestMonthly():0)'),
  "Interest on a loan against coins is no longer part of what borrowing adds to the bill");
assert(inline.includes('else if(a==="secured-borrow")borrowSecured(b.dataset.mode,Number(v),{use:securedUseChoice});') && inline.includes('else if(a==="secured-use")setSecuredUse(Number(v));') && inline.includes("${securedUseChooser()}<div class=\"venue-grid\">${securedOffers()}</div>"),
  "A loan can no longer be sized below what the coins allow, which is the only way to make one safe");
assert(inline.includes('${l.warned&&!l.call?`<div class="risk medium">Close to a margin call'),
  "A loan close to its margin call no longer says so on screen");
assert(inline.includes('else if(a==="secured-borrow")') && inline.includes('else if(a==="secured-repay")repaySecuredLoan(Number(v)||1);') && inline.includes('else if(a==="secured-topup")addSecuredCollateral(Number(v));') && inline.includes('else if(a==="settle-borrow")borrowForSettlement(v);'),
  "The borrow, repay, add-collateral or settlement-borrow buttons are not wired to anything");
assert(inline.includes("${custodyCoverSection()}${custodyLoanSection()}") && inline.includes("return settlementReserveOnly()+settlementBorrowCards();"),
  "Borrowing against coins is no longer offered on the custody tab or in the settlement decision");
assert(inline.includes('${typeof marketReserveNote==="function"?marketReserveNote(id,transferId):""}'),
  "The Market no longer says what depositing from the reserve costs");
assert(inline.includes("advanceAudit(silent);") && inline.includes("function advanceAudit(silent=false)"),
  "An audit under way is no longer advanced by the tick, so it would never finish");
assert(inline.includes("const POSTURE_TIERS=[\"none\",\"basic\",\"strong\",\"audited\"];") && inline.includes("${custodyPostureSection()}${custodyAuditSection()}"),
  "The custody tab no longer shows the posture a lender or an insurer would see");
assert(inline.includes("custodyOnDismiss(id,countBefore);") && inline.includes("const countBefore=state.staff.filter(x=>x===id).length;"),
  "Dismissing somebody no longer exposes the keys they knew");
assert(inline.includes("advanceInsiderRisk(next);") && inline.includes("advanceRotation(silent);"),
  "Insider risk or a rotation is no longer advanced by the tick");
// The danger of an exposed key is a clock, not a monthly roll: it is rolled every day and rises every day.
assert(!/function advanceOperationalRisks\(next,silent=false\)\{[\s\S]*?\n\}\n/.exec(inline)[0].includes("advanceInsiderRisk"),
  "The insider risk is back inside the monthly gate, so it can only ever be rolled once a month");
assert(inline.includes("function insiderDailyHazard(days,hostile)") && inline.includes("const INSIDER_HOSTILE_SHARE=.5;") && inline.includes("quiet:90"),
  "The insider risk is no longer a daily hazard with a hostile half and a patient half that waits a quarter");
assert(inline.includes("${key.exposed&&assigned?`<small class=\"modal-note\">${custodyExposureRisk()}</small>`:\"\"}") && inline.includes("and it rises every day. Replace it before it is."),
  "An exposed key no longer says how long it has been known and what the chance is today");
assert(inline.includes('else if(a==="custody-holder")setKeyHolder(id,v);') && inline.includes('else if(a==="custody-rotate")rotateCustodyKey(id,v,b.dataset.rush==="1");')
  && inline.includes('else if(a==="custody-wipe")wipeCustodySigner(id);') && inline.includes('data-action="custody-wipe"') && inline.includes('data-rush="1"'),
  "The hand-over, rotate, rush and wipe-signer buttons are not wired to anything");
assert(inline.includes("${key?custodyHolderControls(key):\"\"}") && inline.includes("${custodyRotationRows()}"),
  "The key cards no longer say who holds a key or offer to replace it");
assert(inline.includes("${hired&&custodyDismissNote(s.id)?"),
  "The staff card no longer warns that dismissing somebody exposes a key before it happens");
assert(inline.includes('{id:"security",name:"Security officer"') && (await readFile(new URL("src/ui/floor3d/scenery.js", root), "utf8")).includes("security:0x5fd0c0"),
  "The security officer is missing from the roster or from the 3D floor's crew colours");
assert(inline.includes('if(s.custody&&s.custody.rotation)return "The coins are being swept'),
  "A wallet can be spent from while its coins are being swept to a new key");
assert(inline.includes('if(key.retired)return showToast("That key is retired"') && inline.includes('${key&&!assigned&&!key.retired?`<button class="action small primary" data-action="custody-assign"'),
  "A key retired by a rotation can be assigned to the wallet again, which undoes the rotation");
assert(inline.includes("const countBefore")&&/function custodyOnDismiss\(roleId,countBefore=1\)/.test(inline),
  "A dismissed technician no longer exposes a key in proportion to how many there were");
assert(inline.includes("function coldSpendCard()"),
  "Nothing shows coins that have left cold storage and not yet arrived, so a transfer looks like the game eating them");
/* And a shortfall is a different problem depending on how far away the treasury is. */
assert(inline.includes("coldTooSlow") && inline.includes("reachDays"),
  "The settlement forecast no longer says how many days the treasury is away");

/* SERVICING CAN BE UNAVAILABLE, AND THE TAB STRIP HAS TO SAY SO. A fleet in transit or sitting
   through an outage cannot be worked on, and the badge cheerfully read "12 need attention" as
   though a technician could be sent. */
assert(inline.includes("const serviceHalted=moving?") && inline.includes('tone:"halted"'),
  "The Servicing sub-tab no longer reports that it is offline");
assert(inline.includes('offline · in transit') && inline.includes('offline · ${incident.kind.toLowerCase()}'),
  "The Servicing badge no longer names WHY it is offline; in transit and a grid outage are different waits");
assert(css.includes(".mine-section-badge.halted"), "The halted badge has no styling to tell it apart");

/* MINING INCOME ARRIVES THROUGH CUSTODY.
   Custody was a tab you visited once. The way to teach it is not to explain it - it is to make
   every day of mining pass through it, which is why the payout card lives on Pools, where the
   income is earned and where the one custody decision a miner cannot avoid is actually met. */
assert(inline.includes("function payoutCustodyCard()") && inline.includes("function creditMiningIncome(") && inline.includes("function advancePoolPayouts("),
  "The payout card, the income router or the payout tick has gone");
assert(!/state\.wallets\.hot\+=payout/.test(inline) && inline.includes("if(payout>0){creditMiningIncome(payout);"),
  "Mining income appears in the hot wallet again, so custody stops being part of mining");
assert(inline.includes('data-action="payout-destination"') && inline.includes('data-action="payout-threshold"'),
  "The player can no longer choose where income lands or how much the pool holds first");
assert(inline.includes("THE ONE CUSTODY DECISION A MINER CANNOT AVOID") && inline.includes("SOMEBODY ELSE HOLDS IT"),
  "The payout card no longer names what a custodial destination actually means");
/* An estimate is only worth showing while it means something: a stopped fleet must be told so
   rather than shown a nine-digit countdown. */
assert(inline.includes("rawDays<=3650") && inline.includes("out of reach at this hash rate"),
  "The time-to-payout estimate is unguarded, so a stopped fleet reads a meaningless number");

/* RETIRING IS WORK, AND THE PIPELINE RUNS BOTH WAYS.
   Machines on their way out are as much a part of what the floor is doing as machines on their
   way in, and a fleet that is half-retired is a hash rate still falling. */
assert(inline.includes("function advanceRetirements()") && inline.includes("state.retirementJobs.push({id,qty,done:0,started:state.time,due:state.time+days*DAY,days})"),
  "Retirement is instant again, or no longer scheduled as work the crew does over days");
assert(inline.includes("retirementJobs:[],") && inline.includes("state.retirementJobs=Array.isArray(state.retirementJobs)"),
  "Retirement jobs have no default or no save migration, so an old save could carry a broken queue");
assert(inline.includes('detail:"Retiring"') && inline.includes('class="incoming-fleet-row outgoing"'),
  "Machines on their way out of the fleet are invisible in the build queue or the Mine pipeline");
/* A one-machine line is a switch, not a fleet. Three greyed-out fleet operations against a
   single laptop hide the only thing the player wants for the first year of the game. */
assert(inline.includes('${running?"Stop hashing":"Start hashing"}') && inline.includes("${n===1"),
  "A single-unit hardware line no longer offers one clear stop/start control");

/* THE FLOOR IS THE 3D FLOOR, and the flat floor is the fallback underneath it. Four things
   have to stay true: nothing offers the flat floor as a choice, the flat floor is still in the
   markup for a browser that cannot draw the real one, the library is not loaded until somebody
   opens the floor, the canvas outlives the repaints that destroy everything around it, and
   every failure path still lands on the flat floor rather than a blank rectangle. */
assert(/floorView:"3d"/.test(inline) && inline.includes('state.floorView="3d";'),
  "The 3D floor is not the default, or an old save's flat-floor preference is not migrated onto it");
assert(!inline.includes('data-action="floor-view"') && !inline.includes("function floorViewToggle(") && !inline.includes('a==="floor-view"'),
  "The floor view toggle is back - as markup, as a builder or as a handler; the flat floor is a fallback, not a choice");
assert(inline.includes("function floor3dAvailable()") && inline.includes("function floorViewport()"),
  "Nothing decides whether the real floor can be drawn, so the fallback cannot be automatic");
assert(inline.includes('<div class="facility-floor tier-${tier}"${floor3dAvailable()?\' hidden\':\'\'}>'),
  "The flat floor is no longer kept in the markup for a browser that cannot open a 3D context");
assert(inline.includes('function floor3dWanted(){return state.floorView==="3d"&&!floor3dUnavailableReason()}'),
  "The mount still asks which view was chosen rather than whether one can be drawn");
{
  const head = await readFile(new URL("index.html", root), "utf8");
  assert(!head.includes("vendor/three.floor.js"),
    "three.js is loaded on every page load; the 3D floor is opt-in and so is its half-megabyte");
  assert(!/floor3d\/(silhouettes|scenery|scene|model)\.js/.test(head),
    "The 3D view modules are loaded eagerly; only the mount layer belongs in index.html");
  assert(head.includes("src/ui/floor3d/mount.js"),
    "The mount layer is not loaded, so the toggle cannot offer the 3D floor at all");
}
assert(inline.includes("if(floor3dCanvas.parentElement!==host)host.appendChild(floor3dCanvas)"),
  "The canvas is not re-attached across repaints, so every repaint would build a new WebGL context");
assert(/signature!==floor3dSignature/.test(inline),
  "The scene rebuilds unconditionally instead of only when the floor has changed");
assert(inline.includes('state.floorView="2d";save();render()'),
  "A 3D failure does not fall back to the flat floor");
assert(inline.includes('webglcontextlost'), "A lost 3D context is not handled");
/* The support probe opens a WebGL context, and it is reachable from the render path. Uncached it
   opened one per repaint, the browser evicted its oldest live context - the real renderer - and
   the floor fell to the flat view for the rest of the session. */
assert(/let floor3dSupportProbe=null;[\s\S]*?function floor3dSupported\(\)\{[\s\S]*?if\(floor3dSupportProbe!==null\)return floor3dSupportProbe;/.test(inline),
  "The 3D support probe is not cached, so every repaint opens a WebGL context and the real one is eventually evicted");
assert(/WEBGL_lose_context/.test(inline),
  "The 3D support probe does not release its context, leaving it live until the garbage collector runs");
// A dynamically loaded script must come from this bundle, not from anywhere else.
assert(/const FLOOR3D_SCRIPTS=\[[^\]]*\]/.test(inline), "The 3D script list is missing");
{
  const list = inline.match(/const FLOOR3D_SCRIPTS=\[([^\]]*)\]/)[1];
  assert(!/https?:|\/\//.test(list.replace(/\/\*[\s\S]*?\*\//g, "")),
    "A 3D module is loaded from somewhere other than this bundle");
}

// THE FLOOR AS DATA - the batch model exists so a second renderer draws the same floor
// rather than deriving the rules again. If the SVG floor goes back to computing statuses
// inline, the two will drift the moment either is touched.
assert(inline.includes("function floorBatches()"), "The floor batch model is missing");
assert(!/function miningFloorUnits\(\)\{[\s\S]{0,400}hardwareRepairState\(/.test(inline),
  "miningFloorUnits derives fleet state itself again instead of rendering the batch model");
assert(/floorBatches\(\)\.map\(/.test(inline), "The SVG floor no longer renders from the batch model");
{
  // The model must stay free of markup: it is the thing a canvas renderer would consume.
  const modelStart = inline.indexOf("function floorBatches()");
  const modelEnd = inline.indexOf("function floorOwnedHardware()", modelStart);
  const model = inline.slice(modelStart, modelEnd);
  assert(modelStart >= 0 && modelEnd > modelStart, "The floor batch model could not be isolated");
  assert(!/<div|<svg|class=|data-action/.test(model),
    "The floor batch model has grown markup, which defeats the point of separating it");
}

// FLOOR SPRITES - every sprite used to carry its own copy of its machine's drawing: 146KB of
// the floor's 162KB at the largest sites, the same few pictures repeated 182 times. One
// <symbol> per owned type plus a <use> per sprite says it once. The symbols must stay inside
// the floor markup: renderMineContent() replaces .content alone, and a <use> must never
// outlive the <symbol> it points at.
assert(inline.includes("function floorSpriteSymbols("), "The floor sprite <symbol> block is missing");
assert(inline.includes("function minerArt("), "minerArt is missing, so the drawing cannot be shared by reference");
assert(/<use href="#ma-\$\{id\}"\/>/.test(inline), "Floor sprites do not reference the shared symbol");
assert(inline.includes("${floorSprite(h.id)}${badge}"),
  "The floor renders inline drawings again instead of referencing the shared symbol");
// The symbol block must be emitted in the same string as the sprites that reference it,
// whatever the list of owned hardware is called.
assert(/floorSpriteSymbols\((owned|floorOwnedHardware\(\))\)\+(owned|floorBatches\(\))\.map\(/.test(inline),
  "The symbol block is not emitted alongside the sprites that reference it");
assert(inline.includes("`<svg class=\"miner-icon\" viewBox=\"0 0 64 46\" aria-label=\"${id} mining hardware illustration\">${minerArt(id)}${minerStatusSvg(id)}</svg>`"),
  "minerSvg no longer inlines the drawing, which its non-floor callers rely on");

// FORCED LAYOUT - reading offsetHeight mid-render forces a synchronous layout of the DOM the
// previous render wrote. Both sites use the value only to pin min-height while the scroll
// position is restored, so reading it when keepPosition is false is pure dead work.
assert(inline.includes("keepPosition?app.offsetHeight:0"),
  "render() reads offsetHeight unconditionally, forcing a layout whose result it discards");
assert(inline.includes("keepPosition?host.offsetHeight:0"),
  "renderMineContent() reads offsetHeight unconditionally, forcing a layout whose result it discards");
assert(!/,previousHeight=(app|host)\.offsetHeight;/.test(inline),
  "An unconditional offsetHeight read has come back into a render path");

// ORDER-BOOK DEPTH - the constraint that stops an early fortune being a free one.
assert(inline.includes("function tradeImpact("), "Order-book depth model is missing");
assert(inline.includes("function marketCapAt("), "Market capitalisation accessor is missing");
assert(inline.includes("const CAP=RECORDED.CAP"), "Recorded market cap series is not bound");
// Impact calibration is asserted behaviourally in check-engine-behaviour.mjs: a large early
// sale must move the price, the same order must be invisible in a deep market, and slicing
// must not dodge it. Those survive a retune; a pinned constant does not.
assert(inline.includes("function addPressure(") && inline.includes("PRESSURE_HALFLIFE"),
  "Standing market pressure and its decay are missing, so slicing an order would dodge the impact");
assert(/sellBtc[\s\S]{0,400}tradeImpact\(/.test(inline), "sellBtc does not apply order-book impact");
assert(/buyBtc[\s\S]{0,400}tradeImpact\(/.test(inline), "buyBtc does not apply order-book impact");
assert(inline.includes("marketPressure:{usd:0,at:0}"), "marketPressure is missing from the initial state");
assert(/state\.marketPressure=state\.marketPressure&&/.test(inline), "marketPressure has no save migration");
assert(inline.includes("transaction.depth"), "The confirmation modal does not show order-book impact before confirming");

assert(inline.includes("function hardwareFaultBreakdown(") && inline.includes("faultsByPart"), "Part-specific fault attribution is missing");
assert(inline.includes("function serviceHardwarePart(") && inline.includes('a==="service-part"'), "Targeted part-swap service action is not wired");
assert(inline.includes("PART_FAULT_LABELS"), "Part fault-cause labels are missing");
assert(inline.includes("function fleetServicingVisual()") && !inline.includes("function maintenanceVisual("), "Fleet servicing panel was not consolidated onto the Mine tab");
assert(inline.includes('data-action="focus-service"'), "Faulted floor sprites are not clickable to the servicing panel");
assert(inline.includes("Fleet health") && css.includes(".mine-top-metrics .metric-row"), "Fleet health metric tile is missing");
assert(!inline.includes("methodV2") && !inline.includes("methodV3"), "Redundant Method manual versions were not removed");
assert((inline.match(/data-anchor="method-/g) || []).length >= 4, "Mechanic cards are missing contextual links into Method");
assert(inline.includes('id:"fieldservice"') && inline.includes('branch:"Operations"'), "Field service technique skill is missing");
assert(inline.includes("const REPAIR_STAGES=[") && inline.includes('id:"stabilitycheck"'), "Multi-stage repair labour model is missing");
assert(inline.includes("job.stageDue") && inline.includes("REPAIR_COMPLICATIONS"), "Repair-stage complications are not wired into advanceMaintenance");
assert(inline.includes("contractorBusy"), "Contractor throughput cap is missing");
assert(inline.includes("fault spreading") || inline.includes("Fault spreading"), "Idle-fault escalation is missing");
assert(inline.includes('a==="toggle-overdrive"') && inline.includes("state.overdrive"), "Overdrive toggle is not wired");
assert(inline.includes("Load penalty") && css.includes(".energy-tariff-desk .metric-row"), "Energy load-penalty tile is missing");
assert(inline.includes("pending.resumeSpeed||state.returnSpeed||0") && inline.includes("resumeSpeed=state.speed||state.returnSpeed||0") && inline.includes("p.resumeSpeed||state.returnSpeed||0"), "Settlement/receivership speed-resume still falls back to 1 instead of 0");
assert(inline.includes("settlementSaleMode") && !inline.includes("function payPendingWithBtc"), "Settlement BTC rescue was not routed through the Market exchange flow");
assert(inline.includes('a==="cancel-settlement-sale"') && inline.includes("settlementBanner"), "Settlement sale-mode escape hatch or persistent banner is missing");
assert(inline.includes("state.pendingSettlement&&!state.settlementSaleMode?settlementModal()"), "Settlement modal is not gated by settlementSaleMode");
assert(inline.includes("MARKET_VENUES") && css.includes(".exchange-ticket-quote") && css.includes(".ticket-side.buy"), "Exchange trade-ticket redesign is missing");
assert(inline.includes('selectedVenue="mtgox"') && inline.includes('a==="select-venue"') && inline.includes("venueCard(selectedVenue)"), "Market tab no longer shows one selected venue ticket at a time");
assert(inline.includes('set("live-network-hash",fmtHash(competitiveHashAt(state.time,fs.hash)))') && inline.includes("competitiveHashAt(state.time,fs.hash))}</div><div class=\"subvalue\">recorded + unseen-miner floor"), "Displayed network hash no longer matches the effective competitive figure used for mining odds");
assert(inline.includes("function triggerImpactEffect()") && inline.includes('showToast(title,message,kind="info",tab=null,anchor=null,lifeMs=0)'), "Bad-event impact effect is not wired into showToast");
// The 3D floor tells the player what happened for ten seconds, and a lost context is rebuilt rather
// than being the end of the 3D floor for the session.
assert(inline.includes("lifeMs>0?lifeMs:toastLife()") && inline.includes("const FLOOR3D_NOTICE_MS=10000;"),
  "The 3D floor's notice does not last ten seconds, or showToast cannot be given a lifetime");
assert(inline.includes('showToast(title,`${happened} ${outcome}`,"warning",null,null,FLOOR3D_NOTICE_MS)'),
  "A 3D failure is not reported to the player with what happened");
assert(inline.includes('addEventListener("webglcontextlost",floor3dOnContextLost)') && inline.includes('addEventListener("webglcontextrestored",floor3dOnContextRestored)'),
  "The 3D floor does not handle both a lost and a restored context");
assert(/function floor3dOnContextLost\(event\)\{[\s\S]*?floor3dScheduleRecovery\(/.test(inline) && !/function floor3dOnContextLost\(event\)\{[\s\S]{0,200}state\.floorView="2d"/.test(inline),
  "A lost WebGL context switches the player to the flat floor for good instead of being rebuilt");
assert(/const FLOOR3D_RECOVERY_DELAYS=\[/.test(inline) && inline.includes("floor3dRecoveries>=FLOOR3D_RECOVERY_DELAYS.length"),
  "Recovery is not bounded, so a floor that can never draw would rebuild forever");
assert(/function floor3dDraw\(\)\{\s*try\{floor3dDrawNow\(\)\}/.test(inline) && /function floor3dUpdate\(\)\{\s*try\{floor3dUpdateNow\(\)\}/.test(inline),
  "An error while drawing or updating the 3D floor is not caught and reported");

// A card whose height follows its contents moves everything beneath it every refresh. The mempool
// mosaic is a window of fixed size: the same card height with no transactions as with three hundred.
assert(/\.mp-mosaic\{[^}]*\bheight:240px;[^}]*overflow:hidden/.test(css) && !/\.mp-mosaic\{[^}]*max-height/.test(css),
  "The mempool mosaic's height follows how many transactions it holds, so the dashboard jumps on every refresh");
assert(/\.mp-mosaic\{height:200px;/.test(css), "The mempool mosaic has no fixed height on a phone");
// On a phone the topbar has to stay put and the menu has to sit exactly beneath it. It was made
// position:relative below 900px for the XP bar's sake, scrolled away, and left the open menu hung
// 58px down the screen.
assert(/@media\(max-width:900px\)\{\s*\.topbar\{position:sticky;top:0\}\s*\.tabs\{top:var\(--topbar-live-h\)\}/.test(css),
  "The topbar is not sticky up to 900px, so it scrolls away and what sticks beneath it is left floating, or the tab row ignores its measured height");
assert(/\.mobile-nav\.open\{top:var\(--topbar-live-h\)\}/.test(css) && /\.mine-sections\{top:var\(--topbar-live-h\)\}/.test(css),
  "What sticks beneath the phone topbar is not offset by its measured height");
assert(inline.includes('setProperty("--topbar-live-h",bar+"px")') && inline.includes('window.addEventListener("resize",()=>measureTabRow())'),
  "The topbar's height is not measured, or not re-measured when the phone is rotated");
assert(css.includes(".impact-flash{") && css.includes(".impact-shake{") && css.includes(".toast.toast-bad{"), "Impact-flash/shake CSS is missing");
assert((inline.match(/,"bad"[,)]/g) || []).length >= 12, "Not enough bad-event call sites trigger the impact effect");
assert(inline.includes("state.facilityUpgradeJob={id,due:state.time+Math.ceil(days)*DAY,cost:f.cost,risk}") && inline.includes("function upgradingFacility()") && inline.includes("function fleetGrounded()"), "Facility upgrades no longer resolve as a timed, power-down job");
/* Reads the shared predicate rather than a hand-written comparison. Every "is this due yet"
   in the engine goes through dueBy/pendingAt now, so the boundary is asserted once, in the
   engine rule that owns it, instead of being re-spelled and re-pinned at each call site. */
assert(inline.includes("const upgradeJob=state.facilityUpgradeJob;if(upgradeJob&&dueBy(upgradeJob,state.time))"), "Facility-upgrade job is not resolved in the fleet lifecycle tick");
assert(inline.includes("busy=move||upgradeJob") && inline.includes('upgradeJob?"Site move in progress"'), "Facilities tab does not block new moves while a facility move is in flight");

/* THE LADDER GOES BOTH WAYS.
   An operator who has just sold half a fleet is the one who most needs to stop paying for the
   site it used to fill. The only hard gate is physical - the fleet has to fit, on floor space
   AND on peak electrical draw - and the card must read that answer from the same helper the
   action does, or it will offer a move that is then refused. */
assert(inline.includes("function facilityDownsizeBlockReason(") && inline.includes("function downsizeFacility(") && inline.includes("if(target<current)return downsizeFacility(id)"),
  "Downsizing is gone, or the facility action has gone back to being one-way");
assert(!inline.includes("Downsizing is not available in this build"), "The one-way refusal is back");
assert(/space>target\.space/.test(inline) && /kw>fs\.cap/.test(inline),
  "Downsizing no longer checks that the fleet fits the smaller site on both floor space and peak power");
/* And the fit is judged on the fleet that will EXIST there, not the one installed today.
   Machines already part-way through commissioning arrive whether or not the site shrank under
   them, so the gate has to carry committedLoad() into both comparisons. Dropping either term
   re-opens the stranding: the move is accepted, the crates land, the floor goes over its cap. */
assert(/const space=fs\.space\+inbound\.space,kw=fs\.potentialKw\+inbound\.watts\/1000/.test(inline),
  "Downsizing has stopped counting the machines still being commissioned into the fit test");
assert(inline.includes("const down=!active&&facilityIsDownsize(f.id),downBlock=down?facilityDownsizeBlockReason(f.id):\"\"") && inline.includes("(down?!!downBlock:state.cash<(f.cost+reserve))"),
  "The facility card no longer reads its disabled state from the same helper that refuses the move");
assert(inline.includes("facilityDownsizeCost(") && inline.includes("FACILITY_BREAK_MONTHS"),
  "Downsizing no longer charges a lease break rather than a fit-out");
assert(/if\(target<current\)return Math\.min\(\.2,/.test(inline),
  "A move down the ladder must still carry transit risk; it is a physical move");
/* Cooling plant is tiered, so a warehouse-sized plant cannot legally exist at workshop tier and
   nothing in the game could remove it - which made downsizing arithmetically impossible while
   telling the player to sell miners they had already sold. The plant is sold with the site, and
   the card says so before the move is dispatched. */
assert(inline.includes("function facilityCoolingShed(") && inline.includes("function facilityArrivalProbe(") && inline.includes("COOLING_SALVAGE"),
  "Downsizing no longer sheds the cooling plant the smaller site cannot host");
assert(inline.includes("const fs=fleet(facilityArrivalProbe(id,s))"),
  "The downsize fit check judges the fleet against plant the destination is not allowed to have");
assert(inline.includes("shed.items.forEach(item=>{delete state.thermal.equipment[item.id]})") && inline.includes("state.cash-=cost-shed.credit"),
  "The shed cooling plant is not actually removed, or its salvage is not credited");
assert(inline.includes("cooling unit${shed.items.reduce((n,i)=>n+i.qty,0)===1?\"\":\"s\"} sold with the site for"),
  "The facility card no longer discloses the cooling plant a downsize would sell");
assert(inline.includes('<span>Internet</span><strong style="color:${netDown?"var(--red)":"var(--green)"}">') && inline.includes('<span>Grid power</span><strong style="color:${powerDown?"var(--red)":"var(--green)"}">'), "Mining floor is missing visual internet/power status tiles");
assert(css.includes(".thermal-console{display:grid;grid-template-columns:repeat(4,minmax(0,1fr))"), "Thermal console grid was not widened for the new status tiles");

const sandboxContext={};
vm.runInNewContext(timelineSource.replace("const SANDBOX_END","var SANDBOX_END").replace("const OPERATOR_ERAS","var OPERATOR_ERAS"), sandboxContext);
assert(sandboxContext.SANDBOX_END===4947004800000, "SANDBOX_END drifted from the intended ~100-year horizon");
assert(sandboxContext.OPERATOR_ERAS.length===7 && sandboxContext.OPERATOR_ERAS[6].id==="frontier2", "Procedural-frontier operator era is missing or out of place");
assert(/performance=eraPoints\/\(OPERATOR_ERAS\.length\*100\)\*\d+/.test(inline), "Operator performance subscore still divides by a hardcoded era count");
assert(inline.includes("next>=SANDBOX_END&&state.sandbox&&!state.pendingSettlement") && inline.includes('state.endReason="sandbox-complete"'), "Sandbox continuation has no second, finite auto-end trigger");
assert(inline.includes('body.querySelector(\'[data-action="continue-run"]\')||state.endReason||state.time<END)return'), "The sandbox continuation must only be offered to a run that actually reached the recorded cutoff: a receivership in 2017 was being told the historical feed had ended");
assert(inline.includes("function futurePriceAt(") && inline.includes("function futureHashAt(") && inline.includes("function futureHeightAt(") && inline.includes("function futureChainSizeAt("), "Procedural continuation model for price/hash/height/chain-size is missing");
assert(!inline.includes("nextRand()") || !inline.slice(inline.indexOf("function futurePriceAt("), inline.indexOf("function futurePriceAt(")+2000).includes("nextRand()"), "Procedural price model must stay a pure function of time, not the live gameplay PRNG");
// Bitcoin issues whole satoshis. The 100-year continuation projects roughly
// twenty-five further halvings, and by the endpoint the subsidy is single-digit
// satoshis - exactly where a 50/2**n model starts paying fractions of a unit
// that cannot exist.
const historySource = await readFile(new URL("src/engine/history.js", root), "utf8");
const subsidySliceStart = historySource.indexOf("const FUTURE_HALVING_INTERVAL=");
const subsidySliceEnd = historySource.indexOf("function feeAt(", subsidySliceStart);
assert(subsidySliceStart >= 0 && subsidySliceEnd > subsidySliceStart, "The subsidy and halving-schedule block could not be extracted from history.js");
const subsidyContext = { Math, Date, Number };
vm.runInNewContext(
  timelineSource + "\n" + historySource.slice(subsidySliceStart, subsidySliceEnd) +
  "\nglobalThis.subsidyApi={subsidyAt,subsidySatsAt,subsidyHalvingIndex,halvingTimeAt,halvingIsProjected,nextHalvingTime,END,SANDBOX_END,DAY};",
  subsidyContext
);
const subsidy = subsidyContext.subsidyApi;
const firstProjectedHalving = subsidy.halvingTimeAt(5);
assert(subsidy.halvingIsProjected(5) && !subsidy.halvingIsProjected(4), "The fourth halving is recorded history; the fifth is the first projection");
assert(firstProjectedHalving > subsidy.END, "The first projected halving must fall after the recorded historical cutoff");
assert(new Date(firstProjectedHalving).toISOString().slice(0, 7) === "2028-04", "The first projected halving drifted away from April 2028");
assert(subsidy.subsidyAt(firstProjectedHalving - subsidy.DAY) === 3.125 && subsidy.subsidyAt(firstProjectedHalving) === 1.5625, "The first projected halving must take the subsidy from 3.125 BTC to 1.5625 BTC");
assert(subsidy.subsidyAt(firstProjectedHalving) === subsidy.subsidyAt(firstProjectedHalving + subsidy.DAY), "Mining rewards must use the reduced subsidy from the halving boundary onward, not a day later");
let projectedHalvings = 0;
for (let index = 5; subsidy.halvingTimeAt(index) <= subsidy.SANDBOX_END; index += 1) {
  const boundary = subsidy.halvingTimeAt(index);
  const before = subsidy.subsidySatsAt(boundary - subsidy.DAY);
  assert(subsidy.subsidySatsAt(boundary) === Math.floor(before / 2), "Projected halving " + index + " does not halve the subsidy on its own boundary");
  projectedHalvings += 1;
}
assert(projectedHalvings === 25, "The sandbox should contain 25 projected halvings, not " + projectedHalvings);
for (let t = subsidy.END; t <= subsidy.SANDBOX_END; t += subsidy.DAY * 7) {
  const sats = subsidy.subsidySatsAt(t);
  const day = new Date(t).toISOString().slice(0, 10);
  assert(Number.isInteger(sats) && sats >= 0, "The projected subsidy is not a whole number of satoshis at " + day);
  assert(Math.round(subsidy.subsidyAt(t) * 1e8) === sats, "The BTC subsidy and its satoshi value disagree at " + day);
}
assert(subsidy.subsidySatsAt(subsidy.SANDBOX_END) === 9, "By the 100-year endpoint the projected subsidy should be nine satoshis per block");
assert(subsidy.subsidyAt(subsidy.SANDBOX_END + subsidy.DAY * 365 * 200) === 0, "The subsidy must reach zero rather than pay a fraction of a satoshi");
assert(inline.includes("function fmtSubsidy(") && inline.includes("fmtSubsidy(subsidyAt(state.time))"), "The subsidy readout does not use the satoshi-aware formatter, so late-sandbox values render in scientific notation");
assert(inline.includes('log("Projected protocol halving"') && inline.includes("Modelled, not recorded: subsidy"), "The sandbox halving Ledger entry must be labelled as a projection, not as recorded history");
assert(inline.includes('showToast("Projected protocol halving"') && inline.includes("Review your mining margin"), "The sandbox halving notification must name the projection and recommend reviewing mining margin");
assert(inline.includes('notice:"Rules change"') && css.includes(".toast.toast-notice{") && inline.includes('earns half the subsidy it did yesterday.`,"notice","mine")'), "A halving that has already cut the subsidy must not be labelled an advance warning; it needs the rules-change kind");
// The continuation decision has to say all four things before the player commits:
// what stops, what continues as a model, that the model is deterministic, and that
// the issuance schedule keeps cutting mining income on projected dates.
assert(inline.includes("function sandboxContinuationNote()") && inline.includes('insertAdjacentHTML("beforebegin",sandboxContinuationNote())'), "The sandbox continuation decision no longer explains itself before the player commits");
assert(["Stops at the cutoff", "Continues as a model", "Continues as protocol"].every(label => inline.includes(label)), "The sandbox decision no longer separates what stops, what is modelled and what is protocol");
assert(inline.includes("No new historical chapters and no new hardware releases are invented"), "The sandbox decision must state that no new recorded news or hardware is invented after the cutoff");
assert(inline.includes("chain size and block height continue through deterministic modelled projections"), "The sandbox decision must name the series that continue procedurally");
assert(inline.includes("constant ten-minute block interval"), "Projected halving dates must be attributed to the constant ten-minute block interval that produces them");
assert(inline.includes('id:"sandbox-start"') && inline.includes('anchor:"method-sandbox"'), "The first sandbox briefing is missing, or no longer links to the Method sandbox chapter");
assert(inline.includes('${tip.anchor?`data-anchor="${tip.anchor}"`:""}'), "Operator briefings can no longer deep-link to a Method chapter");

/* The timeline moved to its own module when content.js reached the ceiling. This reads the
   whole file rather than slicing an array out of a larger one - there is nothing else in it. */
const eventsSource = await readFile(new URL("src/data/events.js", root), "utf8");

/* EVERY EVENT CARRIES ITS RECEIPT, AND THE FEED SHOWS IT.

   The game claims to be a historical replay, so each entry names a source. That was true of
   the data and false on screen: the link was hardcoded to the genesis block, so seventy-seven
   citations sat in the file where no player could ever reach them - data implying a behaviour
   that did not exist. The link is generic now, with genesis keeping its own wording, and an
   entry with no citation renders no link rather than an empty one. */
assert(/\$\{feature\.url\?`<div class="story-source">/.test(renderSource),
  "The story feed no longer links an event to its source, or links it unconditionally");
assert(/feature\.id==="genesis"\?"Read the Bitcoin whitepaper"/.test(renderSource),
  "The genesis block lost its own wording in the story feed");
assert(/Source: \$\{escapeHtml\(feature\.src\|\|""\)\}/.test(renderSource),
  "An event's source is no longer named, or is being interpolated without escaping");

/* And the shape of the data itself, because this is the dataset most likely to be added to by
   hand. Each of these has a reason: a duplicate id silently shadows an event in state.seen, a
   missing dek or body renders a blank card, an imp outside 1-3 either never fires or awards a
   skill point it should not, and a src without a url (or the reverse) is half a citation. */
const eventEntries = [...eventsSource.matchAll(/\{id:"([^"]+)",date:"(\d{4}-\d{2}-\d{2})",[^\n]*/g)]
  .map(match => ({ id: match[1], date: match[2], line: match[0] }));
assert(eventEntries.length >= 78, `The timeline has shrunk to ${eventEntries.length} events`);
const seenEventIds = new Set();
for (const entry of eventEntries) {
  assert(!seenEventIds.has(entry.id), `Two timeline events share the id "${entry.id}"; the second can never be marked seen`);
  seenEventIds.add(entry.id);
  for (const field of ["title:", "dek:", "body:", "cat:", "imp:"]) {
    assert(entry.line.includes(field), `Timeline event "${entry.id}" is missing ${field.slice(0, -1)}`);
  }
  const imp = Number((entry.line.match(/imp:(\d)/) || [])[1]);
  assert(imp >= 1 && imp <= 3, `Timeline event "${entry.id}" has imp ${imp}, outside 1-3`);
  /* A closed list, so a typo fails rather than quietly becoming a seventh category. It is
     seven because writing this check found one: WikiLeaks is filed under "civil society",
     which is a deliberate choice and reads correctly on screen, but was invisible to every
     earlier survey of the data because a \w+ pattern stops at the space. */
  const cat = (entry.line.match(/cat:"([\w ]+)"/) || [])[1];
  assert(["network", "markets", "adoption", "custody", "policy", "geopolitics", "civil society"].includes(cat),
    `Timeline event "${entry.id}" has an unknown category "${cat}"`);
  const hasSrc = /src:"/.test(entry.line), hasUrl = /url:"/.test(entry.line);
  assert(hasSrc === hasUrl,
    `Timeline event "${entry.id}" has ${hasSrc ? "a source with no link" : "a link with no source"} - half a citation`);
}
const hardwareSource = await readFile(new URL("src/data/hardware.js", root), "utf8");
for (const [label, source] of [["historical event", eventsSource], ["hardware release", hardwareSource]]) {
  for (const [, date] of source.matchAll(/date:"(\d{4}-\d{2}-\d{2})"/g)) {
    assert(Date.parse(date + "T00:00:00Z") <= subsidy.END, "A " + label + " is dated " + date + ", after the recorded cutoff - the sandbox must not invent recorded history");
  }
}

assert(inline.includes('["Effective fee",state.mode==="pool"?'), "Pools quick-stat strip shows a fee while solo mining");
assert(inline.includes("function poolClosed(") && inline.includes('closed:"2013-06-30"') && inline.includes('state.mode==="pool"&&poolClosed(state.pool)') && inline.includes("function miningConnectionPanel()"), "Pool shutdown fail-over to solo mining is missing");
assert(inline.includes("t>=at(p.date)&&!poolClosed(p.id,t)"), "The dashboard pool-concentration chart bypasses the pool-closure filter");
assert(inline.includes('percentageControl("custody-transfer"') && inline.includes('data-percent-id="custody-transfer"'), "Custody hot/cold transfer no longer uses a single one-shot slider");
assert(inline.includes("lightningBadge=lightningOk?") && inline.includes('locked"}"><div class="card-head"><h2>Lightning routing liquidity'), "Lightning card is not visually gated before it unlocks");
assert(inline.includes("function refreshMarket()") && inline.includes('id="market-price-headline"') && inline.includes("data-live-bid"), "Market tab price no longer refreshes on the cheap live-tick path");
assert(inline.includes("const TX_COUNT=Math.max(0,Math.min(300,txDay))"), "Mempool 'next block' mosaic no longer scales with real transaction volume");
assert((inline.match(/title="\$\{/g) || []).length >= 20, "Not enough disabled controls explain themselves on hover");
assert(/if\(!needsFull&&state\.started&&!state\.activeEvent&&!state\.ended\)refreshLive\(\);else renderMineContent\(\);/.test(inline), "Fault-driven full renders no longer route through the scroll-coordinated Mine path");
/* Frame alignment is still required, but it is no longer the only mechanism - see the
   queueRender block further down, which asserts the frame, the timer that covers a tab the
   frame never comes to, and the token that stops the two from defeating the throttle. */
assert(inline.includes("setTimeout(()=>requestAnimationFrame(paintIfCurrent),delay)"), "Queued renders are no longer frame-aligned, which is what made 16x speed jitter");
assert(inline.includes("state.speed>=16?600:"), "The high-speed render throttle is gone; faster clocks must repaint less often, not more");
assert(inline.includes("function captureScrollAnchor()") && inline.includes("function restoreScrollAnchor(anchor)") && inline.includes("const anchor=keepPosition?captureScrollAnchor():null"), "Repaints no longer anchor on the card the reader is looking at, so content inserted above the viewport will silently push the page down");
assert(inline.includes("save();renderMineContent();") && !/log\("Spare parts ordered"[^;]*\);save\(\);render\(\);/.test(inline), "Ordering spare parts still rebuilds the whole page instead of patching the Mine tab");
assert(inline.includes("now-lastImpactAt<4000") , "The bad-event screen shake is no longer throttled, so a run of faults throws the page around");
const renderScrolls = (renderSource.match(/window\.scroll(?:To|By)\(\{[^}]*\}/g) || []);
assert(renderScrolls.length>=3 && renderScrolls.every(call => call.includes('behavior:"instant"')), "Every scroll restore in the render path must be instant, or it visibly animates during a fault burst (user-initiated smooth scrolling in events.js is fine)");
assert(inline.includes('if(stage.id==="work"&&!job.auto&&job.contracted&&!job.workDone){') && inline.includes("job.oldRemoved=!job.part;"), "Full-refurbishment jobs no longer get a manual repair puzzle alongside targeted part swaps");
assert(!inline.includes("function asicEfficiencyTimelineHtml(") && inline.includes("Best available efficiency"), "ASIC efficiency table was not folded into the profitability desk");
assert(inline.includes("forecast.cashAfter<0?") && inline.includes('class="status-banner forecast-warning-banner"'), "Proactive cash-shortfall warning banner is missing");
assert(inline.includes("function connectivityPingMs()") && inline.includes("ms to ${state.mode"), "Mining floor is missing a connectivity ping reading");
assert(inline.includes("function incomingFleetVisual()") && !inline.includes("function quickCommission") && inline.includes('class="card span-12 incoming-fleet"'), "Order/commissioning pipeline was not unified into one prominent view");
assert(inline.includes("faultedFraction>.05") && inline.includes("openFaultFraction>.05") && !inline.includes('health<65||faults?"var(--red)"') && !inline.includes('avgHealth<65||openFaults?"var(--red)"'), "Fleet health colors are still presence-based instead of proportional to fleet size");
assert(inline.includes("const MILESTONES=[") && inline.includes('id:"centurion"') && inline.includes("check:()=>state.time>=SANDBOX_END"), "Milestone roster was not extracted into a top-level data array");
assert(inline.includes("state.milestoneLog.push({id:m.id,time:state.time})") && inline.includes('log(`Milestone: ${m.label}`,"+1 skill point","milestone")'), "Milestone hits are not timestamped and categorised");
assert(inline.includes('toast-${kind}') && inline.includes('milestone:"Milestone reached"') && css.includes(".toast.toast-milestone{"), "Milestone toasts do not get distinct styling and language from bad-event toasts");
assert(inline.includes("(state.milestones?.length||0)/MILESTONES.length*80"), "Milestone score component still divides by a hardcoded count instead of the roster length");
assert(inline.includes('e.fx==="computenorthx"') && inline.includes('e.fx==="corescix"') && inline.includes('e.fx==="riotx"'), "Rival lifecycle events are not wired into applyEvent");
// The glut now reaches BOTH sides of the market through hardwareMarketFactor: it softens what
// you can sell for and what you must pay, which is what a liquidation actually does.
assert(inline.includes("state.hardwareGlut&&t<state.hardwareGlut.until?1-state.hardwareGlut.discount:1")
  && inline.includes("h.cost*hardwareMarketFactor(h)*RESALE_HAIRCUT"),
  "Hardware resale value does not react to a rival bankruptcy glut");
assert(inline.includes('const CAREER_KEY="hashrate-career-v1"') && inline.includes("function recordCareerRun()") && inline.includes("function loadCareer()"), "Cross-run career persistence is missing");
assert(inline.includes("function runRecap()") && inline.includes('class="run-recap"') && inline.includes("${runRecap()}${careerSummaryHtml(\"end\")}"), "End-of-run narrative recap is missing from the end screen");
assert(inline.includes('${careerSummaryHtml("intro")}'), "Career summary is missing from the campaign-start screen");
assert(inline.includes("function rivalLandscapeCard()") && inline.includes("RIVAL_OPERATORS") && inline.includes("${rivalLandscapeCard()}"), "Rival operator landscape card is missing from Pools");
assert(inline.includes("function milestonesLedgerSection()") && inline.includes("${milestonesLedgerSection()}"), "Milestone list is missing from the Ledger tab");
assert(inline.includes("const WALLET_SOFTWARE=[") && inline.includes('id:"modern"') && inline.includes("function walletSoftwareTierAt("), "Wallet software lineage data or tier-lookup helper is missing");
assert(inline.includes("function rollDie()") && inline.includes("crypto.getRandomValues"), "Dice-roll entropy ceremony is not using real browser randomness");
assert(inline.includes("function walletSetupModal()") && inline.includes("state.started&&!state.walletSetup.done?walletSetupModal()"), "Wallet-setup ceremony is not wired into the modal stack");
assert(inline.includes('log(`Upgraded to ${tier.name}`,"+1 skill point","milestone")') && inline.includes('showToast(`Upgraded to ${tier.name}`') , "Wallet-software upgrades do not use the milestone reward convention");
assert(!inline.includes('"Bitcoin Core runs on the Basic laptop') && !inline.includes('"Bitcoin Core shares the mining laptop"'), "Wallet-client copy is still hardcoded to Bitcoin Core regardless of the in-game date");
assert(inline.includes("function walletClientCard()") && inline.includes("${walletClientCard()}${backupNodeCard()}"), "Custody is missing the Wallet client upgrade card");
assert(inline.includes('state=initialState();OPERATOR_ERAS.forEach(era=>state.operator.eras[era.id]={months:0,solvent:0,profitable:0,uptime:0,competitive:0});migrateActivity(state)'), "resetGame() no longer seeds per-era operator stats, which crashes the dashboard's Operator Score card on New run");
assert(inline.includes('id:"cryptomailinglist"') && inline.includes('date:"2008-10-31"') && inline.includes('id:"bitcoindev"'), "The real cryptography-mailing-list and bitcoin-dev learning items are missing or misdated");
assert(inline.includes('awardLearning(LEARNING.find(x=>x.id==="cryptomailinglist"))'), "The cryptography mailing list is not auto-credited at campaign start");
assert(inline.includes("function buildQueueCard()") && inline.includes("${buildQueueCard()}"), "Dashboard is missing the unified build-queue card");
assert(inline.includes('if(stage.id==="work"&&!job.auto&&job.contracted&&!job.workDone){') && inline.includes('awaitingInput=!!(job&&!job.auto&&job.contracted&&') && inline.includes('const workPuzzle=job&&!job.auto&&job.contracted&&'), "You must be the one servicing your own kit before technicians are hired: the manual puzzle belongs to self-serviced jobs, not to a hired technician crew");
assert(inline.includes("function initRepairPuzzle(job)") && inline.includes("function repairPuzzleRequired(job)") && inline.includes("if(repairPuzzleRequired(state.maintenance.serviceJobs[state.maintenance.serviceJobs.length-1]))initRepairPuzzle("), "Repair-puzzle state is not initialised at job creation, so the puzzle can render with dead controls until the clock advances past the Work stage");
assert(!inline.includes("An outside contractor is already covering another repair") && !inline.includes("An external technician is covering the job.") && !inline.includes("outside contractors cost 35% more"), "Self-serviced repairs still tell the player an outside contractor is doing work they have to perform themselves");
assert(inline.includes("byPart[job.part]=0;") && inline.includes("hardwareFaultCount(h)>0?boosted:Math.max(70,boosted)"), "A completed targeted part-swap no longer fully clears that part's fault count, or lost its headroom over the same-tick wear pass that would otherwise erode it back under the 65% offline threshold");
assert(inline.includes("function faucetMarkup(") && inline.includes('host.insertAdjacentHTML("beforeend",faucetMarkup(faucet))') && !inline.includes("faucetTimer=setTimeout(()=>{faucet=null;render()}"), "The Bitcoin Faucet popup forces a full page re-render instead of a targeted DOM patch");
assert(inline.includes('id:"laptopfan"') && inline.includes('id:"asicfan"') && inline.includes('id:"hashboardearly"') && inline.includes('id:"hashboardmodern"') && inline.includes("function hashboardTierFor(") && inline.includes("function fanTierFor("), "Tiered, era-scaled spare parts are missing");
assert(inline.includes('"Block reward (today)"') && inline.includes("`Block reward ×${blocks} (today)`"), "Solo block-reward ledger label no longer clarifies it's the day's total, not a single block's reward");
assert(inline.includes('if(activeTab==="dashboard"&&state.speed>0)refreshDashboardVisuals()'), "The mempool/dashboard live-refresh timer no longer respects pause");
assert(inline.includes("const EXPOSURE_WARNINGS=[") && inline.includes('id:"mtgoxwarn"') && inline.includes('id:"quadrigawarn"') && inline.includes('id:"ftxwarn"') && inline.includes('id:"chinawarn"'), "The historically-grounded exposure warnings are missing");
assert(!inline.includes('id:"bitfinexwarn"') && !inline.includes('id:"kazakhwarn"'), "Bitfinex's 2016 hack and Kazakhstan's 2022 blackout had no genuine public advance warning and must not be given a fabricated one");
assert(inline.includes("function queueExposureWarnings(prev,next)") && inline.includes("queueExposureWarnings(prev,next);") && inline.includes("state.exposureWarned.push(w.id)"), "Exposure warnings are not fired from tick(), or no longer track their own one-time state");
assert(!inline.includes("state.seen.push(w.id)"), "An exposure warning must never mark its event id in state.seen - that would make the real collapse silently skip applyEvent()");
assert(inline.includes('warning:"Advance warning"') && inline.includes('toast-${kind}') && css.includes(".toast.toast-warning{") && css.includes(".exposure-warning-banner{"), "The amber 'warning' toast kind is missing its markup branch, label or styling");
assert(inline.includes("exposureBanners=EXPOSURE_WARNINGS.filter(") && inline.includes("${forecastBanner}${exposureBanners}"), "The persistent exposure-warning banner is not computed or not spliced into the banner family");
assert(inline.includes("restored.exposureWarned=Array.isArray(restored.exposureWarned)?restored.exposureWarned:[]"), "importSave() does not guard the exposureWarned array");
assert(inline.includes('id:"benchskills"') && inline.includes('id:"partssourcing"') && inline.includes('id:"supplychain"') && inline.includes('id:"practisedhands"') && !/id:"(benchskills|partssourcing|supplychain|practisedhands)"[^}]*minFacility/.test(inline), "The four hardware self-help skills are missing, or gated behind a facility tier that would force the player to hire instead");
assert(inline.includes("labor=plan.contracted?0:Math.max(40") && inline.includes("labor=plan.contracted?0:Math.max(25"), "Servicing your own fleet must not charge fiat labour - only a technician crew is paid");
assert(inline.includes("function selfDamageChance(h)") && inline.includes("function selfRepairMistake(job,message)") && inline.includes("selfRepairMistake(job,"), "Fumbling a self-serviced repair no longer risks damaging the machine");
assert(inline.includes("function selfRepairExperience(id)") && inline.includes("store[job.id]=selfRepairExperience(job.id)+1"), "Completed self-serviced repairs no longer build per-hardware experience, so the damage risk cannot decay with practice");
assert(inline.includes("function selfAutoCompleteChance(h)") && inline.includes("if(job.selfAuto){completeRepairWork("), "Practised hands cannot auto-finish a familiar self-serviced repair");
assert(inline.includes("function sparePartCost(part)") && inline.includes('hasSkill("partssourcing")?.8:1') && inline.includes("function partsLeadDays()") && inline.includes('hasSkill("supplychain")?.6:1'), "Spare-part pricing or restock lead time no longer responds to the sourcing and supply-chain skills");
assert(inline.includes("function dismissStaff(id)") && inline.includes('a==="dismiss-staff"') && inline.includes("state.billLedger.staff=(state.billLedger.staff||0)+role.salary") && inline.includes("if(!techs&&state.autoRepair)state.autoRepair=false"), "Staff cannot be dismissed, dismissal is free of notice cost, or losing the last technician leaves auto-repair stuck on");
assert(inline.includes("function selfServiceBench(owned)") && inline.includes("${selfServiceRelevant()?selfServiceBench(owned):\"\"}") && inline.includes("function selfServiceRelevant()") && css.includes(".self-service-bench{"), "The Mine floor is missing the self-service bench panel, its styling, or the check that shows it whenever no technician is free");
assert(inline.includes("function operatorLevel(total)") && inline.includes("function xpForLevel(level)") && inline.includes("function levelAwardsPoint(level)") && inline.includes("function awardXp(amount,source)"), "The operator XP model is missing");
const operatorIdx = appScripts.indexOf("src/engine/operator.js"), simulationIdx = appScripts.indexOf("src/engine/simulation.js");
/* render-queue.js owns the repaint flags as top-level `let` bindings. Nothing in simulation.js
   reaches them at load today - verified, and the wrong order does boot cleanly - so this
   assertion is a precaution rather than a live requirement. It is worth pinning anyway: the
   flags are set from all over the engine, simulation.js runs 146 top-level statements, and the
   first migration to touch one would crash on load for whichever saves take that path. */
const renderQueueIdx = appScripts.indexOf("src/engine/render-queue.js");
assert(renderQueueIdx >= 0 && renderQueueIdx < simulationIdx,
  "src/engine/render-queue.js must load BEFORE src/engine/simulation.js: it declares the repaint flags with let, and simulation.js touches them at load through its migration block");
assert(operatorIdx >= 0 && simulationIdx >= 0 && operatorIdx < simulationIdx, "src/engine/operator.js must load BEFORE src/engine/simulation.js: the migration block calls normalizeXp() at the top level, and reversing them aborts the whole engine on load");
assert(/const XP_LEVEL_STEP=60,SHARE_WORK=4294967296;/.test(operatorSource) && !/const XP_LEVEL_STEP/.test(simulationSource), "The XP constants belong in operator.js alongside the functions that use them");
assert(inline.includes('awardXp(1.2*Math.log2(1+shares),"shares")') && inline.includes('"record")') && inline.includes('"deploy")') && inline.includes('"repair")'), "XP is no longer earned from all four sources (shares, best-share records, deployment, repairs)");
assert(inline.includes("Math.log2") && inline.includes("function dailyShareCount(hash)"), "Share XP must stay logarithmic in hashrate, or an eleven-order-of-magnitude fleet range breaks the curve");
assert(inline.includes("if(levelAwardsPoint(level)){state.points++"), "Levelling up no longer grants skill points");
assert(inline.includes("mastery=Math.min(60,Math.max(0,(state.xp?.peakLevel||1)-1)/49*60)") && inline.includes("performance=eraPoints/(OPERATOR_ERAS.length*100)*740") && inline.includes("Math.round(performance+mastery+milestones+holdings+balance+resilience)"), "Peak operator level no longer augments the Operator Score, or the 1,000-point total no longer balances");
assert(inline.includes("function normalizeXp(raw)") && inline.includes("state.xp=normalizeXp(state.xp)") && inline.includes("restored.xp=normalizeXp(restored.xp)"), "XP state is not normalised on load or on import");
assert(inline.includes('id="live-xp-fill"') && inline.includes('set("live-xp-level"') && css.includes(".xp-meter{") && css.includes(".xp-track i{"), "The header XP bar is missing, or no longer updates on the live tick");
assert(/@media\(max-width:900px\)\{\.topbar\{position:relative\}\.xp-meter\{position:absolute/.test(css), "The narrow-screen XP bar must collapse to a hairline strip under the topbar, or it squeezes the brand and clock into each other");
assert(inline.includes('class="xp-breakdown"') && inline.includes("Best-share records"), "The dashboard XP source breakdown is missing");
// The drawings live in minerArt() so the floor can share them by reference; this guards the
// behaviour (one distinct drawing per machine) rather than which function holds it.
const minerArtBody = (inline.match(/function minerArt\(id\)\{[\s\S]*?\n\}/) || [""])[0];
assert(minerArtBody && !/\(\s*id===\"[^\"]+\"\s*\|\|\s*id===\"[^\"]+\"/.test(minerArtBody), "Two hardware ids share one miner drawing - every machine needs its own art (this is how the Radeon HD 5870 and the six-GPU open rig ended up identical)");
assert(minerArtBody.includes('id==="gpurig"?'), "The six-GPU open rig no longer has its own drawing");
// Payout schemes were invented at particular moments. A pool must never be
// shown running one before it existed - that is exactly the kind of detail a
// mining audience checks first.
const poolsSource = await readFile(new URL("src/data/network.js", root), "utf8");
const SCHEME_INVENTED = { prop: "2010-01-01", score: "2010-11-01", pplns: "2011-01-01", pps: "2011-01-01", fpps: "2014-01-01", ppsplus: "2016-08-01", tides: "2023-11-28", solo: "2009-01-03" };
const schemeRows = [...poolsSource.matchAll(/schemes:\[(.*?)\]\]/gs)].map(m => m[1] + "]");
assert(schemeRows.length >= 14, "Pool payout schemes are no longer expressed as dated timelines");
const anachronisms = [];
for (const row of schemeRows) {
  for (const entry of row.matchAll(/\["(\d{4}-\d{2}-\d{2})","(\w+)",([\d.]+)\]/g)) {
    const [, date, scheme] = entry;
    assert(SCHEME_INVENTED[scheme], `Unknown payout scheme "${scheme}" in a pool timeline`);
    if (Date.parse(date) < Date.parse(SCHEME_INVENTED[scheme])) anachronisms.push(`${scheme} at ${date}`);
  }
}
assert(anachronisms.length === 0, `A pool runs a payout scheme before that scheme existed: ${anachronisms.join(", ")}`);
assert(inline.includes("function poolTermsAt(id=state.pool,t=state.time)") && inline.includes("function poolFeeAt(id,t)"), "Pool fees and schemes are no longer resolved against the in-game date");
assert(/slush[\s\S]{0,120}"score"[\s\S]{0,60}"2023-12-12","fpps"/.test(poolsSource), "Slush ran a score-based payout from 2010 and only moved to FPPS on 12 December 2023");
assert(/viabtc[\s\S]{0,120}"2016-08-01","ppsplus"/.test(poolsSource), "ViaBTC invented PPS+ in August 2016; its timeline should reflect that");
const orientationTabs = ["mine","pools","market","custody","facilities","energy","finance","learn","tech","ledger","method"];
assert(inline.includes('class="card section-pulse section-orientation"') && inline.includes("What this page is for") && inline.includes("Current situation") && inline.includes("Recommended next step") && inline.includes("Why it matters"), "The reusable page-orientation structure is missing a required decision layer");
assert(orientationTabs.every(tab=>new RegExp(`(?:^|\\s)${tab}:\\{purpose:`).test(inline)), "One or more non-Dashboard tabs is missing its page purpose and state-aware orientation copy");
assert(css.includes(".section-orientation{") && css.includes(".orientation-guide{") && css.includes("@media(max-width:700px){.orientation-intro"), "Page orientation is missing its desktop or mobile layout");
assert(inline.includes("Your machines are mining.") && inline.includes("Self-held BTC") && inline.includes("BTC held by others") && inline.includes("Site power used"), "Dashboard still relies on technical or ambiguous labels instead of the Phase 3 operating language");
assert(inline.includes("Choose machines that can earn more than they cost to run.") && inline.includes("A pool combines many miners' work") && inline.includes("Your keys decide who can spend your bitcoin.") && inline.includes("Know what today's mining load costs."), "A core operating tab has lost its newcomer-readable Phase 3 entry copy");
assert(inline.includes("const PAGE_HELP={") && orientationTabs.every(tab=>new RegExp(`(?:^|\\s)${tab}:\\{anchor:\"method-`).test(inline)), "One or more operating tabs is missing reusable contextual help or a Method destination");
assert(inline.includes("function contextualHelp(tab)") && inline.includes("Terms and help") && inline.includes("What do these numbers mean?") && inline.includes("How ${help.label} works in this simulation"), "The expandable contextual-help component is missing its definition or simulation-reference layers");
assert(inline.includes("function enhanceDisabledControls()") && inline.includes('button.action:disabled') && inline.includes('a==="blocked-help"') && inline.includes("Why this is unavailable"), "Disabled actions do not expose a touch-accessible blocker explanation");
assert(inline.includes('control.setAttribute("aria-describedby",id)') && inline.includes('description.className="sr-only"') && css.includes(".blocked-help{") && css.includes(".sr-only{"), "Blocked-action help is missing its accessible description or visible touch target");
// Method is eight named chapters behind a table of contents. Chapter ids and section
// ids are written into the markup rather than matched by heading text at runtime, and a
// deep link has to open the collapsed chapter it points inside before it can scroll to it.
assert(inline.includes('data-value="method" data-anchor="${help.anchor}"') && inline.includes('else if(a==="tab"){activeTab=openTab(v)') && inline.includes("setTimeout(()=>revealMethodAnchor(anchor),60)"), "Contextual help cannot deep-link to the relevant Method chapter");
assert(inline.includes("function revealMethodAnchor(id)") && inline.includes('if(node.tagName==="DETAILS")node.open=true'), "A deep link into a collapsed Method chapter cannot scroll to a target the browser is still hiding");
assert(!inline.includes("ensureMethodAnchors"), "Method anchors are written into the markup now; the runtime heading-text matcher must not come back");
// The chapter prose moved to its own module when method.js reached the size ceiling; the
// renderer stayed behind. This check is about the chapters, so it follows them.
/* The prose now lives in two modules - the fleet chapter grew large enough to need its own -
   so "the Method prose" is both of them, and every text search below reads the pair. Splitting
   content must not be able to hide content from these checks. */
const methodComposerSource = await readFile(new URL("src/ui/tabs/method-chapters.js", root), "utf8");
const methodFleetSource = await readFile(new URL("src/ui/tabs/method-chapters-fleet.js", root), "utf8");
const methodSource = methodComposerSource + "\n" + methodFleetSource;
/* Chapter identity and ORDER come from the composer's array, reading an inlined chapter and an
   extracted one as equal members of it. Executing methodChapters() would be stronger still,
   but the bodies are template literals that call window, fmtNum and sourceTag at evaluation
   time, and stubbing the whole render surface to read eight ids would be a fragile way to
   learn very little. What matters is that the manual still opens as eight chapters in a known
   order, and that a chapter moved into its own module is still one of them. */
const methodChapterIds = [...methodComposerSource.matchAll(/\{id:"(method-[a-z]+)",title:|(methodFleetChapter)\(\)/g)]
  .map(match => match[1] || "method-fleet");
/* And the extracted module really does supply the chapter the composer is calling for: without
   this, deleting the fleet prose entirely would leave the order assertion above still passing
   on the strength of the function call alone. */
assert(/function methodFleetChapter\(\)/.test(methodFleetSource),
  "method-chapters-fleet.js no longer defines methodFleetChapter(), so the composer calls nothing");
assert(/return \{id:"method-fleet",title:/.test(methodFleetSource),
  "methodFleetChapter() no longer returns the fleet chapter itself");
assert(/summary:"/.test(methodFleetSource) && /lead:"/.test(methodFleetSource) && /body:`/.test(methodFleetSource),
  "The fleet chapter lost its summary, lead or body in the split");
assert(methodChapterIds.length === 8, `Method should open as eight named chapters, not ${methodChapterIds.length}`);
assert(methodChapterIds[0] === "method-start" && methodChapterIds[7] === "method-sandbox", "Method must open on Start here and close on the procedural sandbox");
assert(inline.includes("function methodTocHtml(chapters)") && inline.includes('data-action="method-chapter"') && inline.includes('else if(a==="method-chapter")revealMethodAnchor(id)'), "The Method table of contents is missing, or its links do not open the chapter they name");
assert(inline.includes('<details class="method-chapter" id="${chapter.id}"') && inline.includes("method-chapter-lead"), "Method chapters are no longer collapsible, or have lost their plain-language lead");
// Exact formulas belong behind a disclosure, not in the first thing a newcomer reads.
const methodDetails = (methodSource.match(/<details class="method-detail">/g) || []).length;
assert(methodDetails >= 8, `Method should keep its exact calculations behind a disclosure; only ${methodDetails} sections do`);
assert(css.includes(".method-detail{") && css.includes(".method-detail>summary{cursor:pointer") && css.includes(".method-detail>summary{min-height:40px}"), "Method detail disclosures are missing their styling or their mobile touch target");
assert(inline.includes("function methodDetailIds(body,chapterId)") && inline.includes('e.target.classList?.contains("method-detail")'), "An opened Exact calculation must survive a repaint like the chapter around it");
for (const heading of ["method-mining", "method-energy", "method-facilities", "method-connectivity", "method-firmware"]) {
  const start = methodSource.indexOf(`id="${heading}"`);
  const end = methodSource.indexOf("<h3", start + 1);
  assert(methodSource.slice(start, end < 0 ? undefined : end).includes('<details class="method-detail">'), `The ${heading} section still puts its exact calculation in the first thing a newcomer reads`);
}
assert(inline.includes("const methodOpenChapters=new Set([\"method-start\"])") && inline.includes('${methodOpenChapters.has(chapter.id)?"open":""}') && inline.includes('e.target.classList?.contains("method-chapter")||e.target.classList?.contains("method-detail")'), "A chapter the reader opened must survive the next simulation tick; render() rebuilds the tab from a template and would otherwise snap it shut");
assert(inline.includes('data-help-tab="${tab}" ${openContextHelp.has(tab)?"open":""}') && inline.includes('e.target.classList?.contains("context-help")'), "An opened Terms and help disclosure must survive a repaint for the same reason a Method chapter does");
assert(["method-mining","method-hardware","method-maintenance","method-firmware","method-energy","method-facilities","method-connectivity","method-market","method-custody","method-xp","method-progression","method-finance","method-risk","method-events","method-reference","method-ledger"].every(id => methodSource.includes(`id="${id}"`)), "A mechanic lost its precise Method section target");
assert(inline.includes("function recordedMetricSnapshot()") && !inline.includes("alpha25EnhanceMethod") && !inline.includes("alpha24EnhanceMethod"), "Dataset provenance belongs in the Method sources chapter, not in a stack of bootstrap innerHTML patches");
assert(["What stops at the cutoff","What continues as a model","What continues as protocol","Whole satoshis"].every(heading => methodSource.includes(heading)), "The procedural-sandbox chapter no longer separates what stops, what is modelled, what is protocol and how satoshis are floored");
assert(inline.includes("function feedbackKind(") && inline.includes("function feedbackLabel(") && ["Action needed","Advance warning","Cannot do that","Milestone reached","Completed"].every(label=>inline.includes(label)) && inline.includes('aria-live="${assertive?"assertive":"polite"}'), "Phase 5 feedback has lost its semantic kinds, human-readable status labels or accessible live-region priority");
assert(css.includes(".toast.toast-success{") && css.includes(".toast.toast-blocked{") && inline.includes("Open ${escapeHtml(t.tab)}"), "Success and blocked feedback lack distinct styling or a clear destination action");
assert(inline.includes("function transactionImpact(transaction)") && inline.includes("Operational consequence") && inline.includes("You give now") && inline.includes("Position afterward"), "Transaction review no longer separates the immediate exchange, operational consequence and resulting position");
assert(inline.includes("function eventGameplayEffect(e)") && ["What happened","Why it mattered","Effect on your operation","CONTEXT · NOT CAUSATION"].every(label=>inline.includes(label)), "Historical events no longer separate fact, significance, gameplay effect and independent market context");
assert(inline.includes("Immediate effect: move BTC") && inline.includes("Consequence: the month is recorded as a rescue") && inline.includes("function settlementRescueFeedback(") && inline.includes("Receivership seized part of the treasury"), "Settlement, rescue or receivership feedback has lost its immediate and lasting consequences");

/* LOSING COINS IS NOT A TOAST.
   Every incident that takes bitcoin off the player permanently must stop the clock and take
   the screen. A toast is five seconds in a corner, which is the same weight this game gives a
   parts delivery - and these fire precisely when a large fleet is breaking and the corner is
   already busy. The modal states what left, from where, why it was possible and what prevents
   it; the last is the only part the player can still act on. */
assert(inline.includes("function reportCoinLoss(") && inline.includes("function lossModal()") && inline.includes("function dismissLoss()"),
  "The coin-loss ledger, its modal or its dismissal has gone");
/* THE REPAINT THAT MAY NEVER COME.

   queueRender's throttled path aligned its DOM write with an animation frame, which is the
   right instinct and the wrong sole mechanism: a hidden tab is owed no frames, so the paint
   never ran - and because renderQueued stays true until a paint clears it, every later repaint
   was dropped by the already-queued check too. The clock ran and the screen stopped. Measured,
   not supposed: in a pane whose visibilityState is permanently "hidden", the first paint after
   load was still pending eighteen seconds later, and only modal-urgent renders got through.

   So the frame and a timer race, and the token decides which one counts. The token is not
   decoration: without it a stale fallback fires against a newer schedule and paints early,
   defeating the throttle that keeps 16x readable. Each of these three lines is load-bearing
   and each is asserted separately, because losing any one of them restores a different bug. */
/* The comparison, not just the counter. Asserting that a token is CREATED says nothing about
   whether anything reads it - the first version of this line passed against a mutant that kept
   the counter and threw the check away, which is the whole of the bug it was meant to stop. */
assert(/const paintIfCurrent=\(\)=>\{if\(token===renderScheduleToken\)paint\(\)\};/.test(renderQueueSource),
  "queueRender no longer checks its schedule token, so a stale timer can paint against a newer schedule and defeat the repaint throttle");
assert(/setTimeout\(\(\)=>requestAnimationFrame\(paintIfCurrent\),delay\);/.test(renderQueueSource),
  "queueRender no longer aligns its throttled paint with an animation frame, so a visible tab can write mid-paint");
assert(/setTimeout\(paintIfCurrent,delay\+RENDER_FRAME_GRACE\);/.test(renderQueueSource),
  "queueRender has lost its timer fallback: on a hidden or frame-starved tab the repaint never runs and renderQueued stays true, so every later repaint is dropped as well");
assert(/const RENDER_FRAME_GRACE=\d+;/.test(renderQueueSource),
  "The grace period before the fallback paint is no longer named, so the wait for a frame that may never come is a magic number");
/* And the urgent path stays free of frames entirely. A dialog explaining why the clock stopped
   is the one repaint that can never afford to wait for a frame the browser may not grant. */
assert(/if\(urgent\)\{renderUrgentQueued=true;setTimeout\(paint,0\);return\}/.test(renderQueueSource),
  "An urgent repaint no longer bypasses both the throttle and the animation frame");

/* NO ENGINE MODULE ASKS "IS THIS DUE" IN ITS OWN WORDS.

   The question was written six ways - job.due>t, t<job.due, t>=job.due, job.due<=t and two
   with the operands swapped - and a mutation sweep found the boundary unasserted at every one
   of them. Not because each needed its own contract, but because there was no single place to
   assert. dueBy/pendingAt in config/timeline.js is that place, and the boundary rule lives in
   check-engine-behaviour.

   This guard stops the spellings coming back. It deliberately does NOT cover `.due` compared
   against something other than a clock: settlement carries a cash amount called `due`, and
   `state.cash>=pending.due` is a solvency test, not a schedule. Nor does it cover two due
   dates compared with each other, which is sorting. Only date-against-now is the boundary
   this owns. */
for (const file of engineModules) {
  const source = await readFile(new URL(`src/engine/${file}`, root), "utf8");
  const handwritten = [...source.matchAll(/[a-zA-Z_$][\w$.?]*\.due\s*(?:<=|>=|<|>)\s*(?:s|state)\.time|(?:s|state)\.time\s*(?:<=|>=|<|>)\s*[a-zA-Z_$][\w$.?]*\.due/g)]
    .map(match => match[0]);
  assert(handwritten.length === 0,
    `src/engine/${file} asks whether work is due in its own words (${handwritten.join(", ")}) instead of using dueBy()/pendingAt(); the boundary is then unasserted here, which is how it went unasserted in a dozen places`);
}

/* Reporting a loss stops the clock, so it must request its own repaint: there is no next tick
   left to notice a flag, and a modal nothing draws is worse than the toast it replaced. */
assert(/state\.lossResume=true;[\s\S]{0,400}queueRender\(true\)/.test(inline),
  "A reported loss no longer asks for the repaint that draws it, and the stopped clock leaves nothing to");
assert(["What happened","Why it was possible","What prevents it"].every(label => inline.includes(label)),
  "A coin-loss modal no longer separates what left, why it was possible and what prevents it recurring");
for (const cause of ["hotwallet","entropy","nobackup","phishing","receivership"])
  assert(inline.includes(`cause:"${cause}"`), `The ${cause} incident no longer reports its loss as a full-screen incident`);
assert(!/showToast\(\s*"Hot wallet compromised|showToast\(\s*"Coins lost, not stolen|showToast\(\s*"Your coins are being swept|showToast\(\s*"The fake was convincing enough/.test(inline),
  "A permanent coin loss has been demoted back to a toast");
assert(inline.includes("function applyVenueFailure(") && ["mtgox","bitfinex","quadriga","ftx"].every(id => new RegExp(`\\b${id}:\\{wallet:`).test(inline)),
  "Venue failures no longer share one table stating each venue's split between written off and frozen");
/* The modal has to be able to reach the screen. render() is the only function that draws
   modals; the tick's repaint reaches for renderMineContent(), which patches the tab body a
   modal is not inside - so on the Mine tab a stopped clock used to come with no dialog at all.
   Which modal ought to be showing is therefore part of the repaint decision, and it must be
   able to preempt a lazy repaint that was already queued. */
/* A loss and a historical chapter can both have stopped the clock. Only one is drawn - the
   loss, which is time-critical to read - and whichever is dismissed last restarts the
   simulation, through one helper rather than a resume flag per handler. */
assert(inline.includes("function resumeAfterModals()") && /close-event"\)\{state\.activeEvent=null;resumeAfterModals\(\)/.test(inline) && /dismissLoss\(\)\{[\s\S]{0,120}resumeAfterModals\(\)/.test(inline),
  "Closing an event and closing a loss no longer share one resume, so the pair can leave the clock stopped for good");
assert(inline.includes('pendingLoss()?lossModal():state.activeEvent?eventModal():""'),
  "A loss and an event modal must not be stacked on screen at once");
assert(inline.includes("function modalSignature()") && inline.includes("function modalStateChanged()") && inline.includes("lastModalSignature=modalSignature()"),
  "The repaint no longer tracks which modal ought to be on screen");
assert(/const urgent=[^;]*modalSignature\(\)!==lastModalSignature;[\s\S]{0,120}if\(renderQueued&&!\(urgent&&!renderUrgentQueued\)\)return;/.test(inline),
  "Urgency must be decided before the already-queued check, or a lazy repaint swallows the one that draws the modal");
assert(inline.includes("if(urgent){renderUrgentQueued=true;setTimeout(paint,0);return}"),
  "A modal must not wait on the repaint throttle and an animation frame to reach the screen");
assert(inline.includes("if(state.cash+1e-8>=due){finishMonthlySettlement(") && inline.includes("if(!pending||state.cash+1e-8<pending.due)return false"), "Queueing and finishing a settlement must use the same float tolerance, or cash short by a rounding sliver pauses the run and demands a rescue for a shortfall too small to write as money");
assert(inline.includes("Mining capacity lost to a fault") && inline.includes("The self-repair caused damage") && inline.includes("Part replacement complete"), "Repair and failure feedback no longer states the capacity effect or recovery state");
assert(inline.includes('class="run-verdict"') && inline.includes("Final assessment") && inline.includes("Financial resilience") && inline.includes("The defining lesson is"), "The end-of-run recap no longer provides an assessment, operating evidence and a lesson");
// A glossary is only useful where the confusion happens: it opens from any contextual-help
// disclosure, searches abbreviations as well as expansions, and hands off to Method for
// the formula behind each term.
const glossarySource = await readFile(new URL("src/data/glossary.js", root), "utf8");
const glossaryContext = { };
vm.runInNewContext(glossarySource.replace("const GLOSSARY", "var GLOSSARY") + "\nglobalThis.glossaryApi={GLOSSARY,glossaryEntries};", glossaryContext);
const glossaryApi = glossaryContext.glossaryApi;
const methodTargets = new Set([...methodChapterIds, ...[...methodSource.matchAll(/ id="(method-[a-z-]+)"/g)].map(match => match[1])]);
assert(glossaryApi.GLOSSARY.length >= 40, "The glossary no longer covers the canonical terminology");
for (const entry of glossaryApi.GLOSSARY) {
  assert(entry.term && entry.def && entry.anchor, `Glossary entry "${entry.term}" is missing its definition or Method destination`);
  assert(methodTargets.has(entry.anchor), `Glossary entry "${entry.term}" points at a Method target that does not exist: ${entry.anchor}`);
}
for (const [query, expected] of [["fpps", "FPPS"], ["full pay per share", "FPPS"], ["ppa", "PPA"], ["power purchase agreement", "PPA"], ["asic", "ASIC"], ["btc", "BTC"], ["hashrate", "Hash rate"], ["runway", "Cash runway"], ["sats", "Satoshi"]]) {
  const hits = glossaryApi.glossaryEntries(query).map(entry => entry.term);
  assert(hits.includes(expected), `Searching the glossary for "${query}" no longer finds ${expected}`);
}
assert(glossaryApi.glossaryEntries("").length === glossaryApi.GLOSSARY.length, "An empty glossary search should list every term");
/* Everything above tests glossaryEntries(), and the shipped modal does NOT call it - it renders
   every term once and hides the non-matching rows in the DOM, which is right for a list that
   must not re-render under a cursor. So there are two implementations of one rule, and the
   assertions above only mean something while the shipped one agrees with the tested one. The
   binding is glossarySearchKey: the DOM key must be built from it, and the filter must apply
   the same needle semantics - trimmed, lowercased, substring, empty shows everything. Without
   these four lines glossaryEntries is a spare being tested while the real path runs untested,
   which is exactly the trap this file has fallen into before. */
assert(inline.includes("data-glossary-key=\"${escapeHtml(glossarySearchKey(entry))}\""),
  "The glossary row key is no longer built from glossarySearchKey, so the tested search and the shipped search can disagree");
/* Scoped to renderSource, not the concatenated inline: glossary.js contains this exact line
   too, so matching against every file at once passed whatever render.js did. That mutant
   survived on the first try and is the reason this assertion names its file. */
assert(/const needle=String\(query\|\|""\)\.trim\(\)\.toLowerCase\(\)/.test(renderSource),
  "The glossary DOM filter no longer normalises the query the way glossaryEntries does");
assert(inline.includes('const match=!needle||(node.dataset.glossaryKey||"").includes(needle)'),
  "The glossary DOM filter no longer matches on substring-of-key, so it can diverge from the tested search");
assert(/function glossaryEntries\(query=""\)/.test(glossarySource),
  "glossaryEntries is gone; it is the executable specification the DOM filter is checked against");
assert(inline.includes("function glossaryModalHtml()") && inline.includes("${glossaryOpen?glossaryModalHtml():\"\"}") && inline.includes('else if(a==="glossary"){glossaryOpen=true'), "The glossary modal is missing or cannot be opened");
assert(inline.includes('data-action="glossary">Open the glossary'), "Contextual help no longer offers a route into the glossary");
assert(inline.includes("function filterGlossary(query)") && inline.includes('e.target.matches("[data-glossary-search]")'), "Glossary search is not wired to the search field");
assert(inline.includes('else if(a==="glossary-method")') && inline.includes("data-action=\"glossary-method\""), "A glossary entry can no longer hand off to its Method chapter");
assert(css.includes(".glossary-entry .action-link{display:inline-flex;align-items:center;min-height:34px}") && css.includes(".glossary-entry .action-link{min-height:40px}"), "The Method link inside a glossary entry is an 11px text link without these rules - unusable on touch");

// Language audit. "Timechain" is the product name and "hash rate" is the measurement, so "hashrate" is never right in prose;
// "/mo" is an unexplained abbreviation on a recurring cost; a temperature takes a space
// before its unit; and "liquidity" is the market-depth word, not the cash word. Each is
// easy to reintroduce by copying a nearby line, so they are checked rather than trusted.
const copyFiles = [];
async function collectCopyFiles(dir) {
  for (const entry of await readdir(new URL(dir, root), { withFileTypes: true })) {
    if (entry.isDirectory()) await collectCopyFiles(`${dir}${entry.name}/`);
    else if (entry.name.endsWith(".js")) copyFiles.push(`${dir}${entry.name}`);
  }
}
await collectCopyFiles("src/");
// A save key is an identifier, an export filename is a filename, and a shipped release
// note records what was written at the time. None of them are player-facing prose.
const LEGACY_EXEMPT = ['"hashrate-career-v1"', '"hashrate-genesis-save-v1"', '"hashrate-genesis-save-v1.unreadable"', '"https://strike.me/@jandex"'];
const legacyHits = [];
for (const file of copyFiles) {
  const source = await readFile(new URL(file, root), "utf8");
  const exempt = LEGACY_EXEMPT.flatMap(text => {
    const at = source.indexOf(text);
    return at < 0 ? [] : [[at, at + text.length]];
  });
  if (file.endsWith("data/content.js")) {
    const start = source.indexOf("const CHANGELOG=[");
    exempt.push([start, source.indexOf("\n];", start)]);
  }
  if (file.endsWith("data/glossary.js")) exempt.push([0, source.length]);
  const covered = index => exempt.some(([from, to]) => index >= from && index < to);
  for (const match of source.matchAll(/[Hh]ashrate/g)) {
    if (!covered(match.index)) legacyHits.push(`${file}: "hashrate" should be "hash rate" (…${source.slice(Math.max(0, match.index - 30), match.index + 25).replace(/\s+/g, " ")}…)`);
  }
  for (const match of source.matchAll(/\/mo(?![a-z])/g)) {
    if (!covered(match.index)) legacyHits.push(`${file}: "/mo" should be "/month" (…${source.slice(Math.max(0, match.index - 30), match.index + 8).replace(/\s+/g, " ")}…)`);
  }
  for (const match of source.matchAll(/[^\s]°C/g)) {
    if (!covered(match.index)) legacyHits.push(`${file}: a temperature is glued to its unit; the rule is "22 °C" (…${source.slice(Math.max(0, match.index - 30), match.index + 6).replace(/\s+/g, " ")}…)`);
  }
  const CASH_MEANT = [
    [/label:"Liquidity"/, 'a card labelled "Liquidity" whose value is a cash runway - use "Cash runway"'],
    [/<th>Liquidity/, 'a table column headed "Liquidity" - say what it asks, e.g. "Can it pay a bill?"'],
    [/"Liquidity reserve/, '"Liquidity reserve" - the thing required is cash, so say "Cash reserve"'],
    [/default liquidity/, '"default liquidity" - the named control is Starting Liquidity'],
    [/(?:cooling|energy) and liquidity/i, 'a heading ending "and liquidity" where the subject is the operating bill'],
    [/missing liquidity/, '"the missing liquidity" - the thing received is cash'],
  ];
  for (const [pattern, explanation] of CASH_MEANT) {
    const match = pattern.exec(source);
    if (match && !covered(match.index)) legacyHits.push(`${file}: ${explanation}`);
  }

}
assert(legacyHits.length === 0, `Legacy terminology is back in player-facing copy:\n  ${legacyHits.slice(0, 8).join("\n  ")}`);

// Cooling plant is ordered and installed, not conjured. It was the only thing in the
// room that appeared instantly and was never drawn, so both are now checked.
const operationsSource = await readFile(new URL("src/data/operations.js", root), "utf8");
const coolingRows = [...operationsSource.matchAll(/\{id:"(\w+)",name:"([^"]+)",date:"[\d-]+",minTier:\d+,maxTier:\d+,cost:(\d+),install:(\d+),[^}]*\}/g)];
assert(coolingRows.length === 8, `Every cooling item needs an install lead time; ${coolingRows.length} of 8 have one`);
let previousInstall = 0;
for (const row of coolingRows) {
  const [text, id, name, cost, install] = row;
  const days = Number(install);
  assert(days >= 1 && days <= 200, `${name} has an implausible install lead time of ${days} days`);
  // Plant that holds miners is a different kind of thing rather than a bigger rung of the
  // air ladder: a single tank is smaller than the dry cooler it arrives after, so it is
  // read for plausibility but left out of the walk up the ladder.
  if (text.includes("units:")) continue;
  assert(days >= previousInstall, `Cooling install times should not shrink as the plant gets bigger: ${name} takes ${days} days`);
  previousInstall = days;
}
assert(inline.includes("function coolingInstallDays(item)") && inline.includes("function advanceCoolingInstalls()") && inline.includes("advanceProcurement();advanceCoolingInstalls();"), "Cooling installs are not resolved on the simulation tick");
assert(inline.includes("state.thermal.orders.push({id,qty:1,due:state.time+days*DAY,cost:item.cost})") && !/state\.cash-=item\.cost;state\.thermal\.equipment\[id\]=/.test(inline), "Buying cooling must book an install rather than grant heat rejection immediately");
assert(inline.includes("thermal:{temperature:22,orders:[]") && inline.includes("state.thermal.orders=Array.isArray(state.thermal.orders)"), "Cooling orders are missing from the initial state or from the save migration");
assert(inline.includes("const projected=fleet(trial);if(projected.potentialKw>projected.cap)"), "The cooling headroom check must use peak draw: cooling is thermostatic, so a cold room draws almost nothing and a live-draw check passes however much plant is on order");
assert(inline.includes("function miningFloorCooling()") && inline.includes("${miningFloorCooling()}<div class=\"floor-units\""), "Installed cooling is not drawn on the live mining floor");

/* The 3D floor used to grow generic wall vents from the size of the room, so a box fan and a
   cooling tower looked identical and buying plant changed nothing on screen. Every rung of
   the ladder now needs its own silhouette, and adding an eighth kind of plant should fail
   here until it is drawn rather than silently rendering as nothing. */
/* THE FLOOR HAS TO FIT IN THE ROOM.

   At five thousand machines the grid was wrong in both directions at once: it took its column
   count from a number fixed per site rather than from the rack's footprint, so a container
   yard put 1.54-wide racks on a 3.0 pitch - half the room's width empty - while crushing the
   nineteen rows that forced onto a 1.0 pitch against a rack 1.15 deep. It overlapped itself
   front to back while wasting half of itself side to side. And the rack was one size whatever
   building stood around it, so a thirty-megawatt yard read as a handful of enormous cabinets.

   The pitch must therefore come from the code that draws the rack, and the floor must scale
   to fit rather than overflow. */
const sceneArt = await readFile(new URL("src/ui/floor3d/scene.js", root), "utf8");
const minerArt = await readFile(new URL("src/ui/floor3d/silhouettes.js", root), "utf8");
/* THE FLOOR DRAWS TO A BUDGET, because the fleet has no ceiling and the renderer does.
   Instance count grew with the fleet and stopped nowhere: fifty-six thousand machines was a
   hundred and sixty thousand instances, survivable on one machine and a hard render failure on
   another - which is what a player hit. What a budget costs is machines drawn per shelf, which
   was always a representation; what it never costs is the room, the racks, the plant or the
   fault beacons, which are what the picture is for. */
assert(sceneArt.includes("const FLOOR_INSTANCE_BUDGET=") && sceneArt.includes("function floorUnitCap("),
  "The floor has no instance ceiling again, so a large enough fleet will fail to render");
/* A rack costs something before it holds anything. Dividing the budget by machines alone
   concluded a megacampus could afford fifty-seven per rack and never bound at all. */
assert(sceneArt.includes("const FLOOR_PER_RACK=") && /perRack=FLOOR_INSTANCE_BUDGET\/\(Math\.max\(1,relief\)\*rows\)-FLOOR_PER_RACK/.test(sceneArt),
  "The budget no longer charges the per-rack frame before buying machines, so it will not bind");
/* And the cap must precede the plan, or a rack is built for six levels and four are left
   empty - the frame is spent either way. */
assert(minerArt.includes("const wanted=Math.min(b.qty,api.unitCap??Infinity);") && minerArt.includes("const plan=rackPlan(wanted,p.w)"),
  "The rack is planned before the budget caps it, so the frame is paid for shelves nothing goes on");
/* A build that fails gets a smaller one. Falling to the flat floor is the worst outcome
   available: the largest operation in the game is the one that most wants to be seen. */
assert(inline.includes("for(const relief of [1,2,4])") && inline.includes("FloorScene.build(FloorModel.describe(),{relief})"),
  "A failed scene build drops straight to the flat floor instead of retrying smaller");

/* THE CASES ARE THE PUBLISHED DIMENSIONS.

   These were drawn by eye and the eye was wrong in a consistent direction: every ASIC was far
   too wide and too flat. An Antminer S19 is 370 x 195.5 x 290 mm - deeper than it is tall and
   TALLER THAN IT IS WIDE - and it was drawn 0.98 wide by 0.55 high, roughly two and a half
   times too wide for its height, so a rack read as a shelf of pizza boxes. The table is now
   the manufacturers' figures at one scale with the millimetres written beside each entry:
   changing a case means changing a measurement. */
assert(minerArt.includes("const MM=0.0022;") && /const mm=\(l,w,h\)=>/.test(minerArt),
  "The case table no longer converts published millimetres to floor units at one scale");
for (const [id, dims] of [["s9","350,135,158"],["s17","298,175,304"],["s19","370,195.5,290"],["s21","400,195.5,290"]])
  assert(new RegExp(`${id}:\\{[^}]*\\.\\.\\.mm\\(${dims.replace(/\./g,"\\.")}\\)`).test(minerArt),
    `${id} is no longer built from its published dimensions`);
assert(!/w:\.\d+,h:\.\d+,d:\.\d+/.test(minerArt),
  "A case has gone back to hand-picked proportions instead of its real measurements");
/* Every one of these machines is cooled by 120 mm fans, and the modern ones carry four - two
   at each end, stacked, because the face is taller than it is wide. The old rule made the
   single fan bigger instead, producing a 200 mm fan no manufacturer has ever fitted. */
assert(minerArt.includes("const FAN120=60*MM;") && !minerArt.includes("dual:true"),
  "Fan size is no longer the 120 mm part the industry standardised on, or the old dual flag is back");
assert(/const perEnd=Math\.max\(1,p\.fans\|\|1\);/.test(minerArt) && /for\(let f=0;f<perEnd;f\+\+\)/.test(minerArt) && minerArt.includes("F(0,fy,front+.04,fanR);F(0,fy,back-.04,fanR,-1);"),
  "A four-fan machine no longer draws two stacked fans at each end");
assert(minerArt.includes("Math.min(p.fan,p.w*.47,p.h/perEnd*.47)"),
  "A fan can overhang the case it is bolted to");
assert(minerArt.includes("const pw=p.w*.77,ph=Math.max(.07,p.h*.3),pd=p.d*.77;"),
  "The supply is no longer sized to the case it sits on, so it hangs off the side of the machine");
assert(minerArt.includes("const fins=Math.max(3,Math.min(p.fins,Math.floor((p.w-.14)/.045)));"),
  "Roof ridge count is not capped by the roof, so a narrow case draws a solid block");

assert(minerArt.includes("function rackFootprint(") && /return\s*\{profiles,render,rackFootprint\}/.test(minerArt),
  "The rack no longer publishes its footprint, so the grid that places racks has to guess it");
assert(sceneArt.includes("FloorMiners.rackFootprint(h,typical)") && !/const RACK_W\s*=/.test(sceneArt),
  "The floor grid has gone back to a rack size of its own, which goes stale the first time a rack changes shape");
assert(/const pitchX=foot\.w\+AISLE_X,pitchZ=foot\.d\+AISLE_Z/.test(sceneArt),
  "Row and column pitch must be the rack's own footprint plus an aisle, or rows overlap");
assert(sceneArt.includes("Math.sqrt(usableW*usableD/(n*pitchX*pitchZ))") && /if\(rows\*pitchZ\*scale<=usableD\|\|scale<=FLOOR_MIN_SCALE\)break;/.test(sceneArt),
  "The floor no longer shrinks to fit the room, so a large fleet marches its rows through the wall");
/* Machines scale, the building does not: a shrinking floor inside a fixed room is the effect.
   Batch parts carry a batch id and scenery carries -1, which is what tells the two apart. */
assert(sceneArt.includes("const k=batch>=0?floorScale:1;") && sceneArt.includes("dummy.position.set(pos[0]*k,pos[1]*k,pos[2]*k);dummy.scale.set(size[0]*k,size[1]*k,size[2]*k)"),
  "Machine content and the room it stands in are scaling together, or not scaling at all");
assert(/if\(b\.items\)b\.items\.push\(\{pos,size,rot,k\}\)/.test(sceneArt) && sceneArt.includes("const k=a.k||1;dummy.position.set(a.pos[0]*k"),
  "The fan spin animation rebuilds matrices from unscaled values, so the first animated frame snaps every fan back to full size");
/* INSTANCES ACCUMULATE AS NUMBERS, NOT AS OBJECTS. A Matrix4 clone and a Color allocation per
   instance was a hundred and eleven thousand of each at megacampus, and the whole of a
   seven-hundred-millisecond scene build. Only fan buckets keep a per-item record, because the
   spin is the only thing that rebuilds a matrix later. */
assert(sceneArt.includes("b.m.push(e[0],e[1],e[2]") && sceneArt.includes("mesh.instanceMatrix.array.set(bucket.m)"),
  "Scene assembly is back to cloning a matrix per instance instead of filling the instance buffer directly");
assert(!/setColorAt\(i,new T\.Color/.test(sceneArt) && sceneArt.includes("mesh.instanceColor.array.set(bucket.c)"),
  "Scene assembly allocates a Color per instance again");
assert(sceneArt.includes("items:fan?[]:null"),
  "Every bucket keeps a per-item record again, not just the ones that animate");

/* A STATUS CHANGE IS PAINT, NOT GEOMETRY. What a rack IS decides the geometry; what it is DOING
   is colour, and on a large fleet that changes every simulated day. Rebuilding the scene for it
   cost a third of a second, several times a second at speed - enough sustained main-thread work
   for the browser to give up on the GPU process and drop the player to the flat floor. That is
   the fifty-thousand-miner crash, and it reproduces on a clean page. */
assert(/for\(const b of floorBatches\(\)\)parts\.push\(b\.id\+b\.qty\);/.test(inline),
  "Batch status is back in the rebuild signature, so a fleet with churning faults rebuilds the scene every tick");
assert(inline.includes("function floor3dStatusSignatureNow()") && inline.includes("function floor3dApplyStatuses()"),
  "Nothing detects a status-only change, so every fault still rebuilds the scene");
assert(sceneArt.includes("function recolour(statusFor)") && sceneArt.includes("mesh.instanceColor.needsUpdate=true"),
  "The scene cannot repaint instances in place, so a status change has to rebuild it");
assert(sceneArt.includes("b.tinted.push(batch>=0&&color===accentColor?1:0)"),
  "Nothing records which instances wear the status colour, so a repaint cannot find them");
/* And one update per frame. A burst of repaints must not issue a burst of renders and buffer
   uploads with no frame boundary for the driver to catch up on. */
assert(inline.includes("floor3dPending=requestAnimationFrame(run)") && inline.includes("if(floor3dPending||floor3dPendingTimer)return;"),
  "Floor updates run synchronously on every repaint again rather than collapsing onto a frame");
/* And never parked behind a frame alone: a hidden tab suspends rAF, and this project has
   already lost a modal to work waiting on a frame that never arrived. */
assert(inline.includes("floor3dPendingTimer=setTimeout(run,120)"),
  "The floor update waits on an animation frame with no fallback, so a backgrounded tab never mounts it");
assert(inline.includes("if(gl&&gl.isContextLost())return;"),
  "The floor keeps drawing into a lost context, which turns a recoverable hiccup into a permanent fallback");
/* Level of detail asks two questions, not one: can it be seen, and can it be afforded. A
   hundred-and-twenty-machine workshop draws small because the room is wide, and there is no
   reason to take its detail away for three thousand instances. */
/* Level of detail is a COST CEILING, not a visibility hint. It was written the other way
   round - can it be seen, with affordability as an escape hatch that could only turn detail
   back ON - and correcting the case dimensions proved that wrong: narrower machines make
   narrower racks, more racks fit, the floor draws larger, and five thousand machines sailed
   back over the visibility threshold into 459,000 instances and a 2.9-second build. Any
   reading of scale in this decision is that bug waiting to happen again. */
assert(sceneArt.includes("function floorDetail(s)") && sceneArt.includes("return !fs||fs.count<=FLOOR_DETAIL_UNITS;"),
  "Level of detail no longer bounds what it costs to draw");
assert(!/floorDetail\([^)]*scale[^)]*\)/.test(sceneArt) && !/FLOOR_DETAIL_SCALE/.test(sceneArt),
  "Level of detail consults the floor scale again, which lets a large fleet buy back its detail by drawing bigger");
assert(minerArt.includes("const detail=api.detail!==false;") && minerArt.includes("if(detail){") && /\/\* The status LED stays at every scale/.test(minerArt),
  "The coarse silhouette has gone, or it has taken the status LED with it - the one part that carries information rather than texture");
assert(/const RACK_ACROSS_BY_TIER=\[2,2,3,4,4,6,6,8\]/.test(minerArt) && minerArt.includes("function rackAcrossCap()"),
  "Racks no longer widen with the site, so a warehouse holds the same furniture as a spare room");

const coolingArt = await readFile(new URL("src/ui/floor3d/cooling.js", root), "utf8");
const mountSource = await readFile(new URL("src/ui/floor3d/mount.js", root), "utf8");
// Matched against the SHAPES dispatch table specifically, not against any mention of the id:
// a first version accepted the id appearing in an unrelated lookup map, and passed happily
// when the plant it named was no longer drawn at all.
const undrawn = [...operationsSource.matchAll(/\{id:"(\w+)",name:"[^"]+",date:"[\d-]+",minTier:/g)]
  .map(m => m[1]).filter(id => !new RegExp(`(?:^|\\n)\\s*${id}\\(c\\)\\{`).test(coolingArt));
assert(undrawn.length === 0, `Cooling plant with no 3D silhouette, so buying it changes nothing on the floor: ${undrawn.join(", ")}`);
assert(!/const vents=p\.id===/.test(await readFile(new URL("src/ui/floor3d/scenery.js", root), "utf8")), "The 3D floor is back to deriving a generic vent count from the size of the room rather than drawing the plant actually installed");
assert(mountSource.includes("src/ui/floor3d/cooling.js"), "The 3D cooling module is not in the lazy-load list, so the floor will throw when it is drawn");
/* The behavioural suite proves the ENGINE's purchase limit is right, but it cannot run the
   Mine card - so nothing there notices if the card goes back to doing the sum itself. It did
   exactly that: its own headroom from live draw against a buy path enforcing peak draw,
   offering 34 machines where the game allowed 31 and advertising floor space that could
   never be filled. One function owns this arithmetic; the card asks it. */
/* Firmware patching lives on the Operations risk desk, and Mine never mentioned it - so a
   player whose hash rate has quietly dropped by a third has nothing on the screen they are
   looking at to explain it. It is fleet maintenance; the action belongs beside the rest. */
assert(inline.includes("function firmwareStatusHtml()") && inline.includes("${firmwareStatusHtml()}${partsStatusStrip()}"),
  "Fleet servicing no longer surfaces firmware state, so an unpatched fleet is invisible from the tab that owns the fleet");
assert(/firmware-status[^"]*\$\{tone\}|firmware-status \$\{tone\}/.test(inline) && inline.includes('data-action="patch-firmware"'),
  "The Mine firmware panel no longer offers the patch action itself");

/* The behavioural rule calls enforceConnectivityAvailability directly, so it cannot notice if
   the relocation stops calling it. A plan that does not travel is only useful if something
   checks on arrival. */
assert(/state\.region=job\.id;\s*\n?\s*enforceConnectivityAvailability\(\);/.test(inline),
  "Completing a relocation no longer re-checks connectivity availability, so a site can keep a plan its new jurisdiction never offered");

/* Commissioning brings machines online as the crew works through them, so the incoming-fleet
   row has to report progress. Announcing the full order as "racking" while a third of it is
   already hashing reads as though nothing has happened. */
assert(inline.includes("still to rack") && inline.includes("already hashing"),
  "The incoming-fleet row no longer reports how much of a build is already online, so a ramping commission looks stalled");

const mineTabSource = await readFile(new URL("src/ui/tabs/mine.js", root), "utf8");
/* hardwarePurchaseStatusHtml existed, was maintained, and was called by nothing - so the
   panel explaining WHY an order is capped, and now which market you are buying in, never
   reached the screen. A function nobody calls is worse than a missing one: it reads as
   working. */
assert(mineTabSource.includes("hardwarePurchaseStatusHtml(h)"), "The hardware card no longer shows the purchase-capacity panel, so nothing explains what is limiting an order or which market it comes from");
assert(mineTabSource.includes("hardwarePurchaseLimits(h)"), "The Mine hardware card no longer asks the shared purchase-limit helper for its capacity");
assert(!/cap\)?\s*\*\s*1000\s*-\s*(Number\()?reserved\.w/.test(mineTabSource), "The Mine card is computing power headroom from live draw again, which offers quantities the purchase path will refuse");
assert(/const maxBuy=h\.permanent\?0:limits\.fiatMax/.test(mineTabSource), "The Mine card's maximum quantity is no longer the shared limit");

/* INTERACTION. The 3D floor cannot be exercised headlessly - there is no WebGL in the
   harness - so these are source matches, and the behaviour behind them was verified in a
   browser with real pointer input. They exist to stop the three decisions that were
   expensive to reach from being undone by accident. */

// Raycasting every instance costs 10.8ms per ray at megacampus. The flat AABB sweep is 1.4ms.
assert(mountSource.includes("function floor3dBuildPickTable(") && mountSource.includes("function floor3dSweep("),
  "The 3D floor's pick table is gone, which means picking is back to raycasting every instance in the room");
assert(/if\(!node\.isInstancedMesh\|\|node\.userData\.glow\)return/.test(mountSource),
  "The pick table no longer skips glow meshes, so additive haloes will intercept pointer hits before the machines behind them");

/* No wheel handler, deliberately: zooming under the cursor means consuming the wheel, and a
   reader scrolling past a floor that eats their scroll has a worse problem than the one zoom
   solves. The buttons zoom instead. */
assert(!/addEventListener\("wheel"/.test(mountSource),
  "The 3D floor has taken over the mouse wheel, which traps the reader's page scroll");
assert(/touch-action:pan-y/.test(css),
  "The 3D canvas no longer reserves vertical panning for the page, so dragging it will trap scrolling on touch");

// A machine clicked in the room must reach the same place as one clicked on the flat floor.
assert(mountSource.includes("focusServiceRow(batch.hardware.id)"),
  "Clicking a faulted machine in 3D no longer opens its repair, so the two floor views disagree about what a click means");
assert(inline.includes("data-floor3d-readout") && inline.includes('data-action="floor3d-reset"'),
  "The 3D floor lost its readout or its reset control, leaving orbit with no way back to the default vantage");

assert(mountSource.includes("immersionTotal"), "The 3D floor signature ignores how many miners are submerged, so converting to immersion will not redraw the tanks");
assert(inline.includes('<i class="cooling"></i> Cooling plant') && inline.includes('<i class="cooling-pending"></i> Cooling on order'), "The mining-floor legend does not explain the cooling sprites");
assert(css.includes(".floor-cooling-row{") && css.includes(".floor-cooling.pending{") && css.includes(".floor-cooling-row{top:58px;left:8px"), "Floor cooling sprites are missing their styling or their phone layout, where the facility caption spans the room and a right-aligned row collides with it");
assert(inline.includes('detail:"Cooling install"'), "A cooling install does not appear in the Dashboard build queue");
assert(inline.includes("${installDays}-day install") && inline.includes(">Order · ${fmtCompactUsd(item.cost)}</button>"), "The cooling card does not preview its install delay before the player commits");

// Two hashboard tiers look identical in a shop list, and buying the wrong one wastes
// both the money and the lead time. Which machines a part fits is derived from the
// same fault-weight table the engine repairs against, so the two cannot disagree.
assert(inline.includes("function hardwareUsingPart(partId)") && inline.includes("Object.keys(partFaultWeights(h)).includes(partId)"), "Part compatibility must be derived from partFaultWeights, not from a second hand-maintained list");
assert(inline.includes("function partFitSummary(partId)") && inline.includes('<div class="part-fit ${fit.fits?"":"unused"}">'), "The spare-part card does not say which machines the part fits");
assert(inline.includes("Nothing in your fleet uses this") && inline.includes("const spares=SPARE_PARTS.map(part=>{const fit=partFitSummary(part.id)"), "A part no machine in the fleet uses must say so rather than looking like a valid purchase");
assert(css.includes(".part-fit{") && css.includes(".part-fit.unused{"), "Part-fit lines are missing their styling");

// THERE IS NO AUTO-SELL. A standing "cover the bill" instruction used to sell just enough BTC
// at settlement that the run never paused, so an operator could idle through the whole game on
// the treasury while nothing ever asked for a decision. A bill the cash cannot meet now stops
// the clock and the player raises it, usually by selling at the Market. The behaviour is proved
// in check-engine-behaviour.mjs; these pin that the machinery is really gone and not just unused.
assert(!/TREASURY_POLICIES|treasuryPolicy\b|treasurySaleForSettlement|setTreasuryPolicy|treasury-policy|coveredBySale/.test(inline.replace(/const CHANGELOG=[\s\S]*?\n\];/, "").replace(/delete (state|restored)\.treasuryPolicy;/g, "")),
  "An automatic settlement sale, or the policy that switched it on, is still referenced");
assert(inline.includes("delete state.treasuryPolicy;") && inline.includes("delete restored.treasuryPolicy;"),
  "A save or import that still carries the removed policy is not cleaned up");
assert(inline.includes('if(state.cash+1e-8>=due){finishMonthlySettlement("cash",true);return}'),
  "Settlement meets a bill from something other than cash on the player's behalf");
assert(inline.includes("function settlementOutlookVisual()") && inline.includes("NOTHING IS SOLD FOR YOU") && inline.includes("Forecast shortfall") && inline.includes('data-action="tab" data-value="market"'),
  "The finance panel no longer says nothing is sold automatically, or no longer shows the shortfall and the way to the Market");
assert(!inline.includes("Next automatic sale") && !inline.includes('data-action="treasury-policy"'),
  "The panel still offers an automatic sale");

// A home-built tower takes standard case fans; only the laptop takes a laptop fan.
// The mapping lives on the machine so a new entry declares its own part.
const hardwareSource2 = await readFile(new URL("src/data/hardware.js", root), "utf8");
const fanContext = { };
vm.runInNewContext(timelineSource + "\n" + hardwareSource2.replace(/^const /gm, "var ") + "\nglobalThis.fanApi={HARDWARE,fanTierFor,hashboardTierFor};", fanContext);
const fanApi = fanContext.fanApi;
const fanFor = id => fanApi.fanTierFor(fanApi.HARDWARE.find(h => h.id === id));
assert(fanFor("laptop") === "laptopfan", "The mining laptop should take a laptop cooling fan");
assert(fanFor("cpu") === "fan", "A home-built quad-core tower takes 120mm case fans, not a laptop's internal fan");
assert(fanFor("5870") === "fan" && fanFor("fpga") === "fan", "GPU and FPGA hardware takes case fans");
assert(fanFor("s9") === "asicfan" && fanFor("s21hydro") === "asicfan", "ASIC and hydro ASIC hardware takes blower fans");
assert(fanApi.HARDWARE.filter(h => fanApi.fanTierFor(h) === "laptopfan").length === 1, "Only the laptop should take a laptop fan");
// simulation.js migrates saves against these at load time, so they must already exist.
const hardwareIdx = appScripts.indexOf("src/data/hardware.js"), simIdx = appScripts.indexOf("src/engine/simulation.js");
assert(hardwareIdx >= 0 && simIdx > hardwareIdx, "fanTierFor lives in hardware.js and simulation.js calls it in a top-level save migration; hardware.js must load first or the whole engine aborts");
assert(!/function fanTierFor|function hashboardTierFor/.test(await readFile(new URL("src/engine/maintenance.js", root), "utf8")), "The part-tier functions moved to hardware.js; a second copy in maintenance.js would shadow or contradict them");
assert(inline.includes('HARDWARE.filter(h=>fanTierFor(h)!=="laptopfan").forEach(h=>{const byPart=state.maintenance.faultsByPart?.[h.id];if(byPart&&byPart.laptopfan)'), "An existing tower fault recorded against the laptop fan is not migrated to the case fan");
assert(inline.includes('if(h&&job.part==="laptopfan"&&fanTierFor(h)!=="laptopfan")job.part=fanTierFor(h)'), "An in-flight repair recorded against the laptop fan is not migrated");

assert(!inline.includes("indexed to 100 at game start") && !inline.includes("<span>Game start</span>"), "The market chart said it was indexed at game start three times over; the card meta says it once");
assert(inline.includes('<div class="chart-labels end"><span id="dashboard-chart-date">') && css.includes(".chart-labels.end{justify-content:flex-end}"), "With one label left, the chart date must stay anchored to the right edge it marks");

// Bitcoin changes difficulty once every 2016 blocks and nowhere else. Storing one exact
// value per retarget is smaller than resampling it weekly and is the actual truth: the
// previous series held 920 points, of which 919 were values that never existed.
const bundle = await readFile(new URL("historical-data.js", root), "utf8");
const bundleContext = { window: {} };
vm.runInNewContext(bundle, bundleContext);
const recorded = bundleContext.window.HISTORICAL_DATA;
assert(recorded && recorded.PRICE && recorded.DIFFICULTY, "The historical bundle did not define window.HISTORICAL_DATA");
// The game's cutoff and the data's last day have to be the same day. If they drift, the
// sandbox either starts before the recorded feed runs out or leaves recorded days unplayed.
assert(recorded.meta.through === new Date(subsidy.END).toISOString().slice(0, 10), `The historical cutoff is ${new Date(subsidy.END).toISOString().slice(0, 10)} but the data runs to ${recorded.meta.through}`);
assert(sandboxContext.SANDBOX_END - subsidy.END === Math.round(365.25 * 100 * 86_400_000), "The sandbox horizon should stay exactly a hundred years past the cutoff");
assert(recorded.DIFFICULTY.length >= 400 && recorded.DIFFICULTY.length <= 700, `Difficulty should be one point per retarget, not ${recorded.DIFFICULTY.length}`);
assert(recorded.DIFFICULTY.length < recorded.HASH.length, "The difficulty series should be sparser than the hash series: it is a step function, not a sample");
assert(recorded.DIFFICULTY[0][1] === 1, "Difficulty must start at 1, the genesis epoch");
assert(recorded.DIFFICULTY.every((entry, i) => i === 0 || entry[1] !== recorded.DIFFICULTY[i - 1][1]), "A resampled difficulty series would repeat values between retargets");
assert(/mempool\.space/.test(recorded.meta.source) && recorded.meta.difficultySourceUrl, "The difficulty source is not attributed in the bundle metadata");
assert(!inline.includes("reconstructed daily mean") && !inline.includes("Difficulty is reconstructed from recorded hash rate"), "Difficulty is recorded now, not reconstructed; the copy must not still claim otherwise");
assert(inline.includes("holds until the next retarget"), "The difficulty readout should say the value holds until the next retarget rather than drifting daily");
assert(buildSource.includes("mempool.space/api/v1/mining/difficulty-adjustments") && buildSource.includes("--difficulty-only"), "The build script must fetch exact retargets, and must keep a mode that rewrites difficulty alone so an accuracy fix cannot pull unrelated revisions into every other series");
assert(/value \/ previous > 4\.000001/.test(buildSource), "The build must reject any difficulty step outside the protocol's 4x clamp rather than trusting the feed");

// Storage format: a regular series carries its start and cadence instead of repeating
// an ISO date beside every number, which was half the bundle. The file decodes itself,
// so everything downstream still sees the pair arrays it always did.
assert(/^\(function\(\)\{/m.test(bundle) && bundle.includes("window.HISTORICAL_DATA=data;"), "The bundle must decode itself and expose the same window.HISTORICAL_DATA shape");
assert(bundle.includes('"start"') && bundle.includes('"step"'), "The bundle is no longer storing regular series as start plus cadence");
assert(recorded.PRICE.every(entry => Array.isArray(entry) && typeof entry[0] === "string" && Number.isFinite(entry[1])), "Decoded series must be [date, value] pairs");
for (const key of ["PRICE", "HASH", "DIFFICULTY", "FEES", "TX", "HEIGHT"]) {
  const dates = recorded[key].map(entry => entry[0]);
  assert(dates.every((date, i) => i === 0 || date > dates[i - 1]), `${key} decodes out of date order`);
  assert(new Set(dates).size === dates.length, `${key} decodes with a duplicated date`);
}
assert(bundle.length < 500_000, `The bundle is ${Math.round(bundle.length / 1024)} KB; daily resolution should cost about 375 KB in this encoding, so anything much larger means the dates crept back`);
const dailyCadence = ["PRICE", "HASH", "FEES", "TX", "HEIGHT"];
for (const key of dailyCadence) {
  const gaps = recorded[key].slice(1).map((entry, i) => Math.round((Date.parse(entry[0]) - Date.parse(recorded[key][i][0])) / 86_400_000));
  const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  assert(median === 1, `${key} should be recorded daily; its median gap is ${median} days`);
  assert(recorded[key].length > 5_000, `${key} has only ${recorded[key].length} points for seventeen years of daily data`);
}
assert(recorded.DIFFICULTY.length < 700, "Difficulty is a step function and must not be resampled daily along with the rest");
assert(!buildSource.includes("elapsed % 7 === 0"), "A weekly sampling step is back in the build");
assert(buildSource.includes("function encodeSeries(pairs)") && buildSource.includes("--recompress"), "The build must own the encoding, and keep a network-free mode that re-encodes the existing bundle");

// state.debt had a whole disconnection mechanic built around it - a banner, an Operator
// briefing, offline node reasons, a blocked mining floor - and nothing in the game ever
// set it above zero. Missing a bill was not a thing that could happen. Guard the middle
// path so it cannot go dead again.
assert(/state\.debt\s*\+=\s*carried/.test(inline), "Nothing raises arrears; a missed bill must actually be carried into state.debt");
assert(inline.includes("function deferSettlement()") && inline.includes('else if(a==="settle-defer")deferSettlement();'), "The miss-the-bill route is missing or unwired");
assert(inline.includes("function gridCutOff(s=state)") && inline.includes("s.debt>0&&s.time>=(s.arrearsDue||Infinity)"), "The grace period is gone: arrears must not cut the grid until the next bill date");
assert(inline.includes("state.arrearsDue=nextBillDate()"), "A missed bill must set the date the grid is cut if it stays unpaid");
// Owing money and being cut off are different states, and only the second stops the site.
for (const gate of ["function operating(){const fs=fleet();return state.power&&!gridCutOff()",
  "function nodeHostPowered(){if(gridCutOff()||state.policyLock)return false;",
  "function thermalPowerAvailable(s=state){return !!s.power&&!gridCutOff(s)&&"]) {
  assert(inline.includes(gate), `An operational gate still cuts the site the moment arrears exist, which removes the grace month: ${gate.slice(0, 48)}`);
}
assert(!/operating\(\)\{const fs=fleet\(\);return state\.power&&state\.debt<=0/.test(inline), "operating() is back to cutting the site on any arrears");
assert(inline.includes('id:"grid-arrears-grace"') && inline.includes('id:"grid-arrears"'), "The briefing must tell a warning apart from a disconnection");
assert(inline.includes('gridCutOff()?"Grid disconnected":"Operating bill in arrears"'), "The banner reads the same whether the grid is on or off");
assert(inline.includes("state.debt=0;state.arrearsDue=0;state.gridCutAnnounced=false;"), "Clearing arrears must also clear the cut-off date, or the site stays disconnected after paying");
assert(inline.includes("state.arrearsDue=Number(state.arrearsDue)||0") && inline.includes("if(state.debt<=0){state.arrearsDue=0;state.gridCutAnnounced=false}"), "Old saves must load with a coherent arrears state");
assert(inline.includes('showToast("Power and internet cut off"'), "The disconnection has to announce itself; it was silent before");

assert(inline.includes("queueMonthlySettlement(due,month,loanInterest,silent)"), "Settlement notices must respect silent ticks, or a catch-up after the tab was hidden fires a month of toasts at once");
assert(inline.includes('if(!silent)showToast("Settlement paused"'), "The settlement-paused toast still fires on silent catch-up ticks");
// The forecast drives the whole cash-runway story, and miners keep running through arrears.
assert(inline.includes("const minerWatts=state.power&&!gridCutOff()&&!state.policyLock?fs.w*contractLoadFactor():0"), "The settlement forecast assumes miners are off the moment arrears exist, understating the bill for the entire grace month");

// The old thermal model compared heat to a capacity number and added a flat penalty per
// unit of overload. Nothing in it conserved energy, so it had no gradient below capacity
// and ran away above it: a single 1.32 kW machine in a spare room reached 61 °C while a
// fully loaded campus barely moved. A room sheds heat in proportion to how much hotter it
// is than outside, and settles where heat in equals heat out.
const thermalSource = await readFile(new URL("src/engine/thermal.js", root), "utf8");
assert(thermalSource.includes("function thermalLossKwPerC(s=state)") && thermalSource.includes("coolingCapacityKw(s)/THERMAL_REFERENCE_DELTA"), "Cooling must express itself as heat shed per degree, not as a capacity to be exceeded");
assert(thermalSource.includes("ambientTemperatureC(s.time,s)+heatKw/thermalLossKwPerC(s)"), "The room temperature is no longer a heat balance");
assert(!/overload\*18|utilisation\*3\.2/.test(thermalSource), "The old overload cliff is back");
assert(thermalSource.includes("function siteBaselineC(s=state)") && thermalSource.includes("f.indoorBaseC??-Infinity"), "Enclosed sites need a temperature floor, or realistic winter ambients put a home office below freezing");
const opsSource = await readFile(new URL("src/data/operations.js", root), "utf8");
assert(/id:"home",[^}]*indoorBaseC:18/.test(opsSource), "A spare room sits inside a heated house");
assert(!/id:"container",[^}]*indoorBaseC/.test(opsSource), "A container yard is outdoors and should track the weather");
// Seasons peak about a month after the solstice.
assert(thermalSource.includes("Math.sin((day-111)/365*Math.PI*2)"), "The seasonal curve peaks on the solstice rather than a month after it");
const climates = [...opsSource.matchAll(/id:"(\w+)",name:"([^"]+)"[^}]*ambientC:(-?[\d.]+),seasonalC:(-?[\d.]+)/g)];
assert(climates.length === 8, `Expected eight regional climates, found ${climates.length}`);
for (const [, id, name, mean, swing] of climates) {
  const july = Number(mean) + Number(swing) * Math.sin((196 - 111) / 365 * 2 * Math.PI);
  const january = Number(mean) + Number(swing) * Math.sin((15 - 111) / 365 * 2 * Math.PI);
  assert(july < 34 && july > 8, `${name} has an implausible July mean of ${july.toFixed(1)} °C`);
  assert(january > -20 && january < 20, `${name} has an implausible January mean of ${january.toFixed(1)} °C`);
  assert(july > january, `${name} is warmer in January than July`);
}
assert(inline.includes("sheds ${fmtNum(thermalLossKwPerC())} kW per °C"), "The heat-rejection tile does not say what its capacity figure means");

// Required help patterns. The map's existence was already checked; what was not checked is
// whether the help it holds is usable - three terms per page, each actually defined, each
// pointing somewhere real, and no abbreviation left for the player to guess at.
const helpStart = renderSource.indexOf("const PAGE_HELP={");
const helpBlock = renderSource.slice(helpStart, renderSource.indexOf("\n};", helpStart));
assert(helpStart >= 0 && helpBlock.length > 0, "PAGE_HELP could not be extracted");
const helpEntries = [...helpBlock.matchAll(/(\w+):\{anchor:"([^"]+)",label:"([^"]+)",terms:\[(.*?)\]\}/g)].map(match => ({
  tab: match[1], anchor: match[2], label: match[3],
  terms: [...match[4].matchAll(/\["([^"]+)","([^"]+)"\]/g)].map(term => ({ name: term[1], definition: term[2] })),
}));
assert(helpEntries.length === orientationTabs.length, `Every non-Dashboard tab needs contextual help; found ${helpEntries.length} of ${orientationTabs.length}`);
for (const entry of helpEntries) {
  assert(entry.terms.length === 3, `${entry.tab} help defines ${entry.terms.length} terms; the disclosure is built for three`);
  assert(methodTargets.has(entry.anchor), `${entry.tab} help points at a Method target that does not exist: ${entry.anchor}`);
  assert(entry.label && entry.label === entry.label.toLowerCase(), `${entry.tab}'s help label reads mid-sentence as "How ${entry.label} works", so it should not be capitalised`);
  for (const term of entry.terms) {
    assert(term.definition.length >= 30, `${entry.tab} → "${term.name}" is defined in ${term.definition.length} characters; a definition explains a consequence, not a synonym`);
    assert(/[.!?]$/.test(term.definition), `${entry.tab} → "${term.name}" is not a finished sentence`);
    assert(!new RegExp(`^${term.name}\\b`, "i").test(term.definition), `${entry.tab} → "${term.name}" is defined by restating itself`);
    // An abbreviation on a card the player is reading has to be findable in the glossary.
    for (const abbreviation of term.name.match(/\b[A-Z]{2,}(?:\/[A-Z]+)?\b|\b[A-Z]\/[A-Z]{2}\b/g) || []) {
      assert(glossaryApi.glossaryEntries(abbreviation).length > 0, `"${abbreviation}" appears in ${entry.tab}'s help but cannot be found in the glossary`);
    }
  }
}
// The glossary is the fallback when a term is not on the page you are looking at, so the
// concepts help leans on should be searchable too.
for (const concept of ["hash rate", "power draw", "J/TH", "all-in rate", "reward variance", "knowledge", "bid", "cash runway", "liquid cash"]) {
  assert(glossaryApi.glossaryEntries(concept).length > 0, `The glossary cannot find "${concept}", which contextual help relies on`);
}

// The sandbox used to project a smooth trend with a ±15% sine and a flat monthly wobble.
// Its cycle and its volatility are now measured from the recorded history the run has just
// replayed: the shape is the detrended log residual of the three complete halving epochs,
// averaged by phase, and the volatility continues the decay from 139% annualised in
// 2011-13 to 46% in 2023-26.
const historyModel = await readFile(new URL("src/engine/history.js", root), "utf8");
assert(historyModel.includes("const HALVING_CYCLE_SHAPE=["), "The empirical halving-cycle shape is gone");
const shape = historyModel.match(/const HALVING_CYCLE_SHAPE=\[([^\]]+)\]/)[1].split(",").map(Number);
assert(shape.every(Number.isFinite), "The cycle template contains a value that is not a number");
assert(shape.length === 12, `The cycle template should carry twelve phase bins, not ${shape.length}`);
const trough = shape.indexOf(Math.min(...shape)), peak = shape.indexOf(Math.max(...shape));
assert(trough === 0, "The recorded cycle troughs immediately after a halving; the template no longer does");
assert(peak >= 3 && peak <= 5, `The recorded cycle peaks about a third of the way through an epoch; this template peaks at bin ${peak}`);
assert(Math.max(...shape) - Math.min(...shape) > 1.5, "The cycle template has been flattened back toward the sine it replaced");
assert(/CYCLE_AMP0=\.\d+,CYCLE_HALFLIFE=\d+/.test(historyModel), "The cycle amplitude no longer decays as the asset matures");
assert(/VOL_ANNUAL_0=\.\d+,VOL_ANNUAL_INF=\.\d+,VOL_HALFLIFE=\d+/.test(historyModel), "Projected volatility is no longer calibrated to the recorded series");
assert(!/cycleAmp=\.15\*Math\.exp|Math\.sin\(\(phase-\.2\)/.test(historyModel), "The old ±15% sine is back");
assert(historyModel.includes("function futureWobble(t,years,seed)") && !/futureWobble[^}]*nextRand/.test(historyModel), "The projected wobble must stay a pure function of the date, never the gameplay PRNG");
assert(historyModel.includes("cycleShapeAt(halvingPhase(t)-lag)"), "Hash rate should follow the price cycle with a lag rather than lead it: capacity is ordered after a rally and lands months later");

// A toast could not be dismissed. Clicking a linked one navigated but left it on screen for
// the full 8.5 seconds; an unlinked one was inert. Fixed over the bottom-right corner at
// z-index 70, that is what "sticky" felt like.
assert(inline.includes("function dismissToast()") && inline.includes('clearTimeout(toastTimer);toastTimer=null;toast=null;document.querySelector(".toast")?.remove()'), "A toast must be dismissible, and dismissing it has to clear the timer and the variable as well as the node");
assert(inline.includes('<button class="toast-dismiss" data-action="dismiss-toast" aria-label="Dismiss this message"'), "Every toast needs a labelled close control; an unlinked one had no way to go away at all");
assert(inline.includes('if(b.closest(".toast")){dismissToast();if(a==="dismiss-toast")return}'), "Acting on a toast must dismiss it, and must do so before the action re-renders - render() re-emits whatever `toast` still holds");
assert(!/fromToast[\s\S]{0,40}setTimeout\(dismissToast/.test(inline), "Dismissal must not be deferred to a timer: a background tab throttles those to about a second, which is the delay this fixed");
assert(inline.includes(':`data-action="dismiss-toast"`}'), "A toast with no destination should still be clickable to dismiss");
assert(css.includes(".toast-dismiss{") && css.includes("width:34px;height:34px") && css.includes(".toast-dismiss{width:40px;height:40px}"), "The toast close control is missing its styling or its touch targets");
assert(css.includes(".toast{padding-right:38px}"), "The close control overlaps the toast copy without room reserved for it");

// render() replaces #app entirely, which detaches every control inside it. If that lands
// between a press and its release the browser generates no click at all - the element the
// press began on no longer exists - and the press is silently swallowed. That is what
// "sometimes I cannot change speed or switch tabs" was.
assert(inline.includes("function holdRendersDuringPress()") && inline.includes("holdRendersDuringPress();"), "Repaints are no longer held during a press, so a repaint can swallow a click again");
assert(inline.includes("function deferWhilePressed(repaint)") && inline.includes("if(deferWhilePressed(()=>render(preserveScroll)))return;"), "render() must defer while a pointer is down");
assert(inline.includes("function renderMineContent(){\n  if(deferWhilePressed(renderMineContent))return;"), "renderMineContent() falls through to a full render on every tab but Mine, so it needs the same guard");
// The flush has to happen after the click is dispatched, never between release and click.
assert(inline.includes('document.addEventListener("click",()=>{pointerHeld=false;runDeferredRender()},false)'), "The held repaint must flush on click, in the bubble phase, after the action has run");
assert(!/pointerup[\s\S]{0,80}setTimeout\([\s\S]{0,40}runDeferredRender/.test(inline), "Flushing from a timer scheduled on pointerup can land between release and click and destroy the target again");
// A press that never reports a release must not freeze the interface.
assert(/setInterval\(\(\)=>\{if\(deferredRender/.test(inline) && inline.includes("performance.now()-deferredSince>1500"), "A stuck press would hold repaints forever without a sweeper");
assert(inline.includes('window.addEventListener("blur",()=>{pointerHeld=false;runDeferredRender()})'), "Losing focus mid-press must release the hold");

// Changing speed rebuilt the whole application to toggle one class, so the button was
// destroyed and recreated under the player's finger on every click - no active state, no
// focus, and any press overlapping the rebuild was lost. Four things depend on the speed;
// patch those and leave the rest of the DOM alone.
assert(inline.includes('else if(a==="speed"){state.speed=Number(v);state.returnSpeed=state.speed||state.returnSpeed;setTimer();save();refreshSpeedControls();refreshLive()}'), "Changing speed must patch its own controls, not rebuild the page underneath them");
assert(inline.includes("function refreshSpeedControls()"), "The speed-control patcher is missing");
assert(inline.includes('document.querySelectorAll(\'button.speed[data-action="speed"]\').forEach') && inline.includes('button.classList.toggle("active",Number(button.dataset.value)===state.speed)'), "The speed buttons no longer track the active speed in place");
// Replacing the button's children under a finger detaches the press target just as surely
// as replacing the button, so the icon and label are patched by textContent.
assert(inline.includes('<span class="pause-icon" aria-hidden="true">') && inline.includes('<span class="pause-label">'), "The mobile pause button needs separately patchable icon and label elements");
assert(inline.includes('if(icon)icon.textContent=state.speed?"Ⅱ":"▶"') && inline.includes('if(label)label.textContent=state.speed?"Pause":"Run"'), "The mobile pause button is being rebuilt rather than patched");
assert(!/\.mobile-pause-button[\s\S]{0,120}\.innerHTML=/.test(inline), "Setting innerHTML on the pause button detaches whatever the player is pressing");
assert(inline.includes("[data-live-simulation]") && inline.includes('label==="Simulation"?` data-live-simulation`:""'), "The Simulation metric has no hook, so it cannot be patched without a rebuild");
assert(inline.includes("[data-live-speed-panel]"), "The mobile speed panel has no hook");

// Every bad toast appended a full-screen fixed overlay and relied on animationend to take
// it away. Animations do not run in a background tab and may not run at all under reduced
// motion, so they accumulated: a 200-day fault storm left 82 stacked at z-index 9000, each
// compositing a full-viewport gradient every frame. That is what "locks up after a few
// toasts" was, and it grew without limit the longer a run went on.
assert(inline.includes("function clearImpactFlash()") && inline.includes('document.querySelectorAll(".impact-flash").forEach(node=>node.remove())'), "The impact flash must be swept up, including anything an earlier session leaked");
assert(inline.includes("flashTimer=setTimeout(clearImpactFlash,1200)"), "Removal cannot depend on animationend alone: it does not fire in a background tab");
const impactBody = inline.slice(inline.indexOf("function triggerImpactEffect()"), inline.indexOf("function triggerImpactEffect()") + 1200);
assert(impactBody.indexOf("clearImpactFlash();") >= 0 && impactBody.indexOf("clearImpactFlash();") < impactBody.indexOf('createElement("div")'), "Each impact must clear the previous overlay before adding its own, so only one can ever exist");
assert(inline.includes("function reducedMotion()") && /triggerImpactEffect\(\)\{\s*if\(reducedMotion\(\)\)return;/.test(inline), "A player who has asked for reduced motion should not be given a screen shake and a flash at all");
assert(inline.includes("shakeTimer=setTimeout(drop,900)"), "The shake class needs a timed removal too, or it can stay on .app forever - and a transform there changes the containing block for every fixed child");
assert(inline.includes("lastImpactAt=now") && inline.includes("now-lastImpactAt<4000"), "The shake throttle is gone");

// Every sprite used to embed the shared gradient defs: 830 bytes repeated 151 times on a
// busy Mine tab, and 750 duplicate element ids in one document. SVG resolves url(#mgm)
// against the first match, so the copies were already inert - they just cost 132KB.
assert(inline.includes("function svgSpriteDefs()") && inline.includes('class="svg-sprite-defs"'), "The shared sprite defs must be emitted once per page");
assert(inline.includes('document.getElementById("app").innerHTML=`${svgSpriteDefs()}<div class="app">'), "The defs block has to sit at the app root so it survives both a full render and a Mine-only repaint");
assert(!/(miner-icon|spare-part-icon|cooling-item-icon)[^`]*\$\{MINER_SVG_DEFS\}/.test(inline), "A sprite is carrying its own copy of the shared defs again");
assert((inline.match(/const MINER_SVG_DEFS=/g) || []).length === 1, "The shared defs should be defined exactly once");
const artIdx = appScripts.indexOf("src/ui/art.js"), consumerIdx = appScripts.indexOf("src/ui/enhance/mine-market.js");
assert(artIdx >= 0 && artIdx < consumerIdx, "art.js owns MINER_SVG_DEFS and must load before the sprite functions that reference it");
assert(css.includes(".svg-sprite-defs{position:absolute;width:0;height:0;overflow:hidden;pointer-events:none}"), "The defs carrier must take no layout space and no pointer events");

/* LAUNCH-WEEK GUARDS. Each of these is a promise made to a player who is not the developer. */
{
  const recovery = await readFile(new URL("src/app/recovery.js", root), "utf8");
  const bootstrap = await readFile(new URL("src/app/bootstrap.js", root), "utf8");
  const events = await readFile(new URL("src/app/events.js", root), "utf8");
  const footer = await readFile(new URL("src/ui/footer.js", root), "utf8");
  const notify = await readFile(new URL("src/ui/notify.js", root), "utf8");
  // A boot that throws must never leave a blank page.
  assert(appScripts[0] === "src/app/recovery.js", "The recovery page has to load before any game code, or a failed start is blank again");
  assert(/window\.addEventListener\("load",function\(\)\{if\(!window\.gameBooted\)show\(\)\}\)/.test(recovery) && /render\(\);window\.gameBooted=true;/.test(bootstrap),
    "Bootstrap no longer says the first render succeeded, or the recovery page no longer checks");
  for (const label of ["Export my save", "Start a new run", "Try again", "Copy debug info"]) assert(recovery.includes(label), `The recovery page lost its "${label}" button`);
  assert(!/(^|[^.\w])fetch\(|XMLHttpRequest|sendBeacon/.test(recovery + footer), "Feedback and recovery must not send anything: they only link out and copy text");
  // The tour's promise that the clock is held.
  assert(events.includes('if(a==="speed"&&Number(v)>0&&tourActive())'), "The speed buttons start the clock during the tour again");
  // Leaving the tab pauses the game; it does not fast-forward on return.
  assert(/visibilityState==="hidden"[\s\S]*state\.speed=0/.test(bootstrap) && !/tick\(true\)/.test(bootstrap), "A hidden tab no longer pauses the game, or the catch-up burst is back");
  // The footer: feedback, debug text and what is stored.
  for (const text of ["Report a bug", "Suggest something", 'data-action="copy-debug"', "No accounts, no tracking, no analytics"]) assert(footer.includes(text), `The footer lost "${text}"`);
  assert(footer.includes('const TIP_URL="https://strike.me/@jandex"') && footer.includes('class="footer-tip"') && footer.includes('rel="noopener noreferrer"'), "The Lightning tip link is gone from the footer, or no longer opens safely");
  assert(/const FEEDBACK_EMAIL="[^"@]+@[^"@]+"/.test(footer) && footer.includes("mailto:${FEEDBACK_EMAIL}"), "The footer has lost its Email link for people without a GitHub account");
  assert(footer.includes("issues/new?") && footer.includes("version:APP_VERSION"), "The feedback links no longer carry the version");
  assert(inline.includes("${footerHtml()}"), "render() no longer draws the footer from footer.js");
  // The key's warning: true, and in readable text.
  assert(!inline.includes("cannot receive real bitcoin"), "The wallet ceremony says the key cannot receive real bitcoin, which is not true of any 64-digit key");
  assert(/<p class="modal-warning"><b>Do not use this key for real bitcoin\./.test(inline), "The warning under the key is back in the smallest text");
  assert(/\.modal-note\{[^}]*font:11px/.test(css) && /\.footer\{[^}]*font:11px/.test(css), "The modal notes or the footer are back to nine pixels");
  // Keyboard focus survives a repaint, and a modal takes it. Secondary text keeps a readable contrast.
  assert(inline.includes("function captureFocus()") && inline.includes("restoreFocus(focusSelector);"), "A full render drops keyboard focus again");
  {
    const lum = hex => { const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
    const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05); };
    const token = name => new RegExp(`--${name}:(#[0-9a-f]{6})`).exec(css)?.[1];
    for (const fg of ["muted", "dim"]) for (const bg of ["bg", "panel", "panel2"])
      assert(ratio(token(fg), token(bg)) >= 4.5, `--${fg} on --${bg} is below 4.5:1: secondary text is hard to read`);
  }
  // Custody: a way in from the first day, a sequence, and a tour that says so.
  assert(inline.includes('id:"beigepc"') && inline.includes("function coldDepositBlockReason()") && !inline.includes("Cold storage practices unlock in 2012"), "Cold storage is gated on 2012 again, or the early signer is gone");
  assert(inline.includes("function coldSetupCard()") && inline.includes("const CUSTODY_GROUPS=[") && inline.includes("orderCustodyCards(grid)"), "The Custody section has lost its step-by-step card or its order");
  assert(inline.includes('id:"coldsetup"') && inline.includes('id:"custodypage"'), "The tour no longer explains cold storage and the shape of the Custody page");
  assert(inline.includes('id:"cold-storage"') && inline.includes("const HOT_GRACE_DAYS=60"), "The cold storage briefing or the online wallet's grace period has gone");
  assert(inline.includes("function lossOddsText(o)") && inline.includes('class="modal-odds"'), "The loss modal no longer says how likely the loss was");
  // Disasters are drawn, not just described: an emblem in the loss window and an overlay on the floor, still when motion is reduced.
  assert(inline.includes("const DISASTER_SCENES=") && inline.includes("function lossEmblemHtml(scene)") && inline.includes("function floorSceneArtHtml()") && inline.includes("function floorSceneBannerHtml()"), "The disaster art is gone");
  assert(inline.includes("lossEmblemHtml(loss.scene)") && inline.includes("floorSceneArtHtml()") && inline.includes("floorSceneBannerHtml()") && inline.includes("floorSceneSignature()"), "The loss window or the mining floor no longer draws the disaster");
  for (const scene of ["fire", "flood", "burglary", "grid", "net"]) assert(css.includes(`.floor-scene.scene-${scene} .floor-scene-art`), `The floor has no overlay for ${scene}`);
  assert(inline.includes("function floorSmokeHtml()") && (inline.match(/floorSmokeHtml\(\)/g) || []).length >= 3 && css.includes(".floor-smoke{position:absolute;inset:0;z-index:3;pointer-events:none") && /prefers-reduced-motion:reduce\)\{\.floor-smoke i\{animation:none/.test(css), "Smoke is gone from the burning floor, takes clicks, or ignores reduced motion");
  assert(css.includes(".floor-scene{position:absolute;inset:0;z-index:6;pointer-events:none") && /prefers-reduced-motion:reduce\)\{\.glyph-fire/.test(css), "The floor overlay takes clicks again, or the flame ignores reduced motion");
  // The next step up is teased, greyed, in Facilities and in the hardware catalogue; and the tip sits at the very bottom.
  assert(inline.includes("nextReleases(FACILITIES)") && inline.includes("nextReleases(REGIONS)") && inline.includes("nextReleases(HARDWARE)") && inline.includes("unlockInText(") && css.includes(".facility.teaser,.item.teaser"), "The next site, location or machine is no longer teased");
  assert(footer.indexOf('class="footer-tipline"') > footer.indexOf('class="footer-privacy"'), "The tip link is no longer the last thing in the footer");
  // A tech node's detail is readable whatever it overlaps: its node is lifted above the others, and it opens where there is room.
  assert(css.includes(".tech-node:hover,.tech-node:focus-within{z-index:30}") && css.includes(".tech-node.flip-up .tech-node-detail") && css.includes(".tech-node.align-right .tech-node-detail") && inline.includes("function placeTechDetail(node)"), "The tech tree's hover detail can be painted over by neighbouring nodes again, or cut off at the lattice's edge");
  // An order is visible on the machine's own card, and the racking toasts do not invent a crew.
  assert(inline.includes("function hardwareOrderStrip(h)") && inline.includes("hardwareOrderStrip(h)") && css.includes(".hw-order-strip{"), "A machine on order no longer shows where it is on its own card");
  assert(!inline.includes("Machines came online as the crew") && !inline.includes("come back as the crew works") && !inline.includes("Wait for the crew to finish"), "A racking toast talks about a crew again, which a run with no technicians does not have");
  // The home office is a room, not a factory, in the 3D floor: its own dressing, no industrial grille, no hi-vis.
  {
    const scenery = await readFile(new URL("src/ui/floor3d/scenery.js", root), "utf8");
    const cooling = await readFile(new URL("src/ui/floor3d/cooling.js", root), "utf8");
    assert(scenery.includes("function homeOffice(api,w,d,s)") && scenery.includes("if(home)homeOffice(api,w,d,s);") && scenery.includes("if(!home){"), "The home office has lost its own dressing in the 3D floor");
    assert(cooling.includes("p.id!=='home'){box([1.1,1.05,.35]"), "The home office has a steel wall grille again where its window should be");
    assert(scenery.includes("if(!home)for(const y of [.94,.84])"), "People at the home office wear hi-vis again");
  }
  // Every site past the home office has its own palette and details: the seven are distinct, and the scenery asks for them.
  {
    const sites = await readFile(new URL("src/ui/floor3d/sites.js", root), "utf8");
    const mount = await readFile(new URL("src/ui/floor3d/mount.js", root), "utf8");
    const scenery = await readFile(new URL("src/ui/floor3d/scenery.js", root), "utf8");
    const styles = [...sites.matchAll(/(?<![a-z])(garage|workshop|warehouse|campus|container|hydroplant|megacampus):\s*\{slab:0x[0-9a-f]+,yard:0x([0-9a-f]+),floor:0x([0-9a-f]+),grid:0x[0-9a-f]+,line:0x[0-9a-f]+,hazard:0x[0-9a-f]+,wall:0x([0-9a-f]+),trim:0x([0-9a-f]+)/g)];
    assert(styles.length === 7, `FloorSites should style seven sites, found ${styles.length}`);
    for (const [field, index] of [["wall", 4], ["floor", 3], ["trim", 5]]) assert(new Set(styles.map(m => m[index])).size >= 6, `The sites' ${field} colours are no longer distinct: they are the same room at seven sizes again`);
    assert(new Set(styles.map(m => m[2])).size >= 6, "The sites' ground colours are no longer distinct");
    assert(/id==='(garage)'[\s\S]*id==='workshop'[\s\S]*id==='warehouse'[\s\S]*id==='campus'[\s\S]*id==='container'[\s\S]*id==='hydroplant'[\s\S]*id==='megacampus'/.test(sites), "A site has lost its own details");
    assert(sites.includes("const h=.8,gapX=w/2-6,gap=3;") && sites.includes("[w/2,-d/2],[-w/2,d/2],[w/2,d/2]"), "The large indoor sites have lost the kerb walls and corner posts that close their outline");
    assert(scenery.includes("FloorSites.style(p.id,site.large)") && scenery.includes("FloorSites.details(p.id,api,{w,d,site,s})"), "The scenery no longer asks FloorSites for each site's look");
    assert(mount.indexOf("sites.js") > 0 && mount.indexOf("sites.js") < mount.indexOf("scenery.js"), "sites.js is not loaded before scenery.js");
  }
  // Before the market opens, cash and miners are the only way to pay a bill, and the game says so everywhere it matters.
  assert(inline.includes("STARTING_LIQUIDITY_DEFAULT=2500") && inline.includes("with a laptop and $2,500.") && inline.includes("a $2,500 default (the minimum is $1,500)"), "The default opening cash or its explanation has changed back");
  assert(inline.includes("function endRunNoMarket(due)") && inline.includes("if(state.time<MARKET&&typeof endRunNoMarket===\"function\"&&endRunNoMarket(due))return;") && inline.includes('state.endReason==="nomarket"'), "A run can survive the gap before the market opens by restructuring again, or the end screen no longer says why it ended");
  assert(inline.includes('id:"no-market-cash"') && inline.includes('id="method-no-market"') && inline.includes("Before July 2010 there is no market"), "The Dashboard warning, the Method section or the tour no longer explain the no-market rule");
  assert(inline.includes("disabled:state.debt>0||noMarket") && inline.includes("disabled:noMarket,title:noMarket?NO_MARKET_RULE"), "The settlement screen offers arrears or restructuring before the market opens");
  // The cut line locks the screens that need it, and the two big moments get confetti (not for a failed run, not for reduced motion).
  {
    const offline = await readFile(new URL("src/ui/offline.js", root), "utf8");
    const confetti = await readFile(new URL("src/ui/confetti.js", root), "utf8");
    assert(offline.includes('OFFLINE_OPEN_TABS=["dashboard","mine","ledger","method"]') && offline.includes("function offlineLockHtml(tab)") && offline.includes("function offlineDashboardHtml()"), "The offline lock has lost its list of open screens or its screens");
    assert(inline.includes('if(activeTab==="dashboard")return offlineDashboardHtml();if(offlineTabLocked(activeTab))return offlineLockHtml(activeTab)') && inline.includes("offlineSidebarHtml()") && inline.includes("offlineHardwareLockCard()"), "A screen that needs the internet is no longer locked when the line is cut");
    assert(!/<div class="[^"]*\bgrid\b[^"]*"[^>]*>\$\{/.test(offline.slice(offline.indexOf("function offlineLockHtml"), offline.indexOf("function offlineHardwareLockCard"))), "A lock screen is a .grid again, so enhancers fill it with the cards it should hide");
    assert(confetti.includes("prefers-reduced-motion: reduce") && confetti.includes('state.endReason!=="receivership"&&state.endReason!=="nomarket"') && confetti.includes("ev.celebrate"), "Confetti ignores reduced motion, fires on a failed run, or has lost the market-opening moment");
    assert(inline.includes('{id:"mtgoxopen",celebrate:true') && inline.includes("e.imp===3&&(state.storyPause||e.celebrate)"), "The market opening no longer always opens its window");
  }
  // The first screen frames the Standard start as an IRC message a month after the Genesis Block, and the rules it runs on are in the friend's mouth.
  {
    const chat = await readFile(new URL("src/ui/intro-chat.js", root), "utf8");
    assert(inline.includes('introChatHtml(selectedMode)') && chat.includes("a month after the Genesis Block") && chat.includes("nobody will buy them") && chat.includes("the electricity is NOT, so bring cash"), "The first screen has lost its IRC message, or the message no longer says why the cash matters");
    assert(chat.includes('mode.id!=="medium"&&mode.id!=="easy"') && css.includes(".irc-cursor") && css.includes("prefers-reduced-motion:reduce){.irc-cursor"), "The IRC message appears for the wrong starts, or its cursor ignores reduced motion");
  }
  // Emergency stop all is the player's choice and stays: the handler records it, and a paid bill does not undo it.
  assert(inline.includes('else if(a==="toggle-power")toggleSitePower();') && inline.includes("state.power=!state.power;state.manualStop=!state.power;") && inline.includes("state.power=sitePowerAfterBill();") && inline.includes("function sitePowerAfterBill(){return !state.policyLock&&!state.manualStop}"), "Emergency stop all can be undone by the next monthly bill again");
  // The brand is Timechain, the release is Beta, the coin links to the whitepaper, and the storage keys did not move with the name.
  {
    const dash = await readFile(new URL("src/ui/tabs/dashboard.js", root), "utf8");
    const head = await readFile(new URL("index.html", root), "utf8");
    assert(dash.includes('<div class="brand-name">TIMECHAIN</div>') && dash.includes("${APP_RELEASE} · seed ${state.seed}"), "The header does not say Timechain, or does not show the release and seed");
    assert(dash.includes('class="coin" href="https://bitcoin.org/bitcoin.pdf" target="_blank" rel="noopener noreferrer"'), "The coin at the top left no longer opens the whitepaper in a new tab, safely");
    assert(inline.includes('const APP_STAGE="Beta"') && inline.includes("const APP_RELEASE=`${APP_STAGE} ${APP_VERSION}`"), "The release label is no longer built from APP_STAGE and APP_VERSION");
    assert(head.includes("og:title\" content=\"Timechain") && head.includes("mja1337.github.io/timechain/") && !/hashrate/i.test(head), "index.html still carries the old name or the old address");
    assert(inline.includes('const SAVE_KEY="hashrate-genesis-save-v1"') && inline.includes('const CAREER_KEY="hashrate-career-v1"'), "The storage keys changed with the name, which would orphan every saved run on this origin");
  }
  // Good news waits behind a modal; a refused save is visible.
  assert(notify.includes("TOAST_DEFERRABLE") && inline.includes("flushDeferredToasts();"), "A toast can land on top of a modal again");
  assert(notify.includes("function announceSaveState()") && inline.includes("saveStateHtml()"), "A browser that refuses to store the game is no longer shown in the header");
  assert(/function save\(\)\{return writeSave\(state\)\}/.test(inline), "save() no longer reports whether the game was stored");
}

console.log("UI contracts passed: Mine purchases, difficulty and mobile speed controls, transaction precision, enhancement guards, mempool containment, fleet servicing, repair labour, overdrive, Method coverage, speed-resume safety, the exchange trade-ticket flow, network-hash display parity, bad-event impact effects, timed facility-upgrade risk, mining-floor connectivity/power status, the 100-year procedural sandbox continuation, pool fee display, pool shutdown fail-over, the custody transfer slider, Lightning gating, live market pricing, mempool realism, disabled-control tooltips, the single-venue market redesign, Mine-tab scroll stability, full-refurbishment puzzle consistency, the proactive settlement warning, connectivity ping, the unified incoming-fleet pipeline, proportional fleet-health severity colors, rival operators, milestone moments, the end-of-run recap, cross-run career persistence, the dice-entropy wallet-setup ceremony, the era-accurate wallet-software upgrade path, the resetGame() operator-era crash fix, the real mailing-list learning items, the Dashboard build-queue card, hands-on self-servicing before technicians are hired, the fault-clearing/offline-threshold repair fix, the non-blocking faucet popup, tiered spare parts, the historically-grounded custody/region exposure warnings, free self-serviced labour with real self-damage risk, the four hardware self-help skills, staff dismissal the operator XP/level system, dated pool payout schemes, one drawing per machine, and scroll-anchored, frame-aligned repaints");
