const $=s=>document.querySelector(s);
const S={g(k,d){try{const v=localStorage.getItem("dm3_"+k);return v===null?d:JSON.parse(v)}catch(e){return d}},
         s(k,v){try{localStorage.setItem("dm3_"+k,JSON.stringify(v))}catch(e){}}};
const ST={SCH:["Gepland","","Vlucht staat ingepland"],AIR:["Onderweg","","Toestel is airborne"],
EXP:["Tijd wijkt af","warn","Landing wijkt 10 min of meer af"],FIR:["In NL luchtruim","",""],
LND:["Geland","ok","Taxiet naar de gate"],FIB:["Eerste bagage","ok","Eerste koffer komt zo op de band"],
ARR:["Bagage klaar","ok","Bagageafhandeling afgerond"],DIV:["Uitgeweken","bad",""],
CNX:["Geannuleerd","bad",""],TOM:["Morgen","warn",""],DEL:["Vertraagd","bad","Vertrek wijkt meer dan 10 min af"],
WIL:["Wacht in lounge","warn",""],GTO:["Gate open","ok",""],BRD:["Boarding","ok",""],
GCL:["Gate sluit","warn",""],GTD:["Gate dicht","warn",""],DEP:["Vertrokken","ok",""],
GCH:["Gate gewijzigd","warn",""]};

let watch=S.g("watch",[]), snap=S.g("snap",{}), all=[], log=[], changed={};

const hhmm=s=>{if(!s)return null;const m=String(s).match(/T(\d{2}):(\d{2})/);return m?m[1]+":"+m[2]:null};
const mins=(a,b)=>Math.round((new Date(b)-new Date(a))/60000);

function sum(f){
  const dep=f.dir==="D";
  const e=dep?(f.publicEstimatedOffBlockTime||f.actualOffBlockTime)
             :(f.actualLandingTime||f.estimatedLandingTime);
  return{dep,dir:dep?"Vertrek":"Aankomst",route:(f.route||[]).join(" · ")||"—",
   eu:f.eu==="S"?"Schengen":f.eu==="E"?"Europa":f.eu==="N"?"Non-EU":"",
   planned:hhmm(f.scheduleDateTime),expected:hhmm(e),
   delay:(f.scheduleDateTime&&e)?mins(f.scheduleDateTime,e):0,
   gate:f.gate||"—",pier:f.pier||"",terminal:f.terminal||"",
   belt:(f.belts||[]).join(","),beltTime:hhmm(f.expectedTimeOnBelt),
   gateOpen:hhmm(f.expectedTimeGateOpen),boarding:hhmm(f.expectedTimeBoarding),
   gateClose:hhmm(f.expectedTimeGateClosing),ac:f.ac||"",reg:f.reg||"",states:f.states||[]};
}
function note(f,t){log.unshift({t:new Date().toTimeString().slice(0,5),f,txt:t});
 if(window.Notification&&Notification.permission==="granted"){try{new Notification(f,{body:t})}catch(e){}}
 renderLog()}
function diff(f,s){const o=snap[f];let ch=false;
 if(o){
  if(o.gate!==s.gate&&s.gate!=="—"){note(f,`Gate ${o.gate} → ${s.gate}`);ch=true}
  if(o.expected!==s.expected&&s.expected){
    note(f,`Tijd ${o.expected||o.planned} → ${s.expected}${s.delay>0?` (+${s.delay} min)`:""}`);ch=true}
  if(o.beltTime!==s.beltTime&&s.beltTime){note(f,`Band om ${s.beltTime}`);ch=true}
  (s.states||[]).filter(x=>!(o.states||[]).includes(x))
    .forEach(x=>{note(f,"Status: "+((ST[x]||[x])[0]));ch=true});
 }
 snap[f]={gate:s.gate,expected:s.expected,planned:s.planned,beltTime:s.beltTime,states:s.states};
 S.s("snap",snap);return ch}

$("#notify").onclick=async()=>{
  if(!("Notification" in window))return alert("Deze browser ondersteunt geen meldingen.");
  const p=await Notification.requestPermission();
  $("#notify").textContent=p==="granted"?"Meldingen aan ✓":"Meldingen geweigerd"};
$("#addBtn").onclick=()=>{
  const r=$("#add").value.toUpperCase().replace(/[^A-Z0-9]+/g," ").trim();
  if(!r)return;r.split(" ").forEach(f=>{if(f.length>=4&&!watch.includes(f))watch.push(f)});
  $("#add").value="";S.s("watch",watch);render()};
$("#add").addEventListener("keydown",e=>{if(e.key==="Enter")$("#addBtn").click()});
$("#refresh").onclick=()=>load();

async function load(){
  try{
    const r=await fetch("data.json?t="+Date.now());
    const j=await r.json();
    all=j.flights||[];
    const age=Math.round((Date.now()-new Date(j.updated))/60000);
    $("#dot").className="dot"+(age>15?" stale":"");
    $("#status").textContent=age<1?"zojuist bijgewerkt":`bijgewerkt ${age} min geleden`;
    watch.forEach(n=>{const f=all.find(x=>x.flightName===n);if(f)changed[n]=diff(n,sum(f))});
  }catch(e){$("#dot").className="dot off";$("#status").textContent="data.json niet gevonden"}
  render();renderSug();
}
function renderSug(){
  const now=new Date(), soon=all.filter(f=>{
    const t=new Date(f.scheduleDateTime); return t>now-30*60000 && t<now+4*3600000;
  }).slice(0,12);
  $("#sug").innerHTML = soon.length
    ? `<span class="sub" style="width:100%">Binnenkort · tik om te volgen</span>`+
      soon.map(f=>`<button data-n="${f.flightName}">${f.flightName} ${hhmm(f.scheduleDateTime)||""}</button>`).join("")
    : "";
  $("#sug").querySelectorAll("button").forEach(b=>b.onclick=()=>{
    if(!watch.includes(b.dataset.n)){watch.push(b.dataset.n);S.s("watch",watch);render()}});
}
function render(){
  const L=$("#list");
  if(!watch.length){L.innerHTML='<div class="empty">Voeg de vluchtnummers van je dienst toe.</div>';return}
  L.innerHTML=watch.map(n=>{
    const raw=all.find(x=>x.flightName===n);
    if(!raw)return `<div class="flight"><button class="x" data-n="${n}">×</button>
      <div class="fhead"><span class="fno">${n}</span><span class="pill">niet in de lijst van vandaag</span></div></div>`;
    const s=sum(raw), late=s.delay>=5;
    const pills=s.states.map(x=>{const[l,c,d]=ST[x]||[x,"",""];
      return `<span class="pill ${c}" title="${d||x}">${l}</span>`}).join("");
    const t=s.expected&&s.expected!==s.planned
      ?`<div class="v big" style="color:${late?'var(--bad)':'var(--ok)'}">${s.expected}</div><div class="strike">${s.planned}</div>`
      :`<div class="v big">${s.planned||"—"}</div>`;
    return `<div class="flight ${changed[n]?"changed":""}"><button class="x" data-n="${n}">×</button>
      <div class="fhead"><span class="fno">${n}</span>
        <span class="pill">${s.dir} ${s.route}</span>${s.eu?`<span class="pill">${s.eu}</span>`:""}${pills}
        ${late?`<span class="pill bad">+${s.delay} min</span>`:""}</div>
      <div class="grid">
        <div><div class="k">Tijd</div>${t}</div>
        <div><div class="k">Gate</div><div class="v big">${s.gate}</div></div>
        ${s.pier?`<div><div class="k">Pier</div><div class="v">${s.pier}</div></div>`:""}
        ${s.dep
          ?`${s.gateOpen?`<div><div class="k">Gate open</div><div class="v">${s.gateOpen}</div></div>`:""}
            ${s.boarding?`<div><div class="k">Boarding</div><div class="v">${s.boarding}</div></div>`:""}
            ${s.gateClose?`<div><div class="k">Gate dicht</div><div class="v">${s.gateClose}</div></div>`:""}`
          :`${s.belt?`<div><div class="k">Band</div><div class="v">${s.belt}</div></div>`:""}
            ${s.beltTime?`<div><div class="k">Band om</div><div class="v">${s.beltTime}</div></div>`:""}`}
        ${s.terminal?`<div><div class="k">Terminal</div><div class="v">${s.terminal}</div></div>`:""}
        ${s.ac?`<div><div class="k">Type</div><div class="v">${s.ac}</div></div>`:""}
        ${s.reg?`<div><div class="k">Reg</div><div class="v">${s.reg}</div></div>`:""}
      </div></div>`}).join("");
  L.querySelectorAll(".x").forEach(b=>b.onclick=()=>{
    watch=watch.filter(x=>x!==b.dataset.n);delete snap[b.dataset.n];
    S.s("watch",watch);S.s("snap",snap);render()});
}
function renderLog(){$("#log").innerHTML=log.length
  ?log.slice(0,40).map(l=>`<li><time>${l.t}</time><b>${l.f}</b> — ${l.txt}</li>`).join("")
  :'<li class="sub" style="border:0">Nog niets gewijzigd.</li>'}

render();renderLog();load();setInterval(load,60000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)load()});
