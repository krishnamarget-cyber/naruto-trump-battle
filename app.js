const $=s=>document.querySelector(s);const DBPromise=fetch('cards.json').then(r=>r.json());
const STYLES={Taijutsu:['T_ATK','T_DEF'],Kunai:['K_ATK','K_DEF'],Special:['S_ATK','S_DEF'],Ninjutsu:['N_ATK','N_DEF'],Genjutsu:['G_ATK','G_DEF']};
const C={hp:10,maxHp:10,shield:0,threshold:2,temp:0,maxTemp:.5,recovery:1.125};
let db=[],G={mode:'local',difficulty:'Medium',rosters:[[],[]],captain:['',''],vice:['',''],confirmed:[false,false],used:[new Set(),new Set()],hp:[10,10],shield:[0,0],temp:[0,0],level:1,round:0,history:[],pick:['',''],style:['',''],status:'',currentPlayer:1};
const app=$('#app');const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};const card=id=>db.find(c=>c.id===id);const fmt=n=>(Math.round(n*100)/100).toFixed(2);const levelName=l=>l===6?'SPECIAL':`LEVEL ${l}`;
function page(html){app.innerHTML=`<section class="page">${html}</section>`;window.scrollTo(0,0)}function btn(text,fn,cls='btn'){return `<button class="btn ${cls}" onclick="${fn}">${text}</button>`}function portrait(c){return `assets/portraits/${c.id}.png`}
function menu(){page(`<div class="hero"><h1 class="gold">NARUTO</h1><h2>TRUMP BATTLE</h2><p class="muted">PASS & PLAY • 120 CARDS • SMART TEAM DRAFT</p></div><div class="stack" style="margin-top:22px">${btn('PASS & PLAY • 2 PLAYERS',"start('local')",'primary')}${btn('PLAY WITH COMPUTER',"difficulty()",'blue')}</div><p class="foot">MOBILE-FIRST • SIX-TIER CARD DRAFT</p>`)}
function difficulty(){page(`<h2 class="gold center">CHOOSE DIFFICULTY</h2><div class="stack">${['Easy','Medium','Hard'].map(x=>btn(x,`start('computer','${x}')`)).join('')}${btn('BACK', 'menu()')}</div>`)}
const MATCH_PRESETS={
 Quick:{label:'QUICK MATCH',perPlayer:10,distribution:{1:2,2:2,3:2,4:2,5:1,6:1}},
 Standard:{label:'STANDARD MATCH',perPlayer:15,distribution:{1:3,2:3,3:3,4:3,5:2,6:1}}
};
const ATTACK_FIELDS={Taijutsu:'T_ATK',Kunai:'K_ATK',Special:'S_ATK',Ninjutsu:'N_ATK',Genjutsu:'G_ATK'};
let DRAFT={mode:'Balanced Meta',preset:'Standard',poolSize:'random',audit:[]};
function start(mode,diff='Medium'){
 G={...G,mode,difficulty:diff,rosters:[[],[]],captain:['',''],vice:['',''],confirmed:[false,false],used:[new Set(),new Set()],hp:[10,10],shield:[0,0],temp:[0,0],level:1,round:0,history:[],pick:['',''],style:['',''],finished:false,reason:''};
 DRAFT={mode:'Balanced Meta',preset:'Standard',poolSize:'random',audit:[]};
 draftSetupScreen();
}
function draftSetupScreen(){
 const p=MATCH_PRESETS[DRAFT.preset];
 page(`<div class="hero"><div class="eyebrow">MATCH CONFIGURATION</div><h2 class="gold">BUILD YOUR TEAM POOL</h2><p class="muted">Each tier is reduced from 20 cards to a 15- or 16-card candidate pool. Your roster is then randomly drawn from that pool.</p></div>
 <section class="panel draft-settings">
  <h3 class="gold">1. MATCH PRESET</h3>
  <div class="preset-grid">${Object.entries(MATCH_PRESETS).map(([k,v])=>`<button class="preset-option ${DRAFT.preset===k?'active':''}" onclick="setDraftPreset('${k}')"><b>${v.label}</b><strong>${v.perPlayer} CARDS</strong><small>${Object.entries(v.distribution).map(([l,n])=>`L${l}:${n}`).join(' · ')}</small></button>`).join('')}</div>
  <h3 class="gold">2. SELECTION ALGORITHM</h3>
  <div class="draft-mode-grid">${['Balanced Meta','Dynamic Meta','Weakest Meta','Random'].map(m=>`<button class="draft-mode ${DRAFT.mode===m?'active':''}" onclick="setDraftMode('${m}')"><b>${m}</b><small>${m==='Balanced Meta'?'All five attack styles':m==='Dynamic Meta'?'Random three attack styles':' ' + (m==='Weakest Meta'?'Weakest three-style meta':'No stat ranking; random pool')}</small></button>`).join('')}</div>
  <h3 class="gold">3. CANDIDATE POOL SIZE</h3>
  <div class="pool-size-row"><div class="pool-size active">RANDOM 15 OR 16 CARDS</div></div>
  <p class="muted">Each tier independently receives a randomly sized 15- or 16-card candidate pool. The final roster draw is random.</p>
  <div class="draft-summary"><div><small>YOUR TEAM</small><b>${p.perPlayer} CARDS</b></div><div><small>OPPONENT</small><b>${p.perPlayer} CARDS</b></div><div><small>POOL PER TIER</small><b>15–16 / 20</b></div></div>
  ${btn('GENERATE CANDIDATE POOLS & DRAW TEAMS','generateDraft()','primary')}
  ${btn('BACK TO MAIN MENU','menu()','')}
 </section>`);
}
function setDraftPreset(k){if(!MATCH_PRESETS[k])return;DRAFT.preset=k;draftSetupScreen()}
function setDraftMode(m){if(!['Balanced Meta','Dynamic Meta','Weakest Meta','Random'].includes(m))return;DRAFT.mode=m;draftSetupScreen()}
function setPoolSize(n){return}
function average(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}
function styleStats(c){return Object.entries(ATTACK_FIELDS).map(([style,key])=>({style,key,value:Number(c[key])||0}))}
function cardMeta(c,tierCards){
 const styles=styleStats(c),vals=styles.map(x=>x.value),means=Object.keys(ATTACK_FIELDS).map(k=>average(tierCards.map(x=>Number(x[ATTACK_FIELDS[k]])||0)));
 const density=styles.filter((x,i)=>x.value>=means[i]).length;
 const avg=average(vals),floor=Math.min(...vals);
 return {avg,floor,density,styles};
}
function rankByStyle(tierCards,style,descending=true){
 const key=ATTACK_FIELDS[style];
 return [...tierCards].sort((a,b)=>descending?(Number(b[key])-Number(a[key])||a.id.localeCompare(b.id)):(Number(a[key])-Number(b[key])||a.id.localeCompare(b.id)));
}
function rankComposite(tierCards,descending=true){
 const metas=new Map(tierCards.map(c=>[c.id,cardMeta(c,tierCards)]));
 return [...tierCards].sort((a,b)=>{
  const A=metas.get(a.id),B=metas.get(b.id);
  const scoreA=A.avg*0.7+A.floor*0.2+A.density*0.1,scoreB=B.avg*0.7+B.floor*0.2+B.density*0.1;
  return (descending?-1:1)*(scoreA-scoreB)||a.id.localeCompare(b.id);
 });
}
function chooseThreeStyles(){
 const names=Object.keys(ATTACK_FIELDS);
 return shuffle(names).slice(0,3);
}
function buildTierCandidatePool(tier,mode,poolSize){
 const cards=tier.map(c=>({...c})),target=poolSize,selected=[],selectedIds=new Set(),holds=[],container=[];
 if(mode==='Random'){
  const randomPool=shuffle(cards).slice(0,target);
  const counts={high:0,medium:0,low:0};
  for(const c of cards){const d=cardMeta(c,cards).density;counts[d>=4?'high':d>=2?'medium':'low']++}
  return {cards:randomPool,styles:[],stages:randomPool.map(c=>({id:c.id,stage:'Random pool'})),density:counts};
 }
 const add=(c,stage)=>{if(c&&!selectedIds.has(c.id)&&selected.length<target){selectedIds.add(c.id);selected.push({card:c,stage});return true}return false};
 const addHold=(c,reason)=>{if(c&&!selectedIds.has(c.id)&&!holds.some(x=>x.card.id===c.id))holds.push({card:c,reason})};
 const chosenStyles=mode==='Balanced Meta'?Object.keys(ATTACK_FIELDS):mode==='Random'?[]:chooseThreeStyles();
 const direction=mode==='Weakest Meta'?false:true;
 const styleRanks={};
 for(const style of Object.keys(ATTACK_FIELDS))styleRanks[style]=rankByStyle(cards,style,true);

 // Phase 1 — style anchors: inspect up to the top five cards in each selected style.
 // Keep the strongest/weakest two distinct cards per style; later duplicates become Holds.
 if(mode!=='Random'){
  for(const style of chosenStyles){
   const rank=rankByStyle(cards,style,direction);
   let found=0;
   for(const c of rank.slice(0,5)){
    if(found<2){
     if(add(c,`P1 · ${style} ${direction?'top':'bottom'} anchor`))found++;
     else addHold(c,`P1 duplicate-style hold · ${style}`);
    }else addHold(c,`P1 reserve · ${style}`);
   }
  }
 }else{
  shuffle(cards).slice(0,Math.min(8,target)).forEach(c=>add(c,'P1 · random seed'));
 }

 // Phase 2 — promote Holds and containers, preferring candidates that add new style strengths.
 const holdsSorted=holds.slice().sort((a,b)=>{
  const A=cardMeta(a.card,cards),B=cardMeta(b.card,cards);
  return (direction?-1:1)*(A.avg-B.avg);
 });
 for(const h of holdsSorted){if(selected.length>=Math.min(10,target))break;add(h.card,'P2 · Hold promotion')}
 const comp=rankComposite(cards,direction);
 for(const c of comp){if(selected.length>=Math.min(10,target))break;if(!selectedIds.has(c.id))container.push(c)}
 for(const c of container)add(c,'P2 · container promotion');

 // Phase 3 — attack-density balance: include high, medium and low-density cards.
 const meta=new Map(cards.map(c=>[c.id,cardMeta(c,cards)]));
 const densityGroups={high:[],medium:[],low:[]};
 for(const c of cards){const d=meta.get(c.id).density;(d>=4?densityGroups.high:d>=2?densityGroups.medium:densityGroups.low).push(c)}
 for(const group of Object.values(densityGroups))group.sort((a,b)=>(direction?-1:1)*(meta.get(a.id).avg-meta.get(b.id).avg));
 const densityOrder=mode==='Weakest Meta'?['low','medium','high']:['high','medium','low'];
 let cursor=0;
 while(selected.length<Math.min(13,target)){
  let moved=false;
  for(const key of densityOrder){
   const c=densityGroups[key].find(x=>!selectedIds.has(x.id));
   if(c){add(c,`P3 · ${key} attack-density promotion`);moved=true;if(selected.length>=Math.min(13,target))break}
  }
  if(!moved)break;
  cursor++;
  if(cursor>cards.length)break;
 }

 // Phase 4 — final bonus candidates: reward balanced multi-style capability and useful specialist strength.
 const bonusRank=cards.map(c=>{
  const m=meta.get(c.id),styleRankSum=Object.keys(ATTACK_FIELDS).reduce((sum,style)=>{
   const r=styleRanks[style].findIndex(x=>x.id===c.id);
   return sum+(r<0?cards.length:r);
  },0);
  return {c,score:(direction?1:-1)*(m.avg*0.55+m.floor*0.25+m.density*0.12+(1-styleRankSum/(cards.length*5))*0.08)};
 }).sort((a,b)=>b.score-a.score);
 for(const x of bonusRank){if(selected.length>=target)break;add(x.c,'P4 · final bonus selection')}

 // Phase 5 — validate, de-duplicate, optional mode-specific filtering and exact pool size.
 // If any slot remains, fill from the remaining ranked candidates. The output order is randomized.
 if(selected.length<target){
  const fill=mode==='Random'?shuffle(cards):rankComposite(cards,direction);
  for(const c of fill){if(selected.length>=target)break;add(c,'P5 · validation fill')}
 }
 let final=selected.map(x=>({...x.card,_poolStage:x.stage}));
 if(final.length>target)final=final.slice(0,target);
 final=shuffle(final);
 return {cards:final,styles:chosenStyles,stages:selected.map(x=>({id:x.card.id,stage:x.stage})),density:{high:densityGroups.high.length,medium:densityGroups.medium.length,low:densityGroups.low.length}};
}
function generateDraft(){
 const preset=MATCH_PRESETS[DRAFT.preset],pools={},audit=[];
 for(let l=1;l<=6;l++){
  const tier=db.filter(c=>Number(c.level)===l);
  if(tier.length!==20){page(`<div class="panel danger">Tier ${levelName(l)} must contain exactly 20 source cards. Found ${tier.length}. No teams were generated.</div>${btn('BACK','draftSetupScreen()')}`);return}
  const tierPoolSize=15+Math.floor(Math.random()*2);
  const built=buildTierCandidatePool(tier,DRAFT.mode,tierPoolSize);
  const need=preset.distribution[l]*2;
  if(built.cards.length<need){page(`<div class="panel danger">Candidate pool for ${levelName(l)} is too small for this preset.</div>${btn('BACK','draftSetupScreen()')}`);return}
  const picked=shuffle(built.cards).slice(0,need);
  const split=shuffle(picked);
  const p1=split.slice(0,preset.distribution[l]),p2=split.slice(preset.distribution[l]);
  pools[l]={p1,p2};
  audit.push({level:l,pool:built.cards.length,styles:built.styles,need,selected:need,density:built.density,stages:built.stages,poolCards:built.cards.map(c=>({id:c.id,name:c.name}))});
 }
 for(let l=1;l<=6;l++){G.rosters[0].push(...pools[l].p1);G.rosters[1].push(...pools[l].p2)}
 G.currentPlayer=1;
 G.draftAudit=audit;
 G.matchPreset=DRAFT.preset;
 G.selectionMode=DRAFT.mode;
 G.candidatePoolSize='random 15–16 per tier';
 if(G.mode==='computer'){
  let r=shuffle(G.rosters[1]);G.captain[1]=r[0].id;G.vice[1]=r[1].id;G.confirmed[1]=true;
 }
 teamScreen();
}
function draftAuditScreen(){
 const rows=G.draftAudit||[];
 page(`<div class="hero"><div class="eyebrow">TEAM GENERATION REPORT</div><h2 class="gold">SELECTION AUDIT</h2><p class="muted">${G.selectionMode||'Balanced Meta'} · ${G.matchPreset||'Standard'} Match · Independent random 15/16-card pool per tier</p></div>
 <div class="panel"><h3 class="gold">FIVE-PHASE POOL CONSTRUCTION</h3>
 <ol class="draft-phases"><li><b>Phase 1 — Style anchors</b><span>Top or bottom two distinct cards per selected attack style, inspecting up to five positions. Duplicate-style candidates are held.</span></li><li><b>Phase 2 — Holds & promotions</b><span>Promote eligible held cards and fill from the container using the mode's strength direction.</span></li><li><b>Phase 3 — Attack density</b><span>Balance high, medium and low attack-density candidates.</span></li><li><b>Phase 4 — Final bonus</b><span>Fill remaining spaces using multi-style average, floor and density scoring.</span></li><li><b>Phase 5 — Validation</b><span>Remove duplicates, fill any gaps and shuffle the final candidate pool.</span></li></ol></div>
 <div class="panel"><h3 class="gold">TIER-BY-TIER RESULTS</h3>${rows.map(r=>`<div class="audit-tier"><div class="audit-tier-head"><b>${levelName(r.level)}</b><span>${r.pool} candidate cards</span></div><p>Styles: ${r.styles.length?r.styles.join(' · '):'Random selection'}</p><p>Density distribution: High ${r.density.high} · Medium ${r.density.medium} · Low ${r.density.low}</p><p>Randomly drawn for match: ${r.selected} total (${r.need/2} per player)</p><details><summary>View candidate cards</summary><div class="audit-card-list">${r.poolCards.map(c=>`<span>${c.id} · ${c.name}</span>`).join('')}</div></details></div>`).join('')}</div>
 ${btn('BACK TO TEAM SELECTION','teamScreen()','primary')}`);
}
function teamScreen(){let p=G.currentPlayer,roster=G.rosters[p-1];page(`<h2 class="gold center">PLAYER ${p} — TEAM SELECTION</h2><p class="muted center">Choose one Captain and one different Vice Captain. Your choices remain private.</p><div class="draft-meta-strip"><span>${G.matchPreset||'STANDARD'} MATCH</span><span>${G.selectionMode||'BALANCED META'}</span><span>15–16 POOL / TIER</span></div>${btn('VIEW SELECTION AUDIT','draftAuditScreen()','blue')}<div class="rolebar"><div class="rolepill">★ Captain: <b id="captain-name">${card(G.captain[p-1])?.name||'Not selected'}</b></div><div class="rolepill">☆ Vice: <b id="vice-name">${card(G.vice[p-1])?.name||'Not selected'}</b></div></div><div id="msg" class="status"></div><div>${roster.map(c=>teamCard(c,p)).join('')}</div>${btn('CONFIRM TEAM',`confirmTeam(${p})`,'primary')}`)}
function teamCard(c,p){let cap=G.captain[p-1]===c.id,vice=G.vice[p-1]===c.id;return `<article class="card ${cap?'captain-card':vice?'vice-card':''}"><img class="portrait" src="${portrait(c)}" onerror="this.style.visibility='hidden'"><div><div class="cardname">${c.name}</div><div class="muted">${c.id} • ${levelName(c.level)}</div><div class="stats">${['T_ATK','T_DEF','K_ATK','K_DEF','S_ATK','S_DEF','N_ATK','N_DEF','G_ATK','G_DEF'].map(k=>`${k} ${c[k]}`).join(' · ')}</div><div class="rolebtns"><button type="button" class="btn role-choice ${cap?'blue selected':''}" data-role="cap" data-card="${c.id}" onclick="setRole(${p},'cap','${c.id}')">${cap?'✓ CAPTAIN':'★ Captain'}</button><button type="button" class="btn role-choice ${vice?'green selected':''}" data-role="vice" data-card="${c.id}" onclick="setRole(${p},'vice','${c.id}')">${vice?'✓ VICE CAPTAIN':'☆ Vice Captain'}</button></div></div></article>`}
function refreshRoleButtons(p){
  const i=p-1,capId=G.captain[i],viceId=G.vice[i];
  document.querySelectorAll('.role-choice').forEach(el=>{
    const id=el.dataset.card,role=el.dataset.role;
    const selected=(role==='cap'&&id===capId)||(role==='vice'&&id===viceId);
    const conflict=(role==='cap'&&id===viceId)||(role==='vice'&&id===capId);
    el.classList.toggle('blue',selected&&role==='cap');
    el.classList.toggle('green',selected&&role==='vice');
    el.classList.toggle('selected',selected);
    el.classList.toggle('role-conflict',conflict);
    el.disabled=conflict||G.confirmed[i];
    el.textContent=selected?(role==='cap'?'✓ CAPTAIN':'✓ VICE CAPTAIN'):(role==='cap'?'★ Captain':'☆ Vice Captain');
    const cardEl=el.closest('.card');
    if(cardEl){cardEl.classList.toggle('captain-card',id===capId);cardEl.classList.toggle('vice-card',id===viceId)}
  });
  const cap=document.getElementById('captain-name'),vice=document.getElementById('vice-name');
  if(cap)cap.textContent=card(capId)?.name||'Not selected';
  if(vice)vice.textContent=card(viceId)?.name||'Not selected';
}
function setRole(p,role,id){
  const i=p-1;
  if(p!==G.currentPlayer||G.confirmed[i]||(role!=='cap'&&role!=='vice'))return;
  const otherId=role==='cap'?G.vice[i]:G.captain[i];
  if(id===otherId){const msg=$('#msg');if(msg)msg.textContent='Captain and Vice Captain must be different cards.';return}
  G[role==='cap'?'captain':'vice'][i]=id;
  refreshRoleButtons(p);
  const chosen=card(id),msg=$('#msg');
  if(msg)msg.textContent=(role==='cap'?'Captain':'Vice Captain')+' selected: '+(chosen?.name||id)+'. Selection saved.';
}
function confirmTeam(p){let i=p-1;if(!G.captain[i]||!G.vice[i]){$('#msg').textContent='Choose both roles first.';return}if(G.captain[i]===G.vice[i])return;G.confirmed[i]=true;if(G.mode==='computer'){readyScreen()}else if(p===1){handover('team',2)}else{readyScreen()}}
function handover(kind,next){page(`<div class="hero" style="margin-top:15vh"><h2 class="gold">${kind==='team'?'PLAYER 1 TEAM LOCKED':'PLAYER 1 CHOICE LOCKED'}</h2><h3>PASS THE DEVICE TO PLAYER ${next}</h3><p class="muted">Private selections are hidden. Continue only when Player ${next} has the device.</p>${btn(`PLAYER ${next} — I'M READY`,kind==='team'?`G.currentPlayer=2;teamScreen()`:'battleScreen(2)','primary')}</div>`)}
function readyScreen(){page(`<div class="hero" style="margin-top:15vh"><h2 class="gold">BOTH TEAMS LOCKED</h2><p>${G.mode==='computer'?'Your team is ready. The computer is your opponent.':'Both teams are hidden. Pass the device to Player 1 to begin battle.'}</p>${btn('PLAYER 1 — BATTLE ENTRY','battleScreen(1)','primary')}</div>`)}
function teamState(p){return `<div class="panel"><b>PLAYER ${p} STATUS</b>${bar('HP',G.hp[p-1],10,'#22c55e')}${bar('SHIELD',G.shield[p-1],2,'#3b82f6')}${bar('TEMP HP',G.temp[p-1],.5,'#a855f7')}</div>`}function bar(label,v,max,color){return `<div class="statline"><span>${label}</span><b>${fmt(v)} / ${fmt(max)}</b></div><div class="bar"><div class="fill" style="width:${Math.max(0,Math.min(100,v/max*100))}%;background:${color}"></div></div>`}
function battleScreen(p,reset=true){G.currentPlayer=p;if(reset){G.pick[p-1]='';G.style[p-1]='Taijutsu'}let available=G.rosters[p-1].filter(c=>c.level===G.level&&!G.used[p-1].has(c.id));page(`<div class="hero"><b class="gold">NINJA BATTLE ARENA</b><div class="row"><b>PLAYER 1</b><b class="gold">VS</b><b>${G.mode==='computer'?'COMPUTER':'PLAYER 2'}</b></div><small>ROUND ${G.round+1} • ${levelName(G.level)}</small></div><h2 class="gold">PLAYER ${p} — CHOOSE YOUR FIGHTER</h2><p class="muted">Select a fighter, then an attack style. Your choice stays hidden until both sides commit.</p>${btn('VIEW MY PRIVATE CARD STATUS',`statusScreen(${p})`)}${btn(`BATTLE HISTORY (${G.history.length})`,`historyScreen(${p})`)}<div class="resultrow">${teamState(1)}${teamState(2)}</div><div class="panel shield-control"><b class="gold">MANUAL SHIELD</b><p class="muted">Spend 2.00 shield whenever you want to restore HP and temporary HP.</p><button class="btn blue" type="button" onclick="activateShield(${p})" ${G.shield[p-1]+0.000001<2?'disabled':''}>USE SHIELD • 2.00</button></div><h3 class="gold">AVAILABLE FIGHTERS • CURRENT LEVEL</h3>${available.length?available.map(c=>`<article class="card"><img class="portrait" src="${portrait(c)}"><div><div class="cardname">${c.name}</div><div class="muted">${c.id} • ${levelName(c.level)}</div>${G.captain[p-1]===c.id?'<div class="role-bonus-tag captain-tag">★ CAPTAIN • ×1.8 ATTACK / BLOCK</div>':G.vice[p-1]===c.id?'<div class="role-bonus-tag vice-tag">☆ VICE CAPTAIN • ×1.4 ATTACK / BLOCK</div>':''}<div class="stats">${['T_ATK','T_DEF','K_ATK','K_DEF','S_ATK','S_DEF','N_ATK','N_DEF','G_ATK','G_DEF'].map(k=>`${k} ${c[k]}`).join(' · ')}</div><button type="button" class="btn fighter-select ${G.pick[p-1]===c.id?'blue selected':''}" data-fighter="${c.id}" onclick="pickCard(${p},'${c.id}')">${G.pick[p-1]===c.id?'✓ FIGHTER SELECTED':'SELECT FIGHTER'}</button></div></article>`).join(''):'<p class="muted">No available fighters at this level.</p>'}<div class="panel"><h3 class="gold">CHOOSE YOUR ATTACK STYLE</h3><div class="stylegrid">${Object.keys(STYLES).map(s=>`<button type="button" class="btn style-select ${G.style[p-1]===s?'blue selected':''}" data-style="${s}" onclick="pickStyle(${p},'${s}')"><span class="style-emoji">${styleIcon(s)}</span> <span>${s}</span>${G.style[p-1]===s?' ✓':''}</button>`).join('')}</div></div><div id="msg" class="status">Choose a fighter and attack style.</div>${btn('LOCK IN FIGHTER & ATTACK',`lockBattle(${p})`,'primary')}`)}
function pickCard(p,id){
  if(p!==G.currentPlayer)return;
  G.pick[p-1]=id;
  document.querySelectorAll('[data-fighter]').forEach(el=>{const on=el.dataset.fighter===id;el.classList.toggle('blue',on);el.classList.toggle('selected',on);el.textContent=on?'✓ FIGHTER SELECTED':'SELECT FIGHTER'});
  const msg=$('#msg');if(msg)msg.textContent='Fighter selected: '+(card(id)?.name||id)+'. Choose your attack style, then lock in.';
}
function pickStyle(p,s){
  if(p!==G.currentPlayer||!STYLES[s])return;
  G.style[p-1]=s;
  document.querySelectorAll('[data-style]').forEach(el=>{const on=el.dataset.style===s;el.classList.toggle('blue',on);el.classList.toggle('selected',on);el.innerHTML=`<span class="style-emoji">${styleIcon(el.dataset.style)}</span> <span>${el.dataset.style}</span>${on?' ✓':''}`});
  const msg=$('#msg');if(msg)msg.textContent='Attack style selected: '+s+'. Now lock in your fighter and attack.';
}
function statusScreen(p){let roster=G.rosters[p-1];page(`<h2 class="gold">PLAYER ${p} — PRIVATE CARD STATUS</h2><p class="muted">Only this player's roster is shown. Used cards cannot be played again.</p>${roster.map(c=>`<article class="card ${G.used[p-1].has(c.id)?'disabled':''}"><img class="portrait" src="${portrait(c)}"><div><div class="cardname">${c.name}</div><div class="muted">${c.id} • ${levelName(c.level)}</div><span class="tag">${G.used[p-1].has(c.id)?'USED':'AVAILABLE'}</span></div></article>`).join('')}${btn('BACK TO BATTLE',`battleScreen(${p})`)}`)}
function lockBattle(p){if(!G.pick[p-1]){$('#msg').textContent='Choose a fighter first.';return}if(G.mode==='computer'&&p===1){G.pick[1]=shuffle(G.rosters[1].filter(c=>c.level===G.level&&!G.used[1].has(c.id)))[0]?.id;G.style[1]=shuffle(Object.keys(STYLES))[0];resolveRound();return}if(p===1)handover('battle',2);else resolveRound()}
function calcAttack(atk,def){return atk-def>0.0001?{damage:+(atk-def).toFixed(6),shield_gain:0}:{damage:0,shield_gain:+Math.max(def-atk,0).toFixed(6)}}
function applyTeam(i,attack){let hp=G.hp[i],sh=G.shield[i],tmp=G.temp[i],damage=attack.damage,absorbed=Math.min(damage,tmp);tmp-=absorbed;let lost=Math.min(damage-absorbed,hp);hp-=lost;sh+=attack.shield_gain;G.hp[i]=+hp.toFixed(6);G.shield[i]=+sh.toFixed(6);G.temp[i]=+tmp.toFixed(6);return {damage_taken:damage,temp_absorbed:absorbed,hp_lost:lost,shield_gain:attack.shield_gain,activations:0,hp_restored:0,temp_hp_gained:0,temp_hp_discarded:0,hp:G.hp[i],shield:G.shield[i],temp_hp:G.temp[i]}}
function activateShield(p){const i=p-1;if(p!==G.currentPlayer||G.shield[i]+0.000001<2)return;G.shield[i]=+(G.shield[i]-2).toFixed(6);let restored=Math.max(0,Math.min(1.125,10-G.hp[i]));G.hp[i]=+(G.hp[i]+restored).toFixed(6);let potential=(1.125-restored)*(.5/1.125),gained=Math.min(potential,.5-G.temp[i]);G.temp[i]=+(G.temp[i]+gained).toFixed(6);battleScreen(p,false);const msg=$('#msg');if(msg)msg.textContent=`Shield used: −2.00 shield, +${fmt(restored)} HP, +${fmt(gained)} temporary HP.`;}
function roleBonus(player,fighterId){const i=player-1;if(G.captain[i]===fighterId)return 1.8;if(G.vice[i]===fighterId)return 1.4;return 1}
function applyRoleBonus(attack,multiplier){
  if(multiplier===1)return {...attack,role_bonus:0,role_multiplier:1,base_damage:attack.damage,base_shield_gain:attack.shield_gain};
  if(attack.damage>0)return {...attack,base_damage:attack.damage,base_shield_gain:attack.shield_gain,damage:+(attack.damage*multiplier).toFixed(6),role_bonus:multiplier,role_multiplier:multiplier,bonus_type:'attack'};
  // A non-damaging result is a successful block (including an exact tie).
  const baseBlockGain=attack.shield_gain>0?attack.shield_gain:1;
  return {...attack,base_damage:attack.damage,base_shield_gain:baseBlockGain,shield_gain:+(baseBlockGain*multiplier).toFixed(6),role_bonus:multiplier,role_multiplier:multiplier,bonus_type:'block'};
}function resolveRound(){let c1=card(G.pick[0]),c2=card(G.pick[1]),s1=G.style[0],s2=G.style[1];if(!c1||!c2){page(`<p>Battle selection error: missing fighter.</p>${btn('BACK','battleScreen(1)')}`);return}let [a1,d1]=STYLES[s1],[a2,d2]=STYLES[s2];let p1=applyRoleBonus(calcAttack(c1[a1],c2[d1]),roleBonus(1,c1.id)),p2=applyRoleBonus(calcAttack(c2[a2],c1[d2]),roleBonus(2,c2.id));let before={hp:[...G.hp],shield:[...G.shield],temp:[...G.temp]};let r1=applyTeam(0,p2),r2=applyTeam(1,p1);G.used[0].add(c1.id);G.used[1].add(c2.id);G.round++;let report={round:G.round,level:G.level,c1,c2,s1,s2,p1,p2,r1,r2,before};G.history.push(report);if(G.hp[0]<=0||G.hp[1]<=0){G.finished=true;G.reason='KNOCKOUT'}else{while(G.level<=6&&([0,1].some(i=>!G.rosters[i].some(c=>c.level===G.level&&!G.used[i].has(c.id))))){if(G.level===6){G.finished=true;G.reason='ALL_ROUNDS_COMPLETE';break}G.level++}}reveal(report,0)}
function fullStats(c){const groups=[['CORE','SPD','ACC','ADP','DUR'],['TAIJUTSU','T_ATK','T_DEF'],['KUNAI','K_ATK','K_DEF'],['SPECIAL','S_ATK','S_DEF'],['NINJUTSU','N_ATK','N_DEF'],['GENJUTSU','G_ATK','G_DEF']];return `<div class="full-stats">${groups.map(g=>{const keys=g.slice(1).filter(k=>Number.isFinite(Number(c[k])));return keys.length?`<div class="stat-group"><b>${g[0]}</b><div>${keys.map(k=>`<span>${k.replace('_',' ')} <strong>${fmt(c[k])}</strong></span>`).join('')}</div></div>`:''}).join('')}</div>`}
function attackSummary(r,player){const own=player===1?r.c1:r.c2,opp=player===1?r.c2:r.c1,style=player===1?r.s1:r.s2,attack=player===1?r.p1:r.p2,[ak,dk]=STYLES[style];return `<div class="attackbox attack-${style.toLowerCase()}"><b>PLAYER ${player} • ${style.toUpperCase()} <span class="style-emblem">${style==='Taijutsu'?'👊':style==='Kunai'?'🗡️':style==='Special'?'💥':style==='Ninjutsu'?'🔥':'🌀'}</span></b><p>${own.name} ${ak.replace('_',' ')} <strong>${fmt(own[ak])}</strong></p><p>${opp.name} ${dk.replace('_',' ')} <strong>${fmt(opp[dk])}</strong></p><div class="impact-number">${attack.damage>0?`−${fmt(attack.damage)} DAMAGE`:`+${fmt(attack.shield_gain)} SHIELD`}</div>${attack.role_bonus?`<div class="role-bonus-breakdown">${attack.damage>0?'Attack damage':'Block shield'} multiplier: <b>×${fmt(attack.role_multiplier)}</b></div>`:''}</div>`}
function historyScreen(backPlayer=1){const rounds=G.history.slice().reverse();page(`<div class="hero"><h2 class="gold">BATTLE ARCHIVE</h2><p class="muted">Every completed round • full 14-stat cards • attack calculations • HP, shield and temporary HP changes</p></div>${rounds.length?rounds.map(r=>`<details class="history-entry" open><summary><b>ROUND ${r.round} • ${levelName(r.level)}</b><span>${r.c1.name} vs ${r.c2.name}</span></summary><div class="fighter history-fighters"><div class="fighterbox"><img src="${portrait(r.c1)}"><b>${r.c1.name}</b><p class="muted">PLAYER 1 • ${r.s1}</p>${fullStats(r.c1)}</div><div class="fighterbox"><img src="${portrait(r.c2)}"><b>${r.c2.name}</b><p class="muted">PLAYER 2 • ${r.s2}</p>${fullStats(r.c2)}</div></div><div class="resultrow">${attackSummary(r,1)}${attackSummary(r,2)}</div><div class="panel"><b>TEAM STATUS • BEFORE → AFTER</b><div class="resultrow"><div><b>PLAYER 1</b><p>HP ${fmt(r.before.hp[0])} → ${fmt(r.r1.hp)}</p><p>Shield ${fmt(r.before.shield[0])} → ${fmt(r.r1.shield)}</p><p>Temp HP ${fmt(r.before.temp[0])} → ${fmt(r.r1.temp_hp)}</p><p>Damage taken ${fmt(r.r1.damage_taken)} • HP lost ${fmt(r.r1.hp_lost)}</p><p>Shield activations ${r.r1.activations}</p></div><div><b>PLAYER 2</b><p>HP ${fmt(r.before.hp[1])} → ${fmt(r.r2.hp)}</p><p>Shield ${fmt(r.before.shield[1])} → ${fmt(r.r2.shield)}</p><p>Temp HP ${fmt(r.before.temp[1])} → ${fmt(r.r2.temp_hp)}</p><p>Damage taken ${fmt(r.r2.damage_taken)} • HP lost ${fmt(r.r2.hp_lost)}</p><p>Shield activations ${r.r2.activations}</p></div></div></div></details>`).join(''):'<div class="panel center">No completed battles yet. Your round records will appear here.</div>'}${btn('BACK TO MY BATTLE SCREEN',`battleScreen(${backPlayer},false)`,'primary')}${G.finished?btn('MATCH RESULT','endScreen()'):''}`)}
function styleIcon(s){return ({Taijutsu:'👊',Kunai:'🗡️',Special:'💥',Ninjutsu:'🔥',Genjutsu:'🌀'})[s]||'⚔️'}function effectName(s){return ({Taijutsu:'IMPACT STRIKE • close-combat shockwave',Kunai:'BLADE FLASH • cutting slash trail',Special:'SIGNATURE BLAST • explosive burst',Ninjutsu:'CHAKRA RELEASE • elemental wave',Genjutsu:'ILLUSION FIELD • distortion ripple'})[s]||'ATTACK'}function deltaBadge(r){return r.hp_lost>0?`<span class="damage-pop">❤️ −${fmt(r.hp_lost)} HP</span>`:r.temp_absorbed>0?`<span class="damage-pop">🛡 −${fmt(r.temp_absorbed)} TEMP</span>`:`<span class="safe-pop">NO HP DAMAGE</span>`}function shieldBadge(r){return r.shield_gain>0||r.activations>0?`<span class="shield-pop">🔷 +${fmt(r.shield_gain)} SHIELD ${r.activations?`• ${r.activations} ACTIVATION`:''}</span>`:r.hp_restored>0?`<span class="shield-pop">✨ +${fmt(r.hp_restored)} HP RESTORED</span>`:''}function damageShieldText(r){return `<span class="damage-pop">💥 P1 −${fmt(r.r1.hp_lost)} HP</span><span class="shield-pop">🔷 P1 shield ${fmt(r.r1.shield)} • P2 −${fmt(r.r2.hp_lost)} HP • shield ${fmt(r.r2.shield)}</span>`}
function targetImpact(r,phase){
 if(phase!==1&&phase!==2)return '';
 const attack=phase===1?r.p1:r.p2, side=phase===1?'right':'left', style=phase===1?r.s1:r.s2;
 const target=attack.damage>0?'<div class="target-mark damage-mark">✕<small>HIT!</small></div>':attack.shield_gain>0?'<div class="target-mark shield-mark">🛡<small>BLOCK!</small></div>':'<div class="target-mark block-mark">〰<small>NO HIT</small></div>';
 return `<div class="travel-effect travel-${side} travel-${style.toLowerCase()}">${styleIcon(style)}</div><div class="${side==='right'?'fighter-right':'fighter-left'}-impact">${target}</div>`;
}
function reveal(r,phase){let title=['THE CLASH BEGINS','PLAYER 1 ATTACK!','PLAYER 2 ATTACK!','DAMAGE!'][phase];let left=r.c1,right=r.c2;page(`<div class="arena arena-phase-${phase}"><div class="battle-flash flash-phase-${phase} ${phase===1?'flash-'+r.s1.toLowerCase():phase===2?'flash-'+r.s2.toLowerCase():phase===3?'flash-damage':''}" aria-hidden="true"></div><div class="hero"><h2 class="gold">${title}</h2><small>ROUND ${r.round} • ${levelName(r.level)}</small><div class="fighter"><div class="fighterbox fighter-left"><img src="${portrait(left)}"><b>${left.name}</b><p class="muted">PLAYER 1 • ${r.s1}</p>${fullStats(left)}</div><div class="fighterbox fighter-right"><img src="${portrait(right)}"><b>${right.name}</b><p class="muted">PLAYER 2 • ${r.s2}</p>${fullStats(right)}</div>${targetImpact(r,phase)}</div></div><div class="impact-banner ${phase===1?'style-'+r.s1.toLowerCase():phase===2?'style-'+r.s2.toLowerCase():phase===3?'damage-stage':''}">${phase===0?'⚔ BOTH FIGHTERS COMMITTED':phase===1?`${styleIcon(r.s1)} PLAYER 1 • ${r.s1.toUpperCase()} ATTACK`:phase===2?`${styleIcon(r.s2)} PLAYER 2 • ${r.s2.toUpperCase()} ATTACK`:'💥 DAMAGE & SHIELD RESOLUTION'}</div><div class="combat-fx ${phase===1?'fx-'+r.s1.toLowerCase():phase===2?'fx-'+r.s2.toLowerCase():phase===3?'fx-damage-shield':''}">${phase===1?effectName(r.s1):phase===2?effectName(r.s2):phase===3?damageShieldText(r):'⚔ VS ⚔'}</div><div class="panel center"><p class="muted">Both attacks were calculated from the same pre-round state. Animation order does not change combat results.</p></div>${phase>=1?`<div class="resultrow">${attackSummary(r,1)}${attackSummary(r,2)}</div>`:''}${phase===3?`<div class="panel"><h3 class="gold">ROUND RESULT • TEAM STATUS</h3><div class="resultrow"><div><b>PLAYER 1</b>${bar('HP',G.hp[0],10,'#22c55e')}${bar('SHIELD',G.shield[0],2,'#3b82f6')}${bar('TEMP HP',G.temp[0],.5,'#a855f7')}<div class="battle-deltas">${deltaBadge(r.r1)}${shieldBadge(r.r1)}</div><small>Damage taken ${fmt(r.r1.damage_taken)} • HP lost ${fmt(r.r1.hp_lost)} • Shield gained ${fmt(r.r1.shield_gain)}</small></div><div><b>PLAYER 2</b>${bar('HP',G.hp[1],10,'#22c55e')}${bar('SHIELD',G.shield[1],2,'#3b82f6')}${bar('TEMP HP',G.temp[1],.5,'#a855f7')}<div class="battle-deltas">${deltaBadge(r.r2)}${shieldBadge(r.r2)}</div><small>Damage taken ${fmt(r.r2.damage_taken)} • HP lost ${fmt(r.r2.hp_lost)} • Shield gained ${fmt(r.r2.shield_gain)}</small></div></div></div>${btn(G.finished?'VIEW MATCH RESULT':`NEXT ROUND • ${levelName(G.level)}`,G.finished?'endScreen()':'nextRound()','primary')}${btn(`BATTLE HISTORY (${G.history.length})`,`historyScreen(1)`,'blue')}`:''}</div>`);if(phase<3)setTimeout(()=>reveal(r,phase+1),phase===0?1800:phase===1?2800:phase===2?2800:2600)}
function nextRound(){G.pick=['',''];G.style=['',''];battleScreen(1)}function endScreen(){let winner= Math.abs(G.hp[0]-G.hp[1])<=.0001?0:G.hp[0]>G.hp[1]?1:2;page(`<div class="hero"><h1 class="gold">MATCH COMPLETE</h1><h2>${winner===0?'DRAW':`PLAYER ${winner} WINS`}</h2><p class="muted">${G.reason==='KNOCKOUT'?'KNOCKOUT':'ALL ROUNDS COMPLETE'} • ${G.round} ROUNDS</p></div><div class="resultrow"><div class="panel"><b>PLAYER 1</b>${bar('HP',G.hp[0],10,'#22c55e')}<p>Shield ${fmt(G.shield[0])}</p><p>Temp HP ${fmt(G.temp[0])}</p></div><div class="panel"><b>PLAYER 2</b>${bar('HP',G.hp[1],10,'#22c55e')}<p>Shield ${fmt(G.shield[1])}</p><p>Temp HP ${fmt(G.temp[1])}</p></div></div><h3 class="gold">BATTLE HISTORY</h3>${G.history.map(r=>`<div class="panel"><b>Round ${r.round} • ${levelName(r.level)}</b><p>${r.c1.name} (${r.s1}) vs ${r.c2.name} (${r.s2})</p><small>P1 dealt ${fmt(r.p1.damage)} damage • P2 dealt ${fmt(r.p2.damage)} damage</small></div>`).join('')}${btn('NEW MATCH','menu()','primary')}`)}
window.menu=menu;window.difficulty=difficulty;window.start=start;window.draftSetupScreen=draftSetupScreen;window.draftAuditScreen=draftAuditScreen;window.setDraftPreset=setDraftPreset;window.setDraftMode=setDraftMode;window.setPoolSize=setPoolSize;window.generateDraft=generateDraft;window.setRole=setRole;window.confirmTeam=confirmTeam;window.battleScreen=battleScreen;window.pickCard=pickCard;window.pickStyle=pickStyle;window.statusScreen=statusScreen;window.activateShield=activateShield;window.lockBattle=lockBattle;window.nextRound=nextRound;window.endScreen=endScreen;window.historyScreen=historyScreen;
DBPromise.then(cards=>{db=cards;if(db.length!==120)throw Error('Expected 120 cards, got '+db.length);menu()}).catch(e=>page(`<h2 class="danger">DATABASE ERROR</h2><p>${e.message}</p>`));