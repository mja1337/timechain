# Proposal: custody education

*For owner review before any of this reaches `main`. Draft only. Nothing here is merged, marked ready, or deployed. Owner sign-off is required first.*

**Base.** `main` at `d10ff61` (Beta 1.2.5). `APP_VERSION` stays `1.2.5` in every phase PR. The release commit that bumps the version, the changelog, and the `?v=` cache-busters comes later, after sign-off.

**Separate from the layout work.** The 3D map and calmer-layout drafts stay on their own branches. This work branches from `main`, not from those branches. Do not merge the two tracks into each other.

**Not an endorsement.** Casa and Unchained appear because they are real, cited ways people hold bitcoin with more than one key. The game teaches the shape of the product: who holds a key, what it costs, and how it fails. It does not recommend a company.

---

## What Babe asked for

After the dice rolls are captured on simulated paper, the player chooses to keep or destroy that sheet, with the trade-off of each choice written out, and the choice has to matter in the custody model.

Setup can add a BIP39 passphrase (the thing people call a 25th word). It stops someone who finds the seed. Losing it loses the coins. The game then teaches a backup of that passphrase, stored somewhere other than the seed, as its own item that a fire, a theft, or a loss can hit.

Later, the same sim should let a player try Shamir sharing, a Casa-shaped multisig subscription, an Unchained-shaped vault with Caravan as the tool you still hold, and a do-it-yourself multisig. Each one shows its cost, what it protects, and how it fails, and each one has to be testable through a disaster and a recovery.

Education stays short: the ceremony, a Method section, a Learn note, and glossary lines. Dates and prices for real products come from the sources below. Anything the pages do not settle is marked uncertain.

---

## How the game holds a key today

The opening ceremony makes one software key. `createHotWallet` stores a fingerprint, not the key. That key lives on the mining computer. It is not part of the cold-wallet policy and it is never assigned to a signer.

A backup is `key.backup`: paper or steel, with a place. `custodyKeyRestorable` looks only at that field. The tutorial step that says "write the key down" is done when that backup exists (`hotKeyBackedUp`). The ceremony itself does not create it. The oath calls `completeWalletSetup(false)`.

Places are the mine, home, a bank box ($15 a month while anything is kept there), and a trusted person's house. While the facility is still home, home and the mine are the same building (`custodyPlaceId`). Fire and flood destroy paper and spare steel. A break-in or a seizure takes everything, and a stolen seed backup marks the key exposed. A friend at the trusted house can copy a readable seed without destroying the paper.

Rolls for those incidents are `hashRoll(seed, "place", month, place, kind)`, and only when `placeHolds` is not zero. The hot wallet's own disk roll is `hashRoll(seed, "hotdisk", month)`. Neither uses `nextRand`. A run that keeps nothing in a place does not draw that place's rolls.

The cold reserve is a different object: signers (`custody.devices`), keys, a policy (`single` or `2of3` in `CUSTODY_POLICIES`), and a descriptor that a quorum needs. Seeds alone cannot rebuild a multisig. That engine is the one later phases should extend.

The first sixty days, nothing in the online wallet can be lost. After that, a dead disk, a fire, or a thief does what the backup allows: restore, or the coins stay on the chain with nobody to spend them.

---

## Phase 1 — the roll sheet and the passphrase

This is the slice to build first, on its own draft pull request from `main`.

### The sheet

The paper step stays step 2. The player still marks the rolls as written down (`wallet-paper-recorded`). That screen is a simulated sheet: no real paper is required, and the rolls on screen are the record.

Then both choices are on the card, with the trade-off written above the button. Neither button is the default.

**Keep.** The sheet is a second copy of the entropy. It can rebuild the online wallet after the computer dies. Anyone who finds it can copy the key. It is created as `key.diceSheet` (`product: "dicesheet"`, paper, place `home`), not as `key.backup`. The tutorial's write-it-down step stays undone. While the mine is still the house, that sheet is in the same building as the computer, and the card says so. The player can move it later with the same journey the other paper uses.

**Destroy.** No `diceSheet`. The action name stays `wallet-paper-destroyed`. Finding that sheet later cannot rebuild the key. Recovery is whatever backup the player makes afterwards. Destroying this sheet does not destroy those.

A kept sheet is included in `placeItems` on its own list, never pushed onto `key.backup`. Fire and flood destroy it. A break-in, a seizure, or a friend who reads it means somebody else holds that copy. If there is no passphrase, that is enough to empty the online wallet, through the existing `hotKeyStolen` path. If a passphrase was set and its slip was not taken in the same incident, the coins stay, and the game says why.

A site fire or break-in still runs only when something is kept at the mine. Keeping the sheet at home, while home is the mine, starts those rolls. Destroying the sheet does not. A run that never keeps the sheet draws the same place rolls as today.

Disk death uses the backup if one exists, exactly as now. The sheet is the fallback when the backup is gone and no passphrase is required. Restore time follows the place the surviving copy is in.

### The passphrase

BIP39's optional passphrase is the spec's word. "25th word" is the common name, not the spec's. The spec says a user may protect the mnemonic with a passphrase, and that if none is present an empty string is used. The seed is PBKDF2 over the mnemonic and the salt `mnemonic` plus that passphrase. Every passphrase yields a valid seed. Only the right one is the wallet. Assigned 2013-09-10. Source: [BIP39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki).

The ceremony never asks the player to type one. A passphrase they might reuse for real bitcoin must not enter this browser. The game stores a flag, `key.passphrase === true`, and nothing else.

After the sheet choice, step 4 offers two paths.

**No passphrase.** The seed alone can spend. This is today's wallet. No new field, no new place, no new roll.

**Add one.** The player must put a paper slip somewhere: home, the bank box, or a trusted house. There is no memory-only path in this slice. The slip is `key.passphraseBackup`, its own object with its own place. It is not `key.backup` and not the roll sheet.

The card says what each place costs. Home, while it is the mine, is the same building as the computer and as a kept sheet. The bank box is $15 a month once anything is kept there, and it starts that place's rolls. A trusted house is free, and a friend can read what is there.

Day to day, the wallet on the mining computer stays open. A break-in at the mine can still spend, passphrase or not. The passphrase matters when someone has only the paper.

Recovery after the computer is lost needs a surviving seed copy (the written backup or the roll sheet) and, if a passphrase was set, a surviving passphrase slip. Seed without the slip does not rebuild. Slip without the seed spends nothing.

Theft:

- Seed copy taken, no passphrase: the online wallet is emptied, as today.
- Seed copy taken, passphrase set, slip not taken: no coins move, and `key.exposed` must not be treated as a completed theft. The game says the passphrase stopped them, and that a later theft of the slip would not.
- Slip taken alone: no coins move.
- Seed and slip taken, including across two incidents: the wallet is emptied.
- Slip destroyed by fire or flood: the coins are still spendable from the open computer. The next time that computer is lost, they are not recoverable. The incident says so.

`hotKeyStolen` already draws `hashRoll(seed, "hottheft", ...)`. That draw happens only when a theft actually pays out. Skipping it because a passphrase blocked the spend does not move any other roll. New place rolls happen only when the new paper is what makes `placeHolds` non-zero, or when a passphrase slip or roll sheet is the only readable paper at the trusted house (so the existing betrayal roll, which today is skipped when no seed backup is there, can see the slip).

### Ceremony order

| Step | Who sees it | What it does |
|---|---|---|
| 0 | Everyone | The intro, unchanged. |
| 1 | Everyone | The die. `rollDie` / `secureDice` unchanged. Not the campaign seed. |
| 2 | Everyone | Record the sheet, then keep or destroy. |
| 4 | New ceremonies, after the sheet choice | Passphrase, or skip it. |
| 3 | The oath | Unchanged words. Completes the wallet. |

An old save already on step 3, with the sheet already destroyed, takes the oath and never sees the passphrase. `takeWalletOath` accepts a destroyed sheet or a kept sheet. Demo mode still finishes immediately and creates neither item.

The scripted tutorial harness destroys the sheet and declines the passphrase, then takes the oath. The tour still starts on a wallet with no written backup. The tour steps do not change. `hotKeyBackedUp` is still the write-it-down check, so a kept sheet cannot skip that step.

### Save migration

`walletSetup` defaults stay as they are. New fields (`paperKept`, `passphrase`, `passphrasePlace`) are written only when the player chooses them. Loading an old save does not invent them.

`normalizeCustodyPlaces` sanitises `diceSheet` and `passphraseBackup` only when those objects exist: a nonsense place is dropped, and a transit flag with no journey is put back at the mine, the same rule the seed backup already has.

A finished save has no hot key, or a hot key with no `diceSheet` and no `passphrase`. It loads, spends, burns, and restores as it does today. `hotKeyLost` keeps its current body whenever the key has a restorable `key.backup` and no passphrase, even if a sheet is also present. The sheet changes the outcome only when it is the surviving seed copy, or when a passphrase is in play.

Nothing in this slice calls `nextRand` or `Math.random`.

### Education in this slice

Short lines on the ceremony card. One Method section, `method-ceremony-sheet`, under Custody and verification: the sheet, the passphrase, the separate slip, and the open computer. One Learn note pointed at BIP39, dated 2013-09-10, with a one-question check. Two glossary lines, Passphrase and Roll sheet, aimed at that Method anchor.

Copy stays in the game's voice: short sentences, the trade-off in the line above the button. No new fold that hides the reason.

### Files

| File | Change |
|---|---|
| `src/ui/wallet-ceremony.js` | New. The sheet choice and the passphrase step. Keeps `render.js` under the 72 KB ceiling. |
| `index.html`, `scripts/check-project-structure.mjs` | Script tag, `?v=1.2.5`, same order in both lists. |
| `src/ui/render.js` | Step 2 and step 4 call the new module. Step 4 is part of the modal. |
| `src/engine/actions.js` | Keep, destroy, decline, place. Oath accepts either sheet choice. `createHotWallet` is told what was chosen. |
| `src/app/events.js` | The new button names. |
| `src/engine/hotkey.js` | Recovery and theft when a sheet or a passphrase exists. The no-passphrase, backup-present path stays the current function. |
| `src/engine/places.js` | Sheet and slip are their own items in a place, a journey, and an incident. |
| `src/data/custody.js` | Sanitise the new objects when present. |
| `src/ui/enhance/places.js`, `src/ui/enhance/hotkey.js` | Show and move the sheet and the slip. The hot card still asks for a written backup. |
| `src/ui/tabs/method-chapters.js`, `src/data/glossary.js`, `src/data/progression.js` | The short lesson. |
| `scripts/tutorial-guarantee.mjs`, `scripts/check-ui-contracts.mjs` | The harness finishes the new step (destroy, decline passphrase, oath). New lines assert the trade-off copy and that a kept sheet is not `key.backup`. |

---

## Later phases — mapped onto the same engine

Not in the first pull request. Each is its own draft from `main` after Phase 1, still unsigned until the owner says so.

### Phase 2 — Shamir shares

[SLIP-0039](https://github.com/satoshilabs/slips/blob/master/slip-0039.md) is Final, created 2017-12-18. It splits a master secret into shares. Fewer than the threshold reveal nothing. It is meant as a replacement for BIP39 and, for the most part, the two are not compatible. A BIP39 mnemonic can be turned into SLIP-0039 shares only as 59-word shares of the derived seed, and the SLIP says not to do that: move the coins to a new SLIP-0039 wallet and destroy the old mnemonic. A SLIP-0039 share cannot be turned back into a BIP39 mnemonic. Trezor's own guide to the same idea: [Multi-share Backup on Trezor](https://trezor.io/guides/backups-recovery/advanced-wallets/multi-share-backup-on-trezor).

In the sim this is not a new wallet policy. It is one secret, broken into `n` paper shares with a threshold `k` (the taught default is 2-of-3). Each share is its own placeable item, the way the passphrase slip is. The descriptor problem does not apply: any `k` shares rebuild the one seed.

What it protects: one found share spends nothing. One lost share still leaves a recovery.

How it fails: fewer than `k` shares left, and the coins are stranded. `k` shares in one place, and one visit spends. A friend who has read `k` shares spends. Setup cost is paper and trips, not a subscription. The lesson says these are not the 24 BIP39 words.

Test: place the shares, then run a fire, a theft, and a recovery through the existing place incidents. No new random stream. A share that is not on the board does not add a roll.

### Phase 3 — do it yourself

The game already has this shape. `CUSTODY_POLICIES` includes `2of3`: three keys, threshold two, and the descriptor has to be written down or the loss multiplier goes up. Skills `multisig` (from 2012-01-01) and `airgap` (from 2013-01-01) already gate it. Method already says a quorum is a trade, not an upgrade.

This phase does not invent a second engine. It makes that policy a choice the player can set up on purpose and then break on purpose:

- Cost: the signers the workshop already sells, their lead time, and the days to place each backup. No monthly company fee.
- Protects: one stolen seed spends nothing. One destroyed signer is rebuilt from its backup.
- Fails: two seeds gone, or the descriptor gone and the signers gone with it. Nobody to call. Inheritance is not included; a dead operator is the same failure as two lost keys unless a later phase adds a plan.

Test: the existing place incidents plus the existing "every copy was in the same place" strand. A short drill on the Custody card runs one of those and shows the result.

### Phase 4 — a company key, two products, one tool

Two cited products, plus the open tool that sits beside the second. The player picks one arrangement. The copy names the real product it is modelled on, dates the price, and says the price will move.

**Casa-shaped subscription.** [Standard membership](https://support.casa.io/knowledge/standard-membership-with-3-key-vault), article dated 22 January 2026: $250 a year, a 2-of-3 vault, Casa holds a recovery key the member can ask Casa to sign with. The same page recommends that tier up to about $75,000 and does not list inheritance. [Standard Plus](https://support.casa.io/knowledge/standard-plus-membership-with-5-key-vault), 15 April 2025: $1,100 a year, 3-of-5, member supplies the hardware. [Premium](https://support.casa.io/knowledge/premium-membership-with-5-key-vault): $2,100 a year, 3-of-5, three hardware devices included, and inheritance is part of the advice on that page. The sim models **Standard only** ($250 a year, 2-of-3, company holds one key). The other two stay a sentence and a link, so a price change on those pages does not have to be re-coded to keep the lesson true.

**Unchained-shaped vault.** [Vaults](https://www.unchained.com/vaults): three keys, two required, the client holds two, Unchained holds one and cannot move the coins alone. [Pricing](https://www.unchained.com/pricing), read 11 October 2026: **$250 per vault per year** for that vault. The same page also lists concierge suites at $1,650 and, further down, $2,400 for a similarly worded "Strengthen your setup", Signature from $6,000 in year one, and an Inheritance Boot Camp at $4,000. Those suite figures disagree with each other. **Uncertain.** The sim uses the $250 vault line only, and says the concierge prices were not stable on the page.

**Caravan** is not a third subscription. [What is Caravan?](https://help.unchained.com/what-is-caravan): Unchained's stateless open-source coordinator. It recovers a vault if Unchained's platform is down or gone, and it can be used on its own with Trezor, Coldcard, or Ledger. It does not store the wallet. The player still has to keep the xpubs, paths, and redeem scripts, which in this game is the descriptor, plus two private keys. The help page's external-recovery guide is [How to recover with Caravan](https://help.unchained.com/how-to-vault-external-recovery-caravan). In the sim, choosing the Unchained-shaped vault includes Caravan as the way to spend when the company key is offline and the player still holds two keys and the descriptor. It is not sold as a product and it has no fee.

Mapped onto the engine:

| Piece | Where it lives |
|---|---|
| Your two keys | Ordinary keys on signers you place yourself |
| The company key | One key, no device of yours, holder marked as the company. It counts toward the quorum. It is not a seed backup in your house |
| The fee | A yearly charge on the existing cash ledger, dated in the log. Missing it does not delete keys; it stops the company from signing until it is paid |
| The descriptor | The existing config backup. Caravan is useless without it |
| Provider outage | A modelled flag, `hashRoll` on its own name, only if that arrangement is active. While it is set, the company key cannot sign. Two keys of your own still can, if you have them and the descriptor |
| Company key taken or ordered open | The same outcome as a seized seed: that one secret is exposed. In a 2-of-3 it spends nothing by itself. Combined with one of yours, it spends |
| Inheritance | Not simulated in this phase. Casa Standard's cited page does not include it. Unchained's inheritance offer is Signature and the Boot Camp, not the $250 vault. The card says that, and points at the sources |

DIY from Phase 3 remains the arrangement with no company key and no fee.

A player can switch. Switching is a rotation: new policy, sweep at the real fee, days when the wallet cannot spend, the same job the game already uses to replace a key. The company does not keep a copy that still spends after the sweep.

---

## Tutorial impact

Phase 1 does not add or rewrite a tour step. The ceremony grows in front of the tour. The harness completes it by destroying the sheet and skipping the passphrase, which is a legal play, and the ten steps still have to finish themselves. The 896-run guarantee has to stay at zero stuck.

A kept sheet must not satisfy `hotbackup`. The button the tour points at is still the written seed backup.

Phases 2–4 sit on the Custody card after the tour. They must not change `TOUR_VERSION`, the step ids, or the never-stuck rules. A new drill that can strand coins belongs behind a button the tour does not press.

---

## Open questions

Recommended defaults are what Phase 1 will implement. Later phases stay written here until the owner changes them.

1. **The roll sheet is not the tutorial backup.** Default: yes. It is a different piece of paper, created earlier, and it must not skip "write the key down".
2. **The passphrase is a flag, never a typed secret.** Default: yes. The ceremony is a lesson, not a wallet.
3. **Adding a passphrase requires a place.** Default: yes. Memory-only, with a chance of forgetting, can be a later choice. This slice teaches a slip in a place.
4. **The open computer ignores the passphrase.** Default: yes. A break-in at the mine spends, because the wallet in play is already open. The passphrase stops a found seed, not a running machine. A locked-file model can be revisited if that lesson should change.
5. **No default button on the sheet.** Default: keep and destroy are equal. The player has to choose.
6. **Old step-3 saves skip the passphrase.** Default: yes. They already destroyed the sheet under the old rule and are one oath away from playing.
7. **Casa and Unchained prices are snapshots.** Default: model Casa Standard at $250 a year and an Unchained vault at $250 a year, from the pages cited above, labelled modelled, dated October 2026. Suite prices that disagree on Unchained's pricing page are not used.
8. **A company key can be lost, hacked, or opened.** Default: yes, as one key in the quorum, not as a reason to prefer or avoid either firm.
9. **Inheritance waits.** Default: named in Phase 4's copy, not simulated until a later pass. Neither cited base product is an inheritance service.
10. **Shamir shares are not BIP39 words.** Default: the Phase 2 copy says they are a different backup, mostly incompatible, and that converting by splitting the old seed is the thing SLIP-0039 tells you not to do.

---

## Phase split

| Phase | Pull request | Holds |
|---|---|---|
| 0 | This document | Design, mapping, saves, tutorial, sources, open questions |
| 1 | Next draft from `main` | Roll sheet keep or destroy. Passphrase and its slip. Education for those two. Checks and both viewport passes |
| 2 | Later | SLIP-0039 style shares, placeable, testable |
| 3 | Later | DIY 2-of-3 on the existing policy, with a disaster drill |
| 4 | Later | Casa-shaped Standard subscription, Unchained-shaped $250 vault, Caravan as the offline coordinator |

Each phase is a draft. None of them is marked ready. None of them merges without the owner.
