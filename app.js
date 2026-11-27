/* Darts aktuell – Seitenlogik (Countdown, Spielplan, Checkout-Rechner, Weltmeister, Punkte-Rechner) */
new MutationObserver(()=>{for(const c of document.querySelectorAll('.stack td:not([data-l])')){let i=0,p=c;while(p=p.previousElementSibling)i+=p.colSpan;c.dataset.l=c.closest('table').rows[0].cells[i]?.textContent||''}}).observe(document,{childList:true,subtree:true});
{
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- Countdown ---------- */
if($('count')){

const START=new Date('2026-12-11T00:00:00+01:00'),END=new Date('2027-01-04T00:00:00+01:00');
const tick=()=>{
  const now=new Date();
  if(now>=END){$('count').style.display='none';$('countLabel').textContent='Die WM 2026/27 ist vorbei – danke fürs Mitfiebern!';return}
  if(now>=START){$('count').style.display='none';$('countLabel').textContent='Die WM läuft! Finale am Sonntag, 3. Januar, im Alexandra Palace.';return}
  let s=Math.floor((START-now)/1000);
  $('cd').textContent=Math.floor(s/86400);s%=86400;
  $('ch').textContent=String(Math.floor(s/3600)).padStart(2,'0');s%=3600;
  $('cm').textContent=String(Math.floor(s/60)).padStart(2,'0');
  $('cs').textContent=String(s%60).padStart(2,'0');
};
tick();const timer=setInterval(tick,1000);

}
/* ---------- Spielplan ---------- */
if($('phases')){

const two='13:30 · 20:00';
const PH=[
  {c:'',n:'1. Runde',bo:'Best of 5',sp:'11.–19. Dez · 64 Spiele',d:[['Fr 11.12.','20:00','2026-12-11'],['Sa 12.12.',two,'2026-12-12'],['So 13.12.',two,'2026-12-13'],['Mo 14.12.','20:00','2026-12-14'],['Di 15.12.',two,'2026-12-15'],['Mi 16.12.',two,'2026-12-16'],['Do 17.12.',two,'2026-12-17'],['Fr 18.12.',two,'2026-12-18'],['Sa 19.12.',two,'2026-12-19']]},
  {c:'',n:'2. Runde',bo:'Best of 5',sp:'20.–23. Dez · 32 Spiele',d:[['So 20.12.',two,'2026-12-20'],['Mo 21.12.',two,'2026-12-21'],['Di 22.12.',two,'2026-12-22'],['Mi 23.12.',two,'2026-12-23']]},
  {c:'g',n:'3. Runde',bo:'Best of 7',sp:'27.–29. Dez · 16 Spiele',d:[['So 27.12.',two,'2026-12-27'],['Mo 28.12.',two,'2026-12-28'],['Di 29.12.',two,'2026-12-29']]},
  {c:'g',n:'Achtelfinale',bo:'Best of 7',sp:'29.–30. Dez · 8 Spiele',d:[['Di 29.12.','20:00','2026-12-29'],['Mi 30.12.',two,'2026-12-30']]},
  {c:'r',n:'Viertel- & Halbfinale',bo:'Bo9 / Bo11',sp:'1.–2. Januar',d:[['Fr 01.01. VF',two,'2027-01-01'],['Sa 02.01. HF','20:30','2027-01-02']]},
  {c:'f',n:'Finale',bo:'Best of 13',sp:'Sonntag, 3. Januar',d:[['So 03.01.','21:00','2027-01-03']]}
];
const todayISO=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Berlin'});
$('phases').innerHTML=PH.map(p=>`<div class="ph ${p.c}${p.d.some(x=>x[2]===todayISO)?' today':''}"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h3>${p.n}</h3><span class="bo">${p.bo}</span></div><div class="sp">${p.sp}</div><ul>${p.d.map(x=>`<li${x[2]===todayISO?' style="font-weight:700"':''}><b>${x[0]}</b><span>${x[1]}</span></li>`).join('')}</ul></div>`).join('');

}
/* ---------- Checkout-Tabellen ---------- */
const TH=[];
for(let n=1;n<=20;n++){
  TH.push({v:n,l:String(n),k:'s',c:1.5});
  TH.push({v:2*n,l:'D'+n,k:'d',c:6,fin:true});
  const tc={20:0,19:1,18:2,17:2.5,16:3,15:4}[n];
  TH.push({v:3*n,l:'T'+n,k:'t',c:tc===undefined?7:tc});
}
TH.push({v:25,l:'25',k:'s',c:4});
TH.push({v:50,l:'Bull',k:'d',c:5,fin:true});
const RANK={D20:0,D16:.5,D18:1,D8:1.5,D12:1.5,D10:1.5,D4:2.5,D14:3,D6:4,D1:6,Bull:3.5};
const FIN=TH.filter(t=>t.fin).map(t=>({...t,r:RANK[t.l]??4.5}));
const B1={},B2={},B3={},pair={};
for(const f of FIN)if(!B1[f.v]||f.r<B1[f.v].cost)B1[f.v]={cost:f.r,d:[f]};
for(const a of TH)for(const f of FIN){const n=a.v+f.v,c=a.c+f.r;if(!B2[n]||c<B2[n].cost)B2[n]={cost:c,d:[a,f]}}
for(const a of TH)for(const b of TH){if(a.v<b.v)continue;const n=a.v+b.v,c=a.c+b.c;if(!pair[n]||c<pair[n].c)pair[n]={c,d:[a,b]}}
for(const f of FIN)for(const k in pair){const n=+k+f.v,c=pair[k].c+f.r;if(!B3[n]||c<B3[n].cost)B3[n]={cost:c,d:[...pair[k].d,f]}}
const suggest=(rem,left=3)=>{
  if(rem<2||rem>170)return null;
  if(B1[rem])return B1[rem].d;
  if(left>=2&&B2[rem])return B2[rem].d;
  if(left>=3&&B3[rem])return B3[rem].d;
  return null;
};
const chip=d=>`<span class="${d.k==='d'?'dbl':d.k==='t'?'tr':''}">${d.l}</span>`;

/* ---------- Checkout-Rechner UI ---------- */
if($('coin')){

const coShow=v=>{
  v=Math.max(2,Math.min(170,Math.round(+v||2)));
  $('conum').textContent=v;$('corange').value=v;
  const r=suggest(v);
  $('coroute').innerHTML=r?r.map(chip).join(''):'<span>Kein Finish</span>';
  $('conote').textContent=r?`${r.length} ${r.length===1?'Dart':'Darts'} bis zum Leg-Gewinn.`:'Diese Zahl lässt sich mit drei Darts nicht auf einem Doppel beenden – klassische „Bogey-Number“. Stell dir lieber ein gutes Finish für die nächste Aufnahme.';
};
$('coin').addEventListener('input',e=>{if(e.target.value)coShow(e.target.value)});
$('corange').addEventListener('input',e=>{$('coin').value=e.target.value;coShow(e.target.value)});
$('presets').innerHTML=[170,167,141,121,100,81,40,32].map(n=>`<button type="button" data-n="${n}">${n}</button>`).join('');
$('presets').addEventListener('click',e=>{const n=e.target.dataset.n;if(n){$('coin').value=n;coShow(n)}});
coShow(121);

}
/* ---------- Weltmeister ---------- */
if($('champs')){

const CH=[[2026,'Luke Littler','Gian van Veen','7:1'],[2025,'Luke Littler','Michael van Gerwen','7:3'],[2024,'Luke Humphries','Luke Littler','7:4'],[2023,'Michael Smith','Michael van Gerwen','7:4'],[2022,'Peter Wright','Michael Smith','7:5'],[2021,'Gerwyn Price','Gary Anderson','7:3'],[2020,'Peter Wright','Michael van Gerwen','7:3'],[2019,'Michael van Gerwen','Michael Smith','7:3']];
$('champs').innerHTML=CH.map(c=>`<tr><td>${c[0]}</td><td>${c[1]}</td><td>${c[2]}</td><td class="r">${c[3]}</td></tr>`).join('');

}
/* ---------- Dartboard ---------- */
if($('board')){

const ORDER=[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const P=(r,a)=>[(r*Math.sin(a)).toFixed(2),(-r*Math.cos(a)).toFixed(2)];
const wedge=(r1,r2,a1,a2)=>{const[x1,y1]=P(r2,a1),[x2,y2]=P(r2,a2),[x3,y3]=P(r1,a2),[x4,y4]=P(r1,a1);return`M${x1} ${y1}A${r2} ${r2} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z`};
const RINGS=[[16,99,1,'S'],[99,107,3,'T'],[107,162,1,'S'],[162,170,2,'D']];
let svg=`<defs><radialGradient id="rim" cx="50%" cy="40%" r="60%"><stop offset="0" stop-color="#2a2a2a"/><stop offset="1" stop-color="#050505"/></radialGradient><radialGradient id="shine" cx="35%" cy="25%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<circle r="226" fill="url(#rim)"/><circle r="226" fill="none" stroke="#3a3a3a" stroke-width="2"/>`;
/* Sichtbare Felder (nur Optik) und darüber unsichtbare Trefferflächen: Doppel-, Triple- und Bull-Felder sind zum Antippen doppelt so breit wie sie aussehen */
const HIT={S1:[19,95],T:[95,111],S2:[111,158],D:[158,174]};
let hits='',vid=0;
ORDER.forEach((n,i)=>{
  const a1=(i*18-9)*Math.PI/180,a2=(i*18+9)*Math.PI/180,even=i%2===0;
  RINGS.forEach(([r1,r2,m,t],ri)=>{
    const col=m===1?(even?'#141414':'#efe3c4'):(even?'#e1262f':'#1d8a4b'),id='v'+(vid++);
    svg+=`<path class="vis" id="${id}" d="${wedge(r1,r2,a1,a2)}" fill="${col}" pointer-events="none"/>`;
    const[h1,h2]=HIT[ri===0?'S1':ri===2?'S2':t];
    hits+=`<path class="seg" d="${wedge(h1,h2,a1,a2)}" fill="#000" fill-opacity="0" data-vis="${id}" data-v="${n*m}" data-l="${t==='S'?n:t+n}" data-k="${t.toLowerCase()}"><title>${t==='S'?'Single '+n:(t==='D'?'Double ':'Treble ')+n}</title></path>`;
  });
  const[x,y]=P(196,i*18*Math.PI/180);
  svg+=`<text x="${x}" y="${y}" fill="#efe3c4" font-family="Oswald,Impact,sans-serif" font-weight="700" font-size="24" text-anchor="middle" dominant-baseline="central" pointer-events="none">${n}</text>`;
});
svg+=`<circle class="vis" id="vbo" r="16" fill="#1d8a4b" pointer-events="none"/><circle class="vis" id="vbi" r="6.4" fill="#e1262f" pointer-events="none"/>
<g fill="none" stroke="#b9b9b9" stroke-opacity=".55" stroke-width=".9" pointer-events="none">${[6.4,16,99,107,162,170].map(r=>`<circle r="${r}"/>`).join('')}${ORDER.map((n,i)=>{const a=(i*18-9)*Math.PI/180,[x1,y1]=P(16,a),[x2,y2]=P(170,a);return`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`}).join('')}</g>
<circle r="226" fill="url(#shine)" pointer-events="none"/>
<g id="hits">${hits}<circle class="seg" r="19" fill="#000" fill-opacity="0" data-vis="vbo" data-v="25" data-l="25" data-k="s"><title>Single Bull 25</title></circle><circle class="seg" r="9.05" fill="#000" fill-opacity="0" data-vis="vbi" data-v="50" data-l="Bull" data-k="d"><title>Bullseye 50</title></circle></g>
<g id="marks" pointer-events="none"></g>`;
$('board').innerHTML=svg;
$('board').addEventListener('pointerover',e=>{const t=e.target.closest('.seg');document.querySelectorAll('#board .vis.hov').forEach(x=>x.classList.remove('hov'));if(t&&t.dataset.vis){const v=document.getElementById(t.dataset.vis);if(v)v.classList.add('hov')}});
$('board').addEventListener('pointerleave',()=>document.querySelectorAll('#board .vis.hov').forEach(x=>x.classList.remove('hov')));

/* ---------- Scorer (1–4 Spieler) ---------- */
const KEY='allyPallyScorer1';
const defNames=n=>Array.from({length:n},(_,i)=>`Spieler ${i+1}`);
const fresh=(start=501,names=defNames(2),pids)=>{const n=names.length,z=()=>Array(n).fill(0);return{start,names,pids:(pids||[]).slice(0,n).concat(Array(n).fill(null)).slice(0,n),gid:Date.now(),seq:0,legNo:0,vn:z(),rest:Array(n).fill(start),legs:z(),cur:0,starter:0,visit:[],pts:z(),darts:z(),m180:z(),hiCo:z(),msg:''}};
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){S=null}
if(!S||!Array.isArray(S.rest)||!Array.isArray(S.names)||S.rest.length!==S.names.length||S.names.length<1||S.names.length>4)S=fresh();
if(!Array.isArray(S.pids)||S.pids.length!==S.names.length)S.pids=Array(S.names.length).fill(null);if(!S.gid)S.gid=Date.now();if(!Array.isArray(S.vn))S.vn=Array(S.names.length).fill(0);S.seq=S.seq||0;S.legNo=S.legNo||0;
const N=()=>S.names.length,nxt=i=>(i+1)%N();
const hist=[];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const snap=()=>{hist.push(JSON.stringify(S));if(hist.length>300)hist.shift()};
const legWon=()=>{S.gid=Date.now();S.starter=nxt(S.starter);S.rest=Array(N()).fill(S.start);S.visit=[];S.cur=S.starter};

/* ---------- Spieler-Profile & Statistik (bleibt im Browser gespeichert) ---------- */
const PKEY='dartsProfiles1',PLANG=(window.DARTS_LANG||'de');
const PT={
 de:{guest:'Gast',newP:'+ Neuer Spieler …',askName:'Name des neuen Spielers:',title:'Meine Statistik',intro:'Lege dir einen Spieler an und wähle ihn oben im Punkte-Rechner aus. Jede Aufnahme wird gespeichert – auch wenn du eine Woche Pause machst, sind deine Werte beim nächsten Mal noch da.',none:'Noch kein Spieler angelegt.',create:'Spieler anlegen',namePh:'Dein Name',period:'Zeitraum',p:{g1:'Letztes Spiel',g2:'Vorletztes Spiel',g3:'Drittletztes Spiel',today:'Heute',d7:'7 Tage',d30:'30 Tage',all:'Gesamt'},sum:(g,v,l)=>`${g} ${g===1?'Spiel':'Spiele'} · ${l} ${l===1?'Leg':'Legs'} · ${v} ${v===1?'Aufnahme':'Aufnahmen'}`,same:'Alle deine bisherigen Würfe fallen in diesen Zeitraum – deshalb sind die Werte genauso wie bei „Gesamt“. Jedes Leg zählt als eigenes Spiel.',avg:'3-Dart-Average',f9:'First 9 Average',co:'Checkout-Quote',hiS:'Höchste Aufnahme',hiCo:'Höchstes Finish',best:'Bestes Leg',legs:'Legs gewonnen',dpl:'Darts pro Leg',m180:'180er',t140:'140+',t100:'100+',t60:'60+',trV:'Aufnahmen mit Triple',trR:'Triple-Quote',busts:'Busts',favD:'Lieblings-Doppel',favT:'Häufigstes Triple',visits:'Aufnahmen',darts:'Darts',trend:'Average der letzten Spiele',dist:'Verteilung der Aufnahmen',ach:'Erfolge',lastPlay:d=>d===0?'Zuletzt gespielt: heute':d===1?'Zuletzt gespielt: gestern':`Zuletzt gespielt: vor ${d} Tagen`,coNote:'Quote nur aus Würfen über Board oder Zahlenfeld',noData:'Für diesen Zeitraum gibt es noch keine Würfe. Wähle den Spieler oben im Punkte-Rechner aus und leg los.',rename:'Umbenennen',del:'Löschen',delQ:n=>`Spieler „${n}“ mit allen Statistiken löschen?`,exp:'Sicherung speichern',imp:'Sicherung laden',impOk:'Sicherung geladen.',bakT:'Sicherung',bakLast:d=>`Zuletzt gesichert am ${d}`,bakNever:'Noch nie gesichert – am besten jetzt einmal speichern.',bakDone:n=>`Gespeichert als „${n}“ (meist im Ordner Downloads). Auf einem anderen Gerät einfach mit „Sicherung laden“ öffnen.`,bakCopied:'Download nicht möglich – die Sicherung wurde stattdessen in die Zwischenablage kopiert.',impCnt:(p,v)=>`${p} neue Spieler, ${v} neue Aufnahmen übernommen.`,impSame:'Diese Sicherung ist schon komplett in diesem Browser – es gab nichts Neues zu übernehmen.',impBad:'Die Datei ist keine gültige Sicherung.',backup:'Deine Statistik liegt nur in diesem Browser. Speichere ab und zu eine Sicherung – damit nimmst du deine Werte auch aufs Handy, Tablet oder einen neuen PC mit.',vsBefore:(a,b)=>`Letzte 7 Tage ${a} – davor ${b}`,ins:{f9:(d)=>d>=0?`Dein Start ist stark: Die ersten 9 Darts liegen ${d.toFixed(1)} Punkte über deinem Schnitt.`:`Am Anfang verschenkst du Punkte: Die ersten 9 Darts liegen ${(-d).toFixed(1)} unter deinem Schnitt.`,co:q=>q<25?`Auf die Doppel lohnt sich Training: Nur ${q.toFixed(0)} % deiner Darts aufs Doppel sitzen.`:`Starke Doppel: ${q.toFixed(0)} % deiner Darts aufs Doppel sitzen.`,pause:(d,a,b)=>`Nach ${d} Tagen Pause: Dein letztes Spiel hatte ${a} Average, dein Schnitt davor ${b}.`},A:{first180:'Erste 180',ton:'100+ Finish',bull:'Bull-Finish',big:'170er-Finish',leg15:'Leg in 15 Darts',leg12:'Leg in 12 Darts',avg60:'Spiel mit 60+ Average',avg80:'Spiel mit 80+ Average',legs50:'50 Legs gewonnen',streak:'5 Tage gespielt'}},
 en:{guest:'Guest',newP:'+ New player …',askName:'Name of the new player:',title:'My stats',intro:'Create a player and select it in the scorer above. Every visit is saved – even after a week off, your numbers are still there next time.',none:'No player created yet.',create:'Create player',namePh:'Your name',period:'Period',p:{g1:'Last game',g2:'Game before',g3:'3rd last game',today:'Today',d7:'7 days',d30:'30 days',all:'All time'},sum:(g,v,l)=>`${g} ${g===1?'game':'games'} · ${l} ${l===1?'leg':'legs'} · ${v} ${v===1?'visit':'visits'}`,same:'All your darts so far fall into this period – that is why the numbers match “All time”. Every leg counts as a separate game.',avg:'3-dart average',f9:'First 9 average',co:'Checkout rate',hiS:'Highest visit',hiCo:'Highest checkout',best:'Best leg',legs:'Legs won',dpl:'Darts per leg',m180:'180s',t140:'140+',t100:'100+',t60:'60+',trV:'Visits with a treble',trR:'Treble rate',busts:'Busts',favD:'Favourite double',favT:'Most hit treble',visits:'Visits',darts:'Darts',trend:'Average of recent games',dist:'Score distribution',ach:'Achievements',lastPlay:d=>d===0?'Last played: today':d===1?'Last played: yesterday':`Last played: ${d} days ago`,coNote:'Rate only from darts entered via board or number pad',noData:'No darts in this period yet. Select the player in the scorer above and start throwing.',rename:'Rename',del:'Delete',delQ:n=>`Delete player “${n}” and all stats?`,exp:'Save backup',imp:'Load backup',impOk:'Backup loaded.',bakT:'Backup',bakLast:d=>`Last backup on ${d}`,bakNever:'Never backed up – best save one now.',bakDone:n=>`Saved as “${n}” (usually in your Downloads folder). On another device just open it with “Load backup”.`,bakCopied:'Download not possible – the backup was copied to the clipboard instead.',impCnt:(p,v)=>`${p} new players, ${v} new visits added.`,impSame:'This backup is already fully in this browser – nothing new to add.',impBad:'This file is not a valid backup.',backup:'Your stats are stored in this browser only. Download a backup now and then – you can also use it to move to another device.',vsBefore:(a,b)=>`Last 7 days ${a} – before ${b}`,ins:{f9:d=>d>=0?`Strong starts: your first 9 darts are ${d.toFixed(1)} above your average.`:`You leave points early: your first 9 darts are ${(-d).toFixed(1)} below your average.`,co:q=>q<25?`Doubles practice pays off: only ${q.toFixed(0)}% of your darts at a double hit.`:`Sharp on the doubles: ${q.toFixed(0)}% of your darts at a double hit.`,pause:(d,a,b)=>`After ${d} days off: your last game averaged ${a}, before that ${b}.`},A:{first180:'First 180',ton:'100+ checkout',bull:'Bull finish',big:'170 checkout',leg15:'15-dart leg',leg12:'12-dart leg',avg60:'Game with 60+ average',avg80:'Game with 80+ average',legs50:'50 legs won',streak:'Played on 5 days'}},
 nl:{guest:'Gast',newP:'+ Nieuwe speler …',askName:'Naam van de nieuwe speler:',title:'Mijn statistieken',intro:'Maak een speler aan en kies hem hierboven in het scorebord. Elke beurt wordt bewaard – ook na een week pauze staan je cijfers er de volgende keer nog.',none:'Nog geen speler aangemaakt.',create:'Speler aanmaken',namePh:'Jouw naam',period:'Periode',p:{g1:'Laatste spel',g2:'Spel daarvoor',g3:'Derde laatste spel',today:'Vandaag',d7:'7 dagen',d30:'30 dagen',all:'Totaal'},sum:(g,v,l)=>`${g} ${g===1?'spel':'spellen'} · ${l} legs · ${v} ${v===1?'beurt':'beurten'}`,same:'Al je pijlen tot nu toe vallen in deze periode – daarom zijn de cijfers gelijk aan „Totaal”. Elke leg telt als apart spel.',avg:'3-dart-gemiddelde',f9:'First 9-gemiddelde',co:'Uitgooi-percentage',hiS:'Hoogste beurt',hiCo:'Hoogste finish',best:'Beste leg',legs:'Legs gewonnen',dpl:'Pijlen per leg',m180:'180’s',t140:'140+',t100:'100+',t60:'60+',trV:'Beurten met triple',trR:'Triple-percentage',busts:'Busts',favD:'Favoriete dubbel',favT:'Vaakst geraakte triple',visits:'Beurten',darts:'Pijlen',trend:'Gemiddelde van de laatste spellen',dist:'Verdeling van de beurten',ach:'Prestaties',lastPlay:d=>d===0?'Laatst gespeeld: vandaag':d===1?'Laatst gespeeld: gisteren':`Laatst gespeeld: ${d} dagen geleden`,coNote:'Percentage alleen uit pijlen via bord of cijferveld',noData:'Nog geen pijlen in deze periode. Kies de speler hierboven in het scorebord en gooi.',rename:'Hernoemen',del:'Verwijderen',delQ:n=>`Speler „${n}” met alle statistieken verwijderen?`,exp:'Back-up opslaan',imp:'Back-up laden',impOk:'Back-up geladen.',bakT:'Back-up',bakLast:d=>`Laatste back-up op ${d}`,bakNever:'Nog nooit een back-up gemaakt – sla er nu eentje op.',bakDone:n=>`Opgeslagen als „${n}” (meestal in de map Downloads). Op een ander apparaat openen met „Back-up laden”.`,bakCopied:'Downloaden lukt niet – de back-up is naar het klembord gekopieerd.',impCnt:(p,v)=>`${p} nieuwe spelers, ${v} nieuwe beurten toegevoegd.`,impSame:'Deze back-up staat al helemaal in deze browser – er was niets nieuws.',impBad:'Dit bestand is geen geldige back-up.',backup:'Je statistieken staan alleen in deze browser. Download af en toe een back-up – daarmee kun je ook naar een ander apparaat.',vsBefore:(a,b)=>`Laatste 7 dagen ${a} – daarvoor ${b}`,ins:{f9:d=>d>=0?`Sterke start: je eerste 9 pijlen liggen ${d.toFixed(1)} boven je gemiddelde.`:`Je laat in het begin punten liggen: je eerste 9 pijlen liggen ${(-d).toFixed(1)} onder je gemiddelde.`,co:q=>q<25?`Dubbels trainen loont: maar ${q.toFixed(0)}% van je pijlen op een dubbel is raak.`:`Scherp op de dubbels: ${q.toFixed(0)}% van je pijlen op een dubbel is raak.`,pause:(d,a,b)=>`Na ${d} dagen pauze: je laatste spel had ${a} gemiddeld, daarvoor ${b}.`},A:{first180:'Eerste 180',ton:'100+ finish',bull:'Bull-finish',big:'170-finish',leg15:'Leg in 15 pijlen',leg12:'Leg in 12 pijlen',avg60:'Spel met 60+ gemiddelde',avg80:'Spel met 80+ gemiddelde',legs50:'50 legs gewonnen',streak:'Op 5 dagen gespeeld'}}
}[PLANG]||null;
const PTX=PT||{};
let PD;try{PD=JSON.parse(localStorage.getItem(PKEY))}catch(e){PD=null}
if(!PD||!Array.isArray(PD.players))PD={v:1,players:[],visits:[],legs:[]};
/* Einmalig: ältere Daten, in denen mehrere Legs als ein Spiel gespeichert sind, in einzelne Legs aufteilen */
const migrate=D=>{if(D.mig)return D;D.visits.forEach(v=>{if(v.lg!==undefined&&!String(v.g).includes('_'))v.g=v.g+'_'+v.lg});
  D.legs.forEach(l=>{if(String(l.g).includes('_'))return;let best=null;D.visits.forEach(v=>{if(v.pid===l.pid&&String(v.g).startsWith(l.g+'_')&&(!best||Math.abs(v.t-l.t)-(v.c?2000:0)<Math.abs(best.t-l.t)-(best.c?2000:0)))best=v});if(best)l.g=best.g});D.mig=1;return D};
if(!PD.mig){migrate(PD);try{localStorage.setItem(PKEY,JSON.stringify(PD))}catch(e){}}
const psave=()=>{if(PD.visits.length>30000)PD.visits=PD.visits.slice(-30000);if(PD.legs.length>6000)PD.legs=PD.legs.slice(-6000);try{localStorage.setItem(PKEY,JSON.stringify(PD))}catch(e){}};
const pById=id=>PD.players.find(p=>p.id===id);
const DBL=v=>(v>=2&&v<=40&&v%2===0)||v===50;
/* Aufnahme speichern: p = Platz am Board, ds = Darts (oder null bei Schnelleingabe), sc = gewertete Punkte, rb = Rest vorher */
const recVisit=(p,ds,sc,nd,rb,bust,co)=>{const pid=S.pids&&S.pids[p];if(!pid)return;
  const lastG=PD.visits.filter(v=>v.g===S.gid);if(lastG.length&&Date.now()-lastG[lastG.length-1].t>2*3600e3){const old=S.gid;S.gid=Date.now();PD.visits.forEach(v=>{if(v.g===old&&v.lg===undefined)v.g=S.gid})}
  S.vn[p]=(S.vn[p]||0)+1;
  PD.visits.push({pid,t:Date.now(),g:S.gid,u:S.seq,n:S.vn[p],s:bust?0:sc,d:nd,rb,b:bust?1:0,c:co?1:0,dl:ds?ds.map(x=>x.l):null});psave()};
const recLeg=w=>{S.names.forEach((_,p)=>{const pid=S.pids&&S.pids[p];if(!pid)return;
  const dn=PD.visits.filter(v=>v.pid===pid&&v.g===S.gid&&v.lg===undefined).reduce((a,v)=>a+v.d,0);
  PD.visits.forEach(v=>{if(v.pid===pid&&v.g===S.gid&&v.lg===undefined)v.lg=S.legNo});
  PD.legs.push({pid,t:Date.now(),g:S.gid,u:S.seq,w:p===w?1:0,d:dn,st:S.start})});S.legNo=(S.legNo||0)+1;S.vn=Array(N()).fill(0);psave()};
const pUndo=()=>{const keep=x=>!(x.g===S.gid&&x.u>S.seq);const a=PD.visits.length,b=PD.legs.length;PD.visits=PD.visits.filter(keep);PD.legs=PD.legs.filter(keep);if(a!==PD.visits.length||b!==PD.legs.length){PD.visits.forEach(v=>{if(v.g===S.gid&&v.lg!==undefined&&v.lg>=(S.legNo||0))delete v.lg});psave()}};
const pSelect=(p)=>{const ids=PD.players.map(x=>x.id);return`<select class="pprof" data-pp="${p}" aria-label="Profil"><option value="">${esc(PTX.guest||'Gast')}</option>${PD.players.map(x=>`<option value="${x.id}"${S.pids[p]===x.id?' selected':''}>${esc(x.name)}</option>`).join('')}<option value="__new">${esc(PTX.newP||'+')}</option></select>`};
const newPlayer=name=>{name=String(name||'').trim().slice(0,24);if(!name)return null;const id='p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);PD.players.push({id,name,c:Date.now()});psave();return id};

/* Auswertung */
let pView=null,pPer='all',pMsg='';
const LOC={de:'de-DE',en:'en-GB',nl:'nl-NL'}[PLANG]||'de-DE',DAY=864e5,fmt1=x=>isFinite(x)?x.toFixed(1):'–',pct=(a,b)=>b?(a/b*100):NaN;
const gameIds=pid=>{const o=[];for(let i=PD.visits.length-1;i>=0;i--){const v=PD.visits[i];if(v.pid===pid&&!o.includes(v.g))o.push(v.g)}return o};
const calc=(pid,per)=>{
  let V=PD.visits.filter(v=>v.pid===pid),L=PD.legs.filter(l=>l.pid===pid);
  if(/^g\d$/.test(per)){const g=gameIds(pid)[+per[1]-1];V=V.filter(v=>v.g===g);L=L.filter(l=>l.g===g)}
  else if(per==='today'){const t0=new Date().setHours(0,0,0,0);V=V.filter(v=>v.t>=t0);L=L.filter(l=>l.t>=t0)}
  else if(per==='d7'||per==='d30'){const t0=Date.now()-(per==='d7'?7:30)*DAY;V=V.filter(v=>v.t>=t0);L=L.filter(l=>l.t>=t0)}
  const sum=(a,f)=>a.reduce((x,y)=>x+f(y),0);
  const D=sum(V,v=>v.d),P=sum(V,v=>v.s),F=V.filter(v=>v.n<=3),fD=sum(F,v=>v.d),fP=sum(F,v=>v.s);
  const full=V.filter(v=>!v.b&&v.d===3&&!v.c);
  let att=0,hit=0,trD=0,detD=0,trV=0;const dbl={},tr={};
  V.forEach(v=>{if(!v.dl)return;let r=v.rb;let anyT=false;v.dl.forEach((l,i)=>{detD++;if(l[0]==='T'){trD++;anyT=true;tr[l]=(tr[l]||0)+1}
    if(DBL(r)){att++;if(v.c&&i===v.dl.length-1){hit++;dbl[l]=(dbl[l]||0)+1}}
    const val=l==='Bull'?50:l==='25'?25:l[0]==='D'?2*+l.slice(1):l[0]==='T'?3*+l.slice(1):+l;r-=val});if(anyT)trV++});
  const W=L.filter(l=>l.w),top=o=>{const e=Object.entries(o).sort((a,b)=>b[1]-a[1])[0];return e?`${e[0]} (${e[1]}×)`:'–'};
  const games=[...new Set(V.map(v=>v.g))].map(g=>{const x=V.filter(v=>v.g===g);return{g,t:x[x.length-1].t,a:sum(x,v=>v.d)?sum(x,v=>v.s)/sum(x,v=>v.d)*3:0,n:x.length}});
  return{V,L,D,avg:D?P/D*3:NaN,f9:fD?fP/fD*3:NaN,co:pct(hit,att),att,hit,hiS:Math.max(0,...V.filter(v=>!v.b).map(v=>v.s)),hiCo:Math.max(0,...V.filter(v=>v.c).map(v=>v.s)),best:W.length?Math.min(...W.map(l=>l.d)):NaN,
    legs:`${W.length} / ${L.length}`,dpl:W.length?sum(W,l=>l.d)/W.length:NaN,m180:full.filter(v=>v.s===180).length,t140:full.filter(v=>v.s>=140&&v.s<180).length,t100:full.filter(v=>v.s>=100&&v.s<140).length,t60:full.filter(v=>v.s>=60&&v.s<100).length,
    trV:V.filter(v=>v.dl).length?`${trV} (${fmt1(pct(trV,V.filter(v=>v.dl).length))} %)`:'–',trR:pct(trD,detD),busts:V.filter(v=>v.b).length,favD:top(dbl),favT:top(tr),games,
    dist:[[0,19],[20,39],[40,59],[60,79],[80,99],[100,139],[140,179],[180,180]].map(([a,b])=>[a===b?'180':`${a}–${b}`,full.filter(v=>v.s>=a&&v.s<=b).length])};
};
const spark=gs=>{const g=gs.slice(-20);if(g.length<2)return'';const W=320,H=80,mx=Math.max(...g.map(x=>x.a))*1.1||1,mn=Math.min(...g.map(x=>x.a))*.9;
  const pts=g.map((x,i)=>[i/(g.length-1)*W,H-(x.a-mn)/((mx-mn)||1)*H]);
  return`<svg class="pspark" viewBox="-6 -8 ${W+12} ${H+16}" role="img" aria-label="${esc(PTX.trend)}"><polyline fill="none" stroke="var(--red)" stroke-width="3" stroke-linejoin="round" points="${pts.map(p=>p.join(',')).join(' ')}"/>${pts.map((p,i)=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--green)"><title>${new Date(g[i].t).toLocaleDateString()} · ${g[i].a.toFixed(1)}</title></circle>`).join('')}</svg>`};
const achieve=pid=>{const V=PD.visits.filter(v=>v.pid===pid),L=PD.legs.filter(l=>l.pid===pid&&l.w),A=PTX.A||{};
  const gs=calc(pid,'all').games.filter(g=>g.n>=6),days=new Set(V.map(v=>new Date(v.t).toDateString())).size;
  return[['first180',V.some(v=>v.s===180&&!v.c)],['ton',V.some(v=>v.c&&v.s>=100)],['bull',V.some(v=>v.c&&v.dl&&v.dl[v.dl.length-1]==='Bull')],['big',V.some(v=>v.c&&v.s===170)],['leg15',L.some(l=>l.st===501&&l.d<=15)],['leg12',L.some(l=>l.st===501&&l.d<=12)],['avg60',gs.some(g=>g.a>=60)],['avg80',gs.some(g=>g.a>=80)],['legs50',L.length>=50],['streak',days>=5]]
    .map(([k,ok])=>`<li class="${ok?'ok':''}">${ok?'🏆':'🔒'} ${esc(A[k]||k)}</li>`).join('')};
const pExport=async()=>{
  const name=`darts-statistik-${new Date().toISOString().slice(0,10)}.json`,txt=JSON.stringify({...PD,bak:undefined,exported:Date.now()});
  const blob=new Blob([txt],{type:'application/json'});let ok=false;
  try{const f=new File([blob],name,{type:'application/json'});if(navigator.canShare&&navigator.canShare({files:[f]})&&/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)){await navigator.share({files:[f],title:name});ok=true}}catch(e){if(e&&e.name==='AbortError')return}
  if(!ok){try{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);ok=true}catch(e){}}
  if(!ok){try{await navigator.clipboard.writeText(txt);pMsg=PTX.bakCopied;PD.bak=Date.now();psave();pRender();return}catch(e){pMsg=PTX.impBad;pRender();return}}
  PD.bak=Date.now();psave();pMsg=PTX.bakDone(name);pRender()};
const pRender=()=>{const box=$('pstats');if(!box||!PT)return;
  if(pView&&!pById(pView))pView=null;if(!pView&&PD.players.length)pView=(S.pids||[]).find(Boolean)||PD.players[0].id;
  const tabs=PD.players.map(x=>`<button type="button" class="dchip${x.id===pView?' on':''}" data-pv="${x.id}">${esc(x.name)}</button>`).join('');
  let body='';
  if(!PD.players.length)body=`<p class="note">${esc(PTX.none)}</p>`;
  else{const gids=gameIds(pView);if(/^g\d$/.test(pPer)&&gids.length<+pPer[1])pPer='g1';const s=calc(pView,pPer),all=calc(pView,'all');const pl=pById(pView);
    const last=all.V.length?Math.floor((Date.now()-all.V[all.V.length-1].t)/DAY):null;
    const ins=[];
    if(isFinite(s.f9)&&isFinite(s.avg)&&s.V.length>=9&&Math.abs(s.f9-s.avg)>=3)ins.push(PTX.ins.f9(s.f9-s.avg));
    if(s.att>=15)ins.push(PTX.ins.co(s.co));
    const gs=all.games;if(gs.length>=2){const gap=Math.floor((gs[gs.length-1].t-gs[gs.length-2].t)/DAY);if(gap>=5){const prev=gs.slice(0,-1),pa=prev.reduce((a,g)=>a+g.a,0)/prev.length;ins.push(PTX.ins.pause(gap,gs[gs.length-1].a.toFixed(1),pa.toFixed(1)))}}
    const t7=Date.now()-7*DAY,a7=all.V.filter(v=>v.t>=t7),b7=all.V.filter(v=>v.t<t7),av=a=>{const d=a.reduce((x,v)=>x+v.d,0);return d?(a.reduce((x,v)=>x+v.s,0)/d*3).toFixed(1):'–'};
    const card=(k,v,big)=>`<div class="pcard${big?' big':''}"><b>${v}</b><span>${esc(PTX[k])}</span></div>`;
    const mxd=Math.max(1,...s.dist.map(d=>d[1]));
    body=`<div class="phead"><b>${esc(pl.name)}</b>${last!==null?`<span class="note">${esc(PTX.lastPlay(last))}${a7.length&&b7.length?' · '+esc(PTX.vsBefore(av(a7),av(b7))):''}</span>`:''}
      <span class="pact"><button type="button" class="tbtn" data-prn="${pl.id}">${esc(PTX.rename)}</button><button type="button" class="tbtn" data-pdel="${pl.id}">${esc(PTX.del)}</button></span></div>
      <div class="pper" role="group" aria-label="${esc(PTX.period)}">${Object.entries(PTX.p).filter(([k])=>!/^g\d$/.test(k)||gids.length>=+k[1]).map(([k,l])=>{const gt=/^g\d$/.test(k)?PD.visits.filter(v=>v.pid===pView&&v.g===gids[+k[1]-1]):null,when=gt&&gt.length?new Date(gt[0].t).toLocaleString(LOC,{weekday:'short',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'}):'';return`<button type="button" class="dchip${k===pPer?' on':''}${gt?' pgame':''}" data-pper="${k}" aria-pressed="${k===pPer}">${esc(l)}${when?`<small>${esc(when)}</small>`:''}</button>`}).join('')}</div>
      ${s.V.length?`<p class="psum">${esc(PTX.sum(new Set(s.V.map(v=>v.g)).size,s.V.length,s.L.length))}</p>${pPer!=='all'&&s.V.length===all.V.length&&s.L.length===all.L.length?`<p class="note psame">${esc(PTX.same)}</p>`:''}`:''}
      ${!s.V.length?`<p class="note">${esc(PTX.noData)}</p>`:`
      ${ins.length?`<ul class="pins">${ins.map(t=>`<li>${esc(t)}</li>`).join('')}</ul>`:''}
      <div class="pgrid">${card('avg',fmt1(s.avg),1)}${card('f9',fmt1(s.f9),1)}${card('co',isFinite(s.co)?fmt1(s.co)+' %':'–',1)}${card('legs',s.legs,1)}
      ${card('hiS',s.hiS||'–')}${card('hiCo',s.hiCo||'–')}${card('best',isFinite(s.best)?s.best+' '+PTX.darts:'–')}${card('dpl',fmt1(s.dpl))}
      ${card('m180',s.m180)}${card('t140',s.t140)}${card('t100',s.t100)}${card('t60',s.t60)}
      ${card('trV',s.trV)}${card('trR',isFinite(s.trR)?fmt1(s.trR)+' %':'–')}${card('favT',esc(s.favT))}${card('favD',esc(s.favD))}
      ${card('visits',s.V.length)}${card('darts',s.D)}${card('busts',s.busts)}</div>
      <p class="note">${esc(PTX.coNote)}</p>
      <div class="pcols"><div><h3>${esc(PTX.trend)}</h3>${spark(all.games)||'<p class="note">–</p>'}</div>
      <div><h3>${esc(PTX.dist)}</h3><div class="pdist">${s.dist.map(([l,n])=>`<div><span>${l}</span><i style="width:${n/mxd*100}%"></i><b>${n}</b></div>`).join('')}</div></div></div>`}
      <h3>${esc(PTX.ach)}</h3><ul class="pach">${achieve(pView)}</ul>`;}
  box.innerHTML=`<h2>${esc(PTX.title)}</h2><p class="note">${esc(PTX.intro)}</p>
    <form class="trow" id="pNew"><input id="pNewN" maxlength="24" placeholder="${esc(PTX.namePh)}" aria-label="${esc(PTX.namePh)}" required><button class="btn-r" type="submit">${esc(PTX.create)}</button></form>
    ${tabs?`<div class="ptabs">${tabs}</div>`:''}${body}
    <div class="pbak"><div class="pbak-ico" aria-hidden="true">💾</div><div class="pbak-txt"><b>${esc(PTX.bakT)}</b><p>${esc(PTX.backup)}</p><p class="pbak-when${PD.bak&&Date.now()-PD.bak<14*DAY?'':' warn'}">${esc(PD.bak?PTX.bakLast(new Date(PD.bak).toLocaleDateString({de:'de-DE',en:'en-GB',nl:'nl-NL'}[PLANG],{day:'numeric',month:'long',year:'numeric'})):PTX.bakNever)}</p></div>
    <div class="pbak-btns"><button type="button" class="pbtn" id="pExp">⬇ ${esc(PTX.exp)}</button><button type="button" class="pbtn ghost" id="pImpB">⬆ ${esc(PTX.imp)}</button><input type="file" id="pImp" hidden></div></div>
    ${pMsg?`<p class="pmsg" role="status">${esc(pMsg)}</p>`:''}`;
};
if($('pstats')&&PT){
  $('pstats').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if(b.id!=='pImpB'&&b.id!=='pExp')pMsg='';
    if(d.pv){pView=d.pv;pRender();return}
    if(d.pper){pPer=d.pper;pRender();return}
    if(d.prn){const p=pById(d.prn);const n=prompt(PTX.askName,p.name);if(n&&n.trim()){p.name=n.trim().slice(0,24);psave();S.pids.forEach((id,i)=>{if(id===p.id)S.names[i]=p.name});render()}return}
    if(d.pdel){const p=pById(d.pdel);if(p&&confirm(PTX.delQ(p.name))){PD.players=PD.players.filter(x=>x.id!==p.id);PD.visits=PD.visits.filter(v=>v.pid!==p.id);PD.legs=PD.legs.filter(l=>l.pid!==p.id);S.pids=S.pids.map(id=>id===p.id?null:id);psave();pView=null;render()}return}
    if(b.id==='pImpB'){$('pImp').click();return}
    if(b.id==='pExp'){pExport();return}
  });
  $('pstats').addEventListener('submit',e=>{if(e.target.id!=='pNew')return;e.preventDefault();const id=newPlayer($('pNewN').value);if(!id)return;pView=id;
    const free=S.pids.findIndex(x=>!x);if(free>=0){S.pids[free]=id;S.names[free]=pById(id).name}render()});
  $('pstats').addEventListener('change',e=>{if(e.target.id!=='pImp'||!e.target.files[0])return;const f=e.target.files[0];e.target.value='';const r=new FileReader();
    r.onerror=()=>{pMsg=PTX.impBad;pRender()};
    r.onload=()=>{try{let txt=String(r.result||'').replace(/^﻿/,'').trim();const x=JSON.parse(txt);if(!x||!Array.isArray(x.players)||!Array.isArray(x.visits)||!Array.isArray(x.legs))throw 0;migrate(x);
      const ids=new Set(PD.players.map(p=>p.id)),key=v=>v.pid+'|'+v.t+'|'+v.u;let np=0,nv=0;x.players.forEach(p=>{if(p&&p.id&&p.name&&!ids.has(p.id)){PD.players.push({id:String(p.id),name:String(p.name).slice(0,24),c:p.c||Date.now()});np++}});
      const have=new Set(PD.visits.map(key));x.visits.forEach(v=>{if(v&&v.pid&&!have.has(key(v))){PD.visits.push(v);nv++}});const hl=new Set(PD.legs.map(key));x.legs.forEach(l=>{if(l&&l.pid&&!hl.has(key(l)))PD.legs.push(l)});
      PD.visits.sort((a,b)=>a.t-b.t);PD.legs.sort((a,b)=>a.t-b.t);if(x.exported&&!(PD.bak>x.exported))PD.bak=x.exported;psave();pView=pView||(x.players[0]&&x.players[0].id)||null;pMsg=np||nv?PTX.impOk+' '+PTX.impCnt(np,nv):PTX.impSame;render();$('pstats').scrollIntoView({block:'start'})}catch(err){pMsg=PTX.impBad;pRender()}};r.readAsText(f)});
}

const endVisit=()=>{S.visit=[];S.cur=nxt(S.cur)};
const throwDart=(d,ev)=>{
  snap();S.msg='';S.seq++;
  const p=S.cur,before=S.rest[p]-S.visit.reduce((a,x)=>a+x.v,0),after=before-d.v;
  S.visit.push(d);S.darts[p]++;
  if(after<0||after===1||(after===0&&d.k!=='d')){
    S.darts[p]+=3-S.visit.length;
    S.msg=`Bust! ${S.names[p]} bleibt auf ${S.rest[p]}.`;
    recVisit(p,S.visit.slice(),0,3,S.rest[p],true,false);
    endVisit();
  }else if(after===0){
    const sum=S.visit.reduce((a,x)=>a+x.v,0);
    S.pts[p]+=sum;S.hiCo[p]=Math.max(S.hiCo[p],sum);S.legs[p]++;
    S.msg=`Game shot! ${S.names[p]} checkt ${sum} aus.`;
    recVisit(p,S.visit.slice(),sum,S.visit.length,S.rest[p],false,true);recLeg(p);
    legWon();
  }else if(S.visit.length===3){
    const sum=S.visit.reduce((a,x)=>a+x.v,0);
    recVisit(p,S.visit.slice(),sum,3,S.rest[p],false,false);
    S.pts[p]+=sum;S.rest[p]-=sum;if(sum===180){S.m180[p]++;S.msg='ONE HUNDRED AND EIGHTYYY!'}
    endVisit();
  }
  if(ev)mark(ev);
  render();
};
const mark=ev=>{
  const pt=$('board').createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;
  const m=$('board').getScreenCTM();if(!m)return;const q=pt.matrixTransform(m.inverse());
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',q.x);c.setAttribute('cy',q.y);c.setAttribute('r',4);c.setAttribute('fill','#ffd54a');c.setAttribute('class','hit');
  $('marks').appendChild(c);setTimeout(()=>c.remove(),400);
};
const quick=v=>{
  v=Math.round(v);if(!(v>=0&&v<=180)||[179,178,176,175,173,172,169,166,163].includes(v)){S.msg='Diese Aufnahme ist mit drei Darts nicht möglich.';render();return}
  if(S.visit.length){S.msg='Erst die angefangene Aufnahme beenden oder rückgängig machen.';render();return}
  snap();S.seq++;const p=S.cur,after=S.rest[p]-v;S.darts[p]+=3;S.msg='';
  if(after<0||after===1||(after===0&&!suggest(S.rest[p]))){S.msg=`Bust! ${S.names[p]} bleibt auf ${S.rest[p]}.`;recVisit(p,null,0,3,S.rest[p],true,false);S.cur=nxt(p)}
  else if(after===0){recVisit(p,null,v,3,S.rest[p],false,true);recLeg(p);S.pts[p]+=v;S.hiCo[p]=Math.max(S.hiCo[p],v);S.legs[p]++;S.msg=`Game shot! ${S.names[p]} checkt ${v} aus.`;legWon()}
  else{recVisit(p,null,v,3,S.rest[p],false,false);S.pts[p]+=v;S.rest[p]=after;if(v===180){S.m180[p]++;S.msg='ONE HUNDRED AND EIGHTYYY!'}S.cur=nxt(p)}
  render();
};

/* Zahlenfeld unter dem Board: Double/Triple wählen, dann Zahl antippen */
let mult=1,padLast={b:null,t:0};
const pad=$('pad');
const drawPad=()=>{
  if(!pad)return;
  const nums=[...Array(20)].map((_,i)=>i+1);
  pad.innerHTML=`<div class="padmod"><button type="button" data-m="2" class="${mult===2?'on':''}" aria-pressed="${mult===2}">Double</button><button type="button" data-m="3" class="${mult===3?'on':''}" aria-pressed="${mult===3}">Triple</button></div>
  <div class="padnums">${nums.map(n=>`<button type="button" data-n="${n}">${mult===2?'D':mult===3?'T':''}${n}</button>`).join('')}<button type="button" data-n="25" ${mult===3?'disabled':''}>${mult===2?'Bull':'25'}</button><button type="button" data-n="0">0</button><button type="button" class="padact" data-act="undo">Zurück</button><button type="button" class="padact" data-act="new">Neues Spiel</button></div>`;
};
if(pad){
  pad.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b||b.disabled)return;
    const nowT=Date.now();if(b.dataset.n&&b.dataset.n===padLast.b&&nowT-padLast.t<90)return;padLast={b:b.dataset.n,t:nowT};
    try{navigator.vibrate&&navigator.vibrate(8)}catch(_){}
    if(b.dataset.act){$(b.dataset.act==='undo'?'undo':'newleg').click();return}
    if(b.dataset.m){const m=+b.dataset.m;mult=mult===m?1:m;drawPad();return}
    const n=+b.dataset.n;
    let d;
    if(n===0)d={v:0,l:'0',k:'s'};
    else if(n===25)d=mult===2?{v:50,l:'Bull',k:'d'}:{v:25,l:'25',k:'s'};
    else d={v:n*mult,l:(mult===2?'D':mult===3?'T':'')+n,k:mult===2?'d':mult===3?'t':'s'};
    mult=1;drawPad();throwDart(d);
    const nb=pad.querySelector(`button[data-n="${n}"]`);if(nb){nb.classList.add('hit');setTimeout(()=>nb.classList.remove('hit'),140)}
  });
  drawPad();
}

const render=()=>{
  const live=S.visit.reduce((a,x)=>a+x.v,0);
  $('players').className='players n'+N();
  $('players').innerHTML=S.names.map((_,p)=>{
    const rest=S.rest[p]-(p===S.cur?live:0),avg=S.darts[p]?(S.pts[p]/S.darts[p]*3).toFixed(1):'–';
    return`<div class="pl ${p===S.cur?'on':''}"><span class="legs" title="Gewonnene Legs">${S.legs[p]}</span>
      <input data-p="${p}" value="${esc(S.names[p])}" aria-label="Name Spieler ${p+1}" maxlength="24">${PT?pSelect(p):''}
      <div class="rest">${rest}</div>
      <div class="stats"><span>Average<b>${avg}</b></span><span>180er<b>${S.m180[p]}</b></span><span>Top-Finish<b>${S.hiCo[p]||'–'}</b></span></div></div>`;
  }).join('');
  $('turn').textContent=`Am Board: ${S.names[S.cur]}`;
  $('darts').innerHTML=[0,1,2].map(i=>`<span class="${S.visit[i]?'f':''}">${S.visit[i]?esc(S.visit[i].l):'Dart '+(i+1)}</span>`).join('');
  $('visitsum').textContent=S.visit.length?`Aufnahme: ${live}`:'';
  const rem=S.rest[S.cur]-live,sg=suggest(rem,3-S.visit.length);
  $('sug').innerHTML=sg?`Finish-Weg: ${sg.map(d=>`<b>${d.l}</b>`).join('')}`:(rem<=170&&rem>1?'Kein Finish mit den restlichen Darts – gut stellen.':'');
  $('msg').textContent=S.msg||'';
  $('start').value=String(S.start);
  if($('pcount'))$('pcount').value=String(N());
  save();pRender();
};

$('board').addEventListener('click',e=>{const t=e.target.closest('.seg');if(t)throwDart({v:+t.dataset.v,l:t.dataset.l,k:t.dataset.k},e)});
$('miss').addEventListener('click',()=>throwDart({v:0,l:'0',k:'s'}));
$('undo').addEventListener('click',()=>{if(hist.length){S=JSON.parse(hist.pop());pUndo();S.msg='Letzte Eingabe zurückgenommen.';render()}});
$('newleg').addEventListener('click',()=>{snap();S=fresh(S.start,S.names,S.pids);S.msg='Neues Spiel – Game on!';render()});
$('start').addEventListener('change',e=>{snap();S=fresh(+e.target.value,S.names,S.pids);render()});
if($('pcount'))$('pcount').addEventListener('change',e=>{const n=+e.target.value;if(n>=1&&n<=4){snap();const names=defNames(n).map((d,i)=>S.names[i]||d);S=fresh(S.start,names,S.pids);S.msg=n===1?'Training: allein gegen die Uhr.':`Neues Spiel mit ${n} Spielern.`;render()}});
$('players').addEventListener('change',e=>{const pp=e.target.dataset.pp;if(pp!==undefined){const i=+pp;let id=e.target.value;if(id==='__new'){id=newPlayer(prompt(PTX.askName,S.names[i].startsWith('Spieler ')?'':S.names[i]))||null}
    if(id&&S.pids.some((x,j)=>x===id&&j!==i)){id=null}S.pids[i]=id;if(id){S.names[i]=pById(id).name;pView=id}render();return}
  const p=e.target.dataset.p;if(p!==undefined){S.names[+p]=e.target.value.trim()||`Spieler ${+p+1}`;render()}});
$('quick').addEventListener('submit',e=>{e.preventDefault();const v=$('qv').value;if(v!==''){quick(+v);$('qv').value=''}});
render();}

}
