/* GUARDRAILS FOR A HISTORY REFRESH.

     node scripts/check-data-refresh.mjs [--base=origin/main] [--mode=auto|data-refresh|events|history]
                                         [--json=summary.json] [--today=YYYY-MM-DD]

   Compares historical-data.js on the base (read with `git show` at the merge base) with the copy
   in the working tree, and fails, naming the reason, if a refresh does anything other than add
   recorded days to the end. The rules and why each threshold is what it is are in
   docs/data-refresh.md; the numbers are in LIMITS below, with the worst move recorded since
   2016 beside each so a reader can see the headroom.

   Mode. "auto" (the default) reads the branch (GITHUB_HEAD_REF, GITHUB_REF_NAME, or the
   checked-out branch) and the PR labels (PR_LABELS, comma separated): a data/* branch or the
   data-refresh label is a data refresh, an events/* branch or the news-events label is an
   events PR, and anything else only gets the history comparison, and only if
   historical-data.js changed. A data refresh may change historical-data.js and the cut-off
   date in two places, nothing else; an events PR may change src/data/ and nothing else. */
import { readFileSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = "historical-data.js";
const BUILD = "scripts/build-historical-data.mjs";
const TIMELINE = "src/config/timeline.js";
const DAY = 86_400_000;

const LIMITS = {
  /* History is append-only. Values are stored to 9-10 significant figures, so anything beyond
     a relative 1e-9 is a real revision, not float noise. */
  relativeTolerance: 1e-9,
  /* A weekly run adds about 7 days; 45 allows a missed month without letting a mistyped year through. */
  maxEndStepDays: 45,
  /* Day-to-day ratio bounds on the new tail, including the step from the old cut-off.
     Worst since 2016 in brackets. */
  ratio: {
    PRICE: [0.6, 1.4],        // daily close, +/-40% (-37.5% on 2020-03-12, +25% on 2017-07-20)
    HASH: [0.75, 1.33],       // 14-day trailing mean, so far tighter than a raw 3x (0.950 / 1.056)
    TX: [0.67, 1.5],          // 7-day trailing mean (0.867 / 1.156)
    FEES: [0.25, 4],          // 7-day fees per block; inscription waves move it fast (0.390 / 2.544)
    CAP: [0.6, 1.6],          // weekly 7-day mean (0.711 / 1.398)
    DIFFICULTY: [0.6, 1.5],   // per retarget, inside the protocol's 4x clamp (0.721 / 1.215)
  },
  heightStep: [40, 300],      // blocks per day (58 / 200; 144 expected)
  feeRateMax: 5000,           // sat/vB, median or 90th percentile (1,240 at the 2024 halving)
  retargetSlack: 25,          // a retarget height must sit inside that day's HEIGHT range, +/- this (3)
  impliedSupply: [14e6, 30e6],// CAP / PRICE at the cut-off: a units check, not an accounting one (~19.99M)
  maxBytes: 640_000,          // the bundle is ~448 KB; the src/ module ceiling deliberately does not apply
  bytesPerDay: 250,           // a day adds ~110 bytes across ten series
  bytesSlack: 2_000,
};
const DAILY = ["PRICE", "HASH", "FEES", "TX", "HEIGHT", "FEERATE", "FEERATE_HIGH"];
const SERIES = [...DAILY, "CAP", "DIFFICULTY", "RETARGET_HEIGHT"];
const DATA_REFRESH_FILES = new Set([DATA, BUILD, TIMELINE]);
const END_PATTERNS = {
  [BUILD]: /const DEFAULT_END = "(\d{4}-\d{2}-\d{2})";/,
  [TIMELINE]: /END=Date\.parse\("(\d{4}-\d{2}-\d{2})T00:00:00Z"\)/,
};

const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
const day = date => Date.parse(`${date}T00:00:00Z`);
const iso = time => new Date(time).toISOString().slice(0, 10);
const days = (a, b) => Math.round((day(b) - day(a)) / DAY);

const results = [];
function check(name, fn) {
  try {
    const problems = [];
    const detail = fn(message => problems.push(message));
    if (problems.length) results.push({ name, ok: false, detail: problems.slice(0, 8).join("; ") + (problems.length > 8 ? `; and ${problems.length - 8} more` : "") });
    else results.push({ name, ok: true, detail: detail || "ok" });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}

function load(source, label) {
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: label });
  const data = context.window.HISTORICAL_DATA;
  if (!data?.meta?.through) throw new Error(`${label}: HISTORICAL_DATA or meta.through is missing`);
  return data;
}

/* ---------- inputs ---------- */
const baseRef = arg("base") || process.env.DATA_REFRESH_BASE || "origin/main";
const mergeBase = git("merge-base", baseRef, "HEAD").trim();
const branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git("branch", "--show-current").trim();
const labels = (process.env.PR_LABELS || "").split(",").map(s => s.trim()).filter(Boolean);
let mode = arg("mode") || "auto";
if (mode === "auto") {
  if (branch.startsWith("data/") || labels.includes("data-refresh")) mode = "data-refresh";
  else if (branch.startsWith("events/") || labels.includes("news-events")) mode = "events";
  else mode = "history";
}
const today = arg("today") || iso(Date.now());
const changed = [...new Set([
  ...git("diff", "--name-only", mergeBase).split("\n"),
  ...git("ls-files", "--others", "--exclude-standard").split("\n"),
].filter(Boolean))].sort();

const baseText = git("show", `${mergeBase}:${DATA}`).replace(/\r\n/g, "\n");
const headText = readFileSync(resolve(ROOT, DATA), "utf8").replace(/\r\n/g, "\n");
const dataChanged = baseText !== headText;
console.log(`check-data-refresh: mode ${mode}, branch "${branch || "(detached)"}", base ${baseRef} (${mergeBase.slice(0, 7)}), ${changed.length} file(s) changed`);

/* ---------- file scope ---------- */
if (mode === "data-refresh") {
  check("Only the data and its cut-off changed", fail => {
    for (const file of changed) if (!DATA_REFRESH_FILES.has(file)) fail(`${file} is outside a data refresh (allowed: ${[...DATA_REFRESH_FILES].join(", ")})`);
    for (const [file, pattern] of Object.entries(END_PATTERNS)) {
      if (!changed.includes(file)) continue;
      const before = git("show", `${mergeBase}:${file}`);
      const after = readFileSync(resolve(ROOT, file), "utf8");
      const newEnd = pattern.exec(after)?.[1];
      if (!newEnd) { fail(`${file} no longer carries its cut-off in the expected form`); continue; }
      const oldLine = pattern.exec(before)?.[0];
      const newLine = pattern.exec(after)[0];
      if (!oldLine || before.replace(oldLine, newLine) !== after) fail(`${file} changed beyond its cut-off date`);
    }
    return `${changed.length ? changed.join(", ") : "nothing"}`;
  });
} else if (mode === "events") {
  check("Only src/data changed", fail => {
    for (const file of changed) if (!file.startsWith("src/data/")) fail(`${file} is outside an events PR (src/data/ only)`);
    if (changed.includes(DATA)) fail("an events PR must not touch historical-data.js");
    return changed.join(", ") || "nothing";
  });
}

/* ---------- the data ---------- */
let summary = null;
const runDataChecks = mode === "data-refresh" || dataChanged;
if (runDataChecks) {
  let base, head;
  check("Both bundles load", () => {
    base = load(baseText, `base ${DATA}`);
    head = load(headText, DATA);
    return `base through ${base.meta.through}, head through ${head.meta.through}`;
  });
  if (base && head) {
    const oldEnd = base.meta.through, newEnd = head.meta.through;
    const step = days(oldEnd, newEnd);

    check("Cut-off moves forward, by at most 45 days, to a complete day", fail => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(newEnd) || iso(day(newEnd)) !== newEnd) fail(`meta.through "${newEnd}" is not a date`);
      if (step < 0) fail(`the cut-off moves backwards, ${oldEnd} -> ${newEnd}`);
      if (step > LIMITS.maxEndStepDays) fail(`the cut-off jumps ${step} days, more than ${LIMITS.maxEndStepDays}`);
      if (newEnd >= today) fail(`${newEnd} is not a complete UTC day yet (today ${today})`);
      if (mode === "data-refresh" && step === 0) fail("a data refresh that adds no days");
      return `${oldEnd} -> ${newEnd} (+${step} days)`;
    });

    check("The cut-off agrees in all three places", fail => {
      for (const [file, pattern] of Object.entries(END_PATTERNS)) {
        const found = pattern.exec(readFileSync(resolve(ROOT, file), "utf8"))?.[1];
        if (found !== newEnd) fail(`${file} says ${found ?? "nothing"}, the bundle says ${newEnd}`);
      }
      return `meta.through, DEFAULT_END and timeline END are all ${newEnd}`;
    });

    check("History on or before the old cut-off is unchanged", fail => {
      for (const key of Object.keys(base)) if (!(key in head)) fail(`${key} was removed`);
      const metaKeep = Object.keys(base.meta).filter(k => k !== "through" && k !== "generated");
      for (const k of metaKeep) if (JSON.stringify(base.meta[k]) !== JSON.stringify(head.meta[k])) fail(`meta.${k} changed`);
      let compared = 0;
      for (const key of Object.keys(base)) {
        if (key === "meta" || !(key in head)) continue;
        const after = new Map();
        for (const [date, value] of head[key]) if (date <= oldEnd) after.set(date, value);
        const before = base[key].filter(([date]) => date <= oldEnd);
        if (after.size !== before.length) fail(`${key} has ${after.size} points on or before ${oldEnd}, was ${before.length}`);
        for (const [date, value] of before) {
          compared++;
          if (!after.has(date)) { fail(`${key} lost ${date}`); continue; }
          const now = after.get(date);
          const tolerance = Math.abs(value) * LIMITS.relativeTolerance;
          if (!(Math.abs(now - value) <= tolerance)) fail(`${key} ${date} changed from ${value} to ${now}`);
        }
      }
      return `${compared.toLocaleString("en-GB")} points compared`;
    });

    check("The new tail is complete, ordered and finite", fail => {
      for (const key of SERIES) {
        const series = head[key];
        if (!Array.isArray(series) || !series.length) { fail(`${key} is missing`); continue; }
        for (let i = 1; i < series.length; i++) if (!(day(series[i][0]) > day(series[i - 1][0]))) fail(`${key} is not in date order at ${series[i][0]}`);
        const tail = series.filter(([date]) => date > oldEnd);
        for (const [date, value] of tail) {
          if (value === null || !Number.isFinite(value) || value < 0) fail(`${key} ${date} is ${value}`);
          if (date > newEnd) fail(`${key} has ${date}, after the ${newEnd} cut-off`);
        }
        if (DAILY.includes(key)) {
          if (tail.length !== step) fail(`${key} added ${tail.length} days, expected ${step}`);
          for (let t = day(oldEnd) + DAY, i = 0; t <= day(newEnd); t += DAY, i++) {
            if (tail[i]?.[0] !== iso(t)) { fail(`${key} has a gap or extra point at ${iso(t)}`); break; }
          }
          if (series.at(-1)[0] !== newEnd) fail(`${key} ends at ${series.at(-1)[0]}, not ${newEnd}`);
        }
        if (key === "CAP" && step > 0) {
          if (series.at(-1)[0] !== newEnd) fail(`CAP ends at ${series.at(-1)[0]}, not ${newEnd}`);
          const window = series.filter(([date]) => date >= oldEnd);
          for (let i = 1; i < window.length; i++) if (days(window[i - 1][0], window[i][0]) > 7) fail(`CAP skips more than a week before ${window[i][0]}`);
        }
      }
      /* The bundle stores regular series as a value grid; a null inside it is a missing day
         even though the decoder skips it. Read the raw grid for the tail. */
      const raw = JSON.parse(headText.slice(headText.indexOf("var raw=") + 8, headText.indexOf(";\nvar data=")));
      for (const key of DAILY) {
        const s = raw[key];
        if (!s?.v) continue;
        s.v.forEach((v, i) => {
          const date = iso(day(s.start) + i * s.step * DAY);
          if (v === null && date > oldEnd) fail(`${key} stores a null on ${date}`);
        });
      }
      return `${step} new days in each daily series`;
    });

    check("Day-to-day moves stay inside sane bounds", fail => {
      for (const [key, [lo, hi]] of Object.entries(LIMITS.ratio)) {
        const s = head[key];
        if (!Array.isArray(s)) continue; // a missing series is reported by the tail check
        const first = s.findIndex(([date]) => date > oldEnd);
        if (first < 1) continue;
        for (let i = first; i < s.length; i++) {
          const r = s[i][1] / s[i - 1][1];
          if (!(r >= lo && r <= hi)) fail(`${key} moves x${r.toFixed(3)} on ${s[i][0]} (allowed x${lo}-x${hi})`);
        }
      }
      const h = head.HEIGHT, first = h.findIndex(([date]) => date > oldEnd);
      if (first > 0) for (let i = first; i < h.length; i++) {
        const d = h[i][1] - h[i - 1][1];
        if (d < LIMITS.heightStep[0] || d > LIMITS.heightStep[1]) fail(`HEIGHT adds ${d} blocks on ${h[i][0]} (allowed ${LIMITS.heightStep.join("-")})`);
      }
      const median = new Map(head.FEERATE);
      for (const [date, high] of head.FEERATE_HIGH.filter(([d]) => d > oldEnd)) {
        if (high > LIMITS.feeRateMax || median.get(date) > LIMITS.feeRateMax) fail(`fee rate above ${LIMITS.feeRateMax} sat/vB on ${date}`);
        if (!(median.get(date) <= high)) fail(`FEERATE_HIGH below the median on ${date}`);
      }
      const cap = head.CAP.at(-1), price = new Map(head.PRICE).get(cap[0]);
      const supply = cap[1] / price;
      if (!(supply >= LIMITS.impliedSupply[0] && supply <= LIMITS.impliedSupply[1])) fail(`CAP / PRICE on ${cap[0]} implies ${Math.round(supply).toLocaleString("en-GB")} BTC: a units error`);
      return `price, hash, tx, fees, cap, difficulty, height and fee rates inside bounds; implied supply ${(supply / 1e6).toFixed(2)}M`;
    });

    check("Difficulty retargets line up", fail => {
      const d = head.DIFFICULTY, r = head.RETARGET_HEIGHT;
      if (d.length !== r.length) fail(`${d.length} difficulty steps but ${r.length} retarget heights`);
      r.forEach(([date, height], i) => {
        if (d[i]?.[0] !== date) fail(`retarget ${i} is dated ${date}, its difficulty step ${d[i]?.[0]}`);
        if (date <= oldEnd) return;
        if (height !== r[i - 1][1] + 2016) fail(`retarget on ${date} is at ${height}, expected ${r[i - 1][1] + 2016}`);
        if (days(r[i - 1][0], date) > 28) fail(`retarget on ${date} comes ${days(r[i - 1][0], date)} days after the last`);
        const heights = new Map(head.HEIGHT);
        const lo = heights.get(iso(day(date) - DAY)), hi = heights.get(date);
        if (lo !== undefined && hi !== undefined && (height < lo - LIMITS.retargetSlack || height > hi + LIMITS.retargetSlack)) fail(`retarget height ${height} on ${date} is outside that day's blocks ${lo}-${hi}`);
      });
      if (days(r.at(-1)[0], newEnd) > 21) fail(`no retarget in the 21 days before ${newEnd}`);
      const added = r.filter(([date]) => date > oldEnd);
      return added.length ? `${added.length} new: ${added.map(([date, height]) => `${height} on ${date}`).join(", ")}` : "no new retarget in this window";
    });

    const bytesBefore = Buffer.byteLength(baseText), bytesAfter = statSync(resolve(ROOT, DATA)).size;
    check("The bundle stays inside its size budget", fail => {
      if (bytesAfter > LIMITS.maxBytes) fail(`${DATA} is ${bytesAfter} bytes, over ${LIMITS.maxBytes}`);
      const budget = LIMITS.bytesSlack + LIMITS.bytesPerDay * Math.max(step, 0);
      if (bytesAfter - bytesBefore > budget) fail(`${DATA} grew ${bytesAfter - bytesBefore} bytes for ${step} days (budget ${budget})`);
      return `${bytesBefore.toLocaleString("en-GB")} -> ${bytesAfter.toLocaleString("en-GB")} bytes (ceiling ${LIMITS.maxBytes.toLocaleString("en-GB")})`;
    });

    const fmt = {
      PRICE: v => `$${v.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`,
      HASH: v => `${(v / 1e18).toFixed(1)} EH/s`,
      DIFFICULTY: v => `${(v / 1e12).toFixed(2)} T`,
      FEES: v => `${v.toFixed(4)} BTC/block`,
      TX: v => Math.round(v).toLocaleString("en-GB"),
      HEIGHT: v => v.toLocaleString("en-GB"),
      CAP: v => `$${(v / 1e12).toFixed(3)} tn`,
      FEERATE: v => `${v} sat/vB`,
      FEERATE_HIGH: v => `${v} sat/vB`,
      RETARGET_HEIGHT: v => v.toLocaleString("en-GB"),
    };
    summary = { oldEnd, newEnd, daysAdded: step, bytesBefore, bytesAfter, rows: {}, latest: {} };
    for (const key of SERIES) {
      const s = head[key] || [], b = base[key] || [];
      summary.rows[key] = { added: s.filter(([date]) => date > oldEnd).length, total: s.length };
      const last = s.at(-1), prev = b.filter(([date]) => date <= oldEnd).at(-1);
      if (!last) continue;
      const change = prev && prev[1] && key !== "HEIGHT" && key !== "RETARGET_HEIGHT" ? `${last[1] >= prev[1] ? "+" : ""}${((last[1] / prev[1] - 1) * 100).toFixed(1)}%` : (prev ? `+${(last[1] - prev[1]).toLocaleString("en-GB")}` : null);
      summary.latest[key] = { date: last[0], value: last[1], display: fmt[key](last[1]), change };
    }
  }
} else {
  results.push({ name: "History comparison", ok: true, detail: `${DATA} is unchanged; nothing to compare` });
}

/* ---------- report ---------- */
const ok = results.every(r => r.ok);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
if (summary) console.table(Object.fromEntries(Object.entries(summary.latest).map(([k, v]) => [k, { date: v.date, value: v.display, change: v.change }])));
if (arg("json")) writeFileSync(arg("json"), JSON.stringify({ ok, mode, branch, base: mergeBase, changed, results, summary }, null, 2));
console.log(ok ? "Data refresh guardrails passed" : "Data refresh guardrails FAILED");
process.exit(ok ? 0 : 1);
