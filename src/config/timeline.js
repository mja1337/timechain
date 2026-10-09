"use strict";

/* DATA LAYER - compact, offline historical anchors and gameplay estimates. */
const LIGHTNING=Date.parse("2018-03-15T00:00:00Z"),PROJECT_FINANCE_START=Date.parse("2014-01-01T00:00:00Z");
const DAY=86400000, GENESIS=Date.parse("2009-01-03T00:00:00Z"), START=Date.parse("2009-02-03T00:00:00Z"), END=Date.parse("2026-10-06T00:00:00Z"), MARKET=Date.parse("2010-07-17T00:00:00Z");
const SANDBOX_END=END+DAY*365.25*100;
const at=d=>Date.parse(d+"T00:00:00Z");
/* IS THIS PIECE OF WORK DUE YET?

   One question, written six ways across the engine: job.due>t, t<job.due, t>=job.due,
   job.due<=t, and two of those with the operands swapped. Every one is the same boundary
   decision - what happens to a job due at exactly this instant - and each spelling was a
   separate chance to get it the wrong way round. A mutation sweep found the comparison
   unasserted at a dozen call sites; the cause was that there was no single place to assert it.

   A job due at exactly t IS due: work scheduled for today happens today, and the alternative
   quietly adds a day to every lead time in the game.

   These are deliberately NOT complements when `due` is missing or unparseable. Both read false
   then, which preserves what the hand-written comparisons did in both directions: a filter
   keeping `due>t` dropped a malformed job, and a branch acting on `due<=t` did not act on one.
   A job with no due date is neither pending nor finished, and that is the safe reading. */
/* Number(null) is 0 and Number("") is 0, so the obvious one-liner reads a null due date as
   "due since 1970" and fires the job immediately. The first run of the contract below caught
   exactly that. Numeric strings are still accepted, because saves have carried due dates as
   strings and the hand-written comparisons coerced them. */
const dueStamp=job=>{
  const raw=job?.due;
  if(raw===null||raw===undefined||raw==="")return NaN;
  const stamp=Number(raw);
  return Number.isFinite(stamp)?stamp:NaN;
};
const dueBy=(job,t)=>dueStamp(job)<=t;
const pendingAt=(job,t)=>dueStamp(job)>t;
const FAUCET_START=at("2010-06-11"), FAUCET_END=at("2012-06-11");
const OPERATOR_ERAS=[
  {id:"frontier",name:"CPU frontier",start:GENESIS,end:at("2011-01-01")},
  {id:"garage",name:"GPU garage",start:at("2011-01-01"),end:at("2013-01-01")},
  {id:"asic",name:"ASIC industrialisation",start:at("2013-01-01"),end:at("2017-01-01")},
  {id:"professional",name:"Professional mining",start:at("2017-01-01"),end:at("2021-01-01")},
  {id:"stress",name:"Sovereign stress",start:at("2021-01-01"),end:at("2024-01-01")},
  {id:"institutional",name:"Institutional era",start:at("2024-01-01"),end:END+DAY},
  {id:"frontier2",name:"Procedural frontier",start:END+DAY,end:SANDBOX_END+DAY}
];
