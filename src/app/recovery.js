"use strict";

/* RECOVERY - the page a player gets when the game could not start, and the debug text they can
   send us. Loaded FIRST, before any game code, and it uses none of it: if a script, a save
   migration or the first render throws, this is the only thing still guaranteed to work.

   Before launch week a throw during boot left a blank page on every visit, with no footer and
   no buttons, so the only way out was clearing site data. Now bootstrap.js sets
   `gameBooted` once the first render has drawn; if the page finishes loading without it,
   this takes over #app and offers three ways out. Nothing here ever deletes a save: starting a
   new run moves the stored text to the unreadable-save key first.

   It is deliberately plain ES5 with inline styles, so it still works if app.css never loaded. */
(function(){
  var SAVE="hashrate-genesis-save-v1",KEPT=SAVE+".unreadable",errors=[];
  window.gameBooted=false;

  function note(text){text=String(text).slice(0,300);if(errors.length<6&&errors.indexOf(text)<0)errors.push(text)}
  window.addEventListener("error",function(e){note((e.message||"Error")+(e.filename?" ("+e.filename.split("/").pop()+":"+e.lineno+")":""))});
  window.addEventListener("unhandledrejection",function(e){note("Unhandled: "+(e.reason&&e.reason.message||e.reason))});

  function version(){
    try{if(typeof APP_RELEASE!=="undefined")return APP_RELEASE}catch(e){}
    return (/(?:Alpha|Beta) [\d.]+/.exec(document.title)||[])[0]||"unknown";
  }
  function read(key){try{return localStorage.getItem(key)}catch(e){return null}}

  /* What a bug report should carry: where, on what, and what went wrong. No save data, no
     account, no location: the player pastes this into a report themselves. */
  window.debugInfoText=function(){
    var lines=["Timechain "+version()];
    try{if(typeof state!=="undefined"&&state&&typeof dateFmt==="function")lines.push("In-game date: "+dateFmt(state.time)+" · speed "+state.speed+" · tab "+(typeof activeTab!=="undefined"?activeTab:"?"))}catch(e){}
    try{if(typeof saveFailing!=="undefined")lines.push("Saving: "+(saveFailing?"BLOCKED by the browser":"ok"))}catch(e){}
    try{var raw=read(SAVE);lines.push("Save: "+(raw?Math.max(1,Math.round(raw.length/1024))+" KB":"none")+(read(KEPT)?" · an unreadable save is also kept":""))}catch(e){}
    lines.push("Browser: "+navigator.userAgent);
    lines.push("Window: "+window.innerWidth+"×"+window.innerHeight);
    lines.push("Booted: "+(window.gameBooted?"yes":"NO"));
    if(errors.length)lines.push("Errors: "+errors.join(" | "));
    return lines.join("\n");
  };

  window.copyDebugInfo=function(button){
    var text=window.debugInfoText(),done=function(ok){if(button){var was=button.getAttribute("data-label")||button.textContent;button.setAttribute("data-label",was);button.textContent=ok?"Copied":"Copy failed";setTimeout(function(){button.textContent=was},2200)}};
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){done(true)},function(){legacy()});return}
    }catch(e){}
    legacy();
    function legacy(){
      try{var t=document.createElement("textarea");t.value=text;t.style.cssText="position:fixed;opacity:0";document.body.appendChild(t);t.select();var ok=document.execCommand("copy");document.body.removeChild(t);done(ok)}catch(e){done(false)}
    }
  };

  window.downloadText=function(text,name){
    var blob=new Blob([text],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){URL.revokeObjectURL(url)},1000);
  };

  function show(){
    // Nothing more may tick or save behind this screen.
    try{state.speed=0}catch(e){}
    try{clearInterval(timer)}catch(e){}
    try{clearInterval(mempoolTimer)}catch(e){}
    var host=document.getElementById("app")||document.body;
    var css="font:15px/1.55 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#e7ecea;max-width:560px;margin:0 auto;padding:40px 20px";
    var btn="font-weight:600;font-size:14px;font-family:inherit;padding:11px 16px;border:1px solid #4a5a56;background:#111819;color:#e7ecea;border-radius:4px;cursor:pointer;margin:0 8px 8px 0";
    var prim=btn.replace("#111819","#f7931a").replace("#e7ecea","#090c0d").replace("#4a5a56","#f7931a");
    document.body.style.background="#090c0d";
    host.innerHTML='<div style="'+css+'"><h1 style="font-size:22px;margin:0 0 12px">Timechain could not start</h1>'+
      '<p>Something in this browser\'s stored game, or in the page itself, stopped it from opening. <b>Nothing has been deleted.</b> Your save is still in this browser, and you can download it before doing anything else.</p>'+
      '<p style="margin:16px 0"><button id="rc-export" style="'+btn+'">Export my save</button><button id="rc-new" style="'+btn+'">Start a new run</button><button id="rc-retry" style="'+prim+'">Try again</button></p>'+
      '<p style="color:#9aa8a4;font-size:13px">“Start a new run” moves the current save aside as an unreadable copy, then opens a fresh game; the copy stays in this browser, and the footer will offer to export it. If a reload does not help, please send us what is below.</p>'+
      '<pre id="rc-info" style="white-space:pre-wrap;word-break:break-word;background:#111819;border:1px solid #2a3633;padding:12px;font:12px/1.5 ui-monospace,Menlo,monospace;color:#c8d3cf"></pre>'+
      '<p><button id="rc-copy" style="'+btn+'">Copy debug info</button></p></div>';
    document.getElementById("rc-info").textContent=window.debugInfoText();
    document.getElementById("rc-retry").onclick=function(){location.reload()};
    document.getElementById("rc-copy").onclick=function(){window.copyDebugInfo(this)};
    document.getElementById("rc-export").onclick=function(){
      var raw=read(SAVE)||read(KEPT);
      if(!raw){this.textContent="There is no save to export";return}
      window.downloadText(raw,"timechain-save-raw.json");
    };
    document.getElementById("rc-new").onclick=function(){
      try{var raw=read(SAVE);if(raw)localStorage.setItem(KEPT,raw);localStorage.removeItem(SAVE)}catch(e){}
      location.reload();
    };
  }
  window.showRecoveryPage=show;
  window.addEventListener("load",function(){if(!window.gameBooted)show()});
})();
