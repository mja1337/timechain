/* THE WEEKLY DATA REFRESH, end to end, on a working tree.

     node scripts/data-refresh.mjs                    # latest complete UTC day both sources have
     node scripts/data-refresh.mjs --end=2026-10-09   # or a chosen cut-off

   Works out the new cut-off, appends the days after the current one to historical-data.js
   (build-historical-data.mjs --append, which leaves every existing point untouched) and moves
   the two other places the cut-off is written - DEFAULT_END in the build script and END in
   src/config/timeline.js - so all three agree. Nothing else is edited. When there is nothing
   new it says so and exits 0 without writing anything.

     node scripts/data-refresh.mjs --pr-body --guard=guard.json --checks=checks.tsv [--run-url=URL]

   Prints the pull-request body from the guardrail's JSON summary and the check results
   (one "name<TAB>pass|fail" line each). The weekly workflow uses both; see docs/data-refresh.md. */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86_400_000;
const BUILD = "scripts/build-historical-data.mjs";
const TIMELINE = "src/config/timeline.js";
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const day = date => Date.parse(`${date}T00:00:00Z`);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && new Date(day(value)).toISOString().slice(0, 10) === value;

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(""));
}

/* Exactly one occurrence of each pattern, or the edit refuses: a second match would mean the
   file changed shape and a blind replace could move the wrong date. */
function replaceOnce(file, pattern, replacement) {
  const path = resolve(ROOT, file);
  const text = readFileSync(path, "utf8");
  const matches = text.match(new RegExp(pattern.source, "g")) || [];
  if (matches.length !== 1) throw new Error(`${file}: expected one match for ${pattern}, found ${matches.length}`);
  writeFileSync(path, text.replace(pattern, replacement), "utf8");
}

const END_PATTERNS = {
  [BUILD]: { pattern: /const DEFAULT_END = "(\d{4}-\d{2}-\d{2})";/, render: end => `const DEFAULT_END = "${end}";` },
  [TIMELINE]: { pattern: /END=Date\.parse\("(\d{4}-\d{2}-\d{2})T00:00:00Z"\)/, render: end => `END=Date.parse("${end}T00:00:00Z")` },
};

function currentEnd() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(resolve(ROOT, "historical-data.js"), "utf8"), context);
  return context.window.HISTORICAL_DATA.meta.through;
}

function prBody() {
  const guard = JSON.parse(readFileSync(arg("guard"), "utf8"));
  const checks = readFileSync(arg("checks"), "utf8").trim().split("\n").filter(Boolean).map(line => line.split("\t"));
  const runUrl = arg("run-url");
  const allChecks = checks.every(([, status]) => status === "pass");
  const ok = allChecks && guard.ok;
  const mark = pass => (pass ? "✅" : "❌");
  const s = guard.summary;
  const lines = [
    `Weekly history refresh: recorded data now runs through **${s.newEnd}** (was ${s.oldEnd}, +${s.daysAdded} days).`,
    "",
    ok ? "All checks and guardrails passed. This PR is never merged automatically: review it with the checklist below." :
      "**Something failed. Do not merge.** The details are below and in the workflow log.",
    "",
    "## Objectives",
    "",
    "- Move the recorded history forward to the latest complete UTC day that both Coin Metrics and mempool.space publish.",
    "- Append only: every value on or before the old cut-off is byte-for-byte what is on `main`.",
    "- Change nothing but `historical-data.js` and the cut-off date in `scripts/build-historical-data.mjs` and `src/config/timeline.js`.",
    "- News and events are a separate, human-written PR type (see `docs/data-refresh.md`).",
    "",
    "## Cut-off",
    "",
    "| | Old | New |",
    "|---|---|---|",
    `| Through | ${s.oldEnd} | ${s.newEnd} |`,
    `| historical-data.js | ${s.bytesBefore.toLocaleString("en-GB")} bytes | ${s.bytesAfter.toLocaleString("en-GB")} bytes (+${(s.bytesAfter - s.bytesBefore).toLocaleString("en-GB")}) |`,
    "",
    "## Rows added",
    "",
    "| Series | Added | Total |",
    "|---|---:|---:|",
    ...Object.entries(s.rows).map(([name, r]) => `| ${name} | ${r.added} | ${r.total.toLocaleString("en-GB")} |`),
    "",
    "## Latest values",
    "",
    "| Series | Date | Value | Change vs old cut-off |",
    "|---|---|---:|---:|",
    ...Object.entries(s.latest).map(([name, l]) => `| ${name} | ${l.date} | ${l.display} | ${l.change ?? "n/a"} |`),
    "",
    "## Guardrails (`scripts/check-data-refresh.mjs`)",
    "",
    ...guard.results.map(r => `- ${mark(r.ok)} **${r.name}**: ${r.detail}`),
    "",
    "## Checks",
    "",
    ...checks.map(([name, status]) => `- ${mark(status === "pass")} \`${name}\``),
    "",
    "## Review checklist",
    "",
    "- [ ] The guardrails and every check above are ✅.",
    "- [ ] Files changed are only `historical-data.js`, `scripts/build-historical-data.mjs` (DEFAULT_END) and `src/config/timeline.js` (END).",
    "- [ ] The latest price, hash rate and difficulty look right against mempool.space or another public source for the new cut-off.",
    "- [ ] Any large move in the table above has a known real-world cause (and, if it deserves one, a separate events PR).",
    "- [ ] Optional: open the branch locally and play past the old cut-off for a minute.",
    "- [ ] Merge, then follow the README's release steps (APP_VERSION bump, changelog, tag): merging to `main` goes live.",
    "",
    runUrl ? `Generated by the [weekly data refresh](${runUrl}). The branch \`data/weekly-refresh\` is rebuilt from \`main\` each run, so do not push to it by hand.` :
      "Generated by scripts/data-refresh.mjs.",
  ];
  console.log(lines.join("\n"));
}

if (process.argv.includes("--pr-body")) {
  prBody();
  process.exit(0);
}

const oldEnd = currentEnd();
let newEnd = arg("end") || process.env.DATA_REFRESH_END || "";
if (!newEnd) newEnd = execFileSync(process.execPath, [BUILD, "--latest-end"], { cwd: ROOT, encoding: "utf8" }).trim();
if (!isDate(newEnd)) throw new Error(`The new cut-off must be YYYY-MM-DD, got "${newEnd}"`);
const today = new Date().toISOString().slice(0, 10);
if (newEnd >= today) throw new Error(`${newEnd} is not a complete UTC day yet (today is ${today})`);
if (day(newEnd) < day(oldEnd)) throw new Error(`The cut-off cannot move backwards: the data runs through ${oldEnd}, asked for ${newEnd}`);
if (newEnd === oldEnd) {
  console.log(`Nothing new: the data already runs through ${oldEnd}.`);
  output({ changed: "false", old_end: oldEnd, new_end: newEnd });
  process.exit(0);
}
console.log(`Refreshing ${oldEnd} -> ${newEnd} (${Math.round((day(newEnd) - day(oldEnd)) / DAY)} days)`);
execFileSync(process.execPath, [BUILD, "--append", `--end=${newEnd}`], { cwd: ROOT, stdio: "inherit" });
for (const [file, { pattern, render }] of Object.entries(END_PATTERNS)) replaceOnce(file, pattern, render(newEnd));
output({ changed: "true", old_end: oldEnd, new_end: newEnd });
