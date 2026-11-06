/* ===================== 딱복이 사진첩: ultrasound photos and other baby pictures =====================
   Rows are trip items of kind 'album' ({file, date, cap, by, at}); the photo itself is a private trip file. */
// a swaddled baby lying asleep on a pillow, in a soft circle (drawn here, so it works offline)
function babyArt(cls=''){return `<svg class="baby-art ${cls}" viewBox="0 0 120 120" aria-hidden="true">
  <circle cx="60" cy="62" r="52" fill="#e9f2fb"/>
  <ellipse cx="44" cy="52" rx="27" ry="14" fill="#fff" opacity=".9" transform="rotate(-30 44 52)"/>
  <g transform="translate(2 2) rotate(-30 60 66) scale(.9) translate(7 6)">
    <ellipse cx="60" cy="86" rx="31" ry="25" fill="#fbe1e7"/><circle cx="60" cy="53" r="29" fill="#fbe1e7"/>
    <path d="M33 58a27 27 0 0 1 54 0" fill="none" stroke="#f5c9d4" stroke-width="2.5"/>
    <circle cx="60" cy="56" r="20" fill="#fde7da"/>
    <path d="M56 38q3-5 8-1" fill="none" stroke="#9a7466" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M48.5 56q3.5 3 7 0M64.5 56q3.5 3 7 0" fill="none" stroke="#6b4f45" stroke-width="2.2" stroke-linecap="round"/>
    <ellipse cx="47" cy="62.5" rx="4.2" ry="2.6" fill="#f6a9b5" opacity=".6"/><ellipse cx="73" cy="62.5" rx="4.2" ry="2.6" fill="#f6a9b5" opacity=".6"/>
    <path d="M57.5 65q2.5 2 5 0" fill="none" stroke="#d98a85" stroke-width="2" stroke-linecap="round"/>
    <path d="M36 80q24 13 48 0" fill="none" stroke="#f5c9d4" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M55 92c0-3.5 4.5-4.5 5-1 .5-3.5 5-2.5 5 1 0 3.5-5 6.5-5 6.5s-5-3-5-6.5z" fill="#f29bb0"/>
  </g>
  <path d="M97 24l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" fill="#fff"/>
  <path d="M84 40l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#fff"/>
  <path d="M0 3.5c0-3.5 4.5-4.5 5-1 .5-3.5 5-2.5 5 1 0 3.5-5 6.5-5 6.5S0 7 0 3.5z" fill="#a9c2e8" transform="translate(13 78) rotate(-12 5 5) scale(.95)"/>
  <path d="M0 3.5c0-3.5 4.5-4.5 5-1 .5-3.5 5-2.5 5 1 0 3.5-5 6.5-5 6.5S0 7 0 3.5z" fill="#8fb0e0" transform="translate(97 80) rotate(14 5 5) scale(.8)"/>
  <text x="92" y="58" font-family="sans-serif" font-size="9" font-weight="700" fill="#9fb6d6">z</text>
  <text x="99" y="48" font-family="sans-serif" font-size="7" font-weight="700" fill="#b7c9e2">z</text></svg>`;}
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
