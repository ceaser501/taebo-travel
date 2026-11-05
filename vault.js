/* ===================== 여권 · 카드: a locked wallet for passports, cards and other private notes =====================
   Everything is encrypted on the phone before it is synced. The password never leaves the phone:
   a random data key encrypts the contents, and the password (PBKDF2) only wraps that data key,
   so changing the password does not re-encrypt the photos. Both of us open it with the same password. */
const VAULT={key:null,data:null,at:0,fails:0,until:0};
const V_IDLE=180000;

const u8b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);};
const b64u8=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function vKek(pw,salt){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function vSeal(key,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:u8b64(iv),ct:u8b64(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes)))};}
async function vOpen(key,box){return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:b64u8(box.iv)},key,b64u8(box.ct)));}
const vEnc=(key,obj)=>vSeal(key,new TextEncoder().encode(JSON.stringify(obj)));
const vDec=async(key,box)=>JSON.parse(new TextDecoder().decode(await vOpen(key,box)));
const vRow=()=>{const r=Sync.get('vault','main');return r&&r.wk?r:null;};
const vItems=()=>(VAULT.data&&VAULT.data.items)||[];
async function vWrite(){VAULT.at=Date.now();const r=vRow();Sync.put('vault','main',{...r,box:await vEnc(VAULT.key,VAULT.data)});}

async function vCreate(pw){
  const salt=crypto.getRandomValues(new Uint8Array(16)),kek=await vKek(pw,salt),raw=crypto.getRandomValues(new Uint8Array(32));
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
  VAULT.key=key;VAULT.data={items:[]};
  Sync.put('vault','main',{v:1,salt:u8b64(salt),wk:await vSeal(kek,raw),box:await vEnc(key,VAULT.data)});VAULT.at=Date.now();}
async function vUnlock(pw){const r=vRow();if(!r)return false;
  try{const kek=await vKek(pw,b64u8(r.salt)),raw=await vOpen(kek,r.wk);
    VAULT.key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);VAULT.data=await vDec(VAULT.key,r.box);VAULT.at=Date.now();VAULT.fails=0;return true;}
  catch(e){VAULT.key=null;VAULT.data=null;return false;}}
function vLock(quiet){if(!VAULT.key)return;VAULT.key=null;VAULT.data=null;if(!quiet&&$('#sheetRoot .vault'))vaultSheet();}
// lock again when the app goes to the background or after a few idle minutes
document.addEventListener('visibilitychange',()=>{if(document.hidden)vLock();});
setInterval(()=>{if(VAULT.key&&Date.now()-VAULT.at>V_IDLE)vLock();},10000);
document.addEventListener('pointerdown',()=>{if(VAULT.key)VAULT.at=Date.now();},true);

const V_TYPES={passport:['여권','passport'],card:['카드','card'],memo:['메모','memo']};
const V_FIELDS={
  passport:[['who','누구','예: 태수'],['no','여권번호','예: M12345678','mono'],['name','영문 이름','예: KIM TAESU'],['birth','생년월일','예: 1990-01-01'],['issued','발급일','예: 2020-05-01'],['exp','만료일','예: 2030-05-01']],
  card:[['title','카드 이름','예: 하나 트래블로그'],['no','카드 번호 (선택)','예: 1234 5678 9012 3456','mono'],['exp','유효기간 (선택)','예: 08/29'],['tel','분실 신고 전화 (선택)','예: +82-2-1234-5678'],['memo','메모 (선택)','예: 엔화 충전, 해외 수수료 없음']],
  memo:[['title','제목','예: 여행자 보험'],['body','내용','예: 증권번호 · 긴급 연락처','area']]};

function vaultSheet(){
  const r=vRow(),locked=!VAULT.key;
  if(!r){openSheet(`<div class="vault">${shHead('여권 · 카드','여권 정보, 카드 정보를 비밀번호로 잠가 둬요.',`<span class="vlock-ic">${svg('lock','')}</span>`)}
      <div class="fsec"><h4>비밀번호 정하기</h4>
        <input type="password" id="vpw" inputmode="numeric" autocomplete="new-password" placeholder="숫자 6자리 이상" aria-label="비밀번호">
        <input type="password" id="vpw2" inputmode="numeric" autocomplete="new-password" placeholder="한 번 더" aria-label="비밀번호 확인">
        <p class="err" id="vErr" hidden></p><button class="btn acc" data-vcreate>만들기</button></div>
      <div class="note"><h4>알아 두세요</h4><ul><li>둘이 같은 비밀번호로 열어요. 보연에게도 알려 주세요.</li><li>비밀번호를 잊으면 아무도 열 수 없어요. 서버에도 비밀번호는 저장되지 않아요.</li><li>카드 뒷면 3자리(CVC)는 넣지 마세요.</li></ul></div></div>`);
    setTimeout(()=>{const i=$('#vpw');if(i)i.focus();},80);return;}
  if(locked){const wait=Math.max(0,Math.ceil((VAULT.until-Date.now())/1000));
    openSheet(`<div class="vault">${shHead('여권 · 카드','비밀번호를 넣으면 열려요.',`<span class="vlock-ic">${svg('lock','')}</span>`)}
      <div class="vpin"><input type="password" id="vpw" inputmode="numeric" autocomplete="current-password" placeholder="비밀번호" aria-label="비밀번호" ${wait?'disabled':''}>
        <button class="btn acc" data-vunlock ${wait?'disabled':''}>열기</button></div>
      <p class="err" id="vErr" ${wait?'':'hidden'}>${wait?`${wait}초 뒤에 다시 해 주세요.`:''}</p>
      <button class="btn ghost sm" data-vreset style="align-self:center;color:var(--mute)">비밀번호를 잊었어요</button></div>`);
    setTimeout(()=>{const i=$('#vpw');if(i&&!i.disabled)i.focus();},80);return;}
  const its=vItems(),grp=t=>its.filter(x=>x.type===t);
  const row=(k,v,mono)=>v?`<button class="vrow" data-vcopy="${esc(v)}" aria-label="${esc(k)} 복사"><span class="k">${esc(k)}</span><span class="v ${mono?'mono':''}">${esc(v)}</span>${svg('copy')}</button>`:'';
  const head=(x,title,ic)=>`<div class="vh"><span class="vic">${svg(ic,'')}</span><b>${esc(title)}</b><button class="ic-btn" data-vedit="${x.id}" aria-label="고치기">${svg('pen')}</button></div>`;
  const photo=x=>x.photo?`<button class="vphoto" data-vphoto="${x.photo}" aria-label="사진 크게 보기"><img alt="" data-vimg="${x.photo}"></button>`:'';
  const cardNo=n=>n?n.replace(/\D/g,'').replace(/(\d{4})(?=\d)/g,'$1 '):'';
  const sec=(t,html)=>`<div><div class="sec-h"><h2>${V_TYPES[t][0]}</h2><button class="more" data-vadd="${t}">${svg('plus')}추가</button></div>
      <div class="stack">${html||`<p class="fine empty">「추가」를 눌러 ${t==='passport'?'여권 정보':t==='card'?'카드 정보':'메모'}를 넣어 보세요.</p>`}</div></div>`;
  openSheet(`<div class="vault">${shHead('여권 · 카드','3분 동안 손대지 않거나 앱을 나가면 다시 잠겨요.',`<button class="vlock-ic open" data-vlock aria-label="지금 잠그기">${svg('lock','')}</button>`)}
    ${sec('passport',grp('passport').map(x=>`<div class="card vcard" data-hold="${x.id}" data-holdkind="vault">${head(x,x.who||'여권','passport')}${row('여권번호',x.no,1)}${row('영문 이름',x.name)}${row('생년월일',x.birth)}${row('발급일',x.issued)}${row('만료일',x.exp)}${photo(x)}</div>`).join(''))}
    ${sec('card',grp('card').map(x=>`<div class="card vcard" data-hold="${x.id}" data-holdkind="vault">${head(x,x.title||'카드','card')}${row('카드 번호',cardNo(x.no),1)}${row('유효기간',x.exp)}${x.tel?`<a class="vrow" href="tel:${esc(x.tel.replace(/[^+\d]/g,''))}"><span class="k">분실 신고</span><span class="v">${esc(x.tel)}</span>${svg('phone')}</a>`:''}${x.memo?`<p class="vmemo">${esc(x.memo)}</p>`:''}${photo(x)}</div>`).join(''))}
    ${sec('memo',grp('memo').map(x=>`<div class="card vcard" data-hold="${x.id}" data-holdkind="vault">${head(x,x.title||'메모','memo')}${x.body?`<p class="vmemo">${esc(x.body)}</p>`:''}${photo(x)}</div>`).join(''))}
    <p class="fine">항목을 누르면 복사돼요. 길게 누르면 지울 수 있어요.</p>
    <button class="btn ghost sm" data-vrepass style="align-self:center">${svg('gear')}비밀번호 바꾸기</button></div>`);
  vFillPhotos();
}
async function vPhoto(pid){const r=Sync.get('vaultf',pid);if(!r||!r.ct||!VAULT.key)return '';try{return (await vDec(VAULT.key,r)).d;}catch(e){return '';}}
async function vFillPhotos(){for(const im of document.querySelectorAll('img[data-vimg]')){const d=await vPhoto(im.dataset.vimg);if(d)im.src=d;else im.closest('.vphoto').hidden=true;}}

function vEditPop(type,id){
  const x=id?vItems().find(i=>i.id===id):{type},f=V_FIELDS[x.type];if(!x)return;state.vphoto=undefined;
  floatPop(`<div class="fp-h"><b>${V_TYPES[x.type][0]} ${id?'고치기':'추가'}</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div>
    <div class="fp-form sp-form">${f.map(([k,l,ph,cls])=>`<label><span>${l}</span>${cls==='area'?`<textarea id="vf-${k}" rows="3" placeholder="${esc(ph)}">${esc(x[k]||'')}</textarea>`:`<input type="text" id="vf-${k}" class="${cls||''}" value="${esc(x[k]||'')}" placeholder="${esc(ph)}" autocomplete="off" ${k==='no'||k==='exp'?'inputmode="text"':''}>`}</label>`).join('')}
      <label><span>사진 (선택${x.type==='passport'?' · 여권 사진면':''})</span><input type="file" id="vf-photo" accept="image/*"></label>
      ${x.photo?`<label class="toggle" for="vf-nophoto"><input type="checkbox" id="vf-nophoto">지금 사진 지우기</label>`:''}
      <div class="sp-acts"><button class="btn" data-closefp>취소</button><button class="btn acc" data-vsave="${x.type}|${id||''}">저장</button></div></div>`);}
async function vSave(type,id){if(!VAULT.key){closeFloat();vaultSheet();return;}
  const its=vItems(),old=id?its.find(i=>i.id===id):null,x={...(old||{}),id:id||uid(),type};
  V_FIELDS[type].forEach(([k])=>{const el=$('#vf-'+k);x[k]=el?el.value.trim():'';});
  const file=$('#vf-photo')&&$('#vf-photo').files[0],drop=$('#vf-nophoto')&&$('#vf-nophoto').checked;
  if(file){try{const b=await downscale(file,1600),d=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b);});
      if(old&&old.photo)Sync.remove('vaultf',old.photo);const pid=uid();Sync.put('vaultf',pid,await vEnc(VAULT.key,{d}));x.photo=pid;}catch(e){toast('사진을 읽지 못했어요.');return;}}
  else if(drop&&old&&old.photo){Sync.remove('vaultf',old.photo);x.photo='';}
  VAULT.data.items=old?its.map(i=>i.id===id?x:i):[...its,x];await vWrite();closeFloat();vaultSheet();toast(old?'고쳤어요.':'넣었어요.');}

document.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(e.target.id==='vpw'&&$('[data-vunlock]'))$('[data-vunlock]').click();else if(e.target.id==='vpw2')$('[data-vcreate]').click();});
document.addEventListener('click',async e=>{
  const t=e.target.closest('[data-vault],[data-vcreate],[data-vunlock],[data-vlock],[data-vadd],[data-vedit],[data-vsave],[data-vcopy],[data-vphoto],[data-delvault],[data-vreset],[data-vrepass],[data-vrpsave]');if(!t)return;const ds=t.dataset,err=m=>{const x=$('#vErr');if(x){x.textContent=m;x.hidden=!m;}};
  if(ds.vault!==undefined){vaultSheet();}
  else if(ds.vcreate!==undefined){const a=$('#vpw').value,b=$('#vpw2').value;if(a.length<6)return err('6자리 이상으로 정해 주세요.');if(a!==b)return err('두 번 넣은 비밀번호가 달라요.');
    t.disabled=true;await vCreate(a);vaultSheet();toast('만들었어요. 이제 넣어 보세요.');}
  else if(ds.vunlock!==undefined){if(Date.now()<VAULT.until)return;const pw=$('#vpw').value;if(!pw)return;t.disabled=true;t.textContent='여는 중…';
    if(await vUnlock(pw)){vaultSheet();return;}
    VAULT.fails++;if(VAULT.fails>=5){VAULT.until=Date.now()+30000;VAULT.fails=0;vaultSheet();return;}
    t.disabled=false;t.textContent='열기';err(`비밀번호가 달라요. (${VAULT.fails}/5)`);const i=$('#vpw');i.value='';i.focus();i.classList.remove('shake');void i.offsetWidth;i.classList.add('shake');}
  else if(ds.vlock!==undefined){vLock();}
  else if(ds.vadd){vEditPop(ds.vadd);}
  else if(ds.vedit){const x=vItems().find(i=>i.id===ds.vedit);if(x)vEditPop(x.type,x.id);}
  else if(ds.vsave){const [ty,id]=ds.vsave.split('|');t.disabled=true;await vSave(ty,id);}
  else if(ds.vcopy!==undefined){try{await navigator.clipboard.writeText(ds.vcopy);toast('복사했어요.');}catch(_){toast(ds.vcopy);}}
  else if(ds.vphoto){const d=await vPhoto(ds.vphoto);if(d)floatPop(`<div class="fp-h"><b>사진</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div><img class="vbig" src="${d}" alt="">`);}
  else if(ds.delvault){closeHoldPop();if(!VAULT.key)return;const x=vItems().find(i=>i.id===ds.delvault);if(!x)return;if(x.photo)Sync.remove('vaultf',x.photo);
    VAULT.data.items=vItems().filter(i=>i.id!==x.id);await vWrite();vaultSheet();toast('지웠어요.');}
  else if(ds.vreset!==undefined){if(!confirm('비밀번호를 잊으면 안에 든 내용은 되찾을 수 없어요.\n모두 지우고 새로 만들까요?'))return;
    Sync.list('vaultf').forEach(f=>Sync.remove('vaultf',f.id));Sync.remove('vault','main');VAULT.key=null;VAULT.data=null;vaultSheet();}
  else if(ds.vrepass!==undefined){floatPop(`<div class="fp-h"><b>비밀번호 바꾸기</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div>
      <div class="fp-form"><input type="password" id="vrp0" inputmode="numeric" placeholder="지금 비밀번호" autocomplete="current-password"><input type="password" id="vrp1" inputmode="numeric" placeholder="새 비밀번호 (6자리 이상)" autocomplete="new-password"><input type="password" id="vrp2" inputmode="numeric" placeholder="새 비밀번호 한 번 더" autocomplete="new-password">
      <p class="err" id="vErr" hidden></p><button class="btn acc" data-vrpsave>바꾸기</button></div>`);}
  else if(ds.vrpsave!==undefined){const o=$('#vrp0').value,a=$('#vrp1').value,b=$('#vrp2').value;if(a.length<6)return err('6자리 이상으로 정해 주세요.');if(a!==b)return err('새 비밀번호 두 개가 달라요.');
    t.disabled=true;const r=vRow();try{const raw=await vOpen(await vKek(o,b64u8(r.salt)),r.wk),salt=crypto.getRandomValues(new Uint8Array(16));
      Sync.put('vault','main',{...r,salt:u8b64(salt),wk:await vSeal(await vKek(a,salt),raw)});closeFloat();toast('비밀번호를 바꿨어요. 보연에게도 알려 주세요.');}
    catch(_){t.disabled=false;err('지금 비밀번호가 달라요.');}}
});
