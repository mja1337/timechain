# Remaining phases (owner-locked, Oct 2026)

*Living roadmap on current `main` (Beta 1.2.7+). Replaces the closed drafts [#6](https://github.com/mja1337/timechain/pull/6) and [#9](https://github.com/mja1337/timechain/pull/9).*

**Not endorsements.** Casa, Unchained, Nunchuk and Caravan appear because they are real, cited shapes of holding bitcoin with more than one key. The game teaches who holds a key, what it costs, and how it fails.

---

## Already shipped (do not re-propose)

| Track | Shipped | PR / release |
|---|---|---|
| Energy tariff crash (`density`) | Fixed | #10 → 1.2.6 |
| Tutorial / guidance (map Phase 0) | Shipped | #8 → 1.2.7 |
| Key-numbers bar, pop-outs, emergency stop (map Phase 1) | Shipped | #8 → 1.2.7 |
| Roll sheet keep/destroy + passphrase slip (custody Phase 1) | Shipped | #11 |

Phase 1 custody defaults from the old proposal stay: the roll sheet is not the tutorial backup; the passphrase is a flag never typed; adding a passphrase requires a place; the open computer ignores the passphrase; keep and destroy have no default button.

---

## Locked decisions (Oct 2026 owner review)

### Map / calmer layout

1. **Map stays opt-in** through the 1.3.0 beta. Classic layout remains the default until Phase 5 gates pass.
2. **Phone bottom bar:** Room, Mine, Treasury, Energy, More. While the map is off, Dashboard stands in for Room.
3. **Credit James Browning** on the valley/map PR: `Co-authored-by: James Browning <jamesbrowning91@gmail.com>`; Method and changelog credit the 3D valley.
4. **Tutorial reason stays on the card** (no “Why this step matters” fold).
5. **Unbuilt energy places** (landfill, wind, hydro, later solar, on-site generation, demand response, landfill methane): descriptive info cards only. Labels may name the place. Cards must not offer actions the game cannot perform.

### Custody education

1. **Build Shamir** (SLIP-0039-style placeable shares; taught default 2-of-3). Copy says these are not BIP39 words and are mostly incompatible.
2. **DIY 2-of-3** on the existing policy engine, with a disaster drill the player can run on purpose.
3. **Company-shaped products in the sim:** Casa Standard and Unchained-shaped vault (see research below). Modelled, dated, not endorsements.
4. **Company key can be lost, hacked, or compelled.** Low probability, real risk; it is one key in the quorum, not a reason to prefer or avoid a firm.
5. **Inheritance deferred.** Named in copy only until a later pass.

Tracks stay independent. Map work does not branch from custody work, and vice versa.

---

## Research: collaborative custody (dated Oct 2026)

All three paid products below use the same lesson shape: you hold enough keys to spend without the company; the company holds one key and cannot move funds alone.

| Model | Cited product | Quorum | Company key | Annual fee (snapshot) | Offline / DIY tool | Sources |
|---|---|---|---|---|---|---|
| Casa-shaped | [Standard membership](https://support.casa.io/knowledge/standard-membership-with-3-key-vault) (22 Jan 2026) | 2-of-3 | Casa recovery key | **$250 / year** | App-centric; Premium+ is out of scope | Casa support article |
| Unchained-shaped | [Vaults](https://www.unchained.com/vaults) + [Pricing](https://www.unchained.com/pricing) (read Oct 2026) | 2-of-3 | Unchained holds one | **$250 per vault / year** | [Caravan](https://help.unchained.com/what-is-caravan) (stateless open coordinator) | Unchained pricing page |
| Nunchuk-shaped (research only) | Iron Hand | 2-of-3 | Platform key on paid tiers | ~$120 / year | Open-source clients; free DIY tier has no company key | Secondary comparisons; verify on nunchuk.io before coding |

**In scope for implementation:** Casa Standard and Unchained vault at $250/yr each, labelled modelled and dated October 2026. Concierge / Signature / suite figures on Unchained’s pricing page disagree with each other and are **not** modelled. Inheritance products stay named in copy only.

**Nunchuk:** good third shape (cheaper assisted 2-of-3, open-source bias). Not required for the first company-product slice; can be a later lesson if Babe wants a third card. Sparrow and free Caravan remain the “no company key” tools beside DIY.

---

## Map track — remaining phases

| Phase | Ships | Notes |
|---|---|---|
| **M2** | Panel layout, toolbelt, Game menu, phone bottom bar, map preference; stage is 2D; no three.js | Map off by default. `layoutShellHtml()` switches classic vs map shell. |
| **M3** | 3D valley (James’s `land.js` taken whole; `mount.js` hand-ported), lazy load, budgets, quality, fallbacks, `stageView`, determinism | Release candidate for **1.3.0**. Credit James. |
| **M4** | Place list, keyboard, focus, Escape order, axe scan | Access path for the map. |
| **M5** | Word-limit check beside pinned facts; default flips only after gates | Gates: mobile, labels, access, payload; Babe phone run; ≥3 people outside the team. New players finish intro/wallet/tutorial in classic layout; map turns on after tutorial. |

Map preference is `localStorage["timechain-map-view"]`, not part of the run. Only new saved field for the valley era is `state.stageView` (`"land"` | `"room"`).

---

## Custody track — remaining phases

| Phase | Ships | Status |
|---|---|---|
| **C2** | SLIP-0039-style shares | **Shipped in 1.2.8** — placeable 2-of-3 shares, Method + glossary |
| **C3** | DIY 2-of-3 drill | **Shipped in 1.2.8** — read-only disaster drill on Custody lessons |
| **C4** | Casa-shaped Standard + Unchained-shaped vault + Caravan path | **Shipped in 1.2.8** — $250/yr modelled, company outage/exposure via `hashRoll`, inheritance deferred in copy |

Follow-ups (optional): Nunchuk Iron Hand as a third arrangement card; inheritance simulation; richer Caravan UX beyond the outage copy.

Determinism rules from the old proposals still hold: no `nextRand` / `Math.random` for new custody rolls; place rolls stay `hashRoll`; tutorial harness and never-stuck rules unchanged.

---

## Versioning

Phase PRs do not bump `APP_VERSION` unless Babe asks for a release cut. When cutting:

- Map M3 as **1.3.0** when the valley ships.
- Custody C2–C4 may ship as patch releases before that, or ride with 1.3.0 if they land together.

Merging to `main` deploys. Keep unfinished work in draft until owner merge.
