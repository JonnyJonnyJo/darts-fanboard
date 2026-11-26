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
ORDER.forEach((n,i)=>{
  const a1=(i*18-9)*Math.PI/180,a2=(i*18+9)*Math.PI/180,even=i%2===0;
  for(const[r1,r2,m,t]of RINGS){
    const col=m===1?(even?'#141414':'#efe3c4'):(even?'#e1262f':'#1d8a4b');
    svg+=`<path class="seg" d="${wedge(r1,r2,a1,a2)}" fill="${col}" data-v="${n*m}" data-l="${t==='S'?n:t+n}" data-k="${t.toLowerCase()}"><title>${t==='S'?'Single '+n:(t==='D'?'Double ':'Treble ')+n}</title></path>`;
  }
  const[x,y]=P(196,i*18*Math.PI/180);
  svg+=`<text x="${x}" y="${y}" fill="#efe3c4" font-family="Oswald,Impact,sans-serif" font-weight="700" font-size="24" text-anchor="middle" dominant-baseline="central" pointer-events="none">${n}</text>`;
});
svg+=`<circle class="seg" r="16" fill="#1d8a4b" data-v="25" data-l="25" data-k="s"><title>Single Bull 25</title></circle>
<circle class="seg" r="6.4" fill="#e1262f" data-v="50" data-l="Bull" data-k="d"><title>Bullseye 50</title></circle>
<g fill="none" stroke="#b9b9b9" stroke-opacity=".55" stroke-width=".9" pointer-events="none">${[6.4,16,99,107,162,170].map(r=>`<circle r="${r}"/>`).join('')}${ORDER.map((n,i)=>{const a=(i*18-9)*Math.PI/180,[x1,y1]=P(16,a),[x2,y2]=P(170,a);return`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`}).join('')}</g>
<circle r="226" fill="url(#shine)" pointer-events="none"/><g id="marks" pointer-events="none"></g>`;
$('board').innerHTML=svg;

/* ---------- Scorer (1–4 Spieler) ---------- */
const KEY='allyPallyScorer1';
const defNames=n=>Array.from({length:n},(_,i)=>`Spieler ${i+1}`);
const fresh=(start=501,names=defNames(2))=>{const n=names.length,z=()=>Array(n).fill(0);return{start,names,rest:Array(n).fill(start),legs:z(),cur:0,starter:0,visit:[],pts:z(),darts:z(),m180:z(),hiCo:z(),msg:''}};
let S;try{S=JSON.parse(localStorage.getItem(KEY))}catch(e){S=null}
if(!S||!Array.isArray(S.rest)||!Array.isArray(S.names)||S.rest.length!==S.names.length||S.names.length<1||S.names.length>4)S=fresh();
const N=()=>S.names.length,nxt=i=>(i+1)%N();
const hist=[];
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}};
const snap=()=>{hist.push(JSON.stringify(S));if(hist.length>300)hist.shift()};
const legWon=()=>{S.starter=nxt(S.starter);S.rest=Array(N()).fill(S.start);S.visit=[];S.cur=S.starter};

const endVisit=()=>{S.visit=[];S.cur=nxt(S.cur)};
const throwDart=(d,ev)=>{
  snap();S.msg='';
  const p=S.cur,before=S.rest[p]-S.visit.reduce((a,x)=>a+x.v,0),after=before-d.v;
  S.visit.push(d);S.darts[p]++;
  if(after<0||after===1||(after===0&&d.k!=='d')){
    S.darts[p]+=3-S.visit.length;
    S.msg=`Bust! ${S.names[p]} bleibt auf ${S.rest[p]}.`;
    endVisit();
  }else if(after===0){
    const sum=S.visit.reduce((a,x)=>a+x.v,0);
    S.pts[p]+=sum;S.hiCo[p]=Math.max(S.hiCo[p],sum);S.legs[p]++;
    S.msg=`Game shot! ${S.names[p]} checkt ${sum} aus.`;
    legWon();
  }else if(S.visit.length===3){
    const sum=S.visit.reduce((a,x)=>a+x.v,0);
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
  snap();const p=S.cur,after=S.rest[p]-v;S.darts[p]+=3;S.msg='';
  if(after<0||after===1||(after===0&&!suggest(S.rest[p]))){S.msg=`Bust! ${S.names[p]} bleibt auf ${S.rest[p]}.`;S.cur=nxt(p)}
  else if(after===0){S.pts[p]+=v;S.hiCo[p]=Math.max(S.hiCo[p],v);S.legs[p]++;S.msg=`Game shot! ${S.names[p]} checkt ${v} aus.`;legWon()}
  else{S.pts[p]+=v;S.rest[p]=after;if(v===180){S.m180[p]++;S.msg='ONE HUNDRED AND EIGHTYYY!'}S.cur=nxt(p)}
  render();
};

/* Zahlenfeld unter dem Board: Double/Triple wählen, dann Zahl antippen */
let mult=1;
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
    if(b.dataset.act){$(b.dataset.act==='undo'?'undo':'newleg').click();return}
    if(b.dataset.m){const m=+b.dataset.m;mult=mult===m?1:m;drawPad();return}
    const n=+b.dataset.n;
    let d;
    if(n===0)d={v:0,l:'0',k:'s'};
    else if(n===25)d=mult===2?{v:50,l:'Bull',k:'d'}:{v:25,l:'25',k:'s'};
    else d={v:n*mult,l:(mult===2?'D':mult===3?'T':'')+n,k:mult===2?'d':mult===3?'t':'s'};
    mult=1;drawPad();throwDart(d);
  });
  drawPad();
}

const render=()=>{
  const live=S.visit.reduce((a,x)=>a+x.v,0);
  $('players').className='players n'+N();
  $('players').innerHTML=S.names.map((_,p)=>{
    const rest=S.rest[p]-(p===S.cur?live:0),avg=S.darts[p]?(S.pts[p]/S.darts[p]*3).toFixed(1):'–';
    return`<div class="pl ${p===S.cur?'on':''}"><span class="legs" title="Gewonnene Legs">${S.legs[p]}</span>
      <input data-p="${p}" value="${esc(S.names[p])}" aria-label="Name Spieler ${p+1}" maxlength="24">
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
  save();
};

$('board').addEventListener('click',e=>{const t=e.target.closest('.seg');if(t)throwDart({v:+t.dataset.v,l:t.dataset.l,k:t.dataset.k},e)});
$('miss').addEventListener('click',()=>throwDart({v:0,l:'0',k:'s'}));
$('undo').addEventListener('click',()=>{if(hist.length){S=JSON.parse(hist.pop());S.msg='Letzte Eingabe zurückgenommen.';render()}});
$('newleg').addEventListener('click',()=>{snap();S=fresh(S.start,S.names);S.msg='Neues Spiel – Game on!';render()});
$('start').addEventListener('change',e=>{snap();S=fresh(+e.target.value,S.names);render()});
if($('pcount'))$('pcount').addEventListener('change',e=>{const n=+e.target.value;if(n>=1&&n<=4){snap();const names=defNames(n).map((d,i)=>S.names[i]||d);S=fresh(S.start,names);S.msg=n===1?'Training: allein gegen die Uhr.':`Neues Spiel mit ${n} Spielern.`;render()}});
$('players').addEventListener('change',e=>{const p=e.target.dataset.p;if(p!==undefined){S.names[+p]=e.target.value.trim()||`Spieler ${+p+1}`;render()}});
$('quick').addEventListener('submit',e=>{e.preventDefault();const v=$('qv').value;if(v!==''){quick(+v);$('qv').value=''}});
render();}

}
