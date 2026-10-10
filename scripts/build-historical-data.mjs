import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "historical-data.js");
const START = "2009-01-03";
// The cut-off. DEFAULT_END is the bundled data's own cut-off, kept equal to meta.through and to
// END in src/config/timeline.js; the weekly refresh (scripts/data-refresh.mjs) moves all three
// together and nothing else. --end=YYYY-MM-DD or TIMECHAIN_DATA_END overrides it for one run.
const DEFAULT_END = "2026-10-06";
const END = resolveEnd();
const DAY = 86_400_000;
const METRICS = ["PriceUSD", "HashRate", "FeeTotNtv", "BlkCnt", "TxCnt", "CapMrktCurUSD"];
const ENDPOINT = "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";

function day(date) {
  return Date.parse(`${date}T00:00:00Z`);
}

function resolveEnd() {
  const flag = process.argv.find(arg => arg.startsWith("--end="));
  const value = flag ? flag.slice("--end=".length) : (process.env.TIMECHAIN_DATA_END || DEFAULT_END);
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new Error(`END must be a real YYYY-MM-DD date, got "${value}"`);
  }
  return value;
}

function dateOf(row) {
  return row.time.slice(0, 10);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function significant(value, digits = 9) {
  return Number(value.toPrecision(digits));
}

async function fetchRows() {
  const query = new URLSearchParams({
    assets: "btc",
    metrics: METRICS.join(","),
    frequency: "1d",
    start_time: START,
    end_time: END,
    page_size: "10000",
  });
  let url = `${ENDPOINT}?${query}`;
  const rows = [];
  while (url) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Coin Metrics returned ${response.status}: ${await response.text()}`);
    const payload = await response.json();
    rows.push(...payload.data);
    url = payload.next_page_url || null;
  }
  return rows.sort((a, b) => day(dateOf(a)) - day(dateOf(b)));
}

function dailyPrice(rows) {
  const manualDiscovery = [
    ["2009-10-05", 0.00076],
    ["2010-02-06", 0.003],
    ["2010-05-22", 0.0043],
    ["2010-07-17", 0.08],
  ];
  const byDate = new Map(manualDiscovery);
  for (const row of rows) {
    const price = number(row.PriceUSD);
    if (price !== null && price > 0 && day(dateOf(row)) > day("2010-07-17")) {
      byDate.set(dateOf(row), significant(price, 10));
    }
  }
  return [...byDate].sort((a, b) => day(a[0]) - day(b[0]));
}

function rollingSeries(rows, windowDays, valueForWindow, cadenceDays = 1) {
  const valid = rows.filter(row => valueForWindow([row]) !== null);
  const result = [];
  for (let i = 0; i < valid.length; i++) {
    const current = valid[i];
    const cutoff = day(dateOf(current)) - (windowDays - 1) * DAY;
    let start = i;
    while (start > 0 && day(dateOf(valid[start - 1])) >= cutoff) start--;
    const value = valueForWindow(valid.slice(start, i + 1));
    if (value === null) continue;
    const elapsed = Math.round((day(dateOf(current)) - day(dateOf(valid[0]))) / DAY);
    if (result.length === 0 || elapsed % cadenceDays === 0 || i === valid.length - 1) {
      result.push([dateOf(current), significant(value, 9)]);
    }
  }
  return result;
}

function smoothedHash(rows) {
  return rollingSeries(rows, 14, window => {
    const values = window.map(row => number(row.HashRate)).filter(value => value !== null && value > 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length * 1e12;
  });
}

const RETARGET_ENDPOINT = "https://mempool.space/api/v1/mining/difficulty-adjustments/all";

async function fetchRetargets() {
  const response = await fetch(RETARGET_ENDPOINT, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`mempool.space returned ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 400) throw new Error("mempool.space returned too few difficulty adjustments");
  return rows.map(([timestamp, height, value]) => ({ timestamp, height, value })).sort((a, b) => a.timestamp - b.timestamp);
}

// Bitcoin's difficulty is a step function: one value per 2016-block epoch, held exactly
// until the next retarget. Storing one point per retarget is the whole truth, and the
// game reads it with stepAt() rather than interpolating between the steps.
function difficulty(retargets) {
  const cutoff = day(END);
  const points = [];
  let previous = null;
  for (const { timestamp, height, value } of retargets) {
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (day(date) > cutoff) break;
    if (!Number.isFinite(value) || value <= 0) throw new Error(`Bad difficulty at height ${height}`);
    if (previous !== null && (value / previous > 4.000001 || value / previous < 0.2499)) {
      throw new Error(`Difficulty at height ${height} moves outside the protocol's 4x clamp`);
    }
    previous = value;
    if (points.length && points[points.length - 1][0] === date) points[points.length - 1][1] = significant(value, 9);
    else points.push([date, significant(value, 9)]);
  }
  return points;
}

// Fee RATES, in satoshis per virtual byte, as mempool.space publishes them per day: the
// median and the 90th percentile of what the day's blocks actually paid. The older series
// above is a fee TOTAL per block, which cannot say what a transaction of a given size cost
// or what paying to jump the queue cost; these can. They are whole sat/vB as published, so
// a day on which most transactions paid less than one reads zero.
const FEERATE_ENDPOINT = "https://mempool.space/api/v1/mining/blocks/fee-rates/all";

async function fetchFeeRates() {
  const response = await fetch(FEERATE_ENDPOINT, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`mempool.space returned ${response.status}: ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length < 6000) throw new Error("mempool.space returned too few daily fee-rate rows");
  return rows;
}

function feeRateSeries(rows, field) {
  const cutoff = day(END);
  const byDate = new Map();
  for (const row of rows) {
    const date = new Date(row.timestamp * 1000).toISOString().slice(0, 10);
    const value = Number(row[field]);
    if (day(date) > cutoff || !Number.isFinite(value) || value < 0) continue;
    byDate.set(date, Math.round(value * 100) / 100);
  }
  return [...byDate].sort((a, b) => day(a[0]) - day(b[0]));
}

// The height of each retarget, beside the difficulty it set, and the four halvings with the
// UTC instant of the block that triggered them. A halving "date" in this game is the UTC
// date of block 210,000 x n; keeping the block's own timestamp is what makes that checkable.
function retargetHeights(retargets) {
  const cutoff = day(END);
  const points = [];
  for (const { timestamp, height } of retargets) {
    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
    if (day(date) > cutoff) break;
    if (points.length && points[points.length - 1][0] === date) points[points.length - 1][1] = height;
    else points.push([date, height]);
  }
  return points;
}

async function fetchHalvings() {
  const out = [];
  for (const height of [210000, 420000, 630000, 840000]) {
    const hash = (await (await fetch(`https://mempool.space/api/block-height/${height}`)).text()).trim();
    const block = await (await fetch(`https://mempool.space/api/block/${hash}`)).json();
    if (block.height !== height) throw new Error(`mempool.space returned block ${block.height} for height ${height}`);
    out.push({ height, time: block.timestamp, utc: new Date(block.timestamp * 1000).toISOString() });
  }
  return out;
}

function smoothedFees(rows) {
  const valid = rows.filter(row => number(row.FeeTotNtv) !== null && number(row.BlkCnt) > 0);
  const selected = new Set();
  const rolling = [];
  for (let i = 0; i < valid.length; i++) {
    const cutoff = day(dateOf(valid[i])) - 6 * DAY;
    let start = i;
    while (start > 0 && day(dateOf(valid[start - 1])) >= cutoff) start--;
    const window = valid.slice(start, i + 1);
    const fees = window.reduce((sum, row) => sum + number(row.FeeTotNtv), 0);
    const blocks = window.reduce((sum, row) => sum + number(row.BlkCnt), 0);
    rolling.push(blocks > 0 ? fees / blocks : null);
    const elapsed = Math.round((day(dateOf(valid[i])) - day(dateOf(valid[0]))) / DAY);
    selected.add(i);
    const daily = number(valid[i].FeeTotNtv) / number(valid[i].BlkCnt);
    if (daily > 0.5 && rolling[i] !== null && daily > rolling[i] * 2) {
      selected.add(Math.max(0, i - 1));
      selected.add(i);
      selected.add(Math.min(valid.length - 1, i + 1));
    }
  }
  return [...selected].sort((a, b) => a - b).map(i => [dateOf(valid[i]), significant(rolling[i] ?? 0, 8)]);
}

function smoothedTransactions(rows) {
  return rollingSeries(rows, 7, window => {
    const values = window.map(row => number(row.TxCnt)).filter(value => value !== null && value >= 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
}

// Market capitalisation anchors the order-book depth model. It is a slow, smooth series
// used only to scale trade impact, so a weekly cadence carries it at a fraction of the
// storage a daily one would cost. Recorded, not derived: this is CapMrktCurUSD as reported.
function marketCap(rows) {
  return rollingSeries(rows, 7, window => {
    const values = window.map(row => number(row.CapMrktCurUSD)).filter(value => value !== null && value > 0);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, 7);
}

function heights(rows) {
  const result = [[START, 0]];
  // Block height is zero-based while BlkCnt is a count, so Genesis contributes
  // one observed block but leaves the displayed height at zero.
  let height = -1;
  let firstDate = null;
  for (let i = 0; i < rows.length; i++) {
    const blocks = number(rows[i].BlkCnt);
    if (blocks !== null && blocks > 0) height += Math.round(blocks);
    if (firstDate === null) firstDate = dateOf(rows[i]);
    const elapsed = Math.round((day(dateOf(rows[i])) - day(firstDate)) / DAY);
    result.push([dateOf(rows[i]), Math.max(0, height)]);
  }
  return result.filter((entry, index, list) => index === 0 || entry[0] !== list[index - 1][0]);
}


// Half of this bundle used to be ISO date strings sitting beside numbers that were
// often smaller than the date. A regular series only needs its start and its cadence;
// the handful of off-cadence points ride along in `extra`. Values are untouched.
function encodeSeries(pairs) {
  if (pairs.length < 3) return { pairs };
  const gaps = pairs.slice(1).map((entry, i) => Math.round((day(entry[0]) - day(pairs[i][0])) / DAY));
  const tally = new Map();
  for (const gap of gaps) tally.set(gap, (tally.get(gap) || 0) + 1);
  const [step, hits] = [...tally].sort((a, b) => b[1] - a[1])[0];
  if (step < 1 || hits / gaps.length < 0.6) return { pairs };
  const onGrid = new Map(pairs.map(([date, value]) => [day(date), value]));
  const extra = [];
  const values = [];
  for (let t = day(pairs[0][0]); t <= day(pairs[pairs.length - 1][0]); t += step * DAY) {
    values.push(onGrid.has(t) ? onGrid.get(t) : null);
    onGrid.delete(t);
  }
  for (const [t, value] of onGrid) extra.push([new Date(t).toISOString().slice(0, 10), value]);
  extra.sort((a, b) => day(a[0]) - day(b[0]));
  while (values.length && values[values.length - 1] === null) values.pop();
  const encoded = { start: pairs[0][0], step, v: values };
  if (extra.length) encoded.extra = extra;
  return JSON.stringify(encoded).length < JSON.stringify(pairs).length ? encoded : { pairs };
}

// Emitted alongside the data so window.HISTORICAL_DATA keeps the exact shape the engine
// has always read: nothing downstream needs to know the file is compressed.
const DECODER = [
  "var DAY=86400000;",
  "function at(d){return Date.parse(d+\"T00:00:00Z\")}",
  "function iso(t){return new Date(t).toISOString().slice(0,10)}",
  "function decode(s){",
  "if(!s||Array.isArray(s))return s||[];",
  "if(s.pairs)return s.pairs;",
  "var out=[],t=at(s.start),i=0;",
  "for(;i<s.v.length;i++,t+=s.step*DAY)if(s.v[i]!==null)out.push([iso(t),s.v[i]]);",
  "if(s.extra)out=out.concat(s.extra).sort(function(a,b){return at(a[0])-at(b[0])});",
  "return out}",
].join("");

function renderBundle(payload) {
  const encoded = { meta: payload.meta };
  for (const [key, value] of Object.entries(payload)) {
    if (key !== "meta") encoded[key] = encodeSeries(value);
  }
  return [
    '"use strict";',
    "/* Generated by scripts/build-historical-data.mjs. Do not edit by hand. */",
    "(function(){",
    DECODER,
    `var raw=${JSON.stringify(encoded)};`,
    "var data={meta:raw.meta};",
    'for(var k in raw)if(k!=="meta")data[k]=decode(raw[k]);',
    "window.HISTORICAL_DATA=data;",
    "})();",
    "",
  ].join("\n");
}

function render(data, halvings = []) {
  const generated = new Date().toISOString();
  return renderBundle({
    meta: {
        source: "Coin Metrics Community Network Data · mempool.space difficulty adjustments, daily fee rates and halving blocks",
        sourceUrl: "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics",
        difficultySourceUrl: RETARGET_ENDPOINT,
        feeRateSourceUrl: FEERATE_ENDPOINT,
        halvings,
        generated,
        through: END,
        transforms: {
          price: "daily recorded PriceUSD after market launch; four manual discovery anchors before coverage",
          hash: "14-day trailing mean of recorded daily HashRate, recorded daily",
          difficulty: "one exact value per 2016-block retarget, held until the next one; the protocol changes it nowhere else",
          fees: "seven-day total fees divided by seven-day blocks, recorded daily",
          transactions: "seven-day trailing mean of recorded TxCnt, recorded daily",
          height: "cumulative recorded daily block count, recorded daily",
          cap: "seven-day trailing mean of recorded CapMrktCurUSD, recorded weekly",
          feeRate: "median sat/vB paid by each day's blocks, as published by mempool.space, whole sat/vB, recorded daily",
          feeRateHigh: "90th-percentile sat/vB paid by each day's blocks: what jumping the queue cost, recorded daily",
          retargetHeight: "block height of each difficulty retarget, one per retarget",
        },
    },
    ...data,
  });
}

// Re-encodes the bundle already on disk without touching the network, so a storage
// change can be proved value-for-value against the file it replaces.
if (process.argv.includes("--recompress")) {
  const existing = readFileSync(OUTPUT, "utf8");
  const context = { window: {} };
  vm.runInNewContext(existing, context);
  const payload = context.window.HISTORICAL_DATA;
  if (!payload) throw new Error("Could not read the existing bundle");
  await writeFile(OUTPUT, renderBundle(payload), "utf8");
  const after = { window: {} };
  vm.runInNewContext(readFileSync(OUTPUT, "utf8"), after);
  for (const key of Object.keys(payload)) {
    if (key === "meta") continue;
    if (JSON.stringify(payload[key]) !== JSON.stringify(after.window.HISTORICAL_DATA[key])) {
      throw new Error(`${key} does not decode back to the values it was given`);
    }
  }
  console.log("re-encoded; every series decodes back identically");
  process.exit(0);
}

// Adds or refreshes only the fee-rate, retarget-height and halving data in the existing
// bundle, so introducing them cannot quietly pull revisions into price, hash, fees or height.
if (process.argv.includes("--feerates-only")) {
  const existing = readFileSync(OUTPUT, "utf8");
  const context = { window: {} };
  vm.runInNewContext(existing, context);
  const payload = context.window.HISTORICAL_DATA;
  if (!payload) throw new Error("Could not read the existing bundle");
  const feeRows = await fetchFeeRates();
  const retargets = await fetchRetargets();
  payload.FEERATE = feeRateSeries(feeRows, "avgFee_50");
  payload.FEERATE_HIGH = feeRateSeries(feeRows, "avgFee_90");
  payload.RETARGET_HEIGHT = retargetHeights(retargets);
  payload.meta.halvings = await fetchHalvings();
  payload.meta.source = "Coin Metrics Community Network Data · mempool.space difficulty adjustments, daily fee rates and halving blocks";
  payload.meta.feeRateSourceUrl = FEERATE_ENDPOINT;
  payload.meta.transforms.feeRate = "median sat/vB paid by each day's blocks, as published by mempool.space, whole sat/vB, recorded daily";
  payload.meta.transforms.feeRateHigh = "90th-percentile sat/vB paid by each day's blocks: what jumping the queue cost, recorded daily";
  payload.meta.transforms.retargetHeight = "block height of each difficulty retarget, one per retarget";
  console.log(`FEERATE ${payload.FEERATE.length}, FEERATE_HIGH ${payload.FEERATE_HIGH.length}, RETARGET_HEIGHT ${payload.RETARGET_HEIGHT.length} points; halvings ${payload.meta.halvings.map(h => h.utc).join(" ")}`);
  await writeFile(OUTPUT, renderBundle(payload), "utf8");
  process.exit(0);
}

// Prints the latest COMPLETE UTC day that both sources publish: the last day before today on
// which Coin Metrics has every metric this bundle reads and mempool.space has a daily fee-rate
// row. Difficulty is a step function, so it needs no day of its own. Nothing is written.
if (process.argv.includes("--latest-end")) {
  const today = new Date().toISOString().slice(0, 10);
  const query = new URLSearchParams({
    assets: "btc",
    metrics: METRICS.join(","),
    frequency: "1d",
    start_time: new Date(day(today) - 45 * DAY).toISOString().slice(0, 10),
    page_size: "100",
  });
  const response = await fetch(`${ENDPOINT}?${query}`, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`Coin Metrics returned ${response.status}: ${await response.text()}`);
  const complete = (await response.json()).data
    .filter(row => dateOf(row) < today && METRICS.every(metric => number(row[metric]) !== null))
    .map(dateOf)
    .sort();
  const feeDays = (await fetchFeeRates())
    .map(row => new Date(row.timestamp * 1000).toISOString().slice(0, 10))
    .filter(date => date < today)
    .sort();
  if (!complete.length || !feeDays.length) throw new Error("A source has no complete day in the last 45 days");
  const latest = [complete.at(-1), feeDays.at(-1)].sort()[0];
  console.log(latest);
  process.exit(0);
}

// The weekly refresh. Keeps every point on or before the bundle's current cut-off exactly as it
// is and appends only the days after it, up to END, so a refresh cannot pull upstream revisions
// into history; scripts/check-data-refresh.mjs then proves that. The series are still computed
// from the full fetch so trailing means have their whole window. Halvings and the source notes
// in meta are kept; only meta.through and meta.generated move.
if (process.argv.includes("--append")) {
  const existing = readFileSync(OUTPUT, "utf8");
  const context = { window: {} };
  vm.runInNewContext(existing, context);
  const payload = context.window.HISTORICAL_DATA;
  if (!payload) throw new Error("Could not read the existing bundle");
  const previous = payload.meta.through;
  if (day(END) <= day(previous)) throw new Error(`--append needs an END after the current cut-off ${previous}; got ${END}`);
  const rows = await fetchRows();
  if (!rows.length) throw new Error("Coin Metrics returned no BTC rows");
  const feeRows = await fetchFeeRates();
  const retargetRows = await fetchRetargets();
  const next = {
    PRICE: dailyPrice(rows),
    HASH: smoothedHash(rows),
    DIFFICULTY: difficulty(retargetRows),
    FEES: smoothedFees(rows),
    TX: smoothedTransactions(rows),
    HEIGHT: heights(rows),
    CAP: marketCap(rows),
    FEERATE: feeRateSeries(feeRows, "avgFee_50"),
    FEERATE_HIGH: feeRateSeries(feeRows, "avgFee_90"),
    RETARGET_HEIGHT: retargetHeights(retargetRows),
  };
  const added = {};
  for (const [key, series] of Object.entries(next)) {
    const kept = (payload[key] || []).filter(([date]) => date <= previous);
    const fresh = series.filter(([date]) => date > previous);
    payload[key] = [...kept, ...fresh];
    added[key] = fresh.length;
  }
  payload.meta.through = END;
  payload.meta.generated = new Date().toISOString();
  await writeFile(OUTPUT, renderBundle(payload), "utf8");
  console.log(JSON.stringify({ previous, through: END, added }));
  process.exit(0);
}

const difficultyOnly = process.argv.includes("--difficulty-only");
if (difficultyOnly) {
  // Rewrites only the DIFFICULTY array in the existing bundle, so a targeted accuracy
  // fix cannot quietly pull unrelated revisions into every other series.
  const existing = readFileSync(OUTPUT, "utf8");
  const payload = JSON.parse(existing.slice(existing.indexOf("{"), existing.lastIndexOf("}") + 1));
  const next = difficulty(await fetchRetargets());
  console.log(`DIFFICULTY ${payload.DIFFICULTY.length} -> ${next.length} points`);
  payload.DIFFICULTY = next;
  payload.meta.source = "Coin Metrics Community Network Data · mempool.space difficulty adjustments";
  payload.meta.difficultySourceUrl = RETARGET_ENDPOINT;
  payload.meta.transforms.difficulty = "one exact value per 2016-block retarget, held until the next one; the protocol changes it nowhere else";
  await writeFile(OUTPUT, renderBundle(payload), "utf8");
  process.exit(0);
}

// Adds or refreshes only the CAP series in the existing bundle, so introducing the depth
// model cannot quietly pull unrelated revisions into price, hash, fees or height.
if (process.argv.includes("--cap-only")) {
  const existing = readFileSync(OUTPUT, "utf8");
  const context = { window: {} };
  vm.runInNewContext(existing, context);
  const payload = context.window.HISTORICAL_DATA;
  if (!payload) throw new Error("Could not read the existing bundle");
  const next = marketCap(await fetchRows());
  if (!next.length) throw new Error("Coin Metrics returned no market cap rows");
  console.log(`CAP ${(payload.CAP || []).length} -> ${next.length} points`);
  payload.CAP = next;
  payload.meta.transforms.cap = "seven-day trailing mean of recorded CapMrktCurUSD, recorded weekly";
  await writeFile(OUTPUT, renderBundle(payload), "utf8");
  process.exit(0);
}

const rows = await fetchRows();
if (!rows.length) throw new Error("Coin Metrics returned no BTC rows");
const feeRows = await fetchFeeRates();
const retargetRows = await fetchRetargets();
const data = {
  PRICE: dailyPrice(rows),
  HASH: smoothedHash(rows),
  DIFFICULTY: difficulty(retargetRows),
  FEES: smoothedFees(rows),
  TX: smoothedTransactions(rows),
  HEIGHT: heights(rows),
  CAP: marketCap(rows),
  FEERATE: feeRateSeries(feeRows, "avgFee_50"),
  FEERATE_HIGH: feeRateSeries(feeRows, "avgFee_90"),
  RETARGET_HEIGHT: retargetHeights(retargetRows),
};
await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, render(data, await fetchHalvings()), "utf8");
console.log(Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value.length])));
