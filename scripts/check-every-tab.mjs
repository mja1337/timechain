/* EVERY TAB, IN A REAL BROWSER. The other checks build the game in a sandbox and test its
   rules; none of them opened every screen the way a player does. 1.2.5 shipped an Energy tab
   that threw on every visit ("density is not defined") and every one of them passed.

   This loads index.html in headless Chrome at desktop (1280x800) and phone (390x844) sizes and,
   in each of the render-snapshot fixtures (2010 laptop, 2017 warehouse, 2021 campus in arrears,
   2026 megacampus), opens every tab, every Treasury and Mine section and every drawer, the way
   the interface does: by clicking the button when there is one. It fails on any console error,
   uncaught exception, failed request, or a tab that does not draw.

   Nothing is hard-coded: the tab list is read from nav() and tabContent(), the sections from
   TREASURY_SECTIONS and MINE_SECTIONS, and the drawers from every action in events.js that opens
   a `...Open` flag. A new tab or drawer is covered without editing this file.

   Needs Playwright (`npm install --no-save playwright`). Uses Chrome at CHROME_PATH, or
   /usr/bin/google-chrome when present, or Playwright's own Chromium. Locally, point
   PLAYWRIGHT_MODULE at an installed copy if it is not resolvable from the repo. */
import { createServer } from "node:http";
import { readFile, access } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const src = f => readFile(join(root, f), "utf8");
const failures = [];
const fail = msg => failures.push(msg);

/* --- What to open, read from the source. --- */
const [dashboardJs, renderJs, treasuryJs, mineJs, eventsJs] = await Promise.all(
  ["src/ui/tabs/dashboard.js", "src/ui/render.js", "src/ui/tabs/treasury.js", "src/ui/tabs/mine.js", "src/app/events.js"].map(src));
const navList = [...((dashboardJs.match(/function nav\(\)\{\s*const tabs=\[([^\]]+)\]/) || [])[1] || "").matchAll(/"([\w-]+)"/g)].map(m => m[1]);
const contentBody = (renderJs.match(/function tabContent\(\)\{([\s\S]*?)\n\}/) || [])[1] || "";
const contentTabs = [...contentBody.matchAll(/if\(activeTab==="([\w-]+)"\)return/g)].map(m => m[1]);
const fallbackTab = (contentBody.match(/return (\w+)\(\)\s*$/) || [])[1];
const sectionsOf = (js, name) => [...(((js.match(new RegExp(`const ${name}=\\[([\\s\\S]*?)\\];`)) || [])[1]) || "").matchAll(/\{id:"([\w-]+)"/g)].map(m => m[1]);
const treasurySections = sectionsOf(treasuryJs, "TREASURY_SECTIONS");
const mineSections = sectionsOf(mineJs, "MINE_SECTIONS");
const drawers = [...new Map([...eventsJs.matchAll(/a==="([\w-]+)"\)\{(\w+Open)=(?:true|!\2)\b/g)].map(m => [m[1], m[2]])).entries()]
  .map(([action, flag]) => ({ action, flag }));
const tabs = [...new Set([...navList, ...contentTabs, ...(fallbackTab ? [fallbackTab] : [])])];
if (navList.length < 5) fail(`Could not read the tab list from nav(): ${JSON.stringify(navList)}`);
if (contentTabs.length < 5) fail(`Could not read the tabs tabContent() draws: ${JSON.stringify(contentTabs)}`);
if (!treasurySections.length || !mineSections.length) fail(`Could not read the Treasury/Mine sections: ${JSON.stringify({ treasurySections, mineSections })}`);
if (!drawers.length) fail("Could not find a single drawer action in events.js");
if (!tabs.includes("energy")) fail("The Energy tab is not in the tab list: the check that exists because of it would not open it");
if (failures.length) { console.error(failures.join("\n")); process.exit(1); }

/* --- Playwright and a browser. --- */
let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  const alt = process.env.PLAYWRIGHT_MODULE;
  if (!alt) { console.error("Playwright is not installed: npm install --no-save playwright (or set PLAYWRIGHT_MODULE)"); process.exit(1); }
  ({ chromium } = await import(pathToFileURL(join(alt, "index.mjs")).href));
}
let executablePath = process.env.CHROME_PATH;
if (!executablePath) { try { await access("/usr/bin/google-chrome"); executablePath = "/usr/bin/google-chrome"; } catch {} }

/* --- The game, served as GitHub Pages serves it. --- */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) throw new Error("outside");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" }); res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
let opened = 0;
const drawersOpened = new Set();
try {
  for (const [W, H] of [[1280, 800], [390, 844]]) {
    const size = `${W}x${H}`;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: W < 500, hasTouch: W < 500, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    let where = `${size} first load`;
    page.on("console", m => { if (m.type() === "error") fail(`${where}: console error: ${m.text().slice(0, 400)}`); });
    page.on("pageerror", e => fail(`${where}: uncaught ${e.name || "error"}: ${e.message.slice(0, 400)}`));
    page.on("requestfailed", q => fail(`${where}: request failed: ${q.url()}`));
    page.on("response", q => { if (q.status() >= 400) fail(`${where}: HTTP ${q.status()} ${q.url()}`); });
    const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => setTimeout(r, 40))));
    /* Run in a task of its own, so a throw is an uncaught page error, exactly as a click would be. */
    const act = (fn, arg) => page.evaluate(([code, a]) => new Promise(r => setTimeout(() => { try { (0, eval)(code)(a); } finally { r(); } }, 0)), [`(${fn})`, arg]).then(settle);
    const click = async sel => {
      const found = await page.evaluate(s => { const el = document.querySelector(s); return !!el && !el.disabled; }, sel);
      if (found) await act(s => document.querySelector(s).click(), sel);
      return found;
    };

    await page.goto(BASE);
    await page.evaluate(() => localStorage.clear());
    await page.reload(); await settle();
    if (!(await page.evaluate(() => (document.getElementById("app")?.textContent || "").trim().length > 50))) fail(`${size}: the first load drew nothing`);

    await page.addScriptTag({ url: BASE + "scripts/render-snapshot.js" });
    const fixtures = await page.evaluate(() => snapshotFixtures().map(f => f.name));
    for (let fi = 0; fi < fixtures.length; fi++) {
      const fx = fixtures[fi];
      where = `${size} ${fx} setup`;
      await act(i => { state = snapshotBaselineState(); snapshotFixtures()[i].apply(); activeTab = "dashboard"; render(false); }, fi);
      const drawn = async (label, expectKey) => {
        const r = await page.evaluate(() => ({ key: typeof activeTabKey === "function" ? activeTabKey() : activeTab, len: (document.querySelector(".content")?.textContent || "").trim().length }));
        if (expectKey && r.key !== expectKey) fail(`${where}: opened ${label} but the game shows ${r.key}`);
        if (r.len < 40) fail(`${where}: ${label} drew an empty page`);
        opened++;
      };
      for (const t of tabs) {
        where = `${size} ${fx} tab ${t}`;
        const viaButton = await click(`nav.tabs [data-action="tab"][data-value="${t}"]`);
        if (!viaButton) await act(id => { activeTab = openTab(id); render(false); }, t);
        await drawn(t, treasurySections.includes(t) ? t : (t === "treasury" ? null : t));
      }
      for (const [parent, action, list] of [["treasury", "treasury-section", treasurySections], ["mine", "mine-section", mineSections]]) {
        await act(id => { activeTab = openTab(id); render(false); }, parent);
        for (const s of list) {
          where = `${size} ${fx} ${parent} section ${s}`;
          if (!(await click(`[data-action="${action}"][data-value="${s}"]`))) fail(`${where}: no ${action} button for ${s}`);
          await drawn(`${parent}/${s}`);
        }
      }
      for (const d of drawers) {
        where = `${size} ${fx} drawer ${d.action}`;
        /* Opened from wherever the interface offers it: the header on any tab, or a tab's own page. */
        let found = false;
        for (const t of tabs) {
          await act(id => { activeTab = openTab(id); render(false); }, t);
          if ((found = await click(`[data-action="${d.action}"]`))) break;
        }
        if (!found) continue; // not offered at this size
        const open = await page.evaluate(f => (0, eval)(f), d.flag);
        if (!open) fail(`${where}: clicking it did not open ${d.flag}`);
        drawersOpened.add(d.action);
        if (d.flag === "mobileMenuOpen") {
          const sections = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-action="mobile-menu-section"]')].map(b => b.dataset.value))]);
          for (const s of sections) { where = `${size} ${fx} mobile menu ${s}`; await click(`[data-action="mobile-menu-section"][data-value="${s}"]`); opened++; }
        }
        opened++;
        await act(flags => { flags.forEach(f => (0, eval)(`${f}=false`)); render(false); }, drawers.map(x => x.flag));
      }
    }
    await ctx.close();
  }
  for (const d of drawers) if (!drawersOpened.has(d.action)) fail(`The ${d.action} drawer was never offered at either size, so it was never opened`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  const unique = [...new Set(failures)];
  console.error(`Every-tab check FAILED (${unique.length} problem${unique.length === 1 ? "" : "s"}):\n  ${unique.slice(0, 40).join("\n  ")}`);
  process.exit(1);
}
console.log(`Every tab: ${tabs.length} tabs (${tabs.join(", ")}), ${treasurySections.length + mineSections.length} sections and ${drawers.length} drawers across 4 fixtures at 1280x800 and 390x844: ${opened} screens opened, 0 console errors, 0 uncaught exceptions.`);
