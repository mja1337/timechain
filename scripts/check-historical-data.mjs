import { readFile } from "node:fs/promises";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const source = await readFile(new URL("historical-data.js", root), "utf8");

new vm.Script(source, { filename: "historical-data.js" });
for (const match of html.matchAll(/<script src="([^"]+\.js)"><\/script>/gi)) {
  if (match[1] === "historical-data.js") continue;
  const script = await readFile(new URL(match[1], root), "utf8");
  new vm.Script(script, { filename: match[1] });
}

const context = { window: {} };
vm.runInNewContext(source, context);
const data = context.window.HISTORICAL_DATA;
if (!data) throw new Error("HISTORICAL_DATA was not defined");

const requirements = {
  PRICE: 5_000,
  HASH: 800,
  DIFFICULTY: 400,
  FEES: 900,
  TX: 800,
  HEIGHT: 800,
  CAP: 700,
  FEERATE: 6_000,
  FEERATE_HIGH: 6_000,
  RETARGET_HEIGHT: 400,
};

for (const [name, minimum] of Object.entries(requirements)) {
  const series = data[name];
  if (!Array.isArray(series) || series.length < minimum) throw new Error(`${name} has only ${series?.length ?? 0} points`);
  let previous = -Infinity;
  for (const [date, value] of series) {
    const time = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(time) || time <= previous) throw new Error(`${name} has an unordered or duplicate date at ${date}`);
    if (!Number.isFinite(value) || value < 0) throw new Error(`${name} has an invalid value at ${date}`);
    previous = time;
  }
  if (name === "DIFFICULTY" || name === "RETARGET_HEIGHT") {
    if (series.at(-1)[0] > data.meta.through) throw new Error(`${name} carries a retarget at ${series.at(-1)[0]}, past the ${data.meta.through} cutoff`);
    if (Date.parse(data.meta.through) - Date.parse(series.at(-1)[0]) > 21 * 86_400_000) throw new Error(`${name}'s last retarget is ${series.at(-1)[0]}, more than a fortnight before the ${data.meta.through} cutoff`);
  } else if (series.at(-1)[0] !== data.meta.through) {
    throw new Error(`${name} ends at ${series.at(-1)[0]}, expected ${data.meta.through}`);
  }
}

if (data.HEIGHT.some((entry, index) => index && entry[1] < data.HEIGHT[index - 1][1])) throw new Error("HEIGHT must be monotonic");
if (Math.max(...data.FEES.map(entry => entry[1])) <= 1) throw new Error("FEES did not retain high-fee periods");
if (data.DIFFICULTY[0][1] !== 1) throw new Error("DIFFICULTY must start at 1, the difficulty of the genesis epoch");
// Capitalisation anchors the order-book depth model, so it has to be monotonic in neither
// direction but must span the market's whole life and stay strictly positive.
if (data.CAP.some(entry => !(entry[1] > 0))) throw new Error("CAP carries a non-positive capitalisation");
if (data.CAP[0][0] > "2010-08-01") throw new Error(`CAP starts at ${data.CAP[0][0]}, too late to cover the market's opening`);
if (Math.max(...data.CAP.map(e => e[1])) < 1e12) throw new Error("CAP never reaches the trillion-dollar era, so it cannot be the recorded series");

/* The fee RATES, and the retarget heights and halving blocks that sit beside the difficulty. Recorded, so what has to
   hold is what the protocol and the arithmetic make true: the 90th percentile is never below the median, a retarget
   falls on a multiple of 2016 blocks, there is one height per difficulty step, and each halving is the block the
   subsidy schedule says it is, in order. */
const medianByDate = new Map(data.FEERATE);
for (const [date, high] of data.FEERATE_HIGH) {
  if (!(medianByDate.get(date) <= high)) throw new Error(`FEERATE_HIGH is below the median on ${date}`);
}
if (data.FEERATE_HIGH.length !== data.FEERATE.length) throw new Error("FEERATE and FEERATE_HIGH do not cover the same days");
if (Math.max(...data.FEERATE.map(e => e[1])) < 100) throw new Error("FEERATE never records a fee market, so it is not the recorded series");
if (data.RETARGET_HEIGHT.length !== data.DIFFICULTY.length) throw new Error("There is not one retarget height for each difficulty step");
data.RETARGET_HEIGHT.forEach(([date, height], i) => {
  if (height % 2016 !== 0) throw new Error(`The retarget on ${date} is at height ${height}, not a multiple of 2016`);
  if (date !== data.DIFFICULTY[i][0]) throw new Error(`Retarget ${i} is dated ${date}, but its difficulty step is dated ${data.DIFFICULTY[i][0]}`);
});
const halvings = data.meta.halvings || [];
if (halvings.length !== 4 || halvings.some((h, i) => h.height !== 210_000 * (i + 1) || (i && h.time <= halvings[i - 1].time))) throw new Error("meta.halvings must carry blocks 210,000, 420,000, 630,000 and 840,000 in order");
if (halvings.some(h => new Date(h.time * 1000).toISOString() !== h.utc)) throw new Error("A halving's time and its UTC instant disagree");
for (let i = 1; i < data.DIFFICULTY.length; i += 1) {
  const [date, value] = data.DIFFICULTY[i];
  const previous = data.DIFFICULTY[i - 1][1];
  if (value === previous) throw new Error(`DIFFICULTY repeats ${value} at ${date}; it should hold one value per retarget, not resample it`);
  const ratio = value / previous;
  if (ratio > 4.000001 || ratio < 0.2499) throw new Error(`DIFFICULTY at ${date} moves outside the protocol's 4x retarget clamp`);
}
const retargetGaps = data.DIFFICULTY.slice(1).map((entry, i) => Math.round((Date.parse(entry[0]) - Date.parse(data.DIFFICULTY[i][0])) / 86400000));
const typicalGap = retargetGaps.slice().sort((a, b) => a - b)[Math.floor(retargetGaps.length / 2)];
if (typicalGap < 10 || typicalGap > 18) throw new Error(`A 2016-block epoch runs about a fortnight; the median gap is ${typicalGap} days`);
const dailyPriceStart = data.PRICE.findIndex(([date]) => date === "2010-07-17");
for (let index = dailyPriceStart + 1; index < data.PRICE.length; index++) {
  const previous = Date.parse(`${data.PRICE[index - 1][0]}T00:00:00Z`);
  const current = Date.parse(`${data.PRICE[index][0]}T00:00:00Z`);
  if (current - previous > 86_400_000) throw new Error(`PRICE lost daily coverage after market launch at ${data.PRICE[index][0]}`);
}

console.log("Historical data and application JavaScript syntax checks passed");
console.table(Object.fromEntries(Object.entries(requirements).map(([name]) => [name, {
  points: data[name].length,
  first: data[name][0][0],
  last: data[name].at(-1)[0],
}])));
