"use strict";

/* THE FIRST KEY - the software key behind the online wallet.

   A run starts with a wallet because a block pays to an address and an address comes from a key. That
   key used to be a decoration of the opening ceremony: made, shown, and forgotten, so the hot wallet was
   a number with nothing behind it. It is a real key now, in the same list as every other key, and it has
   a real life.

   IT LIVES ON THE MINING COMPUTER. A software key is a file on the machine that runs the wallet, and
   that machine is at the mine. So the things that happen to the mine happen to it: a fire or a flood
   destroys the computer, a break-in takes it, and the disk can simply die. What saves the coins in
   every case is the same thing that saves any key: a backup that does not share the computer's fate.
   With one, a lost computer is an afternoon's work. Without one, the coins in the online wallet were
   the file, and the file is gone.

   IT IS NOT THE COLD WALLET. The wallet policy, the signers and the quorum are the reserve; this is
   the working balance, the one every payout lands in until the player decides otherwise. It is never
   assigned to a policy and has no device. Its backup is an ordinary backup, so it can be moved to a
   bank box, written on steel, lost in a fire or taken in a seizure like any other.

   An old save, and any run begun without the ceremony, has no first key, and everything behaves as it
   always did. Nothing here draws from the shared random stream: the monthly roll is a hash of the seed
   and the month, so a new rule cannot shift an existing seeded run.

   Loaded after places.js, whose incident function calls hotKeyAfterIncident. */

const HOT_DISK_RATE=.0015;                          // a month's chance that the machine holding the online wallet dies
const HOT_RECOVERY_BASE=120,HOT_RECOVERY_PER_DAY=40; // an afternoon's work, and a day's more for each day the backup is away
const HOT_THEFT_FLOOR=.5,HOT_THEFT_SPREAD=.4;        // the same share of a wallet a thief takes anywhere else in this game

/* THE FIRST TWO MONTHS ARE FREE OF THIS. A new player has coins in the online wallet from the first payout and
   no way yet to have learned what a backup is for, so a run could end its first month on a roll the player could
   neither see coming nor answer. Nothing in the online wallet can be lost, stolen or burnt for the first sixty
   days of a campaign; the warning to back it up still arrives the day the coins do. */
const HOT_GRACE_DAYS=60;
function hotKeyGrace(s=state){return s.time<(Number(s.campaignStart)||START)+HOT_GRACE_DAYS*DAY}

function hotKey(s=state){
  const c=s.custody;if(!c||!c.hotKeyId)return null;
  const key=(c.keys||[]).find(k=>k.id===c.hotKeyId);
  return key&&key.hot&&!key.retired?key:null;
}
function hotKeyBackedUp(s=state){const k=hotKey(s);return !!k&&!!k.backup&&!k.backup.destroyed}
/* The finding a lender or an insurer would read: coins in a wallet whose only copy is one disk. */
function hotKeyUnbacked(s=state){return !!hotKey(s)&&!hotKeyBackedUp(s)&&(s.wallets?.hot||0)>0}
/* The monthly chance the machine dies, which is what a backup answers. Zero without coins or without a first key. */
function hotKeyRisk(s=state){return hotKey(s)&&(s.wallets?.hot||0)>0?HOT_DISK_RATE:0}

/* Make the wallet. `keyHex` is the ceremony's result, of which only the first characters are kept to tell one
   wallet from another; the key itself is never stored or shown again. */
function createHotWallet(opts={}){
  const c=state.custody;if(!c||hotKey())return null;
  const n=(c.keys||[]).length+1,tier=WALLET_SOFTWARE[state.walletSoftware]||WALLET_SOFTWARE[0];
  const key={id:`k${n}`,label:nextKeyLabel(),seed:`s${n}`,bornOn:state.time,deviceUid:null,stateless:false,backup:null,weakEntropy:false,
    hot:true,software:tier.name,fingerprint:String(opts.keyHex||"").slice(0,8)};
  c.keys.push(key);c.hotKeyId=key.id;
  /* Written on paper at home, which at the start is the same place as the mine: a backup beside the thing it backs up. */
  if(opts.backup)key.backup={product:"paperbackup",durability:"paper",at:state.time,place:"home"};
  log(`Created the online wallet ${key.label}`,`${tier.name}${key.backup?" · written down":" · no backup yet"}`,"custody");
  return key;
}
/* A lost or stolen wallet is replaced by a fresh one, with a fresh key and no backup. The old key stays in the
   list, retired, so nothing that pointed at it breaks. */
function replaceHotKey(old){
  if(old)old.retired=true;
  state.custody.hotKeyId=null;
  const fresh=createHotWallet({});
  if(fresh)state.custody.hotWarned=false;
  return fresh;
}

/* ---- the machine dies, burns or is taken ------------------------------------------------------- */

const HOT_CAUSES={
  disk:["The disk holding your online wallet failed","the disk failed"],
  fire:["A fire destroyed the computer holding your online wallet","burned"],
  flood:["A flood destroyed the computer holding your online wallet","flooded"],
  burglary:["The computer holding your online wallet was stolen","was stolen"]
};
function hotKeyLost(cause,next=state.time,silent=false){
  const key=hotKey();if(!key)return;
  const hot=state.wallets.hot||0,[title,verb]=HOT_CAUSES[cause]||HOT_CAUSES.disk;
  if(custodyKeyRestorable(key)){
    const days=Math.max(0,custodyRestoreDays(key)),effort=hot>0?Math.min(state.cash,HOT_RECOVERY_BASE+HOT_RECOVERY_PER_DAY*days):0;
    state.cash-=effort;
    log("Online wallet restored",`${title.replace(/^The |^A /,"")} · restored from the backup${effort>0?` · -${fmtUsd(effort)}`:""}`,"custody");
    if(!silent&&hot>0)showToast("The computer is gone, and the wallet is not",
      `${title}. The backup rebuilt it for ${fmtUsd(effort)} and ${days} day${days===1?"":"s"} of fetching it. This is what a backup is for.`,"notice","custody");
    return "restored";
  }
  if(hot>0){
    state.wallets.hot=0;utxoState().hot=0;
    log("Online wallet lost",`-${fmtBtc(hot)} · the computer ${verb} and nothing else held the key`,"custody");
    const rate=cause==="disk"?HOT_DISK_RATE:placeRate("site",cause);
    reportCoinLoss({title:"The wallet was the file, and the file is gone",kind:"unrecoverable",btc:hot,cause:"nobackup",scene:cause,odds:{monthly:rate,note:"The chance was small whatever you did, but a backup kept away from the mine would have turned it into an afternoon's work."},from:"your online wallet",
      what:`${title}. Nothing else held the key, so ${fmtBtc(hot)} is still on the chain at addresses nobody can spend from.`,
      why:"A software key is a file. With one copy of it, the coins are exactly as safe as one disk, in one building.",
      remedy:"Write the key down and keep it somewhere the mine cannot reach: a copy in a bank box or a trusted person's house survives the thing that took the computer.",tab:"custody"});
  } else log("Online wallet replaced",`${title}. There was nothing in it`,"custody");
  replaceHotKey(key);
  return "lost";
}
/* A thief with the computer, or with the backup, has the key. What they sweep is gone; what is left is moved to a new wallet. */
function hotKeyStolen(cause,next=state.time,silent=false){
  const key=hotKey();if(!key)return;
  const hot=state.wallets.hot||0;
  if(hot>0){
    const taken=hot*(HOT_THEFT_FLOOR+HOT_THEFT_SPREAD*hashRoll(state.seed,"hottheft",cause,next));
    state.wallets.hot=Math.max(0,hot-taken);
    const who=cause==="seizure"?"The authorities":cause==="betrayal"?"Your friend":"Whoever took it";
    log("Online wallet emptied",`-${fmtBtc(taken)} · the key was taken`,"custody");
    reportCoinLoss({title:cause==="seizure"?"The authorities held the key to your online wallet":cause==="betrayal"?"Your friend copied the online wallet's recovery words":"The key to your online wallet was taken",kind:"stolen",btc:taken,cause,scene:cause,odds:cause==="burglary"?{monthly:placeRate("site","burglary"),note:"A break-in cannot be stopped from here, but what it finds can be limited: keep only a working balance in the online wallet."}:cause==="betrayal"?{monthly:placeRate("trusted","betrayal"),note:"A fictional friend-access risk equal to flooding at this house. A bank deposit box has no friend-access roll."}:null,from:"your online wallet",
      what:`${who} had the key to your online wallet, and ${fmtBtc(taken)} left within the day. You moved what was left to a new wallet.`,
      why:cause==="betrayal"?"Your friend could read the online wallet's recovery material. The original copy stayed intact, but copying the secret gave them the same spending authority.":"A software key that is not protected by anything but the room it is in belongs to whoever gets into the room.",
      remedy:"Keep the backup somewhere other than the computer, and keep the balance in the online wallet small: what you do not need this week belongs in cold storage.",tab:"custody"});
  } else log("Online wallet replaced","The key was taken. There was nothing in it","custody");
  replaceHotKey(key);
}
/* Called by every place incident, after the generic damage is done, so a backup the incident destroyed is already gone. */
function hotKeyAfterIncident(placeId,kind,next,silent=false){
  const key=hotKey();if(!key||hotKeyGrace())return;
  // Somebody took the seed backup: they hold the key, wherever the computer is.
  if((kind==="burglary"||kind==="seizure"||kind==="betrayal")&&key.exposed&&key.exposed.at===next)return hotKeyStolen(kind,next,silent);
  if(placeId!=="site")return;
  if(kind==="burglary")return hotKeyStolen("burglary",next,silent);
  return hotKeyLost(kind,next,silent);
}

/* ---- every month --------------------------------------------------------------------------------- */

function advanceHotKeyRisk(next,silent=false){
  const key=hotKey();if(!key||(state.wallets.hot||0)<=0)return;
  if(!hotKeyBackedUp()&&!state.custody.hotWarned){
    state.custody.hotWarned=true;
    log("Your online wallet has no backup",`${key.label} exists only on the mining computer`,"custody");
    if(!silent)showToast("Back up your wallet","Your first coins depend on a key held only on the mining computer. Bitcoin has no account-recovery desk if that disk dies. Make a backup, then keep it apart from the computer and private: the copy can restore access, but it can also give someone else access.","warning","custody");
  }
  if(hotKeyGrace())return;
  const month=new Date(next).toISOString().slice(0,7);
  if(hashRoll(state.seed,"hotdisk",month)<HOT_DISK_RATE)hotKeyLost("disk",next,silent);
}

/* An online key that was compromised is a key somebody else holds: the wallet moves to a new one. */
function hotKeyCompromised(){
  const key=hotKey();if(!key)return;
  log("Online wallet moved to a new key",`${key.label} was compromised; what was left is in a new wallet`,"custody");
  replaceHotKey(key);
}
