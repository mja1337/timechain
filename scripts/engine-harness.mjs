/* HEADLESS ENGINE - loads the data and engine scripts into a vm context with just enough
   browser shims to run them, so the game's rules can be exercised and measured without a
   browser. Read-only: it never writes to the repo.

   This exists because contracts that match source text pin the implementation rather than
   the behaviour. A check that greps for `h.cost*retained*market*glut` breaks the moment that
   expression moves, even when nothing about the game changed. Running the engine and
   asserting what it DOES survives any refactor that preserves the rules, which is the only
   thing a contract should care about.

   Top-level `const` in a vm context does not become a property of the sandbox, so reach the
   engine's values through makeEval() rather than by property access.

     const ev = makeEval(loadEngine());
     ev(`subsidyAt(at("2009-01-03"))`)   // 50

*/
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = [
  "historical-data.js",
  "src/config/timeline.js",
  "src/data/network.js",
  "src/data/rivals.js",
  "src/data/hardware.js",
  "src/data/operations.js",
  "src/data/progression.js",
  "src/data/content.js",
  "src/data/events.js",
  "src/data/event-reactions.js",
  "src/data/custody.js",
  "src/data/glossary.js",
  "src/engine/history.js",
  "src/engine/immersion.js",
  "src/engine/connectivity.js",
  "src/engine/offline.js",
  "src/engine/thermal.js",
  "src/engine/fleet-ops.js",
  "src/engine/secondary.js",
  "src/engine/nodes.js",
  "src/engine/operator.js",
  // Before simulation.js, matching index.html - see the note in render-queue.js.
  "src/engine/render-queue.js",
  "src/engine/save-guard.js",
  "src/engine/simulation.js",
  "src/engine/event-effects.js",
  "src/engine/settlement.js",
  "src/engine/custody.js",
  "src/engine/payouts.js",
  "src/engine/signing.js",
  "src/engine/treasury.js",
  "src/engine/losses.js",
  "src/engine/places.js",
  "src/engine/hotkey.js",
  "src/engine/keyholders.js",
  "src/engine/workshop.js",
  "src/engine/credit.js",
  "src/engine/correspondence.js",
  "src/engine/lending.js",
  "src/engine/facilities.js",
  "src/engine/maintenance.js",
  "src/engine/pools.js",
  "src/engine/actions.js",
  /* The price chart is a UI module, but the property worth guarding - that it never samples
     past the simulation's own clock - is pure data and testable without a DOM. */
  "src/ui/enhance/price-chart.js",
];

/* `seedSave` writes a save into the shimmed localStorage BEFORE the scripts run, so the
   load-time migration executes against it exactly as it would in the browser - including the
   part of it that only runs for old save shapes, which is where a load-order bug can hide
   until a real player opens a real save. */
export function loadEngine(seedSave = null, rawSave = null) {
  const noop = () => {};
  const store = {};
  if (seedSave) store["hashrate-genesis-save-v1"] = JSON.stringify(seedSave);
  // Text stored exactly as given, for saves that are not valid JSON at all.
  if (rawSave !== null) store["hashrate-genesis-save-v1"] = rawSave;
  const sandbox = {
    console,
    Math, Date, JSON, Number, String, Object, Array, Boolean, Map, Set, WeakMap,
    BigInt, Uint8Array, Infinity, NaN, isFinite, isNaN, parseInt, parseFloat,
    setTimeout: (fn) => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    crypto: { getRandomValues: (buf) => { for (let i = 0; i < buf.length; i++) buf[i] = 0; return buf; } },
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    document: {
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, classList: { add: noop, remove: noop }, appendChild: noop, click: noop }),
      body: { classList: { add: noop, remove: noop } },
      addEventListener: noop,
    },
    // presentation/render helpers the engine calls but that live in unloaded UI files
    showToast: noop,
    render: noop, renderMineContent: noop, refreshLive: noop,
    refreshDashboardVisuals: noop, refreshMinePricing: noop,
    faucetMarkup: () => "",
    settlementRescueFeedback: () => null,
    recordCareerRun: noop,
    fmtUsd: (v) => "$" + Math.round(Number(v) || 0).toLocaleString("en-US"),
    fmtBtc: (v) => (Number(v) || 0).toFixed(8) + " BTC",
    fmtNum: (v) => String(Math.round(Number(v) || 0)),
    fmtHash: (v) => String(v),
    fmtJth: (v) => String(v),
    fmtSubsidy: (v) => String(v),
    fmtCompactNumber: (v) => String(v),
    formatPercent: (v) => String(v),
    dateFmt: (t) => new Date(t).toISOString().slice(0, 10),
    clamp: (v, lo, hi) => Math.min(hi, Math.max(lo, v)),
    actionFraction: () => 1,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), "utf8");
    try {
      vm.runInContext(code, sandbox, { filename: f });
    } catch (e) {
      console.error("FAILED in", f, e.message);
      throw e;
    }
  }
  return sandbox;
}

export function makeEval(sandbox) {
  return (expr) => vm.runInContext(expr, sandbox, { filename: "eval" });
}
