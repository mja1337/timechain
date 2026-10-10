import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const context={applyVenueFailure:()=>{},setTimer:()=>{},state:{},escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
vm.createContext(context);
for(const file of ['src/data/events.js','src/data/event-reactions.js','src/ui/presentation.js','src/engine/offline.js','src/engine/event-effects.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
const conferences=Array.from(vm.runInContext('EVENTS.filter(event=>event.conference)',context));
assert.equal(conferences.length,4);
for(const event of conferences){
  assert.equal(event.imp,2);assert.equal(event.storyPopup,true);assert(!event.fx);
  assert.equal(event.conference.scene.length,3);
  assert(context.conferenceSceneHtml(event).includes('Fictional player experience'));
  context.state={points:0,speed:4,storyPause:true,connectivity:'fixed',cash:1500};
  context.applyEvent(event);assert.equal(context.state.activeEvent,event.id);assert.equal(context.state.speed,0);assert.equal(context.state.returnSpeed,4);assert.equal(context.state.points,0);assert.equal(context.state.cash,1500);
  context.state={points:0,speed:4,storyPause:false,connectivity:'fixed'};
  context.applyEvent(event);assert.equal(context.state.activeEvent,undefined);assert.equal(context.state.speed,4);
  context.state={points:0,speed:4,storyPause:true,connectivity:'offline'};
  context.applyEvent(event);assert.equal(context.state.activeEvent,undefined);assert.equal(context.state.missedEvents[0],event.id);
  context.state.connectivity='fixed';assert.equal(context.surfaceMissedEvent(),true);assert.equal(context.state.activeEvent,event.id);assert.equal(context.state.points,0);
}
context.state={points:0,speed:4,storyPause:true,connectivity:'offline'};
context.applyEvent({id:'major',imp:3});
vm.runInContext('EVENTS.push({id:"major",imp:3})',context);
context.state.connectivity='fixed';context.surfaceMissedEvent();assert.equal(context.state.points,1,'Major chapter rewards must remain intact');
const modal=fs.readFileSync(new URL('../src/ui/event-modals.js',import.meta.url),'utf8');assert(modal.includes('conferenceSceneHtml(e)'));assert(modal.includes('Return to your operation'));
console.log('Conference stories passed: four sourced chapters, fictional scenes, story-pause preference, no bonus points or travel charges, offline deferral, and major-event rewards preserved.');
