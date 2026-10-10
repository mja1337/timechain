/* EVERY TIMELINE EVENT CARRIES ITS SOURCE.

   src/data/events.js says it in prose: each entry is a real, dated event with the source it came
   from, because a claim without a citation is just atmosphere. This holds the data to it, so a
   news-events PR (docs/data-refresh.md) cannot add an event without a source a reviewer can open:
   a named source (`src`), an https link (`url`), any extra `sources` each with a label and an
   https link, a real ISO date, and an id nobody else has. */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = {};
vm.createContext(context);
vm.runInContext(readFileSync(new URL("../src/data/events.js", import.meta.url), "utf8"), context);
const events = vm.runInContext("EVENTS", context);

const problems = [];
const https = value => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
const ids = new Set();
const warnings = [];
for (const event of events) {
  const id = event.id || "(no id)";
  if (!event.id || ids.has(event.id)) problems.push(`${id}: missing or duplicate id`);
  ids.add(event.id);
  const time = Date.parse(`${event.date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date || "") || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== event.date) problems.push(`${id}: date "${event.date}" is not a real YYYY-MM-DD date`);
  if (typeof event.src !== "string" || event.src.trim().length < 2) problems.push(`${id}: needs a named source in src`);
  if (!https(event.url)) problems.push(`${id}: needs an https source link in url`);
  /* A bare home page is a pointer, not a citation. Some older entries do; a new one should link the article. */
  else if (new URL(event.url).pathname.replace(/\/+$/, "") === "") warnings.push(id);
  for (const extra of event.sources || []) {
    if (typeof extra.label !== "string" || !extra.label.trim() || !https(extra.url)) problems.push(`${id}: every entry in sources needs a label and an https url`);
  }
}
if (problems.length) {
  console.error(problems.join("\n"));
  throw new Error(`${problems.length} timeline event(s) without a usable source`);
}
if (warnings.length) console.warn(`note: ${warnings.length} event(s) link a bare home page rather than the article: ${warnings.join(", ")}`);
console.log(`Event sources passed: ${events.length} events, each with a named source and an https link`);
