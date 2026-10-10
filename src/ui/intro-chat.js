"use strict";

/* A MESSAGE FROM A FRIEND, ON THE FIRST SCREEN.

   Nobody in 2009 found out about Bitcoin on the day it started. They heard about it a few weeks later, from a friend, usually
   a loud one. So the default start (Standard, 03 February 2009) is framed that way: it is a month after the Genesis Block, and
   what brings you to it is an IRC message from the friend who has read the mailing list and has views.

   It also does a job. It says in the friend's voice the things the first eighteen months run on: the coins will be free, nobody
   will buy them, the electricity will not be free, and the cash has to last. Easy starts on the Genesis Block itself, where there
   is only a whisper; Hard and Impossible are years on and do not get a message. */

function introChatLine(who,text,cls=""){return `<div class="irc-line ${cls}"><span class="irc-nick ${who==="you"?"irc-you":""}">&lt;${who}&gt;</span> ${text}</div>`}
function introChatHtml(mode){
  if(!mode||(mode.id!=="medium"&&mode.id!=="easy"))return "";
  const friend="claude1337",when=dateFmt(mode.start);
  const bar=`<div class="irc-bar"><span>freenode · #sound-money-and-sandwiches</span><span>${when} · ${mode.id==="medium"?"a month after the Genesis Block":"the day of the Genesis Block"}</span></div>`;
  const body=mode.id==="medium"
    ?[introChatLine(friend,"YOU. ARE YOU THERE. DROP EVERYTHING."),
      introChatLine(friend,"remember the thing i forwarded you in October? the cryptography list? the &quot;electronic cash&quot; paper?"),
      introChatLine(friend,"IT'S REAL. SOMEONE BUILT IT. it went live on the 3rd of January. it's called <b>BITCOIN</b>"),
      introChatLine(friend,"it's money but made of MATHS. no bank. no government. no little man in a suit who can say no"),
      introChatLine(friend,"your computer just <i>makes</i> it. you leave the program running. i left my laptop on over the weekend and it made fifty (50) of them. FIFTY"),
      introChatLine(friend,"i have checked what they're worth. nothing. nobody will buy them. nobody even knows what they are. <b>PERFECT.</b> that's how you know it's pure"),
      introChatLine(friend,"but the maths is free and the electricity is NOT, so bring cash. you'll need it to keep the lights on until somebody invents a shop"),
      introChatLine(friend,"i've sold my gold to buy a second laptop. i have also written to the Federal Reserve. just to say &quot;we have noticed&quot;"),
      introChatLine(friend,"my flat is now a sovereign micronation. population: me, a cat, and a man called grok69420 who doesn't know. you're the first citizen"),
      introChatLine(friend,"download it. leave it running. <b>do NOT tell grok69420</b>"),
      `<div class="irc-line"><span class="irc-nick irc-you">&lt;you&gt;</span> ...ok. ok, i'll have a look.<span class="irc-cursor" aria-hidden="true"></span></div>`]
    :[`<div class="irc-line irc-sys">* ${friend} has joined #sound-money-and-sandwiches</div>`,
      introChatLine(friend,"you're early. it's the 3rd of January and nothing has happened yet."),
      introChatLine(friend,"somebody has just made the first block of a thing called bitcoin. i only know because i read the mailing list at 4am like a normal person"),
      introChatLine(friend,"do not tell grok69420.")];
  return `<figure class="irc" aria-label="A chat message from a friend">${bar}<div class="irc-log" role="log">${body.join("")}</div></figure>`;
}
