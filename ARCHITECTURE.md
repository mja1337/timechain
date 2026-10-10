# Timechain project structure

`index.html` is deliberately only the application shell. Keep implementation code out of it.

## Ownership

- `historical-data.js` - generated, immutable runtime history. Rebuild it with `scripts/build-historical-data.mjs`; do not hand-edit it. Price, hash, fees, transactions and height come from Coin Metrics; difficulty comes from mempool.space as one exact value per 2016-block retarget, with fee rates (median and 90th percentile), retarget heights and the four halving blocks from the same place. Pass `--difficulty-only` to rewrite that series alone, or `--recompress` to re-encode what is already on disk without touching the network. Regular series are stored as a start date plus a cadence rather than a date per point; the file decodes itself, so `window.HISTORICAL_DATA` exposes the same pair arrays it always has.
- `src/config/timeline.js` - protocol dates, opening constants and scoring eras.
- `src/data/network.js` - fallback price/hash/transaction series, pools and the recorded-data bindings.
- `src/data/hardware.js` - miner specifications, spare parts, and which part each machine takes (`fanTierFor`, `hashboardTierFor`). Those two live here rather than in `maintenance.js` because `simulation.js` calls them in a top-level save migration, and `maintenance.js` is parsed after it.
- `src/data/operations.js` - facilities, regions, connectivity, energy contracts and staff.
- `src/data/progression.js` - learning, skills, nodes, securities, donations and optional scenarios.
- `src/data/content.js` - balance scenarios, release notes and historical story events.
- `src/data/glossary.js` - the canonical terminology, its searchable aliases and the Method chapter each term points at.
- `src/engine/operator.js` - experience, operator levels and the best-share record. Loaded **before** `simulation.js`, whose state migration calls `normalizeXp()` at the top level.
- `src/engine/maintenance.js` - spare parts, fault attribution, service jobs and the hands-on repair puzzles.
- `src/engine/pools.js` - pool selection, market share, fees and payout schemes (FPPS / PPS / PPS+ / PPLNS / TIDES).
- `src/ui/notify.js` - transient toasts and the bad-event impact effect; presentation rather than simulation.
- `src/ui/art.js` - per-facility mining-floor and spare-part illustration.
- `src/engine/history.js` - interpolation and historical/protocol lookup functions.
- `src/engine/thermal.js` - cooling capacity, active heat load, room temperature and thermal stress.
- `src/engine/nodes.js` - node power, synchronization, independent verification and Lightning capability.
- `src/engine/simulation.js` - state, migrations, economics, ticking and live refresh.
- `src/engine/event-effects.js` - what a dated event does to the operation (a lender failing, a leaked customer list, a ban closing a site). Loaded straight after simulation.js, which is at its size ceiling.
- `src/engine/losses.js` - coins that leave and do not come back: the loss queue and its modal, venue failures, the hot-wallet incident roll.
- `src/engine/facilities.js` - changing site in either direction: the shared risk model, the timed job and the commissioning that ends it.
- `src/engine/fleet-ops.js` - the fleet's physical life: deliveries, racking, retirement, staged machines and what is true of the fleet while that work is half done.
- `src/engine/connectivity.js` - how the site reaches the network, what that costs and how often it stops; satellite is priced differently from fixed lines.
- `src/engine/immersion.js` - dielectric tanks, converting air-cooled miners and what submerging a machine changes.
- `src/engine/recap.js` - cross-run career persistence and the end-of-run narrative.
- `src/app/recovery.js` - the page shown when the game cannot start, and the text a bug report carries. Loaded **first**, before any game code, and uses none of it: it is plain ES5 with inline styles so it works if everything else fails. `bootstrap.js` sets `gameBooted` after the first render; without it, the page takes over `#app` on load.
- `src/engine/save-guard.js` - what happens to a stored save that cannot be used (it is kept under its own key, never overwritten) and to a browser that will not store the game (`saveFailing`). Loaded before `simulation.js`, which reads the save at the top level through it.
- `src/ui/footer.js` - the footer: feedback links to the issue forms, "Copy debug info", the statement of what is stored, and the notice that a save was set aside.
- `src/engine/render-queue.js` - when the clock's effects reach the screen. Loaded before `simulation.js` on purpose, since its flags are top-level `let` bindings.
- `src/engine/settlement.js` - the month boundary: the bill, the forecast, and the rescues when cash falls short. Nothing is sold on the player's behalf.
- `src/engine/custody.js` - devices, keys, wallet policy, backups and the monthly custody risk rolls. Loads after `simulation.js`, so anything its migration needs lives in `src/data/custody.js`.
- `src/engine/payouts.js` - pool payout destinations and thresholds; `creditPayout` is the single point where coins arrive.
- `src/engine/signing.js` - spending from cold storage as a ceremony that takes days.
- `src/engine/treasury.js` - how far away the money is and what it costs to bring it: the count of coins to gather, the fee by weight at that day's rate, reach, and fetching the reserve for a bill. Extends `signing.js`.
- `src/data/custody.js` - the equipment catalogue and the places things are kept, plus `hashRoll` and `normalizeCustodyPlaces`. Everything the load-time migration needs is here because it loads before `simulation.js`.
- `src/engine/places.js` - where devices, seed backups and the wallet descriptor are kept: which places survive a fire, a flood or a break-in, how long a signing takes given where the keys are, journeys, and what the border does. Every roll is `hashRoll(state.seed, ...)`, never `nextRand()`.
- `src/engine/keyholders.js` - who holds each key, what dismissing a holder exposes, the insider risk, and rotation: replacing a key as a job that sweeps every coin at the real fee. Rolls are `hashRoll`, never `nextRand()`.
- `src/engine/credit.js` - what borrowing costs and what a lender or insurer sees: the operating loan's rate (one function, not seven), the custody posture, the audit, and coin cover. Claims are paid inside `reportCoinLoss`, so no incident has to know that cover exists.
- `src/engine/lending.js` - borrowing against the coins themselves: collaborative custody and a full-custody pledge, margin calls and liquidation, and what a lender failing does to each. No dice: a call and a sale are functions of the price.
- `src/ui/tabs/treasury.js` - the Treasury: Market, Custody and Finance as sections of one tab, with a position strip above them and a sticky section bar. `openTab()` turns every name those sections ever had into the Treasury plus the right section, so no toast, loss notice, banner or menu entry had to change; `activeTabKey()` is what help text, orientation copy, enhancers and live patching are keyed on. A contract scans the source for every tab name and requires each to resolve.
- `src/engine/hotkey.js` - the first key: the software key behind the online wallet, which lives on the mining computer and meets what meets the mine. Not part of any wallet policy; a run without one behaves as before.
- `src/ui/enhance/hotkey.js` - the online wallet's card on the Custody section.
- `src/ui/tour.js` - the first-run tutorial: ten short steps, each one real action (a `done(state)` test read from game state, and an `act()` that works out the step's next action from game state every time), drawn as a card after every render and re-checked on a short interval. It walks a new run from its wallet ceremony to a fully set up wallet (online key backed up, signer prepared, reserve key written down and assigned, both backups sent away from the mine, income destination chosen) and ends when the player presses play. It can never be stuck: the card always shows the step's next action with a button that does it (`tour-do`, the same engine call as the page control, which is ringed when on screen); a step that is waiting for a delivery or a move runs the clock by itself and stops it on arrival, and the clock is otherwise held; the card always sits on the first step that is not done, so extra purchases and steps done early are passed over and anything undone takes it back to that step with a notice; a bill, loss or chapter on screen holds it; a run that ends ends it. Money: when it starts it sets the price of the cheapest signer that arrives in time aside from cash (`state.tour.escrow`, shown in the top bar, counted in net worth, drawn on by `orderCustodyProduct` via `tourReleaseFor`, handed back on skip or end), so a new run (at least $1,500) can always afford its signer. `tourEnsureSigner` handles the rest silently: a signer of the player's own (or their order) that would arrive after the record ends arrives now, and on the signer step only, with no usable signer and cash plus the hold short (a signer lost before its key, a replay begun with little cash), it puts a free signer on the floor (signers cannot be sold). The tutorial ends unfinished only on Skip or when the run ends. `scripts/tutorial-guarantee.mjs` (run by check-ui-contracts) plays hundreds of randomly interfered runs across start dates to hold it to this. The step is saved by id in `state.tour` (`v:2`); a save with no record has done it, and one part-way through the old tour starts again. Replay it from the footer. It never draws from `nextRand()`.
- `src/ui/enhance/counterparties.js` - the posture, the audit, cover and the loan on the custody tab.
- `src/ui/enhance/settlement.js` - the monthly settlement modal, built from a list of options (the reserve and loan cards from the Treasury sit first), not from a template patched by string replacement.
- `src/ui/enhance/servicing.js` - the fleet servicing panel on the Mine tab.
- `src/ui/enhance/people.js` - the holder controls on each key, rotation progress, and the warning on a staff card before somebody who knows a key is dismissed.
- `src/ui/enhance/places.js` - the "Where things are kept" card.
- `src/ui/enhance/treasury.js` - the settlement reserve card, the cold-spend review and the cost line, as sentences over the engine's numbers.
- `src/engine/actions.js` - player mutations, transactions, imports and exports.
- `src/ui/transaction-preview.js` - the review shown before a money action.
- `src/ui/chart-legend.js` - the shared chart key (swatch in the series' own line style, label, value, units note) used by every chart.
- `src/ui/topbar-cash.js` - the always-visible cash readout in the sticky topbar (state.cash, with overdrawn/arrears/short-of-bill states).
- `src/ui/presentation.js` - formatting, charts and reusable visual helpers.
- `src/ui/tabs/` - base tab markup split into Dashboard, Mine, Ledger, Market, operations and Method ownership.
- `src/ui/enhance/` - post-render visuals split into Mine/Market, custody and operating-system ownership.
- `src/ui/custody-map/state.js` - the derived custody view model shared by the future Three.js map, its accessible fallback and its detail panel. It separates money location, spending approval and network verification without creating another game-state store.
- `src/ui/live.js` - the cheap per-tick DOM patches for the header, charts and live tab panels; presentation rather than simulation.
- `src/ui/render.js` - modal, sidebar and application-shell rendering.
- `src/app/events.js` - delegated DOM events.
- `src/app/bootstrap.js` - compatibility adjustments and startup.
- `src/styles/app.css` - all application styling and responsive rules.

These are ordered classic scripts so the rebuild preserves existing save compatibility and avoids a risky gameplay rewrite. New code should be placed in the narrowest owning file. Do not add another script tag without updating the structural contract.

## Safety checks

Run these before handing off a change:

```powershell
node scripts/check-project-structure.mjs
node scripts/check-ui-contracts.mjs
node scripts/check-historical-data.mjs
node scripts/check-engine-behaviour.mjs
```

The checks enforce dependency order, external assets, a version on every local asset URL (see the README's release section), module size, unique Mine purchase quantities, historical-series integrity and JavaScript syntax.

`scripts/fixtures/` holds saves written by earlier versions of the engine. A rule loads one to prove an old save still opens, so a fixture is never regenerated: it stays as the shape it was written in.
