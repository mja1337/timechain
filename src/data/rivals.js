"use strict";

/* DATA LAYER - named rival mining operators. Shares are illustrative colour for the
   "Mining industry landscape" card only; they never feed competitiveHashAt() or payouts. */
const RIVAL_OPERATORS=[
  {id:"bitmain",name:"Bitmain",blurb:"The dominant ASIC manufacturer of the 2010s - its own allocation windows are the same Bitmain-allocation friction already priced into hardware lead times on the Mine tab.",date:"2013-11-01",anchors:[["2014-12-31",.12],["2017-12-31",.32],["2021-12-31",.22],["2024-12-31",.15],["2026-08-08",.14]]},
  {id:"genesismining",name:"Genesis Mining",blurb:"Sold retail cloud-mining contracts to anyone with a browser, then quietly wound down as rising difficulty made the old contracts unprofitable.",date:"2014-01-01",anchors:[["2014-12-31",.06],["2016-12-31",.09],["2018-06-30",.03],["2019-12-31",.005]]},
  {id:"chinaminers",name:"China's mining collective",blurb:"Cheap hydro and coal power made China the centre of gravity for global hash rate for a decade, until a 2021 policy crackdown ended it almost overnight.",date:"2013-12-05",anchors:[["2014-12-31",.55],["2017-12-31",.65],["2020-12-31",.62],["2021-06-21",.35],["2021-12-31",.02]],exitEvent:"chinaexit"},
  {id:"computenorth",name:"Compute North",blurb:"A major U.S. mining host and colocation provider that expanded fast on cheap credit, then filed for Chapter 11 in September 2022.",date:"2018-01-01",anchors:[["2019-12-31",.03],["2021-12-31",.05],["2022-09-22",.04],["2022-12-31",.005]],exitEvent:"computenorthbankrupt"},
  {id:"corescientific",name:"Core Scientific",blurb:"One of the largest publicly traded U.S. miners, forced into Chapter 11 in December 2022 before emerging leaner the following year.",date:"2017-01-01",anchors:[["2018-12-31",.02],["2021-12-31",.06],["2022-12-21",.05],["2023-12-31",.03],["2026-08-08",.04]],exitEvent:"corescientificbankrupt"},
  {id:"riot",name:"Riot Platforms",blurb:"A large publicly traded U.S. miner whose Texas build-out grew big enough to matter to the same regional grid every nearby facility shares.",date:"2019-01-01",anchors:[["2020-12-31",.01],["2021-12-31",.03],["2023-12-31",.05],["2026-08-08",.07]]}
];
function rivalShareAt(id,t){
  const r=RIVAL_OPERATORS.find(x=>x.id===id);if(!r)return 0;
  const a=r.anchors.map(([d,v])=>[at(d),v]).sort((x,y)=>x[0]-y[0]);if(t<a[0][0])return 0;
  for(let i=0;i<a.length-1;i++){const [t0,v0]=a[i],[t1,v1]=a[i+1];if(t>=t0&&t<=t1){const f=(t-t0)/(t1-t0);return v0+(v1-v0)*f}}
  return a[a.length-1][1];
}
