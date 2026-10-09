import { readFile, readdir, stat } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const expectedScripts = [
  /* First, and with no game code in it: the page a player gets if anything below fails to start. */
  "src/app/recovery.js",
  "historical-data.js",
  "src/config/timeline.js",
  "src/data/network.js",
  "src/data/rivals.js",
  "src/data/hardware.js",
  "src/data/operations.js",
  "src/data/progression.js",
  "src/data/content.js",
  /* The timeline is its own dataset and the one most likely to keep growing. */
  "src/data/events.js",
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
  /* Before simulation.js: it declares the repaint flags with `let`, and simulation.js reaches
     them at load through its migration block. */
  "src/engine/render-queue.js",
  /* Before simulation.js, which reads the stored save at the top level through it. */
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
  "src/engine/credit.js",
  "src/engine/lending.js",
  "src/engine/facilities.js",
  "src/engine/maintenance.js",
  "src/engine/pools.js",
  "src/engine/actions.js",
  "src/ui/transaction-preview.js",
  "src/engine/recap.js",
  "src/ui/notify.js",
  "src/ui/presentation.js",
  "src/ui/art.js",
  "src/ui/disaster-art.js",
  "src/ui/tabs/dashboard.js",
  "src/ui/tabs/pools.js",
  "src/ui/tabs/mine.js",
  "src/ui/tabs/ledger.js",
  "src/ui/tabs/market.js",
  "src/ui/tabs/operations.js",
  "src/ui/tabs/treasury.js",
  "src/ui/tour.js",
  /* The fleet chapter is its own module: it is the manual's largest and the one that grows
     every time the mining floor changes. */
  "src/ui/tabs/method-chapters-fleet.js",
  "src/ui/tabs/method-chapters.js",
  "src/ui/tabs/tech.js",
  "src/ui/tabs/method.js",
  "src/ui/enhance/repair-bench.js",
  "src/ui/enhance/mine-power.js",
  "src/ui/enhance/mine-market.js",
  "src/ui/enhance/servicing.js",
  "src/ui/enhance/price-chart.js",
  "src/ui/floor3d/mount.js",
  "src/ui/enhance/keys.js",
  "src/ui/enhance/custody.js",
  "src/ui/enhance/custody-order.js",
  "src/ui/enhance/treasury.js",
  "src/ui/enhance/settlement.js",
  "src/ui/enhance/places.js",
  "src/ui/enhance/people.js",
  "src/ui/enhance/hotkey.js",
  "src/ui/enhance/counterparties.js",
  "src/ui/enhance/operations.js",
  "src/ui/live.js",
  "src/ui/footer.js",
  "src/ui/intro-chat.js",
  "src/ui/offline.js",
  "src/ui/confetti.js",
  "src/ui/render.js",
  "src/app/events.js",
  "src/app/bootstrap.js",
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(!/<style[\s>]/i.test(html), "index.html contains an inline stylesheet");
assert(!/<script(?!\s+src=)[^>]*>/i.test(html), "index.html contains inline application JavaScript");
/* EVERY LOCAL ASSET CARRIES THE VERSION.

   GitHub Pages lets a browser keep any file for ten minutes, and the page loads seventy-odd of
   them. Without a version in each URL a player could be handed new modules beside old ones for the
   first ten minutes after a deploy, and the load-order rules in ARCHITECTURE.md mean that mix
   can throw. With one, bumping APP_VERSION changes every URL at once. The lazily loaded 3D scripts
   are versioned the same way in src/ui/floor3d/mount.js. */
const version = /const APP_VERSION="([^"]+)"/.exec(await readFile(new URL("src/data/content.js", root), "utf8"))?.[1];
assert(version, "There is no APP_VERSION in src/data/content.js");
assert(html.includes(`<link rel="stylesheet" href="src/styles/app.css?v=${version}">`), "The external application stylesheet is not linked with the current version");
const assetUrls = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(match => match[1]);
for (const url of assetUrls) assert(url.endsWith(`?v=${version}`), `${url} does not carry ?v=${version}: a cached old module could load beside a new one`);
{
  const mount = await readFile(new URL("src/ui/floor3d/mount.js", root), "utf8");
  assert(mount.includes("node.src=`${src}?v=${APP_VERSION}`"), "The lazily loaded 3D scripts are not versioned with APP_VERSION");
}
for (const needed of ['property="og:image"', 'property="og:title"', 'property="og:description"', 'name="twitter:card"', 'rel="apple-touch-icon"'])
  assert(html.includes(needed), `index.html has lost its ${needed} tag: shared links lose their preview`);
{
  const notFound = await readFile(new URL("404.html", root), "utf8");
  assert(notFound.includes('href="/timechain/"') && !/<script/i.test(notFound), "404.html must link back to the game and carry no script");
}
for (const file of ["og.png", "apple-touch-icon.png"]) assert((await stat(new URL(file, root))).size > 1000, `${file} is missing or empty`);

const actualScripts = assetUrls.map(url => url.replace(/\?v=.*$/, ""));
assert(JSON.stringify(actualScripts) === JSON.stringify(expectedScripts), "Application scripts are missing or loaded out of dependency order");
assert(new Set(actualScripts).size === actualScripts.length, "A script is loaded more than once");

/* The ceiling used to apply only to scripts listed in the manifest, so any module not yet
   wired into index.html escaped it entirely - which is exactly when a file is most likely to
   be growing unwatched. It now walks src/ and checks everything found there.

   vendor/ is deliberately outside that walk. The rule exists to force oversized FIRST-PARTY
   files to be split; splitting somebody else's library would only make it harder to replace,
   and its size is a decision taken once when it is vendored rather than something that
   creeps. */
{
  const walk = async dir => {
    const out = [];
    for (const entry of await readdir(new URL(dir + "/", root), { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...await walk(`${dir}/${entry.name}`));
      else if (entry.name.endsWith(".js")) out.push(`${dir}/${entry.name}`);
    }
    return out;
  };
  const modules = await walk("src");
  assert(modules.length >= expectedScripts.filter(f => f.startsWith("src/")).length,
    "The source walk found fewer modules than the manifest lists");
  for (const file of modules) {
    const info = await stat(new URL(file, root));
    assert(info.size < 70_000, `${file} has grown beyond the agreed module ceiling`);
  }
}

/* NO RUNTIME NETWORK CALLS. The game reads a bundled dataset and nothing else, Method says
   so in as many words, and it is the reason this works offline, from file:// and on a static
   host. Until now that was true by habit. A vendored third-party library is precisely how a
   promise like that stops being true without anyone deciding to break it - a version bump
   adds a loader, and nothing complains. */
{
  const shipped = [...await (async function walk(dir) {
    const out = [];
    for (const entry of await readdir(new URL(dir + "/", root), { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(...await walk(`${dir}/${entry.name}`));
      else if (entry.name.endsWith(".js")) out.push(`${dir}/${entry.name}`);
    }
    return out;
  })("src"), "vendor/three.floor.js"];
  const banned = [
    [/(^|[^.\w])fetch\s*\(/, "fetch()"],
    [/XMLHttpRequest/, "XMLHttpRequest"],
    [/new\s+WebSocket/, "WebSocket"],
    [/new\s+EventSource/, "EventSource"],
    [/navigator\s*\.\s*sendBeacon/, "sendBeacon"],
    [/(^|[^.\w])import\s*\(/, "dynamic import()"],
    [/importScripts\s*\(/, "importScripts()"],
  ];
  /* Comments are stripped first. The header of the vendored library says in plain English
     that it contains no XMLHttpRequest, and the first version of this check dutifully failed
     on that sentence. A check for network calls has to read code, not prose about code. */
  const stripComments = text => text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  for (const file of shipped) {
    const text = stripComments(await readFile(new URL(file, root), "utf8"));
    for (const [pattern, what] of banned) {
      assert(!pattern.test(text),
        `${file} makes a runtime network call (${what}); the game loads a bundled dataset and nothing else`);
    }
  }
}

for (const file of ["src/styles/app.css", ...expectedScripts]) {
  const info = await stat(new URL(file, root));
  assert(info.isFile() && info.size > 0, `${file} is missing or empty`);
  if (file.startsWith("src/") && file.endsWith(".js")) assert(info.size < 70_000, `${file} has grown beyond the agreed module ceiling`);
}

/* NO SKILL MAY COST POINTS AND DO NOTHING.

   The operator tree is the one place in the game where a player spends a scarce currency on
   a promise, so every id in it has to be read by something that changes behaviour. A skill
   that reads well and is wired to nothing is worse than a missing skill: it takes points and
   silently returns none of them. This walks the tree against the shipped source, which also
   catches the reverse - a branch added to the data and forgotten in the engine. */
{
  const progression = await readFile(new URL("src/data/progression.js", root), "utf8");
  const skillsBlock = progression.slice(progression.indexOf("const SKILLS=["), progression.indexOf("\n];", progression.indexOf("const SKILLS=[")));
  const skillIds = [...skillsBlock.matchAll(/\{id:"([a-zA-Z]+)"/g)].map(m => m[1]);
  assert(skillIds.length > 20, `only ${skillIds.length} skills were parsed out of the tree, so this check is not reading it properly`);
  const consumers = [];
  for (const file of expectedScripts) {
    if (!file.startsWith("src/")) continue;
    if (file === "src/data/progression.js") continue;
    consumers.push(await readFile(new URL(file, root), "utf8"));
  }
  const haystack = consumers.join("\n");
  const dead = skillIds.filter(id => {
    // Read by the engine, required by a hardware entry, or named as another skill's parent.
    if (haystack.includes(`hasSkill("${id}")`) || haystack.includes(`includes("${id}")`)) return false;
    if (haystack.includes(`requires:"${id}"`)) return false;
    return true;
  });
  assert(dead.length === 0, `Operator skills that cost points and change nothing: ${dead.join(", ")}`);
}

assert((await stat(new URL("index.html", root))).size < 8_000, "index.html is becoming a monolith again");
console.log(`Project structure passed: ${expectedScripts.length - 1} application modules, one generated historical bundle, one stylesheet`);
