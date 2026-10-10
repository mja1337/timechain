/* THE TUTORIAL'S GUARANTEE - a player can never be on a tutorial step that following its card cannot finish.

   Played headlessly against the real engine with its own random stream (mulberry32, seeded per run) so the game's
   stream is never touched. Each run starts a game on one of many dates (Genesis to the end of the record, and sandbox
   futures), either as a new run or as a replay on an established save, and plays the tutorial while a randomised
   "player" interferes: ordering extra signers, draining cash to almost nothing, unassigning and reassigning keys,
   moving backups and devices about, changing the reserve's rule and where income lands, pressing Back and Next,
   reloading the save, opening chapters and bills on top of the card, a fire at the mine while a delivery is on its
   way, and now and then the run ending under it.

   At every point it asserts that the current step has something to do that progresses it: a modal to close, Next on
   a step that is done, a wait that is real (something is on its way, the clock is allowed to run and is running), or
   the card's action, which must change the game. After the interference stops it follows the card's instructions
   only, and asserts that the tutorial finishes with the wallet set up end to end and the signer's hold spent or
   handed back. Used by check-ui-contracts; runnable alone: node scripts/tutorial-guarantee.mjs [tour.js path]. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine, makeEval } from "./engine-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Genesis, each start mode's date, mid-history dates, the last days of the record, and sandbox futures.
export const TOUR_DATES = ["2009-01-03", "2009-01-20", "2009-06-01", "2010-01-15", "2010-07-20", "2011-06-30", "2012-03-01", "2012-11-28",
  "2013-04-10", "2014-02-25", "2015-08-01", "2016-07-09", "2017-08-01", "2017-12-17", "2018-12-15", "2019-06-01", "2020-05-11",
  "2021-04-14", "2022-06-18", "2023-03-10", "2024-04-20", "2026-03-01", "2026-09-25", "2026-10-03", "2026-10-05",
  "sandbox:2028-01-01", "sandbox:2035-06-01", "sandbox:2060-01-01"];

const PLACES = ["site", "home", "bank", "trusted"];

export function runTutorialGuarantee({ tourSource, treasurySource, seedsPerCase = 16, maxSteps = 400, log = null } = {}) {
  tourSource ??= fs.readFileSync(path.join(ROOT, "src/ui/tour.js"), "utf8");
  treasurySource ??= fs.readFileSync(path.join(ROOT, "src/ui/tabs/treasury.js"), "utf8");
  const sb = loadEngine();
  sb.addEventListener = () => {}; sb.scrollTo = () => {};
  const ev = makeEval(sb);
  vm.runInContext(treasurySource, sb);
  vm.runInContext(tourSource, sb);
  const missing = ["tourNextAction", "tourFirstOpen", "tourEscrow", "tourStartRefusal", "tourClockAllowed", "tourBrowsing"].filter(f => ev(`typeof ${f}`) !== "function");
  const res = { clean: 0, scenarios: 0, actions: 0, interferences: 0, completed: 0, refused: 0, endedWithRun: 0, honestStops: 0, provided: 0, skipped: 0, failures: [] };
  if (missing.length) { res.failures.push(`The tutorial has no ${missing.join(", ")}: it cannot say what the next action on a step is`); return res; }
  const J = expr => JSON.parse(ev(`JSON.stringify(${expr})`));
  const tryEv = code => { try { ev(code); } catch (e) { return String(e && e.message || e); } return ""; };

  // What the tutorial says about where the player is.
  const look = () => J(`(()=>{const t=tourState(),s=tourStep(),b=tourBlocked();let a=null;
      if(!b&&!s.center&&!tourDone(s)){const x=tourNextAction(s);a=x?{wait:!!x.wait,label:x.label||"",hint:x.hint||"",run:typeof x.run==="function"}:null}
      return {active:tourActive(),on:!!t.active,id:s.id,center:!!s.center,finish:!!s.finish,done:tourDone(s),browsing:tourBrowsing(),blocked:b,act:a,
        clock:tourClockAllowed(),speed:state.speed,pending:state.custody.orders.length+custodyMoves().length,
        canAdvance:[...state.custody.orders,...custodyMoves()].some(o=>o.due<(state.sandbox?SANDBOX_END:END)),ended:!!state.ended,escrow:tourEscrow(),cash:state.cash,ahead:tourFirstOpen()>=0&&t.step>tourFirstOpen()}})()`);
  const fingerprint = () => ev(`JSON.stringify([state.custody,poolAccount().destination,state.tour.payoutKept,state.speed,state.cash,state.tour.escrow])`);
  const walletSetUp = () => J(`(()=>{const set=custodySetup();return {hot:typeof hotKey!=="function"||!hotKey()||hotKeyBackedUp(),ready:set.ready,
      assignedBacked:custodyAssignedKeys().every(tourBacked),atMine:tourBackupsAtMine().length,payout:poolAccount().destination==="cold"||!!state.tour.payoutKept,
      escrow:tourEscrow()}})()`);

  // Closes whatever is on top of the card, as the player would.
  const closeModal = () => tryEv(`if(state.pendingSettlement){try{deferSettlement()}catch(e){};if(state.pendingSettlement){try{liquidateForSettlement()}catch(e){}};if(state.pendingSettlement)state.pendingSettlement=null}
      while(typeof pendingLoss==="function"&&pendingLoss()){const n=lossQueue().length;try{dismissLoss()}catch(e){};if(lossQueue().length>=n)break}
      if(state.activeEvent){state.activeEvent=null}`);

  /* A free signer only on the tutorial's signer step, with no usable signer, no reserve key, nothing of the player's on
     its way that could be hurried, and cash plus the hold short of a signer. Hurrying only ever moves the player's own. */
  const provPre = () => J(`({p:state.tour.provided|0,dev:state.custody.devices.length,active:tourActive(),needs:tourNeedsSigner(),
      late:state.custody.orders.some(o=>custodyProduct(o.id)?.kind==="signer")||custodyMoves().some(m=>m.kind==="device"),
      short:state.cash+tourEscrow()<tourSignerCost(),usable:tourSigners().filter(d=>!d.keyId).length})`);
  const provPost = (pre, where) => {
    const now = J(`({p:state.tour.provided|0,dev:state.custody.devices.length,tagged:state.custody.devices.filter(d=>d.tourProvided).length})`);
    if (now.p === pre.p) return "";
    res.provided += now.p - pre.p;
    if (now.p - pre.p !== 1) return `${where}: ${now.p - pre.p} free signers at once`;
    if (!(pre.needs && pre.short && !pre.late && pre.usable === 0)) return `${where}: a free signer was given when it was not needed: ${JSON.stringify(pre)}`;
    return "";
  };
  const audited = (code, where) => { const pre = provPre(); const out = tryEv(code); const bad = provPost(pre, where); if (out && /provided/.test(out)) return out; return bad; };

  const pick = (rng, list) => list.length ? list[Math.floor(rng() * list.length)] : null;
  const ids = () => J(`({signers:CUSTODY_PRODUCTS.filter(p=>p.kind==="signer"&&!p.build&&custodyProductAvailable(p)).map(p=>p.id),
      devices:state.custody.devices.filter(d=>!d.destroyed).map(d=>d.uid),keys:state.custody.keys.filter(k=>!k.retired).map(k=>k.id),
      cold:state.custody.keys.filter(k=>!k.hot&&!k.retired).map(k=>k.id),assigned:state.custody.assigned.slice(),
      backed:state.custody.keys.filter(k=>k.backup&&!k.backup.destroyed&&!k.retired).map(k=>k.id),dest:payoutDestinations().map(d=>d.id),
      events:EVENTS.filter(e=>e.imp===3).slice(0,40).map(e=>e.id)})`);

  // One random thing a player might do while the card is up.
  const interfere = (rng, here) => {
    const x = ids(), r = rng();
    const s = JSON.stringify;
    if (r < 0.10) return tryEv(`orderCustodyProduct(${s(pick(rng, x.signers))})`);
    if (r < 0.17) return tryEv(`state.cash=${Math.floor(rng() * 40)}`);
    if (r < 0.24) { const d = pick(rng, x.devices); return d ? tryEv(`inspectWorkshopDevice(${s(d)});prepareWorkshopDevice(${s(d)})`) : ""; }
    if (r < 0.29) { const d = pick(rng, x.devices); return d ? tryEv(`generateCustodyKey(${s(d)})`) : ""; }
    if (r < 0.34) { const k = pick(rng, x.keys); return k ? tryEv(`backupCustodyKey(${s(k)},"paperbackup")`) : ""; }
    if (r < 0.41) { const k = pick(rng, x.cold); return k ? tryEv(`assignCustodyKey(${s(k)})`) : ""; }
    if (r < 0.49) { const k = pick(rng, x.assigned); return k ? tryEv(`unassignCustodyKey(${s(k)})`) : ""; }
    if (r < 0.57) { const k = pick(rng, x.backed); return k ? tryEv(`moveCustodyItem("backup",${s(k)},${s(pick(rng, PLACES))})`) : ""; }
    if (r < 0.61) { const d = pick(rng, x.devices); return d ? tryEv(`moveCustodyItem("device",${s(d)},${s(pick(rng, PLACES))})`) : ""; }
    if (r < 0.65) return tryEv(rng() < 0.6 ? `if(!state.skills.includes("multisig"))state.skills.push("multisig");setCustodyPolicy("2of3")` : `setCustodyPolicy("single")`);
    if (r < 0.70) return tryEv(`setPayoutDestination(${s(pick(rng, x.dest))})`);
    if (r < 0.74) { const d = pick(rng, x.devices); return d ? tryEv(`setWorkshopClient(${s(d)},"chainSource","own")`) : ""; }
    if (r < 0.81) return tryEv(`tourAction(${s(pick(rng, ["tour-back", "tour-back", "tour-next", "tour-goto", "tour-do"]))})`);
    if (r < 0.87) return tryEv(`state=JSON.parse(JSON.stringify(state));normalizeTourState(state)`); // reload
    if (r < 0.91) { const e = pick(rng, x.events); return e ? tryEv(`state.activeEvent=${s(e)}`) : ""; }
    if (r < 0.93) return tryEv(`state.pendingSettlement={due:state.time,amount:Math.max(1,state.cash*0.1|0),label:"Test bill"}`);
    if (r < 0.95 && here.act && here.act.wait) // a fire at the mine while something is on its way
      return tryEv(`for(const k of state.custody.keys)if(k.backup&&!k.backup.destroyed&&custodyPlaceId(k.backup.place)==="site")k.backup.destroyed=true;
        for(const d of state.custody.devices)if(!d.destroyed&&d.place!=="transit"&&custodyPlaceId(d.place)==="site")d.destroyed=true`);
    if (r < 0.955) return tryEv(`state.ended=true;state.speed=0`);
    if (r < 0.96) return tryEv(`state.policyLock=state.policyLock||"Test ban";`);
    return tryEv(`for(let i=0;i<${1 + Math.floor(rng() * 3)};i++)tick(true)`); // days pass (the player pressed play from a modal, say)
  };

  const startRun = (rng, date, replay) => {
    const sandbox = date.startsWith("sandbox:"), day = sandbox ? date.slice(8) : date;
    const cash = 1500 + Math.floor(rng() * 4000);
    ev(`state=initialState();OPERATOR_ERAS.forEach(era=>state.operator.eras[era.id]={months:0,solvent:0,profitable:0,uptime:0,competitive:0});state.started=true;state.seed=state.rng=${1 + Math.floor(rng() * 2147483646)};state.cash=${cash};state.time=at(${JSON.stringify(day)});state.sandbox=${sandbox};
        state.campaignStart=state.time;state.lastMonth=new Date(state.time).toISOString().slice(0,7);
        state.walletSetup={done:false,step:0,rolls:[],keyHex:"",required:true,resumeSpeed:1};
        skipWalletSetup();recordWalletPaper();destroyWalletPaper();takeWalletOath();`);
    if (!replay) return true;
    // An established save: skip the tutorial, play about a little, then replay it from the footer with whatever cash is left.
    ev(`tourAction("tour-skip")`);
    for (let i = 0, n = 2 + Math.floor(rng() * 10); i < n; i++) { interfere(rng, {}); closeModal(); if (ev("state.ended")) ev("state.ended=false"); }
    ev(`state.speed=0;state.cash=${pick(rng, [0, 12, 120, 174, 175, 600, 5000])}`);
    { const bad = audited(`tourAction("tour-start")`, "replay start"); if (bad) res.failures.push(`${date} replay: ${bad}`); }
    if (!ev("tourState().active")) {
      // A replay is never refused, whatever the cash or the date.
      res.refused++;
      res.failures.push(`${date} replay: the tutorial refused to start ("${ev("tourStartRefusal()")}") with $${ev("state.cash")}`);
      return false;
    }
    return true;
  };

  let seed = 1;
  for (const date of TOUR_DATES) for (const replay of [false, true]) for (let k = 0; k < seedsPerCase; k++) {
    const rng = mulberry32(seed++ * 2654435761), tag = `${date}${replay ? " replay" : ""} seed ${seed - 1}`;
    res.scenarios++;
    if (!startRun(rng, date, replay)) continue;
    // The first run of each case is played straight, following the card only; it must finish the wallet.
    const clean = k === 0, chaos = clean ? 0 : Math.floor(rng() * 60), pInterfere = 0.2 + rng() * 0.6;
    let skippedHere = false, failed = "";
    for (let i = 0; i < maxSteps && !failed; i++) {
      { const bad = audited("tourCheck()", "check"); if (bad) { failed = bad; break; } }
      const h = look();
      if (!h.on) break;
      // THE INVARIANT: the current step always has a progressing action.
      if (h.active && !h.blocked && !h.center && !h.done && !h.browsing) {
        if (!h.act) failed = `step "${h.id}" has no next action`;
        else if (h.act.wait) {
          if (!(h.pending > 0)) failed = `step "${h.id}" waits for nothing`;
          else if (!h.clock || !(h.speed > 0)) failed = `step "${h.id}" waits with the clock held`;
          else if (!h.canAdvance) failed = `step "${h.id}" waits for something that arrives after time runs out`;
        } else if (!h.act.run || !h.act.label) failed = `step "${h.id}" has an action with no button`;
      }
      // The card is never ahead of a step that has come undone: it goes back and says so.
      if (!failed && h.active && !h.blocked && h.ahead) failed = `step "${h.id}" is shown while an earlier step is not done`;
      if (failed) break;
      if (i < chaos && rng() < pInterfere) {
        res.interferences++;
        { const pre = provPre(); interfere(rng, h); const bad = provPost(pre, "interference"); if (bad) { failed = bad; break; } }
        if (rng() < 0.01 && ev("tourState().active")) { ev(`tourAction("tour-skip")`); skippedHere = true; }
        // If that finished or ended the tutorial, the checks after the loop say whether it was allowed to.
        continue;
      }
      // Following the card.
      res.actions++;
      if (h.blocked) { closeModal(); continue; }
      if (h.center || h.done || h.browsing) { ev(`tourAction("tour-next")`); continue; }
      if (h.act.wait) { ev("tick(true)"); continue; }
      const fp = fingerprint();
      { const bad = audited(`tourAction("tour-do")`, "card button"); if (bad) { failed = bad; break; } }
      if (fingerprint() === fp) failed = `on step "${h.id}", "${h.act.label.replace(/<[^>]+>/g, "")}" did nothing`;
    }
    const t = J(`({on:!!state.tour.active,done:!!state.tour.done,why:state.tour.endedWhy||"",ended:!!state.ended,escrow:tourEscrow()})`);
    if (!failed && t.on) failed = `the tutorial did not finish in ${maxSteps} actions (on "${ev("tourStep().id")}")`;
    if (!failed && t.escrow !== 0) failed = `the tutorial ended holding ${t.escrow} of the player's cash`;
    if (!failed) {
      if (skippedHere) res.skipped++;
      else if (t.ended) res.endedWithRun++;
      else if (t.why) { res.honestStops++; failed = `the tutorial stopped itself: "${t.why}"`; }
      else {
        const w = walletSetUp();
        if (!(w.hot && w.ready && w.assignedBacked && w.atMine === 0 && w.payout)) failed = `the tutorial finished with the wallet not set up: ${JSON.stringify(w)}`;
        else res.completed++;
        if (clean) res.clean++;
      }
    }
    if (!failed && clean && !replay && ev("state.tour.active||!state.tour.done||state.ended")) failed = "a run that only followed the card did not finish";
    if (!failed && clean && !replay && !(walletSetUp().ready)) failed = "a run that only followed the card finished without a ready wallet";
    if (failed) { res.failures.push(`${tag}: ${failed}`); if (log) log(`${tag}: ${failed}`); }
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ? fs.readFileSync(process.argv[2], "utf8") : undefined;
  const t0 = Date.now();
  const r = runTutorialGuarantee({ tourSource: src, seedsPerCase: Number(process.env.SEEDS || 16) });
  console.log(JSON.stringify({ ...r, failures: r.failures.length, sample: r.failures.slice(0, 15), ms: Date.now() - t0 }, null, 1));
  process.exit(r.failures.length ? 1 : 0);
}
