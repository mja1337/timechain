"use strict";

/* RENDER SNAPSHOT - a structural fingerprint of every tab in a set of fixed game states.
   Load this in the running page and call `snapshotAll()`. It records the DOM skeleton -
   tag, sorted class list, data-action, disabled state, depth - for each tab under each
   fixture. It deliberately ignores text and numbers, so it is immune to live tick values
   and sensitive to exactly what a render refactor risks: elements going missing, being
   duplicated, being reordered, or losing their action wiring.

   Usage in the browser console (or via a driving tool):
     const before = snapshotAll();          // on the current build
     ... refactor ...
     const after  = snapshotAll();          // after reload
     snapshotDiff(before, after);           // [] when the DOM is structurally identical

   Determinism: every fixture starts from a complete pinned state, so a capture does not
   depend on how the page was used before it - the same code gives the same hashes on a fresh
   load, on a load with a save present, and after the live state has been churned. Call
   snapshotSelfCheck() to prove that rather than trust it. The only moving part is the
   dashboard mempool mosaic, which randomises its own cell classes every frame; those are
   normalised to a single token rather than excluded, so a change in cell COUNT still
   registers.

   This was not always true. The harness used to overwrite nine fields on the live state and
   inherit the rest, and reported 1,909, 1,914 or 1,922 nodes for the Mine tab depending on
   what had run before it - which nearly had a clean refactor reported as a regression. */

function snapshotSignature(root) {
  const host = root || document.getElementById("app");
  const lines = [];
  const walk = (el, depth) => {
    const raw = typeof el.className === "string" ? el.className : (el.className && el.className.baseVal) || "";
    const cls = raw.trim().split(/\s+/).filter(Boolean).sort().join(".");
    const act = el.dataset && el.dataset.action
      ? `[${el.dataset.action}${el.dataset.value ? "=" + el.dataset.value : ""}]`
      : "";
    let line = `${depth}|${el.tagName}${cls ? "." + cls : ""}${act}${el.disabled ? ":disabled" : ""}`;
    if (line.includes("mp-cell")) line = line.replace(/\|SPAN\.[^[]*mp-cell[^[]*/, "|SPAN.mp-cell~");
    lines.push(line);
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(host, 0);
  return lines;
}

/* Four states chosen to exercise different shapes of the interface: an empty early game, a
   mid-game fleet carrying faults, a large site in arrears with cooling on order, and a rich
   endgame at the cutoff. Between them they light up every conditional branch worth guarding. */
function snapshotFixtures() {
  const blankMaintenance = () => ({
    condition: {}, faults: {}, faultsByPart: {}, selfRepairs: {}, parts: 0,
    inventory: state.maintenance.inventory, orders: [], serviceJobs: [],
  });
  return [
    {
      name: "early-2010-home-laptop",
      apply() {
        state.time = at("2010-03-01"); state.facility = "home"; state.hardware = { laptop: 1 };
        state.cash = 1800; state.wallets = { hot: 12, cold: 3 }; state.mode = "solo";
        state.thermal = { temperature: 20, orders: [], equipment: {} };
        state.maintenance = blankMaintenance(); state.debt = 0; state.power = true;
      },
    },
    {
      name: "2017-warehouse-faults",
      apply() {
        state.time = at("2017-06-01"); state.facility = "warehouse"; state.hardware = { s9: 120 };
        state.cash = 250000; state.wallets = { hot: 4, cold: 2 }; state.mode = "pool"; state.pool = "slush";
        state.thermal = { temperature: 26, orders: [], equipment: { ahu: 1 } };
        state.maintenance = Object.assign(blankMaintenance(), {
          condition: { s9: 72 }, faults: { s9: 9 }, faultsByPart: { s9: { hashboard: 6, powerPcb: 3 } },
        });
        state.debt = 0; state.power = true;
      },
    },
    {
      name: "2021-campus-arrears",
      apply() {
        state.time = at("2021-06-01"); state.facility = "campus"; state.hardware = { s19: 600 };
        state.cash = 0; state.wallets = { hot: 1, cold: 0 }; state.mode = "pool";
        state.thermal = { temperature: 30, equipment: { ahu: 2 },
          orders: [{ id: "evap", qty: 1, due: state.time + 20 * DAY, cost: 420000 }] };
        state.maintenance = Object.assign(blankMaintenance(), {
          condition: { s19: 80 }, faults: { s19: 30 }, faultsByPart: { s19: { hashboard: 30 } },
        });
        state.debt = 18000; state.arrearsDue = state.time + 10 * DAY; state.power = true;
      },
    },
    {
      name: "2026-cutoff-rich",
      apply() {
        state.time = END - DAY * 3; state.facility = "megacampus"; state.hardware = { s21xp: 2000 };
        state.cash = 9e6; state.wallets = { hot: 40, cold: 120 }; state.mode = "pool";
        state.thermal = { temperature: 24, orders: [], equipment: { coolingtower: 1 } };
        state.maintenance = Object.assign(blankMaintenance(), { condition: { s21xp: 90 } });
        state.debt = 0; state.power = true;
      },
    },
  ];
}

const SNAPSHOT_TABS = ["dashboard", "mine", "pools", "market", "custody", "facilities",
  "energy", "finance", "learn", "tech", "ledger", "method"];

/* A complete, pinned state for every fixture to start from.

   This used to overwrite nine fields on whatever the live state happened to be and hand the
   rest through - so a capture depended on how the page had been used before it, and the same
   code reported 1,909, 1,914 or 1,922 nodes for the Mine tab depending on what had run
   first. A harness whose whole job is proving a render refactor changed nothing cannot
   itself change between runs.

   initialState() seeds itself from Math.random(), so the seed is pinned too, and the era
   table is filled the way resetGame() fills it rather than left half-built. */
function snapshotBaselineState() {
  const fresh = initialState();
  fresh.seed = 1; fresh.rng = 1;
  if (typeof OPERATOR_ERAS !== "undefined") {
    OPERATOR_ERAS.forEach(era => {
      fresh.operator.eras[era.id] = { months: 0, solvent: 0, profitable: 0, uptime: 0, competitive: 0 };
    });
  }
  fresh.started = true; fresh.ended = false; fresh.endReason = null; fresh.endDismissed = true;
  fresh.activeEvent = null; fresh.storyPause = false; fresh.shoppingPause = false;
  fresh.walletSetup = { done: true }; fresh.speed = 0; fresh.returnSpeed = 0; fresh.policyLock = null;
  fresh.skills = []; fresh.staff = []; fresh.seen = []; fresh.guidance = { dismissed: [] };
  fresh.hardwareAlerts = { active: null, queue: [], resumeSpeed: 0, seen: HARDWARE.map(h => h.id) };
  fresh.pendingSettlement = null; fresh.settlementSaleMode = false;
  fresh.ops = { firmwarePatchedUntil: 1e15, hijackUntil: 0, outageUntil: 0, powerOutageUntil: 0,
    venueFreezes: {}, riskMonth: "" };
  return fresh;
}

function snapshotAll() {
  const saved = JSON.parse(JSON.stringify(state));
  const savedTab = activeTab;
  const captured = {};
  try {
    for (const fixture of snapshotFixtures()) {
      state = snapshotBaselineState();
      fixture.apply();
      for (const tab of SNAPSHOT_TABS) {
        activeTab = tab;
        render(false);
        captured[`${fixture.name}/${tab}`] = snapshotSignature();
      }
    }
  } finally {
    state = JSON.parse(JSON.stringify(saved));
    activeTab = savedTab;
    render(false);
  }
  return captured;
}

/* Reports the first structural divergence per snapshot rather than every line, because a
   single inserted element shifts everything after it and the tail is noise. */
function snapshotDiff(before, after) {
  const differences = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const a = before[key], b = after[key];
    if (!a) { differences.push({ snapshot: key, change: "added" }); continue; }
    if (!b) { differences.push({ snapshot: key, change: "removed" }); continue; }
    if (a.join("\n") === b.join("\n")) continue;
    let index = 0;
    while (index < a.length && index < b.length && a[index] === b[index]) index += 1;
    differences.push({
      snapshot: key, change: "changed",
      nodesBefore: a.length, nodesAfter: b.length,
      firstDivergenceAt: index, before: a[index] || "(end)", after: b[index] || "(end)",
    });
  }
  return differences;
}

function snapshotHashes(captured) {
  const hash = text => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36);
  };
  const out = {};
  for (const key of Object.keys(captured)) out[key] = `${captured[key].length}:${hash(captured[key].join("\n"))}`;
  return out;
}

/* Proves the property the harness depends on: two captures either side of a deliberately
   churned live state must agree exactly. Run it before trusting a comparison. */
function snapshotSelfCheck() {
  const before = snapshotHashes(snapshotAll());
  const saved = JSON.parse(JSON.stringify(state));
  const savedTab = activeTab;
  state.time = at("2019-01-01"); state.hardware = { s17: 77 }; state.facility = "campus";
  state.cash = 123456; state.skills = ["undervolt", "firmware"]; state.staff = ["fieldtech"];
  state.wallets.hot = 9; state.debt = 4321; state.speed = 3; activeTab = "market";
  const after = snapshotHashes(snapshotAll());
  state = JSON.parse(JSON.stringify(saved));
  activeTab = savedTab;
  render(false);
  const drifted = Object.keys(before).filter(key => before[key] !== after[key]);
  return { snapshots: Object.keys(before).length, stable: drifted.length === 0, drifted };
}
