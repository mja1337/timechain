# Proposal: 3D map and calmer layout

*For owner review before any of this reaches `main`. Draft only. Nothing here is merged, marked ready, or deployed.*

**Base.** `main` at `d10ff61` (Beta 1.2.5). `APP_VERSION` stays `1.2.5` in every phase PR. The release commit that bumps the version, the changelog, and the `?v=` cache-busters comes later, after sign-off.

**Source.** James Browning's public fork, `catch-21/timechain` branch `catch-21/ux` at `5bb8a0b` ("refinement"), fetched read-only as `refs/review/catch21-ux`. It is based on `d445739` (1.2.3 plus data) and labels itself Beta 1.4. It is not merged and not cherry-picked as a range.

**Held hotfix.** The plan's "local hotfix `967823b` (1.2.6)" is not on this `main`. The Energy tab still crashes with `density is not defined` in `energyTariffVisual()` (`src/ui/enhance/operations.js`). That crash is left alone. Phase work does not render the Energy tab, and does not "fix" `density` in passing.

---

## Reading of the plan

Babe wants the valley and the room you click into, on top of current `main`, without touching the seeded simulation. James's branch is the design source. It is the wrong thing to merge: it conflicts with `main` in five files (`index.html`, `events.js`, `content.js`, `app.css`, `tabs/operations.js`), it renames the release, it shortens toasts in a way that drops facts, and it deletes three UI assertions we are keeping.

So this is a deliberate re-implementation that reuses his files where they are standalone, and re-applies the rest by hand. The map is **opt-in** behind a per-device "Map view" preference. The classic layout stays the default through 1.3.0. It becomes the default only in a later release, after the tutorial, once the Phase 5 gates pass.

The work is split so Phases 0–2 are worth shipping even if the valley slips. Each phase is its own draft pull request into `main`. Commits that adapt his files carry `Co-authored-by: James Browning <jamesbrowning91@gmail.com>`.

What we do not take from his branch: his changelog and "1.3 / 1.4" version labels, the toast cuts that lose the facts in section 9 of the plan, the three deleted assertions, and the "Why this step matters" fold that hides a tutorial reason by default.

---

## Architecture

### How it sits on the page

Today: sticky top bar, a 16-cell ticker, tab row, content, sidebar, footer.

His shape, which we keep once the map is on: top bar, key-numbers bar, stage (valley or room) on the left, the active tab as a panel on the right, tab icons in a toolbelt under the stage.

Three rules hold that together:

1. **Tabs stay the source of truth.** `activeTab`, `openTab()`, `resolveTab()`, `treasurySection` and `enhanceActiveTab()` do not change. The panel is a new home for `.content`. One function, `layoutShellHtml(revision)`, switches the shell:
   - map on: his `roomShellHtml()`;
   - map off: today's `<div class="shell"><main class="main">…</main>${sidebar()}</div>`.
2. **One canvas.** `floor3d/mount.js` keeps a single persistent canvas and re-attaches it after each repaint. When the stage is showing 3D, the Mine floor card shows the 2D floor or a "shown on the stage" note. A second WebGL context can drop the first. `floor3dMode()` (land or room) stays the seam, plus a stage-versus-Mine guard.
3. **Story, reports, and the footer menu follow the switch.** "Story" and "Reports" replace the sidebar and the old Dashboard charts only when the map is on. The Game menu (replay tutorial, saves, feedback) exists only when the map is on, and those three stay reachable in both modes. With the map off, sidebar, Dashboard and footer stay as they are.

### Files

| File | When | What |
|---|---|---|
| `src/ui/tour.js`, `src/styles/app.css`, `src/ui/render.js` (paper step), `src/ui/tabs/market.js`, `src/ui/presentation.js` | Phase 0 | Tutorial layout, simulated paper, trade-ticket memory, pre-market bill wording |
| `src/ui/hud.js` (new) | Phase 1 | Key-numbers bar, Stats and Decisions pop-outs, confirmed emergency-stop button markup |
| `src/ui/room.js`, `src/ui/room-places.js` | Phase 2–3 | Shell and actions, then `LAND_PLACES`, status, info cards. Split so each stays under 72 KB |
| `src/ui/floor3d/land.js` | Phase 3 | His valley, taken whole. Own local seeded generator. Never `Math.random` or `nextRand` |
| `src/ui/floor3d/mount.js` | Phase 3 | Hand-port of his view mode, per-view cameras, `floor3dProject()`, land lighting, stage-height fill |
| `src/ui/floor3d/labels.js` | Phase 3 | Label placement and collision, out of `roomPlaceLabels()` |
| `src/ui/map-list.js` | Phase 4 | Visually hidden place list for keyboard and screen readers |
| `scripts/check-map.mjs` | Phase 3–4 | Payload, determinism, labels, 2D fallback, save fixtures, then the axe scan |
| `scripts/smoke/hud.mjs` | Phase 1 | Browser check for the bar, the pop-out, toasts, and the emergency stop |

`index.html` gains a script tag only when a new module is actually loaded. The `?v=` query stays `1.2.5` until the release commit. New modules still have to sit in the ordered list in `scripts/check-project-structure.mjs`.

### `state.stageView` and the map preference

The only new saved field is `state.stageView`, `"land"` or `"room"`. It is added to the default state and normalised on load the same way `normalizeEnergyState` works. Unknown or missing becomes `"land"`. Old saves open with no prompt. A 1.3 save opened in 1.2.x keeps an extra field the old build ignores.

Map on/off is `localStorage["timechain-map-view"]`, not part of the run. Switching it never rewrites a save, and a shared save never forces the map on.

`roomPop`, `roomPanel`, `coachOpen`, `gameMenuOpen`, `hudPop` and camera angles are not saved. The camera may use `sessionStorage` so a reload keeps the angle.

### Staying out of the simulation

`room.js` reads facilities, contracts and dates. It does not write during a tick. `land.js` grows the town from `state.time`, read-only, with its own generator. Map signatures rebuild from `render()` / `refreshRoom()`, never from the tick. Buttons on the map, the room and the info card use the same `data-action` values as the tabs. No new engine entry point. The wallet dice (`rollDie`, `secureDice`) are untouched.

A seeded replay of N days must produce byte-identical `state` (minus `stageView`) with the map on and off. That check arrives with the map, in Phase 3.

### Performance, phones, labels, access

These are specified in the plan and are not built in the proposal PR. The shape we will follow:

- 3D loads only when the map is on, the intro and wallet ceremony are finished (`state.started && state.walletSetup.done`), and the page is visible. Before that, the stage is a static poster. `land.js` joins `FLOOR3D_SCRIPTS` but is fetched only when the land view is first shown. Prefetch at low priority after the tutorial's last step.
- Budgets, gzipped: first screen of a new run transfers 0 bytes of 3D, and first-party JS and CSS grow by at most 15 KB. First land view: three.js plus floor3d plus land at most 170 KB gzipped. Later repaints make no new requests and rebuild the scene only when the signature changes.
- Quality is `low` / `medium` / `high`, picked from save-data, device memory, hardware concurrency and the first 60 frames. Draw on demand. Pause when hidden or off screen. `reducedMotion()` skips easing, drift and animated scenery. The existing lost-context handling and the once-per-page support probe stay.
- If WebGL is missing, loading fails, or the context is lost twice, the stage is an SVG of the same `roomLandModel()` places. The room falls back to his 2D room.
- Phones (≤800px): three bar items, Stats pop-out with its own `.hud-stats-grid` (the ≤800px rule that hides `.ticker` must not hide it), a fixed five-slot toolbelt, stage height `min(48vh, 360px)`, 44px hit targets. Tablets (801–1100px): stage and panel at 40/60. Wide panels at ≥1200px for Ledger, Tech and Method.
- Labels: project, drop anything behind the camera, greedy placement at four anchors, a 6px dot when nothing fits. Recompute at most every 100 ms, and only when the camera key or the model signature changes.
- The place list is how a screen reader uses the map. The canvas is `role="img"` and points at the list. Escape closes the info card, then the panel, then pop-outs. Focus is recorded across `render()` with the helper that already exists in `render.js`.

---

## Pull requests

All of these stay **draft**. None are merged or marked ready for review. `APP_VERSION` is not bumped in any of them.

| PR | Branch | Ships | Depends on |
|---|---|---|---|
| **Proposal: 3D map and calmer layout** | `cursor/3d-map-proposal-b5f9` | This document only | — |
| **Tutorial and guidance fixes from James Browning's UX review** | `cursor/tutorial-guidance-fixes-b5f9` | Phase 0 | `main` |
| **Key-numbers bar and calmer alerts** | `cursor/key-numbers-bar-b5f9` | Phase 1 | `main` (merge after Phase 0; both touch `app.css`, `live.js`, `render.js` and `check-ui-contracts.mjs`) |
| Panel layout and toolbelt | later | Phase 2. Map off by default. Stage is the 2D map. No three.js yet | Phase 1 |
| Map view (beta) | later | Phase 3. This is the 1.3.0 release candidate | Phase 2 |
| Map access: list, keyboard, focus | later | Phase 4 | Phase 3 |
| Map view on by default | later, only if the gates pass | Phase 5 | Phase 4, plus real-phone play and three people outside the team |

Phases 0 and 1 are each branched from `main` so either can be read on its own. Merge Phase 0 first. Phase 1 will need a small rebase if both land.

### Phase 0 — tutorial, trade ticket, pre-market wording

Independent of the map. `scripts/tutorial-guarantee.mjs` must stay green.

- Coach goes full width at ≤1000px, not only ≤800px. `#app` gets bottom padding from `--tour-card-h` so the card does not cover the control it is pointing at. A resize repositions the card. The scroll ceiling also accounts for `.hud` and `.drawer-head` (harmless until those exist).
- The bank-box step shows the monthly fee on the button, and says one fee covers every copy in the box.
- The paper checkpoint says it is a simulated exercise. The buttons stay `wallet-paper-recorded` and `wallet-paper-destroyed`. The dice are unchanged.
- A typed or preset trade amount survives a quote cancel and a ticket repaint, capped to the funds this run still has. A new `state` object (new run, loaded save) starts from the percentage default. Covered by an engine-harness assertion in `check-ui-contracts.mjs`.
- The settlement outlook stops saying "No market" in place of the cash shortfall, stops promising a grace month before July 2010, and sends a pre-market shortfall to Mine (sell machines or cut costs) rather than to a Market that does not exist. After the market opens, the grace month and the Market route stay. The next-bill card leads with amount, due date, cash afterwards and one next action.
- His review is copied to `docs/ux-review-2026-10-10.md` with his name on it. Method gains one credits line for the first-run guidance. The changelog entry waits for the version bump.
- The "Why this step matters" fold is **not** in this PR. Reasons stay on the card. See open question 6.

### Phase 1 — bar, pop-outs, toasts, emergency stop, facts

Visible in the classic layout. No map, no 3D.

- `src/ui/hud.js` replaces the 16-cell ticker with five key numbers: Next bill, Cash runway, BTC/day, Self-held BTC, Hash rate. At ≤800px only the first three show. Self-held BTC and Hash rate lead the Stats pop-out.
- Stats and Decisions are pop-outs. One open at a time. The Stats grid is `.hud-stats-grid`, not `.ticker`, so the ≤800px rule that hides `.ticker` cannot empty it. The pop-out carries the same 16 readings the ticker carried. Decisions reuses `dashboardCommandCentre()`. Escape closes the open pop-out and returns focus to the button that opened it. Opening moves focus to the pop-out heading. `hudPop` is not saved.
- Toasts sit bottom-right on a desktop and at the bottom of a phone, including while the tutorial card is up. They do not use the old `top: 80px` rule that painted them across the bar. A check requires that, while a toast is showing, the centre of every `.hud button` is that button.
- "Shut miners down" is not in the bar. Stopping still uses `data-action="toggle-power"` and `toggleSitePower()`. The first press arms it; a second press within 4 seconds confirms. Starting again is one press. The bar may show a red **Stopped** chip. A "Miners stopped" banner carries Restart. The control lives on the Mine floor card and in the Dashboard operator controls. The room info card does not exist until the map shell does; it will use the same button helper.
- The section 9 facts are already on `main` (his branch is what deleted them). Phase 1 pins them with assertions keyed to the fact, not to a whole sentence, so a later copy pass cannot drop them. Wording is not shortened in this PR. The 15-word toast budget stays in Phase 5, beside these pins.
- The three assertions he deleted stay: `GAME_PURPOSE_COPY`, the Treasury strip order, and the Phase 3 newcomer lines.
- `scripts/smoke/hud.mjs` is the browser script for the bar, the pop-out height, toast coverage and the confirm step. The same rules are also source- and markup-checked in `check-ui-contracts.mjs`, which is what CI runs. Playwright is not added to the Checks workflow, because that workflow has no browser install and a new job would fail every PR.

### Phases 2–5 (not in this round unless 0 and 1 land cleanly)

- **Phase 2.** `layoutShellHtml()`, panel model, Game menu, phone bottom bar, Wide panels, Mine-floor-versus-stage rule, "in 3 months" shop copy via the shared month helper, replay tutorial linked from the last tutorial card and the Dashboard empty state as well as the menu. A render snapshot proves map-off markup matches today. Map preference exists; the stage is the 2D map; three.js is not loaded.
- **Phase 3.** `land.js` taken whole, `mount.js` re-ported by hand, lazy-load gate, payload budget, quality levels, render on demand, reduced motion, 2D fallback, label collision, `stageView` normalisation, save fixtures for 1.2.3, 1.2.5 and the pre-custody save, determinism check. This is the "Map view (beta)" release, version 1.3.0 when the owner cuts the release.
- **Phase 4.** Place list, keyboard path, focus across repaint (the helper in `render.js` already records `data-action`), Escape order for cards and panels as well as pop-outs, announcements, contrast, axe-core with no serious or critical issues. `@axe-core/playwright` vendored the way other dev dependencies are.
- **Phase 5.** His word-limit check, the three assertions still present, the facts-kept check already pinned in Phase 1, and `tutorial-guarantee.mjs` also run with map view on. The default flips only after mobile, labels, access and payload are green, Babe has played a phone run, and at least three people outside the team have tried it. A new player still finishes intro, wallet and tutorial in the classic layout; the map turns on after the tutorial.

---

## Files touched, by phase

**Proposal.** `docs/3d-map-proposal.md` only.

**Phase 0.** `src/ui/tour.js`, `src/styles/app.css`, `src/ui/render.js`, `src/ui/tabs/market.js`, `src/ui/presentation.js`, `src/ui/enhance/operations.js` (forecast card and `billNextAction` only; `energyTariffVisual` and `density` untouched), `src/ui/live.js`, `src/ui/tabs/method.js` (one credits line), `scripts/check-ui-contracts.mjs`, `docs/ux-review-2026-10-10.md`.

**Phase 1.** `src/ui/hud.js` (new), `index.html`, `scripts/check-project-structure.mjs`, `ARCHITECTURE.md`, `src/ui/tabs/dashboard.js`, `src/ui/enhance/mine-market.js`, `src/app/events.js`, `src/ui/render.js`, `src/ui/live.js`, `src/ui/offline.js`, `src/ui/notify.js` only if a toast needs a hook (placement is CSS), `src/styles/app.css`, `scripts/check-ui-contracts.mjs`, `scripts/smoke/hud.mjs`.

**Not touched in 0 or 1.** `nextRand`, the simulation tick, save shape, wallet dice, `APP_VERSION`, changelog, `?v=` cache-busters, `energyTariffVisual`.

---

## Risks

- **Energy tab crash.** `density is not defined` throws if that card renders. Verification stays off the Energy tab. The forecast helpers in the same file are safe to call; they do not read `density`.
- **Phase 0 and Phase 1 edit the same four files.** They branch from `main` separately. Merging both needs Phase 0 first, then a rebase of Phase 1. The overlaps are the tour/toast CSS, the live-tick updater, the paper-step versus the stopped banner in `render.js`, and the end of `check-ui-contracts.mjs`.
- **`render.js` is close to the 72 KB ceiling** (about 68 KB). The stopped banner has to stay short. A larger shell belongs in `room.js`, not here.
- **Pop-out versus ticker CSS.** Reusing `.ticker` inside the pop-out is the bug that empties Stats at ≤800px. The pop-out gets its own class. Offline dimming today keys off `.ticker .tick` and a label list that no longer matches every cell; Phase 1 points that dimming at `.hud-stat` as well, using the same label list, so we do not make it worse.
- **Duplicate live ids.** The bar and the pop-out both show some of the same readings. Ids stay unique. The bar owns the id the live tick already updates; the pop-out mirrors it with `data-mirror`.
- **Emergency stop is a real engine action.** Confirmation is UI state (`powerStopArmedUntil`), not a save field and not a new engine entry. Both buttons still call `toggleSitePower()` after the second press. Starting is still one press, including the briefing's "Start mining".
- **Trade drafts are UI memory.** A `WeakMap` keyed by the `state` object. `resetGame()` and save load replace `state`, so a different run does not inherit an amount. This does not enter the save and does not call `nextRand`.
- **Word-limit versus facts.** Applying his 15-word toast budget now would force the section 9 facts out of the toasts before we have decided where each one is shown instead. Phase 1 pins the facts in place. Phase 5 adds the budget and, where a fact will not fit, moves it to the transaction preview or the ledger entry, still visible at that moment.
- **No `vercel-review/` tree in this workspace.** The plan's screenshot folder is not here. Browser evidence for Phases 0 and 1 is taken on this branch, at 1280×800 and 390×844.
- **GitHub Pages.** Any merge to `main` deploys. These PRs stay draft so a merge is an explicit owner action.

---

## Open questions

Recommended defaults. The owner can override any of them before the phase that needs it.

1. **Default on or off.** Opt-in for 1.3.0. The classic layout stays the default. Map view turns on, after the tutorial, only in a later release once the Phase 5 gates pass. A new player finishes the intro, the wallet ceremony and the tutorial on the layout the tutorial was written for.

2. **Emergency stop.** Confirm-click: first press arms, second press within 4 seconds stops. A full review dialog is the wrong weight for a stop, and the transaction-preview path is for money. The bar shows a red **Stopped** chip and never the switch. Restart is one press. The room's info card will use the same control when the room exists.

3. **Phone bottom bar.** Room, Mine, Treasury, Energy, and More. While the map is off, Dashboard stands in for Room so the classic layout still has a home. More opens the existing mobile sections (Facilities, Pools, Learn, Tech, Ledger, Method). This is Phase 2 work.

4. **Credit.** Yes, please ask James if he is happy with the credit and if he wants to review the map PR. Wording to use unless he prefers otherwise: changelog "3D valley map by James Browning"; Method "The 3D valley and the calmer first-run layout adapt work by James Browning." Commits that adapt his files use `Co-authored-by: James Browning <jamesbrowning91@gmail.com>`. This agent does not email him.

5. **Word limits.** New copy first. Existing copy is trimmed only where every section 9 fact still appears once, in a place the player can see at that moment, and the three section 10 assertions still pass. Do not hide a reason to hit a number.

6. **Tutorial fold-out.** Keep the reason on the card, as it is now. His fold hides it behind "Why this step matters". Layout fixes still ship in Phase 0. The fold can be a later option if you want it.

7. **Version.** The map release is 1.3.0. Fixes before that stay patch numbers. Phase PRs do not bump `APP_VERSION`. When you cut a release: if the Energy hotfix lands as 1.2.6, Phases 0 and 1 together are 1.2.7; the valley is 1.3.0. This tree is still 1.2.5, so the numbers above assume the hotfix ships first.

8. **Places that hint at unbuilt energy features** (landfill, wind, hydro, and later solar, on-site generation, demand response, landfill methane). Info cards stay descriptive until the feature exists. The label can name the place. The card does not offer an action the game cannot perform.
