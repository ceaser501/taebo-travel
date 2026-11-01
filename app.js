/* 도쿄 태교여행 — app shell: state, views and events. Data lives in data.js, storage and sync in sync.js. */
const KINDS=['한 줄 일기','아기에게 편지','맛있었던 것'];
const TICKET_TYPES=['항공권','입장권','숙소','기타'];
const flights=()=>{const f=Sync.get('flights','trip')||{};return {out:{...FLIGHT0.out,...(f.out||{})},in:{...FLIGHT0.in,...(f.in||{})}};};
const flightLabel=f=>`${f.fromCity} → ${f.toCity}${f.no?' · '+f.no:''}`;
function ticketSlots(){const f=flights();return [
  {slot:'flight-out',type:'항공권',title:'가는 편 · '+flightLabel(f.out),day:1,time:f.out.dep,place:'airport',hint:'항공사 앱이나 메일의 모바일 탑승권 QR'},
  {slot:'flight-in',type:'항공권',title:'오는 편 · '+flightLabel(f.in),day:3,time:f.in.dep,place:'airport',hint:'항공사 앱이나 메일의 모바일 탑승권 QR'},
  {slot:'skytree',type:'입장권',title:'스카이트리 전망 데크',day:1,time:'16:15',place:'skytree',hint:'예매 메일의 QR 코드 화면'},
  {slot:'shibuya',type:'입장권',title:'시부야 스카이',day:2,time:'16:00',place:'shibuya',hint:'예매 메일의 QR 코드 화면'},
  {slot:'hotel',type:'숙소',title:'숙소 예약 확인서',day:1,time:'15:00',place:'hotel',hint:'예약 번호가 보이는 화면'},
];}
const COLORS=['#5a6fe3','#f27d99','#24a37f','#ee8640'];

const state={
  tab:'home',day:LS.get('day',1),edit:false,
  sCat:'전체',sOnly:false,sView:'list',
  form:{cur:'JPY',cat:'식비',day:1},err:'',
  dform:{kind:'한 줄 일기',day:1,stk:'',photoBlob:null,photoURL:''},derr:'',
  sound:LS.get('sound',true),
  auth:{mode:'login',err:'',info:'',busy:false},
  onboard:{mode:'create',err:'',busy:false,color:COLORS[0]},
  vb:{},vbFor:{},
};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const dayOf=id=>DAYS.find(d=>d.id===id);
const llStr=ll=>ll[0]+','+ll[1];
const gsearch=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
const gdir=(o,d,mode)=>'https://www.google.com/maps/dir/?api=1'+(o?'&origin='+(Array.isArray(o)?llStr(o):encodeURIComponent(o)):'')+'&destination='+(Array.isArray(d)?llStr(d):encodeURIComponent(d))+'&travelmode='+mode;
const won=n=>'₩'+Math.round(n).toLocaleString('ko-KR');
const yen=n=>'¥'+Math.round(n).toLocaleString('ko-KR');
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));

/* ---------- synced data accessors ---------- */
const planOf=d=>{const v=Sync.get('plan',String(d));return v&&v.stops?v.stops.map(x=>x.p==='hnd'?{...x,p:'airport'}:x):clone(PLAN0[d]);};
const setPlan=(d,stops)=>Sync.put('plan',String(d),{stops});
const settings=()=>Object.assign({budget:2000000,rate:9.2},Sync.get('settings','trip')||{});
const setSettings=patch=>Sync.put('settings','trip',Object.assign(settings(),patch));
const savedSet=()=>new Set((Sync.get('saved','set')||{ids:['sensoji','skytree','meiji','omote','shibuya','suitengu','ginza','tokyost','kagetsudo','ichiran','bairin','gaien']}).ids);
const setSaved=s=>Sync.put('saved','set',{ids:[...s]});
const checkSet=()=>new Set((Sync.get('checks','set')||{ids:[]}).ids);
const setChecks=s=>Sync.put('checks','set',{ids:[...s]});
const expenses=()=>Sync.list('exp').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
const diary=()=>Sync.list('diary').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
const tickets=()=>Sync.list('ticket').sort((a,b)=>(a.day-b.day)||(a.time||'').localeCompare(b.time||''));
const rate=()=>settings().rate;
const toKRW=e=>e.cur==='KRW'?e.amt:e.amt*rate();
const me=()=>Sync.meta.uid;
const member=u=>Sync.members.find(m=>m.user_id===u)||{display_name:u===me()?'나':'함께',color:'#9aa0bd'};
const avatar=u=>{const m=member(u);return `<span class="av" style="--wc:${esc(m.color)}">${esc((m.display_name||'?').slice(0,1))}</span>`;};

/* ---------- small UI helpers ---------- */
const IC={
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',bowl:'<path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2"/>',cup:'<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',bag:'<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  bed:'<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01"/>',plane:'<path d="M2 16l20-6-3-3-7 3-5-5-2 1 3 6-4 2-2-1-1 1z"/>',nav:'<path d="M3 11l18-8-8 18-2-8z"/>',pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  memo:'<path d="M5 4h14v12l-4 4H5zM15 20v-4h4M8 9h8M8 13h5"/>',taxi:'<path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14M8 17v2M16 17v2M10 4h4"/>',walk:'<circle cx="13" cy="4.5" r="1.5"/><path d="M10 21l2-6 3 3v3M9 12l2-4 3 1 2 3M11 8l-2 5"/>',train:'<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 1M15 20l2 1M9 16l-1 4M15 16l1 4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',yen:'<path d="M6 4l6 8 6-8M12 12v8M8 13h8M8 16h8"/>',talk:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',home:'<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  list:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',ticket:'<path d="M3 8a2 2 0 0 0 0 4v4h18v-4a2 2 0 0 1 0-4V4H3zM14 4v16"/>',heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',chev:'<path d="M9 6l6 6-6 6"/>',back:'<path d="M15 6l-6 6 6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',
  up:'<path d="M6 15l6-6 6 6"/>',down:'<path d="M6 9l6 6 6-6"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',pen:'<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
  sndon:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',sndoff:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  speak:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',sync:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  bus:'<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M7 17v3M17 17v3M8 14h.01M16 14h.01"/>',
  file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',expand:'<path d="M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6"/>',share:'<path d="M12 3v12M7 8l5-5 5 5M5 14v6h14v-6"/>',
};
const svg=(k,cls='i')=>`<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[k]}</svg>`;
const STK={
  sun:'<circle cx="20" cy="20" r="9" fill="#ffd56b"/><g stroke="#ffbf3d" stroke-width="2.4" stroke-linecap="round"><path d="M20 4v4M20 32v4M4 20h4M32 20h4M8.7 8.7l2.8 2.8M28.5 28.5l2.8 2.8M8.7 31.3l2.8-2.8M28.5 11.5l2.8-2.8"/></g><circle cx="17" cy="19" r="1.2" fill="#6b4a12"/><circle cx="23" cy="19" r="1.2" fill="#6b4a12"/><path d="M17.5 23q2.5 2 5 0" stroke="#6b4a12" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
  cloud:'<path d="M10 28a6 6 0 0 1 1-12 8 8 0 0 1 15-2 6.5 6.5 0 0 1 4 14z" fill="#fff" stroke="#b9c6f2" stroke-width="2"/><circle cx="16" cy="22" r="1.1" fill="#5a6390"/><circle cx="22" cy="22" r="1.1" fill="#5a6390"/><circle cx="14" cy="24.5" r="1.6" fill="#ffc6c6"/><circle cx="24" cy="24.5" r="1.6" fill="#ffc6c6"/>',
  heart:'<path d="M20 33s-12-7-12-16a6.5 6.5 0 0 1 12-3.5A6.5 6.5 0 0 1 32 17c0 9-12 16-12 16z" fill="#ff9fb2"/><path d="M13 15a3 3 0 0 1 3-3" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>',
  ginkgo:'<path d="M20 34V22" stroke="#c99a1e" stroke-width="2.2" stroke-linecap="round"/><path d="M20 23C12 22 6 15 8 8c4 2 7 1 12-2 5 3 8 4 12 2 2 7-4 14-12 15z" fill="#ffd24d"/><path d="M20 23V9" stroke="#e6b52c" stroke-width="1.4"/>',
  onigiri:'<path d="M20 6c5 0 13 15 13 21 0 4-4 6-13 6S7 31 7 27C7 21 15 6 20 6z" fill="#fff" stroke="#e3dccf" stroke-width="1.6"/><rect x="13" y="23" width="14" height="10" rx="1.5" fill="#3d4a4a"/><circle cx="16.5" cy="18" r="1.1" fill="#3d4a4a"/><circle cx="23.5" cy="18" r="1.1" fill="#3d4a4a"/><circle cx="14.5" cy="20.5" r="1.5" fill="#ffc0c0"/><circle cx="25.5" cy="20.5" r="1.5" fill="#ffc0c0"/>',
  plane:'<path d="M6 24l26-9c2-.7 3 1.3 1 2.3L9 28z" fill="#9fb3ff"/><path d="M15 21l-4-9h4l8 6M17 25l-2 7h3l6-8" fill="#c9d4ff"/><path d="M4 30q6-3 10-2" stroke="#ffb0a0" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="2 3"/>',
};
const STKNAME={sun:'해님',cloud:'구름',heart:'하트',ginkgo:'은행잎',onigiri:'주먹밥',plane:'비행기'};
const stkSVG=(k,cls='')=>`<svg class="${cls}" viewBox="0 0 40 40" aria-hidden="true">${STK[k]}</svg>`;
const thumb=id=>{const p=PL[id],c=CAT[p.cat];return `<span class="thumb" style="--c:var(${c.c})">${svg(c.ic,'')}${p.stn?`<span>${p.stn.join('')}</span>`:''}</span>`;};
const safeChip=p=>p.safe?`<span class="chip ${p.safe==='ok'?'ok':'warn'}">${p.safe==='ok'?'임산부 안심':'주문 시 주의'}</span>`:'';
const walkHTML=lv=>lv?`<span class="walk">${[1,2,3].map(i=>`<span class="${i<=lv?'on':''}"></span>`).join('')}<em>${['','걷기 적음','걷기 보통','걷기 많음'][lv]}</em></span>`:'';
let toastTimer;
function toast(msg){const el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3200);}

/* ---------- Japanese: speech and signboards ---------- */
let jaVoice=null;
function pickVoice(){if(!('speechSynthesis' in window))return;const vs=speechSynthesis.getVoices();jaVoice=vs.find(v=>/^ja(-|_|$)/i.test(v.lang)&&/Kyoko|O-ren|Google|Siri/i.test(v.name))||vs.find(v=>/^ja/i.test(v.lang))||null;}
if('speechSynthesis' in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
function speak(text,slow){
  if(!('speechSynthesis' in window)){toast('이 브라우저는 음성 읽기를 지원하지 않아요.');return;}
  pickVoice();
  if(!jaVoice&&speechSynthesis.getVoices().length) toast('휴대폰에 일본어 음성이 없으면 발음이 어색해요. 설정에서 일본어 음성을 받아 두세요.');
  speechSynthesis.cancel();
  const u=new SpeechSynthesisUtterance(text);u.lang='ja-JP';u.rate=slow?0.7:0.9;if(jaVoice)u.voice=jaVoice;speechSynthesis.speak(u);
}
const mainSign=id=>(SIGNS[id]||[[PL[id].jp,'',PL[id].n]])[0];
const askOf=sg=>[sg[0]+'はどこですか？',(sg[1]||sg[0])+'は どこですか',sg[2]+'는 어디예요?'];
/* ===================== legs ===================== */
function hav(a,b){const R=6371,r=Math.PI/180,dl=(b[0]-a[0])*r,dn=(b[1]-a[1])*r,x=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function leg(a,b){
  if(a===b)return null;
  const k=KNOWN[a+'>'+b];if(k)return {...k};
  const za=ZNEAR[a],zb=ZNEAR[b];
  if(za&&zb&&za!==zb){const n=Math.abs(ZORDER.indexOf(za)-ZORDER.indexOf(zb));return {how:'subway',min:Math.round(4+n*2.6),note:`${n}정거장 · 환승 없음`,via:[za,zb]};}
  if(a==='airport'||b==='airport')return {how:'bus',min:85,note:'리무진 버스 약 70~90분 · 택시는 정액 2만 엔대'};
  const d=hav(PL[a].ll,PL[b].ll);
  if(d<0.9)return {how:'walk',min:Math.max(3,Math.round(d*1.25*15)),note:`예상 · 약 ${Math.round(d*1250)}m`};
  const road=d*1.3,fare=Math.round((500+Math.max(0,road-1.1)*390)/100)*100;
  return {how:'taxi',min:Math.round(5+road*2.4),note:`예상 · 약 ${fare.toLocaleString()}엔`};
}
function legPath(a,b,l){
  if(!l||PL[a].off||PL[b].off)return null;
  let path=[PL[a].ll];
  if(l.via){const i0=ZORDER.indexOf(l.via[0]),i1=ZORDER.indexOf(l.via[1]);const seq=i0<=i1?ZORDER.slice(i0,i1+1):ZORDER.slice(i1,i0+1).reverse();path=path.concat(seq.map(k=>ZST[k]));}
  path.push(PL[b].ll);return path;
}
function numbered(d){const out=[];planOf(d).forEach(s=>{if(s.p!=='hotel'&&s.p!=='airport'&&!out.includes(s.p))out.push(s.p);});return out;}

/* ===================== map ===================== */
function fitBox(ids,W,H,pad){
  const p=ids.map(id=>P(PL[id].ll)),[pl,pr,pt,pb]=pad;
  const x0=Math.min(...p.map(a=>a[0])),x1=Math.max(...p.map(a=>a[0])),y0=Math.min(...p.map(a=>a[1])),y1=Math.max(...p.map(a=>a[1]));
  W=W||360;H=H||300;
  const u=Math.max((x1-x0)/Math.max(60,W-pl-pr),(y1-y0)/Math.max(60,H-pt-pb),240/W);
  return {x:(x0+x1)/2-(pl+(W-pl-pr)/2)*u,y:(y0+y1)/2-(pt+(H-pt-pb)/2)*u,w:W*u};
}
function mapCfg(key){
  if(key==='plan'){const d=state.day,ids=numbered(d);
    return {routes:[d],pins:ids.map((id,i)=>({id,c:dayOf(d).c,num:i+1})),fit:['hotel',...ids],fitKey:'plan'+d+ids.join(),pad:[40,64,36,52],hnd:planOf(d).some(s=>s.p==='airport')};}
  if(key==='home'){const pins=[];[1,2,3].forEach(d=>numbered(d).forEach((id,i)=>pins.push({id,c:dayOf(d).c,num:i+1})));
    return {routes:[1,2,3],pins,fit:['hotel',...pins.map(p=>p.id)],fitKey:'home',pad:[20,20,20,40],static:1,nolabel:1};}
  const ids=placeList().filter(id=>!PL[id].off);
  return {routes:[],pins:ids.map(id=>({id,c:CAT[PL[id].cat].c})),fit:['hotel',...ids],fitKey:'places'+ids.join(),pad:[30,64,30,30]};
}
function mountMap(key){
  const box=document.querySelector(`[data-map="${key}"]`);if(!box)return;
  const s=box.querySelector('svg'),cfg=mapCfg(key),r=s.getBoundingClientRect();
  if(!state.vb[key]||state.vbFor[key]!==cfg.fitKey){state.vb[key]=fitBox(cfg.fit,r.width,r.height,cfg.pad);state.vbFor[key]=cfg.fitKey;}
  const draw=()=>drawMap(s,key,cfg);box._draw=draw;draw();
  if(cfg.static)return;
  const ptrs=new Map();let downT=null,moved=0,last=null,pinch=null;
  const toU=(cx,cy)=>{const r=s.getBoundingClientRect(),vb=state.vb[key],u=vb.w/r.width;return [vb.x+(cx-r.left)*u,vb.y+(cy-r.top)*u];};
  const zoomAt=(f,cx,cy)=>{const vb=state.vb[key],[ux,uy]=toU(cx,cy),nw=Math.min(1500,Math.max(110,vb.w*f)),k=nw/vb.w;vb.x=ux-(ux-vb.x)*k;vb.y=uy-(uy-vb.y)*k;vb.w=nw;draw();};
  s.addEventListener('pointerdown',e=>{ptrs.set(e.pointerId,[e.clientX,e.clientY]);s.setPointerCapture(e.pointerId);if(ptrs.size===1){downT=e.target.closest('[data-pid]');moved=0;last=[e.clientX,e.clientY];}else downT=null;});
  s.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;ptrs.set(e.pointerId,[e.clientX,e.clientY]);
    if(ptrs.size===2){const [a,b]=[...ptrs.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoomAt(pinch/d,(a[0]+b[0])/2,(a[1]+b[1])/2);pinch=d;moved=99;return;}
    const r=s.getBoundingClientRect(),vb=state.vb[key],u=vb.w/r.width,dx=e.clientX-last[0],dy=e.clientY-last[1];moved+=Math.abs(dx)+Math.abs(dy);last=[e.clientX,e.clientY];
    if(moved>4){vb.x-=dx*u;vb.y-=dy*u;draw();}});
  s.addEventListener('pointerup',e=>{ptrs.delete(e.pointerId);if(ptrs.size<2)pinch=null;if(ptrs.size===0&&moved<=4&&downT)placeSheet(downT.dataset.pid);});
  s.addEventListener('pointercancel',e=>{ptrs.delete(e.pointerId);pinch=null;});
  s.addEventListener('wheel',e=>{e.preventDefault();zoomAt(Math.pow(1.0018,e.deltaY),e.clientX,e.clientY);},{passive:false});
  box.querySelectorAll('[data-zoom]').forEach(b=>b.addEventListener('click',()=>{const z=b.dataset.zoom,r=s.getBoundingClientRect();
    if(z==='fit'){state.vb[key]=fitBox(cfg.fit,r.width,r.height,cfg.pad);draw();}else zoomAt(z==='in'?0.7:1.43,r.left+r.width/2,r.top+r.height/2);}));
}
function drawMap(el,key,cfg){
  const r=el.getBoundingClientRect();if(!r.width)return;
  const vb=state.vb[key],h=vb.w*r.height/r.width,u=vb.w/r.width;
  el.setAttribute('viewBox',`${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${h.toFixed(1)}`);
  let s=`<rect x="-3000" y="-3000" width="8000" height="8000" fill="var(--map-land)"/>`;
  PARKS.forEach(([la,lo,rx,ry])=>{const [x,y]=P([la,lo]);s+=`<ellipse cx="${x}" cy="${y}" rx="${rx*COS*K}" ry="${ry*K}" fill="var(--map-park)"/>`;});
  s+=`<polyline points="${pts(RIVER)}" fill="none" stroke="var(--map-water)" stroke-width="${Math.max(16,6*u)}" stroke-linejoin="round" stroke-linecap="round"/>`;
  s+=`<polygon points="${pts(YAMANOTE)}" fill="none" stroke="var(--map-rail)" stroke-width="${2.5*u}" stroke-dasharray="${10*u} ${2*u}"/>`;
  s+=`<polyline points="${pts(GINZA_L)}" fill="none" stroke="var(--d1)" stroke-opacity=".22" stroke-width="${3*u}"/>`;
  s+=`<polyline points="${pts(ZORDER.map(k=>ZST[k]))}" fill="none" stroke="var(--d3)" stroke-opacity=".22" stroke-width="${3*u}"/>`;
  const pinXY=[...cfg.pins.map(p=>P(PL[p.id].ll)),P(PL.hotel.ll)];
  const near=(x,y)=>pinXY.some(([a,b])=>Math.hypot(a-x,b-y)<46*u);
  if(!cfg.nolabel){const fs=12.5*u;
    PARKS.forEach(([la,lo,,,n])=>{if(!n)return;const [x,y]=P([la,lo]);if(near(x,y))return;s+=`<text class="m-area" x="${x}" y="${y}" text-anchor="middle" font-size="${fs*.92}" stroke-width="${3*u}" style="fill:var(--ok)">${n}</text>`;});
    AREAS.forEach(([n,la,lo])=>{const [x,y]=P([la,lo]);if(near(x,y))return;s+=`<text class="m-area" x="${x}" y="${y}" text-anchor="middle" font-size="${fs}" stroke-width="${3*u}">${n}</text>`;});}
  cfg.routes.forEach(d=>{const st=planOf(d),col=`var(${dayOf(d).c})`;
    for(let i=0;i<st.length-1;i++){const a=st[i].p,b=st[i+1].p,l=leg(a,b),p=legPath(a,b,l);if(!p)continue;
      const dash=l.how==='taxi'?`${9*u} ${6*u}`:l.how==='walk'?`${0.1*u} ${7*u}`:'',w=l.how==='subway'?6*u:4.5*u;
      s+=`<polyline points="${pts(p)}" fill="none" stroke="var(--map-land)" stroke-width="${w+4*u}" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
      s+=`<polyline points="${pts(p)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${dash?`stroke-dasharray="${dash}"`:''}/>`;}});
  const boxes=pinXY.map(([x,y])=>[x-15*u,y-15*u,x+15*u,y+15*u]);
  const out=b=>b[0]<vb.x+6*u||b[1]<vb.y+4*u||b[3]>vb.y+h-4*u||b[2]>vb.x+vb.w-6*u||(!cfg.static&&b[2]>vb.x+vb.w-56*u&&b[1]<vb.y+140*u);
  const hit=b=>out(b)||boxes.some(c=>b[0]<c[2]&&b[2]>c[0]&&b[1]<c[3]&&b[3]>c[1]);
  const labels=[];
  cfg.pins.forEach(pn=>{const p=PL[pn.id],[x,y]=P(p.ll),col=`var(${pn.c})`,R=(cfg.static?9:13)*u;
    s+=`<g class="m-pin" data-pid="${pn.id}"><circle cx="${x}" cy="${y}" r="${R+8*u}" fill="transparent"/>`;
    if(pn.num)s+=`<circle cx="${x}" cy="${y}" r="${R}" fill="${col}" stroke="var(--map-land)" stroke-width="${2.5*u}"/><text class="m-num" x="${x}" y="${y+(cfg.static?3.8:4.6)*u}" text-anchor="middle" font-size="${(cfg.static?10.5:13)*u}">${pn.num}</text>`;
    else s+=`<circle cx="${x}" cy="${y}" r="${9*u}" fill="var(--card)" stroke="${col}" stroke-width="${4*u}"/>`;
    s+=`</g>`;
    if(cfg.nolabel)return;
    const name=p.short||p.n,fz=14*u,tw=name.length*fz*0.98,th=fz*1.1,off=R+5*u;
    const cand={l:[x-off,y+5*u,'end',[x-off-tw,y-th/2,x-off,y+th/2]],r:[x+off,y+5*u,'start',[x+off,y-th/2,x+off+tw,y+th/2]],b:[x,y+R+16*u,'middle',[x-tw/2,y+R+3*u,x+tw/2,y+R+3*u+th]],t:[x,y-R-7*u,'middle',[x-tw/2,y-R-5*u-th,x+tw/2,y-R-5*u]]};
    const pick=[p.side||'r','r','l','b','t'].map(k=>cand[k]).find(c=>!hit(c[3]));
    if(pick){boxes.push(pick[3]);labels.push(`<text class="m-lbl" x="${pick[0]}" y="${pick[1]}" text-anchor="${pick[2]}" font-size="${fz}" stroke-width="${4.5*u}">${esc(name)}</text>`);}});
  s+=labels.join('');
  {const [x,y]=P(PL.hotel.ll),w=(cfg.static?30:40)*u,hh=(cfg.static?17:22)*u;
   s+=`<g class="m-pin" data-pid="hotel"><rect x="${x-w/2}" y="${y-hh/2}" width="${w}" height="${hh}" rx="${5*u}" fill="var(--ink)" stroke="var(--map-land)" stroke-width="${2.5*u}"/><text x="${x}" y="${y+(cfg.static?3.6:4.5)*u}" text-anchor="middle" font-size="${(cfg.static?9.5:12)*u}" font-weight="700" style="fill:var(--app);font-family:var(--f-body)">숙소</text></g>`;}
  el.innerHTML=s;
}
const mapBox=(key,cls,cfg)=>`<div class="mapbox ${cls}" data-map="${key}"><svg role="img" aria-label="도쿄 지도"></svg>
  <div class="mtools"><button data-zoom="in" aria-label="확대">+</button><button data-zoom="out" aria-label="축소">−</button><button data-zoom="fit" aria-label="전체 보기">${svg('fit')}</button></div>
  ${cfg.hnd?`<div class="hnd">${svg('plane')}나리타 공항은 동쪽 약 60km · 리무진 버스 70~90분</div>`:''}</div>`;

/* ===================== illustrations ===================== */
const cloud=(x,y,s,o=1,fill='#fff')=>`<g transform="translate(${x} ${y}) scale(${s})" opacity="${o}"><path d="M0 30a16 16 0 0 1 10-28 24 24 0 0 1 42-2 18 18 0 0 1 22 14 14 14 0 0 1-2 28H8A12 12 0 0 1 0 30z" fill="${fill}"/></g>`;
const planeTop=(fill='#fff',edge='#c8cfee')=>`<g><path d="M2 -2 L-6 -20 L-1 -20 L10 -2Z M2 2 L-6 20 L-1 20 L10 2Z" fill="${fill}" stroke="${edge}" stroke-width=".8"/><path d="M-18 -1.5 L-24 -9 L-20.5 -9 L-14 -1.5Z M-18 1.5 L-24 9 L-20.5 9 L-14 1.5Z" fill="${fill}" stroke="${edge}" stroke-width=".8"/><path d="M-22 0 L18 -2.6 Q27 0 18 2.6 Z" fill="${fill}" stroke="${edge}" stroke-width=".8"/></g>`;
/* ===================== sound ===================== */
// Synthesised with Web Audio (no files): a soft paper tear and a distant airplane whoosh, both kept very quiet.
let actx=null;
function audio(unlock){
  if(!state.sound)return null;
  try{ if(!actx){ if(!unlock)return null; actx=new (window.AudioContext||window.webkitAudioContext)(); }
    if(actx.state==='suspended'){ if(!unlock)return null; actx.resume(); } }catch(e){return null;}
  return actx;
}
function noise(c,dur){const b=c.createBuffer(1,Math.ceil(c.sampleRate*dur),c.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const s=c.createBufferSource();s.buffer=b;return s;}
function sfxTear(c){
  // perforated ticket: soft irregular "tk-tk" taps along the dotted line, then the stub comes away
  if(!c)return; const sr=c.sampleRate,dur=0.5,n=Math.ceil(sr*dur),buf=c.createBuffer(1,n,sr),d=buf.getChannelData(0);
  const hits=[];let t=0.02;while(t<0.42){hits.push(t);t+=0.032+Math.random()*0.03;}hits.push(0.46);
  for(let i=0;i<n;i++){const tt=i/sr;let v=0;for(const h of hits){const dt=tt-h;if(dt>=0&&dt<0.012)v+=(Math.random()*2-1)*Math.exp(-dt/0.0025)*(h===0.46?1.4:0.8);}d[i]=v+(Math.random()*2-1)*0.04*(tt<0.45?1:0);}
  const src=c.createBufferSource(),bp=c.createBiquadFilter(),lp=c.createBiquadFilter(),g=c.createGain();
  src.buffer=buf;bp.type='bandpass';bp.frequency.value=2200;bp.Q.value=0.6;lp.type='lowpass';lp.frequency.value=6000;g.gain.value=TEAR_GAIN;
  src.connect(bp).connect(lp).connect(g).connect(c.destination);src.start(c.currentTime+0.01);
}
const TEAR_GAIN=0.09;
function sfxFly(c,delay=0,dur=4.2){
  // a jet passing high overhead: soft roar with the slow "phasing" sweep of ground reflection, a faint turbine whine dropping in pitch
  if(!c)return; const t0=c.currentTime+delay,T=dur+1.6,sr=c.sampleRate,n=Math.ceil(sr*T),buf=c.createBuffer(1,n,sr),d=buf.getChannelData(0);
  let br=0,pk=0;for(let i=0;i<n;i++){const w=Math.random()*2-1;br=(br+0.02*w)/1.02;pk=0.9*pk+0.1*w;d[i]=br*3.2+pk*0.35;}
  const src=c.createBufferSource();src.buffer=buf;
  const lp=c.createBiquadFilter();lp.type='lowpass';lp.Q.value=0.4;lp.frequency.setValueAtTime(700,t0);lp.frequency.linearRampToValueAtTime(1500,t0+T*0.42);lp.frequency.linearRampToValueAtTime(600,t0+T);
  const dry=c.createGain(),wet=c.createGain(),dl=c.createDelay(0.05),mix=c.createGain(),g=c.createGain();
  dry.gain.value=0.7;wet.gain.value=0.6;dl.delayTime.setValueAtTime(0.009,t0);dl.delayTime.exponentialRampToValueAtTime(0.0007,t0+T*0.55);dl.delayTime.exponentialRampToValueAtTime(0.004,t0+T);
  src.connect(lp);lp.connect(dry).connect(mix);lp.connect(dl).connect(wet).connect(mix);
  const wh=c.createOscillator(),wh2=c.createOscillator(),wg=c.createGain();wh.type='sine';wh2.type='sine';
  wh.frequency.setValueAtTime(2350,t0);wh.frequency.exponentialRampToValueAtTime(1950,t0+T);wh2.frequency.setValueAtTime(3480,t0);wh2.frequency.exponentialRampToValueAtTime(2900,t0+T);
  wg.gain.setValueAtTime(0.0001,t0);wg.gain.exponentialRampToValueAtTime(0.012,t0+T*0.4);wg.gain.exponentialRampToValueAtTime(0.0001,t0+T*0.8);
  wh.connect(wg);wh2.connect(wg);wg.connect(mix);
  g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.16,t0+T*0.45);g.gain.setValueAtTime(0.16,t0+T*0.5);g.gain.exponentialRampToValueAtTime(0.0001,t0+T);
  let out=mix.connect(g);const pan=c.createStereoPanner?c.createStereoPanner():null;
  if(pan){pan.pan.setValueAtTime(-0.5,t0);pan.pan.linearRampToValueAtTime(0.5,t0+T);out=out.connect(pan);}
  out.connect(c.destination);src.start(t0);src.stop(t0+T);wh.start(t0);wh2.start(t0);wh.stop(t0+T);wh2.stop(t0+T);
}
const introTools=label=>`<div class="itools"><button class="snd" data-sound aria-pressed="${state.sound}" aria-label="${state.sound?'효과음 끄기':'효과음 켜기'}">${svg(state.sound?'sndon':'sndoff','')}</button><button class="skip" data-skip>${label}</button></div>`;
function toggleSound(){state.sound=!state.sound;LS.set('sound',state.sound);if(!state.sound&&actx){try{actx.suspend();}catch(e){}}else audio(true);
  document.querySelectorAll('[data-sound]').forEach(b=>{b.setAttribute('aria-pressed',state.sound);b.setAttribute('aria-label',state.sound?'효과음 끄기':'효과음 켜기');if(b.classList.contains('snd'))b.innerHTML=svg(state.sound?'sndon':'sndoff','');else b.textContent=state.sound?'효과음 끄기':'효과음 켜기';});}

/* ===================== intro ===================== */
let introTimers=[];
const clearTimers=()=>{introTimers.forEach(clearTimeout);introTimers=[];};
const at=(ms,fn)=>introTimers.push(setTimeout(fn,ms));
const finaleSC=()=>`<div class="sc final"><svg class="art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c8f6"/><stop offset=".6" stop-color="#cfe0fb"/><stop offset="1" stop-color="#f1e6f7"/></linearGradient></defs>
  <rect width="400" height="800" fill="url(#skyA)"/>${cloud(-40,120,1.6,.75)}${cloud(250,240,1.2,.6)}${cloud(-20,560,2,.85)}${cloud(230,640,2.4,.9)}${cloud(120,420,1,.5)}
  <path id="hp" d="M-40 860 C 40 760, 120 620, 200 560 C 280 500, 340 420, 300 360 C 268 314, 214 330, 200 372 C 186 330, 132 314, 100 360 C 60 420, 120 500, 200 560 C 260 604, 330 520, 460 300" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" style="stroke-dasharray:3000;stroke-dashoffset:3000"/>
  <g id="aplane" transform="translate(-60 900)"><g transform="scale(1.4)">${planeTop('#ffffff','#b9c3ea')}</g></g></svg>
  <div class="txt"><h2 class="rise">도쿄 태교여행</h2><div class="en rise d1">11.24 — 11.26 · TOKYO · 2N3D</div></div>
  <button class="cta go-a rise d3" data-enter>여행 시작하기 ${svg('chev')}</button></div>`;
function introHTML(){
  return `<div class="intro introD" data-intro role="dialog" aria-label="여행 인트로">
    ${introTools('건너뛰기')}
    <div class="sc"><div class="porthole"><svg viewBox="0 0 210 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9cff8"/><stop offset=".55" stop-color="#e3dcf7"/><stop offset=".75" stop-color="#ffd9c6"/><stop offset="1" stop-color="#fff1e6"/></linearGradient></defs>
        <rect width="210" height="300" fill="url(#pw)"/><circle cx="140" cy="205" r="34" fill="#fff6e6" opacity=".9"/>
        <g class="drift">${cloud(-10,200,1.1,1)}${cloud(110,230,1.4,1)}${cloud(200,200,1.1,1)}${cloud(320,230,1.4,1)}${cloud(40,90,.6,.7)}${cloud(250,90,.6,.7)}</g></svg><div class="shade"></div></div>
      <div class="txt" style="top:calc(470px + env(safe-area-inset-top,0px));text-align:center"><h2 class="rise">다음 달,<br>셋이서 도쿄에 가요</h2><div class="en rise d1">SEOUL → TOKYO · 11.24</div></div></div>
    <div class="sc"><svg class="art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice"><rect width="400" height="800" fill="#e8ecfb"/>${cloud(-30,90,1.3,.9)}${cloud(240,170,1,.8)}${cloud(-50,620,2.4,1)}${cloud(200,680,2.6,1)}</svg>
      <div class="txt" style="top:calc(120px + env(safe-area-inset-top,0px))"><h2 class="rise">탑승권이<br>도착했어요</h2><p class="rise d1">표를 끊으면 바로 출발해요</p></div>
      <button class="ticket" data-tear aria-label="표를 끊고 출발하기" style="--stub:#5a6fe3;--tk:#7c83ad;--tv:#232849;bottom:calc(36% + env(safe-area-inset-bottom,0px))"><div class="main"><div class="k">ADMIT 3 · 엄마 · 아빠 · 아가</div><div class="v">서울 → 도쿄</div>
        <div class="row"><div><div class="k">DATE</div><div class="v">11.24 – 26</div></div><div><div class="k">FLIGHT</div><div class="v">${esc(flights().out.no||'ICN→NRT')}</div></div><div><div class="k">SEAT</div><div class="v">통로석</div></div></div></div>
        <div class="stub"><span class="pulse">탭해서<br>표 끊기</span></div></button></div>
    ${finaleSC()}
  </div>`;
}
function flyHeart(el){
  const hp=el.querySelector('#hp'),ap=el.querySelector('#aplane');if(!hp||!ap)return;
  const L=hp.getTotalLength(),D=4200,t0=performance.now();
  hp.style.strokeDasharray=L;hp.style.strokeDashoffset=L;
  const step=now=>{if(!el.querySelector('#hp'))return;const t=Math.min(1,(now-t0)/D),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2,len=L*e;
    const p=hp.getPointAtLength(len),q=hp.getPointAtLength(Math.min(L,len+1)),ang=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI;
    hp.style.strokeDashoffset=L-len;ap.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${ang})`);if(t<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
}
function showIntro(){
  clearTimers();closeSheet();
  const el=$('#intro');el.innerHTML=introHTML();el.hidden=false;$('#tabs').hidden=true;document.body.style.overflow='hidden';
  const scenes=[...el.querySelectorAll('.sc')],show=i=>scenes.forEach((s,j)=>s.classList.toggle('on',j===i));
  let stage=0;el._done=false;
  const toTicket=()=>{clearTimers();stage=1;show(1);};
  const tear=()=>{if(stage===2)return;stage=2;el.querySelector('[data-tear]').classList.add('torn');const c=audio(true);sfxTear(c);if(!reduced())sfxFly(c,0.8);
    at(reduced()?0:750,()=>{show(2);el._done=true;if(reduced())el._final();else flyHeart(el);});};
  el._final=()=>{clearTimers();stage=2;show(2);el._done=true;const hp=el.querySelector('#hp');if(hp){hp.style.transition='none';hp.style.strokeDashoffset='0';}const ap=el.querySelector('#aplane');if(ap)ap.setAttribute('transform','translate(460 300) rotate(-50)');};
  el._tap=()=>{if(el._done){finishIntro();return;}if(stage===0)toTicket();else tear();};
  show(0);at(reduced()?1200:3600,toTicket);
}
function finishIntro(){const el=$('#intro');clearTimers();el.hidden=true;el.innerHTML='';document.body.style.overflow='';enter();}

/* ===================== sheets & overlays ===================== */
function openSheet(html){$('#sheetRoot').innerHTML=`<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;const f=$('#sheetRoot .sh-x');if(f)f.focus({preventScroll:true});hydrateFiles($('#sheetRoot'));}
const closeSheet=()=>{$('#sheetRoot').innerHTML='';};
const shHead=(title,sub,lead='')=>`<div class="sh-head">${lead}<div class="m"><h3>${title}</h3>${sub?`<div class="s">${sub}</div>`:''}</div><button class="sh-x" aria-label="닫기">×</button></div>`;
let wakeLock=null;
async function keepAwake(on){try{if(on&&'wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');else if(!on&&wakeLock){await wakeLock.release();wakeLock=null;}}catch(e){}}
function openOverlay(html,awake){const el=$('#overlay');el.innerHTML=html;el.hidden=false;document.body.style.overflow='hidden';if(awake)keepAwake(true);hydrateFiles(el);const b=el.querySelector('.ov-x');if(b)b.focus({preventScroll:true});}
function closeOverlay(){const el=$('#overlay');el.hidden=true;el.innerHTML='';document.body.style.overflow='';keepAwake(false);if('speechSynthesis' in window)speechSynthesis.cancel();}

function signRows(id){
  const rows=SIGNS[id]||[[PL[id].jp,'',PL[id].n]];
  return `<div class="signs">${rows.map((s,i)=>`<div class="sign">
      <div class="sj"><span class="ja" lang="ja">${esc(s[0])}</span>${s[1]?`<span class="kana" lang="ja">${esc(s[1])}</span>`:''}<span class="ko">${esc(s[2])}</span></div>
      <div class="sa"><button class="icon-btn" data-say="${esc(s[0])}" aria-label="${esc(s[2])} 일본어로 듣기">${svg('speak')}</button><button class="icon-btn" data-bigsign="${id}|${i}" aria-label="${esc(s[2])} 크게 보기">${svg('expand')}</button></div></div>`).join('')}</div>`;
}
function bigSign(id,i,ask){
  const s=(SIGNS[id]||[[PL[id].jp,'',PL[id].n]])[i],a=askOf(s),show=ask?a:s;
  openOverlay(`<div class="bigsign"><button class="ov-x" data-closeov aria-label="닫기">×</button>
    <div class="bs-mode"><button data-bigsign="${id}|${i}" aria-pressed="${!ask}">간판 대조</button><button data-bigask="${id}|${i}" aria-pressed="${!!ask}">어디예요? 묻기</button></div>
    <div class="bs-ja" lang="ja">${esc(show[0])}</div><div class="bs-kana" lang="ja">${esc(show[1])}</div><div class="bs-ko">${esc(show[2])}</div>
    <div class="bs-acts"><button class="btn acc" data-say="${esc(show[0])}">${svg('speak')}듣기</button><button class="btn" data-sayslow="${esc(show[0])}">천천히</button></div>
    <p class="fine">${ask?'화면을 보여 주거나 듣기를 눌러 길을 물어보세요.':'간판·안내판에 이 글자가 있는지 맞춰 보세요.'}</p></div>`);
}
function placeSheet(id){
  const p=PL[id],days=[1,2,3].filter(d=>planOf(d).some(s=>s.p===id)),saved=savedSet(),tks=tickets().filter(t=>t.place===id);
  openSheet(`${shHead(esc(p.n),`<span style="color:var(${CAT[p.cat].c})">${p.cat}</span> · ${esc(p.area)}`,thumb(id))}
    <div style="display:flex;gap:6px;flex-wrap:wrap">${safeChip(p)}${days.map(d=>`<span class="chip" style="color:var(${dayOf(d).c})">DAY ${d} 일정</span>`).join('')}${p.ticket&&!tks.length?'<span class="chip warn">티켓 아직 없음</span>':''}</div>
    ${tks.map(t=>`<button class="btn acc" data-showticket="${t.id}">${svg('ticket')}${esc(t.title)} 티켓 보여주기</button>`).join('')}
    <div><div class="grp" style="margin-top:0">일본어 간판 · 발음</div>${signRows(id)}
      <button class="btn ghost" style="width:100%;margin-top:8px" data-bigask="${id}|0">${svg('talk')}「${esc(mainSign(id)[0])}」 어디예요? 물어보기</button></div>
    <p style="margin:0;font-size:15px">${esc(p.d)}${id==='airport'?(()=>{const f=flights();return f.out.term||f.in.term?` 가는 편 ${f.out.term||'터미널 미입력'} · 오는 편 ${f.in.term||'터미널 미입력'}`:' 터미널은 항공편 정보에 넣어 주세요.';})():''}</p>
    <dl class="facts">${p.stn?`<dt>가까운 역</dt><dd><span class="mono">${p.stn.join('')}</span> ${esc(p.sname)}</dd>`:''}${p.walk?`<dt>걷는 양</dt><dd>${walkHTML(p.walk)}</dd>`:''}${p.price?`<dt>가격대</dt><dd class="mono">${'¥'.repeat(p.price)}<span style="color:var(--soft2)">${'¥'.repeat(4-p.price)}</span></dd>`:''}</dl>
    ${p.tips?`<div class="note"><h4>임산부 팁</h4><ul>${p.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
    <div class="sh-acts"><a class="btn acc" href="${gdir(null,p.off?p.q:p.ll,'transit')}" target="_blank" rel="noopener">${svg('nav')}여기로 길찾기</a><a class="btn" href="${gsearch(p.q)}" target="_blank" rel="noopener">${svg('pin')}구글 지도</a>
      ${id!=='hotel'&&id!=='airport'?`<button class="btn" data-heart="${id}" aria-pressed="${saved.has(id)}">${svg('heart')}${saved.has(id)?'저장됨':'저장'}</button><button class="btn pri" data-addto="${id}">${svg('plus')}일정에 추가</button>`:''}</div>
    <p class="fine">영업시간과 휴무일은 방문 전에 확인하세요.</p>`);
}
function addToSheet(id){openSheet(`${shHead('어느 날에 추가할까요?',esc(PL[id].n))}<div class="stack">${DAYS.map(d=>`<button class="btn" style="justify-content:flex-start" data-addday="${d.id}|${id}"><span class="mono" style="color:var(${d.c})">DAY ${d.id}</span> ${d.label} · ${d.title}</button>`).join('')}</div>`);}
function pickPlaceSheet(d){
  const saved=savedSet();
  openSheet(`${shHead(`DAY ${d}에 장소 추가`,'저장한 장소가 위에 나와요')}${['관광명소','맛집','카페·간식','쇼핑'].map(g=>{const ids=Object.keys(PL).filter(id=>PL[id].cat===g).sort((a,b)=>saved.has(b)-saved.has(a));
    return `<div><div class="grp">${g}</div><div class="pick">${ids.map(id=>`<button data-addday="${d}|${id}">${thumb(id)}<span style="flex:1;min-width:0"><b>${esc(PL[id].n)}</b><br><span class="fine" lang="ja">${esc(mainSign(id)[0])}</span></span>${svg('plus')}</button>`).join('')}</div></div>`;}).join('')}`);
}
function toolSheet(k){
  if(k==='weather')openSheet(`${shHead('11월 하순 도쿄 날씨','평년 기준이에요. 출발 일주일 전 예보를 확인하세요.')}
    <div class="wx"><div><span class="k">낮 최고</span><span class="v">14~16℃</span></div><div><span class="k">아침·저녁</span><span class="v">7~9℃</span></div><div><span class="k">해 지는 시간</span><span class="v">16:30</span></div></div>
    <div class="note"><ul><li>해가 지면 빨리 쌀쌀해져요. 얇은 겉옷을 여러 겹 챙기세요.</li><li>한국과 일본은 시차가 없어요(UTC+9).</li></ul></div>
    <a class="btn" href="https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=130000" target="_blank" rel="noopener">일본 기상청 도쿄 예보 보기</a>`);
  if(k==='rate'){const r=rate();openSheet(`${shHead('환율 계산기','100엔당 원화 금액을 출발 전 환율로 고쳐 주세요.')}
    <div class="conv"><div><label for="yenIn">엔</label><input id="yenIn" inputmode="numeric" value="1000"></div><div class="eq">=</div><div><label for="wonOut">원</label><input id="wonOut" value="${Math.round(1000*r).toLocaleString('ko-KR')}" readonly></div></div>
    <div class="quick">${[500,1000,3000,5000,10000].map(v=>`<button class="btn sm ghost" data-quick="${v}">${yen(v)}</button>`).join('')}</div>
    <div class="rate"><label for="rateIn">100엔 =</label><input id="rateIn" inputmode="decimal" value="${(r*100).toFixed(0)}">원 · 둘이 같은 환율을 써요</div>`);}
  if(k==='talk')openSheet(`${shHead('일본어 회화','누르면 듣기, 오른쪽 버튼은 크게 보여주기예요.')}<div class="signs">${PHRASES.map((p,i)=>`<div class="sign"><div class="sj"><span class="ja" lang="ja">${p[0]}</span><span class="kana" lang="ja">${p[1]}</span><span class="ko">${p[2]}</span></div><div class="sa"><button class="icon-btn" data-say="${p[0]}" aria-label="${p[2]} 듣기">${svg('speak')}</button><button class="icon-btn" data-bigphrase="${i}" aria-label="${p[2]} 크게 보기">${svg('expand')}</button></div></div>`).join('')}</div>`);
  if(k==='home')openSheet(`${shHead('숙소로 돌아가기',esc(PL.hotel.n)+' · '+esc(PL.hotel.sname),thumb('hotel'))}
    <div class="sh-acts"><a class="btn acc" href="${gdir(null,PL.hotel.ll,'transit')}" target="_blank" rel="noopener">${svg('train')}지하철로</a><a class="btn" href="${gdir(null,PL.hotel.ll,'driving')}" target="_blank" rel="noopener">${svg('taxi')}택시 경로</a></div>
    <button class="btn ghost" data-bigphrase="8">${svg('expand')}택시 기사에게 보여주기</button>${signRows('hotel')}`);
}
function bigPhrase(i){const p=PHRASES[i];openOverlay(`<div class="bigsign"><button class="ov-x" data-closeov aria-label="닫기">×</button><div class="bs-ja" lang="ja">${p[0]}</div><div class="bs-kana" lang="ja">${p[1]}</div><div class="bs-ko">${p[2]}</div><div class="bs-acts"><button class="btn acc" data-say="${p[0]}">${svg('speak')}듣기</button><button class="btn" data-sayslow="${p[0]}">천천히</button></div></div>`);}

/* ---------- trip settings ---------- */
function settingsSheet(){
  const m=Sync.meta,mine=member(me());
  openSheet(`${shHead('우리 여행',esc(m.tripName||'도쿄 태교여행'))}
    <div class="invite"><div><div class="k">초대 코드</div><div class="code mono">${esc(m.inviteCode||'—')}</div></div><button class="btn sm" data-copy="${esc(m.inviteCode||'')}">복사</button></div>
    <p class="fine">함께 쓸 사람은 앱에 가입한 뒤 '초대 코드로 참여'에 이 코드를 넣으면 돼요.</p>
    <div><div class="grp">함께하는 사람</div>${Sync.members.map(x=>`<div class="mrow">${avatar(x.user_id)}<b>${esc(x.display_name)}</b>${x.user_id===me()?'<span class="chip">나</span>':''}</div>`).join('')||'<p class="fine">동기화되면 보여요.</p>'}</div>
    <div class="names"><label>내 이름<input id="myName" value="${esc(mine.display_name)}" maxlength="12"></label><label>내 색<span class="colors">${COLORS.map(c=>`<button type="button" class="cdot" data-mycolor="${c}" aria-pressed="${mine.color===c}" style="--c:${c}" aria-label="색 ${c}"></button>`).join('')}</span></label></div>
    <button class="btn pri" data-saveprofile>이름 저장</button>
    <button class="btn" data-flights>${svg('plane')}항공편 정보 (인천 ⇄ 나리타)</button>
    <div class="grp">동기화</div><div class="sync-row"><span>${syncText()}</span><button class="btn sm" data-syncnow>${svg('sync')}지금 동기화</button></div>
    <div class="sh-acts"><button class="btn" data-sound aria-pressed="${state.sound}">${state.sound?'효과음 끄기':'효과음 켜기'}</button><button class="btn" data-replay>인트로 다시 보기</button></div>
    <button class="btn ghost" data-signout>로그아웃</button>
    <p class="fine">로그아웃하면 이 휴대폰에 저장된 여행 데이터도 지워져요. 서버에 올라간 기록은 그대로 남아요.</p>`);
}

/* ---------- flights ---------- */
function flightSheet(){
  const f=flights(),row=(k,lbl,x)=>`<div class="fl-block"><div class="grp" style="margin-top:0">${lbl} · ${esc(x.fromCity)} → ${esc(x.toCity)}</div>
    <div class="two3"><div><label class="f" for="${k}No">편명</label><input type="text" id="${k}No" value="${esc(x.no)}" placeholder="예: KE705" autocomplete="off" autocapitalize="characters"></div>
    <div><label class="f" for="${k}Dep">출발</label><input type="time" id="${k}Dep" value="${esc(x.dep)}"></div><div><label class="f" for="${k}Arr">도착</label><input type="time" id="${k}Arr" value="${esc(x.arr)}"></div></div>
    <label class="f" for="${k}Term">나리타 터미널</label><select id="${k}Term">${['','제1터미널','제2터미널','제3터미널'].map(t=>`<option value="${t}" ${x.term===t?'selected':''}>${t||'모름'}</option>`).join('')}</select></div>`;
  openSheet(`${shHead('항공편 정보','인천 ⇄ 나리타 · 입력하면 일정·티켓에 바로 반영돼요')}
    <form id="flightForm" class="stack" novalidate>${row('o','가는 편',f.out)}${row('i','오는 편',f.in)}
    <p class="fine">항공사마다 나리타 터미널이 달라요. 예약 메일이나 항공사 앱에서 확인해 넣어 주세요.</p>
    <button class="btn acc" type="submit">저장</button></form>`);
}
function saveFlights(){
  const v=id=>$('#'+id).value.trim(),f=flights();
  const out={...f.out,no:v('oNo').toUpperCase(),dep:v('oDep'),arr:v('oArr'),term:v('oTerm')},inn={...f.in,no:v('iNo').toUpperCase(),dep:v('iDep'),arr:v('iArr'),term:v('iTerm')};
  Sync.put('flights','trip',{out,in:inn});
  // keep the airport stops in step with the flights
  const sub=(t,m)=>{const [h,mm]=t.split(':').map(Number),x=h*60+mm-m;return `${String(Math.floor((x+1440)%1440/60)).padStart(2,'0')}:${String((x+1440)%60).padStart(2,'0')}`;};
  const d1=planOf(1),a1=d1.find(s=>s.p==='airport');if(a1&&out.arr){a1.t=out.arr;setPlan(1,d1);}
  const d3=planOf(3),a3=[...d3].reverse().find(s=>s.p==='airport');if(a3&&inn.dep){a3.t=sub(inn.dep,150);a3.dur='출발 2시간 30분 전 도착';setPlan(3,d3);}
  closeSheet();toast('항공편을 저장했어요. 둘 다에게 반영돼요.');render();
}

/* ---------- tickets ---------- */
function ticketForm(t){
  const tf=t?{...t}:{type:'입장권',title:'',day:1,time:'',place:'',code:'',memo:'',files:[]};
  state.tf={...tf,newFiles:[]};
  openSheet(`${shHead(t?'티켓 고치기':'티켓 추가','QR·바코드가 잘 보이는 사진이나 캡처, PDF를 올려 주세요')}
    <form id="ticketForm" class="stack" novalidate>
      <div class="catpick" role="group" aria-label="종류">${TICKET_TYPES.map(k=>`<button type="button" data-ttype="${k}" aria-pressed="${tf.type===k}">${k}</button>`).join('')}</div>
      <label class="f" for="tTitle">이름</label><input type="text" id="tTitle" value="${esc(tf.title)}" placeholder="예: 시부야 스카이 16:00 입장">
      <div class="catpick" role="group" aria-label="날짜">${DAYS.map(d=>`<button type="button" data-tday="${d.id}" aria-pressed="${tf.day===d.id}">DAY ${d.id}</button>`).join('')}</div>
      <div class="two"><div><label class="f" for="tTime">시간</label><input type="time" id="tTime" value="${esc(tf.time)}"></div>
        <div><label class="f" for="tPlace">장소</label><select id="tPlace"><option value="">선택 안 함</option>${Object.keys(PL).map(id=>`<option value="${id}" ${tf.place===id?'selected':''}>${esc(PL[id].n)}</option>`).join('')}</select></div></div>
      <label class="f" for="tCode">예약 번호 · 좌석 (선택)</label><input type="text" id="tCode" value="${esc(tf.code)}" placeholder="예: 6ABC12 · 23A" autocomplete="off">
      <label class="f" for="tMemo">메모 (선택)</label><input type="text" id="tMemo" value="${esc(tf.memo)}" placeholder="예: 3터미널 2층 L 카운터">
      <div id="tFiles" class="tfiles">${filesEditHTML()}</div>
      <label class="btn photo-btn">${svg('camera')}사진 · PDF 추가<input type="file" id="tFileIn" accept="image/*,application/pdf" multiple></label>
      <p class="err" id="tErr" hidden></p>
      <button class="btn acc" type="submit">${svg('ticket')}저장</button>
      ${t?`<button class="btn ghost" type="button" data-delticket="${t.id}" style="color:var(--no)">티켓 삭제</button>`:''}
    </form>`);
  state.tf.id=t?t.id:null;state.tf.slot=t?t.slot:'';
}
function filesEditHTML(){const tf=state.tf;return [...tf.files.map((f,i)=>`<div class="tfile"><span class="tfi">${f.mime==='application/pdf'?svg('file'):`<img data-file="${esc(f.path)}" alt="">`}</span><span>${esc(f.name||'파일')}</span><button type="button" data-rmfile="o${i}" aria-label="빼기">×</button></div>`),
  ...tf.newFiles.map((f,i)=>`<div class="tfile"><span class="tfi">${f.blob.type==='application/pdf'?svg('file'):`<img src="${f.url}" alt="">`}</span><span>${esc(f.name)}</span><button type="button" data-rmfile="n${i}" aria-label="빼기">×</button></div>`)].join('');}
async function saveTicket(){
  const tf=state.tf,title=$('#tTitle').value.trim(),err=$('#tErr');
  if(!title){err.textContent='티켓 이름을 적어 주세요.';err.hidden=false;$('#tTitle').focus();return;}
  if(!tf.files.length&&!tf.newFiles.length&&!$('#tCode').value.trim()){err.textContent='사진·PDF를 올리거나 예약 번호를 적어 주세요.';err.hidden=false;return;}
  const files=[...tf.files];
  for(const f of tf.newFiles){const ext=(f.name.split('.').pop()||'').toLowerCase().slice(0,5)||(f.blob.type==='application/pdf'?'pdf':'jpg');
    try{files.push({path:await Sync.addFile(f.blob,ext),name:f.name,mime:f.blob.type||'image/jpeg'});}catch(e){err.textContent='이 휴대폰 저장 공간이 부족해 파일을 저장하지 못했어요.';err.hidden=false;return;}}
  const id=tf.id||uid();
  Sync.put('ticket',id,{type:tf.type,title,day:tf.day,time:$('#tTime').value,place:$('#tPlace').value,code:$('#tCode').value.trim(),memo:$('#tMemo').value.trim(),files,slot:tf.slot||'',at:tf.at||new Date().toISOString()});
  closeSheet();toast('티켓을 저장했어요. 인터넷이 없어도 열려요.');render();
}
function showTicket(id){
  const t=Sync.get('ticket',id);if(!t)return;
  openOverlay(`<div class="tshow"><div class="ts-top"><div><div class="k">${esc(t.type)} · DAY ${t.day}${t.time?' · '+esc(t.time):''}</div><b>${esc(t.title)}</b></div><button class="ov-x" data-closeov aria-label="닫기">×</button></div>
    ${t.code?`<div class="ts-code"><span class="k">예약 번호 · 좌석</span><span class="mono">${esc(t.code)}</span></div>`:''}
    <div class="ts-files">${(t.files||[]).map(f=>f.mime==='application/pdf'?`<a class="btn" data-pdf="${esc(f.path)}" href="#" target="_blank" rel="noopener">${svg('file')}${esc(f.name||'PDF')} 열기</a>`:`<img data-file="${esc(f.path)}" alt="${esc(t.title)} 티켓">`).join('')||'<p class="fine">올린 파일이 없어요.</p>'}</div>
    ${t.memo?`<p class="ts-memo">${esc(t.memo)}</p>`:''}
    <p class="fine ts-hint">화면 밝기를 최대로 올리고 보여 주세요. 이 화면이 열려 있는 동안 화면이 꺼지지 않아요.</p>
    <button class="btn sm ghost" data-editticket="${t.id}">고치기</button></div>`,true);
}
async function hydrateFiles(root){
  for(const img of root.querySelectorAll('img[data-file]')){const u=await Sync.fileURL(img.dataset.file);if(u)img.src=u;else{img.alt='오프라인이라 아직 못 받은 파일이에요';img.classList.add('missing');}}
  for(const a of root.querySelectorAll('a[data-pdf]')){const u=await Sync.fileURL(a.dataset.pdf);if(u)a.href=u;}
}
/* ===================== views ===================== */
const daysUntil=()=>{const t=new Date();t.setHours(0,0,0,0);return Math.round((TRIP_START-t)/86400000);};
const TRIP_START=new Date(2026,10,24);
const ddayTxt=()=>{const n=daysUntil();return n>0?`D-${n}`:n>-3?`여행 ${1-n}일차`:'다녀옴';};
const TITLES={home:'도쿄 태교여행',plan:'일정',tickets:'티켓',diary:'우리의 기록',money:'가계부',places:'장소',prep:'준비물 · 연락처'};
function syncText(){const s=Sync.status,n=Sync.dirtyCount();
  return {synced:'둘 다 같은 내용이에요',syncing:'맞추는 중…',offline:n?`오프라인 · ${n}개는 연결되면 보내요`:'오프라인 · 이 휴대폰에 저장됨',pending:`보낼 것 ${n}개`,error:'잠시 후 다시 맞춰요',signedout:'다시 로그인이 필요해요',idle:'준비 중'}[s]||s;}
const syncDot=()=>`<button class="syncdot s-${Sync.status}" data-settings aria-label="동기화 상태: ${syncText()}"><i></i>${Sync.status==='offline'?'오프라인':Sync.status==='synced'?'':Sync.status==='syncing'?'':'!'}</button>`;
function header(){
  if(state.tab==='auth'||state.tab==='onboard')return `<h1>도쿄 태교여행</h1>`;
  if(state.tab==='places'||state.tab==='prep')return `<button class="back" data-tab="home" aria-label="홈으로">${svg('back')}</button><h1>${TITLES[state.tab]}</h1>${syncDot()}`;
  const right=state.tab==='plan'?`<button class="btn sm ${state.edit?'pri':''}" data-edit>${state.edit?'완료':'편집'}</button>`:state.tab==='tickets'?`<button class="btn sm acc" data-addticket>${svg('plus')}추가</button>`:state.tab==='home'?`<span class="dday">${ddayTxt()}</span>`:'';
  return `<h1>${TITLES[state.tab]}</h1>${syncDot()}${right}`;
}
function totals(){const t={sum:0,by:{}};expenses().forEach(e=>{const v=toKRW(e);t.sum+=v;t.by[e.cat]=(t.by[e.cat]||0)+v;});return t;}
function catBar(t,base){return `<div class="bar">${Object.keys(XCAT).filter(k=>t.by[k]).map(k=>`<i style="width:${(t.by[k]/base*100).toFixed(2)}%;background:var(${XCAT[k]})"></i>`).join('')}</div>`;}
function heroArt(){return `<svg class="art" viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="hD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b6cbf7"/><stop offset=".7" stop-color="#dcdcf8"/><stop offset="1" stop-color="#f6e2e2"/></linearGradient></defs><rect width="400" height="200" fill="url(#hD)"/>${cloud(-20,24,.8,.8)}${cloud(300,130,1.2,1)}<path d="M170 120 C 230 100, 262 70, 250 52 C 242 40, 226 44, 222 56 C 218 44, 202 40, 194 52 C 182 70, 214 100, 222 112 C 240 132, 300 90, 350 40" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><g transform="translate(352 38) rotate(-45)">${planeTop('#fff','#b9c3ea')}</g></svg>`;}
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
let installEvt=null;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(state.tab==='home'||(state.tab==='auth'&&!document.activeElement.closest('form')))render();});
function installCard(){
  const ua=navigator.userAgent,ios=/iphone|ipad|ipod/i.test(ua),inapp=/KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua),kakao=/KAKAOTALK/i.test(ua);
  const installTip=inapp?'카카오톡·인스타그램 같은 앱 안에서는 설치가 안 되고 바로가기만 만들어져요. 아래 버튼으로 '+(ios?'Safari':'Chrome')+'에서 열어 주세요.'
    :installEvt?'아래 버튼을 누르세요.':ios?'Safari 아래쪽 공유 버튼 → 「홈 화면에 추가」':'Chrome 오른쪽 위 ⋮ → 「앱 설치」(처음 열었다면 한 번 새로고침한 뒤)';
  return !standalone()?`<div class="card install">${svg('share')}<div><b>홈 화면에 추가하면 앱처럼 써요</b><p class="fine">${installTip}</p>${inapp&&kakao?`<a class="btn sm acc" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.href.split('#')[0])}">${ios?'Safari':'Chrome'}로 열기</a>`:inapp?`<p class="fine">오른쪽 위 메뉴에서 「다른 브라우저로 열기」를 눌러 주세요.</p>`:''}${installEvt&&!inapp?'<button class="btn sm acc" data-install>앱 설치</button>':''}</div></div>`:'';
}
function slotStatus(){const tk=tickets();return ticketSlots().map(s=>({...s,t:tk.find(t=>t.slot===s.slot)}));}
function viewHome(){
  const all=PREP.flatMap(g=>g.items).length,t=totals(),first=planOf(1).slice(0,4),ds=diary(),last=ds[ds.length-1],checks=checkSet();
  return `<section class="view">
    <div class="hero">${heroArt()}<div class="in"><h2>도쿄에서 보내는<br>느긋한 2박 3일</h2><p><span class="mono">11.24(화) – 11.26(목)</span> · 니혼바시 숙소</p></div></div>
    ${installCard()}
    <button class="mapthumb" data-map="home" data-tab="plan" aria-label="3일 동선 지도, 일정으로 이동"><svg></svg><span class="mlegend">${DAYS.map(d=>`<span style="--c:var(${d.c})"><i></i>DAY ${d.id}</span>`).join('')}</span><span class="open">일정 보기</span></button>
    <div><div class="sec-h"><h2>여행 필수 기능</h2></div><div class="tools">
      <button class="tool" data-tool="talk" style="--tc:#e6e6fd"><span class="ti">${svg('talk','')}</span><b>일본어 회화</b><small>듣기 · 크게 보여주기</small></button>
      <button class="tool" data-tab="places" style="--tc:#e0f1e8"><span class="ti">${svg('grid','')}</span><b>장소 · 간판</b><small>일본어 간판 대조</small></button>
      <button class="tool" data-tool="home" style="--tc:#ffe1e6"><span class="ti">${svg('home','')}</span><b>숙소 가는 길</b><small>지금 위치에서</small></button>
      <button class="tool" data-tool="rate" style="--tc:#dff3e8"><span class="ti">${svg('yen','')}</span><b>환율</b><small>¥1,000 ≈ ${won(1000*rate())}</small></button>
      <button class="tool" data-tool="weather" style="--tc:#fff1c7"><span class="ti">${svg('sun','')}</span><b>날씨</b><small>14℃ · 일몰 16:30</small></button>
      <button class="tool" data-tab="prep" style="--tc:#f1e3fb"><span class="ti">${svg('list','')}</span><b>준비물</b><small>${[...checks].length}/${all} 완료</small></button></div></div>
    <div><div class="sec-h"><h2>티켓</h2><button class="more" data-tab="tickets">티켓 지갑 ${svg('chev')}</button></div>
      <div class="card">${slotStatus().map(s=>`<button class="rsv-row" ${s.t?`data-showticket="${s.t.id}"`:`data-slot="${s.slot}"`}><span class="ri">${svg(s.type==='항공권'?'plane':s.type==='숙소'?'bed':'ticket','')}</span><span class="m"><b>${esc(s.t?s.t.title:s.title)}</b><span class="s">DAY ${s.day} · ${esc(s.t&&s.t.time||s.time)}</span></span>${s.t?'<span class="chip ok">보여주기</span>':'<span class="chip warn">추가 필요</span>'}</button>`).join('')}</div></div>
    <div><div class="sec-h"><h2>최근 기록</h2><button class="more" data-tab="diary">쓰러 가기 ${svg('chev')}</button></div>
      ${last?entryHTML(last,true):`<button class="card budget" data-tab="diary"><b>첫 기록을 남겨 보세요</b><span class="fine">아기에게 쓰는 편지, 한 줄 일기, 맛있었던 것</span></button>`}</div>
    <div><div class="sec-h"><h2>DAY 1 · 11.24 화</h2><button class="more" data-tab="plan" data-day="1">전체 일정 ${svg('chev')}</button></div>
      <div>${first.map(s=>{const p=PL[s.p];return `<div class="mini"><span class="t">${s.t||'--:--'}</span><span class="n">${esc(s.title||p.n)}</span><span class="jp-s" lang="ja">${esc(mainSign(s.p)[0])}</span></div>`;}).join('')}</div></div>
    <div><div class="sec-h"><h2>가계부</h2><button class="more" data-tab="money">기록하기 ${svg('chev')}</button></div>
      <button class="card budget" data-tab="money"><span class="fine">지금까지 쓴 돈</span><span class="big">${won(t.sum)}</span>${catBar(t,Math.max(t.sum,settings().budget))}<span class="fine">예산 ${won(settings().budget)} 중 ${Math.round(t.sum/settings().budget*100)}%</span></button></div>
    <button class="btn ghost" data-settings>${svg('gear')}우리 여행 · 초대 코드 · 동기화</button>
  </section>`;
}
function viewPlan(){
  const d=state.day,day=dayOf(d),st=planOf(d),nums=numbered(d),fi=flights(),fl=d===1?{pos:'top',f:fi.out}:d===3?{pos:'bottom',f:fi.in}:null,tk=tickets();
  const legs=[];for(let i=0;i<st.length-1;i++)legs.push(leg(st[i].p,st[i+1].p));
  const tot=legs.filter(Boolean).reduce((a,l)=>a+l.min,0);
  const ft=tk.find(t=>t.slot===(d===1?'flight-out':'flight-in'));
  const flightRow=fl?`<button class="flight" ${ft?`data-showticket="${ft.id}"`:'data-flights'}>${svg('plane')}<b>${esc(fl.f.no||'항공편')} · ${esc(fl.f.fromCity)} ${esc(fl.f.dep||'--:--')} → ${esc(fl.f.toCity)} ${esc(fl.f.arr||'--:--')}</b><span class="r">${ft?'탑승권 보기':fl.f.no?'탑승권 추가':'항공편 입력'}</span></button>`:'';
  let list='';
  st.forEach((s,i)=>{
    const p=PL[s.p],n=nums.indexOf(s.p)+1,isHome=s.p==='hotel',isAir=s.p==='airport',sg=mainSign(s.p),stk=tk.filter(t=>t.place===s.p&&t.day===d&&t.type!=='항공권');
    const mark=isHome?`<span class="num home">숙소</span>`:isAir?`<span class="num air">${svg('plane','')}</span>`:`<span class="num">${n}</span>`;
    list+=`<li class="stop" style="--c:var(${day.c})"><div class="rail">${mark}</div><div class="body">
      <button class="stop-card" data-place="${s.p}" ${state.edit?'disabled':''}><div class="nm">${esc(s.title||p.n)}</div>
        <div class="meta"><span class="cat" style="--c:var(${CAT[p.cat].c})">${p.cat}</span><span>${esc(isHome?p.n:p.area)}</span>${p.stn&&!isHome?`<span class="mono">${p.stn.join('')}</span>`:''}${p.safe?`<span>${p.safe==='ok'?'임산부 안심':'주문 시 주의'}</span>`:''}</div>
        <div class="when"><b>${s.t||'시간 미정'}</b>${s.dur?`<span>${esc(s.dur)}</span>`:''}</div></button>
      ${state.edit?'':`<div class="jp-row"><button class="jp-chip" data-bigsign="${s.p}|0"><span lang="ja">${esc(sg[0])}</span></button><button class="icon-btn sm" data-say="${esc(sg[0])}" aria-label="${esc(sg[2])} 일본어로 듣기">${svg('speak')}</button>${stk.map(t=>`<button class="btn sm acc" data-showticket="${t.id}">${svg('ticket')}티켓</button>`).join('')}</div>`}
      ${state.edit?`<div class="memo">${svg('memo','')}<textarea data-memo="${i}" aria-label="메모" placeholder="메모를 남겨 보세요">${esc(s.memo||'')}</textarea></div>
        <div class="edit-ctl"><button data-mv="${i}|-1" ${i===0?'disabled':''} aria-label="위로">${svg('up')}</button><button data-mv="${i}|1" ${i===st.length-1?'disabled':''} aria-label="아래로">${svg('down')}</button><button class="del" data-del="${i}">${svg('x')}삭제</button></div>`
      :s.memo?`<div class="memo">${svg('memo','')}<span>${esc(s.memo)}</span></div>`:''}</div></li>`;
    if(i<st.length-1){const l=legs[i];if(l){const [hn,mode]=HOW[l.how],b=PL[st[i+1].p];
      list+=`<li class="stop" style="--c:var(${day.c})"><div class="rail"></div><div class="body"><div class="leg"><span class="how">${svg(l.how==='taxi'?'taxi':l.how==='walk'?'walk':l.how==='bus'?'bus':'train')}${hn}</span><span class="min">${l.min}분</span><a href="${gdir(p.off?p.q:p.ll,b.off?b.q:b.ll,mode)}" target="_blank" rel="noopener">${svg('nav')}길찾기</a>${l.note?`<span class="lnote">${esc(l.note)}</span>`:''}</div></div></li>`;}}
  });
  return `<section class="view">
    <div class="seg days" role="group" aria-label="날짜">${DAYS.map(x=>`<button class="pill" style="--c:var(${x.c})" data-day="${x.id}" aria-pressed="${x.id===d}"><span><i style="margin-right:5px;vertical-align:1px"></i>DAY ${x.id}</span><small>${x.label}</small></button>`).join('')}</div>
    <div>${mapBox('plan','plan',mapCfg('plan'))}<div class="mleg"><span><i></i>지하철</span><span><i class="taxi"></i>택시</span><span><i class="walk"></i>도보</span><span class="fine">핀을 누르면 장소 정보가 열려요</span></div></div>
    <div><div class="day-h" style="--c:var(${day.c})"><span class="dn">DAY ${d}</span><h2>${day.title}</h2><span class="date">${day.label}</span></div>
      <p class="fine">장소 ${nums.length}곳 · 이동 합계 약 ${tot}분 · 일본어를 누르면 간판 대조, 스피커는 발음 듣기${state.edit?' · 바꾼 내용은 둘 다에게 보여요':''}</p></div>
    <div>${fl&&fl.pos==='top'?flightRow:''}<ol class="stops">${list}</ol>${fl&&fl.pos==='bottom'?flightRow:''}
      <div class="addrow"><button class="btn" data-pick="${d}">${svg('plus')}장소 추가</button>${state.edit?`<button class="btn ghost" data-reset>원래 일정으로</button>`:`<button class="btn ghost" data-edit>${svg('memo')}메모 · 순서 편집</button>`}</div></div>
  </section>`;
}
function placeList(){const s=savedSet();return Object.keys(PL).filter(id=>!['hotel','airport'].includes(id)).filter(id=>(state.sCat==='전체'||PL[id].cat===state.sCat)&&(!state.sOnly||s.has(id)));}
function viewPlaces(){
  const cats=['전체','관광명소','맛집','카페·간식','쇼핑'],list=placeList(),saved=savedSet();
  return `<section class="view"><div style="display:flex;flex-direction:column;gap:10px">
      <div class="seg">${cats.map(c=>`<button class="pill" data-scat="${c}" aria-pressed="${state.sCat===c}" ${c!=='전체'?`style="--c:var(${CAT[c].c})"`:''}>${c!=='전체'?'<i></i>':''}${c}</button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><button class="pill" data-sonly aria-pressed="${state.sOnly}">${svg('heart')}저장한 곳만 · ${saved.size}</button>
        <div class="vt" role="group" aria-label="보기 방식"><button data-sview="list" aria-pressed="${state.sView==='list'}">목록</button><button data-sview="map" aria-pressed="${state.sView==='map'}">지도</button></div></div></div>
    ${state.sView==='map'?mapBox('places','places',mapCfg('places')):''}
    <div>${list.length?list.map(id=>{const p=PL[id],sg=mainSign(id),inPlan=[1,2,3].filter(d=>planOf(d).some(s=>s.p===id));
      return `<div class="place-row">${thumb(id)}<button class="m" data-place="${id}"><h4>${esc(p.n)}</h4><div class="jp-line"><span lang="ja">${esc(sg[0])}</span>${sg[1]?` <span class="kana" lang="ja">${esc(sg[1])}</span>`:''}</div><div class="tags">${safeChip(p)}${inPlan.map(d=>`<span class="chip" style="color:var(${dayOf(d).c})">DAY ${d}</span>`).join('')}</div></button>
        <div class="pr-acts"><button class="icon-btn sm" data-say="${esc(sg[0])}" aria-label="${esc(p.n)} 일본어로 듣기">${svg('speak')}</button><button class="heart" data-heart="${id}" aria-pressed="${saved.has(id)}" aria-label="저장">${svg('heart','')}</button></div></div>`;}).join('')
      :`<p class="fine" style="padding:20px 0;text-align:center">저장한 장소가 없어요. 하트를 눌러 모아 보세요.</p>`}</div>
    <div class="note"><h4>메뉴로 고를 때 주의할 음식</h4><ul><li>회전초밥은 장어·계란말이·새우튀김·유부초밥 같은 익힌 접시만</li><li>아마자케는 쌀누룩(米麹) 표시만. 술지게미(酒粕) 것은 알코올이 있어요</li><li>편의점 반숙 달걀, 생햄 샌드위치는 피하기</li></ul></div></section>`;
}
function viewTickets(){
  const tk=tickets(),slots=slotStatus().filter(s=>!s.t);
  const card=t=>{const img=(t.files||[]).find(f=>f.mime!=='application/pdf');return `<button class="card tcard" data-showticket="${t.id}"><span class="tc-thumb">${img?`<img data-file="${esc(img.path)}" alt="">`:svg((t.files||[]).length?'file':'ticket')}</span><span class="m"><span class="k">${esc(t.type)} · DAY ${t.day}${t.time?' · '+esc(t.time):''}</span><b>${esc(t.title)}</b>${t.code?`<span class="mono s">${esc(t.code)}</span>`:''}</span><span class="chip ok" data-offline="${esc((t.files||[]).map(f=>f.path).join('|'))}">보여주기</span></button>`;};
  return `<section class="view">
    <p class="fine">공항·입구에서 이 화면을 보여 주세요. 한 번 열어 본 티켓은 인터넷이 없어도 열려요.</p>
    ${(()=>{const f=flights();return `<button class="card fl-card" data-flights>${svg('plane')}<span class="m"><b>항공편 정보</b><span class="s">가는 편 ${esc(f.out.no||'미입력')} ${esc(f.out.dep||'')} · 오는 편 ${esc(f.in.no||'미입력')} ${esc(f.in.dep||'')}</span></span><span class="chip ${f.out.no&&f.in.no?'ok':'warn'}">${f.out.no&&f.in.no?'고치기':'입력하기'}</span></button>`;})()}
    ${TICKET_TYPES.map(ty=>{const a=tk.filter(t=>t.type===ty),need=slots.filter(s=>s.type===ty);if(!a.length&&!need.length)return '';
      return `<div><div class="sec-h"><h2>${ty}</h2></div><div class="stack">${a.map(card).join('')}${need.map(s=>`<button class="card tslot" data-slot="${s.slot}"><span class="tc-thumb">${svg('plus')}</span><span class="m"><span class="k">DAY ${s.day} · ${s.time}</span><b>${esc(s.title)}</b><span class="s">${esc(s.hint)}</span></span></button>`).join('')}</div></div>`;}).join('')}
    <button class="btn acc" data-addticket>${svg('plus')}다른 티켓 추가</button>
    <div class="note"><h4>알아 두세요</h4><ul><li>항공권은 항공사 앱이나 메일에서 받은 모바일 탑승권 QR을 캡처해 올리면 돼요. 일부 공항·시설은 공식 앱 화면만 받을 수 있어요.</li><li>QR이 잘 보이도록 잘리지 않은 원본 화면을 올려 주세요.</li></ul></div>
  </section>`;
}
function entryHTML(e,preview){
  return `<article class="card entry ${e.kind==='아기에게 편지'?'letter':''}">
    <div class="eh">${avatar(e.who)}<span class="nm">${esc(member(e.who).display_name)}</span><span class="tm mono">${esc(e.ts)}</span>${preview||e.who!==me()?'':`<button class="x" data-deld="${e.id}" aria-label="기록 삭제">×</button>`}</div>
    <span class="kind">${esc(e.kind)}</span>
    ${e.photo?`<img data-file="${esc(e.photo)}" alt="함께 올린 사진">`:''}
    ${e.text?`<div class="body">${esc(e.text)}</div>`:''}
    ${e.stk&&STK[e.stk]?stkSVG(e.stk,'sticker'):''}</article>`;
}
function viewDiary(){
  const f=state.dform,ds=diary(),letters=ds.filter(e=>e.kind==='아기에게 편지').length,order=[...ds].reverse(),groups=[3,2,1,0].map(d=>[d,order.filter(e=>e.day===d)]).filter(([,a])=>a.length);
  const ph={'한 줄 일기':'오늘 어땠어요?','아기에게 편지':'아가에게 들려주고 싶은 이야기','맛있었던 것':'무엇을 먹었고 어땠는지'}[f.kind];
  return `<section class="view">
    <div class="dhead"><h2>셋이 함께 쓰는<br>도쿄 여행 일기</h2><div class="dstats"><span>기록 <b>${ds.length}</b>개</span><span>아기에게 쓴 편지 <b>${letters}</b>통</span></div></div>
    <form class="card compose" id="diaryForm" novalidate>
      <div class="who">${avatar(me())}<b>${esc(member(me()).display_name)}</b><span class="fine">로 남겨요</span></div>
      <div class="kinds" role="group" aria-label="종류">${KINDS.map(k=>`<button type="button" data-kind="${k}" aria-pressed="${f.kind===k}">${k}</button>`).join('')}</div>
      <textarea id="diaryText" placeholder="${ph}" aria-label="내용"></textarea>
      ${f.photoURL?`<div class="preview"><img src="${f.photoURL}" alt="올릴 사진 미리보기"><button type="button" data-nophoto aria-label="사진 빼기">×</button></div>`:''}
      <div class="stickers" role="group" aria-label="스티커">${Object.keys(STK).map(k=>`<button type="button" class="stk" data-stk="${k}" aria-pressed="${f.stk===k}" aria-label="${STKNAME[k]} 스티커">${stkSVG(k)}</button>`).join('')}</div>
      <div class="dpick" role="group" aria-label="날짜">${[[0,'여행 전'],[1,'DAY 1'],[2,'DAY 2'],[3,'DAY 3']].map(([v,l])=>`<button type="button" data-dday="${v}" aria-pressed="${f.day===v}">${l}</button>`).join('')}</div>
      ${state.derr?`<p class="err">${state.derr}</p>`:''}
      <div style="display:flex;gap:8px"><label class="btn photo-btn" style="flex:none">${svg('camera')}사진<input type="file" accept="image/*" id="photoIn" aria-label="사진 고르기"></label><button class="btn acc" type="submit" style="flex:1">${svg('pen')}기록 남기기</button></div>
    </form>
    <div class="feed">${groups.map(([d,a])=>`<h3 class="fday" style="--c:var(${d?dayOf(d).c:'--mute'})"><i></i>${d?`DAY ${d} · ${dayOf(d).label}`:'여행 전'}</h3>${a.map(e=>entryHTML(e)).join('')}`).join('')||'<p class="fine" style="text-align:center;padding:20px 0">아직 기록이 없어요. 첫 기록을 남겨 보세요.</p>'}</div>
  </section>`;
}
function viewMoney(){
  const t=totals(),f=state.form,ex=expenses(),groups=[0,1,2,3].map(d=>[d,ex.filter(e=>e.day===d)]).filter(([,a])=>a.length),st=settings(),pct=Math.min(100,t.sum/st.budget*100);
  return `<section class="view">
    <div class="sum"><div><div class="k">총 지출 (원화 환산)</div><div class="big">${won(t.sum)}</div><div class="yen">엔화 지출 ${yen(ex.filter(e=>e.cur==='JPY').reduce((a,e)=>a+e.amt,0))}</div></div>
      <div class="bar"><i style="width:${pct}%;background:#fff"></i></div>
      <div class="row"><label for="budgetIn">예산 <input id="budgetIn" inputmode="numeric" value="${st.budget.toLocaleString('ko-KR')}"> 원</label><span>남은 돈 ${won(Math.max(0,st.budget-t.sum))}</span></div></div>
    ${t.sum?`<div><div class="sec-h"><h2>분류별</h2></div>${catBar(t,t.sum)}<div class="cats" style="margin-top:10px">${Object.keys(XCAT).filter(k=>t.by[k]).map(k=>`<span style="--c:var(${XCAT[k]})"><i></i>${k} <b>${Math.round(t.by[k]/t.sum*100)}%</b></span>`).join('')}</div></div>`:''}
    <form class="card form" id="expForm" novalidate><div class="sec-h" style="margin:0"><h2>지출 기록</h2></div>
      <div class="amt"><input id="amtIn" inputmode="decimal" placeholder="0" aria-label="금액"><div class="cur" role="group" aria-label="통화"><button type="button" data-cur="JPY" aria-pressed="${f.cur==='JPY'}">¥</button><button type="button" data-cur="KRW" aria-pressed="${f.cur==='KRW'}">₩</button></div></div>
      <div><label class="f">분류</label><div class="catpick">${Object.keys(XCAT).map(k=>`<button type="button" data-xcat="${k}" aria-pressed="${f.cat===k}" style="--c:var(${XCAT[k]})"><i></i>${k}</button>`).join('')}</div></div>
      <div><label class="f">날짜</label><div class="catpick">${[[0,'여행 전'],[1,'DAY 1'],[2,'DAY 2'],[3,'DAY 3']].map(([v,l])=>`<button type="button" data-xday="${v}" aria-pressed="${f.day===v}">${l}</button>`).join('')}</div></div>
      <div><label class="f" for="titleIn">내용</label><input type="text" id="titleIn" placeholder="예: 소라마치 저녁"></div>
      ${state.err?`<p class="err">${state.err}</p>`:''}<button class="btn pri" type="submit">${svg('plus')}기록하기</button></form>
    <div>${groups.map(([d,a])=>`<div class="ex-day"><h3>${d?`DAY ${d} · ${dayOf(d).label}`:'여행 전'}<span>${won(a.reduce((s,e)=>s+toKRW(e),0))}</span></h3>
      ${a.map(e=>`<div class="ex" style="--c:var(${XCAT[e.cat]})"><span class="ci"></span><div class="m"><b>${esc(e.title)}</b><div class="s">${e.cat} · ${esc(member(e.who).display_name)}</div></div><div class="v">${e.cur==='JPY'?yen(e.amt):won(e.amt)}${e.cur==='JPY'?`<small>${won(toKRW(e))}</small>`:''}</div><button class="x" data-delx="${e.id}" aria-label="삭제">×</button></div>`).join('')}</div>`).join('')||'<p class="fine">아직 지출 기록이 없어요.</p>'}</div>
    <p class="fine">엔화는 100엔당 ${Math.round(rate()*100)}원으로 계산해요. 홈의 환율에서 바꾸면 둘 다 같은 환율로 바뀌어요.</p></section>`;
}
function viewPrep(){
  const all=PREP.flatMap(g=>g.items.map(i=>i[0])),checks=checkSet(),done=all.filter(k=>checks.has(k)).length;
  return `<section class="view">
    <div><div class="sec-h"><h2>준비물</h2><span class="mono" style="font-weight:600">${done}/${all.length}</span></div><div class="bar"><i style="width:${done/all.length*100}%;background:var(--accent)"></i></div>
      ${PREP.map(g=>`<div class="grp">${g.g}</div>${g.items.map(([k,t,s])=>`<label class="chk" for="c-${k}"><input type="checkbox" id="c-${k}" data-check="${k}" ${checks.has(k)?'checked':''}><span><div class="t">${esc(t)}</div>${s?`<div class="s">${esc(s)}</div>`:''}</span></label>`).join('')}`).join('')}</div>
    <div class="note" style="background:var(--warn-soft)"><h4>임산부 탑승 규정</h4><ul><li>보통 32주 무렵부터 의사 소견서를 요구하고, 36주 이후 탑승을 제한해요. 항공사 규정을 확인하세요.</li><li>안전벨트는 배 아래, 골반 위로 낮게 매세요.</li></ul></div>
    <div><div class="sec-h"><h2>긴급 연락처</h2></div><div class="sos"><div class="card"><div class="k">구급차 · 소방</div><div class="v">119</div></div><div class="card"><div class="k">경찰</div><div class="v">110</div></div><div class="card" style="grid-column:1/-1"><div class="k">외교부 영사콜센터 (24시간)</div><div class="v">+82-2-3210-0404</div></div></div>
      <button class="btn ghost" style="margin-top:10px" data-bigphrase="0">${svg('expand')}「임신 중이에요」 일본어로 보여주기</button></div></section>`;
}
function viewAuth(){
  const a=state.auth,signup=a.mode==='signup';
  return `<section class="view auth">
    <div class="hero">${heroArt()}<div class="in"><h2>${signup?'처음이에요':'다시 만나요'}</h2><p>둘이 같은 일정·기록·티켓을 보려면 로그인해 주세요.</p></div></div>
    <div class="vt" role="group" aria-label="로그인 방식"><button data-authmode="login" aria-pressed="${!signup}">로그인</button><button data-authmode="signup" aria-pressed="${signup}">가입하기</button></div>
    <form class="card form" id="authForm" novalidate>
      <div><label class="f" for="aEmail">이메일</label><input type="email" id="aEmail" autocomplete="email" required></div>
      <div><label class="f" for="aPw">비밀번호${signup?' (6자 이상)':''}</label><input type="password" id="aPw" autocomplete="${signup?'new-password':'current-password'}" minlength="6" required></div>
      ${a.err?`<p class="err">${esc(a.err)}</p>`:''}${a.info?`<p class="note">${esc(a.info)}</p>`:''}
      <button class="btn acc" type="submit" ${a.busy?'disabled':''}>${a.busy?'잠시만요…':signup?'가입하기':'로그인'}</button>
    </form>
    ${installCard()}
    ${!navigator.onLine?'<p class="fine">처음 로그인할 때는 인터넷이 필요해요.</p>':''}
  </section>`;
}
function viewOnboard(){
  const o=state.onboard,join=o.mode==='join';
  return `<section class="view auth">
    <div class="dhead"><h2>${join?'초대 코드로 참여':'우리 여행 만들기'}</h2><p class="fine">${join?'먼저 여행을 만든 사람에게 초대 코드(8자리)를 받아 넣어 주세요.':'여행을 만들면 초대 코드가 생겨요. 함께 갈 사람에게 보내 주세요.'}</p></div>
    <div class="vt" role="group"><button data-obmode="create" aria-pressed="${!join}">새로 만들기</button><button data-obmode="join" aria-pressed="${join}">초대 코드로 참여</button></div>
    <form class="card form" id="obForm" novalidate>
      ${join?`<div><label class="f" for="obCode">초대 코드</label><input type="text" id="obCode" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="예: 3F9A1C2B"></div>`:''}
      <div><label class="f" for="obName">이 앱에서 쓸 내 이름</label><input type="text" id="obName" maxlength="12" placeholder="예: 아빠, 엄마"></div>
      <div><label class="f">내 색</label><span class="colors">${COLORS.map(c=>`<button type="button" class="cdot" data-obcolor="${c}" aria-pressed="${o.color===c}" style="--c:${c}" aria-label="색 ${c}"></button>`).join('')}</span></div>
      ${o.err?`<p class="err">${esc(o.err)}</p>`:''}
      <button class="btn acc" type="submit" ${o.busy?'disabled':''}>${o.busy?'잠시만요…':join?'참여하기':'여행 만들기'}</button>
    </form>
    <button class="btn ghost" data-signout>다른 계정으로 로그인</button></section>`;
}

/* ===================== render & events ===================== */
const VIEWS={home:viewHome,plan:viewPlan,tickets:viewTickets,diary:viewDiary,money:viewMoney,places:viewPlaces,prep:viewPrep,auth:viewAuth,onboard:viewOnboard};
const GATED=new Set(['auth','onboard']);
function render(){
  $('#top').innerHTML=header();$('#main').innerHTML=VIEWS[state.tab]();
  $('#tabs').hidden=GATED.has(state.tab)||!$('#intro').hidden;
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===state.tab||(state.tab==='places'&&b.dataset.tab==='home')||(state.tab==='prep'&&b.dataset.tab==='home')));
  ['home','plan','places'].forEach(mountMap);hydrateFiles($('#main'));
}
function go(tab,scroll=true){if(!VIEWS[tab])tab='home';if(!Sync.meta.tripId&&!GATED.has(tab))tab='auth';closeSheet();state.tab=tab;state.edit=false;if(!GATED.has(tab)&&location.hash.slice(1)!==tab)history.replaceState(null,'','#'+tab);render();if(scroll)window.scrollTo(0,0);}
async function enter(){
  if(Sync.meta.tripId){go(VIEWS[location.hash.slice(1)]&&!GATED.has(location.hash.slice(1))?location.hash.slice(1):'home',false);Sync.syncNow();return;}
  const s=await Sync.session();
  if(!s){go('auth');return;}
  try{const t=await Sync.myTrip();go(t?'home':'onboard');if(t)Sync.syncNow();}catch(e){state.auth.err='서버에 연결하지 못했어요. 인터넷을 확인해 주세요.';go('auth');}
}
function nowTs(){const d=new Date();return `${d.getMonth()+1}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function keep(ids){const v=ids.map(i=>[i,$('#'+i)?$('#'+i).value:'']);render();v.forEach(([i,x])=>{if($('#'+i))$('#'+i).value=x;});}
function authMsg(e){const m=(e&&e.message)||'';if(/Invalid login/i.test(m))return '이메일 또는 비밀번호가 맞지 않아요.';if(/Email not confirmed/i.test(m))return '메일함의 확인 링크를 먼저 눌러 주세요.';if(/already registered/i.test(m))return '이미 가입된 이메일이에요. 로그인해 주세요.';if(/invite code not found/i.test(m))return '초대 코드를 찾지 못했어요. 8자리를 다시 확인해 주세요.';if(/trip is full/i.test(m))return '이 여행은 이미 4명이 참여했어요.';if(/fetch|network/i.test(m))return '인터넷 연결을 확인해 주세요.';return m||'잠시 후 다시 시도해 주세요.';}
async function downscale(file,max){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{const s=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(b=>b?res(b):rej(),'image/jpeg',0.8);};img.onerror=rej;img.src=r.result;};r.onerror=rej;r.readAsDataURL(file);});}

document.addEventListener('click',async e=>{
  if(e.target.matches('.sheet-bg')||e.target.closest('.sh-x')){closeSheet();return;}
  if(e.target.closest('[data-closeov]')){closeOverlay();return;}
  if(e.target.closest('[data-intro]')){
    if(e.target.closest('[data-sound]')){toggleSound();return;}
    if(e.target.closest('[data-skip]')){finishIntro();return;}
    audio(true);$('#intro')._tap();return;
  }
  const t=e.target.closest('[data-tab],[data-day],[data-edit],[data-place],[data-mv],[data-del],[data-pick],[data-reset],[data-addday],[data-addto],[data-heart],[data-scat],[data-sonly],[data-sview],[data-tool],[data-quick],[data-cur],[data-xcat],[data-xday],[data-delx],[data-replay],[data-sound],[data-kind],[data-stk],[data-dday],[data-nophoto],[data-deld],[data-say],[data-sayslow],[data-bigsign],[data-bigask],[data-bigphrase],[data-settings],[data-copy],[data-mycolor],[data-saveprofile],[data-syncnow],[data-signout],[data-authmode],[data-obmode],[data-obcolor],[data-addticket],[data-slot],[data-showticket],[data-editticket],[data-delticket],[data-ttype],[data-tday],[data-rmfile],[data-install],[data-flights]');
  if(!t)return;const ds=t.dataset;
  if(ds.say!==undefined){speak(ds.say);}
  else if(ds.sayslow!==undefined){speak(ds.sayslow,true);}
  else if(ds.bigsign){const [id,i]=ds.bigsign.split('|');bigSign(id,+i,false);}
  else if(ds.bigask){const [id,i]=ds.bigask.split('|');bigSign(id,+i,true);}
  else if(ds.bigphrase!==undefined){closeSheet();bigPhrase(+ds.bigphrase);}
  else if(ds.sound!==undefined){toggleSound();}
  else if(ds.replay!==undefined){closeSheet();showIntro();}
  else if(ds.settings!==undefined){settingsSheet();}
  else if(ds.copy!==undefined){try{await navigator.clipboard.writeText(ds.copy);toast('초대 코드를 복사했어요.');}catch(err){toast('코드를 길게 눌러 복사해 주세요: '+ds.copy);}}
  else if(ds.mycolor){document.querySelectorAll('[data-mycolor]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.saveprofile!==undefined){const n=$('#myName').value.trim()||'나',c=(document.querySelector('[data-mycolor][aria-pressed="true"]')||{}).dataset?.mycolor||member(me()).color;try{await Sync.updateProfile(n,c);toast('저장했어요.');closeSheet();render();}catch(err){toast('인터넷이 연결되면 다시 저장해 주세요.');}}
  else if(ds.syncnow!==undefined){await Sync.syncNow();settingsSheet();}
  else if(ds.signout!==undefined){await Sync.signOut();closeSheet();state.auth={mode:'login',err:'',info:'',busy:false};go('auth');}
  else if(ds.install!==undefined){if(installEvt){installEvt.prompt();installEvt=null;render();}}
  else if(ds.authmode){state.auth={mode:ds.authmode,err:'',info:'',busy:false};keep(['aEmail']);}
  else if(ds.obmode){state.onboard.mode=ds.obmode;state.onboard.err='';keep(['obName']);}
  else if(ds.obcolor){state.onboard.color=ds.obcolor;keep(['obName','obCode']);}
  else if(ds.flights!==undefined){closeSheet();flightSheet();}
  else if(ds.addticket!==undefined){ticketForm(null);}
  else if(ds.slot){const s=ticketSlots().find(x=>x.slot===ds.slot);ticketForm(null);Object.assign(state.tf,{type:s.type,day:s.day,place:s.place,slot:s.slot,time:s.time});$('#tTitle').value=s.title;$('#tTime').value=s.time;$('#tPlace').value=s.place;document.querySelectorAll('[data-ttype]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ttype===s.type));document.querySelectorAll('[data-tday]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.tday===s.day));}
  else if(ds.showticket){closeSheet();showTicket(ds.showticket);}
  else if(ds.editticket){closeOverlay();ticketForm({id:ds.editticket,...Sync.get('ticket',ds.editticket)});}
  else if(ds.delticket){Sync.remove('ticket',ds.delticket);closeSheet();render();toast('티켓을 지웠어요.');}
  else if(ds.ttype){state.tf.type=ds.ttype;document.querySelectorAll('[data-ttype]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.tday){state.tf.day=+ds.tday;document.querySelectorAll('[data-tday]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.rmfile){const k=ds.rmfile[0],i=+ds.rmfile.slice(1);if(k==='o')state.tf.files.splice(i,1);else state.tf.newFiles.splice(i,1);$('#tFiles').innerHTML=filesEditHTML();hydrateFiles($('#tFiles'));}
  else if(ds.tab!==undefined){if(ds.day)state.day=+ds.day;go(ds.tab);}
  else if(ds.day){state.day=+ds.day;LS.set('day',state.day);render();}
  else if(ds.edit!==undefined){state.edit=!state.edit;render();}
  else if(ds.place){placeSheet(ds.place);}
  else if(ds.mv){const [i,dir]=ds.mv.split('|').map(Number),a=planOf(state.day);[a[i],a[i+dir]]=[a[i+dir],a[i]];setPlan(state.day,a);render();}
  else if(ds.del){const a=planOf(state.day);a.splice(+ds.del,1);setPlan(state.day,a);render();}
  else if(ds.reset!==undefined){setPlan(state.day,clone(PLAN0[state.day]));render();}
  else if(ds.pick){pickPlaceSheet(+ds.pick);}
  else if(ds.addto){addToSheet(ds.addto);}
  else if(ds.addday){const [d,id]=ds.addday.split('|'),a=planOf(+d),last=a[a.length-1],pos=(last&&(last.p==='hotel'||last.p==='airport'))?a.length-1:a.length;a.splice(pos,0,{p:id,t:'',dur:''});setPlan(+d,a);closeSheet();state.day=+d;LS.set('day',state.day);go('plan');}
  else if(ds.heart){const id=ds.heart,s=savedSet();s.has(id)?s.delete(id):s.add(id);setSaved(s);if($('#sheetRoot .sheet'))placeSheet(id);render();}
  else if(ds.scat){state.sCat=ds.scat;render();}
  else if(ds.sonly!==undefined){state.sOnly=!state.sOnly;render();}
  else if(ds.sview){state.sView=ds.sview;render();}
  else if(ds.tool){toolSheet(ds.tool);}
  else if(ds.quick){$('#yenIn').value=ds.quick;$('#yenIn').dispatchEvent(new Event('input',{bubbles:true}));}
  else if(ds.cur){state.form.cur=ds.cur;keep(['amtIn','titleIn']);}
  else if(ds.xcat){state.form.cat=ds.xcat;keep(['amtIn','titleIn']);}
  else if(ds.xday){state.form.day=+ds.xday;keep(['amtIn','titleIn']);}
  else if(ds.delx){Sync.remove('exp',ds.delx);render();}
  else if(ds.kind){state.dform.kind=ds.kind;keep(['diaryText']);}
  else if(ds.stk){state.dform.stk=state.dform.stk===ds.stk?'':ds.stk;keep(['diaryText']);}
  else if(ds.dday){state.dform.day=+ds.dday;keep(['diaryText']);}
  else if(ds.nophoto!==undefined){state.dform.photoBlob=null;state.dform.photoURL='';keep(['diaryText']);}
  else if(ds.deld){Sync.remove('diary',ds.deld);render();}
});
document.addEventListener('submit',async e=>{
  e.preventDefault();const id=e.target.id;
  if(id==='authForm'){const email=$('#aEmail').value.trim(),pw=$('#aPw').value,a=state.auth;
    if(!email||pw.length<6){a.err='이메일과 6자 이상 비밀번호를 넣어 주세요.';keep(['aEmail']);return;}
    a.busy=true;a.err='';a.info='';keep(['aEmail']);
    try{ if(a.mode==='signup'){const s=await Sync.signUp(email,pw);if(!s){a.busy=false;a.mode='login';a.info='확인 메일을 보냈어요. 메일의 링크를 누른 뒤 이 앱에서 로그인해 주세요.';keep(['aEmail']);return;}}
      else await Sync.signIn(email,pw);
      a.busy=false;const t=await Sync.myTrip();go(t?'home':'onboard');if(t)Sync.syncNow();
    }catch(err){a.busy=false;a.err=authMsg(err);keep(['aEmail']);}
  }
  if(id==='obForm'){const o=state.onboard,name=$('#obName').value.trim();
    if(!name){o.err='내 이름을 적어 주세요.';keep(['obName','obCode']);return;}
    o.busy=true;o.err='';keep(['obName','obCode']);
    try{ if(o.mode==='join'){const code=$('#obCode').value.trim();if(code.length<8)throw new Error('invite code not found');await Sync.joinTrip(code,name,o.color);}
      else await Sync.createTrip('도쿄 태교여행',name,o.color);
      o.busy=false;go('home');if(o.mode!=='join')setTimeout(settingsSheet,400);
    }catch(err){o.busy=false;o.err=authMsg(err);keep(['obName','obCode']);}
  }
  if(id==='ticketForm'){saveTicket();}
  if(id==='flightForm'){saveFlights();}
  if(id==='expForm'){const amt=parseFloat(($('#amtIn').value||'').replace(/,/g,'')),title=$('#titleIn').value.trim()||state.form.cat;
    if(!(amt>0)){state.err='금액을 숫자로 입력해 주세요.';keep(['amtIn','titleIn']);$('#amtIn').focus();return;}
    state.err='';Sync.put('exp',uid(),{day:state.form.day,cat:state.form.cat,title,amt,cur:state.form.cur,who:me(),at:new Date().toISOString()});render();}
  if(id==='diaryForm'){const text=$('#diaryText').value.trim(),f=state.dform;
    if(!text&&!f.photoBlob){state.derr='내용을 쓰거나 사진을 골라 주세요.';keep(['diaryText']);$('#diaryText').focus();return;}
    let photo='';if(f.photoBlob){try{photo=await Sync.addFile(f.photoBlob,'jpg');}catch(err){state.derr='저장 공간이 부족해 사진을 저장하지 못했어요.';keep(['diaryText']);return;}}
    Sync.put('diary',uid(),{who:me(),kind:f.kind,day:f.day,ts:nowTs(),stk:f.stk,text,photo,at:new Date().toISOString()});
    state.derr='';state.dform.stk='';state.dform.photoBlob=null;state.dform.photoURL='';render();}
});
document.addEventListener('change',async e=>{
  const t=e.target;
  if(t.dataset.check){const s=checkSet();t.checked?s.add(t.dataset.check):s.delete(t.dataset.check);setChecks(s);render();}
  if(t.id==='budgetIn'){const v=parseInt(t.value.replace(/[^0-9]/g,''),10);if(v>0)setSettings({budget:v});render();}
  if(t.id==='rateIn'){const r=parseFloat(t.value);if(r>0)setSettings({rate:r/100});}
  if(t.id==='photoIn'&&t.files&&t.files[0]){try{const b=await downscale(t.files[0],1400);state.dform.photoBlob=b;state.dform.photoURL=URL.createObjectURL(b);state.derr='';}catch(err){state.derr='이 사진은 열 수 없어요. 다른 사진을 골라 주세요.';}keep(['diaryText']);}
  if(t.id==='tFileIn'&&t.files){for(const f of t.files){if(f.size>15*1024*1024){toast(f.name+' 은(는) 15MB보다 커서 뺐어요.');continue;}state.tf.newFiles.push({blob:f,name:f.name,url:f.type.startsWith('image/')?URL.createObjectURL(f):''});}$('#tFiles').innerHTML=filesEditHTML();hydrateFiles($('#tFiles'));t.value='';}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.memo!==undefined){const a=planOf(state.day);a[+t.dataset.memo].memo=t.value;clearTimeout(t._tm);t._tm=setTimeout(()=>setPlan(state.day,a),500);}
  if(t.id==='yenIn'||t.id==='rateIn'){const r=parseFloat(($('#rateIn').value||'').replace(/,/g,''))/100||rate(),y=parseFloat(($('#yenIn').value||'').replace(/,/g,''))||0;$('#wonOut').value=Math.round(y*r).toLocaleString('ko-KR');}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#overlay').hidden)closeOverlay();else closeSheet();}
  if((e.key==='Enter'||e.key===' ')&&!$('#intro').hidden&&!e.target.closest('button')){e.preventDefault();$('#intro')._tap();}
});
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(VIEWS[h]&&h!==state.tab&&!GATED.has(h))go(h);});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>document.querySelectorAll('[data-map]').forEach(b=>b._draw&&b._draw()),100);});
// re-render when the other person's changes arrive, unless someone is typing
Sync.on(what=>{const a=document.activeElement,typing=a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&$('#main').contains(a);
  if(what==='status'){const d=document.querySelector('.syncdot');if(d)d.outerHTML=syncDot();return;}
  if(what==='files'){hydrateFiles($('#main'));return;}
  if(!typing&&!GATED.has(state.tab)&&$('#sheetRoot').innerHTML==='')render();});

if('serviceWorker' in navigator&&location.protocol!=='file:'){
  // when a new version takes over, reload once so the new files are used right away
  const hadController=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController&&!reloaded){reloaded=true;location.reload();}});
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
// the intro plays every time the app is opened, signed in or not; it hands over to enter() when done
showIntro();
if(document.fonts)document.fonts.ready.then(()=>document.querySelectorAll('[data-map]').forEach(b=>b._draw&&b._draw()));
