# Data refreshes and news events

The recorded history in `historical-data.js` ends on a fixed day, the cut-off. Moving it forward
is routine work, and it goes live the moment it reaches `main`, so it runs as a small,
predictable pull request with fixed objectives and automatic guardrails. Sourced news events are
a different kind of change and get their own PR type.

| PR type | Branch | Label | Who writes it | May change |
|---|---|---|---|---|
| Data refresh | `data/weekly-refresh` | `data-refresh` | The weekly workflow | `historical-data.js`, plus the cut-off date in `scripts/build-historical-data.mjs` (`DEFAULT_END`) and `src/config/timeline.js` (`END`) |
| News events | `events/<topic>` | `news-events` | A person | `src/data/` only |
| Anything else | any | | A person | anything, through the usual checks |

Neither type is ever merged automatically. Merging to `main` is a release: follow the README's
release steps (bump `APP_VERSION`, changelog, tag).

## CI

- **`.github/workflows/checks.yml`** runs on every pull request, every push to `main`, and on
  demand. It runs `git diff --check` on the change and the eight check scripts (the seven in the
  README plus `check-event-sources.mjs`). On a `data/*` or `events/*` branch, or with the
  `data-refresh` or `news-events` label, it also runs `scripts/check-data-refresh.mjs`.
  Its permissions are read-only.
- **`.github/workflows/data-refresh.yml`** runs every Monday at 07:00 UTC, and from the Actions
  tab with an optional cut-off date. Only this job can write, and only to its own branch and PR.

Node is pinned in `.nvmrc`. Actions are pinned to full commit SHAs.

## The weekly data refresh

### Objectives

1. Move the cut-off to the latest **complete** UTC day that both sources publish: Coin Metrics
   (every metric the bundle reads) and mempool.space (daily fee rates). Difficulty is a step
   function, so it needs no day of its own. Today never counts, because today is not over.
2. **Append only.** Every point on or before the old cut-off stays exactly as it is on `main`.
   `build-historical-data.mjs --append` keeps the existing points and adds only the days after
   them. The series are still computed from the full fetch, so trailing means have their whole
   window. Upstream revisions to old days are therefore never pulled in by a refresh. If one
   matters, it is a deliberate, separate PR using the narrow build modes in the README.
3. Change nothing else: the bundle and the cut-off date in two places, no code and no events.
4. Hand a person everything needed to review it in a few minutes, and never merge.

### What the workflow does

1. Checks out `main` and runs `node scripts/data-refresh.mjs` (with `DATA_REFRESH_END` set
   from the dispatch input, if one was given). If the data already runs through that day, it
   logs a notice and stops. There is no branch and no PR.
2. Runs all the checks, `git diff --check` and the guardrail on the result, and records each
   outcome.
3. Commits as `github-actions[bot]` and force-pushes `data/weekly-refresh`. The bot owns this
   branch and rebuilds it from `main` every run, so never push to it by hand. An open refresh
   PR that has not been merged is replaced by the next week's, which covers both weeks.
4. Opens the PR, or updates the open one, with a generated body. The body shows the
   objectives, the old and new cut-off, rows added per series, the latest values with their
   change since the old cut-off, every guardrail and check result, and the review checklist.
   It labels the PR `data-refresh`.
5. Dispatches `checks.yml` on the branch. A PR opened with the workflow token does not trigger
   `pull_request` workflows, so this is how the checks appear on the PR's commit. Closing and
   reopening the PR also runs them.
6. If anything failed, the PR title says "checks failed, do not merge" and the run fails.

### Guardrails (`scripts/check-data-refresh.mjs`)

The script compares the base `historical-data.js` (read with `git show` at the merge base) with
the working tree. It fails, naming the series and the date, on any of the following:

| Guardrail | Rule |
|---|---|
| File scope | A data refresh changes only `historical-data.js`, `scripts/build-historical-data.mjs` and `src/config/timeline.js`. In the last two, nothing but the cut-off date may differ. An events PR changes only `src/data/`. |
| Cut-off | It moves forward, by at most **45 days** at once, to a day before today (UTC). A data refresh must add at least one day. |
| One cut-off | `meta.through`, `DEFAULT_END` and the timeline's `END` are the same date. |
| Append only | Every point on or before the old cut-off is present, with no point added, removed or changed beyond a relative **1e-9** (the data is stored to 9 or 10 significant figures, so anything larger is a real revision). No series is removed, and `meta` changes only `through` and `generated`. |
| Tail | Each daily series (price, hash, fees, transactions, height, both fee rates) has exactly one point for every day after the old cut-off, ending on the new one. There are no gaps or extra points, no nulls in the stored grid, and nothing negative or non-finite. Every series is in strict date order. The weekly market-cap series ends on the cut-off with no gap over 7 days. |
| Day-to-day bounds | See the table below. |
| Retargets | There is one retarget height per difficulty step on the same date. Each new retarget is exactly 2016 blocks after the last and at most 28 days after it, and its height sits inside that day's block range (within 25 blocks). There is a retarget within 21 days of the cut-off. |
| Size | The bundle stays under **640,000 bytes** and grows by at most 2,000 + 250 bytes per day added. The 72 KB module ceiling in `check-project-structure` deliberately does not apply to the generated bundle, so this is its own budget. It is about 448 KB today, and a day adds about 110 bytes. |

Day-to-day bounds apply to each step after the old cut-off, including the step from the old
cut-off itself. For scale, the worst moves recorded since 2016 are in the last column:

| Series | Allowed move per step | Worst since 2016 |
|---|---|---|
| Price (daily) | ±40% (×0.6 to ×1.4) | −37.5% on 2020-03-12, +25% on 2017-07-20 |
| Hash rate (14-day mean) | ×0.75 to ×1.33. This is much tighter than a raw 3×, because the series is already a fortnight's average. | ×0.950 / ×1.056 |
| Transactions (7-day mean) | ×0.67 to ×1.5 | ×0.867 / ×1.156 |
| Fees per block (7-day) | ×0.25 to ×4 | ×0.390 / ×2.544 |
| Market cap (weekly) | ×0.6 to ×1.6 | ×0.711 / ×1.398 |
| Difficulty (per retarget) | ×0.6 to ×1.5, inside the protocol's 4× clamp | ×0.721 / ×1.215 |
| Block height | +40 to +300 blocks a day | +58 / +200 |
| Fee rates | 0 to 5,000 sat/vB, and the 90th percentile is never below the median | 1,240 sat/vB peak |
| Market cap / price at the cut-off | 14M to 30M BTC (a units check) | about 20M |

A failure here is not necessarily wrong data. Something extraordinary may have happened. Check
the move against a public source, and if it is real, raise the bound in `LIMITS` in a separate,
reviewed PR that says why. Never do that in the refresh PR itself, because the scope guardrail
would refuse it anyway.

### Running it locally

```bash
node scripts/build-historical-data.mjs --latest-end   # the day the refresh would move to (network)
node scripts/data-refresh.mjs                         # refresh to it, or:
node scripts/data-refresh.mjs --end=2026-10-09        # refresh to a chosen day
git switch -c data/my-refresh                         # so the guardrail treats it as a data refresh
node scripts/check-data-refresh.mjs --base=origin/main
# then the usual checks
```

The cut-off can also be set for a single build with `--end=YYYY-MM-DD` or the
`TIMECHAIN_DATA_END` environment variable. With neither set, the build script uses `DEFAULT_END`,
so `node scripts/build-historical-data.mjs` behaves exactly as before. To throw a local refresh
away, run `git checkout -- historical-data.js scripts/build-historical-data.mjs src/config/timeline.js`.

### Review checklist

- [ ] Every guardrail and check in the PR body is ✅.
- [ ] The files changed are only the three above, and the two script diffs are one date each.
- [ ] The latest price, hash rate and difficulty match mempool.space or another public source on
      the new cut-off.
- [ ] Any large move has a known real-world cause and, if it deserves one, a separate events PR.
- [ ] Optional: play past the old cut-off on the branch for a minute.
- [ ] Merge, then bump `APP_VERSION`, add the changelog entry and tag the release, as the README
      describes.

## News events (a separate PR type)

Events are written and checked by a person, never by the weekly workflow.

- **Branch** `events/<topic>`, **label** `news-events`, and **only `src/data/`** changes. That is
  usually `src/data/events.js` and its matching entries in `src/data/event-reactions.js`. The
  guardrail refuses any other file, and `historical-data.js` in particular.
- **Every event carries its source.** That means a named source in `src` and an `https` link to
  the article itself in `url`, plus a label and an `https` link for each entry in `sources` if
  there are more. `scripts/check-event-sources.mjs` enforces this on every PR. It also lists
  older events that link only a home page, which should not be copied.
- The usual rules in `src/data/events.js` apply: a real, dated event, a unique id, `imp` treated
  as a balance decision (an `imp:3` event stops the clock), a reaction pair and a practical
  perspective for each event (`check-event-reactions`).
- Use the template: open the PR with `?template=news-events.md` on the compare URL, or copy
  `.github/PULL_REQUEST_TEMPLATE/news-events.md`.
