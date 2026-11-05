/* 여행 앱 — app shell: trip model, views and events. Fixed content lives in data.js, storage and sync in sync.js.
   Everything about the trip (places, plan, dates, flights, tickets, diary) is synced data the two of you edit in the app. */
const KINDS=['한 줄 일기','아기에게 편지','맛있었던 것'];
const TICKET_TYPES=['항공권','입장권','숙소','기타'];
const COLORS=['#5a6fe3','#f27d99','#24a37f','#ee8640'];
const WEEK=['일','월','화','수','목','금','토'];

const state={
  tab:'home',day:LS.get('day',1),edit:false,tpax:null,
  sCat:'전체',sOnly:false,sView:'list',pickQ:'',
  form:{cur:'JPY',cat:'식비',day:1},err:'',
  dform:{kind:'한 줄 일기',day:1,stk:'',photoBlob:null,photoURL:''},derr:'',
  sound:LS.get('sound',true),
  auth:{mode:'login',err:'',info:'',busy:false},
  onboard:{mode:'create',err:'',busy:false,color:COLORS[0]},
  search:{q:'',busy:false,err:'',results:[],forDay:0},
};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));
const llStr=ll=>ll[0]+','+ll[1];
const gsearch=q=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(q);
const gdir=(o,d,mode)=>'https://www.google.com/maps/dir/?api=1'+(o?'&origin='+(Array.isArray(o)?llStr(o):encodeURIComponent(o)):'')+'&destination='+(Array.isArray(d)?llStr(d):encodeURIComponent(d))+'&travelmode='+mode;
const won=n=>'₩'+Math.round(n).toLocaleString('ko-KR');
const yen=n=>'¥'+Math.round(n).toLocaleString('ko-KR');
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));
const hasJa=s=>/[぀-ヿ㐀-鿿]/.test(s||'');

/* ===================== trip model (all synced) ===================== */
const tripInfo=()=>Sync.get('trip','info');
const trip=()=>Object.assign({title:'우리 여행',city:'',start:'',nights:2,hotelId:'',dayTitles:{}},tripInfo()||{});
const parseDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s||'');return m?new Date(+m[1],+m[2]-1,+m[3]):null;};
let DAYS=[],PL={};
function rebuild(){
  const t=trip(),start=parseDate(t.start),n=Math.max(1,Math.min(14,(+t.nights||0)+1));
  DAYS=Array.from({length:n},(_,i)=>{const dt=start?new Date(start.getFullYear(),start.getMonth(),start.getDate()+i):null;
    return {id:i+1,date:dt,label:dt?`${dt.getMonth()+1}.${String(dt.getDate()).padStart(2,'0')} ${WEEK[dt.getDay()]}`:`${i+1}일차`,title:(t.dayTitles||{})[i+1]||'',c:DAY_COLORS[i%DAY_COLORS.length]};});
  PL={};Sync.list('place').forEach(p=>{PL[p.id]={...p};});
}
const dayOf=id=>DAYS.find(d=>d.id===id)||{id,label:`${id}일차`,title:'',c:DAY_COLORS[(id-1)%DAY_COLORS.length]};
const dayName=d=>d?`DAY ${d}`:'여행 전';
const dayOpts=(withBefore=true)=>[...(withBefore?[[0,'여행 전']]:[]),...DAYS.map(d=>[d.id,`DAY ${d.id}`])];
const hotelId=()=>{const t=trip();return PL[t.hotelId]?t.hotelId:Object.keys(PL).find(id=>PL[id].cat==='숙소')||'';};
const isStay=id=>PL[id]&&PL[id].cat==='숙소';
const isAir=id=>PL[id]&&PL[id].cat==='공항';
const hasLL=id=>PL[id]&&Array.isArray(PL[id].ll)&&PL[id].ll.length===2;
const placeQ=id=>{const p=PL[id];return p?(p.q||p.jp||p.n):'';};
const placeDest=id=>hasLL(id)?PL[id].ll:placeQ(id);
const placeDir=(origin,id,mode)=>gdir(origin,placeDest(id),mode)+(PL[id]&&PL[id].gid?'&destination_place_id='+encodeURIComponent(PL[id].gid):'');
const placeSearch=id=>gsearch(placeQ(id))+(PL[id]&&PL[id].gid?'&query_place_id='+encodeURIComponent(PL[id].gid):'');

const planOf=d=>{const v=Sync.get('plan',String(d));return (v&&v.stops?v.stops:[]).filter(s=>PL[s.p]).map(s=>({...s}));};
const setPlan=(d,stops)=>Sync.put('plan',String(d),{stops});
const flights=()=>{const f=Sync.get('flights','trip')||{};return {out:{...FLIGHT0.out,...(f.out||{})},in:{...FLIGHT0.in,...(f.in||{})}};};
const DIRS={out:'가는 편',in:'오는 편',etc:'기타'};
// who a ticket belongs to is a plain name, so a companion who hasn't joined the app yet can still have tickets
// each person's own name on tickets, so their phone opens the ticket tab on their own tickets
const paxMap=()=>(Sync.get('paxof','set')||{}).map||{};
// my tickets are the ones under my name; an older saved pairing is only a fallback
const myPax=()=>{const n=member(me()).display_name;if(n&&tickets().some(t=>t.pax===n))return n;return paxMap()[me()]||'';};
const paxNames=()=>[...new Set([...tickets().map(t=>t.pax),...Sync.members.map(m=>m.display_name)].filter(Boolean))];
// minutes between two HH:MM times (same time zone, next day if it wraps)
const spanMin=(a,b)=>{if(!a||!b)return 0;const m=t=>{const [h,x]=t.split(':').map(Number);return h*60+x;};return (m(b)-m(a)+1440)%1440;};
const durText=min=>min?`${Math.floor(min/60)}시간${min%60?` ${min%60}분`:''}`:'';
const flightLabel=f=>`${f.fromCity||'출발지'} → ${f.toCity||'도착지'}${f.no?' · '+f.no:''}`;
const settings=()=>Object.assign({budget:2000000,rate:9.2},Sync.get('settings','trip')||{});
const setSettings=patch=>Sync.put('settings','trip',Object.assign(settings(),patch));
const savedSet=()=>new Set((Sync.get('saved','set')||{ids:[]}).ids);
const setSaved=s=>Sync.put('saved','set',{ids:[...s]});
const checkSet=()=>new Set((Sync.get('checks','set')||{ids:[]}).ids);
const setChecks=s=>Sync.put('checks','set',{ids:[...s]});
const prepItems=()=>Sync.list('prep').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
const contacts=()=>Sync.list('contact').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
// the checklist and the phone book are both filled in by the two of you, grouped by category
const PREP_CATS=['서류','옷·생활용품','건강·임신','전자기기','기타'];
const CONTACT_CATS=['긴급','숙소','항공·여행사','병원','기타'];
const prepCat=m=>PREP_CATS.includes(m.cat)?m.cat:'기타',contactCat=c=>CONTACT_CATS.includes(c.cat)?c.cat:'기타';
const expenses=()=>Sync.list('exp').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
const diary=()=>Sync.list('diary').sort((a,b)=>(a.at||'').localeCompare(b.at||''));
const tickets=()=>Sync.list('ticket').sort((a,b)=>(a.day-b.day)||(a.time||'').localeCompare(b.time||''));
const rate=()=>settings().rate;
// dollars (e.g. a hotel paid through a booking site) use the latest USD rate, shared by both phones
const usdRate=()=>settings().usdRate||1400;
const toKRW=e=>e.cur==='KRW'?e.amt:e.cur==='USD'?e.amt*usdRate():e.amt*rate();
const usd=n=>'$'+(+n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
async function loadUsd(){if(!navigator.onLine||Date.now()-(LS.get('usdAt',0))<12*3600000)return;
  for(const u of ['https://api.frankfurter.dev/v1/latest?base=USD&symbols=KRW','https://api.frankfurter.app/latest?from=USD&to=KRW']){
    try{const r=await fetch(u);if(!r.ok)continue;const j=await r.json(),v=j.rates&&+j.rates.KRW;if(v>0){LS.set('usdAt',Date.now());if(Math.abs(v-usdRate())>0.5)setSettings({usdRate:v});return;}}catch(e){}}}
const me=()=>Sync.meta.uid;
const member=u=>Sync.members.find(m=>m.user_id===u)||{display_name:u===me()?'나':'함께',color:'#9aa0bd'};
const avatar=u=>{const m=member(u);return `<span class="av" style="--wc:${esc(m.color)}">${esc((m.display_name||'?').slice(0,1))}</span>`;};
function ticketSlots(){
  const f=flights(),out=[];
  out.push({slot:'flight-out',dir:'out',type:'항공권',title:flightLabel(f.out),day:1,time:f.out.dep,place:'',hint:'항공사 앱이나 메일의 모바일 탑승권 QR'});
  if(DAYS.length>1)out.push({slot:'flight-in',dir:'in',type:'항공권',title:flightLabel(f.in),day:DAYS.length,time:f.in.dep,place:'',hint:'항공사 앱이나 메일의 모바일 탑승권 QR'});
  const h=hotelId();out.push({slot:'hotel',type:'숙소',title:h?PL[h].n:'숙소',day:1,time:'',place:h||'',hint:'예약 번호가 보이는 화면'});
  DAYS.forEach(d=>planOf(d.id).forEach(s=>{if(PL[s.p].ticket&&!out.some(o=>o.slot==='place:'+s.p))out.push({slot:'place:'+s.p,type:'입장권',title:PL[s.p].n,day:d.id,time:s.t||'',place:s.p,hint:'예매 메일의 QR 코드 화면'});}));
  return out;
}
function slotStatus(){const tk=tickets(),me_=myPax();return ticketSlots().map(s=>{const a=tk.filter(t=>t.slot===s.slot);return {...s,t:a.find(t=>t.pax===me_)||a[0]};});}
// "ICN 10:20 → NRT 12:50": the one line you need to know about a flight
const flightLine=f=>`<span class="fline"><b>${esc(apCode(f.fromCity)||f.fromCity||'출발')}</b><span class="mono">${esc(f.dep||'--:--')}</span><span class="to">→</span><b>${esc(apCode(f.toCity)||f.toCity||'도착')}</b><span class="mono">${esc(f.arr||'--:--')}</span></span>`;

/* import the Tokyo example as editable trip data */
function wipeAll(){
  if(!confirm('장소·일정·지출·일기·준비물과 항공권이 아닌 티켓을 모두 지울까요?\n항공편과 항공권은 남겨요. 둘 다의 화면에서 지워지고 되돌릴 수 없어요.'))return;
  ['place','plan','exp','diary','prep','phrase','saved','checks','phrasehide'].forEach(k=>Sync.list(k).forEach(x=>x&&x.id&&Sync.remove(k,x.id)));
  Sync.list('ticket').forEach(t=>t.type!=='항공권'&&Sync.remove('ticket',t.id));
  ['saved','checks','phrasehide'].forEach(k=>Sync.get(k,'set')&&Sync.remove(k,'set'));
  const T=trip();Sync.put('trip','info',{...T,hotelId:'',dayTitles:{}});
  closeAllSheets();state.day=1;state.edit=false;toast('모두 지웠어요. 이제 새로 채워 보세요.');render();
}
function importTemplate(){
  Object.entries(TPL_PL).forEach(([id,p])=>{const signs=TPL_SIGNS[id]||null;const {short,...rest}=p;
    Sync.put('place',id,{...rest,short:short||'',kana:signs&&signs[0]?signs[0][1]:'',jp:signs&&signs[0]?signs[0][0]:p.jp,signs:signs||[],ticket:!!p.ticket,src:'example',at:new Date().toISOString()});});
  Object.entries(TPL_PLAN).forEach(([d,stops])=>{
    const st=stops.map(s=>({...s}));
    for(let i=1;i<st.length;i++){const a=st[i-1].p,b=st[i].p,k=KNOWN[a+'>'+b];
      if(k)st[i].move={how:k.how==='bus'?'bus':k.how,min:k.min,note:k.note};
      else{const za=ZNEAR[a],zb=ZNEAR[b];if(za&&zb&&za!==zb){const n=Math.abs(ZORDER.indexOf(za)-ZORDER.indexOf(zb));st[i].move={how:'subway',min:Math.round(4+n*2.6),note:`한조몬선 ${n}정거장 · 환승 없음`};}}}
    setPlan(+d,st);});
  const cur=tripInfo()||{};
  Sync.put('trip','info',{...TPL_TRIP,...cur,dayTitles:{...TPL_TRIP.dayTitles,...(cur.dayTitles||{})},title:cur.title||TPL_TRIP.title,city:cur.city||TPL_TRIP.city,start:cur.start||TPL_TRIP.start,hotelId:cur.hotelId||'hotel'});
  const f=Sync.get('flights','trip');if(!f)Sync.put('flights','trip',TPL_FLIGHTS);
  if(!Sync.get('saved','set'))setSaved(new Set(['sensoji','skytree','meiji','omote','shibuya','suitengu','ginza','tokyost','kagetsudo','ichiran','bairin','gaien']));
  rebuild();
}
/* ---------- small UI helpers ---------- */
const IC={
  flag:'<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',mic:'<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/>',phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',bowl:'<path d="M4 11h16a8 8 0 0 1-16 0zM9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2"/>',cup:'<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2"/>',bag:'<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  bed:'<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5M7 11.5a1.5 1.5 0 1 0 0-.01"/>',plane:'<path d="M2 16l20-6-3-3-7 3-5-5-2 1 3 6-4 2-2-1-1 1z"/>',nav:'<path d="M3 11l18-8-8 18-2-8z"/>',pin:'<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  memo:'<path d="M5 4h14v12l-4 4H5zM15 20v-4h4M8 9h8M8 13h5"/>',taxi:'<path d="M5 17h14v-5l-2-5H7l-2 5zM5 12h14M8 17v2M16 17v2M10 4h4"/>',walk:'<circle cx="13" cy="4.5" r="1.5"/><path d="M10 21l2-6 3 3v3M9 12l2-4 3 1 2 3M11 8l-2 5"/>',train:'<rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 10h12M9 20l-2 1M15 20l2 1M9 16l-1 4M15 16l1 4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',yen:'<path d="M6 4l6 8 6-8M12 12v8M8 13h8M8 16h8"/>',talk:'<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',home:'<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  list:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',ticket:'<path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM14 6v12"/>',heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',chev:'<path d="M9 6l6 6-6 6"/>',back:'<path d="M15 6l-6 6 6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',
  up:'<path d="M6 15l6-6 6 6"/>',down:'<path d="M6 9l6 6 6-6"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',pen:'<path d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3"/>',
  sndon:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',sndoff:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  speak:'<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',sync:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  bus:'<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M7 17v3M17 17v3M8 14h.01M16 14h.01"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
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
const thumb=id=>{const p=PL[id]||{n:'',cat:'기타'},c=CAT[p.cat]||CAT['기타'];return `<span class="thumb" style="--c:var(${c.c})">${svg(c.ic,'')}${p.stn?`<span>${p.stn.join('')}</span>`:''}</span>`;};
const safeChip=p=>p.safe?`<span class="chip ${p.safe==='ok'?'ok':'warn'}">${p.safe==='ok'?'임산부 안심':'주문 시 주의'}</span>`:'';
const walkHTML=lv=>lv?`<span class="walk">${[1,2,3].map(i=>`<span class="${i<=lv?'on':''}"></span>`).join('')}<em>${['','걷기 적음','걷기 보통','걷기 많음'][lv]}</em></span>`:'';
let toastTimer;
function toast(msg){const el=$('#toast');el.textContent=msg;el.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},3200);}

/* ---------- Japanese: speech and signboards ---------- */
let jaVoice=null;
function pickVoice(){if(!('speechSynthesis' in window))return;const vs=speechSynthesis.getVoices();jaVoice=vs.find(v=>/^ja(-|_|$)/i.test(v.lang)&&/Kyoko|O-ren|Google|Siri/i.test(v.name))||vs.find(v=>/^ja/i.test(v.lang))||null;}
if('speechSynthesis' in window){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;}
/* Japanese speech: natural Google Cloud voice (saved on the phone after first play, so it also works offline),
   falling back to the phone's own voice. The phone voice reads the kana reading, so a non-Japanese voice
   doesn't read kanji with Korean readings (卵 → 란, 水天宮 → 수천궁). */
const TTS_VOICE='ja-JP-Neural2-B';
// after a refusal, wait a few minutes before asking Google again (the API may have just been switched on)
let ttsOffUntil=0,ttsAudio=null;
const ttsOff=()=>Date.now()<ttsOffUntil;
const ttsKey=(text,slow)=>`tts/${TTS_VOICE}/${slow?'s':'n'}/${text}`;
function kanaFor(text){
  for(const p of allPhrases())if(p[0]===text&&p[1])return p[1];
  for(const id of Object.keys(PL))for(const sg of signsOf(id)){if(sg[0]===text&&sg[1])return sg[1];const a=askOf(sg);if(a[0]===text)return a[1];}
  return '';
}
async function cloudTTS(text,slow){
  const r=await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${GMAPS_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({input:{text},voice:{languageCode:'ja-JP',name:TTS_VOICE},audioConfig:{audioEncoding:'MP3',speakingRate:slow?0.75:0.95}})});
  if(r.status===403||r.status===400){ttsOffUntil=Date.now()+3*60*1000;throw new Error('tts '+r.status);}
  if(!r.ok)throw new Error('tts '+r.status);
  const j=await r.json(),bin=atob(j.audioContent),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);
  const blob=new Blob([u8],{type:'audio/mpeg'});await FileCache.put(ttsKey(text,slow),blob);return blob;
}
async function speak(text,slow){
  if(ttsAudio){try{ttsAudio.pause();}catch(e){}}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  try{
    let blob=await FileCache.get(ttsKey(text,slow));
    if(!blob&&navigator.onLine&&!ttsOff())blob=await cloudTTS(text,slow);
    if(blob){ttsAudio=new Audio(URL.createObjectURL(blob));await ttsAudio.play();return;}
  }catch(e){console.warn('tts',e);}
  deviceSpeak(text,slow);
}
function deviceSpeak(text,slow){
  if(!('speechSynthesis' in window)){toast('이 브라우저는 음성 읽기를 지원하지 않아요.');return;}
  pickVoice();
  const say=jaVoice?text:(kanaFor(text)||text);
  if(!jaVoice&&speechSynthesis.getVoices().length)toast('휴대폰 음성으로 읽고 있어요. 인터넷이 되면 자연스러운 목소리로 바뀌어요.');
  const u=new SpeechSynthesisUtterance(say);u.lang='ja-JP';u.rate=slow?0.7:0.9;if(jaVoice)u.voice=jaVoice;speechSynthesis.speak(u);
}
// save the voice for every phrase and place sign ahead of the trip
async function saveOfflineVoices(onProgress){
  if(ttsOff()||!navigator.onLine)return {done:0,total:0,off:ttsOff()};
  const texts=new Set();allPhrases().forEach(p=>texts.add(p[0]));Object.keys(PL).forEach(id=>signsOf(id).forEach((sg,i)=>{texts.add(sg[0]);if(i===0)texts.add(askOf(sg)[0]);}));
  const list=[...texts];let done=0;
  for(const t of list){if(ttsOff())break;try{if(!(await FileCache.get(ttsKey(t,false))))await cloudTTS(t,false);}catch(e){}done++;onProgress&&onProgress(done,list.length);}
  return {done,total:list.length,off:ttsOff()};
}
/* ---------- Japanese signs ---------- */
const signsOf=id=>{const p=PL[id];if(!p)return [];const s=(p.signs||[]).filter(x=>x&&x[0]);return s.length?s:(p.jp?[[p.jp,p.kana||'',p.n]]:[]);};
const mainSign=id=>signsOf(id)[0]||null;
/* Korean pronunciation guide from a kana reading, e.g. トイレは どこですか → 토이레와 도코데스카.
   Kanji can't be read this way, so places without a kana reading show no guide. */
const KR_V={a:0,i:20,u:13,e:5,o:8,ya:2,yu:17,yo:12,wa:9,we:15,wi:16,ye:7};
const KR_C={'':11,k:15,g:0,s:9,z:12,t:16,d:3,n:2,h:18,b:7,p:17,m:6,r:5,y:11,w:11,j:12,ch:14,ts:14,f:18,v:7};
const KANA={あ:'a',い:'i',う:'u',え:'e',お:'o',か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',さ:'sa',し:'si',す:'su',せ:'se',そ:'so',ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
  た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',は:'ha',ひ:'hi',ふ:'hu',へ:'he',ほ:'ho',ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
  ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',や:'ya',ゆ:'yu',よ:'yo',ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',わ:'wa',を:'o',ゔ:'vu'};
function krSyl(c,v){const cho=KR_C[c]??11;let jung=KR_V[v]??0;if(c==='ch'&&v==='i'||c==='j'&&v==='i'||c==='s'&&v==='i')jung=20;if(c==='ts'&&v==='u'||c==='s'&&v==='u'||c==='z'&&v==='u')jung=18;return String.fromCharCode(0xAC00+(cho*21+jung)*28);}
function kanaToKo(kana){
  if(!kana||!/[\u3040-\u30ff]/.test(kana))return '';
  const h=kana.replace(/[\u30a1-\u30f6]/g,ch=>String.fromCharCode(ch.charCodeAt(0)-0x60));
  let out='',prevV='';
  const addJong=j=>{if(!out)return;const c=out.charCodeAt(out.length-1);if(c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28===0)out=out.slice(0,-1)+String.fromCharCode(c+j);};
  for(let i=0;i<h.length;i++){
    const ch=h[i],nx=h[i+1]||'';
    if(ch===' '||ch==='　'){out+=' ';prevV='';continue;}
    if(ch==='ー'){prevV='';continue;}
    if(ch==='ん'){addJong(4);prevV='';continue;}
    if(ch==='っ'){addJong(19);prevV='';continue;}
    // particles は/へ at the end of a word read as wa/e
    if((ch==='は'||ch==='へ')&&(nx===' '||nx==='　'||nx==='')&&out){out+=ch==='は'?'와':'에';prevV='a';continue;}
    // long vowels (おう, ゅう) read as one long sound: drop the う
    if(ch==='う'&&(prevV==='o'||prevV==='u')&&out){continue;}
    const r=KANA[ch];if(!r){if(!/[ぁぃぅぇぉゃゅょ]/.test(ch))out+=ch;continue;}
    let c=r.replace(/[aiueo]+$/,''),v=r.slice(c.length);
    if(c==='y'||c==='w'){v=c+v;c='';}
    if(nx&&'ゃゅょ'.includes(nx)){v={ゃ:'ya',ゅ:'yu',ょ:'yo'}[nx];if(c==='ch'||c==='j'||c==='s')v=v.slice(1);if(c==='s'){c='s';v={a:'ya',u:'yu',o:'yo'}[v];}i++;}
    else if(nx&&'ぁぃぅぇぉ'.includes(nx)){v={ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o'}[nx];if(c===''&&r==='u'){c='w';v=v==='i'?'wi':v==='e'?'we':'o';}else if(c==='h'&&r==='hu'){c='f';v={a:'wa',i:'wi',e:'we',o:'o',u:'u'}[v];}else if(c==='ch'||c==='j'||c==='s'){v=v==='e'?'ye':v;}i++;}
    if(c==='f')c='h';
    out+=krSyl(c,v);prevV=v.slice(-1);
  }
  return out.replace(/\s+/g,' ').trim();
}
const koSay=(kana,ja)=>kanaToKo(kana)||kanaToKo(ja);
const askOf=sg=>[sg[0]+'はどこですか？',(sg[1]||sg[0])+'は どこですか',sg[2]+'는 어디예요?'];
const hotelPhrase=()=>{const h=hotelId(),sg=h&&mainSign(h);return sg?[sg[0]+'までお願いします',(sg[1]||sg[0])+' まで おねがいします',PL[h].n.replace(/\s*\(.*\)\s*$/,'')+'까지 가 주세요 (택시)']:null;};
// longer Japanese lines get a smaller size so a whole sentence fits on one line of a card
const jaFit=t=>{const n=[...(t||'')].length;return n>16?' xs':n>11?' sm':'';};
// our own phrases first (newest on top), then the built-in ones you haven't removed, then the taxi phrase for the hotel
const myPhrases=()=>Sync.list('phrase').sort((a,b)=>(b.at||'').localeCompare(a.at||''));
const hiddenPhrases=()=>new Set((Sync.get('phrasehide','set')||{ids:[]}).ids);
const allPhrases=()=>{const hid=hiddenPhrases(),h=hotelPhrase();
  return [...myPhrases().map(p=>[p.ja,p.kana||'',p.ko,'u:'+p.id]),...PHRASES.filter(p=>!hid.has(p[0])).map(p=>[...p,'b:'+p[0]]),...(h&&!hid.has(h[0])?[[...h,'h:'+h[0]]]:[])];};

/* ===================== moves between stops ===================== */
function hav(a,b){const R=6371,r=Math.PI/180,dl=(b[0]-a[0])*r,dn=(b[1]-a[1])*r,x=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
// a stop may carry its own move (how/min/note) set while planning; otherwise estimate from distance
function leg(a,b,move){
  if(a===b)return null;
  if(move&&move.how)return {how:move.how,min:+move.min||null,note:move.note||'',set:true};
  if(!hasLL(a)||!hasLL(b))return {how:'train',min:null,note:'위치가 없어 시간을 계산하지 못했어요'};
  const d=hav(PL[a].ll,PL[b].ll);
  if(d<0.9)return {how:'walk',min:Math.max(3,Math.round(d*1.25*15)),note:`예상 · 약 ${Math.round(d*1250)}m`};
  if(d>25)return {how:'train',min:Math.round(20+d*1.4),note:`예상 · 약 ${Math.round(d)}km`};
  const road=d*1.3,fare=Math.round((500+Math.max(0,road-1.1)*390)/100)*100;
  return {how:'train',min:Math.round(12+d*3),note:`예상 · 전철 기준 · 택시면 약 ${Math.round(5+road*2.4)}분 ${fare.toLocaleString()}엔`};
}
const legIcon=h=>h==='taxi'?'taxi':h==='walk'?'walk':h==='bus'?'bus':'train';
function numbered(d){const out=[];planOf(d).forEach(s=>{if(!isStay(s.p)&&!isAir(s.p)&&!out.includes(s.p))out.push(s.p);});return out;}

/* ===================== map (Leaflet + OpenStreetMap tiles, no API key needed) ===================== */
const maps={};
// Clean light vector map (OpenFreeMap "Positron", no key). Falls back to plain OpenStreetMap tiles without WebGL.
const STYLE='https://tiles.openfreemap.org/styles/positron';
const TILE='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTR='<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const glOK=()=>{try{return !!(window.maplibregl&&L.maplibreGL&&document.createElement('canvas').getContext('webgl'));}catch(e){return false;}};
function koreanLabels(gl){
  // prefer Korean place names, then the local (Japanese) name
  const apply=()=>{try{gl.getStyle().layers.forEach(l=>{if(l.type==='symbol'&&l.layout&&l.layout['text-field'])gl.setLayoutProperty(l.id,'text-field',['coalesce',['get','name:ko'],['get','name']]);});}catch(e){}};
  if(gl.isStyleLoaded())apply();else gl.once('style.load',apply);
}
function baseLayer(m){
  if(glOK()){const gl=L.maplibreGL({style:STYLE,attribution:ATTR}).addTo(m);try{koreanLabels(gl.getMaplibreMap());}catch(e){}return;}
  L.tileLayer(TILE,{attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',maxZoom:19,className:'osm-tiles'}).addTo(m);
}
/* save the map around every registered place so it shows without a connection */
const lon2x=(lon,z)=>Math.floor((lon+180)/360*2**z),lat2y=(lat,z)=>{const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*2**z);};
async function saveOfflineMap(btn){
  if(!navigator.onLine){toast('인터넷이 연결됐을 때 받아 주세요.');return;}
  const pts=Object.keys(PL).filter(hasLL).map(id=>PL[id].ll);if(!pts.length){toast('위치가 있는 장소를 먼저 등록해 주세요.');return;}
  try{
    btn&&(btn.disabled=true);
    const style=await (await fetch(STYLE)).json(),src=Object.values(style.sources).find(x=>x.type==='vector');
    const tj=src.tiles?src:await (await fetch(src.url)).json(),tmpl=tj.tiles[0];
    if(style.sprite){const sp=Array.isArray(style.sprite)?style.sprite[0].url:style.sprite;for(const ext of ['.json','.png','@2x.json','@2x.png'])fetch(sp+ext).catch(()=>{});}
    const want=new Set();
    pts.forEach(([la,lo])=>{for(let z=10;z<=15;z++){const x=lon2x(lo,z),y=lat2y(la,z),r=z>=14?1:0;for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++)want.add(tmpl.replace('{z}',z).replace('{x}',x+dx).replace('{y}',y+dy));}});
    const list=[...want];let done=0,fail=0;
    const worker=async()=>{while(list.length){const u=list.pop();try{const r=await fetch(u);if(!r.ok)fail++;}catch(e){fail++;}done++;if(btn&&done%10===0)btn.textContent=`지도 받는 중… ${done}/${want.size}`;}};
    await Promise.all(Array.from({length:6},worker));
    LS.set('offlineMapAt',new Date().toISOString());
    const v=await saveOfflineVoices((d,n)=>{if(btn)btn.textContent=`일본어 음성 받는 중… ${d}/${n}`;});
    if(v.total)LS.set('offlineVoiceAt',new Date().toISOString());
    toast((fail?`지도를 받았어요 (${want.size-fail}/${want.size}). 일부는 다시 받아 주세요.`:`장소 ${pts.length}곳 주변 지도를 받았어요.`)+(v.total&&!v.off?` 일본어 음성 ${v.done}개도 받았어요.`:v.off?' 자연스러운 음성은 아직 꺼져 있어요.':''));
  }catch(e){toast('지도를 받지 못했어요. 잠시 뒤 다시 해 주세요.');}
  finally{if(btn){btn.disabled=false;btn.textContent='오프라인 지도 받기';}}
}
const cssVar=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'#5a6fe3';
function mapCfg(key){
  if(key==='plan'){const d=state.day,st=planOf(d),ids=numbered(d);
    return {pins:ids.map((id,i)=>({id,c:dayOf(d).c,num:i+1})),routes:[d],labels:true,air:st.some(s=>isAir(s.p))};}
  if(key==='home'){const pins=[];DAYS.forEach(d=>numbered(d.id).forEach((id,i)=>pins.push({id,c:d.c,num:i+1})));return {pins,routes:DAYS.map(d=>d.id),static:true};}
  return {pins:placeList().filter(id=>!isAir(id)).map(id=>({id,c:CAT[PL[id].cat]?CAT[PL[id].cat].c:'--c-air'})),routes:[],labels:false};
}
function mountLeaflet(key){
  const box=document.querySelector(`[data-map="${key}"]`);
  if(maps[key]){try{maps[key].stop();maps[key].off();maps[key].remove();}catch(e){}delete maps[key];}
  if(!box||!window.L)return;
  const el=box.querySelector('.lmap'),cfg=mapCfg(key),h=hotelId();
  const m=L.map(el,{zoomControl:!cfg.static,attributionControl:true,dragging:!cfg.static,scrollWheelZoom:false,doubleClickZoom:!cfg.static,touchZoom:!cfg.static,boxZoom:false,keyboard:!cfg.static,tap:!cfg.static});
  maps[key]=m;if(m.zoomControl)m.zoomControl.setPosition('topright');
  baseLayer(m);
  const pts=[];
  cfg.routes.forEach(d=>{const st=planOf(d).filter(s=>hasLL(s.p)&&!isAir(s.p)),col=cssVar(dayOf(d).c);
    for(let i=0;i<st.length-1;i++){const how=(st[i+1].move&&st[i+1].move.how)||'';
      L.polyline([PL[st[i].p].ll,PL[st[i+1].p].ll],{color:col,weight:cfg.static?3:4,opacity:.85,dashArray:how==='walk'?'1 8':how==='taxi'?'10 7':how?null:'6 6',lineCap:'round'}).addTo(m);}});
  cfg.pins.forEach(pn=>{if(!hasLL(pn.id))return;const p=PL[pn.id],col=cssVar(pn.c);pts.push(p.ll);
    const html=pn.num?`<span class="mpin num" style="background:${col}">${pn.num}</span>`:`<span class="mpin dot" style="border-color:${col}"></span>`;
    const mk=L.marker(p.ll,{icon:L.divIcon({className:'mpin-wrap',html,iconSize:[30,30],iconAnchor:[15,15]}),keyboard:!cfg.static}).addTo(m);
    if(!cfg.static){mk.on('click',()=>placeSheet(pn.id));mk.bindTooltip(esc(p.short||p.n),{permanent:!!cfg.labels,direction:'right',offset:[14,0],className:'mlabel'});}});
  if(h&&hasLL(h)){pts.push(PL[h].ll);const mk=L.marker(PL[h].ll,{icon:L.divIcon({className:'mpin-wrap',html:'<span class="mpin home">숙소</span>',iconSize:[40,22],iconAnchor:[20,11]})}).addTo(m);if(!cfg.static)mk.on('click',()=>placeSheet(h));}
  const fit=()=>{if(maps[key]!==m)return;m.invalidateSize({animate:false});if(pts.length>1)m.fitBounds(pts,{padding:cfg.static?[18,18]:[36,36],maxZoom:15,animate:false});else if(pts.length===1)m.setView(pts[0],14,{animate:false});else m.setView([35.681,139.767],11,{animate:false});};
  fit();setTimeout(fit,80);
  box.querySelectorAll('[data-fit]').forEach(b=>b.addEventListener('click',fit));
}
/* ---------- Google Maps (online) ---------- */
// Browser key, restricted in Google Cloud to https://ceaser501.github.io/* and to Maps JavaScript API + Places API (New).
const GMAPS_KEY='AIzaSyBdhUO5SK5nrem_uuxb3qlH4v7cPuSrLBA';
let gReady=null,gFailed=false;
const gOK=()=>!gFailed&&!!(window.google&&google.maps&&google.maps.Map);
function loadGoogle(){
  if(gOK())return Promise.resolve();
  if(gFailed||!navigator.onLine)return Promise.reject(new Error('offline'));
  if(gReady)return gReady;
  gReady=new Promise((res,rej)=>{
    window.__gmInit=()=>res();
    const sc=document.createElement('script');
    sc.src=`https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&language=ko&region=JP&libraries=places&loading=async&callback=__gmInit`;
    sc.async=true;sc.onerror=()=>{gReady=null;rej(new Error('load'));};
    document.head.appendChild(sc);
    setTimeout(()=>rej(new Error('timeout')),10000);
  });
  return gReady;
}
// Google calls this when the key is refused (wrong site, API not enabled, billing); fall back to the offline map
window.gm_authFailure=()=>{gFailed=true;console.warn('Google Maps key refused');['home','plan','places'].forEach(k=>{if(maps[k]&&maps[k].google)mountMap(k);});};
const GSTYLE=[
  {featureType:'poi',stylers:[{visibility:'off'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{visibility:'on'},{color:'#dcefe3'}]},
  {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {featureType:'landscape',elementType:'geometry',stylers:[{color:'#f5f6fb'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#cfe1f7'}]},
  {featureType:'road',elementType:'geometry',stylers:[{color:'#ffffff'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#e4e8f7'}]},
  {featureType:'transit.line',elementType:'geometry',stylers:[{color:'#d3d7ec'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#5f6690'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#ffffff'}]},
];
let HtmlMarker=null;
function htmlMarkerClass(){
  if(HtmlMarker)return HtmlMarker;
  HtmlMarker=class extends google.maps.OverlayView{
    constructor(pos,html,onClick){super();this.pos=pos;this.html=html;this.onClick=onClick;}
    onAdd(){const d=document.createElement('div');d.className='gpin';d.innerHTML=this.html;if(this.onClick){d.style.cursor='pointer';d.addEventListener('click',e=>{e.stopPropagation();this.onClick();});}this.div=d;this.getPanes().overlayMouseTarget.appendChild(d);}
    draw(){const p=this.getProjection().fromLatLngToDivPixel(this.pos);if(p&&this.div){this.div.style.left=p.x+'px';this.div.style.top=p.y+'px';}}
    onRemove(){if(this.div){this.div.remove();this.div=null;}}
  };
  return HtmlMarker;
}
function mountGoogle(key){
  const box=document.querySelector(`[data-map="${key}"]`);if(!box)return;
  const el=box.querySelector('.lmap'),cfg=mapCfg(key),h=hotelId(),M=htmlMarkerClass(),objs=[];
  el.innerHTML='';
  const m=new google.maps.Map(el,{center:{lat:35.681,lng:139.767},zoom:11,styles:GSTYLE,disableDefaultUI:true,zoomControl:!cfg.static,zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_TOP},gestureHandling:cfg.static?'none':'greedy',clickableIcons:false,keyboardShortcuts:!cfg.static});
  const b=new google.maps.LatLngBounds();let n=0;const ll=a=>({lat:a[0],lng:a[1]});
  cfg.routes.forEach(d=>{const st=planOf(d).filter(s=>hasLL(s.p)&&!isAir(s.p)),col=cssVar(dayOf(d).c);
    for(let i=0;i<st.length-1;i++){const how=(st[i+1].move&&st[i+1].move.how)||'',dashed=how!=='train'&&how!=='subway'&&how!=='bus';
      const sym={path:'M 0,-1 0,1',strokeOpacity:.9,strokeColor:col,scale:how==='walk'?2:3};
      objs.push(new google.maps.Polyline({map:m,path:[ll(PL[st[i].p].ll),ll(PL[st[i+1].p].ll)],strokeColor:col,strokeOpacity:dashed?0:.85,strokeWeight:cfg.static?3:4,icons:dashed?[{icon:sym,offset:'0',repeat:how==='walk'?'8px':'14px'}]:[]}));}});
  cfg.pins.forEach(pn=>{if(!hasLL(pn.id))return;const p=PL[pn.id],col=cssVar(pn.c);b.extend(ll(p.ll));n++;
    const html=(pn.num?`<span class="mpin num" style="background:${col}">${pn.num}</span>`:`<span class="mpin dot" style="border-color:${col}"></span>`)+(cfg.labels?`<span class="glabel">${esc(p.short||p.n)}</span>`:'');
    const o=new M(new google.maps.LatLng(p.ll[0],p.ll[1]),html,cfg.static?null:()=>placeSheet(pn.id));o.setMap(m);objs.push(o);});
  if(h&&hasLL(h)){b.extend(ll(PL[h].ll));n++;const o=new M(new google.maps.LatLng(PL[h].ll[0],PL[h].ll[1]),'<span class="mpin home">숙소</span>',cfg.static?null:()=>placeSheet(h));o.setMap(m);objs.push(o);}
  const fit=()=>{if(n>1)m.fitBounds(b,cfg.static?18:40);else if(n===1){m.setCenter(b.getCenter());m.setZoom(15);}};
  fit();google.maps.event.addListenerOnce(m,'idle',()=>{if(n>1&&m.getZoom()>16)m.setZoom(16);});
  box.querySelectorAll('[data-fit]').forEach(x=>x.addEventListener('click',fit));
  box.classList.remove('offline-map');
  maps[key]={google:true,stop(){},off(){},invalidateSize(){google.maps.event.trigger(m,'resize');},remove(){objs.forEach(o=>o.setMap(null));el.innerHTML='';}};
}
// online: Google Maps; offline or if Google is unavailable: the saved vector map
function mountMap(key){
  if(maps[key]){try{maps[key].stop();maps[key].off();maps[key].remove();}catch(e){}delete maps[key];}
  const box=document.querySelector(`[data-map="${key}"]`);if(!box)return;
  if(gOK()&&navigator.onLine){try{mountGoogle(key);return;}catch(e){console.warn(e);}}
  mountLeaflet(key);
  if(!navigator.onLine)box.classList.add('offline-map');
  if(!gFailed&&navigator.onLine)loadGoogle().then(()=>{if(document.querySelector(`[data-map="${key}"]`)===box)mountMap(key);}).catch(()=>{});
}
const mapBox=(key,cls,cfg)=>`<div class="mapbox ${cls}" data-map="${key}"><div class="lmap" role="region" aria-label="지도"></div>
  ${cfg.static?'':`<button class="mfit" data-fit aria-label="일정 전체 보기">${svg('fit')}</button>`}
  ${cfg.air?`<div class="hnd">${svg('plane')}공항 이동은 아래 일정에서 확인하세요</div>`:''}<span class="offbadge">오프라인 지도</span></div>`;
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
  document.querySelectorAll('[data-sound]').forEach(b=>{b.setAttribute('aria-pressed',state.sound);b.setAttribute('aria-label',state.sound?'효과음 끄기':'효과음 켜기');if(b.classList.contains('snd'))b.innerHTML=svg(state.sound?'sndon':'sndoff','');else b.textContent=state.sound?'켜짐':'꺼짐';});}

/* ===================== intro ===================== */
let introTimers=[];
const clearTimers=()=>{introTimers.forEach(clearTimeout);introTimers=[];};
const at=(ms,fn)=>introTimers.push(setTimeout(fn,ms));
const HEART_ENTRY='M-40 860 C 40 760, 120 620, 200 560',HEART_LOOP=' C 280 500, 340 420, 300 360 C 268 314, 214 330, 200 372 C 186 330, 132 314, 100 360 C 60 420, 120 500, 200 560',HEART_TAIL=' C 260 604, 330 520, 460 300';
// dots along the incoming line, faint and small far away, full near the heart; each is shown once the plane passes it
function heartDots(el){const g=el.querySelector('#hdots'),pe=el.querySelector('#hpe');if(!g||!pe||g.childNodes.length)return [];const Le=pe.getTotalLength(),out=[];
  for(let k=6;k<Le-4;k+=13){const u=k/Le,o=pe.getPointAtLength(k),c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx',o.x.toFixed(1));c.setAttribute('cy',o.y.toFixed(1));c.setAttribute('r',(1.3+1.4*u).toFixed(2));c.dataset.o=(0.25+0.75*u).toFixed(2);c.dataset.k=k;c.style.opacity=0;g.appendChild(c);out.push(c);}
  return out;}
function heartAt(el,len){const hp=el.querySelector('#hp'),hs=el.querySelector('#hs'),pe=el.querySelector('#hpe'),ap=el.querySelector('#aplane'),mc=el.querySelector('#pmc');
  const Le=pe.getTotalLength(),Ls=hs.getTotalLength(),L=hp.getTotalLength();len=Math.min(L,len);
  el.querySelectorAll('#hdots circle').forEach(c=>{c.style.opacity=len>=+c.dataset.k?c.dataset.o:0;});
  hs.style.strokeDasharray=Ls;hs.style.strokeDashoffset=Ls-Math.max(0,Math.min(Ls,len-Le));
  const p=hp.getPointAtLength(len),q=hp.getPointAtLength(Math.max(0,len-1)),ang=Math.atan2(p.y-q.y,p.x-q.x)*180/Math.PI;
  ap.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${ang})`);
  // the line is faint right behind the plane and fills in as the plane moves on
  const t=hp.getPointAtLength(Math.max(0,len-22));mc.setAttribute('cx',t.x);mc.setAttribute('cy',t.y);}
const finaleSC=()=>`<div class="sc final"><svg class="art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="skyA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a9c8f6"/><stop offset=".6" stop-color="#cfe0fb"/><stop offset="1" stop-color="#f1e6f7"/></linearGradient></defs>
  <rect width="400" height="800" fill="url(#skyA)"/>${cloud(-40,120,1.6,.75)}${cloud(250,240,1.2,.6)}${cloud(-20,560,2,.85)}${cloud(230,640,2.4,.9)}${cloud(120,420,1,.5)}
  <defs><radialGradient id="pgr"><stop offset="0" stop-color="#222"/><stop offset=".55" stop-color="#999"/><stop offset="1" stop-color="#fff"/></radialGradient>
    <mask id="pmask" maskUnits="userSpaceOnUse" x="-200" y="-200" width="900" height="1300"><rect x="-200" y="-200" width="900" height="1300" fill="#fff"/><circle id="pmc" cx="-300" cy="-300" r="44" fill="url(#pgr)"/></mask>
    <filter id="psh" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="9" dy="12" stdDeviation="4" flood-color="#3b3f86" flood-opacity=".22"/></filter></defs>
  ${''/* the app icon's mark: a dotted line comes in, draws the heart, and the plane climbs away */}
  <path id="hp" d="${HEART_ENTRY}${HEART_LOOP}${HEART_TAIL}" fill="none" stroke="none"/><path id="hpe" d="${HEART_ENTRY}" fill="none" stroke="none"/>
  <g id="hdots" fill="#fff"></g>
  <path id="hs" d="M200 560 ${HEART_LOOP}${HEART_TAIL}" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" mask="url(#pmask)" style="stroke-dasharray:3000;stroke-dashoffset:3000"/>
  <g filter="url(#psh)"><g id="aplane" transform="translate(-60 900)"><g transform="scale(1.8)">${planeTop('#ffffff','#d4d9f3')}</g></g></g></svg>
  <div class="txt"><h2 class="rise" data-i="title">${esc(tripInfo()?trip().title:'딱복트립')}</h2><div class="en rise d1" data-i="range">${esc(rangeText())}</div></div>
  <button class="cta go-a rise d3" data-enter>여행 시작하기 ${svg('chev')}</button></div>`;
// the intro's boarding pass shows the real way-out flight: codes big, cities small, then date, time and my seat
const apCode=x=>((x||'').match(/\b[A-Z]{3}\b/)||[''])[0];
const apName=x=>(x||'').replace(/\b[A-Z]{3}\b/,'').trim();
function passHTML(){const f=flights().out,a=DAYS[0],mine=tickets().find(t=>t.dir==='out'&&t.seat&&(!t.pax||t.pax===myPax()));
  const from=apCode(f.fromCity)||apName(f.fromCity)||'서울',to=apCode(f.toCity)||apName(f.toCity)||trip().city||'여행지';
  const names=apCode(f.fromCity)||apCode(f.toCity)?`${apName(f.fromCity)||f.fromCity} → ${apName(f.toCity)||f.toCity}`:'';
  const cell=(k,v)=>v?`<div><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`:'';
  return `<div class="k">BOARDING PASS${f.no?' · '+esc(f.no):''}</div><div class="v route">${esc(from)}<span class="ar">${svg('plane')}</span>${esc(to)}</div>${names?`<div class="nm">${esc(names)}</div>`:''}
    <div class="row">${cell('DATE',a&&a.date?fmtMD(a.date):'')}${cell('TIME',f.dep)}${cell('SEAT',mine&&mine.seat)}${!f.dep&&!(mine&&mine.seat)?cell('DAYS',DAYS.length+'일'):''}</div>`;}
function introHTML(){
  return `<div class="intro introD" data-intro role="dialog" aria-label="여행 인트로">
    ${introTools('건너뛰기')}
    <div class="sc"><div class="porthole"><svg viewBox="0 0 210 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9cff8"/><stop offset=".55" stop-color="#e3dcf7"/><stop offset=".75" stop-color="#ffd9c6"/><stop offset="1" stop-color="#fff1e6"/></linearGradient></defs>
        <rect width="210" height="300" fill="url(#pw)"/><circle cx="140" cy="205" r="34" fill="#fff6e6" opacity=".9"/>
        <g class="drift">${cloud(-10,200,1.1,1)}${cloud(110,230,1.4,1)}${cloud(200,200,1.1,1)}${cloud(320,230,1.4,1)}${cloud(40,90,.6,.7)}${cloud(250,90,.6,.7)}</g></svg><div class="shade"></div></div>
      <div class="txt" style="top:calc(470px + env(safe-area-inset-top,0px));text-align:center"><h2 class="rise" data-i="line">${introLine()}</h2><div class="en rise d1" data-i="range">${esc(rangeText())}</div></div></div>
    <div class="sc"><svg class="art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice"><rect width="400" height="800" fill="#e8ecfb"/>${cloud(-30,90,1.3,.9)}${cloud(240,170,1,.8)}${cloud(-50,620,2.4,1)}${cloud(200,680,2.6,1)}</svg>
      <div class="txt" style="top:calc(120px + env(safe-area-inset-top,0px))"><h2 class="rise">탑승권이<br>도착했어요</h2><p class="rise d1">표를 끊으면 바로 출발해요</p></div>
      <button class="ticket" data-tear aria-label="표를 끊고 출발하기" style="--stub:#5a6fe3;--tk:#7c83ad;--tv:#232849;bottom:calc(36% + env(safe-area-inset-bottom,0px))"><div class="main" data-i="pass">${passHTML()}</div>
        <div class="stub"><span class="pulse">탭해서<br>표 끊기</span></div></button></div>
    ${finaleSC()}
  </div>`;
}
function flyHeart(el){
  const hp=el.querySelector('#hp');if(!hp)return;heartDots(el);
  const L=hp.getTotalLength(),D=4200,t0=performance.now();
  const step=now=>{if(!el.querySelector('#hp'))return;const t=Math.min(1,(now-t0)/D),e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    heartAt(el,L*e+(t>=1?40:0));if(t<1)requestAnimationFrame(step);};
  requestAnimationFrame(step);
}
function showIntro(){
  clearTimers();closeAllSheets();
  const el=$('#intro');el.innerHTML=introHTML();el.hidden=false;$('#tabs').hidden=true;document.body.style.overflow='hidden';
  const scenes=[...el.querySelectorAll('.sc')],show=i=>scenes.forEach((s,j)=>s.classList.toggle('on',j===i));
  let stage=0;el._done=false;
  const toTicket=()=>{clearTimers();stage=1;show(1);};
  const tear=()=>{if(stage===2)return;stage=2;el.querySelector('[data-tear]').classList.add('torn');const c=audio(true);sfxTear(c);if(!reduced())sfxFly(c,0.8);
    at(reduced()?0:750,()=>{show(2);el._done=true;if(reduced())el._final();else flyHeart(el);});};
  el._final=()=>{clearTimers();stage=2;show(2);el._done=true;heartDots(el);const hp=el.querySelector('#hp');if(hp)heartAt(el,hp.getTotalLength());};
  el._tap=()=>{if(el._done){finishIntro();return;}if(stage===0)toTicket();else tear();};
  show(0);at(reduced()?1200:3600,toTicket);
}
// a new app version that arrived while the intro was playing is switched to here, without playing the intro again
let pendingReload=false;
const reloadSkippingIntro=()=>{try{sessionStorage.setItem('tt:skipIntro','1');}catch(e){}location.reload();};
// the intro is drawn from what this phone saved last time; once the sync brings newer trip info, swap the words in place
function refreshIntro(){const el=$('#intro');if(!el||el.hidden)return;rebuild();
  const set=(k,h)=>el.querySelectorAll(`[data-i="${k}"]`).forEach(n=>{if(n.innerHTML!==h)n.innerHTML=h;});
  set('line',introLine());set('range',esc(rangeText()));set('pass',passHTML());set('title',esc(tripInfo()?trip().title:'딱복트립'));}
function finishIntro(){if(pendingReload){reloadSkippingIntro();return;}const el=$('#intro');clearTimers();el.hidden=true;el.innerHTML='';document.body.style.overflow='';enter();}

/* ===================== sheets & overlays ===================== */
// sheets stack: opening one over another keeps the one below, and closing returns to it
let sheetStack=[],ignorePop=false;
// a Back step is only worth making while the user is tapping (Chrome would skip it otherwise)
const byTap=()=>!navigator.userActivation||navigator.userActivation.isActive;
const stepBack=k=>{if(history.state&&history.state.k===k){ignorePop=true;history.back();}};
const sheetName=html=>{const m=/<h3[^>]*>([^<]*)/.exec(html);return m?m[1]:'';};
function openSheet(html){const root=$('#sheetRoot');
  // the same sheet drawn again (after an edit inside it) replaces itself; a different one stacks on top with its own Back step
  if(root.innerHTML&&sheetName(root.innerHTML)===sheetName(html)){}
  else{if(root.innerHTML){const sh=root.querySelector('.sheet');sheetStack.push({html:root.innerHTML,top:sh?sh.scrollTop:0});}if(byTap())history.pushState({k:'sheet'},'',location.href);}
  $('#sheetRoot').innerHTML=`<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div></div>`;const f=$('#sheetRoot .sh-x');if(f)f.focus({preventScroll:true});hydrateFiles($('#sheetRoot'));}
const closeSheet=fromBack=>{if(fromBack!==true)stepBack('sheet');const root=$('#sheetRoot'),back=state.reopenTicket&&sheetStack.length===state.reopenTicket.depth?state.reopenTicket.id:null,prev=sheetStack.pop();
  root.innerHTML=prev?prev.html:'';if(prev){const sh=root.querySelector('.sheet');if(sh)sh.scrollTop=prev.top;hydrateFiles(root);}
  if(back){state.reopenTicket=null;showTicket(back);}};
const closeAllSheets=()=>{sheetStack=[];state.reopenTicket=null;$('#sheetRoot').innerHTML='';};
const shHead=(title,sub,lead='')=>`<div class="sh-head">${lead}<div class="m"><h3>${title}</h3>${sub?`<div class="s">${sub}</div>`:''}</div><button class="sh-x" aria-label="닫기">×</button></div>`;
let wakeLock=null;
async function keepAwake(on){try{if(on&&'wakeLock' in navigator)wakeLock=await navigator.wakeLock.request('screen');else if(!on&&wakeLock){await wakeLock.release();wakeLock=null;}}catch(e){}}
function openOverlay(html,awake){const el=$('#overlay');if(el.hidden&&byTap())history.pushState({k:'ov'},'',location.href);el.innerHTML=html;el.hidden=false;document.body.style.overflow='hidden';if(awake)keepAwake(true);hydrateFiles(el);const b=el.querySelector('.ov-x');if(b)b.focus({preventScroll:true});}
function closeOverlay(fromBack){if(fromBack!==true)stepBack('ov');if(rec){try{rec.abort();}catch(e){}rec=null;}const wasTalk=$('#overlay .interp,#overlay .ocr')&&$('#trForm');const el=$('#overlay');el.hidden=true;el.innerHTML='';document.body.style.overflow='';keepAwake(false);if('speechSynthesis' in window)speechSynthesis.cancel();if(wasTalk)talkSheet('');}

/* ---------- Japanese sign rows and full-screen sign ---------- */
function signRows(id){
  const rows=signsOf(id);
  if(!rows.length)return `<p class="fine">일본어 이름이 아직 없어요. '고치기'에서 간판에 쓰인 일본어를 넣으면 발음 듣기와 크게 보기가 생겨요.</p>`;
  return `<div class="signs">${rows.map((s,i)=>`<div class="sign tap" data-bigsign="${id}|${i}" role="button" tabindex="0" aria-label="${esc(s[2]||s[0])} 크게 보기">
      <div class="sj"><span class="ja${jaFit(s[0])}" lang="ja" translate="no">${esc(s[0])}</span>${s[1]?`<span class="kana" lang="ja" translate="no">${esc(s[1])}</span>`:''}${koSay(s[1],s[0])?`<span class="pron">${esc(koSay(s[1],s[0]))}</span>`:''}<span class="ko">${esc(s[2]||'')}</span></div>
      <button class="say-zone" data-say="${esc(s[0])}" aria-label="${esc(s[2]||s[0])} 일본어로 듣기">${svg('speak')}<span>듣기</span></button></div>`).join('')}</div>`;
}
function bigSign(id,i,ask){
  const s=signsOf(id)[i];if(!s)return;const a=askOf([s[0],s[1],s[2]||PL[id].n]),show=ask?a:s;
  openOverlay(`<div class="bigsign"><button class="ov-x" data-closeov aria-label="닫기">×</button>
    <div class="bs-mode"><button data-bigsign="${id}|${i}" aria-pressed="${!ask}">간판 대조</button><button data-bigask="${id}|${i}" aria-pressed="${!!ask}">어디예요? 묻기</button></div>
    <div class="bs-ja" lang="ja" translate="no">${esc(show[0])}</div><div class="bs-kana" lang="ja" translate="no">${esc(show[1]||'')}</div>${koSay(show[1],show[0])?`<div class="bs-pron">${esc(koSay(show[1],show[0]))}</div>`:''}<div class="bs-ko">${esc(show[2]||'')}</div>
    <div class="bs-acts"><button class="btn acc" data-say="${esc(show[0])}">${svg('speak')}듣기</button><button class="btn" data-sayslow="${esc(show[0])}">천천히</button></div>
    <p class="fine">${ask?'화면을 보여 주거나 듣기를 눌러 길을 물어보세요.':'간판·안내판에 이 글자가 있는지 맞춰 보세요.'}</p></div>`);
}
function talkSheet(msg){
  const hid=hiddenPhrases().size;
  openSheet(`${shHead('일본어 회화','한국어로 쓰면 일본어로, 일본어를 쓰면 뜻을 달아 목록에 넣어요.')}
    <form id="trForm" class="srow"><input type="text" id="trIn" class="sinput" placeholder="예: 이거 맵나요? / 辛いですか" autocomplete="off" enterkeyhint="done"><button class="btn acc" type="submit">번역</button></form>
    <p class="fine" id="trMsg" ${msg?'':'hidden'}>${esc(msg||'')}</p>
    <div class="ttools"><label class="ttool">${svg('camera')}<span><b>사진 번역</b><small>간판·메뉴를 찍어요</small></span><input type="file" id="ocrIn" accept="image/*" capture="environment" hidden></label>
      <button class="ttool" data-interp>${svg('mic')}<span><b>대화 통역</b><small>말하면 바로 번역</small></span></button></div>
    <div class="signs">${allPhrases().map((p,i)=>`<div class="sign tap" data-bigphrase="${i}" ${p[3]?`data-hold="${esc(p[3])}"`:''} role="button" tabindex="0" aria-label="${esc(p[2])} 크게 보기"><div class="sj"><span class="ja${jaFit(p[0])}" lang="ja" translate="no">${esc(p[0])}</span>${p[1]?`<span class="kana" lang="ja" translate="no">${esc(p[1])}</span>`:''}${koSay(p[1],p[0])?`<span class="pron">${esc(koSay(p[1],p[0]))}</span>`:''}<span class="ko">${esc(p[2])}</span></div>
      <button class="say-zone" data-say="${esc(p[0])}" aria-label="${esc(p[2])} 듣기">${svg('speak')}<span>듣기</span></button></div>`).join('')}</div>
    <p class="fine">카드를 누르면 크게 보여요. 길게 누르면 지울 수 있어요.</p>
    ${hid?`<button class="btn ghost" data-restorephrases>지운 기본 문장 ${hid}개 다시 보기</button>`:''}`);
}
/* ===================== exchange rate (ECB reference rates via Frankfurter; currency-api as backup) ===================== */
// rates are cached on the phone so the screen still works offline
const RATE_SRC=[
  (a,b)=>`https://api.frankfurter.dev/v1/${a}..${b}?base=JPY&symbols=KRW`,
  (a,b)=>`https://api.frankfurter.app/${a}..${b}?from=JPY&to=KRW`];
const ymd=d=>d.toISOString().slice(0,10);
async function loadRates(days){
  const end=new Date(),start=new Date(Date.now()-days*86400000);let pts=null;
  for(const u of RATE_SRC){try{const r=await fetch(u(ymd(start),ymd(end)));if(!r.ok)continue;const j=await r.json();
    pts=Object.entries(j.rates||{}).map(([d,v])=>[d,+v.KRW]).filter(x=>x[1]>0).sort((a,b)=>a[0]<b[0]?-1:1);if(pts.length)break;}catch(e){}}
  if(!pts||!pts.length){try{const r=await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.min.json');const j=await r.json();if(j.jpy&&j.jpy.krw)pts=[[j.date,+j.jpy.krw]];}catch(e){}}
  if(!pts||!pts.length)return null;
  const data={days,pts,at:Date.now()};LS.set('rates:'+days,data);
  const last=pts[pts.length-1][1];if(Math.abs(last-rate())>0.0005)setSettings({rate:last,rateAt:pts[pts.length-1][0]});
  return data;}
function rateChart(pts){
  if(pts.length<2)return '';const W=320,H=120,P=6,vs=pts.map(p=>p[1]),lo=Math.min(...vs),hi=Math.max(...vs),span=hi-lo||1;
  const xy=pts.map((p,i)=>[P+(W-2*P)*i/(pts.length-1),P+(H-2*P)*(1-(p[1]-lo)/span)]),d=xy.map((q,i)=>(i?'L':'M')+q[0].toFixed(1)+' '+q[1].toFixed(1)).join(' ');
  const last=xy[xy.length-1];
  return `<svg class="rchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="환율 변화 그래프"><defs><linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    <path d="${d} L${last[0]} ${H} L${xy[0][0]} ${H}Z" fill="url(#rcg)"/><path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="var(--accent)"/></svg>
    <div class="rrange"><span>${esc(fmtYmd(pts[0][0]))}</span><span>최저 ${(lo*100).toFixed(1)} · 최고 ${(hi*100).toFixed(1)}</span><span>${esc(fmtYmd(pts[pts.length-1][0]))}</span></div>`;}
const fmtYmd=s=>{const [y,m,d]=s.split('-');return `${+m}.${+d}`;};
function rateBody(data){
  const pts=data&&data.pts||[],r=pts.length?pts[pts.length-1][1]:rate(),prev=pts.length>1?pts[pts.length-2][1]:null,diff=prev?(r-prev)*100:0;
  return `<div class="rnow"><div class="k">100엔</div><div class="big mono">${(r*100).toFixed(2)}<small>원</small></div>
      ${prev?`<div class="rdiff ${diff>0?'up':diff<0?'down':''}">${diff>0?'▲':diff<0?'▼':''} ${Math.abs(diff).toFixed(2)}원 · 전날보다</div>`:''}
      <div class="fine">${pts.length?`${esc(fmtYmd(pts[pts.length-1][0]))} 기준 · 유럽중앙은행 고시 환율`:'인터넷이 연결되면 오늘 환율을 받아 와요'}</div></div>
    ${rateChart(pts)}`;}
async function rateSheet(){
  const days=state.rateDays||30,cached=LS.get('rates:'+days,null),r=rate();
  openSheet(`${shHead('환율','')}
    <div class="seg rseg">${[[30,'1개월'],[90,'3개월'],[365,'1년']].map(([d,l])=>`<button type="button" data-rdays="${d}" aria-pressed="${d===days}">${l}</button>`).join('')}</div>
    <div id="rateBody">${rateBody(cached)}</div>
    <div class="conv2"><label><span>¥</span><input id="yenIn" inputmode="decimal" value="1,000" aria-label="엔"></label><span class="eq">⇄</span><label><span>₩</span><input id="wonIn" inputmode="decimal" value="${Math.round(1000*r).toLocaleString('ko-KR')}" aria-label="원"></label></div>
    <div class="quick5">${[[500,'500'],[1000,'1천'],[3000,'3천'],[5000,'5천'],[10000,'1만']].map(([v,l])=>`<button type="button" data-quick="${v}"><small>¥</small>${l}</button>`).join('')}</div>
    <p class="fine">가계부의 원화 환산도 이 환율로 자동으로 맞춰져요.</p>`);
  if(!cached||Date.now()-cached.at>3*3600000){const d=await loadRates(days);const b=$('#rateBody');if(d&&b){b.innerHTML=rateBody(d);convFrom('yen');}}
}
function convFrom(side){const r=rate(),num=id=>parseFloat(($('#'+id)?.value||'').replace(/,/g,''));
  if(side==='yen'){const y=num('yenIn');if($('#wonIn'))$('#wonIn').value=isNaN(y)?'':Math.round(y*r).toLocaleString('ko-KR');}
  else{const w=num('wonIn');if($('#yenIn'))$('#yenIn').value=isNaN(w)?'':Math.round(w/r).toLocaleString('ko-KR');}}

/* ===================== weather (Open-Meteo) ===================== */
const WMO={0:['☀️','맑음'],1:['🌤️','대체로 맑음'],2:['⛅','구름 조금'],3:['☁️','흐림'],45:['🌫️','안개'],48:['🌫️','안개'],51:['🌦️','약한 이슬비'],53:['🌦️','이슬비'],55:['🌧️','강한 이슬비'],61:['🌧️','약한 비'],63:['🌧️','비'],65:['🌧️','강한 비'],66:['🌧️','어는 비'],67:['🌧️','어는 비'],71:['🌨️','약한 눈'],73:['🌨️','눈'],75:['❄️','많은 눈'],77:['🌨️','싸락눈'],80:['🌦️','소나기'],81:['🌧️','소나기'],82:['⛈️','강한 소나기'],85:['🌨️','눈 소나기'],86:['🌨️','눈 소나기'],95:['⛈️','뇌우'],96:['⛈️','우박 뇌우'],99:['⛈️','우박 뇌우']};
const wmo=c=>WMO[c]||['🌡️',''];
async function weatherSpot(){
  const h=hotelId();if(h&&hasLL(h))return PL[h].ll;
  const lls=Object.keys(PL).filter(hasLL).map(id=>PL[id].ll);if(lls.length)return [lls.reduce((a,b)=>a+b[0],0)/lls.length,lls.reduce((a,b)=>a+b[1],0)/lls.length];
  const c=trip().city||'도쿄';const k='geo:'+c,hit=LS.get(k,null);if(hit)return hit;
  try{const r=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(c)}&count=1&language=ko`);const j=await r.json();if(j.results&&j.results[0]){const ll=[j.results[0].latitude,j.results[0].longitude];LS.set(k,ll);return ll;}}catch(e){}
  return [35.681,139.767];}
async function loadWeather(){
  const ll=await weatherSpot();
  const u=`https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=Asia%2FTokyo&forecast_days=16`;
  try{const r=await fetch(u);if(!r.ok)return null;const j=await r.json();const data={j,at:Date.now()};LS.set('weather',data);return data;}catch(e){return null;}}
function weatherBody(data){
  if(!data)return '<p class="fine" style="text-align:center;padding:24px 0">인터넷이 연결되면 날씨를 받아 와요.</p>';
  const j=data.j,c=j.current,[ic,tx]=wmo(c.weather_code),now=c.time.slice(0,13);
  const hi=j.hourly.time.findIndex(t=>t.slice(0,13)>=now),hours=j.hourly.time.slice(Math.max(0,hi),Math.max(0,hi)+24).map((t,i)=>{const k=Math.max(0,hi)+i;return `<div class="wh"><span>${+t.slice(11,13)}시</span><b>${wmo(j.hourly.weather_code[k])[0]}</b><span class="mono">${Math.round(j.hourly.temperature_2m[k])}°</span>${j.hourly.precipitation_probability[k]>=30?`<small>${j.hourly.precipitation_probability[k]}%</small>`:'<small>&nbsp;</small>'}</div>`;}).join('');
  const tripDays=new Set(DAYS.filter(d=>d.date).map(d=>ymd(new Date(d.date.getTime()-d.date.getTimezoneOffset()*60000))));
  const daily=j.daily.time.map((t,i)=>{const [di,dt]=wmo(j.daily.weather_code[i]),d=new Date(t+'T00:00:00');return `<div class="wd${tripDays.has(t)?' trip':''}"><span class="dd">${d.getMonth()+1}.${d.getDate()}(${WEEK[d.getDay()]})${tripDays.has(t)?'<i>여행</i>':''}</span><span class="di">${di}</span><span class="dt">${esc(dt)}</span><span class="dp">${j.daily.precipitation_probability_max[i]!=null?j.daily.precipitation_probability_max[i]+'%':''}</span><span class="mono dr">${Math.round(j.daily.temperature_2m_min[i])}° / <b>${Math.round(j.daily.temperature_2m_max[i])}°</b></span></div>`;}).join('');
  const t0=DAYS[0]&&DAYS[0].date,last=j.daily.time[j.daily.time.length-1];
  const note=t0&&ymd(t0)>last?`<p class="fine">여행 날짜는 아직 예보 범위(16일) 밖이에요. ${t0.getMonth()+1}월 ${t0.getDate()-16>0?t0.getDate()-15:1}일쯤부터 여행 날짜 예보가 보여요.</p>`:'';
  return `<div class="wnow"><span class="wi">${ic}</span><div><div class="big mono">${Math.round(c.temperature_2m)}°</div><div>${esc(tx)} · 체감 ${Math.round(c.apparent_temperature)}°</div><div class="fine">습도 ${c.relative_humidity_2m}% · 바람 ${Math.round(c.wind_speed_10m/3.6*10)/10}m/s</div></div></div>
    <div class="whours">${hours}</div>${note}<div class="wdays">${daily}</div>
    <p class="fine">${esc(fmtTime(data.at))}에 받은 예보 · Open-Meteo</p>`;}
const fmtTime=ms=>{const d=new Date(ms);return `${d.getMonth()+1}.${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;};
async function weatherSheet(){
  const cached=LS.get('weather',null);
  openSheet(`${shHead(`${esc(trip().city||'여행지')} 날씨`,'')}<div id="wBody">${weatherBody(cached)}</div>
    <div class="note"><ul><li>한국과 일본은 시차가 없어요.</li><li>늦가을·겨울엔 해가 일찍 져요. 전망대는 일몰 30분 전이 좋아요.</li></ul></div>`);
  if(!cached||Date.now()-cached.at>1800000){const d=await loadWeather();const b=$('#wBody');if(d&&b)b.innerHTML=weatherBody(d);}
}

/* translation (Google Cloud Translation) + kana reading (kuromoji, loaded the first time it's needed) */
async function translateText(text){
  const toKo=hasJa(text);
  const r=await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GMAPS_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:text,source:toKo?'ja':'ko',target:toKo?'ko':'ja',format:'text'})});
  if(r.status===403)throw new Error('disabled');
  if(!r.ok)throw new Error('http '+r.status);
  const j=await r.json(),out=j.data.translations[0].translatedText;
  return toKo?{ja:text,ko:out}:{ja:out,ko:text};
}
let kuroP=null;
// a phrase whose Japanese and Korean are already known (from a photo or the interpreter)
async function savePhrase(ja,ko){let kana='';try{kana=await readingOf(ja);}catch(e){}Sync.put('phrase',uid(),{ja,kana,ko,by:me(),at:new Date().toISOString()});cloudTTS(ja,false).catch(()=>{});}

/* ---------- photo translation: Cloud Vision reads the Japanese, Cloud Translation turns it into Korean ---------- */
async function ocrImage(file){
  openOverlay(`<div class="ocr"><div class="ov-top"><b>사진 번역</b><button class="ov-x" data-closeov aria-label="닫기">×</button></div><div id="ocrBody"><p class="fine" style="text-align:center;padding:30px 0">글자를 읽는 중…</p></div></div>`);
  const body=()=>$('#ocrBody');
  try{
    if(!navigator.onLine)throw new Error('offline');
    const blob=await downscale(file,1600),url=URL.createObjectURL(blob);
    const b64=await new Promise(r=>{const f=new FileReader();f.onload=()=>r(String(f.result).split(',')[1]);f.readAsDataURL(blob);});
    // first ask Claude to read it as a whole (dishes paired with prices, natural Korean names); fall back to plain OCR + translation
    if(body())body().innerHTML=`<img class="ocr-img" src="${url}" alt="찍은 사진"><div class="ai-wait"><div class="ai-bar"><i></i></div><p class="fine" id="aiSec">메뉴를 읽고 있어요… 0초</p><p class="fine">메뉴가 많으면 1분 정도 걸려요.</p></div>`;
    const t0=Date.now(),tick=setInterval(()=>{const e=$('#aiSec');if(!e){clearInterval(tick);return;}const s=Math.round((Date.now()-t0)/1000);e.textContent=`메뉴를 읽고 있어요… ${s}초`;},1000);
    const ai=await readWithClaude(b64);clearInterval(tick);
    if(ai&&ai.items){state.ocrAi=ai;if(body())body().innerHTML=aiResultHTML(ai,url);return;}
    const r=await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GMAPS_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({requests:[{image:{content:b64},features:[{type:'TEXT_DETECTION'}],imageContext:{languageHints:['ja']}}]})});
    if(r.status===403)throw new Error('vision-off');if(!r.ok)throw new Error('http');
    const j=await r.json(),text=((j.responses&&j.responses[0]&&j.responses[0].fullTextAnnotation)||{}).text||'';
    const lines=[...new Set(text.split('\n').map(x=>x.trim()).filter(x=>x&&/[\u3040-\u30ff\u4e00-\u9fff]/.test(x)))].slice(0,20);
    if(!lines.length){if(body())body().innerHTML=`<img class="ocr-img" src="${url}" alt="찍은 사진"><p class="fine" style="text-align:center">일본어를 찾지 못했어요. 글자가 크게 나오게 다시 찍어 보세요.</p>`;return;}
    const tr=await fetch(`https://translation.googleapis.com/language/translate/v2?key=${GMAPS_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({q:lines,source:'ja',target:'ko',format:'text'})});
    if(!tr.ok)throw new Error(tr.status===403?'disabled':'http');
    const ko=(await tr.json()).data.translations.map(x=>x.translatedText);
    state.ocr=lines.map((l,i)=>[l,ko[i]||'']);
    if(body())body().innerHTML=`<img class="ocr-img" src="${url}" alt="찍은 사진">
      <div class="ocr-all"><b>${esc(ko.join(' '))}</b></div>
      <div class="ocr-lines">${state.ocr.map(([a,b],i)=>`<div class="ol"><button class="ol-m" data-say="${esc(a)}"><span class="ja" lang="ja" translate="no">${esc(a)}</span><span class="ko">${esc(b)}</span></button><button class="btn sm" data-ocrsave="${i}">${svg('plus')}</button></div>`).join('')}</div>
      <p class="fine">줄을 누르면 일본어로 들려줘요. +를 누르면 회화 목록에 넣어요.</p>`;
  }catch(e){if(body())body().innerHTML=`<p class="fine" style="text-align:center;padding:24px 0">${e.message==='vision-off'?'사진 번역이 아직 꺼져 있어요. 구글 콘솔에서 Cloud Vision API를 켜고 API 키 제한에 추가해 주세요.':e.message==='offline'?'사진 번역은 인터넷이 필요해요.':'번역하지 못했어요. 잠시 뒤 다시 해 주세요.'}</p>`;}
}

async function readWithClaude(b64){
  // give up after 2.5 minutes (the server's own limit) and fall back to plain translation
  try{const ctl=new AbortController(),to=setTimeout(()=>ctl.abort(),150000);
    const {data,error}=await Sync.sb.functions.invoke('menu-read',{body:{image:b64,media_type:'image/jpeg'},signal:ctl.signal});clearTimeout(to);
    if(error||!data||data.error){console.warn('menu-read',error||data);return null;}return data;}catch(e){return null;}}
function aiResultHTML(ai,url){
  const won=y=>y?`<span class="pw">약 ${Math.round(y*rate()).toLocaleString('ko-KR')}원</span>`:'';
  const secs=[];ai.items.forEach((it,i)=>{let g=secs.find(x=>x.n===it.section_ko);if(!g)secs.push(g={n:it.section_ko,a:[]});g.a.push([it,i]);});
  return `<img class="ocr-img" src="${url}" alt="찍은 사진">
    <div class="ai-head"><b>${esc(ai.title_ko)}</b>${ai.summary_ko?`<p>${esc(ai.summary_ko)}</p>`:''}</div>
    ${secs.map(g=>`<div class="ai-sec">${g.n?`<div class="grp">${esc(g.n)}</div>`:''}${g.a.map(([it,i])=>`<div class="ai-it">
      <button class="ai-m" data-say="${esc(it.ja)}"><span class="ai-ko">${esc(it.ko)}</span><span class="ai-ja" lang="ja" translate="no">${esc(it.ja)}${it.reading&&it.reading!==it.ja?` · ${esc(it.reading)}`:''}</span>${it.desc_ko?`<span class="ai-d">${esc(it.desc_ko)}</span>`:''}${it.caution_ko?`<span class="ai-c">⚠️ ${esc(it.caution_ko)}</span>`:''}</button>
      <div class="ai-r">${it.price_yen!=null?`<b class="mono">¥${it.price_yen.toLocaleString('ko-KR')}</b>${won(it.price_yen)}`:''}<button class="btn sm" data-aisave="${i}" aria-label="회화에 넣기">${svg('plus')}</button></div></div>`).join('')}</div>`).join('')}
    <p class="fine">항목을 누르면 일본어로 들려줘요. 직원에게 그대로 들려주면 주문할 수 있어요.</p>`;}

/* ---------- interpreter: the phone listens (Web Speech), translates and reads the result aloud ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;var rec=null;
function speakKo(text){if(!('speechSynthesis' in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';const v=speechSynthesis.getVoices().find(x=>/^ko/i.test(x.lang));if(v)u.voice=v;u.rate=1;speechSynthesis.speak(u);}
function interpSheet(){
  state.interp=state.interp||[];
  openOverlay(`<div class="interp"><div class="ov-top"><b>대화 통역</b><button class="ov-x" data-closeov aria-label="닫기">×</button></div>
    <div class="ip-log" id="ipLog">${ipLogHTML()}</div>
    <div class="ip-live" id="ipLive" hidden></div>
    ${SR?`<div class="ip-btns"><button class="ip-b ja" data-listen="ja">${svg('mic')}<b>직원 말 듣기</b><small>일본어 → 한국어</small></button><button class="ip-b ko" data-listen="ko">${svg('mic')}<b>내가 말하기</b><small>한국어 → 일본어</small></button></div>
      <p class="fine" style="text-align:center">버튼을 누르고 말이 끝나면 자동으로 번역해서 읽어 줘요.</p>`
     :`<p class="fine" style="text-align:center">이 브라우저는 음성 인식을 지원하지 않아요. Chrome으로 열어 주세요.</p>`}</div>`);
  const l=$('#ipLog');if(l)l.scrollTop=l.scrollHeight;
}
const ipLogHTML=()=>state.interp.length?state.interp.map((x,i)=>`<div class="ip-m ${x.from}"><div class="src" ${x.from==='ja'?'lang="ja"':''}>${esc(x.src)}</div><div class="dst" ${x.from==='ko'?'lang="ja"':''}>${esc(x.dst)}</div>
  <div class="ip-a"><button data-ipsay="${i}">${svg('speak')}다시 듣기</button>${x.from==='ja'?`<button data-ipsave="${i}">${svg('plus')}회화에 넣기</button>`:`<button data-ipbig="${i}">${svg('expand')}크게 보여주기</button>`}</div></div>`).join(''):'<p class="fine" style="text-align:center;padding:30px 0">직원이 일본어로 말할 때 「직원 말 듣기」를 누르세요.<br>내가 할 말은 「내가 말하기」로 한국어로 말하면 돼요.</p>';
function ipSay(x){if(x.from==='ja')speakKo(x.dst);else speak(x.dst);}
function listen(from){
  if(!SR)return;if(rec){try{rec.abort();}catch(e){}rec=null;}
  if(!navigator.onLine){toast('통역은 인터넷이 필요해요.');return;}
  if('speechSynthesis' in window)speechSynthesis.cancel();
  const live=$('#ipLive'),btn=document.querySelector(`[data-listen="${from}"]`);
  rec=new SR();rec.lang=from==='ja'?'ja-JP':'ko-KR';rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
  let text='';
  document.querySelectorAll('[data-listen]').forEach(b=>b.classList.toggle('on',b===btn));
  if(live){live.hidden=false;live.textContent=from==='ja'?'듣는 중… (일본어)':'듣는 중… (한국어)';}
  rec.onresult=e=>{text=[...e.results].map(r=>r[0].transcript).join('');if(live)live.textContent=text;};
  rec.onerror=e=>{if(live)live.textContent=e.error==='not-allowed'?'마이크 권한을 허용해 주세요.':e.error==='no-speech'?'말소리를 듣지 못했어요. 다시 눌러 주세요.':'다시 눌러 주세요.';};
  rec.onend=async()=>{rec=null;document.querySelectorAll('[data-listen]').forEach(b=>b.classList.remove('on'));
    if(!text.trim())return;if(live)live.textContent='번역하는 중…';
    try{const {ja,ko}=await translateText(text);const x=from==='ja'?{from,src:ja,dst:ko}:{from,src:ko,dst:ja};state.interp.push(x);
      const l=$('#ipLog');if(l){l.innerHTML=ipLogHTML();l.scrollTop=l.scrollHeight;}if(live)live.hidden=true;ipSay(x);}
    catch(e){if(live)live.textContent='번역하지 못했어요. 다시 눌러 주세요.';}};
  try{rec.start();}catch(e){if(live)live.textContent='다시 눌러 주세요.';}
}
function loadKuromoji(){
  if(kuroP)return kuroP;
  kuroP=new Promise((res,rej)=>{const go=()=>kuromoji.builder({dicPath:'vendor/kuromoji-0.1.2/dict/'}).build((e,t)=>e?rej(e):res(t));
    if(window.kuromoji)go();else{const sc=document.createElement('script');sc.src='vendor/kuromoji-0.1.2/kuromoji.js';sc.onload=go;sc.onerror=rej;document.head.appendChild(sc);}}).catch(e=>{kuroP=null;throw e;});
  return kuroP;
}
const toHira=s=>s.replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
async function readingOf(ja){
  const t=await loadKuromoji();let out='';
  t.tokenize(ja).forEach(k=>{const kata=/^[\u30a0-\u30ffー]+$/.test(k.surface_form),rd=k.reading&&k.reading!=='*'?k.reading:k.surface_form;
    out+=kata?k.surface_form:/[\u3040-\u30ff]/.test(rd)?toHira(rd):rd;if(k.pos==='助詞')out+=' ';});
  return out.replace(/\s+/g,' ').replace(/ ([？?。、！!])/g,'$1').trim();
}
async function addPhrase(text){
  const msg=$('#trMsg'),btn=$('#trForm button');const say=m=>{if(msg){msg.textContent=m;msg.hidden=!m;}};
  if(!navigator.onLine){say('번역은 인터넷이 필요해요.');return;}
  btn.disabled=true;say('번역하는 중…');
  try{
    const {ja,ko}=await translateText(text);
    if(!localStorage.getItem('tt:kuroReady'))say('처음 한 번은 읽는 법 사전을 받아요 (약 18MB)…');
    let kana='';try{kana=await readingOf(ja);try{localStorage.setItem('tt:kuroReady','1');}catch(e){}}catch(e){console.warn('reading',e);}
    Sync.put('phrase',uid(),{ja,kana,ko,by:me(),at:new Date().toISOString()});
    cloudTTS(ja,false).catch(()=>{});
    talkSheet('');
  }catch(e){btn.disabled=false;say(e.message==='disabled'?'번역 기능이 아직 꺼져 있어요. 구글 콘솔에서 Cloud Translation API를 켜 주세요.':'번역하지 못했어요. 잠시 뒤 다시 해 주세요.');}
}
function bigPhrase(i){const p=Array.isArray(i)?i:allPhrases()[i];if(!p)return;openOverlay(`<div class="bigsign"><button class="ov-x" data-closeov aria-label="닫기">×</button><div class="bs-ja" lang="ja" translate="no">${esc(p[0])}</div><div class="bs-kana" lang="ja" translate="no">${esc(p[1])}</div><div class="bs-pron">${esc(koSay(p[1],p[0]))}</div><div class="bs-ko">${esc(p[2])}</div><div class="bs-acts"><button class="btn acc" data-say="${esc(p[0])}">${svg('speak')}듣기</button></div></div>`);}

/* ---------- place detail ---------- */
function placeSheet(id){
  const p=PL[id];if(!p)return;const days=DAYS.filter(d=>planOf(d.id).some(s=>s.p===id)).map(d=>d.id),saved=savedSet(),tks=tickets().filter(t=>t.place===id),sg=mainSign(id),c=CAT[p.cat]||CAT['기타'];
  // the name as written in Japanese (and English, if known) sits right under the Korean name
  const jpName=(sg&&sg[0])||p.jp||'';
  openSheet(`${shHead(esc(p.n),`${jpName?`<span class="jp-n" lang="ja" translate="no">${esc(jpName)}</span>${p.en?`<span class="en-n"> · ${esc(p.en)}</span>`:''}<br>`:p.en?`<span class="en-n">${esc(p.en)}</span><br>`:''}<span style="color:var(${c.c})">${esc(p.cat)}</span>${p.area?' · '+esc(p.area):''}`,thumb(id))}
    <div style="display:flex;gap:6px;flex-wrap:wrap">${safeChip(p)}${days.map(d=>`<span class="chip" style="color:var(${dayOf(d).c})">DAY ${d} 일정</span>`).join('')}${p.ticket&&!tks.length?'<span class="chip warn">티켓 아직 없음</span>':''}${!hasLL(id)?'<span class="chip">지도 위치 없음</span>':''}</div>
    <div><div class="grp" style="margin-top:0">일본어 간판 · 발음</div>${signRows(id)}
      ${sg?`<button class="btn ghost" style="width:100%;margin-top:8px" data-bigask="${id}|0">${svg('talk')}여기 어디예요? 물어보기</button>`:''}</div>
    ${p.addr?`<div class="addr-l"><span class="k">주소</span><span>${esc(p.addr.replace(/^日本[、,]\s*/,'').replace(/^(〒\d{3}-\d{4})\s*/,'$1\n'))}</span></div>`:p.d?`<p style="margin:0;font-size:15px;white-space:pre-wrap">${esc(p.d)}</p>`:''}
    <dl class="facts">${p.walk?`<dt>걷는 양</dt><dd>${walkHTML(p.walk)}</dd>`:''}${p.price?`<dt>가격대</dt><dd class="mono">${'¥'.repeat(p.price)}<span style="color:var(--soft2)">${'¥'.repeat(4-p.price)}</span></dd>`:''}</dl>
    ${p.tips&&p.tips.length?`<div class="note"><h4>임산부 팁</h4><ul>${p.tips.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
    <div class="sh-acts"><a class="btn acc" href="${placeDir(null,id,'transit')}" target="_blank" rel="noopener">${svg('nav')}여기로 길찾기</a><a class="btn" href="${placeSearch(id)}" target="_blank" rel="noopener">${svg('pin')}구글 지도</a>
      <button class="btn" data-heart="${id}" aria-pressed="${saved.has(id)}">${svg('heart')}${saved.has(id)?'즐겨찾기됨':'즐겨찾기'}</button><button class="btn pri" data-addto="${id}">${svg('plus')}일정에 추가</button></div>
    <button class="btn ghost" data-editplace="${id}">${svg('pen')}장소 정보 고치기</button>`);
}
function addToSheet(id){openSheet(`${shHead('어느 날에 추가할까요?',esc(PL[id].n))}<div class="stack">${DAYS.map(d=>`<button class="btn" style="justify-content:flex-start" data-addday="${d.id}|${id}"><span class="mono" style="color:var(${d.c})">DAY ${d.id}</span> ${esc(d.label)}${d.title?' · '+esc(d.title):''}</button>`).join('')}</div>`);}
function pickPlaceSheet(d){
  state.search={q:'',busy:false,err:'',results:[],forDay:d};
  const ids=Object.keys(PL),saved=savedSet();
  openSheet(`${shHead(`DAY ${d}에 장소 넣기`,'등록한 장소에서 고르거나 새로 찾아 추가하세요')}
    <button class="btn acc" data-newplace="${d}">${svg('search')}새 장소 찾기</button>
    ${ids.length?`<input type="search" id="pickQ" class="sinput" placeholder="등록한 장소에서 찾기" autocomplete="off">
    <div class="pick" id="pickList">${ids.sort((a,b)=>saved.has(b)-saved.has(a)).map(id=>`<button data-addday="${d}|${id}" data-name="${esc((PL[id].n+' '+(PL[id].jp||'')).toLowerCase())}">${thumb(id)}<span style="flex:1;min-width:0"><b>${esc(PL[id].n)}</b><br><span class="fine" lang="ja">${esc(PL[id].jp||PL[id].area||'')}</span></span>${svg('plus')}</button>`).join('')}</div>`
    :'<p class="fine">아직 등록한 장소가 없어요. 위 버튼으로 찾아서 추가해 주세요.</p>'}`);
}

/* ---------- find & register places (OpenStreetMap search) ---------- */
function guessCat(r){const c=r.category,t=r.type;
  if(c==='aeroway'||t==='aerodrome')return '공항';
  if(c==='tourism'&&/hotel|hostel|guest_house|motel|apartment/.test(t))return '숙소';
  if(c==='amenity'&&/restaurant|fast_food|food_court/.test(t))return '맛집';
  if(c==='amenity'&&/cafe|ice_cream/.test(t)||c==='shop'&&/bakery|confectionery|pastry/.test(t))return '카페·간식';
  if(c==='shop')return '쇼핑';
  if(c==='tourism'||c==='historic'||c==='leisure'||c==='amenity'&&/place_of_worship|theatre|arts_centre/.test(t)||c==='building'&&/shrine|temple/.test(t))return '관광명소';
  return '기타';}
function gCat(types){const t=(types||[]).join(' ');
  if(/airport/.test(t))return '공항';if(/lodging|hotel/.test(t))return '숙소';
  if(/cafe|bakery|dessert|ice_cream|confection/.test(t))return '카페·간식';
  if(/restaurant|food|meal_|ramen|sushi/.test(t))return '맛집';
  if(/store|shopping|market|mall/.test(t))return '쇼핑';
  if(/tourist|museum|park|place_of_worship|shrine|temple|church|zoo|aquarium|amusement|landmark|observation/.test(t))return '관광명소';
  return '기타';}
async function googleSearch(q){
  await loadGoogle();const {Place}=await google.maps.importLibrary('places');
  const h=hotelId(),req={textQuery:q,fields:['id','displayName','location','formattedAddress','types'],language:'ko',region:'jp',maxResultCount:8};
  if(h&&hasLL(h))req.locationBias={lat:PL[h].ll[0],lng:PL[h].ll[1]};
  const {places}=await Place.searchByText(req);
  return (places||[]).map(p=>{const addr=p.formattedAddress||'';return {gid:p.id,n:p.displayName||q,jp:'',kana:'',ll:[p.location.lat(),p.location.lng()],area:addr.split(/[,，]/).slice(-3,-2)[0]?.trim()||'',cat:gCat(p.types),addr};});
}
async function googleJaName(gid){
  try{const {Place}=await google.maps.importLibrary('places');const pl=new Place({id:gid,requestedLanguage:'ja'});await pl.fetchFields({fields:['displayName']});return hasJa(pl.displayName)?pl.displayName:'';}catch(e){return '';}
}
async function runSearch(q){
  const s0=state.search;
  if(navigator.onLine&&!gFailed){
    s0.q=q;s0.busy=true;s0.err='';s0.results=[];drawSearch();
    try{s0.results=await googleSearch(q);s0.busy=false;if(!s0.results.length)s0.err='찾지 못했어요. 다른 이름으로 찾아보거나 아래에서 직접 입력해 주세요.';drawSearch();return;}
    catch(e){console.warn('google search',e);}
  }
  return osmSearch(q);
}
async function osmSearch(q){
  const s=state.search;s.q=q;s.busy=true;s.err='';s.results=[];drawSearch();
  if(!navigator.onLine){s.busy=false;s.err='장소 찾기는 인터넷이 필요해요. 직접 입력은 오프라인에서도 돼요.';drawSearch();return;}
  try{
    const h=hotelId(),vb=h&&hasLL(h)?`&viewbox=${PL[h].ll[1]-.6},${PL[h].ll[0]+.5},${PL[h].ll[1]+.6},${PL[h].ll[0]-.5}`:'';
    const r=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&namedetails=1&addressdetails=1&limit=8&accept-language=ko,ja,en&countrycodes=jp${vb}&q=${encodeURIComponent(q)}`);
    if(!r.ok)throw new Error('http '+r.status);
    const data=await r.json();
    s.results=data.map(x=>{const nd=x.namedetails||{},a=x.address||{};const ja=nd['name:ja']||(hasJa(nd.name)?nd.name:'');
      return {n:nd['name:ko']||nd.name||x.display_name.split(',')[0],jp:ja,kana:nd['name:ja-Hira']||nd['name:ja_kana']||nd['name:ja-Kana']||'',ll:[+x.lat,+x.lon],area:a.quarter||a.neighbourhood||a.suburb||a.city_district||a.city||a.town||'',cat:guessCat(x),addr:x.display_name};});
    if(!s.results.length)s.err='찾지 못했어요. 일본어·영어 이름으로 찾아보거나 아래에서 직접 입력해 주세요.';
  }catch(e){s.err='검색이 잠시 안 돼요. 조금 뒤에 다시 하거나 직접 입력해 주세요.';}
  s.busy=false;drawSearch();
}
function drawSearch(){
  const s=state.search,box=$('#searchResults');if(!box)return;
  box.innerHTML=s.busy?'<p class="fine">찾는 중…</p>':s.err?`<p class="fine">${esc(s.err)}</p>`:s.results.map((r,i)=>`<button class="sres" data-pickres="${i}"><span class="thumb" style="--c:var(${(CAT[r.cat]||CAT['기타']).c})">${svg((CAT[r.cat]||CAT['기타']).ic,'')}</span><span class="m"><b>${esc(r.n)}</b>${r.jp?` <span lang="ja" class="jpn">${esc(r.jp)}</span>`:''}<span class="s">${esc(r.cat)} · ${esc(r.addr.split(',').slice(0,3).join(','))}</span></span></button>`).join('');
}
function searchSheet(day){
  state.search={q:'',busy:false,err:'',results:[],forDay:day||0};
  openSheet(`${shHead('장소 찾기','한국어·일본어·영어 이름 모두 돼요. 일본어 이름이 있으면 함께 가져와요.')}
    <form id="searchForm" class="srow"><input type="search" id="searchQ" class="sinput" placeholder="예: 浅草寺, 이치란 시부야, teamLab" autocomplete="off" enterkeyhint="search"><button class="btn acc" type="submit">${svg('search')}찾기</button></form>
    <div id="searchResults" class="sresults"></div>
    <button class="btn ghost" data-manualplace>${svg('pen')}직접 입력하기 (구글 지도 링크도 돼요)</button>
    <p class="fine">구글 지도에서 찾고, 안 될 때는 OpenStreetMap에서 찾아요. 일본어 간판 이름도 함께 가져와요.</p>`);
  setTimeout(()=>{const i=$('#searchQ');if(i)i.focus();},50);
}
function parseMapsLink(u){
  const m=/@(-?\d+\.\d+),(-?\d+\.\d+)/.exec(u)||/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/.exec(u)||/[?&](?:q|query|ll|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/.exec(u)||/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{2,3}\.\d+)\s*$/.exec(u);
  return m?[+m[1],+m[2]]:null;
}
function placeForm(p,day){
  // p: existing place (with id) or a prefilled draft from search; day: add to this day after saving
  const f=Object.assign({n:'',jp:'',kana:'',cat:'관광명소',area:'',d:'',walk:0,safe:'',ticket:false,ll:null,signs:[],tips:[]},p||{});if(state.stayMode&&!f.id)f.cat='숙소';
  state.pf={id:f.id||'',gid:f.gid||'',day:day||0,ll:f.ll,cat:f.cat,walk:f.walk||0,safe:f.safe||'',ticket:!!f.ticket,signs:f.signs||[],tips:f.tips||[]};
  const extra=(f.signs||[]).slice(1);
  openSheet(`${shHead(f.id?'장소 고치기':'장소 등록',f.id?'':(day?`저장하면 DAY ${day} 일정에 들어가요`:'저장하면 장소 목록에 들어가요'))}
    <form id="placeForm" class="stack" novalidate>
      <label class="f" for="pfN">이름</label><input type="text" id="pfN" value="${esc(f.n)}" placeholder="예: 센소지" required>
      <div class="two"><div><label class="f" for="pfJp">일본어 이름 (간판)</label><input type="text" id="pfJp" lang="ja" value="${esc(f.jp)}" placeholder="例: 浅草寺"></div>
        <div><label class="f" for="pfKana">읽는 법 (선택)</label><input type="text" id="pfKana" lang="ja" value="${esc(f.kana)}" placeholder="せんそうじ"></div></div>
      ${extra.length?`<p class="fine">함께 찾아볼 간판: ${extra.map(s=>`<span lang="ja">${esc(s[0])}</span>`).join(' · ')}</p>`:''}
      <div class="catpick" role="group" aria-label="분류">${CAT_LIST.map(k=>`<button type="button" data-pfcat="${k}" aria-pressed="${f.cat===k}" style="--c:var(${CAT[k].c})"><i></i>${k}</button>`).join('')}</div>
      <div class="two"><div><label class="f" for="pfArea">지역 (선택)</label><input type="text" id="pfArea" value="${esc(f.area)}" placeholder="예: 아사쿠사"></div>
        <div><label class="f" for="pfLink">위치</label><input type="text" id="pfLink" value="${f.ll?esc(f.ll.map(n=>(+n).toFixed(5)).join(', ')):''}" placeholder="구글 지도 링크 붙여넣기" autocomplete="off"></div></div>
      <label class="f" for="pfD">메모 · 설명 (선택)</label><textarea id="pfD" rows="3" placeholder="예: 11시 전에 가면 덜 붐빔">${esc(f.d)}</textarea>
      <div><label class="f">걷는 양</label><div class="catpick">${[[0,'모름'],[1,'적음'],[2,'보통'],[3,'많음']].map(([v,l])=>`<button type="button" data-pfwalk="${v}" aria-pressed="${(f.walk||0)===v}">${l}</button>`).join('')}</div></div>
      <div id="pfSafeRow" ${/맛집|카페/.test(f.cat)?'':'hidden'}><label class="f">임산부 음식</label><div class="catpick">${[['','모름'],['ok','안심'],['warn','주문 시 주의']].map(([v,l])=>`<button type="button" data-pfsafe="${v}" aria-pressed="${(f.safe||'')===v}">${l}</button>`).join('')}</div></div>
      <label class="toggle" for="pfTicket"><input type="checkbox" id="pfTicket" ${f.ticket?'checked':''}>사전 예매 · 입장권이 필요해요 (티켓 탭에 칸이 생겨요)</label>
      <p class="err" id="pfErr" hidden></p>
      <button class="btn acc" type="submit">저장</button>
      ${f.id?`<button class="btn ghost" type="button" data-delplace="${f.id}" style="color:var(--no)">장소 삭제</button>`:''}
    </form>`);
}
function savePlace(){
  const pf=state.pf,v=id=>$('#'+id).value.trim(),n=v('pfN'),err=$('#pfErr');
  if(!n){err.textContent='이름을 적어 주세요.';err.hidden=false;$('#pfN').focus();return;}
  const link=v('pfLink');let ll=pf.ll;
  if(link){const got=parseMapsLink(link);if(got)ll=got;else if(!pf.ll||link!==pf.ll.map(x=>(+x).toFixed(5)).join(', ')){err.textContent=/goo\.gl|maps\.app/.test(link)?'짧은 공유 링크는 위치를 못 읽어요. 구글 지도에서 장소를 연 뒤 주소창의 긴 링크를 붙여 주세요.':'위치를 읽지 못했어요. 구글 지도 주소창 링크나 "35.71, 139.79" 형식으로 넣어 주세요.';err.hidden=false;return;}}
  else ll=null;
  const jp=v('pfJp'),kana=v('pfKana'),signs=pf.signs.length?[[jp||pf.signs[0][0],kana||pf.signs[0][1],n],...pf.signs.slice(1)]:(jp?[[jp,kana,n]]:[]);
  const id=pf.id||uid(),prev=pf.id?Sync.get('place',pf.id):{};
  Sync.put('place',id,{...prev,n,jp,kana,cat:pf.cat,area:v('pfArea'),d:v('pfD'),walk:pf.walk,safe:/맛집|카페/.test(pf.cat)?pf.safe:'',ticket:$('#pfTicket').checked,ll,signs,tips:pf.tips,q:jp||n,gid:pf.gid||prev.gid||'',at:prev.at||new Date().toISOString()});
  if(pf.cat==='숙소'&&!PL[trip().hotelId])Sync.put('trip','info',{...trip(),hotelId:id});
  rebuild();
  if(pf.day){const a=planOf(pf.day),last=a[a.length-1],pos=last&&(isStay(last.p)||isAir(last.p))&&a.length>1?a.length-1:a.length;a.splice(pos,0,{p:id,t:'',dur:''});setPlan(pf.day,a);state.day=pf.day;LS.set('day',pf.day);closeSheet();toast('장소를 등록하고 일정에 넣었어요.');go('plan');return;}
  if(state.stayMode&&pf.cat==='숙소'&&sheetStack.some(x=>x.html.includes('id="tStay"'))){state.stayMode=false;state.lastStay=id;
    for(let k=0;k<4&&!$('#tStay');k++)closeSheet();fillStays();toast('숙소를 등록했어요.');return;}
  if(state.favMode){state.favMode=false;const sv=savedSet();sv.add(id);setSaved(sv);closeAllSheets();toast('즐겨찾기에 넣었어요.');render();return;}
  state.stayMode=false;closeSheet();toast(pf.id?'고쳤어요.':'장소를 등록했어요.');render();
}
// the stay picker in the ticket form, refreshed after a new 숙소 is registered
function fillStays(){const el=$('#tStay');if(!el)return;const cur=state.lastStay||el.value,stays=Object.keys(PL).filter(id=>PL[id].cat==='숙소');
  el.innerHTML=`<option value="">${stays.length?'숙소 고르기':'아직 등록한 숙소가 없어요'}</option>`+stays.map(id=>`<option value="${id}" ${id===cur?'selected':''}>${esc(PL[id].n)}</option>`).join('');state.lastStay='';}

/* ---------- tools ---------- */
function toolSheet(k){
  const t=trip();
  if(k==='weather')weatherSheet();
  if(k==='rate')rateSheet();
  if(k==='talk')talkSheet();
  if(k==='home'){const h=hotelId();if(!h){openSheet(`${shHead('숙소가 아직 없어요','여행 정보에서 숙소를 정하거나 숙소를 장소로 등록해 주세요.')}<button class="btn acc" data-tripsetup>여행 정보 열기</button>`);return;}
    openSheet(`${shHead('숙소로 돌아가기',`${esc(PL[h].n)}${PL[h].en?`<br><span class="en-n">${esc(PL[h].en)}</span>`:''}`,thumb(h))}
    <div class="sh-acts"><a class="btn acc" href="${placeDir(null,h,'transit')}" target="_blank" rel="noopener">${svg('train')}대중교통으로</a><a class="btn" href="${placeDir(null,h,'driving')}" target="_blank" rel="noopener">${svg('taxi')}택시 경로</a></div>
    ${(()=>{const p=hotelPhrase();return p?`<div class="grp">택시 기사에게</div><div class="signs"><div class="sign tap" data-bighotel role="button" tabindex="0" aria-label="크게 보기"><div class="sj"><span class="ja${jaFit(p[0])}" lang="ja" translate="no">${esc(p[0])}</span><span class="kana" lang="ja" translate="no">${esc(p[1])}</span>${koSay(p[1],p[0])?`<span class="pron">${esc(koSay(p[1],p[0]))}</span>`:''}<span class="ko">${esc(p[2])}</span></div><button class="say-zone" data-say="${esc(p[0])}" aria-label="듣기">${svg('speak')}<span>듣기</span></button></div></div><div class="grp">간판·주소</div>`:'';})()}${signRows(h)}${PL[h].en||PL[h].addrEn?`<div class="grp">영문</div><div class="en-box">${PL[h].en?`<b>${esc(PL[h].en)}</b>`:''}${PL[h].addrEn?`<span>${esc(PL[h].addrEn)}</span>`:''}</div>`:''}`);}
}

/* ---------- trip setup ---------- */
function tripSheet(){
  const t=trip(),stays=Object.keys(PL).filter(id=>PL[id].cat==='숙소');
  openSheet(`${shHead('여행 정보','두 사람 모두에게 똑같이 보여요')}
    <form id="tripForm" class="tform stack" novalidate>
      <section class="fsec"><h4>여행</h4>
        <div><label class="f" for="trTitle">이름</label><input type="text" id="trTitle" value="${esc(t.title)}" placeholder="예: 도쿄로 떠나는 태교여행"></div>
        <div><label class="f" for="trCity">도시</label><input type="text" id="trCity" value="${esc(t.city)}" placeholder="예: 도쿄"></div></section>
      <section class="fsec"><h4>날짜</h4>
        <div class="two"><div><label class="f" for="trStart">출발일</label><input type="date" id="trStart" value="${esc(t.start)}"></div>
          <div><label class="f" for="trNights">기간</label><select id="trNights">${Array.from({length:10},(_,i)=>i+1).map(n=>`<option value="${n}" ${+t.nights===n?'selected':''}>${n}박 ${n+1}일</option>`).join('')}</select></div></div></section>
      <section class="fsec"><h4>인트로 첫 문구</h4>
        <textarea id="trIntro" rows="2" placeholder="예: 엄마 아빠 딱복이랑&#10;떠나는 첫 비행">${esc(t.intro||'')}</textarea></section>
      <p class="err" id="trErr" hidden></p>
      <button class="btn acc" type="submit">저장</button>
    </form>`);
}
function saveTrip(){
  const v=id=>$('#'+id).value.trim(),err=$('#trErr');
  if(!v('trStart')){err.textContent='출발일을 골라 주세요.';err.hidden=false;return;}
  Sync.put('trip','info',{...trip(),title:v('trTitle')||'우리 여행',intro:$('#trIntro').value.trim(),city:v('trCity'),start:v('trStart'),nights:+v('trNights')||2});
  rebuild();closeSheet();toast('여행 정보를 저장했어요.');render();
}
/* ---------- settings ---------- */
function settingsSheet(){
  const m=Sync.meta,mine=member(me()),T=trip(),ns=[...new Set(tickets().map(t=>t.pax).filter(Boolean))],cur=myPax(),off=LS.get('offlineMapAt','');
  const row=(label,sub,right)=>`<div class="lrow"><div class="lm"><b>${label}</b>${sub?`<span>${sub}</span>`:''}</div>${right}</div>`;
  openSheet(`${shHead('우리 여행','')}<div class="tform stack">
    <section class="fsec"><h4>여행</h4>
      <button class="lrow tap" data-tripsetup><div class="lm"><b>${esc(T.title)}</b><span>${esc([T.city,rangeText()].filter(Boolean).join(' · '))}</span></div>${svg('chev')}</button></section>
    <section class="fsec"><h4>함께하는 사람</h4>
      ${Sync.members.map(x=>`<div class="lrow">${avatar(x.user_id)}<div class="lm"><b>${esc(x.display_name)}</b></div>${x.user_id===me()?'<span class="chip">나</span>':''}</div>`).join('')||'<p class="fine">동기화되면 보여요.</p>'}
      ${row('초대 코드',`<span class="mono code-s">${esc(m.inviteCode||'—')}</span> · 가입 후 '초대 코드로 참여'에 입력`,`<button class="btn sm" data-copy="${esc(m.inviteCode||'')}">복사</button>`)}</section>
    <section class="fsec"><h4>내 정보</h4>
      <div><label class="f" for="myName">이름</label><input type="text" id="myName" value="${esc(mine.display_name)}" maxlength="12"></div>
        <div><label class="f">색</label><span class="colors">${COLORS.map(c=>`<button type="button" class="cdot" data-mycolor="${c}" aria-pressed="${mine.color===c}" style="--c:${c}" aria-label="색 ${c}"></button>`).join('')}</span></div>

      <button class="btn pri" data-saveprofile>저장</button></section>
    <section class="fsec"><h4>앱</h4>
      ${row('동기화',esc(syncText()),`<button class="btn sm" data-syncnow>${svg('sync')}지금</button>`)}
      ${row('오프라인 지도·음성',off?'받아 둠 · '+new Date(off).toLocaleDateString('ko-KR'):'출발 전에 한 번 받아 두세요',`<button class="btn sm" data-offlinemap>받기</button>`)}
      ${row('효과음','',`<button class="btn sm" data-sound aria-pressed="${state.sound}">${state.sound?'켜짐':'꺼짐'}</button>`)}
      ${row('인트로','',`<button class="btn sm" data-replay>다시 보기</button>`)}</section>
    <section class="fsec"><h4>데이터</h4>
      ${!Object.keys(PL).length?row('도쿄 예시','장소 20여 곳과 2박 3일 일정',`<button class="btn sm" data-importtpl>불러오기</button>`):''}
      ${Object.keys(PL).length||Sync.list('ticket').length?row('새로 시작','항공권만 남기고 모두 지워요',`<button class="btn sm danger-t" data-wipeall>지우기</button>`):''}
      ${row('로그아웃','이 휴대폰의 데이터만 지워져요',`<button class="btn sm danger-t" data-signout>로그아웃</button>`)}</section></div>`);
}
/* ---------- flights ---------- */
function flightSheet(){
  const f=flights(),row=(k,lbl,x)=>`<div class="fl-block"><div class="grp" style="margin-top:0">${lbl}</div>
    <div class="two"><div><label class="f" for="${k}From">출발</label><input type="text" id="${k}From" value="${esc(x.fromCity)}" placeholder="예: 인천"></div><div><label class="f" for="${k}To">도착</label><input type="text" id="${k}To" value="${esc(x.toCity)}" placeholder="예: 나리타"></div></div>
    <div class="two3"><div><label class="f" for="${k}No">편명</label><input type="text" id="${k}No" value="${esc(x.no)}" placeholder="KE705" autocomplete="off" autocapitalize="characters"></div>
    <div><label class="f" for="${k}Dep">출발 시각</label><input type="time" id="${k}Dep" value="${esc(x.dep)}"></div><div><label class="f" for="${k}Arr">도착 시각</label><input type="time" id="${k}Arr" value="${esc(x.arr)}"></div></div>
    <div class="two3"><div><label class="f" for="${k}Term">출발 터미널</label><input type="text" id="${k}Term" value="${esc(x.term||'')}" placeholder="예: 1"></div><div><label class="f" for="${k}ATerm">도착 터미널</label><input type="text" id="${k}ATerm" value="${esc(x.arrTerm||'')}" placeholder="예: 2"></div><div><label class="f" for="${k}Dur">비행시간</label><input type="text" id="${k}Dur" value="${esc(x.dur||'')}" placeholder="2시간 30분"></div></div></div>`;
  openSheet(`${shHead('항공편 정보','입력하면 일정 첫날·마지막 날과 티켓 칸에 반영돼요')}
    <form id="flightForm" class="stack" novalidate>${row('o','가는 편 (DAY 1)',f.out)}${row('i',`오는 편 (DAY ${DAYS.length})`,f.in)}
    <button class="btn acc" type="submit">저장</button></form>`);
}
function saveFlights(){
  const v=id=>$('#'+id).value.trim();
  const g=k=>({fromCity:v(k+'From'),toCity:v(k+'To'),no:v(k+'No').toUpperCase(),dep:v(k+'Dep'),arr:v(k+'Arr'),dur:v(k+'Dur')||durText(spanMin(v(k+'Dep'),v(k+'Arr'))),term:v(k+'Term'),arrTerm:v(k+'ATerm')}),f=flights();
  const out={...f.out,...g('o')},inn={...f.in,...g('i')};
  applyFlights(out,inn);
  closeSheet();toast('항공편을 저장했어요. 둘 다에게 반영돼요.');render();
}
function applyFlights(out,inn){
  Sync.put('flights','trip',{out,in:inn});
  // keep airport stops in step with the flights
  const sub=(t,m)=>{const [h,mm]=t.split(':').map(Number),x=(h*60+mm-m+1440)%1440;return `${String(Math.floor(x/60)).padStart(2,'0')}:${String(x%60).padStart(2,'0')}`;};
  const d1=planOf(1),a1=d1.find(s=>isAir(s.p));if(a1&&out.arr){a1.t=out.arr;setPlan(1,d1);}
  const L=DAYS.length,dl=planOf(L),al=[...dl].reverse().find(s=>isAir(s.p));if(L>1&&al&&inn.dep){al.t=sub(inn.dep,150);al.dur='출발 2시간 30분 전 도착';setPlan(L,dl);}
}
/* ---------- tickets ---------- */
function ticketForm(t){
  const tf=t?{...t}:{type:'입장권',title:'',day:1,time:'',place:'',code:'',seat:'',memo:'',files:[]};
  if(!tf.dir&&tf.slot&&tf.slot.startsWith('flight-'))tf.dir=tf.slot.slice(7);
  // older tickets kept the reservation number and seat together as "code · seat"
  if(!tf.seat&&/ · /.test(tf.code||'')){const [c,...r]=tf.code.split(' · ');tf.code=c;tf.seat=r.join(' · ');}
  const fl={...(tf.dir&&tf.dir!=='etc'?flights()[tf.dir]:{}),...(tf.fl||{})},air=tf.type==='항공권',stay=tf.type==='숙소',st=tf.stay||{};
  if(stay&&!tf.place&&hotelId())tf.place=hotelId();
  state.tf={...tf,newFiles:[]};state.lastStay=tf.place||'';
  // people are the names already used on tickets (plus this phone's own), never account nicknames
  const names=[...new Set([...tickets().map(x=>x.pax),myPax(),tf.pax].filter(Boolean))];
  const seg=(attr,items,cur)=>`<div class="seg" role="group">${items.map(([k,l])=>`<button type="button" ${attr}="${esc(k)}" aria-pressed="${cur===k}">${esc(l)}</button>`).join('')}</div>`;
  const daySel=(id,cur)=>`<select id="${id}">${DAYS.map(d=>`<option value="${d.id}" ${cur===d.id?'selected':''}>DAY ${d.id}${d.date?' · '+dayDate(d.id):''}</option>`).join('')}</select>`;
  const inp=(id,label,val,ph,extra='')=>`<div><label class="f" for="${id}">${label}</label><input type="text" id="${id}" value="${esc(val||'')}" placeholder="${ph}" autocomplete="off" ${extra}></div>`;
  const tm=(id,label,val)=>`<div>${label?`<label class="f" for="${id}">${label}</label>`:''}<input type="time" id="${id}" value="${esc(val||'')}"${label?'':' aria-label="시각"'}></div>`;
  const CAPS='autocapitalize="characters"';
  openSheet(`${shHead(t&&t.id?'티켓 수정':'티켓 추가','')}
    <form id="ticketForm" class="tform stack" novalidate>
      ${seg('data-ttype',TICKET_TYPES.map(k=>[k,k]),tf.type)}
      <section class="fsec"><h4>누구 티켓</h4>
        ${seg('data-tpax',[['','함께'],...names.map(n=>[n,n]),['+','+ 다른 사람']],tf.pax||'')}
        <input type="text" id="tPax" value="${esc(tf.pax||'')}" placeholder="이름" maxlength="12" autocomplete="off" hidden></section>
      <section class="fsec" id="tFlight" ${air?'':'hidden'}><h4>항공편</h4>
        ${seg('data-tdir',Object.entries(DIRS),tf.dir||'')}
        <div class="two">${inp('tNo','편명',fl.no,'TW243',CAPS)}<div><label class="f" for="tDayA">날짜</label>${daySel('tDayA',tf.day)}</div></div>
        <div class="tleg"><span class="lg">출발</span><div class="three">${inp('tFrom','공항',fl.fromCity,'인천 ICN')}${tm('tDep','시각',fl.dep||tf.time)}${inp('tDepT','터미널',fl.term,'1')}</div></div>
        <div class="tleg"><span class="lg">도착</span><div class="three">${inp('tTo','공항',fl.toCity,'나리타 NRT')}${tm('tArr','시각',fl.arr)}${inp('tArrT','터미널',fl.arrTerm,'2')}</div></div>
        ${inp('tDur','비행시간',fl.dur,'비워 두면 시각으로 계산해요')}</section>
      <section class="fsec" id="tStayBox" ${stay?'':'hidden'}><h4>숙소</h4>
        <select id="tStay"></select>
        <button type="button" class="btn" data-newstay>${svg('search')}숙소 찾아서 등록</button>
        <div class="tleg"><span class="lg">체크인</span><div class="two"><div>${daySel('tInDay',st.inDay||tf.day||1)}</div>${tm('tInTime','',st.inTime||tf.time||'15:00')}</div></div>
        <div class="tleg"><span class="lg">체크아웃</span><div class="two"><div>${daySel('tOutDay',st.outDay||DAYS.length)}</div>${tm('tOutTime','',st.outTime||'11:00')}</div></div></section>
      <section class="fsec" id="tGen" ${air||stay?'hidden':''}><h4>정보</h4>
        ${inp('tTitle','이름',tf.title,'예: 시부야 스카이')}
        <div class="two"><div><label class="f" for="tDayG">날짜</label>${daySel('tDayG',tf.day)}</div>${tm('tTime','시간',tf.time)}</div>
        <div><label class="f" for="tPlace">장소</label><select id="tPlace"><option value="">선택 안 함</option>${Object.keys(PL).map(id=>`<option value="${id}" ${tf.place===id?'selected':''}>${esc(PL[id].n)}</option>`).join('')}</select></div></section>
      <section class="fsec"><h4>예약</h4>
        <div class="two">${inp('tCode','예약 번호',tf.code,'Q2TL65',CAPS)}${inp('tSeat','좌석',tf.seat,'4E',CAPS)}</div></section>
      <section class="fsec"><h4 id="tFilesH">${air?'탑승권 이미지':stay?'예약 확인서':'티켓 이미지'}</h4>
        <div id="tFiles" class="tfiles">${filesEditHTML()}</div>
        <label class="btn photo-btn">${svg('camera')}사진 · PDF 올리기<input type="file" id="tFileIn" accept="image/*,application/pdf" multiple></label></section>
      <section class="fsec"><h4>메모</h4>
        <input type="text" id="tMemo" value="${esc(tf.memo||'')}" placeholder="예: 위탁 수하물 15kg" autocomplete="off"></section>
      <p class="err" id="tErr" hidden></p>
      <button class="btn acc" type="submit">저장</button>
      ${t&&t.id?`<button class="btn ghost danger" type="button" data-delticket="${t.id}">티켓 삭제</button>`:''}
    </form>`);
  state.tf.id=t?t.id:null;state.tf.slot=t?t.slot:'';fillStays();
}
function filesEditHTML(){const tf=state.tf;return [...tf.files.map((f,i)=>`<div class="tfile"><span class="tfi">${f.mime==='application/pdf'?svg('file'):`<img data-file="${esc(f.path)}" alt="">`}</span><span>${esc(f.name||'파일')}</span><button type="button" data-rmfile="o${i}" aria-label="빼기">×</button></div>`),
  ...tf.newFiles.map((f,i)=>`<div class="tfile"><span class="tfi">${f.blob.type==='application/pdf'?svg('file'):`<img src="${f.url}" alt="">`}</span><span>${esc(f.name)}</span><button type="button" data-rmfile="n${i}" aria-label="빼기">×</button></div>`)].join('');}
async function saveTicket(){
  const tf=state.tf,err=$('#tErr'),air=tf.type==='항공권',stayT=tf.type==='숙소',v=id=>$('#'+id).value.trim();tf.day=+$(air?'#tDayA':stayT?'#tInDay':'#tDayG').value||1;
  const stay=stayT?{inDay:+v('tInDay'),inTime:v('tInTime'),outDay:+v('tOutDay'),outTime:v('tOutTime')}:null,stayId=stayT?v('tStay'):'';
  const fl=air?{no:v('tNo').toUpperCase(),fromCity:v('tFrom'),toCity:v('tTo'),dep:v('tDep'),arr:v('tArr'),dur:v('tDur')||durText(spanMin(v('tDep'),v('tArr'))),term:v('tDepT'),arrTerm:v('tArrT')}:null;
  // a flight's name is made from its airports and flight number, so it never needs typing
  const title=air?(fl.fromCity||fl.toCity||fl.no?flightLabel(fl):''):stayT?(stayId&&PL[stayId]?PL[stayId].n:''):v('tTitle');
  if(!title&&stayT){err.textContent='숙소를 고르거나 찾아서 등록해 주세요.';err.hidden=false;return;}
  if(!title&&air){err.textContent='편명이나 출발·도착 공항을 적어 주세요.';err.hidden=false;$('#tNo').focus();return;}
  if(!title){err.textContent='티켓 이름을 적어 주세요.';err.hidden=false;$('#tTitle').focus();return;}
  if(!tf.files.length&&!tf.newFiles.length&&!$('#tCode').value.trim()){err.textContent='사진·PDF를 올리거나 예약 번호를 적어 주세요.';err.hidden=false;return;}
  const files=[...tf.files];
  for(const f of tf.newFiles){const ext=(f.name.split('.').pop()||'').toLowerCase().slice(0,5)||(f.blob.type==='application/pdf'?'pdf':'jpg');
    try{files.push({path:await Sync.addFile(f.blob,ext),name:f.name,mime:f.blob.type||'image/jpeg'});}catch(e){err.textContent='이 휴대폰 저장 공간이 부족해 파일을 저장하지 못했어요.';err.hidden=false;return;}}
  const id=tf.id||uid(),dir=air?tf.dir||'':'';
  const slot=air&&(dir==='out'||dir==='in')?'flight-'+dir:stayT?'hotel':(tf.slot&&(tf.slot.startsWith('flight-')||tf.slot==='hotel')?'':tf.slot||'');
  Sync.put('ticket',id,{type:tf.type,title,day:tf.day,time:air?fl.dep:stayT?stay.inTime:$('#tTime').value,place:air?'':stayT?stayId:$('#tPlace').value,stay,code:v('tCode').toUpperCase(),seat:v('tSeat').toUpperCase(),pax:v('tPax'),memo:v('tMemo'),files,slot,dir,fl,at:tf.at||new Date().toISOString()});
  // a flight ticket for the way out or back also fills in the trip's flight info, which the schedule uses
  if(dir==='out'||dir==='in'){const f=flights();f[dir]={...f[dir],...fl};applyFlights(f.out,f.in);}
  if(stayT&&stayId&&trip().hotelId!==stayId){Sync.put('trip','info',{...trip(),hotelId:stayId});rebuild();}
  closeSheet();toast('티켓을 저장했어요. 인터넷이 없어도 열려요.');render();
}
const termText=x=>x?(/^\d+$/.test(x)?`터미널 ${x}`:x):'';
function stayBlock(t){const s=t.stay,p=PL[t.place],sg=t.place&&mainSign(t.place);
  return `<div class="ts-fl"><div class="ap"><span class="tt">체크인</span><span class="tm mono">${esc(s.inTime||'--:--')}</span><b>${dayDate(s.inDay||t.day)}</b></div>
    <div class="mid">${svg('bed')}<span>${s.outDay&&s.inDay?`${s.outDay-s.inDay}박`:''}</span></div>
    <div class="ap"><span class="tt">체크아웃</span><span class="tm mono">${esc(s.outTime||'--:--')}</span><b>${dayDate(s.outDay||DAYS.length)}</b></div></div>
    ${sg?`<div class="ts-code"><span class="k">택시 기사에게</span><span class="jp-big" lang="ja">${esc(sg[0])}</span></div>`:''}`;}
function flightBlock(t){const f=t.fl;
  return `<div class="ts-fl"><div class="ap"><span class="tm mono">${esc(f.dep||'--:--')}</span><b>${esc(f.fromCity||'출발')}</b><span class="tt">${esc(termText(f.term))}</span></div>
    <div class="mid">${svg('plane')}${f.no?`<b class="mono">${esc(f.no)}</b>`:''}<span>${esc(f.dur||durText(spanMin(f.dep,f.arr)))}</span></div>
    <div class="ap"><span class="tm mono">${esc(f.arr||'--:--')}</span><b>${esc(f.toCity||'도착')}</b><span class="tt">${esc(termText(f.arrTerm))}</span></div></div>`;}
const dayDate=d=>{const x=DAYS[d-1];return x&&x.date?`${fmtMD(x.date)}(${WEEK[x.date.getDay()]})`:`DAY ${d}`;};
const ticketKind=t=>t.type==='항공권'&&t.dir&&t.dir!=='etc'?DIRS[t.dir]:t.type;
function showTicket(id){
  const t=Sync.get('ticket',id);if(!t)return;const air=t.type==='항공권'&&t.fl&&(t.fl.fromCity||t.fl.toCity||t.fl.no);
  const files=(t.files||[]).map(f=>f.mime==='application/pdf'?`<a class="btn" data-pdf="${esc(f.path)}" href="#" target="_blank" rel="noopener">${svg('file')}${esc(f.name||'PDF')} 열기</a>`:`<img data-file="${esc(f.path)}" alt="${esc(t.title)} 티켓">`).join('');
  openOverlay(`<div class="tshow"><div class="ts-top"><div>${t.pax?`<div class="ts-pax">${esc(t.pax)}</div>`:''}<div class="k">${esc(ticketKind(t))} · ${t.type==='숙소'&&t.stay?`${dayDate(t.stay.inDay||t.day)} – ${dayDate(t.stay.outDay||DAYS.length)}`:dayDate(t.day)}${!air&&t.type!=='숙소'&&t.time?' · '+esc(t.time):''}</div>${air?'':`<b>${esc(t.title)}</b>`}</div>
      <div class="ts-btns"><button class="ov-x ts-edit" data-editticket="${esc(id)}" aria-label="티켓 수정">${svg('pen')}</button><button class="ov-x" data-closeov aria-label="닫기">×</button></div></div>
    ${air?flightBlock(t):''}${t.type==='숙소'&&t.stay?stayBlock(t):''}
    ${t.code||t.seat?`<div class="ts-codes">${t.code?`<div class="ts-code"><span class="k">예약 번호</span><span class="mono">${esc(t.code)}</span></div>`:''}${t.seat?`<div class="ts-code seat"><span class="k">좌석</span><span class="mono">${esc(t.seat)}</span></div>`:''}</div>`:''}
    ${files?`<div class="ts-files">${files}</div>`:''}
    ${t.memo?`<p class="ts-memo">${esc(t.memo)}</p>`:''}</div>`,true);
}
async function hydrateFiles(root){
  for(const img of root.querySelectorAll('img[data-file]')){const u=await Sync.fileURL(img.dataset.file);if(u)img.src=u;else{img.alt='오프라인이라 아직 못 받은 파일이에요';img.classList.add('missing');}}
  for(const a of root.querySelectorAll('a[data-pdf]')){const u=await Sync.fileURL(a.dataset.pdf);if(u)a.href=u;}
}
function syncText(){const s=Sync.status,n=Sync.dirtyCount();
  return {synced:'둘 다 같은 내용이에요',syncing:'맞추는 중…',offline:n?`오프라인 · ${n}개는 연결되면 보내요`:'오프라인 · 이 휴대폰에 저장됨',pending:`보낼 것 ${n}개`,error:'잠시 후 다시 맞춰요',signedout:'다시 로그인이 필요해요',idle:'준비 중'}[s]||s;}
const syncDot=()=>`<button class="syncdot s-${Sync.status}" data-settings aria-label="동기화 상태: ${syncText()}"><i></i>${Sync.status==='offline'?'오프라인':Sync.status==='synced'?'':Sync.status==='syncing'?'':'!'}</button>`;
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
function entryHTML(e,preview){
  return `<article class="card entry ${e.kind==='아기에게 편지'?'letter':''}">
    <div class="eh">${avatar(e.who)}<span class="nm">${esc(member(e.who).display_name)}</span><span class="tm mono">${esc(e.ts)}</span>${preview||e.who!==me()?'':`<button class="x" data-editd="${e.id}" aria-label="기록 수정">${svg('pen')}</button><button class="x" data-deld="${e.id}" aria-label="기록 삭제">×</button>`}</div>
    <span class="kind">${esc(e.kind)}</span>
    ${e.photo?`<img data-file="${esc(e.photo)}" alt="함께 올린 사진">`:''}
    ${e.text?`<div class="body">${esc(e.text)}</div>`:''}
    ${e.stk&&STK[e.stk]?stkSVG(e.stk,'sticker'):''}</article>`;
}
function viewDiary(){
  const f=state.dform,ds=diary(),letters=ds.filter(e=>e.kind==='아기에게 편지').length,order=[...ds].reverse(),groups=[...DAYS.map(d=>d.id).reverse(),0].map(d=>[d,order.filter(e=>e.day===d)]).filter(([,a])=>a.length);
  const ph={'한 줄 일기':'오늘 어땠어요?','아기에게 편지':'아가에게 들려주고 싶은 이야기','맛있었던 것':'무엇을 먹었고 어땠는지'}[f.kind];
  return `<section class="view">
    <div class="dhead"><h2>함께 쓰는<br>${esc(trip().city||'여행')} 여행 일기</h2><div class="dstats"><span>기록 <b>${ds.length}</b>개</span><span>아기에게 쓴 편지 <b>${letters}</b>통</span></div></div>
    <form class="card compose" id="diaryForm" novalidate>
      <div class="who">${avatar(me())}<b>${esc(member(me()).display_name)}</b><span class="fine">로 남겨요</span></div>
      <div class="kinds" role="group" aria-label="종류">${KINDS.map(k=>`<button type="button" data-kind="${k}" aria-pressed="${f.kind===k}">${k}</button>`).join('')}</div>
      <textarea id="diaryText" placeholder="${ph}" aria-label="내용"></textarea>
      ${f.edit?`<p class="fine" style="margin:0">기록을 고치는 중이에요</p>`:''}${f.photoURL||f.keepPhoto?`<div class="preview"><img ${f.photoURL?`src="${f.photoURL}"`:`data-file="${esc(f.keepPhoto)}"`} alt="올릴 사진 미리보기"><button type="button" data-nophoto aria-label="사진 빼기">×</button></div>`:''}
      <div class="stickers" role="group" aria-label="스티커">${Object.keys(STK).map(k=>`<button type="button" class="stk" data-stk="${k}" aria-pressed="${f.stk===k}" aria-label="${STKNAME[k]} 스티커">${stkSVG(k)}</button>`).join('')}</div>
      <div class="dpick" role="group" aria-label="날짜">${dayOpts().map(([v,l])=>`<button type="button" data-dday="${v}" aria-pressed="${f.day===v}">${l}</button>`).join('')}</div>
      ${state.derr?`<p class="err">${state.derr}</p>`:''}
      <div style="display:flex;gap:8px"><label class="btn photo-btn" style="flex:none">${svg('camera')}사진<input type="file" accept="image/*" id="photoIn" aria-label="사진 고르기"></label>${f.edit?`<button class="btn" type="button" data-canceld style="flex:none">취소</button>`:''}<button class="btn acc" type="submit" style="flex:1">${svg('pen')}${f.edit?'수정 저장':'기록 남기기'}</button></div>
    </form>
    <div class="feed">${groups.map(([d,a])=>`<h3 class="fday" style="--c:var(${d?dayOf(d).c:'--mute'})"><i></i>${d?`DAY ${d} · ${dayOf(d).label}`:'여행 전'}</h3>${a.map(e=>entryHTML(e)).join('')}`).join('')||'<p class="fine" style="text-align:center;padding:20px 0">아직 기록이 없어요. 첫 기록을 남겨 보세요.</p>'}</div>
  </section>`;
}
function viewMoney(){
  const t=totals(),f=state.form,ex=expenses(),groups=[0,...DAYS.map(d=>d.id)].map(d=>[d,ex.filter(e=>e.day===d)]).filter(([,a])=>a.length),st=settings(),pct=Math.min(100,t.sum/st.budget*100);
  return `<section class="view">
    <div class="sum"><div><div class="k">총 지출 (원화 환산)</div><div class="big">${won(t.sum)}</div><div class="yen">엔화 지출 ${yen(ex.filter(e=>e.cur==='JPY').reduce((a,e)=>a+e.amt,0))}</div></div>
      <div class="bar"><i style="width:${pct}%;background:#fff"></i></div>
      <div class="row"><label for="budgetIn">예산 <input id="budgetIn" inputmode="numeric" value="${st.budget.toLocaleString('ko-KR')}"> 원</label><span>남은 돈 ${won(Math.max(0,st.budget-t.sum))}</span></div></div>
    ${t.sum?`<div><div class="sec-h"><h2>분류별</h2></div>${catBar(t,t.sum)}<div class="cats" style="margin-top:10px">${Object.keys(XCAT).filter(k=>t.by[k]).map(k=>`<span style="--c:var(${XCAT[k]})"><i></i>${k} <b>${Math.round(t.by[k]/t.sum*100)}%</b></span>`).join('')}</div></div>`:''}
    <form class="card form" id="expForm" novalidate><div class="sec-h" style="margin:0"><h2>${f.editX?'지출 수정':'지출 기록'}</h2></div>
      <div class="amt"><input id="amtIn" inputmode="decimal" placeholder="0" aria-label="금액"><div class="cur" role="group" aria-label="통화"><button type="button" data-cur="JPY" aria-pressed="${f.cur==='JPY'}">¥</button><button type="button" data-cur="KRW" aria-pressed="${f.cur==='KRW'}">₩</button><button type="button" data-cur="USD" aria-pressed="${f.cur==='USD'}">$</button></div></div>
      <div><label class="f">분류</label><div class="catpick">${Object.keys(XCAT).map(k=>`<button type="button" data-xcat="${k}" aria-pressed="${f.cat===k}" style="--c:var(${XCAT[k]})"><i></i>${k}</button>`).join('')}</div></div>
      <div><label class="f">날짜</label><div class="catpick">${dayOpts().map(([v,l])=>`<button type="button" data-xday="${v}" aria-pressed="${f.day===v}">${l}</button>`).join('')}</div></div>
      <div><label class="f" for="titleIn">내용</label><input type="text" id="titleIn" placeholder="예: 소라마치 저녁"></div>
      ${state.err?`<p class="err">${state.err}</p>`:''}${f.editX?`<div style="display:flex;gap:8px"><button class="btn" type="button" data-cancelx style="flex:none">취소</button><button class="btn pri" type="submit" style="flex:1">${svg('pen')}수정 저장</button></div>`:`<button class="btn pri" type="submit">${svg('plus')}기록하기</button>`}</form>
    <div>${groups.map(([d,a])=>`<div class="ex-day"><h3>${d?`DAY ${d} · ${dayOf(d).label}`:'여행 전'}<span>${won(a.reduce((s,e)=>s+toKRW(e),0))}</span></h3>
      ${a.map(e=>`<div class="ex" style="--c:var(${XCAT[e.cat]})"><span class="ci"></span><div class="m"><b>${esc(e.title)}</b><div class="s">${e.cat} · ${esc(member(e.who).display_name)}</div></div><div class="v">${e.cur==='JPY'?yen(e.amt):e.cur==='USD'?usd(e.amt):won(e.amt)}${e.cur!=='KRW'?`<small>${won(toKRW(e))}</small>`:''}</div><button class="x" data-editx="${e.id}" aria-label="수정">${svg('pen')}</button><button class="x" data-delx="${e.id}" aria-label="삭제">×</button></div>`).join('')}</div>`).join('')||'<p class="fine">아직 지출 기록이 없어요.</p>'}</div>
    <p class="fine">${ex.some(e=>e.cur==='USD')?`달러는 1달러당 ${Math.round(usdRate()).toLocaleString('ko-KR')}원, `:''}엔화는 100엔당 ${Math.round(rate()*100)}원으로 계산해요. 홈의 환율에서 바꾸면 둘 다 같은 환율로 바뀌어요.</p></section>`;
}
/* ===================== views ===================== */
const startDate=()=>parseDate(trip().start);
const daysUntil=()=>{const s=startDate();if(!s)return null;const t=new Date();t.setHours(0,0,0,0);return Math.round((s-t)/86400000);};
const ddayTxt=()=>{const n=daysUntil();if(n==null)return '날짜 미정';return n>0?`D-${n}`:n>-DAYS.length?`여행 ${1-n}일차`:'다녀옴';};
const fmtMD=d=>`${d.getMonth()+1}.${String(d.getDate()).padStart(2,'0')}`;
const rangeText=()=>{const a=DAYS[0],b=DAYS[DAYS.length-1];return a&&a.date?`${fmtMD(a.date)}(${WEEK[a.date.getDay()]}) – ${fmtMD(b.date)}(${WEEK[b.date.getDay()]}) · ${DAYS.length-1}박 ${DAYS.length}일`:`${DAYS.length-1}박 ${DAYS.length}일 · 날짜 미정`;};
const shortRange=()=>{const a=DAYS[0],b=DAYS[DAYS.length-1];return a&&a.date?`${fmtMD(a.date)} – ${b.date.getDate()}`:'미정';};
const INTRO_DEFAULT='엄마 아빠 딱복이랑\n떠나는 첫 비행';
const introLine=()=>{const t=(trip().intro||(tripInfo()?'':INTRO_DEFAULT)).trim();return t?t.split('\n').map(esc).join('<br>'):`${esc(whenPhrase())},<br>${esc(trip().city||'여행')}에 가요`;};
const whenPhrase=()=>{const s=startDate();if(!s)return '곧';const n=new Date();const diff=(s.getFullYear()-n.getFullYear())*12+s.getMonth()-n.getMonth();return diff<=0?'이번 달':diff===1?'다음 달':`${s.getMonth()+1}월`;};
const admitText=()=>{const names=Sync.members.map(m=>m.display_name);const baby=/태교/.test(trip().title);const all=[...names,...(baby?['아가']:[])];return all.length?`ADMIT ${all.length} · ${all.join(' · ')}`:'BOARDING PASS';};
const TITLES={fav:'즐겨찾기',plan:'일정',tickets:'티켓',diary:'우리의 기록',money:'가계부',places:'장소',prep:'준비물 · 연락처'};
function header(){
  if(state.tab==='auth'||state.tab==='onboard')return `<h1>여행 같이 쓰기</h1>`;
  if(state.tab==='places')return `<button class="back" data-tab="home" aria-label="홈으로">${svg('back')}</button><h1>장소</h1>${syncDot()}<button class="btn sm acc" data-newplace="0">${svg('plus')}찾기</button>`;
  if(state.tab==='prep')return `<button class="back" data-tab="home" aria-label="홈으로">${svg('back')}</button><h1>${TITLES.prep}</h1>${syncDot()}`;
  const right=state.tab==='plan'?`<button class="btn sm ${state.edit?'pri':''}" data-edit>${state.edit?'완료':'편집'}</button>`:state.tab==='fav'?`<button class="btn sm acc" data-addfav>${svg('plus')}추가</button>`:state.tab==='tickets'?`<button class="btn sm acc" data-addticket>${svg('plus')}추가</button>`:state.tab==='home'?`<span class="dday">${ddayTxt()}</span>`:'';
  return `<h1>${state.tab==='home'?esc(trip().title):TITLES[state.tab]}</h1>${syncDot()}${right}`;
}
function viewHome(){
  const all=prepItems().length,t=totals(),ds=diary(),last=ds[ds.length-1],checks=checkSet(),T=trip(),h=hotelId();
  const today=(()=>{const n=daysUntil();return n!=null&&n<=0&&n>-DAYS.length?1-n:1;})(),first=planOf(today).slice(0,4);
  const nPlaces=Object.keys(PL).length,nStops=DAYS.reduce((a,d)=>a+planOf(d.id).length,0);
  return `<section class="view">
    <div class="hero">${heroArt()}<div class="in"><h2>${esc(T.title)}</h2><p><span class="mono">${esc(rangeText())}</span>${T.city?' · '+esc(T.city):''}${h?' · '+esc(PL[h].n):''}</p></div></div>
    ${installCard()}
    ${nStops?`<div class="mapthumb" data-map="home" data-tab="plan" role="button" tabindex="0" aria-label="전체 동선 지도, 일정으로 이동"><div class="lmap"></div><span class="mlegend">${DAYS.slice(0,4).map(d=>`<span style="--c:var(${d.c})"><i></i>DAY ${d.id}</span>`).join('')}</span><span class="open">일정 보기</span></div>`:''}
    <div><div class="sec-h"><h2>여행 필수 기능</h2></div><div class="tools">
      <button class="tool" data-tool="talk" style="--tc:#e6e6fd"><span class="ti">${svg('talk','')}</span><b>일본어 회화</b><small>듣기 · 크게 보여주기</small></button>
      <button class="tool" data-tab="places" style="--tc:#e0f1e8"><span class="ti">${svg('grid','')}</span><b>장소 · 간판</b><small>${nPlaces}곳 등록</small></button>
      <button class="tool" data-tool="home" style="--tc:#ffe1e6"><span class="ti">${svg('home','')}</span><b>숙소 가는 길</b><small>${h?'지금 위치에서':'숙소 미정'}</small></button>
      <button class="tool" data-tool="rate" style="--tc:#dff3e8"><span class="ti">${svg('yen','')}</span><b>환율</b><small>¥1,000 ≈ ${won(1000*rate())}</small></button>
      <button class="tool" data-tool="weather" style="--tc:#fff1c7"><span class="ti">${svg('sun','')}</span><b>날씨</b><small>${esc(T.city||'여행지')} 예보</small></button>
      <button class="tool" data-tab="prep" style="--tc:#f1e3fb"><span class="ti">${svg('list','')}</span><b>준비물</b><small>${[...checks].length}/${all} 완료</small></button></div></div>
    <div><div class="sec-h"><h2>티켓</h2><button class="more" data-tab="tickets">티켓 지갑 ${svg('chev')}</button></div>
      <div class="card">${slotStatus().map(s=>{const f=s.dir?flights()[s.dir]:null,air=f&&(f.no||f.fromCity||f.toCity);
        return `<button class="rsv-row${s.t?'':' need'}" ${s.t?`data-showticket="${s.t.id}"`:`data-slot="${esc(s.slot)}"`}><span class="ri">${svg(s.type==='항공권'?'plane':s.type==='숙소'?'bed':'ticket','')}</span><span class="m">${air?`<span class="s">${DIRS[s.dir]} · ${dayDate(s.day)}</span>${flightLine(f)}`:`<b>${esc(s.t?s.t.title:s.title)}</b><span class="s">${dayDate(s.day)}${(s.t&&s.t.time||s.time)?' · '+esc(s.t&&s.t.time||s.time):''}</span>`}</span>${air&&f.no?`<span class="r mono">${esc(f.no)}</span>`:''}${s.t?'':'<span class="r add">+ 추가</span>'}</button>`;}).join('')}</div></div>
    ${first.length?`<div><div class="sec-h"><h2>DAY ${today} · ${esc(dayOf(today).label)}</h2><button class="more" data-tab="plan" data-day="${today}">전체 일정 ${svg('chev')}</button></div>
      <div>${first.map(s=>{const p=PL[s.p],sg=mainSign(s.p);return `<div class="mini"><span class="t">${s.t||'--:--'}</span><span class="n">${esc(s.title||p.n)}</span>${sg?`<span class="jp-s" lang="ja">${esc(sg[0])}</span>`:''}</div>`;}).join('')}</div></div>`:''}
    <div><div class="sec-h"><h2>가계부</h2><button class="more" data-tab="money">기록하기 ${svg('chev')}</button></div>
      <button class="card budget" data-tab="money"><span class="fine">지금까지 쓴 돈</span><span class="big">${won(t.sum)}</span>${catBar(t,Math.max(t.sum,settings().budget))}<span class="fine">예산 ${won(settings().budget)} 중 ${Math.round(t.sum/settings().budget*100)}%</span></button></div>
    <button class="btn ghost" data-settings>${svg('gear')}우리 여행 · 초대 코드 · 동기화</button>
  </section>`;
}
function viewPlan(){
  if(state.day>DAYS.length)state.day=1;
  const d=state.day,day=dayOf(d),st=planOf(d),nums=numbered(d),fi=flights(),L=DAYS.length,tk=tickets();
  const fl=d===1?{f:fi.out,slot:'flight-out'}:(d===L&&L>1)?{f:fi.in,slot:'flight-in'}:null;
  const legs=[];for(let i=0;i<st.length-1;i++)legs.push(leg(st[i].p,st[i+1].p,st[i+1].move));
  const tot=legs.filter(l=>l&&l.min).reduce((a,l)=>a+l.min,0);
  const ft=fl&&tk.find(t=>t.slot===fl.slot);
  const flightRow=fl?`<button class="flight" ${ft?`data-showticket="${ft.id}"`:`data-slot="${fl.slot}"`}>${svg('plane')}<span class="m">${fl.f.no||fl.f.fromCity?`${flightLine(fl.f)}<span class="s">${esc([fl.f.no,DIRS[fl.slot==='flight-out'?'out':'in'],fl.f.dur].filter(Boolean).join(' · '))}</span>`:'<b>항공권 추가</b>'}</span>${svg('chev')}</button>`:'';
  let list='';
  st.forEach((s,i)=>{
    const p=PL[s.p],n=nums.indexOf(s.p)+1,home=isStay(s.p),air=isAir(s.p),sg=mainSign(s.p),stk=tk.filter(t=>t.place===s.p&&t.day===d&&t.type!=='항공권'),c=CAT[p.cat]||CAT['기타'];
    if(i>0){const l=legs[i-1];if(l){const b=p,a=PL[st[i-1].p],[hn,mode]=HOW[l.how]||HOW.train;
      list+=`<li class="stop" style="--c:var(${day.c})"><div class="rail"></div><div class="body">${state.edit?`<div class="leg-edit"><label class="f" for="mv${i}">이동</label><select id="mv${i}" data-movehow="${i}"><option value="">자동 (거리로 추정)</option>${Object.entries(HOW).filter(([k])=>k!=='subway').map(([k,v])=>`<option value="${k}" ${s.move&&s.move.how===k?'selected':''}>${v[0]}</option>`).join('')}<option value="subway" ${s.move&&s.move.how==='subway'?'selected':''}>지하철</option></select><input type="number" inputmode="numeric" min="0" max="600" id="mvm${i}" data-movemin="${i}" value="${s.move&&s.move.min?s.move.min:''}" placeholder="분" aria-label="이동 시간(분)"><input type="text" id="mvn${i}" data-movenote="${i}" value="${esc(s.move&&s.move.note||'')}" placeholder="메모 (예: 한조몬선 4정거장)" aria-label="이동 메모"></div>`
        :`<div class="leg"><span class="how">${svg(legIcon(l.how))}${hn}</span>${l.min?`<span class="min">${l.min}분</span>`:''}<a href="${placeDir(hasLL(st[i-1].p)?a.ll:placeQ(st[i-1].p),s.p,mode)}" target="_blank" rel="noopener">${svg('nav')}길찾기</a>${l.note?`<span class="lnote">${esc(l.note)}</span>`:''}</div>`}</div></li>`;}}
    const mark=home?`<span class="num home">숙소</span>`:air?`<span class="num air">${svg('plane','')}</span>`:`<span class="num">${n}</span>`;
    list+=`<li class="stop" style="--c:var(${day.c})"><div class="rail">${mark}</div><div class="body">
      ${state.edit?`<div class="stop-edit"><b>${esc(s.title||p.n)}</b><div class="se-row"><input type="time" data-stoptime="${i}" value="${esc(s.t||'')}" aria-label="시작 시간"><input type="text" data-stopdur="${i}" value="${esc(s.dur||'')}" placeholder="머무는 시간 (예: 1시간)" aria-label="머무는 시간"></div>
          <input type="text" data-stoptitle="${i}" value="${esc(s.title||'')}" placeholder="일정 이름 (비우면 장소 이름)" aria-label="일정 이름"></div>
        <div class="memo">${svg('memo','')}<textarea data-memo="${i}" aria-label="메모" placeholder="메모를 남겨 보세요">${esc(s.memo||'')}</textarea></div>
        <div class="edit-ctl"><button data-mv="${i}|-1" ${i===0?'disabled':''} aria-label="위로">${svg('up')}</button><button data-mv="${i}|1" ${i===st.length-1?'disabled':''} aria-label="아래로">${svg('down')}</button><button class="del" data-del="${i}">${svg('x')}빼기</button></div>`
      :`<button class="stop-card" data-place="${s.p}"><div class="nm">${esc(s.title||p.n)}</div>
        <div class="meta"><span class="cat" style="--c:var(${c.c})">${esc(p.cat)}</span>${(()=>{const jp=(sg&&sg[0])||p.jp||'',nm=s.title&&s.title!==p.n?p.n:'';return nm||jp?`<span>${esc(nm)}${jp?`${nm?' ':''}<span class="jp-p" lang="ja" translate="no">(${esc(jp)})</span>`:''}</span>`:'';})()}</div>
        <div class="when"><b>${s.t||'시간 미정'}</b>${s.dur?`<span>${esc(s.dur)}</span>`:''}</div></button>

        ${s.memo?`<div class="memo">${svg('memo','')}<span>${esc(s.memo)}</span></div>`:''}`}</div></li>`;
  });
  return `<section class="view">
    <div class="seg ${DAYS.length<=3?'days':''}" role="group" aria-label="날짜">${DAYS.map(x=>`<button class="pill" style="--c:var(${x.c})" data-day="${x.id}" aria-pressed="${x.id===d}"><span><i style="margin-right:5px;vertical-align:1px"></i>DAY ${x.id}</span><small>${esc(x.label)}</small></button>`).join('')}</div>
    ${nums.length||st.some(s=>hasLL(s.p))?`<div>${mapBox('plan','plan',mapCfg('plan'))}<div class="mleg"><span><i></i>전철·버스</span><span><i class="taxi"></i>택시</span><span><i class="walk"></i>도보</span><span class="fine">선은 순서만 이어 줘요. 정확한 길은 '길찾기'로</span></div></div>`:''}
    <div><div class="day-h" style="--c:var(${day.c})"><span class="dn">DAY ${d}</span>${state.edit?`<input type="text" class="day-title" data-daytitle="${d}" value="${esc(day.title)}" placeholder="이날의 제목 (예: 아사쿠사 · 스카이트리)" aria-label="DAY ${d} 제목">`:`<h2>${esc(day.title||'일정')}</h2>`}<span class="date">${esc(day.label)}</span></div>
      <p class="fine">${st.length?`장소 ${nums.length}곳${tot?` · 이동 약 ${tot}분`:''}`:'아직 이날 일정이 없어요. 아래에서 장소를 넣어 보세요.'}${state.edit?' · 바꾼 내용은 둘 다에게 보여요':''}</p></div>
    <div>${fl&&d===1?flightRow:''}<ol class="stops">${list}</ol>${fl&&d!==1?flightRow:''}
      <div class="addrow"><button class="btn acc" data-pick="${d}">${svg('plus')}장소 넣기</button>${state.edit?`<button class="btn" data-edit>완료</button>`:`<button class="btn ghost" data-edit>${svg('pen')}시간 · 순서 편집</button>`}</div></div>
  </section>`;
}
function placeList(){const s=savedSet();return Object.keys(PL).filter(id=>(state.sCat==='전체'||PL[id].cat===state.sCat)&&(!state.sOnly||s.has(id))).sort((a,b)=>CAT_LIST.indexOf(PL[a].cat)-CAT_LIST.indexOf(PL[b].cat));}
/* ===================== favorites: places found but not yet put in the schedule ===================== */
// Google's live details for a saved place (rating, type, price, open now, photos), kept on the phone for a few hours
const GPI_FIELDS='rating,userRatingCount,primaryTypeDisplayName,priceRange,currentOpeningHours.openNow,currentOpeningHours.nextOpenTime,currentOpeningHours.nextCloseTime,photos.name,googleMapsUri';
async function placeInfo(gid,force){const k='gpi:'+gid,c=LS.get(k,null);if(c&&!force&&Date.now()-c.at<4*3600000)return c.d;if(!navigator.onLine)return c?c.d:null;
  try{const r=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(gid)}?languageCode=ko`,{headers:{'X-Goog-Api-Key':GMAPS_KEY,'X-Goog-FieldMask':GPI_FIELDS}});if(!r.ok)return c?c.d:null;
    const d=await r.json();LS.set(k,{at:Date.now(),d});return d;}catch(e){return c?c.d:null;}}
const gPhoto=(name,w)=>`https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w||480}&key=${GMAPS_KEY}`;
const tkyTime=iso=>new Date(iso).toLocaleTimeString('ko-KR',{hour:'numeric',minute:'2-digit',timeZone:'Asia/Tokyo'});
const tkyDay=d=>new Date(d).toLocaleDateString('ko-KR',{weekday:'short',timeZone:'Asia/Tokyo'});
function openText(o){if(!o)return '';
  if(o.openNow)return `<span class="op on">영업 중</span>${o.nextCloseTime?` · ${tkyTime(o.nextCloseTime)}에 영업 종료`:''}`;
  return `<span class="op off">영업 종료</span>${o.nextOpenTime?` · ${tkyDay(o.nextOpenTime)!==tkyDay(Date.now())?tkyDay(o.nextOpenTime)+' ':''}${tkyTime(o.nextOpenTime)}에 영업 시작`:''}`;}
const priceText=pr=>{if(!pr||!pr.startPrice)return '';const a=+pr.startPrice.units,b=pr.endPrice&&+pr.endPrice.units;return '¥'+a.toLocaleString('ko-KR')+(b?'~'+b.toLocaleString('ko-KR'):'~');};
const stars=r=>`<span class="stars" aria-label="별점 ${r}"><i style="width:${(r/5*100).toFixed(0)}%"></i></span>`;
function gcardInner(id,d){const p=PL[id],c=CAT[p.cat]||CAT['기타'];
  const type=(d&&d.primaryTypeDisplayName&&d.primaryTypeDisplayName.text)||p.d||'',pr=d&&priceText(d.priceRange);
  return `<div class="gc-top"><b>${esc(p.n)}</b><span class="gc-cat" style="--c:var(${c.c})">${esc(p.cat)}</span></div>
    ${d&&d.rating?`<div class="gc-r"><span>${d.rating.toFixed(1)}</span>${stars(d.rating)}<span class="cnt">(${(d.userRatingCount||0).toLocaleString('ko-KR')}개)</span></div>`:''}
    <div class="gc-t">${esc([type,pr].filter(Boolean).join(' · '))}</div>
    ${d&&d.currentOpeningHours?`<div class="gc-o">${openText(d.currentOpeningHours)}</div>`:''}
    ${d&&d.photos&&d.photos.length?`<div class="gc-ph">${d.photos.slice(0,4).map(ph=>`<img loading="lazy" src="${gPhoto(ph.name)}" alt="">`).join('')}</div>`:!d&&navigator.onLine?'<div class="gc-ph wait"><i></i><i></i><i></i></div>':''}`;}
/* ===================== favorites: places found but not yet put in the schedule ===================== */
function viewFav(){
  const ids=[...savedSet()].filter(id=>PL[id]);
  setTimeout(fillFavCards,0);
  return `<section class="view">
    ${ids.length?`<p class="fine">누르면 구글 지도에서 자세한 정보와 길찾기를 볼 수 있어요. 길게 누르면 빼요. 일정에는 일정 탭의 「장소 넣기」로 넣어요.</p>
    <div class="favs">${ids.map(id=>{const p=PL[id],c0=p.gid&&LS.get('gpi:'+p.gid,null);
      return `<a class="card gcard" href="${placeSearch(id)}" target="_blank" rel="noopener" data-gcard="${id}" data-hold="${id}" data-holdkind="fav">${gcardInner(id,c0&&c0.d)}</a>`;}).join('')}</div>`
    :`<div class="card empty-fav"><b>아직 즐겨찾기가 없어요</b><p class="fine">오른쪽 위 「추가」에 구글 지도 공유 링크를 붙여 넣거나 장소 이름을 쓰면 여기 모여요. 나중에 하나씩 일정에 넣으면 돼요.</p><button class="btn acc" data-addfav>${svg('plus')}추가</button></div>`}
  </section>`;
}
// fills each card with Google's details, a few at a time
async function fillFavCards(){const cards=[...document.querySelectorAll('[data-gcard]')];let k=0;
  const work=async()=>{while(k<cards.length){const el=cards[k++],id=el.dataset.gcard,p=PL[id];if(!p||!p.gid)continue;
    const d=await placeInfo(p.gid);if(d&&el.isConnected){el.innerHTML=gcardInner(id,d);if(d.googleMapsUri)el.href=d.googleMapsUri;}}};
  await Promise.all([work(),work(),work()]);}
function addFavPop(){
  floatPop(`<div class="fp-h"><b>즐겨찾기 추가</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div>
    <form class="fp-form" data-addform="fav"><input type="text" placeholder="구글 지도 공유 링크 또는 장소 이름" autocomplete="off" aria-label="링크 또는 이름"><button class="btn acc" type="submit">찾기</button></form>
    <p class="fine" id="fpMsg">구글 지도 앱에서 「공유 → 링크 복사」한 걸 붙여 넣으면 돼요.</p>`);}
// a Google Maps share link is opened on our server (browsers can't follow it), then read for the place name and position
async function readMapsLink(link){
  const {data,error}=await Sync.sb.functions.invoke('maps-link',{body:{url:link}});
  if(error||!data||!data.url)throw new Error('link');
  const u=data.url,m=/\/maps\/place\/([^/@?]+)/.exec(u),q=new URL(u).searchParams.get('q')||new URL(u).searchParams.get('query');
  let name=m?decodeURIComponent(m[1].replace(/\+/g,' ')):(q&&!/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(q)?q:'');
  return {name,ll:parseMapsLink(u),url:u};}
async function addFavFrom(text){
  const msg=$('#fpMsg'),say=m=>{if(msg)msg.textContent=m;};
  let q=text,ll=null;
  if(/^https?:\/\//.test(text)){
    if(!navigator.onLine){say('링크를 읽으려면 인터넷이 필요해요.');return;}
    say('링크를 읽는 중…');
    try{const r=await readMapsLink(text);q=r.name;ll=r.ll;}catch(e){say('이 링크를 읽지 못했어요. 장소 이름으로 찾아 주세요.');return;}
    if(!q&&ll){closeFloat();state.favMode=true;placeForm({n:'',ll},0);return;}
    if(!q){say('이 링크에서 장소를 찾지 못했어요. 장소 이름으로 찾아 주세요.');return;}
  }
  closeFloat();state.favMode=true;searchSheet(0);const i=$('#searchQ');if(i)i.value=q;runSearch(q);
}
function viewPlaces(){
  const cats=['전체',...CAT_LIST],list=placeList(),saved=savedSet();
  return `<section class="view"><div style="display:flex;flex-direction:column;gap:10px">
      <div class="seg">${cats.map(c=>`<button class="pill" data-scat="${c}" aria-pressed="${state.sCat===c}" ${c!=='전체'?`style="--c:var(${CAT[c].c})"`:''}>${c!=='전체'?'<i></i>':''}${c}</button>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><button class="pill" data-sonly aria-pressed="${state.sOnly}">${svg('heart')}저장한 곳만 · ${saved.size}</button>
        <div class="vt" role="group" aria-label="보기 방식"><button data-sview="list" aria-pressed="${state.sView==='list'}">목록</button><button data-sview="map" aria-pressed="${state.sView==='map'}">지도</button></div></div></div>
    ${state.sView==='map'?mapBox('places','places',mapCfg('places')):''}
    <div>${list.length?list.map(id=>{const p=PL[id],sg=mainSign(id),inPlan=DAYS.filter(d=>planOf(d.id).some(s=>s.p===id)).map(d=>d.id);
      return `<div class="place-row">${thumb(id)}<button class="m" data-place="${id}"><h4>${esc(p.n)}</h4>${sg?`<div class="jp-line"><span lang="ja">${esc(sg[0])}</span>${sg[1]?` <span class="kana" lang="ja">${esc(sg[1])}</span>`:''}</div>`:`<div class="fine">${esc(p.cat)}${p.area?' · '+esc(p.area):''}</div>`}<div class="tags">${safeChip(p)}${inPlan.map(d=>`<span class="chip" style="color:var(${dayOf(d).c})">DAY ${d}</span>`).join('')}</div></button>
        <div class="pr-acts">${sg?`<button class="icon-btn sm" data-say="${esc(sg[0])}" aria-label="${esc(p.n)} 일본어로 듣기">${svg('speak')}</button>`:''}<button class="heart" data-heart="${id}" aria-pressed="${saved.has(id)}" aria-label="저장">${svg('heart','')}</button></div></div>`;}).join('')
      :`<div class="card setup"><b>${Object.keys(PL).length?'이 조건에 맞는 장소가 없어요':'아직 등록한 장소가 없어요'}</b><p class="fine">가고 싶은 곳을 찾아 등록하면 일본어 간판 이름과 위치가 함께 들어와요.</p><button class="btn acc" data-newplace="0">${svg('search')}장소 찾기</button></div>`}</div>
    <div class="note"><h4>메뉴로 고를 때 주의할 음식</h4><ul><li>회전초밥은 장어·계란말이·새우튀김·유부초밥 같은 익힌 접시만</li><li>아마자케는 쌀누룩(米麹) 표시만. 술지게미(酒粕) 것은 알코올이 있어요</li><li>편의점 반숙 달걀, 생햄 샌드위치는 피하기</li></ul></div></section>`;
}
function viewTickets(){
  const all=tickets(),names=[...new Set(all.map(t=>t.pax).filter(Boolean))],sel=state.tpax===null?myPax():state.tpax,who=names.includes(sel)?sel:'';
  const tk=who?all.filter(t=>!t.pax||t.pax===who):all,slots=slotStatus().filter(s=>!s.t),f=flights();
  const card=t=>{const img=(t.files||[]).find(x=>x.mime!=='application/pdf'),f=t.fl,air=t.type==='항공권'&&f&&(f.fromCity||f.toCity||f.no);
    const top=`<span class="k">${t.pax?`<span class="tpax">${esc(t.pax)}</span>`:''}${esc(ticketKind(t))} · ${t.type==='숙소'&&t.stay?`${dayDate(t.stay.inDay||t.day)} – ${dayDate(t.stay.outDay||DAYS.length)}`:dayDate(t.day)}${!air&&t.type!=='숙소'&&t.time?' · '+esc(t.time):''}</span>`;
    if(air){const a=apCode(f.fromCity)||f.fromCity||'출발',z=apCode(f.toCity)||f.toCity||'도착',sub=[f.no,t.seat&&'좌석 '+t.seat].filter(Boolean).join(' · ');
      return `<button class="card tcard air" data-showticket="${t.id}"><span class="m">${top}<span class="route"><b>${esc(a)}</b><span class="mono">${esc(f.dep||'')}</span><span class="to">→</span><b>${esc(z)}</b><span class="mono">${esc(f.arr||'')}</span></span>${sub?`<span class="s mono">${esc(sub)}</span>`:''}</span></button>`;}
    return `<button class="card tcard" data-showticket="${t.id}">${img?`<span class="tc-thumb"><img data-file="${esc(img.path)}" alt=""></span>`:''}<span class="m">${top}<b>${esc(t.title)}</b>${t.code||t.seat?`<span class="s mono">${esc([t.code,t.seat&&'좌석 '+t.seat].filter(Boolean).join(' · '))}</span>`:''}</span></button>`;};
  return `<section class="view">
    ${names.length>1?`<div class="catpick paxpick" role="group" aria-label="누구 티켓">${['',...names].map(n=>`<button type="button" data-tpaxf="${esc(n)}" aria-pressed="${who===n}">${n?esc(n):'전체'}</button>`).join('')}</div>`:''}
    ${TICKET_TYPES.map(ty=>{const a=tk.filter(t=>t.type===ty),need=slots.filter(s=>s.type===ty);if(!a.length&&!need.length)return '';
      return `<div><div class="sec-h"><h2>${ty}</h2></div><div class="stack">${a.map(card).join('')}${need.map(s=>`<button class="card tslot" data-slot="${esc(s.slot)}"><span class="tc-thumb">${svg('plus')}</span><span class="m"><span class="k">DAY ${s.day}${s.time?' · '+esc(s.time):''}</span><b>${esc(s.title)}</b><span class="s">${esc(s.hint)}</span></span></button>`).join('')}</div></div>`;}).join('')}
    <button class="btn acc" data-addticket>${svg('plus')}다른 티켓 추가</button>
    <div class="note"><h4>알아 두세요</h4><ul><li>장소를 등록할 때 '사전 예매 필요'를 켜면 여기에 칸이 생겨요.</li><li>항공권은 항공사 앱이나 메일의 모바일 탑승권 QR을 캡처해 올리면 돼요. 일부 공항·시설은 공식 앱 화면만 받을 수 있어요.</li></ul></div>
  </section>`;
}
function viewPrep(){
  const mine=prepItems(),checks=checkSet(),done=mine.filter(m=>checks.has('u:'+m.id)).length,cs=contacts();
  const prepCats=PREP_CATS.filter(c=>mine.some(m=>prepCat(m)===c)),conCats=CONTACT_CATS.filter(c=>cs.some(x=>contactCat(x)===c));
  return `<section class="view">
    <div><div class="sec-h"><h2>준비물 <span class="mono cnt">${done}/${mine.length}</span></h2><button class="more" data-addpop="prep">${svg('plus')}추가</button></div>
      <div class="bar"><i style="width:${mine.length?done/mine.length*100:0}%;background:var(--accent)"></i></div>
      ${prepCats.map(c=>`<div class="grp">${esc(c)}</div>${mine.filter(m=>prepCat(m)===c).map(m=>`<label class="chk" for="c-u${m.id}" data-hold="${m.id}" data-holdkind="prep"><input type="checkbox" id="c-u${m.id}" data-check="u:${m.id}" ${checks.has('u:'+m.id)?'checked':''}><span><div class="t">${esc(m.t)}</div></span></label>`).join('')}`).join('')
        ||'<p class="fine empty">「추가」를 눌러 챙길 것을 넣어 보세요.</p>'}
      ${mine.length?'<p class="fine">길게 누르면 지울 수 있어요.</p>':''}</div>
    <div><div class="sec-h"><h2>연락처</h2><button class="more" data-addpop="contact">${svg('plus')}추가</button></div>
      ${conCats.map(c=>`<div class="grp">${esc(c)}</div>${cs.filter(x=>contactCat(x)===c).map(x=>`<div class="crow" data-hold="${x.id}" data-holdkind="contact"><div class="cm"><b>${esc(x.name)}</b><span class="mono">${esc(x.tel)}</span></div>${x.tel?`<a class="btn sm" href="tel:${esc(x.tel.replace(/[^+\d]/g,''))}">${svg('phone')}전화</a>`:''}</div>`).join('')}`).join('')
        ||'<p class="fine empty">숙소·항공사·병원 번호를 넣어 두면 바로 걸 수 있어요.</p>'}</div>
    <div class="card setup"><b>인터넷 없이 쓰려면 (출발 전에 한 번)</b>
      <ul class="fine" style="margin:0;padding-left:18px"><li>오프라인 지도 받기: 등록한 장소 주변 지도와 일본어 음성을 휴대폰에 저장해요.</li><li>티켓 탭에서 티켓을 한 번씩 열어 두기: 사진이 휴대폰에 저장돼요.</li></ul>
      <button class="btn acc" data-offlinemap>오프라인 지도 받기</button>${LS.get('offlineMapAt','')?`<span class="fine">마지막으로 받은 날: ${new Date(LS.get('offlineMapAt','')).toLocaleDateString('ko-KR')}</span>`:''}</div>
  </section>`;
}
/* floating popup for adding things: the screen behind stays as it is, and several can be added in a row */
function floatPop(html){closeFloat();const bg=document.createElement('div');bg.className='fpop-bg';bg.id='fpop';bg.innerHTML=`<div class="fpop" role="dialog" aria-modal="true">${html}</div>`;document.body.appendChild(bg);
  if(byTap())history.pushState({k:'fpop'},'',location.href);setTimeout(()=>{const i=bg.querySelector('input[type=text],input[type=tel]');if(i)i.focus();},60);}
function closeFloat(fromBack){const x=$('#fpop');if(!x)return;x.remove();if(fromBack!==true)stepBack('fpop');}
function addPop(kind){
  const cats=kind==='prep'?PREP_CATS:CONTACT_CATS,cur=state.popCat&&cats.includes(state.popCat)?state.popCat:cats[0];state.popCat=cur;
  floatPop(`<div class="fp-h"><b>${kind==='prep'?'준비물 추가':'연락처 추가'}</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div>
    <div class="chips fp-cats" role="group">${cats.map(c=>`<button type="button" data-popcat="${esc(c)}" aria-pressed="${c===cur}">${esc(c)}</button>`).join('')}</div>
    <form class="fp-form" data-addform="${kind}">${kind==='prep'?`<input type="text" placeholder="예: 여권, 산모수첩, 보조 배터리" autocomplete="off" aria-label="준비물">`
      :`<input type="text" placeholder="이름 (예: 호텔 프런트)" autocomplete="off" aria-label="이름"><input type="tel" placeholder="전화번호" autocomplete="off" aria-label="전화번호">`}
      <button class="btn acc" type="submit">추가</button></form>
    <p class="fine" id="fpMsg">추가하면 이 창은 그대로 있어서 이어서 넣을 수 있어요.</p>`);}
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
      ${join?`<div><label class="f" for="obCode">초대 코드</label><input type="text" id="obCode" autocapitalize="characters" autocomplete="off" maxlength="8" placeholder="예: 3F9A1C2B"></div>`:`<div><label class="f" for="obTrip">여행 이름</label><input type="text" id="obTrip" maxlength="30" placeholder="예: 도쿄 태교여행"></div>`}
      <div><label class="f" for="obName">이 앱에서 쓸 내 이름</label><input type="text" id="obName" maxlength="12" placeholder="예: 아빠, 엄마"></div>
      <div><label class="f">내 색</label><span class="colors">${COLORS.map(c=>`<button type="button" class="cdot" data-obcolor="${c}" aria-pressed="${o.color===c}" style="--c:${c}" aria-label="색 ${c}"></button>`).join('')}</span></div>
      ${o.err?`<p class="err">${esc(o.err)}</p>`:''}
      <button class="btn acc" type="submit" ${o.busy?'disabled':''}>${o.busy?'잠시만요…':join?'참여하기':'여행 만들기'}</button>
    </form>
    <button class="btn ghost" data-signout>다른 계정으로 로그인</button></section>`;
}
/* ===================== render & events ===================== */
const VIEWS={home:viewHome,fav:viewFav,plan:viewPlan,tickets:viewTickets,diary:viewDiary,money:viewMoney,places:viewPlaces,prep:viewPrep,auth:viewAuth,onboard:viewOnboard};
const GATED=new Set(['auth','onboard']);
function render(){
  rebuild();
  document.title=tripInfo()?trip().title:'딱복트립';
  $('#top').innerHTML=header();$('#main').innerHTML=VIEWS[state.tab]();
  $('#tabs').hidden=GATED.has(state.tab)||!$('#intro').hidden;
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===state.tab||(state.tab==='places'&&b.dataset.tab==='home')||(state.tab==='prep'&&b.dataset.tab==='home')));
  ['home','plan','places'].forEach(mountMap);hydrateFiles($('#main'));
}
function go(tab,scroll=true,fromBack=false){if(!VIEWS[tab])tab='home';if(!Sync.meta.tripId&&!GATED.has(tab))tab='auth';closeAllSheets();const changed=tab!==state.tab;state.tab=tab;state.edit=false;
  if(!GATED.has(tab)&&!fromBack){if(changed&&byTap())history.pushState({k:'tab'},'','#'+tab);else if(location.hash.slice(1)!==tab)history.replaceState(history.state,'','#'+tab);}render();if(scroll)window.scrollTo(0,0);}
async function enter(){
  if(Sync.meta.tripId){go(VIEWS[location.hash.slice(1)]&&!GATED.has(location.hash.slice(1))?location.hash.slice(1):'home',false);Sync.syncNow();loadUsd();return;}
  const s=await Sync.session();
  if(!s){go('auth');return;}
  try{const t=await Sync.myTrip();go(t?'home':'onboard');if(t)Sync.syncNow();}catch(e){state.auth.err='서버에 연결하지 못했어요. 인터넷을 확인해 주세요.';go('auth');}
}
function nowTs(){const d=new Date();return `${d.getMonth()+1}.${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
// after adding, stay in that category's box so several things can be typed in a row
function keepAdd(form,cat){render();const f=document.querySelector(`[data-addform="${form}"][data-cat="${CSS.escape(cat)}"] input`);if(f)f.focus({preventScroll:true});}
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
  const t=e.target.closest('[data-editx],[data-addfav],[data-delfav],[data-addpop],[data-popcat],[data-closefp],[data-aisave],[data-interp],[data-listen],[data-ipsay],[data-ipsave],[data-ipbig],[data-ocrsave],[data-delcontact],[data-rdays],[data-mypax],[data-tpax],[data-tpaxf],[data-tdir],[data-bighotel],[data-cancelx],[data-editd],[data-canceld],[data-wipeall],[data-tab],[data-day],[data-edit],[data-place],[data-mv],[data-del],[data-pick],[data-reset],[data-addday],[data-addto],[data-heart],[data-scat],[data-sonly],[data-sview],[data-tool],[data-quick],[data-cur],[data-xcat],[data-xday],[data-delx],[data-replay],[data-sound],[data-kind],[data-stk],[data-dday],[data-nophoto],[data-deld],[data-say],[data-sayslow],[data-bigsign],[data-bigask],[data-bigphrase],[data-settings],[data-copy],[data-mycolor],[data-saveprofile],[data-syncnow],[data-signout],[data-authmode],[data-obmode],[data-obcolor],[data-addticket],[data-slot],[data-showticket],[data-editticket],[data-delticket],[data-ttype],[data-tday],[data-rmfile],[data-install],[data-flights],[data-newplace],[data-manualplace],[data-pickres],[data-editplace],[data-delplace],[data-pfcat],[data-pfwalk],[data-pfsafe],[data-tripsetup],[data-newstay],[data-importtpl],[data-delprep],[data-offlinemap],[data-delphrase],[data-restorephrases],[data-bigja]');
  if(!t)return;const ds=t.dataset;
  if(ds.say!==undefined){speak(ds.say);}
  else if(ds.sayslow!==undefined){speak(ds.sayslow,true);}
  else if(ds.bigsign){const [id,i]=ds.bigsign.split('|');bigSign(id,+i,false);}
  else if(ds.bigask){const [id,i]=ds.bigask.split('|');bigSign(id,+i,true);}
  else if(ds.bighotel!==undefined){const h=hotelPhrase();if(h)bigPhrase(h);}
  else if(ds.bigphrase!==undefined){bigPhrase(+ds.bigphrase);}
  else if(ds.sound!==undefined){toggleSound();}
  else if(ds.replay!==undefined){closeAllSheets();showIntro();}
  else if(ds.settings!==undefined){settingsSheet();}
  else if(ds.copy!==undefined){try{await navigator.clipboard.writeText(ds.copy);toast('초대 코드를 복사했어요.');}catch(err){toast('코드를 길게 눌러 복사해 주세요: '+ds.copy);}}
  else if(ds.mycolor){document.querySelectorAll('[data-mycolor]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.saveprofile!==undefined){const n=$('#myName').value.trim()||'나',c=(document.querySelector('[data-mycolor][aria-pressed="true"]')||{}).dataset?.mycolor||member(me()).color;try{await Sync.updateProfile(n,c);toast('저장했어요.');closeSheet();render();}catch(err){toast('인터넷이 연결되면 다시 저장해 주세요.');}}
  else if(ds.syncnow!==undefined){await Sync.syncNow();settingsSheet();}
  else if(ds.signout!==undefined){await Sync.signOut();closeAllSheets();state.auth={mode:'login',err:'',info:'',busy:false};go('auth');}
  else if(ds.install!==undefined){if(installEvt){installEvt.prompt();installEvt=null;render();}}
  else if(ds.authmode){state.auth={mode:ds.authmode,err:'',info:'',busy:false};keep(['aEmail']);}
  else if(ds.obmode){state.onboard.mode=ds.obmode;state.onboard.err='';keep(['obName']);}
  else if(ds.obcolor){state.onboard.color=ds.obcolor;keep(['obName','obCode']);}
  else if(ds.flights!==undefined){flightSheet();}
  else if(ds.newplace!==undefined){searchSheet(+ds.newplace||0);}
  else if(ds.newstay!==undefined){state.stayMode=true;searchSheet(0);}
  else if(ds.manualplace!==undefined){placeForm(null,state.search.forDay);}
  else if(ds.pickres!==undefined){const r=state.search.results[+ds.pickres];if(r){if(r.gid&&!r.jp){t.disabled=true;r.jp=await googleJaName(r.gid);}placeForm({...r,signs:r.jp?[[r.jp,r.kana,r.n]]:[]},state.search.forDay);}}
  else if(ds.editplace){placeForm({id:ds.editplace,...Sync.get('place',ds.editplace)},0);}
  else if(ds.delplace){const id=ds.delplace,used=DAYS.filter(d=>planOf(d.id).some(x=>x.p===id)).map(d=>'DAY '+d.id),hotel=trip().hotelId===id;
    // deleting a place also takes it out of the schedule, so say exactly what goes with it
    if(!confirm(`「${PL[id]?PL[id].n:'이 장소'}」을(를) 지울까요?${used.length?`\n${used.join(', ')} 일정에서도 빠져요.`:''}${hotel?'\n여행의 숙소 설정도 지워져요.':''}\n즐겨찾기에서만 빼려면 즐겨찾기 탭에서 길게 누르세요.`))return;
    DAYS.forEach(d=>{const a=planOf(d.id);if(a.some(x=>x.p===id))setPlan(d.id,a.filter(x=>x.p!==id));});Sync.remove('place',id);if(trip().hotelId===id)Sync.put('trip','info',{...trip(),hotelId:''});closeSheet();toast('장소를 지웠어요.');render();}
  else if(ds.pfcat){state.pf.cat=ds.pfcat;document.querySelectorAll('[data-pfcat]').forEach(b=>b.setAttribute('aria-pressed',b===t));const r=$('#pfSafeRow');if(r)r.hidden=!/맛집|카페/.test(ds.pfcat);}
  else if(ds.pfwalk!==undefined){state.pf.walk=+ds.pfwalk;document.querySelectorAll('[data-pfwalk]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.pfsafe!==undefined){state.pf.safe=ds.pfsafe;document.querySelectorAll('[data-pfsafe]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.tripsetup!==undefined){tripSheet();}
  else if(ds.importtpl!==undefined){importTemplate();closeSheet();toast('도쿄 예시를 불러왔어요. 자유롭게 고쳐 쓰세요.');render();}
  else if(ds.delprep){closeHoldPop();Sync.remove('prep',ds.delprep);render();}
  else if(ds.delcontact){closeHoldPop();Sync.remove('contact',ds.delcontact);render();}
  else if(ds.offlinemap!==undefined){saveOfflineMap(t);}
  else if(ds.delphrase){closeHoldPop();const k=ds.delphrase;if(k.startsWith('u:'))Sync.remove('phrase',k.slice(2));else{const h=hiddenPhrases();h.add(k.slice(2));Sync.put('phrasehide','set',{ids:[...h]});}talkSheet('');}
  else if(ds.restorephrases!==undefined){Sync.put('phrasehide','set',{ids:[]});talkSheet('');}
  else if(ds.bigja){const i=allPhrases().findIndex(p=>p[0]===ds.bigja);if(i>=0)bigPhrase(i);else{const p=PHRASES.find(x=>x[0]===ds.bigja);if(p)openOverlay(`<div class="bigsign"><button class="ov-x" data-closeov aria-label="닫기">×</button><div class="bs-ja" lang="ja" translate="no">${esc(p[0])}</div><div class="bs-kana" lang="ja" translate="no">${esc(p[1])}</div><div class="bs-pron">${esc(koSay(p[1],p[0]))}</div><div class="bs-ko">${esc(p[2])}</div><div class="bs-acts"><button class="btn acc" data-say="${esc(p[0])}">${svg('speak')}듣기</button></div></div>`);}}
  else if(ds.addticket!==undefined){ticketForm(null);}
  else if(ds.slot){const s=ticketSlots().find(x=>x.slot===ds.slot);if(s.dir){ticketForm({type:'항공권',title:'',day:s.day,time:s.time,place:'',code:'',seat:'',memo:'',files:[],slot:s.slot,dir:s.dir});state.tf.id=null;return;}ticketForm(null);Object.assign(state.tf,{type:s.type,day:s.day,place:s.place,slot:s.slot,time:s.time});$('#tTitle').value=s.title;$('#tTime').value=s.time;$('#tPlace').value=s.place;document.querySelectorAll('[data-ttype]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ttype===s.type));document.querySelectorAll('[data-tday]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.tday===s.day));}
  else if(ds.showticket){showTicket(ds.showticket);}
  else if(ds.editticket){closeOverlay(true);state.reopenTicket={id:ds.editticket,depth:sheetStack.length+($('#sheetRoot').innerHTML?1:0)};ticketForm({id:ds.editticket,...Sync.get('ticket',ds.editticket)});}
  else if(ds.delticket){if(!confirm('이 티켓을 지울까요?'))return;state.reopenTicket=null;Sync.remove('ticket',ds.delticket);closeSheet();render();toast('티켓을 지웠어요.');}
  else if(ds.ttype){state.tf.type=ds.ttype;document.querySelectorAll('[data-ttype]').forEach(b=>b.setAttribute('aria-pressed',b===t));const air=ds.ttype==='항공권',stay=ds.ttype==='숙소';$('#tFlight').hidden=!air;$('#tStayBox').hidden=!stay;$('#tGen').hidden=air||stay;$('#tFilesH').textContent=air?'탑승권 이미지':stay?'예약 확인서':'티켓 이미지';}
  else if(ds.tpax!==undefined){const box=$('#tPax');document.querySelectorAll('[data-tpax]').forEach(b=>b.setAttribute('aria-pressed',b===t));
    if(ds.tpax==='+'){box.value='';box.hidden=false;box.focus();}else{box.value=ds.tpax;box.hidden=true;}}
  else if(ds.tpaxf!==undefined){state.tpax=ds.tpaxf;render();}
  else if(ds.mypax!==undefined){const m={...paxMap()};if(ds.mypax)m[me()]=ds.mypax;else delete m[me()];Sync.put('paxof','set',{map:m});state.tpax=null;settingsSheet();}
  else if(ds.tdir){state.tf.dir=ds.tdir;document.querySelectorAll('[data-tdir]').forEach(b=>b.setAttribute('aria-pressed',b===t));
    if(ds.tdir!=='etc'){const f=flights()[ds.tdir],day=ds.tdir==='out'?1:DAYS.length;state.tf.day=day;$('#tDayA').value=day;
      [['tNo','no'],['tFrom','fromCity'],['tTo','toCity'],['tDep','dep'],['tArr','arr'],['tDur','dur'],['tDepT','term'],['tArrT','arrTerm']].forEach(([i,k])=>{const el=$('#'+i);if(el&&!el.value&&f[k])el.value=f[k];});}}
  else if(ds.tday){state.tf.day=+ds.tday;document.querySelectorAll('[data-tday]').forEach(b=>b.setAttribute('aria-pressed',b===t));}
  else if(ds.rmfile){const k=ds.rmfile[0],i=+ds.rmfile.slice(1);if(k==='o')state.tf.files.splice(i,1);else state.tf.newFiles.splice(i,1);$('#tFiles').innerHTML=filesEditHTML();hydrateFiles($('#tFiles'));}
  else if(ds.tab!==undefined){if(ds.day)state.day=+ds.day;go(ds.tab);}
  else if(ds.day){state.day=+ds.day;LS.set('day',state.day);render();}
  else if(ds.edit!==undefined){state.edit=!state.edit;render();}
  else if(ds.place){placeSheet(ds.place);}
  else if(ds.mv){const [i,dir]=ds.mv.split('|').map(Number),a=planOf(state.day);[a[i],a[i+dir]]=[a[i+dir],a[i]];setPlan(state.day,a);render();}
  else if(ds.del){const a=planOf(state.day);a.splice(+ds.del,1);setPlan(state.day,a);render();}
  else if(ds.pick){pickPlaceSheet(+ds.pick);}
  else if(ds.addto){addToSheet(ds.addto);}
  else if(ds.addday){const [d,id]=ds.addday.split('|'),a=planOf(+d),last=a[a.length-1],pos=(last&&(isStay(last.p)||isAir(last.p))&&a.length>1)?a.length-1:a.length;a.splice(pos,0,{p:id,t:'',dur:''});setPlan(+d,a);closeSheet();state.day=+d;LS.set('day',state.day);go('plan');}
  else if(ds.heart){const id=ds.heart,s=savedSet();s.has(id)?s.delete(id):s.add(id);setSaved(s);if($('#sheetRoot .sheet'))placeSheet(id);render();}
  else if(ds.scat){state.sCat=ds.scat;render();}
  else if(ds.sonly!==undefined){state.sOnly=!state.sOnly;render();}
  else if(ds.sview){state.sView=ds.sview;render();}
  else if(ds.tool){toolSheet(ds.tool);}
  else if(ds.interp!==undefined){interpSheet();}
  else if(ds.listen){listen(ds.listen);}
  else if(ds.ipsay){const x=state.interp[+ds.ipsay];if(x)ipSay(x);}
  else if(ds.ipsave){const x=state.interp[+ds.ipsave];if(x){await savePhrase(x.src,x.dst);toast('회화 목록에 넣었어요.');}}
  else if(ds.ipbig){const x=state.interp[+ds.ipbig];if(x){let k='';try{k=await readingOf(x.dst);}catch(e){}bigPhrase([x.dst,k,x.src]);}}
  else if(ds.aisave){const it=state.ocrAi&&state.ocrAi.items[+ds.aisave];if(it){await savePhrase(it.ja,it.ko);t.disabled=true;toast('회화 목록에 넣었어요.');}}
  else if(ds.ocrsave){const x=state.ocr&&state.ocr[+ds.ocrsave];if(x){await savePhrase(x[0],x[1]);t.disabled=true;toast('회화 목록에 넣었어요.');}}
  else if(ds.addpop){addPop(ds.addpop);}
  else if(ds.addfav!==undefined){addFavPop();}
  else if(ds.delfav){closeHoldPop();const sv=savedSet();sv.delete(ds.delfav);setSaved(sv);render();}
  else if(ds.popcat){state.popCat=ds.popcat;document.querySelectorAll('[data-popcat]').forEach(b=>b.setAttribute('aria-pressed',b===t));const i=document.querySelector('#fpop input');if(i)i.focus();}
  else if(ds.closefp!==undefined){closeFloat();}
  else if(ds.rdays){state.rateDays=+ds.rdays;rateSheet();}
  else if(ds.quick){$('#yenIn').value=(+ds.quick).toLocaleString('ko-KR');$('#yenIn').dispatchEvent(new Event('input',{bubbles:true}));}
  else if(ds.cur){state.form.cur=ds.cur;keep(['amtIn','titleIn']);}
  else if(ds.xcat){state.form.cat=ds.xcat;keep(['amtIn','titleIn']);}
  else if(ds.xday){state.form.day=+ds.xday;keep(['amtIn','titleIn']);}
  else if(ds.delx){if(!confirm('이 지출을 지울까요?'))return;if(state.form.editX===ds.delx)state.form.editX='';Sync.remove('exp',ds.delx);render();}
  else if(ds.editx){const x=Sync.get('exp',ds.editx);if(!x)return;Object.assign(state.form,{editX:ds.editx,cur:x.cur,cat:x.cat,day:x.day});state.err='';render();
    const a=$('#amtIn'),tt=$('#titleIn');if(a){a.value=x.amt;tt.value=x.title||'';a.closest('form').scrollIntoView({behavior:'smooth',block:'start'});a.focus();}}
  else if(ds.cancelx!==undefined){state.form.editX='';state.err='';render();}
  else if(ds.editd){const x=Sync.get('diary',ds.editd);if(!x)return;Object.assign(state.dform,{edit:ds.editd,kind:x.kind,day:x.day,stk:x.stk||'',photoBlob:null,photoURL:'',keepPhoto:x.photo||''});state.derr='';render();
    const t2=$('#diaryText');if(t2){t2.value=x.text||'';t2.closest('form').scrollIntoView({behavior:'smooth',block:'start'});t2.focus();}}
  else if(ds.canceld!==undefined){Object.assign(state.dform,{edit:'',keepPhoto:'',photoBlob:null,photoURL:''});state.derr='';render();}
  else if(ds.wipeall!==undefined){wipeAll();}
  else if(ds.kind){state.dform.kind=ds.kind;keep(['diaryText']);}
  else if(ds.stk){state.dform.stk=state.dform.stk===ds.stk?'':ds.stk;keep(['diaryText']);}
  else if(ds.dday){state.dform.day=+ds.dday;keep(['diaryText']);}
  else if(ds.nophoto!==undefined){state.dform.photoBlob=null;state.dform.photoURL='';state.dform.keepPhoto='';keep(['diaryText']);}
  else if(ds.deld){if(!confirm('이 기록을 지울까요?'))return;Sync.remove('diary',ds.deld);render();}
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
    if(!name){o.err='내 이름을 적어 주세요.';keep(['obName','obCode','obTrip']);return;}
    o.busy=true;o.err='';keep(['obName','obCode']);
    try{ if(o.mode==='join'){const code=$('#obCode').value.trim();if(code.length<8)throw new Error('invite code not found');await Sync.joinTrip(code,name,o.color);}
      else{const title=($('#obTrip').value||'').trim()||'우리 여행';await Sync.createTrip(title,name,o.color);Sync.put('trip','info',{...trip(),title});}
      o.busy=false;go('home');
    }catch(err){o.busy=false;o.err=authMsg(err);keep(['obName','obCode']);}
  }
  if(id==='ticketForm'){saveTicket();}
  if(id==='flightForm'){saveFlights();}
  if(id==='placeForm'){savePlace();}
  if(id==='tripForm'){saveTrip();}
  if(id==='searchForm'){const q=$('#searchQ').value.trim();if(q)runSearch(q);}
  if(id==='trForm'){const v=$('#trIn').value.trim();if(v)addPhrase(v);}
  const af=e.target.dataset&&e.target.dataset.addform;
  if(af==='fav'){const v=e.target.querySelector('input').value.trim();if(v)addFavFrom(v);return;}
  if(af==='prep'||af==='contact'){const ins=[...e.target.querySelectorAll('input')],[a,b]=ins.map(x=>x.value.trim()),cat=state.popCat;
    if(af==='prep'&&a)Sync.put('prep',uid(),{t:a,cat,at:new Date().toISOString()});
    else if(af==='contact'&&(a||b))Sync.put('contact',uid(),{name:a||b,tel:b,cat,at:new Date().toISOString()});else return;
    ins.forEach(x=>x.value='');ins[0].focus();const m=$('#fpMsg');if(m)m.textContent=`「${a||b}」을(를) ${cat}에 넣었어요.`;render();}
  if(id==='expForm'){const amt=parseFloat(($('#amtIn').value||'').replace(/,/g,'')),title=$('#titleIn').value.trim()||state.form.cat;
    if(!(amt>0)){state.err='금액을 숫자로 입력해 주세요.';keep(['amtIn','titleIn']);$('#amtIn').focus();return;}
    state.err='';const ex=state.form.editX&&Sync.get('exp',state.form.editX);
    Sync.put('exp',ex?state.form.editX:uid(),{...(ex||{}),day:state.form.day,cat:state.form.cat,title,amt,cur:state.form.cur,who:ex?ex.who:me(),at:ex?ex.at:new Date().toISOString()});
    if(ex)toast('지출을 고쳤어요.');state.form.editX='';render();}
  if(id==='diaryForm'){const text=$('#diaryText').value.trim(),f=state.dform;
    if(!text&&!f.photoBlob&&!f.keepPhoto){state.derr='내용을 쓰거나 사진을 골라 주세요.';keep(['diaryText']);$('#diaryText').focus();return;}
    let photo='';if(f.photoBlob){try{photo=await Sync.addFile(f.photoBlob,'jpg');}catch(err){state.derr='저장 공간이 부족해 사진을 저장하지 못했어요.';keep(['diaryText']);return;}}
    const old=f.edit&&Sync.get('diary',f.edit);if(!photo&&old)photo=f.keepPhoto||'';
    Sync.put('diary',old?f.edit:uid(),{...(old||{}),who:old?old.who:me(),kind:f.kind,day:f.day,ts:old?old.ts:nowTs(),stk:f.stk,text,photo,at:old?old.at:new Date().toISOString()});
    if(old)toast('기록을 고쳤어요.');state.derr='';Object.assign(state.dform,{stk:'',photoBlob:null,photoURL:'',keepPhoto:'',edit:''});render();}
});
document.addEventListener('change',async e=>{
  const t=e.target,dsx=t.dataset;
  const planEdit=(i,fn)=>{const a=planOf(state.day);if(!a[i])return;fn(a[i]);setPlan(state.day,a);};
  if(dsx.stoptime!==undefined)planEdit(+dsx.stoptime,s=>{s.t=t.value;});
  if(dsx.stopdur!==undefined)planEdit(+dsx.stopdur,s=>{s.dur=t.value.trim();});
  if(dsx.stoptitle!==undefined)planEdit(+dsx.stoptitle,s=>{s.title=t.value.trim();});
  if(dsx.movehow!==undefined)planEdit(+dsx.movehow,s=>{s.move={...(s.move||{}),how:t.value};if(!t.value)delete s.move;});
  if(dsx.movemin!==undefined)planEdit(+dsx.movemin,s=>{s.move={how:'train',...(s.move||{}),min:+t.value||''};});
  if(dsx.movenote!==undefined)planEdit(+dsx.movenote,s=>{s.move={how:'train',...(s.move||{}),note:t.value.trim()};});
  if(dsx.daytitle!==undefined){const T=trip();Sync.put('trip','info',{...T,dayTitles:{...(T.dayTitles||{}),[dsx.daytitle]:t.value.trim()}});}
  if(t.dataset.check){const s=checkSet();t.checked?s.add(t.dataset.check):s.delete(t.dataset.check);setChecks(s);render();}
  if(t.id==='budgetIn'){const v=parseInt(t.value.replace(/[^0-9]/g,''),10);if(v>0)setSettings({budget:v});render();}
  if(t.id==='rateIn'){const r=parseFloat(t.value);if(r>0)setSettings({rate:r/100});}
  if(t.id==='ocrIn'&&t.files&&t.files[0]){const f=t.files[0];t.value='';ocrImage(f);return;}
  if(t.id==='photoIn'&&t.files&&t.files[0]){try{const b=await downscale(t.files[0],1400);state.dform.photoBlob=b;state.dform.photoURL=URL.createObjectURL(b);state.derr='';}catch(err){state.derr='이 사진은 열 수 없어요. 다른 사진을 골라 주세요.';}keep(['diaryText']);}
  if(t.id==='tFileIn'&&t.files){for(const f of t.files){if(f.size>15*1024*1024){toast(f.name+' 은(는) 15MB보다 커서 뺐어요.');continue;}state.tf.newFiles.push({blob:f,name:f.name,url:f.type.startsWith('image/')?URL.createObjectURL(f):''});}$('#tFiles').innerHTML=filesEditHTML();hydrateFiles($('#tFiles'));t.value='';}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='pickQ'){const q=t.value.trim().toLowerCase();document.querySelectorAll('#pickList [data-name]').forEach(b=>{b.hidden=!!q&&!b.dataset.name.includes(q);});}
  if(t.dataset.memo!==undefined){const a=planOf(state.day);a[+t.dataset.memo].memo=t.value;clearTimeout(t._tm);t._tm=setTimeout(()=>setPlan(state.day,a),500);}
  if(t.id==='yenIn')convFrom('yen');
  if(t.id==='wonIn')convFrom('won');
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(!$('#overlay').hidden)closeOverlay();else closeSheet();}
  if((e.key==='Enter'||e.key===' ')&&!$('#intro').hidden&&!e.target.closest('button')){e.preventDefault();$('#intro')._tap();}
});
/* long press on a phrase card: a small floating "지울까요?" next to it */
let holdT=0,holdFired=false,holdXY=null;
const closeHoldPop=()=>{const x=$('#holdpop');if(x)x.remove();document.querySelectorAll('.held').forEach(c=>c.classList.remove('held'));};
document.addEventListener('pointerdown',e=>{const c=e.target.closest('[data-hold]');if(!e.target.closest("#holdpop"))closeHoldPop();if(!c||e.target.closest('button'))return;holdFired=false;holdXY=[e.clientX,e.clientY];
  clearTimeout(holdT);holdT=setTimeout(()=>{holdFired=true;if(navigator.vibrate)try{navigator.vibrate(15);}catch(_){}
    const r=c.getBoundingClientRect(),pop=document.createElement('div');pop.id='holdpop';pop.className='holdpop';
    const kind=c.dataset.holdkind||'phrase',msg={phrase:'이 문장을 지울까요?',prep:'이 준비물을 지울까요?',contact:'이 연락처를 지울까요?',fav:'즐겨찾기에서 뺄까요?'}[kind];
    pop.innerHTML=`<span>${msg}</span><button type="button" data-holdno>취소</button><button type="button" class="del" data-del${kind}="${c.dataset.hold}">삭제</button>`;
    c.classList.add('held');pop.dataset.for='';document.body.appendChild(pop);},550);});
['pointerup','pointercancel','pointerleave'].forEach(k=>document.addEventListener(k,()=>clearTimeout(holdT)));
document.addEventListener('pointermove',e=>{if(holdXY&&Math.hypot(e.clientX-holdXY[0],e.clientY-holdXY[1])>10)clearTimeout(holdT);});
document.addEventListener('contextmenu',e=>{if(e.target.closest('[data-hold]'))e.preventDefault();});
document.addEventListener('click',e=>{if(e.target.id==='fpop')closeFloat();});
// the click that ends a long press must not also open the card
document.addEventListener('click',e=>{if(holdFired&&e.target.closest('[data-hold]')){holdFired=false;e.stopPropagation();e.preventDefault();}
  if(e.target.closest('[data-holdno]')){closeHoldPop();}},true);
/* Android back button: close what is open, then go home, then exit only on a second press */
let backAt=0;
const pushGuard=()=>history.pushState({k:'guard'},'',location.href);
// Chrome skips Back steps that were not made during a tap, so the exit guard is (re)made on the next tap
document.addEventListener('pointerdown',()=>{if(!history.state||!history.state.k)pushGuard();},true);
window.addEventListener('popstate',()=>{
  if(ignorePop){ignorePop=false;return;}
  if($('#holdpop')){closeHoldPop();}
  if($('#fpop')){closeFloat(true);return;}
  if(!$('#overlay').hidden){closeOverlay(true);return;}
  if($('#sheetRoot').innerHTML){closeSheet(true);return;}
  if(!$('#intro').hidden)return;
  const h=location.hash.slice(1);
  if(VIEWS[h]&&!GATED.has(h)&&h!==state.tab){go(h,true,true);return;}
  if(state.tab!=='home'&&!GATED.has(state.tab)){go('home',true,true);return;}
  if(Date.now()-backAt<2200){history.back();return;}
  backAt=Date.now();toast('뒤로 버튼을 한 번 더 누르면 앱이 꺼져요');pushGuard();
});
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(VIEWS[h]&&h!==state.tab&&!GATED.has(h))go(h);});
let rz;window.addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>Object.values(maps).forEach(m=>{try{m.invalidateSize({animate:false});}catch(e){}}),150);});
// re-render when the other person's changes arrive, unless someone is typing
Sync.on(what=>{if(what!=='status'&&what!=='files')refreshIntro();const a=document.activeElement,typing=a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&$('#main').contains(a);
  if(what==='status'){const d=document.querySelector('.syncdot');if(d)d.outerHTML=syncDot();return;}
  if(what==='files'){hydrateFiles($('#main'));return;}
  if(!typing&&!GATED.has(state.tab)&&$('#sheetRoot').innerHTML==='')render();});

if('serviceWorker' in navigator&&location.protocol!=='file:'){
  // when a new version takes over, reload once so the new files are used right away
  const hadController=!!navigator.serviceWorker.controller;let reloaded=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hadController||reloaded)return;reloaded=true;
    if(!$('#intro').hidden)pendingReload=true;else reloadSkippingIntro();});
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
}
rebuild();
// the intro plays every time the app is opened, signed in or not; it hands over to enter() when done.
// the one exception is the reload that swaps in a new version, so the intro never plays twice in a row
let skipIntro=false;try{skipIntro=sessionStorage.getItem('tt:skipIntro')==='1';sessionStorage.removeItem('tt:skipIntro');}catch(e){}
// pulling down to refresh reloads the page: stay where you were instead of replaying the intro
try{const nav=performance.getEntriesByType('navigation')[0];if(nav&&nav.type==='reload')skipIntro=true;}catch(e){}
if(skipIntro)enter();else{showIntro();if(Sync.meta.tripId)Sync.syncNow();}


