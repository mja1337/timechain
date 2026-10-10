<!-- News events PR: branch events/<topic>, label news-events, src/data/ only. See docs/data-refresh.md. -->

## Events added or changed

| id | Date | Title | Source (named) | Link |
|---|---|---|---|---|
| | | | | |

## Why each belongs in the timeline

<!-- One or two lines per event: what changed for a miner or holder, and why this imp level. -->

## Checklist

- [ ] Branch is `events/<topic>` and the PR has the `news-events` label.
- [ ] Only files under `src/data/` changed (no `historical-data.js`, no code).
- [ ] Every event has a named `src` and an `https` `url` to the article itself, not a home page; extra `sources` each have a label and a link.
- [ ] I opened every link and it supports the date and the claim as written.
- [ ] Each event has a unique id, a reaction pair and a practical perspective (`check-event-reactions`).
- [ ] `imp` is deliberate (an `imp:3` stops the clock and awards a skill point).
- [ ] All checks pass, including `check-event-sources` and the data guardrail.
