import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const context={escapeHtml:value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')};
vm.createContext(context);
for(const file of ['src/data/events.js','src/data/event-reactions.js','src/ui/presentation.js'])vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),context);
const events=vm.runInContext('EVENTS',context),reactions=vm.runInContext('EVENT_REACTIONS',context);
const practical=vm.runInContext('EVENT_PRACTICAL_PERSPECTIVES',context);
assert.deepEqual(Object.keys(practical).sort(),Array.from(events,event=>event.id).sort(),'Each event needs a practical situation');
assert.equal(new Set(Object.values(practical)).size,events.length,'Practical situations must be specific to their event');
assert.equal(new Set(events.map(event=>event.id)).size,events.length,'Timeline IDs must be unique');
assert.deepEqual(Object.keys(reactions).sort(),Array.from(events,event=>event.id).sort(),'Every chapter needs its own reaction pair');
for(const event of events){
  const pair=reactions[event.id];assert.equal(pair.length,2);assert(pair.every(text=>typeof text==='string'&&text.trim().length>20),event.id);
  assert.notEqual(pair[0],pair[1],event.id);
  const markup=context.eventReactionsHtml(event);assert.equal((markup.match(/class="perspective-trigger"/g)||[]).length,3);assert.equal((markup.match(/popover="auto"/g)||[]).length,3);assert.equal((markup.match(/aria-expanded="false"/g)||[]).length,3);assert(!markup.includes('<blockquote'));assert(!markup.includes('grok69420'));assert(!markup.includes('FreeBob'));assert(practical[event.id].length>100,event.id);
  const sidebar=context.eventReactionsHtml(event,true);const ids=Array.from((markup+sidebar).matchAll(/<aside id="([^"]+)"/g),match=>match[1]);assert.equal(new Set(ids).size,6,'Sidebar and modal IDs must not collide');
}
reactions.genesis[0]='<script>unexpected()</script>';
assert(!context.eventReactionsHtml({id:'genesis'}).includes('<script>'),'Dialogue must be escaped');
assert.equal(context.eventReactionsHtml({id:'missing'}),'');
const render=fs.readFileSync(new URL('../src/ui/render.js',import.meta.url),'utf8')+fs.readFileSync(new URL('../src/ui/event-modals.js',import.meta.url),'utf8');
assert(render.includes('eventReactionsHtml(feature,true)')&&render.includes('eventReactionsHtml(e)'),'Both story surfaces need the dialogue');
console.log(`Event reactions passed: ${events.length} chapters, three accessible icon controls, unique practical situations, separate sidebar/modal IDs and escaped text.`);
