"use strict";

/* The sidebar is a reader, not only a ticker. Keep its focus by event id so a run can
   advance while somebody is rereading the beginning without moving the reader forward. */
let storyFocus="latest";
function storyPast(){return EVENTS.filter(e=>at(e.date)<=state.time).sort((a,b)=>at(b.date)-at(a.date))}
function storyFocusIndex(past){
  if(!past.length)return-1;
  if(storyFocus==="earliest")return past.length-1;
  if(storyFocus==="latest")return 0;
  const index=past.findIndex(e=>e.id===storyFocus);return index<0?0:index;
}
function storySetFocus(index,past=storyPast()){
  if(!past.length)return;
  const clamped=Math.max(0,Math.min(past.length-1,index));
  storyFocus=clamped===0?"latest":clamped===past.length-1?"earliest":past[clamped].id;
  render(false);
}
function storyResetFocus(){storyFocus="latest"}
function storyNavButton(action,label,disabled=false){return `<button class="action tiny" data-action="${action}" ${disabled?"disabled":""}>${label}</button>`}
function sidebar(){
  const past=storyPast(),index=storyFocusIndex(past),feature=past[index];
  if(!feature)return `<aside class="sidebar"><div class="story-head"><h2>The Bitcoin story</h2></div><div class="empty-story">The network has not yet spoken.</div></aside>`;
  const older=index<past.length-1,newer=index>0;
  return `<aside class="sidebar"><div class="story-head"><div class="story-heading"><h2>The Bitcoin story</h2><span class="story-count">${past.length} / ${EVENTS.length} chapters</span></div><nav class="story-nav" aria-label="Story history">${storyNavButton("story-latest","Current",index!==0)}${storyNavButton("story-newer","Newer",!newer)}${storyNavButton("story-first","Beginning",index===past.length-1)}${storyNavButton("story-older","Older",!older)}</nav></div><article class="story-feature"><div class="story-date">${dateFmt(at(feature.date))} · ${feature.cat}</div><h3>${feature.title}</h3><div class="dek">${feature.dek}</div><p>${feature.body}</p>${eventReactionsHtml(feature,true)}${feature.url?`<div class="story-source"><a href="${feature.url}" target="_blank" rel="noopener">${feature.id==="genesis"?"Read the Bitcoin whitepaper":`Source: ${escapeHtml(feature.src||"")}`}</a></div>`:""}</article><div class="story-list">${past.slice(index+1,index+11).map(e=>`<article class="story-item" data-action="story" data-id="${e.id}" tabindex="0"><span class="cat">${e.cat}</span><time>${dateFmt(at(e.date))}</time><h4>${e.title}</h4></article>`).join("")}</div></aside>`;
}
