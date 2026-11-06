/* ===================== 딱복이 사진첩: ultrasound photos and other baby pictures =====================
   Rows are trip items of kind 'album' ({file, date, cap, by, at}); the photo itself is a private trip file. */
// a sleeping baby in a soft circle (drawn here, so it works offline)
function babyArt(cls=''){return `<svg class="baby-art ${cls}" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="62" r="52" fill="#e8f1fa"/>
  <path d="M22 96c10-14 24-20 38-20s28 6 38 20c-10 10-23 16-38 16s-28-6-38-16z" fill="#f6d3c4"/>
  <circle cx="60" cy="56" r="27" fill="#f9dccf"/>
  <circle cx="34" cy="58" r="5.5" fill="#f6cbbb"/><circle cx="86" cy="58" r="5.5" fill="#f6cbbb"/>
  <path d="M58 30c-3-5 1-10 6-9" stroke="#8a6a5c" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M46 57q4 4 8 0M66 57q4 4 8 0" stroke="#6d5249" stroke-width="2" fill="none" stroke-linecap="round"/>
  <ellipse cx="44" cy="65" rx="5" ry="3" fill="#f5b3b8" opacity=".7"/><ellipse cx="76" cy="65" rx="5" ry="3" fill="#f5b3b8" opacity=".7"/>
  <path d="M56 70q4 3 8 0" stroke="#d98c86" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="44" cy="88" r="7" fill="#f9dccf"/><circle cx="77" cy="86" r="7" fill="#f9dccf"/>
  <path d="M98 22l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff" opacity=".9"/>
  <path d="M18 34c0-3 4-4 5-1 1-3 5-2 5 1 0 3-5 6-5 6s-5-3-5-6z" fill="#f7c6d2"/></svg>`;}
const albumRows=()=>Sync.list('album').sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.at||'').localeCompare(a.at||''));
const albumDate=d=>{if(!d)return '';const x=new Date(d+'T00:00:00');return `${x.getFullYear()}.${x.getMonth()+1}.${x.getDate()}`;};
// home: a card with the newest photos (members only; the photos are private)
function albumEntry(){if(Sync.meta.guest)return '';const rows=albumRows();
  return `<button class="card album-entry" data-album>${babyArt('ae-art')}<span class="m"><b>딱복이 사진첩</b><span class="s">${rows.length?`사진 ${rows.length}장 · 마지막 ${albumDate(rows[0].date)}`:'초음파 사진을 모아 두세요'}</span></span>
    ${rows.length?`<span class="ae-th">${rows.slice(0,3).map(r=>`<img data-file="${esc(r.file)}" alt="">`).join('')}</span>`:svg('chev')}</button>`;}
function albumSheet(){const rows=albumRows();
  openSheet(`<div class="albumv">${shHead('딱복이 사진첩',rows.length?`${rows.length}장 · 둘만 볼 수 있어요`:'둘만 볼 수 있어요',babyArt('sh-art'))}
    <label class="btn acc album-add">${svg('camera')}사진 올리기<input type="file" accept="image/*" multiple id="albumIn" hidden></label>
    ${rows.length?`<div class="album-grid">${rows.map(r=>`<button class="al-t" data-alshow="${esc(r.id)}"><img data-file="${esc(r.file)}" alt="${esc(r.cap||'딱복이 사진')}"><span>${esc(albumDate(r.date))}${r.cap?' · '+esc(r.cap):''}</span></button>`).join('')}</div>`
      :`<div class="album-empty">${babyArt()}<p class="fine">아직 사진이 없어요.<br>초음파 사진을 올려 보세요.</p></div>`}</div>`);}
function albumShow(id){const r=Sync.get('album',id);if(!r)return;
  openOverlay(`<div class="alview"><div class="ov-top"><b>${esc(albumDate(r.date))}</b><button class="ov-x" data-closeov aria-label="닫기">×</button></div>
    <img data-file="${esc(r.file)}" alt="${esc(r.cap||'딱복이 사진')}">
    <input type="text" class="al-cap" data-alcap="${esc(id)}" value="${esc(r.cap||'')}" placeholder="한 줄 메모 (예: 16주, 손 흔드는 딱복이)" aria-label="메모">
    <button class="btn danger-t" data-aldel="${esc(id)}">${svg('x')}사진 지우기</button></div>`);}
async function albumAdd(files){let n=0;
  for(const f of files){try{const blob=await downscale(f,1600),path=await Sync.addFile(blob,'jpg');
    const d=f.lastModified?new Date(f.lastModified):new Date();
    Sync.put('album',uid(),{file:path,date:isoDay(d),cap:'',by:me(),at:new Date().toISOString()});n++;}catch(e){console.warn('album',e);}}
  toast(n?`사진 ${n}장을 올렸어요.`:'사진을 올리지 못했어요.');albumSheet();if(state.tab==='home')render();}
document.addEventListener('change',e=>{if(e.target.id==='albumIn'&&e.target.files.length)albumAdd([...e.target.files]);
  const c=e.target.closest&&e.target.closest('[data-alcap]');if(c){const r=Sync.get('album',c.dataset.alcap);if(r){Sync.put('album',c.dataset.alcap,{...r,cap:c.value.trim()});toast('메모를 저장했어요.');}}});
document.addEventListener('click',e=>{const t=e.target.closest('[data-album],[data-alshow],[data-aldel]');if(!t)return;
  if(t.dataset.album!==undefined)albumSheet();
  else if(t.dataset.alshow)albumShow(t.dataset.alshow);
  else if(t.dataset.aldel&&confirm('이 사진을 지울까요?')){Sync.remove('album',t.dataset.aldel);const b=document.querySelector('#overlay [data-closeov]');if(b)b.click();albumSheet();if(state.tab==='home')render();}});
if(typeof state!=='undefined'&&state.tab==='home')render();
