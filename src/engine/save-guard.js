"use strict";

/* SAVE GUARD - what happens when the stored game cannot be used, and when it cannot be written.

   Until launch week a save was trusted twice over. Loading it only caught a failure to PARSE,
   so a save that parsed but held something the rest of the engine could not stand (a time that
   was not a number, a list that was not a list) threw later, inside a migration or the first
   render, and the page stayed blank on every visit. And a save that would not parse at all was
   replaced by a fresh run in silence: the next save() overwrote the only copy.

   Now an unusable save is checked for its shape before anything else reads it, and when it
   fails the raw text is kept under its own key before a fresh run starts. `saveProblem` tells
   the UI to say so once. A save that passes this and still breaks the first render is caught
   by src/app/recovery.js, which has no game code in it on purpose.

   Loaded before simulation.js, which reads the save at the top level. SAVE_KEY is declared
   there; both functions are only ever called after it exists. */

const SAVE_UNREADABLE_KEY="hashrate-genesis-save-v1.unreadable";
let saveProblem=null;   // {reason,kept} when the stored save was set aside at load; read once by the UI
let saveFailing=false;  // true while the browser is refusing to store the game
let unreadableSaveKept=(()=>{try{return localStorage.getItem(SAVE_UNREADABLE_KEY)!==null}catch(e){return false}})();

/* Only what would throw, or quietly poison everything after it, is rejected. A save whose cash
   serialised to null still opens, as it always did: the point is the blank page, not strictness. */
function saveShapeProblem(s){
  if(!s||typeof s!=="object"||Array.isArray(s))return "it is not a game save";
  if("time" in s&&!(typeof s.time==="number"&&isFinite(s.time)))return "its date is not a number";
  for(const k of ["wallets","hardware"])if(k in s&&(!s[k]||typeof s[k]!=="object"||Array.isArray(s[k])))return `${k} is not a table`;
  for(const k of ["activity","log","history","skills","seen","milestones"])if(k in s&&!Array.isArray(s[k]))return `${k} is not a list`;
  return "";
}

/* The stored save as an object, or null for a first visit or one that had to be set aside. */
function loadStoredSave(){
  let raw=null;
  try{raw=localStorage.getItem(SAVE_KEY)}catch(e){return null}
  if(!raw)return null;
  let parsed=null,why="";
  try{parsed=JSON.parse(raw)}catch(e){why="it is not valid JSON"}
  if(!why)why=saveShapeProblem(parsed);
  if(!why)return parsed;
  stashUnreadableSave(raw,why);
  return null;
}
/* Keep the raw text, only the latest one, and say so. */
function stashUnreadableSave(raw,why){
  let kept=true;
  try{localStorage.setItem(SAVE_UNREADABLE_KEY,raw)}catch(e){kept=false}
  unreadableSaveKept=unreadableSaveKept||kept;
  saveProblem={reason:why,kept};
}
function unreadableSaveText(){try{return localStorage.getItem(SAVE_UNREADABLE_KEY)}catch(e){return null}}

/* True when the game was stored. A failure flips saveFailing once and the UI says so once;
   the next success clears it. */
function writeSave(snapshot){
  let ok=true;
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(snapshot))}catch(e){ok=false}
  const changed=saveFailing===ok;
  saveFailing=!ok;
  if(changed&&typeof announceSaveState==="function")announceSaveState();
  return ok;
}
