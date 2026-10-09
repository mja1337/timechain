"use strict";

/* WHEN SOMETHING GOES WRONG, SHOW WHAT WENT WRONG.

   A fire at the mine used to be a red flash and a paragraph. The flash says "bad" and the paragraph says what, but
   nothing on screen looked like a fire, a flood or a break-in, and the mining floor carried on looking exactly as it
   had the day before. Two small pieces of art fix that without adding a scene to animate or an asset to load:

   - an EMBLEM at the head of the loss window, drawn for the kind of disaster, with the window's top bar tinted to
     match; and
   - an OVERLAY on the live mining floor for as long as the aftermath lasts: scorch and a flame after a fire, water
     after a flood, police tape after a break-in, darkness while the grid is down, a dimmed floor while the line is.

   Both are inline SVG and CSS, so they are free to load and work with no script of their own. The flame's flicker is a
   CSS animation, switched off under prefers-reduced-motion like every other animation in the game. The floor overlay
   is a picture laid over the floor and nothing else: it changes no number, takes no click, and the machines under it
   behave exactly as the engine says they do. */

const DISASTER_SCENES={
  fire:{label:"Fire",caption:"Fire at the mine",aftermath:"Scorched floor · the damage is being cleared"},
  flood:{label:"Flood",caption:"Flood at the mine",aftermath:"Standing water · the floor is being pumped out"},
  burglary:{label:"Break-in",caption:"Break-in at the mine",aftermath:"Police tape across the door"},
  seizure:{label:"Seizure",caption:"Seizure",aftermath:""},
  disk:{label:"Failed disk",caption:"A disk failed",aftermath:""},
  hack:{label:"Compromised key",caption:"A key was compromised",aftermath:""},
  grid:{label:"No power",caption:"Grid outage",aftermath:"The floor is dark until the grid is back"},
  net:{label:"No link",caption:"Internet outage",aftermath:"Mining continues blind until the line is back"}
};

/* One 48 × 48 line drawing per kind. They share a stroke and a size so the set reads as one family. */
const DISASTER_GLYPHS={
  fire:`<path class="flame-outer" d="M24 3c2 9 11 13 11 24a11 11 0 0 1-22 0c0-7 4-9 5-15 3 2 6 3 6-9z"/><path class="flame-inner" d="M24 24c1 4 5 6 5 10a5 5 0 0 1-10 0c0-3 3-4 3-7 1 1 2 1 2-3z"/>`,
  flood:`<path d="M24 4C17 15 11 21 11 29a13 13 0 0 0 26 0C37 21 31 15 24 4z"/><path d="M4 41c4-3 6-3 10 0s6 3 10 0 6-3 10 0 6 3 10 0"/>`,
  burglary:`<rect x="10" y="22" width="28" height="20" rx="3"/><path d="M16 22v-6a8 8 0 0 1 15-4"/><path d="M24 30v5M29 12l4-3M33 17l5-1"/>`,
  seizure:`<rect x="10" y="22" width="28" height="20" rx="3"/><path d="M16 22v-7a8 8 0 0 1 16 0v7"/><path d="M24 30v6M4 30h6M38 30h6"/>`,
  disk:`<rect x="8" y="12" width="32" height="24" rx="3"/><circle cx="24" cy="24" r="7"/><path d="M14 16l4 4M34 28l-4-4M18 30l12-12"/>`,
  hack:`<path d="M24 5 43 40H5z"/><path d="M24 17v11M24 33v2"/>`,
  grid:`<path d="M27 4 10 27h12l-3 17 19-25H26z"/><path d="M6 42 42 6"/>`,
  net:`<path d="M6 20a26 26 0 0 1 36 0M12 27a17 17 0 0 1 24 0M18 34a8 8 0 0 1 12 0"/><circle cx="24" cy="40" r="2"/><path d="M6 42 42 6"/>`
};
function disasterGlyph(scene,size=48){
  const g=DISASTER_GLYPHS[scene];if(!g)return"";
  return `<svg class="disaster-glyph glyph-${scene}" viewBox="0 0 48 48" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${g}</svg>`;
}
/* The head of the loss window: the glyph, and what kind of disaster it was. */
function lossEmblemHtml(scene){
  const s=DISASTER_SCENES[scene];if(!s||!DISASTER_GLYPHS[scene])return"";
  return `<div class="loss-emblem scene-${scene}">${disasterGlyph(scene,56)}<span>${s.label}</span></div>`;
}

/* ---- the live mining floor ---------------------------------------------------------------- */

/* What the floor should be showing, or null. A disaster at the mine outranks an outage, and a dead grid outranks a
   dead line, because each says more about what the floor can do right now. */
function floorScene(){
  const s=state.siteScene;
  if(s&&DISASTER_SCENES[s.kind]&&state.time<s.until)return {kind:s.kind,at:s.at,until:s.until};
  if(typeof powerOutage==="function"&&powerOutage())return {kind:"grid",until:state.ops.powerOutageUntil};
  if(typeof connectivityOutage==="function"&&connectivityOutage())return {kind:"net",until:state.ops.outageUntil};
  return null;
}
/* The tint, laid over the whole floor card and taking no clicks. */
function floorSceneArtHtml(){
  const sc=floorScene();
  return sc?`<div class="floor-scene scene-${sc.kind}" aria-hidden="true"><div class="floor-scene-art"></div></div>`:"";
}
/* The words, in the flow of the card under its heading, so nothing it says covers a number. */
function floorSceneBannerHtml(){
  const sc=floorScene();if(!sc)return"";
  const meta=DISASTER_SCENES[sc.kind],days=Math.max(1,Math.ceil((sc.until-state.time)/DAY));
  return `<div class="floor-scene-banner scene-${sc.kind}" role="status">${disasterGlyph(sc.kind,30)}<div><b>${meta.caption}</b><span>${meta.aftermath} · ${days} day${days===1?"":"s"}</span></div></div>`;
}
/* Smoke over the machines during a fire: six soft puffs rising and thinning, and a haze across the top of the picture. It is
   laid inside the floor itself (the 3D view's stage, or the flat floor) so it sits over the machines and not the card around
   them. Under reduced motion the puffs hold still as a static haze. */
function floorSmokeHtml(){
  const sc=floorScene();
  return sc&&sc.kind==="fire"?`<div class="floor-smoke" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>`:"";
}
/* Part of what makes the floor repaint when the picture changes, so an overlay never outlives its cause. */
function floorSceneSignature(){const sc=floorScene();return sc?`${sc.kind}:${sc.until}`:""}
