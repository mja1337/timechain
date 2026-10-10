"use strict";

/* Fictional correspondence uses the existing custody findings. No random draws,
   transactions or external delivery. One letter per topic survives in the save;
   fixing and later reintroducing a finding updates its status without duplicate mail. */
const FREEBILL_LETTERS={
  "story-paid":{kind:"story",subject:"we are still here",paragraphs:[
    "you got us through a month with the bill covered from cash. i realise this is a modest announcement for a monetary revolution, but the electricity company has very traditional views about payment.",
    "there is a number for what we own and another number for what we can pay with today. i used to think this was needless bureaucracy. i have revised my position.",
    "Dennis says the important thing is to look successful. i would settle for remaining switched on.",
    "keep enough cash for the next bill. the experiment gets another month because somebody did the ordinary work. that somebody was you."
  ]},
  "story-pool":{kind:"story",subject:"we have acquired colleagues",paragraphs:[
    "you have joined a pool. Dennis calls this giving up. Dennis has been waiting for his own block with the expression of a man whose bus has been cancelled.",
    "pooling lets people share the proceeds of work instead of each waiting alone for a whole block. it does not make more bitcoin appear. it changes how the waiting, payment and accounting are shared.",
    "read the payout terms. some schemes pay for shares even when the pool is unlucky; others pay from the blocks it actually finds. a fee is easier to understand when you know which uncertainty somebody else is taking on.",
    "i remain in favour of independence. i am also in favour of knowing who owes us money. apparently these require separate columns."
  ]},
  "story-cold":{kind:"story",subject:"Dennis thinks the bitcoin is in the cupboard",paragraphs:[
    "you have moved coins to cold storage. Dennis asked whether the cupboard now weighs more.",
    "the coins are still recorded on the network. what you have moved away from the mining computer is the power to approve spending them. the cupboard contains a responsibility, not a little pile of digital coins.",
    "this is progress. a problem on the everyday computer no longer has to become a problem for the entire reserve. but recovery still needs enough surviving secrets and the instructions that fit them together.",
    "before we celebrate, check how long it takes to get those signatures when a bill arrives. Dennis says he can drive. i have asked him to establish which cupboard."
  ]},
  "story-asic":{kind:"story",subject:"the experiment has acquired an invoice",paragraphs:[
    "there is now a machine here whose entire purpose is to try hashes. no email. no solitaire. an unusually narrow career choice.",
    "purpose-built chips changed who could compete. more work per second matters, but only against the work everybody else brings. if they upgrade too, the new machine can leave you running harder for the same share.",
    "Dennis has proposed buying enough machines that this stops being a problem. i have asked him to include the electricity, the cooling and the room they would occupy.",
    "the idea that started on ordinary computers is growing into an industry. we can still choose what to trust. we just have more invoices to read before choosing."
  ]},
  hotkey:{subject:"your entire recovery department is one laptop",paragraphs:[
    "i checked your backup arrangements.",
    "there is a laptop.",
    "there is also a plan to continue owning the laptop. these are currently doing the same job.",
    "if its disk dies, we need another copy of the key. Dennis has offered to remember it, which is impressive because he has forgotten why he came round.",
    "make the backup. then we can discuss where to keep it. i have prepared a map and, for reasons i will explain later, crossed out the kettle."
  ]},
  unrecoverable:{subject:"we should rehearse the part where the computer dies",paragraphs:[
    "good news: the wallet can sign. less good news: i cannot see how we rebuild it after something breaks.",
    "a working device is evidence that it works today. Dennis says this is pessimistic. Dennis also keeps his spare house key inside the house.",
    "back up enough keys for the wallet's policy. if several keys share the job, keep the wallet configuration too. the recovery plan needs to work without the equipment it is supposed to replace."
  ]},
  fragile:{subject:"the backups share an address",paragraphs:[
    "i have counted the backups. then i counted the buildings. the second number has ruined my afternoon.",
    "a spare copy helps when a disk fails. it does less when the disk, the spare copy and the drawer containing both become the same insurance photograph.",
    "put enough recovery material somewhere that does not share the same fire, flood or break-in. then check who can read it there. Dennis knows a man with a lock-up. i have several follow-up questions."
  ]}
};
function syncCorrespondence(s,findings){
  if(!Array.isArray(s.correspondence))s.correspondence=[];
  const current=new Map(findings.map(f=>[f.id,f]));
  for(const [id,letter] of Object.entries(FREEBILL_LETTERS)){
    if(letter.kind==="story")continue;
    const finding=current.get(id),existing=s.correspondence.find(m=>m.id===id);
    if(finding){
      if(existing){existing.finding=finding.text;if(existing.resolvedAt!==null){existing.resolvedAt=null;existing.reopenedAt=s.time}}
      else s.correspondence.push({id,time:s.time,finding:finding.text,resolvedAt:null,reopenedAt:null});
    }else if(existing&&existing.resolvedAt===null)existing.resolvedAt=s.time;
  }
}
function updateCorrespondence(s=state){
  if(!s.started||!s.walletSetup?.done)return;
  syncCorrespondence(s,custodyPostureFindings(s));
  const beats={
    "story-paid":(s.operator?.solventMonths||0)>0,
    "story-pool":s.mode==="pool"&&s.time>=at("2010-12-16"),
    "story-cold":(s.wallets?.cold||0)>0,
    "story-asic":HARDWARE.some(h=>h.era==="ASIC"&&s.time>=at(h.date)&&(s.hardware?.[h.id]||0)>0)
  };
  for(const [id,reached] of Object.entries(beats)){
    if(reached&&!s.correspondence.some(m=>m.id===id))s.correspondence.push({id,time:s.time,kind:"story"});
  }
}
