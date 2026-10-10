import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function harness(){
  let now=100000,modal=false,saves=0,inserts=0,timers=0;
  const nodes=new Map();
  const host={insertAdjacentHTML(_where,markup){inserts++;if(markup.includes('notification-prompt'))nodes.set('.notification-prompt',{remove(){nodes.delete('.notification-prompt')}});}};
  const context={state:{started:true},toast:null,toastTimer:null,Date:{now:()=>now},
    document:{querySelector:selector=>selector==='.modal-backdrop'?(modal?{}:null):nodes.get(selector),getElementById:()=>host},
    escapeHtml:String,save:()=>saves++,setTimeout:()=>++timers,clearTimeout:()=>{}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(new URL('../src/ui/notify.js',import.meta.url),'utf8'),context);
  return {context,advance:ms=>now+=ms,modal:value=>modal=value,counts:()=>({saves,inserts,timers}),value:expression=>vm.runInContext(expression,context)};
}
{
  const h=harness();
  for(let i=0;i<19;i++)h.context.suppressRoutineNotification('Stock purchased','success');
  assert.equal(h.value('notificationPromptOpen'),false);
  h.context.suppressRoutineNotification('Stock purchased','success');
  assert.equal(h.value('notificationPromptOpen'),true);
  assert(h.context.notificationPromptHtml().includes('90%'));
  h.context.notificationAction('notification-reduction','75');
  assert.equal(h.context.state.notificationReduction,75);
  assert.equal(h.counts().saves,1);
  assert.equal(h.value('notificationPromptOpen'),false);
  const dropped=Array.from({length:100},()=>h.context.suppressRoutineNotification('Stock purchased','success')).filter(Boolean).length;
  assert.equal(dropped,75);
  for(const kind of ['bad','warning','notice','blocked','milestone'])assert.equal(h.context.suppressRoutineNotification('Important message',kind),false);
  h.context.notificationAction('notification-reduction','100');
  const before=h.counts();h.context.showToast('Stock purchased','Routine update','success');
  assert.deepEqual(h.counts(),before,'Suppressed notifications must not create markup or timers');
  assert.equal(h.context.suppressRoutineNotification('Mining capacity lost to a fault','bad'),false);
  assert.equal(h.context.suppressRoutineNotification('Mining capacity lost to a fault','bad'),true);
  h.advance(60000);
  assert.equal(h.context.suppressRoutineNotification('Mining capacity lost to a fault','bad'),false);
  assert(h.value('notificationArrivals.length')<=20);
  h.context.notificationAction('notification-reduction','0');
  assert.equal(h.context.suppressRoutineNotification('Stock purchased','success'),false);
  h.context.notificationAction('notification-reduction','NaN');
  assert.equal(h.context.notificationReduction(),0);
}
{
  const h=harness();h.modal(true);
  for(let i=0;i<20;i++)h.context.suppressRoutineNotification('Stock purchased','success');
  assert.equal(h.context.notificationPromptHtml(),'','Do not cover a decision modal');
  h.modal(false);h.context.updateNotificationPrompt();assert.equal(h.counts().inserts,1);
  h.context.notificationAction('notification-prompt-close');
  for(let i=0;i<25;i++)h.context.suppressRoutineNotification('Stock purchased','success');
  assert.equal(h.value('notificationPromptOpen'),false,'Respect the prompt cooldown');
  h.advance(300001);
  for(let i=0;i<20;i++)h.context.suppressRoutineNotification('Stock purchased','success');
  assert.equal(h.value('notificationPromptOpen'),true);
  h.context.state.notificationReduction=50;assert.equal(h.context.notificationReduction(),50);
}
console.log('Notification volume checks passed: burst prompt, exact reduction, critical bypass, periodic fault alert, suppressed DOM work, modal deferral, cooldown and saved preference.');
