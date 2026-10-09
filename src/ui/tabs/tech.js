"use strict";

/* THE SKILL TREE, DRAWN AS A TREE.

   Six branches were rendered as six lists of cards, each card saying "Tier 3" where 3 was its
   position in an array rather than its depth in anything. Nothing showed what led to what, so
   the one interesting question a skill tree asks - what do I give up to reach that - was
   invisible, and the answer was "nothing", because every branch was an independent ladder that
   cost you nothing in any other.

   So it is a graph now, laid out the way the old ARPG trees did it: nodes on a fixed lattice,
   lines from prerequisite to dependent, tiers running down the page, and a node you cannot
   afford drawn in the same place it will be when you can. The lattice matters - a tree you can
   read at a glance is one where the same skill is always in the same spot, so a player learns
   the shape of it rather than re-reading it every time.

   THE LAYOUT IS COMPUTED FROM THE DEPENDENCIES, never declared. A row is skillTier(): one past
   the deepest thing a node needs, so nothing is ever drawn above something it depends on. A
   column is a slot within its branch, and a branch is as wide as its widest tier. Adding a
   skill or a prerequisite moves the drawing on its own; there is no second copy of the
   structure here to fall out of step with the data, which is exactly how this tab once ended
   up labelling dependency depth with an array index.

   CONNECTORS ARE ONE SVG BEHIND THE WHOLE LATTICE rather than per-branch, because the
   interesting edges are the ones that cross: immersion tuning reaching from Compute into
   Energy for its liquid-cooling competence, practised hands reaching from Electronics into
   Operations for a service desk to have practised on. A per-branch SVG cannot draw those, and
   those are the edges that make it a tree. */

/* How deep in the graph a node sits: one past its deepest prerequisite. This is a drawing
   concern rather than a rule - the engine cares whether a prerequisite is MET, not how far
   down it sits - so it lives with the lattice it positions. The visited set stops a bad edit
   in the data turning a cycle into a stack overflow. */
function skillTier(skill,seen=new Set()){
  const reqs=skillRequirements(skill);
  if(!reqs.length||seen.has(skill.id))return 1;
  seen.add(skill.id);
  return 1+Math.max(...reqs.map(id=>{
    const parent=SKILLS.find(x=>x.id===id);
    return parent?skillTier(parent,new Set(seen)):0;
  }));
}
function techLayout(){
  const branches=[...new Set(SKILLS.map(s=>s.branch))];
  const placed=new Map();
  let column=0,maxTier=1;
  const columns=[];
  for(const branch of branches){
    const members=SKILLS.filter(s=>s.branch===branch);
    const byTier=new Map();
    for(const skill of members){
      const tier=skillTier(skill);
      maxTier=Math.max(maxTier,tier);
      if(!byTier.has(tier))byTier.set(tier,[]);
      byTier.get(tier).push(skill);
    }
    const width=Math.max(1,...[...byTier.values()].map(list=>list.length));
    for(const [tier,list] of byTier){
      // Centre a short tier under the branch it belongs to rather than left-packing it.
      const offset=(width-list.length)/2;
      list.forEach((skill,index)=>placed.set(skill.id,{col:column+offset+index,row:tier-1}));
    }
    columns.push({branch,start:column,width});
    column+=width;
  }
  return{placed,branches:columns,cols:column,rows:maxTier};
}

/* A node's state, in the order the player asks the questions: have I got it, can I reach it,
   can I afford it. */
function techNodeState(skill){
  if(hasSkill(skill.id))return{key:"unlocked",label:"Unlocked"};
  const gate=skillGateReason(skill);
  if(gate)return{key:"locked",label:gate};
  if(state.points<skill.cost)return{key:"short",label:`Need ${skill.cost} point${skill.cost===1?"":"s"} · you have ${state.points}`};
  return{key:"ready",label:"Ready to unlock"};
}

function techTreeSvg(layout){
  const{placed,cols,rows}=layout;
  const cx=p=>(p.col+.5).toFixed(3),cy=p=>(p.row+.5).toFixed(3);
  const edges=[];
  for(const skill of SKILLS){
    const to=placed.get(skill.id);if(!to)continue;
    for(const id of skillRequirements(skill)){
      const from=placed.get(id);if(!from)continue;
      const parentDone=hasSkill(id),childDone=hasSkill(skill.id);
      const cls=childDone?"done":parentDone?"live":"";
      /* Dropped out of the parent, across, and into the child: an orthogonal route reads as a
         circuit diagram, which is what a dependency actually is, and never hides a node behind
         a diagonal passing through it. */
      const midY=((from.row+to.row)/2+.5).toFixed(3);
      edges.push(`<path class="tech-edge ${cls}" d="M${cx(from)} ${cy(from)} V${midY} H${cx(to)} V${cy(to)}"/>`);
    }
  }
  return `<svg class="tech-wires" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="none" aria-hidden="true">${edges.join("")}</svg>`;
}

function techV2(){
  const layout=techLayout();
  const{placed,branches,cols,rows}=layout;
  const unlocked=SKILLS.filter(s=>hasSkill(s.id)).length;
  const headers=branches.map(b=>{
    const members=SKILLS.filter(s=>s.branch===b.branch),done=members.filter(s=>hasSkill(s.id)).length;
    return `<div class="tech-branch-head" style="grid-column:${b.start+1} / span ${b.width}"><b>${b.branch}</b><span>${done} / ${members.length}</span></div>`;
  }).join("");
  const nodes=SKILLS.map(skill=>{
    const at_=placed.get(skill.id);if(!at_)return"";
    const st=techNodeState(skill);
    const reqs=skillRequirements(skill);
    const needs=reqs.length?reqs.map(id=>`${skillName(id)}${hasSkill(id)?"":" (locked)"}`).join(" + "):"Foundation - needs nothing";
    const gates=[skill.date?`from ${dateFmt(at(skill.date),true)}`:null,
      skill.minFacility?`${FACILITIES[skill.minFacility-1]?.name||`tier ${skill.minFacility}`} or larger`:null].filter(Boolean).join(" · ");
    return `<article class="tech-node tech-${st.key}" style="grid-column:${Math.round(at_.col)+1};grid-row:${at_.row+1}" data-skill="${skill.id}">
      <button class="tech-node-face" data-action="skill" data-id="${skill.id}" ${st.key==="ready"?"":"disabled"}
        title="${escapeHtml(`${skill.name} - ${skill.desc} · ${st.label}`)}"
        aria-label="${escapeHtml(`${skill.name}, ${st.label}`)}">
        <span class="tech-node-cost">${skill.cost}</span>
        <b>${skill.name}</b>
        <i class="tech-node-mark" aria-hidden="true">${st.key==="unlocked"?"✓":st.key==="ready"?"+":"·"}</i>
      </button>
      <div class="tech-node-detail"><b>${skill.name}</b><p>${skill.desc}</p>
        <span>Needs: ${escapeHtml(needs)}</span>${gates?`<span>${escapeHtml(gates)}</span>`:""}
        <em>${escapeHtml(st.label)}</em></div>
    </article>`;
  }).join("");
  return `<div class="grid"><section class="card span-12"><div class="hero"><div><div class="hero-kicker">Operator specialisation</div><h1>Build capability, not instant multipliers.</h1><p>Every skill past a foundation needs the ones it descends from, and the deepest need two - reaching immersion tuning means having done the clocking work in Compute <em>and</em> the liquid cooling in Energy. Points are finite, so the tree is a set of choices about what your operation is for rather than a list to complete.</p></div><div class="hero-stat"><strong>${state.points}</strong><span>unspent skill points</span></div></div></section>
    <section class="card span-12 tech-tree-card"><div class="card-head"><h2>Skill tree</h2><div class="meta">${unlocked} / ${SKILLS.length} UNLOCKED · HOVER A NODE FOR DETAIL</div></div>
      <div class="tech-tree-scroll"><div class="tech-tree-lattice" style="--tech-cols:${cols};--tech-rows:${rows}">
        <div class="tech-branch-heads" style="--tech-cols:${cols}">${headers}</div>
        ${techTreeSvg(layout)}${nodes}
      </div></div>
      <div class="tech-legend"><span><i class="tech-key unlocked"></i> Unlocked</span><span><i class="tech-key ready"></i> Ready</span><span><i class="tech-key short"></i> Cannot afford</span><span><i class="tech-key locked"></i> Prerequisite, date or facility missing</span></div>
    </section></div>`;
}
