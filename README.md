# Timechain

> A game-first history of Bitcoin, from the Genesis Block to today. Start with one computer. Mine, keep your keys safe and stay solvent as the technology, the network and the world change.

**Beta 1.1** · plays in the browser, free, no account · live at https://mja1337.github.io/timechain/

## What you do

You start with one computer and a small amount of cash, on a real date in Bitcoin's history, and run a mining operation forward day by day. The price, the network's hash rate, difficulty, fees and the big events (the first ASICs, Mt. Gox, the halvings, the ETFs) are the **recorded** ones from 2009 to today, so you are making decisions against what actually happened. After the recorded data ends, the game carries on for up to a hundred simulated years.

- **Pick your moment.** Start on the day of the Genesis Block, a month later (the default), in January 2013 as ASICs arrive, or in January 2025 against an industrial network. Each is a different game.
- **Survive the early years.** Nothing you mine can be sold before Bitcoin gets a market price in July 2010, so for the first stretch cash is life. A bill you cannot pay can be met by selling hardware, and if that is not enough the run is over.
- **Run a real operation.** Choose miners and order them (they arrive late and need commissioning), pick a power contract and an internet plan, and move from a spare room to a garage, a warehouse, a container yard, a hydro plant or a campus in one of eight regions, each with its own electricity, climate, risk and rules. The 3D floor changes with every site.
- **Keep it running.** Machines wear out, fail and need parts. Repairs take labour and time, you can service them yourself or hire technicians, and you can hire the rest of a team too: logistics, procurement, inventory, treasury and security.
- **Keep it cool.** Heat is a balance of what the machines put in and the room sheds. Fans, air conditioning, chillers and immersion change that balance, and they draw power from the same supply as the miners.
- **Pick a pool.** Compare payout schemes (FPPS, PPS, PPLNS, TIDES), run a node, build block templates, and watch fees and profitability move with the market.
- **Look after your keys.** Start with the old beige PC in the basement as your first signer, then move on to hardware wallets, a second key and a multisig quorum. Keep your backups somewhere, and learn that a backup in the same room as the signer burns with it. Fires, floods, break-ins, failed disks, compromised keys and seizures are all possible, and when you lose coins the game shows you the odds and what would have protected you.
- **Borrow carefully.** Lenders look at your custody setup, and one that fails can leave you short. Spending from cold storage is a ceremony that takes days.
- **Pull the plug.** You can cut the internet, stop the machines and put a run on hold, but you will not know what is happening in the world until you reconnect.
- **Be scored.** Operator Score, levels, a skill tree and a learning track reward the right decisions as well as the right outcome, and finishing a run earns confetti.

It also opens with an IRC message from a friend who has read the mailing list and has views.

## Who it is for

- **Test your market knowledge.** Would you have held, sold, borrowed or ridden out 2011, 2014, 2018 and 2022? Play it with the real prices and the real news, and find out.
- **Ask "what if".** What if I had bought a handful of early ASICs and mined through college? What if I had started in 2013, or kept every coin? Pick the date and the hardware and see where it ends up, with the same price history you remember.
- **Learn what running a mine involves.** Power, internet, hardware servicing, parts and repairs, cooling, upgrades, scaling up and hiring staff are all things that you decide and pay for, with the reasoning shown in the Method tab rather than hidden.
- **Learn custody without losing anything real.** Find out what cold storage, backups, multisig and a lender's questions mean by watching what they would have done for you.
- **Teach it.** The tour, the Learn tab and Method (which separates recorded numbers from derived and modelled ones) are written for people who have heard of Bitcoin and never looked inside it.

It is free, runs in a browser (phones included), needs no account and sends nothing anywhere. Your game is saved only in your browser.

## Contributing

If you find Timechain valuable, please get involved. Playtesting and honest feedback are the most useful contribution: tell me where it was confusing, unfair or wrong. Corrections to the history, better explanations, new events, balance ideas, accessibility fixes and bug reports are all welcome, from experienced miners as much as from people new to Bitcoin.

- Open an [issue](https://github.com/mja1337/timechain/issues/new/choose) for a bug or an idea, or email **satoshistaysrad@proton.me**.
- To change something, fork the repository, make the change and open a pull request. There is no build step: `python3 scripts/dev-server.py 8090` and edit the files. [ARCHITECTURE.md](ARCHITECTURE.md) explains how the code is laid out, and the four checks under [Safety checks](#safety-checks) must pass.
- Bump `APP_VERSION`, add a changelog entry and update Method for anything players will notice (see [Releasing and rolling back](#releasing-and-rolling-back)).
- For historical claims, please link a source. The game labels every number as recorded, derived or modelled, and new data should do the same.

## Under the hood

A single-page, offline browser game covering Bitcoin (mining, markets, custody and risk) from the Genesis Block to the present, and up to a hundred simulated years beyond it. No build step, no dependencies, no network calls at runtime: `index.html` loads a series of ordered classic scripts and a generated historical dataset.

The game should be understandable to someone who knows Bitcoin exists but has never looked at mining, while remaining precise enough for someone who has. The answer to that tension is progressive disclosure, not less depth: interface copy leads with consequences, contextual help answers "what does this mean and why do I care", and Method carries the formulas, edge cases and modelling assumptions.

## Running it

```bash
python3 scripts/dev-server.py 8090
```

Then open `http://localhost:8090`. The server sends `Cache-Control: no-store`, so a plain reload always picks up edited source. Any static server works; the file can also be opened directly, though some browsers restrict `localStorage` on `file://`.

Saves live in `localStorage` under `hashrate-genesis-save-v1`, with cross-run career history under `hashrate-career-v1`. Those keys keep the name the game had before it was Timechain on purpose: changing them would orphan every saved run on the same origin. **New run** in the footer resets the current game. A stored save that cannot be used (not JSON, or the wrong shape) is never overwritten: its raw text is kept under `hashrate-genesis-save-v1.unreadable`, the footer offers to export it, and a fresh run starts. If the page cannot start at all, `src/app/recovery.js` (which loads first and uses no game code) shows a recovery page with Export my save, Start a new run and Try again.

## Safety checks

Run all four before handing off a change. They are the project's test suite.

```bash
node scripts/check-project-structure.mjs
node scripts/check-ui-contracts.mjs
node scripts/check-historical-data.mjs
node scripts/check-engine-behaviour.mjs
```

- **Project structure** - script load order, external assets, and a 70 KB ceiling on each module under `src/`. That ceiling is deliberate: it forces oversized files to be split rather than reviewed. It does not apply to the generated data bundle at the repository root.
- **UI contracts** - several hundred assertions covering copy patterns, accessibility affordances, responsive rules, engine invariants and data shape. When a contract fails it names the behaviour that broke, not the string that moved.
- **Historical data** - series integrity, cadence and protocol sanity, plus a syntax parse of every application script.
- **Project structure** also enforces the module ceiling across *every* file under `src/`, not only the ones `index.html` loads, and asserts that no shipped script makes a runtime network call - `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, dynamic `import()` or `importScripts`. The game reads a bundled dataset and nothing else, which is what makes it work offline, from `file://` and on a static host. Comments are stripped before that scan, so prose *about* network calls does not trip it.
- **Engine behaviour** - loads the engine headlessly and asserts what it *does*: the issuance schedule, that a large early sale moves the price and a slice cannot dodge it, that every power contract wins somewhere, that hardware depreciates and can never be resold for more than it cost, that the treasury conversion covers a bill exactly, and that the cheapest electricity is not automatically the best site.

Contracts are written to fail for a reason a reader can act on, and new ones are worth mutation-testing: reintroduce the bug and confirm the check catches it.

The first three suites match source text (the engine-behaviour suite does not). That is fast and catches a great deal, but it pins the implementation rather than the rule: three of them broke during one refactoring session while the behaviour they guarded was intact, because a function had been renamed or an expression had moved. `check-engine-behaviour.mjs` exists for the other half of the problem - it runs the engine, so a rename passes and only a change in the game's economics fails. **When a check is about what the simulation does rather than how the source reads, put it there.** Pinning an exact calibration constant is usually the wrong instinct: assert the property the constant is meant to produce, so the number can be retuned without a false alarm.

## Releasing and rolling back

GitHub Pages builds from `main`, so **every push to `main` is live within about 40 seconds**. Nothing else stands between a commit and a player.

- **Every local asset URL carries the version** (`?v=1.1`, from `APP_VERSION`), in `index.html` and in the lazily loaded 3D scripts. Pages lets a browser keep a file for ten minutes, so without this a player could load new modules beside old ones, and the load-order rules in `ARCHITECTURE.md` mean that can throw. The structure check fails if any asset lacks the current version. Because of this, **bump `APP_VERSION` for every change that ships, hotfixes included** (`1.0`, `1.1`, ...): the bump is what makes browsers fetch the new files together. The release label (`Beta 1.1`) is `APP_STAGE` + `APP_VERSION`.
- **Before pushing a release:** bump `APP_VERSION`, add the changelog entry and update Method, then run all four checks on the exact commit you are pushing. Check the exit codes, not just the output.
- **The release tag** marks the build that went out: `git tag -a beta-1.0 -m "Beta 1.1"`, pushed with `git push origin beta-1.0`. Each push that ships gets its own, and rollback uses the newest.
- **Rolling back** without rewriting history: revert everything after the tag, then push.

  ```bash
  git revert --no-edit beta-1.0..HEAD
  git push
  ```

  The reverted tree carries that release's own `?v=` URLs, so browsers that cached them get a consistent set. Rehearse it once on a throwaway clone before you need it.
- **If a Pages build does not start** after a push (it has happened), ask for one: `gh api -X POST repos/<owner>/<repo>/pages/builds`.

## Feedback and privacy

The footer's **Report a bug** and **Suggest something** open the issue forms in `.github/ISSUE_TEMPLATE/`, with the version and the in-game date filled in through the URL. **Copy debug info** puts the version, date, browser, window size and any error on the clipboard, with none of the save in it. Nothing is sent from the game and there is no analytics: the network contract would refuse it. `FEEDBACK_EMAIL` in `src/ui/footer.js` is the address for people without a GitHub account; clear it and the footer drops the Email link. The footer and Method say what is stored: nothing leaves the browser.

## Licence

The code in this repository is released under the [MIT licence](LICENSE), copyright mja1337. You are free to use it, change it and share it, provided the licence notice stays with it. Contributions are accepted under the same licence.

Two things in the repository are not covered by that grant and stay under their own terms:

- **The recorded data** in `historical-data.js` comes from Coin Metrics (CC BY-NC 4.0, so attribution is required and commercial use is not permitted) and mempool.space. If you fork the game, check their terms before using the data for anything commercial. See [Thank you](#thank-you).
- **three.js** in `vendor/` is MIT licensed by its own authors.

## Third-party code

`vendor/` holds code this project did not write. There is one file: `three.floor.js`, the
three.js build used by the 3D mining floor. It is vendored rather than fetched from a CDN
because the game makes no runtime network calls, and a CDN would break that along with
offline and `file://` use. Every texture it draws is procedural, so nothing is read from disk
at runtime either.

The 70 KB module ceiling deliberately does not apply there. That rule exists to force
oversized *first-party* files to be split; splitting somebody else's library would only make
it harder to replace, and its size is a decision taken once when vendoring rather than
something that creeps. The no-network check does apply, and applies to it first.

## Repository layout

`ARCHITECTURE.md` holds the authoritative file-by-file ownership map and the load-order constraints. In short:

| Path | Holds |
| --- | --- |
| `index.html` | The application shell. No logic, no inline styles. |
| `historical-data.js` | Generated, immutable runtime history. Never hand-edited. |
| `src/config/` | Protocol dates, opening constants, scoring eras. |
| `src/data/` | Hardware, facilities, regions, pools, progression, events, glossary. |
| `src/engine/` | History lookup, thermal, nodes, operator XP, simulation, settlement, custody and signing, treasury reach and fees, maintenance, pools, actions, recap. |
| `src/ui/` | Formatting, art, per-tab markup, post-render enhancers, the live tick, modals and shell. |
| `src/app/` | The recovery page, delegated DOM events and startup. |
| `scripts/` | The data build and the four checks. |
| `.github/` | The bug and suggestion issue forms. |

Two load-order constraints are load-bearing and contract-enforced: `operator.js` and `hardware.js` must both precede `simulation.js`, because `simulation.js` calls into them from a top-level save migration. Reversing either aborts the whole engine on load with a blank page and no console error worth reading.

## Historical data

`historical-data.js` is generated by `scripts/build-historical-data.mjs` and must not be edited by hand.

| Series | Source | Shape |
| --- | --- | --- |
| Price | Coin Metrics community API | Daily, plus four pre-market discovery anchors |
| Hash rate | Coin Metrics community API | Daily 14-day trailing mean |
| Fees, transactions, block height | Coin Metrics community API | Daily |
| Difficulty | mempool.space difficulty adjustments | One exact value per 2016-block retarget, with the height each began at |
| Fee rate (median and 90th percentile, sat/vB) | mempool.space fee-rate history | Daily, whole sat/vB as published |
| Halvings | mempool.space blocks 210,000 × n | The four blocks and their UTC instants, in the bundle's metadata |

Difficulty is a step function, not a sample: the protocol changes it every 2016 blocks and nowhere else, so it is stored as change-points. That is both exact and half the size of the weekly reconstruction it replaced.

Regular series store a start date and a cadence rather than repeating an ISO date beside every number, which was half the file. The bundle decodes itself on load, so `window.HISTORICAL_DATA` exposes the same `[date, value]` pairs the engine has always read.

```bash
node scripts/build-historical-data.mjs                    # full rebuild (network)
node scripts/build-historical-data.mjs --difficulty-only  # difficulty alone
node scripts/build-historical-data.mjs --feerates-only    # fee rates, retarget heights, halvings
node scripts/build-historical-data.mjs --recompress       # re-encode on disk, no network
```

Prefer the narrow modes. A full rebuild re-fetches seventeen years and can pull unrelated revisions into every series; diff each one afterwards.

## Three kinds of number

The game is explicit about provenance, and the copy is expected to stay that way.

- **Recorded** - taken directly from the bundled dataset. Never changes during a run.
- **Derived** - calculated from recorded inputs, usually by interpolating between anchors. Exact at the anchors, an estimate between them.
- **Modelled** - a gameplay assumption. Hardware pricing, incidents, uptime, fee outcomes, and everything after the historical cutoff.

The early years are deliberately damped and the game says so: run the honest formula on February 2009 and one laptop finds about a hundred blocks a day. Modelled competition is scaled up early and tapered away, reaching the real arithmetic from the ASIC era onward. That is a balance decision, not a historical claim, and Method states the factor for the current run.

## Core mechanics worth knowing

**Cash and BTC are separate.** Mining pays in BTC; bills are due in cash. Nothing converts one into the other automatically: if cash does not cover the bill at settlement, time stops and the player raises it - usually by selling BTC at the Market - or takes one of the other rescues. There is deliberately no auto-sell; it made idling through the game close to free.

**The operating bill can be missed.** If cash cannot cover it, time pauses and the settlement offers routes: sell BTC, liquidate miners, bridge finance, miss the bill, or receivership. Missing it carries the shortfall into arrears and keeps the site running until the next bill date; if the arrears are still owed then, power and internet are cut until they are paid. Owing money and being cut off are different states, and only the second stops the site.

**Two separate site limits.** Electrical capacity and floor space. You can exhaust either while the other has room, and cooling plant reserves its peak draw against the same electrical supply the miners use.

**Heat is a balance, not a threshold.** A room sheds heat in proportion to how much hotter it is than outside, so it settles where heat in equals heat out. Cooling ratings are what a site rejects at a ten-degree difference; a rating divided by ten is the kilowatts it loses per degree. Enclosed sites have a temperature floor because a spare room sits inside a heated house; a container yard tracks the weather. Regional climates are annual means with a seasonal swing, so the same fleet in the same room is a different problem in July.

**Equipment is ordered, not conjured.** Miners and cooling both carry lead times, reserve their capacity from the moment they are ordered, and earn or cool nothing until commissioned.

**The sandbox is finite and honest.** The recorded feed ends on the last day the bundled dataset covers. Continuing runs a hundred further years on deterministic projections: no new historical chapters and no new hardware are invented, while price, network hash rate, difficulty, transaction activity, fees, chain size and block height continue as models. Bitcoin's issuance schedule keeps running, so projected halvings keep cutting mining income - subsidies are whole satoshis, floored the way the protocol floors them, and each halving is labelled a projection rather than recorded history.

## Copy conventions

These are the conventions the interface is written to. They exist because difficulty should come from decisions and economics, not from unexplained terminology.

### Content layers

Every mechanic should be explainable at three levels, and the level should match the surface.

1. **Interface** - short, concrete, actionable. Explain the consequence before the specialist term.
2. **Contextual help** - answers "what does this mean?" and "why should I care?" beside the mechanic.
3. **Method** - formulas, edge cases, historical sourcing, modelling rationale. Eight collapsible chapters behind a table of contents, with exact calculations tucked into disclosures so a newcomer meets the idea before the arithmetic.

A searchable glossary of 47 canonical terms opens from any contextual-help disclosure and links each term to the Method chapter that carries its formula. Search matches abbreviations, expansions and common synonyms alike.

A blocked action states the plain-language reason, the exact missing amount or prerequisite, and where to resolve it. A consequential action previews what will change, the immediate cost, the delay and ongoing cost, and the risk or reversibility before it is confirmed.

### Voice

The interface should sound like an experienced operator coaching the player:

- Calm under pressure.
- Direct without being cold.
- Technically credible without showing off.
- Honest about uncertainty and modelling.
- Interested in the history without lecturing.
- Clear about consequences without scolding the player.

### Writing rules

- Lead with what happened or what the player needs to decide.
- Explain why it matters before explaining how it is calculated.
- Prefer one idea per sentence.
- Prefer concrete nouns and verbs: “This miner draws 1.4 kW” over “Additional electrical headroom is required.”
- Use “you” for player actions and “your operation” for the simulated business.
- Use specialist terminology when it is the correct term, then define it on first use.
- Expand an abbreviation on first use in a player journey: “full pay per share (FPPS).”
- Put exact formulas in contextual help or Method, not in primary instructions.
- Use contractions in conversational guidance; avoid them in compact status labels.
- Avoid vague labels such as “unavailable,” “invalid,” or “limit” without a cause.
- Do not use humour when the player is losing assets, facing insolvency or repairing a failure.
- Do not imply that historical returns are a forecast or that BTC income is guaranteed.

### Terminology

Use these terms consistently across interface, help and Method.

| Preferred term | Meaning and usage | Avoid in primary copy |
| --- | --- | --- |
| Bitcoin | The network, protocol or system | “the Bitcoin” |
| bitcoin | Units in prose when no amount is shown | Capitalising every use |
| BTC | A displayed amount or balance | “coins” when a precise balance matters |
| Mining | Using computation to compete for blocks | Assuming “hashing” is understood |
| Hash rate | Computational work performed per second | Write “hash rate” in prose, never “hashrate”; the product name is Timechain |
| Network difficulty | How difficult the network makes block discovery | “Difficulty” alone on first use |
| Block reward | Subsidy plus transaction fees received for a block | Treating subsidy and fees as identical |
| Solo mining | Mining independently with high payout variance | “Solo” without context on first use |
| Mining pool | A service that combines work and distributes rewards | Unexpanded scheme abbreviations |
| Liquid cash | Fiat available to spend now | Liquidity when cash is specifically meant |
| Starting Liquidity | The named pre-run control for opening liquid cash | Starting capital, intro cash |
| Cash runway | Estimated months before current cash is exhausted | “Runway” alone on first use |
| Operating bill | The monthly settlement of recurring costs | Settlement when teaching the first bill |
| Hot wallet | A wallet connected to an online device | Assuming “hot” implies online risk |
| Cold storage | Keys kept away from an online device | Cold wallet/cold storage interchangeably on one screen |
| Self-custody | Holding the keys that control bitcoin | “Controlled” without identifying keys |
| Custodial balance | BTC or claims held by an exchange or custodian | Calling it self-held BTC |
| Full node | Software that independently validates Bitcoin rules | Implying a node automatically secures keys |
| Lightning liquidity | BTC committed to Lightning channels | Yield, staking or interest |
| Electrical capacity | The site's available power | Power capacity and electrical headroom on the same screen |
| Floor capacity | Physical room for machines | Space units without explanation |
| Condition | Gradual equipment health from 0–100% | Health and condition interchangeably |
| Fault | A specific failed component | Treating low condition as a fault |
| Modelled | A gameplay assumption or simulated outcome | Simulated, estimated and modelled interchangeably |
| Recorded | Taken from the bundled historical dataset | “Real” when derived interpolation is involved |
| Derived | Calculated from recorded inputs | Recorded |

### Numbers and units

- Use `$1,500`, not `$1500`.
- Show `/day` or `/month` beside recurring costs.
- Show both current and maximum capacity: `3.2 / 5.0 kW`.
- Use a space between a value and physical unit: `1.4 kW`, `22 °C` where layout permits.
- Use `BTC` for balances and transaction amounts.
- Define `MH/s`, `TH/s`, `PH/s` through contextual help before expecting comparison.
- Use “simulated day” when a delay could be confused with real time.
- Use percentages for player-facing risk; reserve multipliers for advanced detail.

### Reviewing a rewritten surface

Use this checklist for every rewritten surface:

- Does the first sentence explain the player consequence?
- Is every specialist term defined before it is relied upon?
- Is the recommended action clear without opening Method?
- Does a blocked action include a recovery path?
- Are immediate cost, recurring cost and delay distinguished?
- Are cash, BTC and custodial claims kept conceptually separate?
- Is historical fact separated from derived or modelled behaviour?
- Can the primary copy be read comfortably on a phone?
- Is advanced detail still reachable?
- Does the copy use the canonical terminology in this document?

## Change discipline

The Beta 1.1 custody workshop connects its floor, four build choices, quantities and progress to actual game state. New signers are inspected and their signing software prepared before key generation. Existing devices without the new setup marker retain their working status. The former `beigepc` ID remains valid in saves, but new purchases are paid Basic PCs; replacement computers are normal purchases too. Small-form-factor computers and Raspberry Pi kits are complete SKUs, with the Pi gated to its [29 February 2012 launch](https://www.raspberrypi.com/news/happy-birthday-2018/). Catalogue prices are gameplay assumptions.

The reserve health figure is a setup checklist, capped at 85 while recovery rehearsal is unavailable. The location review counts distinct keys and recovery copies by site, normalises Home and the mine when they are the same building, and uses real movement delays. Nodes group Bitcoin verification with Lightning guidance while retaining the existing sync, storage and routing model. Client selections record the preparation workflow; they do not claim a measured real-world risk reduction.

Readable backups at a trusted person's house have a fictional betrayal baseline equal to that location's flood rate: 0.06% per simulated month. Copying exposes the secret while leaving hardware and recovery material intact. Theft requires enough distinct secrets to satisfy the wallet policy; online-wallet recovery is handled separately. Bank deposit boxes and locked signer hardware alone do not trigger this friend-access roll. Collecting a copied seed cannot revoke it: rotation changes the spending authority.

- Rewrite one player journey or surface at a time.
- Preserve simulation behaviour unless a separate mechanic change is explicitly approved.
- Update UI-contract checks when copy is intentionally changed.
- Avoid exact full-paragraph assertions where a semantic contract can verify stable labels or attributes.
- Keep save compatibility when adding dismissed guidance or first-use help state.
- Run the project structure, UI-contract and historical-data checks after every implementation slice.

## Outstanding

Nothing tracked. The editorial walkthrough matrix is complete, the help-pattern contracts are in place, and the sandbox derives its cycle and volatility from the recorded series.

## Thank you

Timechain would not be possible without the people and projects who publish Bitcoin's history openly. Every recorded number in the game comes from their work, and I am very grateful to them.

- **[Coin Metrics](https://coinmetrics.io)** - the daily price, hash rate, fees, transactions, block height and market capitalisation, from 2009 to today, come from the [Coin Metrics Community Network Data](https://github.com/coinmetrics/data). It is made available under the [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) licence, and Timechain is free to play and does not sell it or anything made from it. The data remains theirs.
- **[mempool.space](https://mempool.space)** - every difficulty adjustment and its block height, the daily median and 90th-percentile fee rates, and the four halving blocks come from mempool.space's open data. Thank you to the whole Mempool project.
- **[three.js](https://threejs.org)** - the 3D mining floor is drawn with three.js, which is MIT licensed and bundled in `vendor/`.
- **[Bitcoin Wiki](https://en.bitcoin.it)**, **Bitcoin Optech**, the **Bitcoin developer reference**, and the many public bodies and publications linked on the cards of the in-game story, whose reporting the timeline is built from.
- **Satoshi Nakamoto**, for the [whitepaper](https://bitcoin.org/bitcoin.pdf) that started all of this. The coin at the top left of the game links to it.

The Method tab in the game says exactly which numbers are recorded, which are derived and which are modelled, and where each recorded one comes from.

## Feedback

If you have any feedback, a bug, a suggestion or just a thought about how it played, you can email **satoshistaysrad@proton.me**, or use the Report a bug and Suggest something links in the game's footer, which open a form on GitHub with your version already filled in. I read everything.

## Support the project

If Timechain has been useful on your Bitcoin education journey, you enjoyed playing it, and you would like to keep seeing it developed, please consider leaving a tip over Lightning: **https://strike.me/@jandex**. It is entirely optional, it is never needed to play, and thank you.
