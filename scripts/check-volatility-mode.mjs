import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine, makeEval } from "./engine-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function projection(seed, level) {
  const read = makeEval(loadEngine());
  return JSON.parse(read(`(() => {
    state.sandbox=true;state.volatilityMode=true;state.volatilityLevel=${level};state.seed=${seed};
    const t=END+DAY*365*9+DAY*17;
    return JSON.stringify({price:priceAt(t),hash:hashAt(t),events:volatilityEventSchedule(state.seed).map(x=>[x.id,x.start])});
  })()`));
}

const read = makeEval(loadEngine());
assert(read("state.volatilityLevel") === 50, "new runs must default to the middle volatility setting");
assert(read("state.volatilityMode") === false, "volatility mode must be opt-in for existing runs");
read("state.volatilityMode=true;state.sandbox=false");
assert(read("volatilityEnabled()") === true && read("volatilityProfile().enabled") === false, "the end-screen toggle must be selectable before sandbox mode starts, without changing recorded history");
const renderSource = fs.readFileSync(path.join(ROOT, "src/ui/render.js"), "utf8");
assert(renderSource.includes('data-action="volatility-toggle"') && renderSource.includes('data-volatility-level'), "the continuation decision must expose the Volatility Mode toggle and slider");

const invalid = JSON.parse(read("JSON.stringify(state)"));
invalid.volatilityLevel = 900;
invalid.volatilityMode = true;
const migrated = makeEval(loadEngine(invalid));
assert(migrated("state.volatilityLevel") === 100, "volatility slider migration must clamp its upper bound");
invalid.volatilityLevel = -20;
const migratedLow = makeEval(loadEngine(invalid));
assert(migratedLow("state.volatilityLevel") === 0, "volatility slider migration must clamp its lower bound");

const a = projection(123456789, 50);
const b = projection(123456789, 50);
assert(JSON.stringify(a) === JSON.stringify(b), "the same seed and slider must replay identical paths and event dates");
const c = projection(987654321, 50);
assert(JSON.stringify(a) !== JSON.stringify(c), "different campaign seeds must produce different continuation paths");

const readEffects = makeEval(loadEngine());
const effect = JSON.parse(readEffects(`(() => {
  state.sandbox=true;state.volatilityMode=true;state.volatilityLevel=50;state.seed=123456789;
  const events=volatilityEventSchedule(state.seed),war=events.find(x=>x.id==="war"),aliens=events.find(x=>x.id==="aliens"),alienWar=events.find(x=>x.id==="alien-war");
  state.volatilityMode=false;const baseline=priceAt(alienWar.start+DAY*30);
  state.volatilityMode=true;const shocked=priceAt(alienWar.start+DAY*30),factor=volatilityEventFactor(alienWar.start+DAY*30,"price");
  state.volatilitySeen=[];advanceVolatility(alienWar.start-DAY,alienWar.start,true);
  return JSON.stringify({ids:events.map(x=>x.id),baseline,shocked,factor,seen:state.volatilitySeen});
})()`));
assert(effect.ids.includes("war") && effect.ids.includes("aliens") && effect.ids.includes("alien-war"), "the initial scenario roster must include war, aliens and alien war");
assert(effect.factor <= .11 && effect.factor > 0, "alien war must be capable of a 90% drawdown at the default setting");
assert(effect.shocked < effect.baseline*.2, "event shocks must reach the price path");
assert(effect.seen.length === 1 && effect.seen[0].startsWith("alien-war:"), "sandbox ticks must record each seeded event once");

console.log("Volatility mode checks passed: defaults and bounds, seeded replay, scenario roster, severe alien-war shock, and event bookkeeping");
