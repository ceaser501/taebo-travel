/* ===================== 임산부 긴급카드: what to show and whom to call when something is wrong =====================
   Opens without a password on purpose: in an emergency it must open at once. The details here (due date,
   blood type, allergies) are synced to both of us like the rest of the trip. */
const EM_PHRASES=[
  ['お腹が痛いです','おなかが いたいです','배가 아파요'],
  ['出血しています','しゅっけつ して います','출혈이 있어요'],
  ['破水しました','はすい しました','양수가 터졌어요'],
  ['気分が悪いです','きぶんが わるいです','몸이 안 좋아요 · 어지러워요'],
  ['救急車を呼んでください','きゅうきゅうしゃを よんで ください','구급차를 불러 주세요'],
  ['産婦人科に行きたいです','さんふじんかに いきたいです','산부인과에 가고 싶어요'],
  ['近くの病院はどこですか','ちかくの びょういんは どこですか','가까운 병원이 어디예요?'],
  ['韓国語を話せる人はいますか','かんこくごを はなせる ひとは いますか','한국어 하는 분 있나요?'],
];
const EM_CALLS=[
  ['119','구급차 · 119','일본어로 말해요. 위 문장을 보여 주거나 들려주세요.'],
  ['050-3816-2787','관광객 핫라인 (JNTO)','24시간 · 한국어 · 병원 안내와 통역'],
  ['+82-2-3210-0404','영사콜센터 (서울)','24시간 · 한국어 · 사건사고 도움'],
  ['110','경찰 · 110','분실 · 도난 · 사고'],
];
const emInfo=()=>Sync.get('emergency','info')||{};
// weeks of pregnancy on a given day, from the due date (40 weeks)
function pregWeeks(due,on){if(!due)return null;const d=new Date(due+'T00:00:00'),t=on||new Date();t.setHours(0,0,0,0);
  const g=280-Math.round((d-t)/86400000);return g>0&&g<300?{w:Math.floor(g/7),d:g%7}:null;}
function emCardPhrase(){const m=emInfo(),pw=pregWeeks(m.due);
  const ja=['私は妊婦です。'+(pw?`妊娠${pw.w}週です。`:''),m.blood?`血液型は${m.blood}型です。`:'',m.allergy?`アレルギー・服用中の薬：${m.allergyJa||m.allergy}`:''].filter(Boolean).join('\n');
  const kana=['わたしは にんぷです。'+(pw?`にんしん ${pw.w}しゅう です。`:''),m.blood?`けつえきがたは ${m.blood}がた です。`:''].filter(Boolean).join(' ');
  const ko=['저는 임산부예요.'+(pw?` 임신 ${pw.w}주예요.`:''),m.blood?`혈액형 ${m.blood}형`:'',m.allergy?`알레르기: ${m.allergy}`:''].filter(Boolean).join(' · ');
  return [ja,kana,ko];}
function emergencySheet(){
  const m=emInfo(),pw=pregWeeks(m.due),card=emCardPhrase(),h=typeof hotelPhrase==='function'&&hotelPhrase();
  const q=encodeURIComponent;
  openSheet(`<div class="emer">${shHead('임산부 긴급카드','위급할 때 이 화면을 직원이나 구급대원에게 보여 주세요.',`<span class="em-ic">${svg('heart','')}</span>`)}
    <button class="em-main" data-emcard><span class="ja" lang="ja" translate="no">${esc(card[0]).replace(/\n/g,'<br>')}</span><span class="ko">${esc(card[2])}</span><span class="tap">눌러서 크게 보여주기</span></button>
    <div class="em-me">${pw?`<span><b>임신 ${pw.w}주 ${pw.d}일</b>${m.due?` · 예정일 ${esc(m.due)}`:''}</span>`:'<span class="fine">출산 예정일을 넣으면 임신 주수가 자동으로 나와요.</span>'}
      <button class="ic-btn" data-emedit aria-label="내 정보 고치기">${svg('pen')}</button></div>
    ${m.hosp||m.note?`<div class="em-note">${m.hosp?`<div><span class="k">한국 병원</span>${esc(m.hosp)}${m.hospTel?` · <a href="tel:${esc(m.hospTel.replace(/[^+\d]/g,''))}">${esc(m.hospTel)}</a>`:''}</div>`:''}${m.note?`<div><span class="k">메모</span>${esc(m.note)}</div>`:''}</div>`:''}
    <div><div class="grp" style="margin-top:0">바로 전화</div><div class="em-calls">${EM_CALLS.map(([n,t,s])=>`<a class="em-call${n==='119'?' red':''}" href="tel:${n.replace(/[^+\d]/g,'')}"><span class="m"><b>${t}</b><span>${s}</span></span><span class="n mono">${n}</span></a>`).join('')}</div></div>
    <div><div class="grp">가까운 병원 찾기</div><div class="em-find">
      <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q('産婦人科')}" target="_blank" rel="noopener">${svg('pin')}산부인과</a>
      <a class="btn" href="https://www.google.com/maps/search/?api=1&query=${q('救急病院')}" target="_blank" rel="noopener">${svg('pin')}응급실 (救急病院)</a></div></div>
    <div><div class="grp">이렇게 말해요 · 누르면 크게, 스피커는 일본어로</div><div class="em-ph">${EM_PHRASES.map((p,i)=>`<div class="em-row"><button class="em-say" data-emph="${i}"><b lang="ja" translate="no">${esc(p[0])}</b><span>${esc(p[2])}</span></button><button class="say-ic" data-say="${esc(p[0])}" aria-label="일본어로 듣기">${svg('speak')}</button></div>`).join('')}</div></div>
    <div class="em-more">${h?`<button class="btn ghost" data-bighotel>${svg('home')}숙소 주소 보여주기</button>`:''}<button class="btn ghost" data-vault>${svg('lock')}보험 · 여권 (여권·카드)</button></div>
  </div>`);}
function emEditPop(){const m=emInfo();
  floatPop(`<div class="fp-h"><b>내 정보</b><button class="ov-x" data-closefp aria-label="닫기">×</button></div>
    <div class="fp-form sp-form">
      <div class="sp-row"><label><span>출산 예정일</span><input type="date" id="em-due" value="${esc(m.due||'')}"></label><label><span>혈액형</span><select id="em-blood">${['','A','B','O','AB'].map(b=>`<option value="${b}" ${m.blood===b?'selected':''}>${b?b+'형':'모름'}</option>`).join('')}</select></label></div>
      <label><span>알레르기 · 복용 약 (선택)</span><input type="text" id="em-allergy" value="${esc(m.allergy||'')}" placeholder="예: 페니실린, 철분제 복용 중" autocomplete="off"></label>
      <div class="sp-row"><label><span>다니는 병원 (선택)</span><input type="text" id="em-hosp" value="${esc(m.hosp||'')}" placeholder="예: OO여성병원" autocomplete="off"></label><label><span>병원 전화</span><input type="tel" id="em-hospTel" value="${esc(m.hospTel||'')}" placeholder="+82-2-…" autocomplete="off"></label></div>
      <label><span>메모 (선택)</span><input type="text" id="em-note" value="${esc(m.note||'')}" placeholder="예: 임신성 당뇨 관리 중" autocomplete="off"></label>
      <button class="btn acc" data-emsave>저장</button></div>`);}
document.addEventListener('click',async e=>{const t=e.target.closest('[data-emergency],[data-emcard],[data-emph],[data-emedit],[data-emsave]');if(!t)return;const ds=t.dataset;
  if(ds.emergency!==undefined)emergencySheet();
  else if(ds.emcard!==undefined)bigPhrase(emCardPhrase());
  else if(ds.emph!==undefined)bigPhrase(EM_PHRASES[+ds.emph]);
  else if(ds.emedit!==undefined)emEditPop();
  else if(ds.emsave!==undefined){const v=k=>($('#em-'+k)?$('#em-'+k).value:'').trim(),old=emInfo(),allergy=v('allergy');
    // the allergy note goes on the Japanese card, so it is kept in Japanese too
    let allergyJa=allergy===old.allergy?old.allergyJa||'':'';
    if(allergy&&!allergyJa){t.disabled=true;try{allergyJa=(await translateText(allergy)).ja||'';}catch(_){}}
    Sync.put('emergency','info',{due:v('due'),blood:v('blood'),allergy,allergyJa,hosp:v('hosp'),hospTel:v('hospTel'),note:v('note')});closeFloat();emergencySheet();toast('저장했어요.');}
});
