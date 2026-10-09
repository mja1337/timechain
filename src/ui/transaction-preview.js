"use strict";

/* THE REVIEW A PLAYER SEES BEFORE A MONEY ACTION. Reads the button that was pressed and works out what it would
   give, receive and cost. Pulled out of actions.js, which is at its size ceiling. */

function transactionPreview(button){
  const action=button.dataset.action,id=button.dataset.id||null,base={action,id,from:button.dataset.from||null,to:button.dataset.to||null,resumeSpeed:state.speed,quoteTime:state.time};
  if(action==="transfer")return coldTransferPreview(button,base);
  if(action==="order-parts-bulk"){
    const part=sparePart(id);if(!part)return null;
    const qty=Math.max(1,Math.floor(Number(button.dataset.value)||1));
    const unit=sparePartCost(part),cost=unit*qty,lead=partsLeadDays();
    const have=state.maintenance.inventory[part.id]||0;
    const onOrder=state.maintenance.orders.filter(o=>(o.type||"fan")===part.id).reduce((sum,o)=>sum+o.qty,0);
    if(state.cash<cost){showToast("Not enough cash",`${fmtNum(qty)} ${part.name}${qty===1?"":"s"} cost ${fmtUsd(cost)}; you have ${fmtUsd(state.cash)}.`);return null}
    return{...base,qty,title:`Review bulk parts order · ${part.name}`,kicker:`Bulk order · ${lead}-day lead · quote locked`,
      give:fmtUsd(cost),giveSub:`${fmtNum(qty)} × ${fmtUsd(unit)} · ${formatPercent(cost/Math.max(1,state.cash)*100)} of liquid cash`,
      receive:`${fmtNum(qty)} ${part.name}${qty===1?"":"s"}`,receiveSub:`Arrives ${dateFmt(state.time+lead*DAY)} · ${have} in stock now${onOrder?` · ${fmtNum(onOrder)} already on order`:""}`,
      reference:`${fmtUsd(unit)} each`,fees:`${lead}-day lead time`,
      after:`${fmtNum(have+onOrder+qty)} on hand or inbound · ${fmtUsd(state.cash-cost)} cash left`,
      confirmLabel:`Order ${fmtNum(qty)} · ${fmtUsd(cost)}`};
  }
  if(action==="buy-btc"){
    if(state.time<MARKET)return null;const fraction=actionFraction(button),usd=state.cash*fraction,feeRate=venueTradeFee(id),price=priceAt(state.time);if(usd<1){showToast("Order too small","Increase the selected percentage so the buy order is at least $1.");return null}const isEtf=id==="etf",impact=isEtf?0:tradeImpact(usd,-1),btc=usd*(1-feeRate)/(price*(1+impact));
    return{...base,fraction,title:isEtf?"Review ETF purchase":`Review bitcoin purchase · ${walletName(id)}`,kicker:"Market buy · quote locked",give:fmtUsd(usd),giveSub:`${formatPercent(fraction*100)}% of ${fmtUsd(state.cash)} liquid cash`,receive:isEtf?`${fmtBtc(btc)} equivalent exposure`:fmtBtc(btc),receiveSub:isEtf?"Brokerage exposure · not withdrawable BTC":`Credited to ${walletName(id)}`,reference:`${fmtUsd(price)} per BTC`,fees:`${fmtUsd(usd*feeRate)} · ${(feeRate*100).toFixed(2)}%`,depth:impact>=.001?`${impactNote(impact)} · fills above the quote`:"",after:`${fmtUsd(state.cash-usd)} cash · ${fmtBtc(state.wallets[id]+btc)} position`,confirmLabel:"Confirm buy",confirmClass:"primary"}
  }
  if(action==="sell-btc"){
    if(venueFrozen(id)){showToast("Withdrawals frozen",`${walletName(id)} has paused withdrawals until ${dateFmt(state.ops.venueFreezes[id])}.`);return null}const fraction=actionFraction(button),btc=state.wallets[id]*fraction,feeRate=venueTradeFee(id),price=priceAt(state.time),gross=btc*price,isEtf=id==="etf",impact=isEtf?0:tradeImpact(gross,1),usd=gross*(1-feeRate)*(1-impact);if(btc<=0)return null;
    return{...base,fraction,title:isEtf?"Review ETF sale":`Review bitcoin sale · ${walletName(id)}`,kicker:"Market sell · quote locked",give:isEtf?`${fmtBtc(btc)} equivalent exposure`:fmtBtc(btc),giveSub:`${formatPercent(fraction*100)}% of the ${walletName(id)} position`,receive:fmtUsd(usd),receiveSub:"Added to liquid fiat after fees",reference:`${fmtUsd(price)} per BTC`,fees:`${fmtUsd(gross*feeRate)} · ${(feeRate*100).toFixed(2)}%`,depth:impact>=.001?`−${fmtUsd(gross*(1-feeRate)*impact)} · ${impactNote(impact)}`:"",after:`${fmtUsd(state.cash+usd)} cash · ${fmtBtc(state.wallets[id]-btc)} position`,confirmLabel:"Confirm sell",confirmClass:"danger"}
  }
  if(action==="buy-hw"||action==="buy-hw-btc"){
    const h=HARDWARE.find(item=>item.id===id);if(!h||h.permanent)return null;const payBtc=action==="buy-hw-btc",unitUsd=hardwareUnitCost(h),unit=payBtc?unitUsd/priceAt(state.time):unitUsd,balance=payBtc?state.wallets.hot:state.cash;let qty=Math.min(Math.max(1,Math.floor(Number(button.dataset.value)||1)),Math.floor(balance/unit),hardwareSupplyLimit(h));if(qty<1){showToast(payBtc?"Not enough hot BTC":"Purchase unavailable",payBtc?`One ${h.name} costs ${fmtBtc(unit)} at the locked quote.`:`There are no ${h.name} units available to buy right now.`);return null}const cost=unit*qty,terms=procurementTerms(h);
    return{...base,requested:qty,title:`Review miner purchase · ${h.name}`,kicker:`Hardware buy · ${terms.label}`,give:payBtc?fmtBtc(cost):fmtUsd(cost),giveSub:payBtc?`${fmtUsd(unitUsd*qty)} at ${fmtUsd(priceAt(state.time))}/BTC`:`${qty} × ${fmtUsd(unitUsd)} from liquid fiat`,receive:`${fmtCompactNumber(qty)} × ${h.name}`,receiveSub:`${fmtHash(h.hash*qty)} physical hash · delivery in ${terms.days} days`,reference:payBtc?`${fmtBtc(unit)} each`:`${fmtUsd(unitUsd)} each`,fees:"No modelled checkout fee",after:payBtc?`${fmtBtc(state.wallets.hot-cost)} hot BTC remains`:`${fmtUsd(state.cash-cost)} cash remains`,confirmLabel:"Confirm miner order",confirmClass:"primary"}
  }
  if(action==="sell-hw"||action==="sell-hw-btc"){
    const h=HARDWARE.find(item=>item.id===id),retired=state.decommissionedHardware?.[id]||0;if(!h||h.permanent||retired<1)return showToast("Retire miners first",`Move ${h?.name||"this hardware"} to storage before selling it.`);const qty=Math.min(Math.max(1,Math.floor(Number(button.dataset.value)||1)),retired),unit=resaleHardwareValue(h),value=unit*qty,payBtc=action==="sell-hw-btc",btc=payBtc?value/priceAt(state.time):0;
    return{...base,requested:qty,title:`Review miner sale · ${h.name}`,kicker:"Hardware sell · secondary-market quote",give:`${fmtCompactNumber(qty)} × ${h.name}`,giveSub:`${fmtHash(h.hash*qty)} physical hash leaves storage`,receive:payBtc?fmtBtc(btc):fmtUsd(value),receiveSub:payBtc?`${fmtUsd(value)} at ${fmtUsd(priceAt(state.time))}/BTC`:"Added to liquid fiat",reference:`${fmtUsd(unit)} resale per miner`,fees:"No modelled broker fee",after:payBtc?`${fmtCompactNumber(retired-qty)} retired miners · ${fmtBtc(state.wallets.hot+btc)} hot BTC`:`${fmtCompactNumber(retired-qty)} retired miners · ${fmtUsd(state.cash+value)} cash`,confirmLabel:"Confirm miner sale",confirmClass:"danger"}
  }
  if(action==="buy-strategy"){
    const security=strategySecurity(id),fraction=clamp(Number(button.dataset.value)||0,0.01,1),usd=state.cash*fraction,price=strategyPrice(id),shares=usd/price;if(!security||usd<1||price<=0)return null;
    return{...base,fraction,title:`Review ${security.ticker} purchase`,kicker:"Strategy security buy · model quote",give:fmtUsd(usd),giveSub:`${formatPercent(fraction*100)}% of liquid cash`,receive:`${shares.toFixed(4)} ${security.ticker} shares`,receiveSub:`Position value ${fmtUsd(strategyValue(id)+usd)}`,reference:`${fmtUsd(price)} per share`,fees:"No modelled brokerage fee",after:`${fmtUsd(state.cash-usd)} cash · ${((state.strategy[id]||0)+shares).toFixed(4)} shares`,confirmLabel:"Confirm security buy",confirmClass:"primary"}
  }
  if(action==="sell-strategy"){
    const security=strategySecurity(id),held=state.strategy[id]||0,fraction=clamp(Number(button.dataset.value)||0,0.01,1),shares=held*fraction,price=strategyPrice(id),gross=shares*price;if(!security||shares<=0)return null;
    return{...base,fraction,title:`Review ${security.ticker} sale`,kicker:"Strategy security sell · model quote",give:`${shares.toFixed(4)} ${security.ticker} shares`,giveSub:`${formatPercent(fraction*100)}% of the current position`,receive:fmtUsd(gross),receiveSub:"Added to liquid fiat",reference:`${fmtUsd(price)} per share`,fees:"No modelled brokerage fee",after:`${fmtUsd(state.cash+gross)} cash · ${(held-shares).toFixed(4)} shares`,confirmLabel:"Confirm security sale",confirmClass:"danger"}
  }
  if(action==="buy-node"){
    const level=Number(button.dataset.value),cost=level===2?1200:260,name=level===2?"Hardened node":"Dedicated full node";if(state.cash<cost)return null;
    return{...base,requested:level,title:`Review infrastructure purchase · ${name}`,kicker:"Node purchase",give:fmtUsd(cost),giveSub:"Paid from liquid fiat",receive:name,receiveSub:level===2?"Higher-throughput validation and relay infrastructure":"Independent validation when miners are manually stopped",reference:`${fmtUsd(cost)} fixed equipment cost`,fees:"No modelled checkout fee",after:`${fmtUsd(state.cash-cost)} liquid cash`,confirmLabel:"Confirm node purchase",confirmClass:"primary"}
  }
  if(action==="buy-backup-node"){
    if(state.cash<BACKUP_NODE.cost)return null;return{...base,title:"Review infrastructure purchase · geographic backup",kicker:"Remote node purchase",give:fmtUsd(BACKUP_NODE.cost),giveSub:"Paid from liquid fiat",receive:"Independent remote full node",receiveSub:`${BACKUP_NODE.watts} W remote load · ${fmtUsd(BACKUP_NODE.monthly)}/month ongoing`,reference:`${fmtUsd(BACKUP_NODE.cost)} deployment cost`,fees:"No modelled checkout fee",after:`${fmtUsd(state.cash-BACKUP_NODE.cost)} liquid cash`,confirmLabel:"Confirm backup-node purchase",confirmClass:"primary"}
  }
  return null;
}
