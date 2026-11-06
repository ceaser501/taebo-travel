/* ===================== 걸음 수: what each of us walked, sent every hour by the 딱복 걸음 app =====================
   Rows are trip items of kind 'steps' ({who, date, steps, at}), one per person and day. */
const STEPS_APK='https://github.com/ceaser501/taebo-travel/releases/latest/download/ttakbok-steps.apk';
// 「새로 받기」: opens the 딱복 걸음 app for a moment (ttakbok://sync); it sends today's steps and closes.
// Without the app installed, Android falls back to downloading it.
const STEPS_SYNC=`intent://sync#Intent;scheme=ttakbok;package=app.ttakbok.steps;S.browser_fallback_url=${encodeURIComponent(STEPS_APK)};end`;
let stepWait=0;
const isoDay=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const stepRows=()=>Sync.list('steps');
// everyone in the trip, plus anyone who has sent steps; each with a name and their colour
function stepPeople(){const pm=paxMap(),ids=new Set([...Sync.members.map(m=>m.user_id),...stepRows().map(r=>r.who)]);
  return [...ids].map(id=>({id,name:pm[id]||member(id).display_name,color:member(id).color})).sort((a,b)=>(b.id===me())-(a.id===me())||a.name.localeCompare(b.name));} // me first
const stepsOf=(who,date)=>{const r=stepRows().find(x=>x.who===who&&x.date===date);return r?r.steps:null;};
const fmtSteps=n=>n==null?'—':n.toLocaleString('ko-KR');
// the days to show: the trip's days once it has started, otherwise the last 7 days
function stepDays(mode){const today=new Date();today.setHours(0,0,0,0);
  if(mode==='trip'&&startDate())return DAYS.map(d=>({date:dayISO(d.id),label:`DAY ${d.id}`,sub:d.label}));
  return Array.from({length:7},(_,i)=>{const x=new Date(today);x.setDate(x.getDate()-6+i);return {date:isoDay(x),label:`${x.getMonth()+1}/${x.getDate()}`,sub:'일월화수목금토'[x.getDay()]};});}
function stepsEntry(){const ppl=stepPeople(),today=isoDay(new Date());if(!ppl.length)return '';
  return `<button class="card steps-entry" data-steps><span class="ve-i">${svg('walk','')}</span><span class="m"><b>오늘 걸음</b><span class="s">${ppl.map(p=>`<span class="sp" style="--pc:${p.color}"><i></i>${esc(p.name)} ${fmtSteps(stepsOf(p.id,today))}</span>`).join('')}</span></span>${svg('chev')}</button>`;}
function stepsSheet(){
  const ppl=stepPeople(),any=stepRows().some(r=>r.steps>0),today=isoDay(new Date());
  const started=startDate()&&daysUntil()<=0,mode=state.stepMode||(started?'trip':'week'),days=stepDays(mode);
  const max=Math.max(1000,...days.flatMap(d=>ppl.map(p=>stepsOf(p.id,d.date)||0)));
  const top=Math.ceil(max/2000)*2000,last=stepRows().map(r=>r.at).filter(Boolean).sort().pop();
  const total=p=>days.reduce((s,d)=>s+(stepsOf(p.id,d.date)||0),0);
  openSheet(`<div class="stepsv">${shHead('걸음 수',last?`${new Date(last).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 기준<br>15분마다 들어와요`:'딱복 걸음 앱이 15분마다 보내요',`<span class="em-ic st-ic">${svg('walk','')}</span>`)}
    ${/android/i.test(navigator.userAgent)&&!Sync.meta.guest?`<a class="btn acc st-refresh" href="${STEPS_SYNC}" data-stepsync>${svg('sync')}새로 받기</a>`:''}
    <div class="st-today">${ppl.map(p=>`<div class="st-tile" style="--pc:${p.color}"><span class="who"><i></i>${esc(p.name)}</span><b class="mono">${fmtSteps(stepsOf(p.id,today))}</b><span class="u">오늘 걸음</span></div>`).join('')}</div>
    ${any?`<div class="seg st-seg" role="group" aria-label="기간">${startDate()?`<button data-stepmode="trip" aria-pressed="${mode==='trip'}">여행 ${DAYS.length}일</button>`:''}<button data-stepmode="week" aria-pressed="${mode==='week'}">최근 7일</button></div>
    <div class="card st-chart"><div class="st-legend">${ppl.map(p=>`<span style="--pc:${p.color}"><i></i>${esc(p.name)}</span>`).join('')}</div>
      <div class="st-plot"><span class="st-top mono">${top.toLocaleString('ko-KR')}</span>
        ${days.map(d=>`<div class="st-day${d.date===today?' now':''}" title="${esc(d.label)} · ${ppl.map(p=>`${p.name} ${fmtSteps(stepsOf(p.id,d.date))}보`).join(' · ')}"><div class="bars">${ppl.map(p=>{const v=stepsOf(p.id,d.date)||0;return `<i style="--pc:${p.color};height:${v/top*100}%"></i>`;}).join('')}</div><span class="lb">${esc(d.label)}</span></div>`).join('')}</div></div>
    <div class="card st-table" style="--n:${ppl.length}"><div class="st-tr th"><span>날짜</span>${ppl.map(p=>`<span>${esc(p.name)}</span>`).join('')}</div>
      ${days.slice().reverse().map(d=>`<div class="st-tr${d.date===today?' now':''}"><span>${esc(d.label)} <small>${esc(d.sub)}</small></span>${ppl.map(p=>`<span class="mono">${fmtSteps(stepsOf(p.id,d.date))}</span>`).join('')}</div>`).join('')}
      <div class="st-tr tot"><span>합계</span>${ppl.map(p=>`<span class="mono">${total(p).toLocaleString('ko-KR')}</span>`).join('')}</div></div>`:''}
    <div class="note"><h4>${any?'걸음 수가 안 들어오는 사람이 있다면':'아직 걸음 수가 없어요'}</h4><ul>
      <li>삼성 헬스 → 설정 → Health Connect에서 걸음 수 공유를 켜 주세요.</li>
      <li>「딱복 걸음」 앱을 설치하고 딱복트립과 같은 계정으로 로그인해 주세요.</li></ul>
      <a class="btn" href="${STEPS_APK}">${svg('walk')}딱복 걸음 앱 받기</a></div>
  </div>`);}
// back from the app: pull the new numbers and redraw the page
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'||Date.now()-stepWait>120000)return;stepWait=0;
  setTimeout(async()=>{await Sync.syncNow();if($('#sheetRoot .stepsv'))stepsSheet();toast('걸음 수를 새로 받았어요.');},2500);});
document.addEventListener('click',e=>{if(e.target.closest('[data-stepsync]')){stepWait=Date.now();return;}
  const t=e.target.closest('[data-steps],[data-stepmode]');if(!t)return;
  if(t.dataset.steps!==undefined)stepsSheet();else{state.stepMode=t.dataset.stepmode;stepsSheet();}});
if(typeof state!=='undefined'&&state.tab==='home')render();
