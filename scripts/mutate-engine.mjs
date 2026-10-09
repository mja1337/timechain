/* A MUTATION SWEEP, WITH A LEXER.

   Flips comparison and clamp operators one at a time and reports the ones no suite notices.
   A survivor is either a missing contract or a mutant that cannot change behaviour; the point
   of the tool is to make you decide which, one at a time, in writing.

   The lexer is the part that earns its place. The first version skipped lines *starting* with
   a comment marker, which left every continuation line inside a block comment fair game: a
   sweep reported six survivors in config/timeline.js that were all prose in the comment
   explaining the very operator being mutated, each costing a full suite run to discover it
   changed nothing. Strings and template literals are the same trap - flipping a `>` inside
   `<h3>` produces different HTML, no failure, and a survivor that means nothing.

   Usage: node scripts/mutate-engine.mjs [file ...]   (defaults to the engine modules)
   Writes the survivor list to mutation-survivors.json in the working directory. */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";

/* Which characters are code, as opposed to comment or string. One pass, no regex, because a
   regex cannot know whether the quote it just matched was itself inside a comment. */
function codeMask(src) {
  const mask = new Uint8Array(src.length);
  let i = 0, state = "code", quote = "";
  while (i < src.length) {
    const c = src[i], next = src[i + 1];
    if (state === "code") {
      if (c === "/" && next === "/") { state = "line"; i += 2; continue; }
      if (c === "/" && next === "*") { state = "block"; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") { state = "string"; quote = c; i += 1; continue; }
      mask[i] = 1; i += 1; continue;
    }
    if (state === "line") { if (c === "\n") state = "code"; i += 1; continue; }
    if (state === "block") { if (c === "*" && next === "/") { state = "code"; i += 2; continue; } i += 1; continue; }
    // string
    if (c === "\\") { i += 2; continue; }
    if (c === quote) { state = "code"; i += 1; continue; }
    /* A template literal's ${...} is code again, and routinely holds the comparisons worth
       mutating - a ternary picking a label, for instance. Treated as code, one level deep. */
    if (quote === "`" && c === "$" && next === "{") {
      let depth = 1; i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === "{") depth += 1;
        else if (src[i] === "}") depth -= 1;
        if (depth > 0) mask[i] = 1;
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return mask;
}

const SWAPS = [
  [">=", ">"], ["<=", "<"], ["Math.min(", "Math.max("], ["Math.max(", "Math.min("],
];
/* Bare < and > need care: they must not match part of >=, <=, =>, ===, !== or <<. */
function bareSwaps(src, at) {
  const c = src[at], prev = src[at - 1], next = src[at + 1];
  if (c !== "<" && c !== ">") return null;
  if (next === "=" || prev === "=" || prev === "<" || prev === ">" || prev === "!" || next === c) return null;
  return c === ">" ? ">=" : "<=";
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : readdirSync(new URL("../src/engine/", import.meta.url)).filter(n => n.endsWith(".js")).map(n => `src/engine/${n}`);

const survivors = [];
let tried = 0, skipped = 0;

for (const file of files) {
  const original = readFileSync(file, "utf8");
  const mask = codeMask(original);
  const points = [];
  for (let i = 0; i < original.length; i++) {
    if (!mask[i]) { skipped += 1; continue; }
    for (const [from, to] of SWAPS) {
      if (original.startsWith(from, i) && mask[i + from.length - 1]) { points.push([i, from, to]); break; }
    }
    const bare = bareSwaps(original, i);
    if (bare) points.push([i, original[i], bare]);
  }
  for (const [at, from, to] of points) {
    const mutated = original.slice(0, at) + to + original.slice(at + from.length);
    writeFileSync(file, mutated);
    tried += 1;
    let killed = false;
    for (const suite of ["check-engine-behaviour", "check-ui-contracts"]) {
      if (killed) break;
      try { execSync(`node scripts/${suite}.mjs`, { stdio: "pipe" }); } catch { killed = true; }
    }
    if (!killed) {
      const line = original.slice(0, at).split("\n").length;
      const start = original.lastIndexOf("\n", at) + 1;
      survivors.push({ file, line, from, to, code: original.slice(start, original.indexOf("\n", at)).trim().slice(0, 150) });
    }
    writeFileSync(file, original);
  }
  writeFileSync(file, original);
}

writeFileSync("mutation-survivors.json", JSON.stringify(survivors, null, 1));
console.log(`Mutation sweep: ${tried} mutants across ${files.length} files, ${survivors.length} survived (${skipped} comment/string positions skipped)`);
for (const s of survivors) console.log(`  ${s.file}:${s.line}  ${s.from} -> ${s.to}   ${s.code.slice(0, 90)}`);
