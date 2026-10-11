/* Local browser check for the key-numbers bar. Not part of the CI Checks workflow:
   Playwright is not installed there. Run with the dev server already up:

     PLAYWRIGHT_CORE=/path/to/playwright-core/index.js \
     CHROME_PATH=/usr/local/bin/google-chrome \
     HUD_URL=http://127.0.0.1:8090/ \
     node scripts/smoke/hud.mjs
*/
import { mkdirSync } from "node:fs";

const core = process.env.PLAYWRIGHT_CORE || "playwright-core";
const imported = await import(core);
const { chromium } = imported.chromium ? imported : imported.default;
const url = process.env.HUD_URL || "http://127.0.0.1:8090/";
const out = process.env.HUD_SHOTS || "/opt/cursor/artifacts/phase1";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "/usr/local/bin/google-chrome",
  args: ["--no-sandbox", "--disable-dev-shm-usage"]
});
const errors = [];
const page = await browser.newPage();
page.on("pageerror", err => errors.push(String(err)));
page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

async function fresh() {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-action=begin]");
  await page.click("[data-action=begin]");
  await page.waitForFunction(() => typeof state !== "undefined" && state.started);
  await page.evaluate(() => { state.walletSetup.done = true; render(); });
  await page.waitForSelector(".hud");
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function measure(name, width, height) {
  await page.setViewportSize({ width, height });
  await fresh();
  const report = await page.evaluate(() => {
    const bar = document.querySelector(".hud");
    const items = [...document.querySelectorAll(".hud-item")];
    const visible = items.filter(el => getComputedStyle(el).display !== "none");
    const hidden = items.filter(el => getComputedStyle(el).display === "none");
    const doc = document.documentElement;
    return {
      primary: document.querySelectorAll(".hud-item.hud-primary").length,
      extra: document.querySelectorAll(".hud-item.hud-extra").length,
      visible: visible.length,
      hidden: hidden.length,
      switchInBar: !!bar.querySelector("[data-action=toggle-power]"),
      overflow: doc.scrollWidth - doc.clientWidth,
      labels: visible.map(el => el.querySelector(".hud-label")?.textContent)
    };
  });
  assert(report.primary === 3 && report.extra === 2, `${name} bar markup is not 3 + 2`);
  assert(report.visible === (width <= 800 ? 3 : 5), `${name} shows ${report.visible} items (${report.labels.join(", ")})`);
  assert(report.hidden === (width <= 800 ? 2 : 0), `${name} hides ${report.hidden} items`);
  assert(!report.switchInBar, `${name} has a shutdown switch in the bar`);
  assert(report.overflow <= 1, `${name} overflows by ${report.overflow}px`);

  await page.click("[data-action=hud-stats]");
  await page.waitForSelector("#hud-stats-pop:not([hidden])");
  const stats = await page.evaluate(() => {
    const pop = document.querySelector("#hud-stats-pop");
    const box = pop.getBoundingClientRect();
    const values = [...pop.querySelectorAll(".hud-stat .hud-value")].map(el => el.textContent.trim());
    return { height: box.height, count: pop.querySelectorAll(".hud-stat").length, empty: values.filter(v => !v).length, ticker: !!pop.querySelector(".ticker") };
  });
  assert(stats.height > 40, `${name} stats pop-out height is ${stats.height}`);
  assert(stats.count === 16 && stats.empty === 0 && !stats.ticker, `${name} stats pop-out is ${JSON.stringify(stats)}`);
  await page.screenshot({ path: `${out}/${name}-stats.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector("#hud-stats-pop")?.hidden === true);
  const focus = await page.evaluate(() => document.activeElement?.dataset?.action || "");
  assert(focus === "hud-stats", `${name} Escape returned focus to ${focus || "nothing"}`);

  await page.click("[data-action=hud-decisions]");
  await page.waitForSelector("#hud-decisions-pop:not([hidden]) h2");
  const decisions = await page.evaluate(() => {
    const pop = document.querySelector("#hud-decisions-pop");
    const statsOpen = !document.querySelector("#hud-stats-pop").hidden;
    return { height: pop.getBoundingClientRect().height, cards: pop.querySelectorAll(".dashboard-command").length, statsOpen };
  });
  assert(decisions.height > 40 && decisions.cards >= 4 && !decisions.statsOpen, `${name} decisions pop-out is ${JSON.stringify(decisions)}`);
  await page.keyboard.press("Escape");

  await page.evaluate(() => showToast("Bar check", "This note stays off the key numbers.", "info"));
  await page.waitForSelector(".toast");
  const covered = await page.evaluate(() => [...document.querySelectorAll(".hud button")].filter(button => {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== button && !button.contains(hit);
  }).map(button => button.textContent.trim()));
  assert(covered.length === 0, `${name} toast covers ${covered.join(", ")}`);
  await page.screenshot({ path: `${out}/${name}-toast.png` });
  await page.evaluate(() => { if (typeof dismissToast === "function") dismissToast(); });

  if (width <= 800) {
    await page.click("[data-action=mobile-menu]");
    await page.click('[data-action=mobile-menu-section][data-value=operate]');
    await page.click('.mobile-nav [data-action=tab][data-value=mine]');
  } else {
    await page.click('nav.tabs [data-action=tab][data-value=mine]');
  }
  await page.waitForSelector("[data-action=toggle-power]");
  const before = await page.evaluate(() => state.power);
  assert(before === true, `${name} site was already stopped`);
  await page.click("[data-action=toggle-power]");
  const armed = await page.evaluate(() => ({ power: state.power, label: document.querySelector("[data-action=toggle-power]")?.textContent }));
  assert(armed.power === true && armed.label === "Confirm stop", `${name} first press did ${JSON.stringify(armed)}`);
  await page.click("[data-action=toggle-power]");
  await page.waitForSelector(".hud-stopped");
  const stopped = await page.evaluate(() => ({
    power: state.power,
    manual: state.manualStop,
    banner: !!document.body.textContent.includes("Miners stopped"),
    chip: !!document.querySelector(".hud-chip.hud-stopped"),
    switchInBar: !!document.querySelector(".hud [data-action=toggle-power]")
  }));
  assert(stopped.power === false && stopped.manual && stopped.banner && stopped.chip && !stopped.switchInBar, `${name} stop result ${JSON.stringify(stopped)}`);
  await page.screenshot({ path: `${out}/${name}-stopped.png` });
  await page.click('.status-banner [data-action=toggle-power]');
  const restarted = await page.evaluate(() => state.power === true && !state.manualStop);
  assert(restarted, `${name} Restart did not start the site in one press`);
  console.log(`${name} ok`);
}

try {
  await measure("desktop", 1280, 800);
  await measure("phone", 390, 844);
  await measure("tablet", 800, 800);
  assert(errors.length === 0, `console errors:\n${errors.join("\n")}`);
  console.log("hud smoke passed");
} finally {
  await browser.close();
}
