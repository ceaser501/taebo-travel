/* Local-first storage with background sync to Supabase.
   Every change is written to this device first (works offline), then pushed when a connection and a session exist.
   Rows are documents keyed by (kind, id); the newest updated_at wins. Files (tickets, photos) are kept in IndexedDB
   so they open without a network, and uploaded to the private "trip-files" bucket when possible. */
const SUPABASE_URL='https://gxyckkinlygeasruapmj.supabase.co';
const SUPABASE_KEY='sb_publishable__NKAf1NZsOddwbkgqYGTbw_Smez0lcv';
const BUCKET='trip-files';

const LS={
  get(k,d){try{const v=localStorage.getItem('tt:'+k);return v==null?d:JSON.parse(v);}catch(e){return d;}},
  set(k,v){try{localStorage.setItem('tt:'+k,JSON.stringify(v));return true;}catch(e){return false;}},
  del(k){try{localStorage.removeItem('tt:'+k);}catch(e){}}
};

/* ---------- IndexedDB blob cache ---------- */
const FileCache=(()=>{
  let dbp=null;
  const db=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open('taebo-travel',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));
  const tx=async(mode,fn)=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction('files',mode),s=t.objectStore('files'),q=fn(s);t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);});};
  return {
    put:(k,blob)=>tx('readwrite',s=>s.put(blob,k)),
    get:k=>tx('readonly',s=>s.get(k)).catch(()=>null),
    del:k=>tx('readwrite',s=>s.delete(k)).catch(()=>{}),
    keys:()=>tx('readonly',s=>s.getAllKeys()).catch(()=>[]),
  };
})();

const Sync=(()=>{
  const sb=window.supabase?window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,storageKey:'tt-auth'}}):null;
  let items=LS.get('items',{});           // key "kind:id" -> {kind,id,data,deleted,updated_at,dirty}
  let meta=LS.get('meta',{});             // {tripId,uid,inviteCode,tripName,lastPull}
  let members=LS.get('members',[]);       // [{user_id,display_name,color}]
  let pendingFiles=LS.get('pendingFiles',[]); // [path]
  let channel=null, pushTimer=null, busy=false, status='idle', listeners=new Set();
  const save=()=>{if(meta.guest)return;LS.set('items',items);LS.set('meta',meta);LS.set('pendingFiles',pendingFiles);};
  const emit=what=>listeners.forEach(f=>{try{f(what);}catch(e){console.error(e);}});
  const setStatus=s=>{if(status!==s){status=s;emit('status');}};
  const online=()=>navigator.onLine!==false;
  const key=(k,i)=>k+':'+i;

  /* read-only view through a share link (?view=KEY): the trip is loaded through public read-only functions,
     kept in memory only, refreshed every minute, and nothing can be changed */
  const VIEW=(()=>{try{const q=new URLSearchParams(location.search).get('view');if(q){sessionStorage.setItem('tt:view',q);return q;}return sessionStorage.getItem('tt:view');}catch(e){return null;}})();
  if(VIEW){items={};meta={tripId:'view',guest:true};members=[];pendingFiles=[];}
  async function guestPull(){
    if(!sb) return;
    if(!online()){setStatus('offline');return;}
    setStatus('syncing');
    try{
      const [{data,error},{data:ms}]=await Promise.all([sb.rpc('trip_share_items',{p_token:VIEW}),sb.rpc('trip_share_members',{p_token:VIEW})]);
      if(error) throw error;
      if(!data||!data.length){setStatus('error');emit('noshare');return;}
      const next={};data.forEach(r=>{next[key(r.kind,r.id)]={kind:r.kind,id:r.id,data:r.data||{},deleted:false,updated_at:r.updated_at,dirty:false};});
      items=next;members=ms||[];setStatus('synced');emit('items');emit('members');
    }catch(e){console.warn('view',e);setStatus(online()?'error':'offline');}
  }

  function put(kind,id,data,opts={}){
    if(meta.guest){emit('readonly');return;}
    items[key(kind,id)]={kind,id,data,deleted:!!opts.deleted,updated_at:new Date().toISOString(),dirty:true};
    save();emit('items');schedulePush();
  }
  const remove=(kind,id)=>put(kind,id,{},{deleted:true});
  const get=(kind,id)=>{const r=items[key(kind,id)];return r&&!r.deleted?r.data:null;};
  const list=kind=>Object.values(items).filter(r=>r.kind===kind&&!r.deleted).map(r=>({id:r.id,...r.data,_at:r.updated_at}));
  const dirtyCount=()=>Object.values(items).filter(r=>r.dirty).length+pendingFiles.length;

  function schedulePush(){clearTimeout(pushTimer);pushTimer=setTimeout(syncNow,600);}
  async function session(){if(!sb)return null;try{const {data}=await sb.auth.getSession();return data.session;}catch(e){return null;}}

  function merge(row){
    const k=key(row.kind,row.id),cur=items[k];
    if(cur&&cur.dirty&&cur.updated_at>row.updated_at) return false;
    items[k]={kind:row.kind,id:row.id,data:row.data||{},deleted:row.deleted,updated_at:row.updated_at,dirty:false};
    return true;
  }
  async function push(uid){
    const dirty=Object.values(items).filter(r=>r.dirty);
    if(!dirty.length) return;
    const rows=dirty.map(r=>({trip_id:meta.tripId,kind:r.kind,id:r.id,data:r.data,deleted:r.deleted,updated_at:r.updated_at,updated_by:uid}));
    const {error}=await sb.from('trip_items').upsert(rows,{onConflict:'trip_id,kind,id'});
    if(error) throw error;
    dirty.forEach(r=>{const cur=items[key(r.kind,r.id)];if(cur&&cur.updated_at===r.updated_at)cur.dirty=false;});
    save();
  }
  async function pull(){
    let since=meta.lastPull||'1970-01-01T00:00:00Z',changed=false;
    for(let page=0;page<20;page++){
      const {data,error}=await sb.from('trip_items').select('*').eq('trip_id',meta.tripId).gt('server_ts',since).order('server_ts').limit(500);
      if(error) throw error;
      data.forEach(r=>{if(merge(r))changed=true;since=r.server_ts;});
      if(data.length<500) break;
    }
    meta.lastPull=since;save();
    if(changed) emit('items');
  }
  async function loadMembers(){
    const {data,error}=await sb.from('trip_members').select('user_id,display_name,color').eq('trip_id',meta.tripId).order('joined_at');
    if(!error&&data){members=data;LS.set('members',members);emit('members');}
  }
  async function uploadPending(){
    for(const path of [...pendingFiles]){
      const blob=await FileCache.get(path);
      if(!blob){pendingFiles=pendingFiles.filter(p=>p!==path);continue;}
      const {error}=await sb.storage.from(BUCKET).upload(path,blob,{upsert:true,contentType:blob.type||'application/octet-stream'});
      if(error&&!/exists/i.test(error.message)) throw error;
      pendingFiles=pendingFiles.filter(p=>p!==path);save();
    }
  }
  async function prefetchFiles(){
    // tickets first: they must open at the gate without a network
    const paths=[];
    list('ticket').forEach(t=>(t.files||[]).forEach(f=>paths.push(f.path)));
    list('diary').forEach(d=>d.photo&&paths.push(d.photo));
    const have=new Set(await FileCache.keys());
    for(const p of paths){ if(have.has(p)) continue;
      const {data,error}=await sb.storage.from(BUCKET).download(p);
      if(!error&&data){await FileCache.put(p,data);emit('files');}
    }
  }
  async function syncNow(){
    if(meta.guest) return guestPull();
    if(!sb||!meta.tripId||busy) return;
    if(!online()){setStatus('offline');return;}
    const s=await session(); if(!s){setStatus('signedout');return;}
    busy=true;setStatus('syncing');
    try{await uploadPending();await push(s.user.id);await pull();await loadMembers();setStatus(dirtyCount()?'pending':'synced');prefetchFiles().catch(()=>{});}
    catch(e){console.warn('sync',e);setStatus(online()?'error':'offline');}
    finally{busy=false;}
    subscribe();
  }
  function subscribe(){
    if(!sb||!meta.tripId||channel) return;
    channel=sb.channel('trip-'+meta.tripId)
      .on('postgres_changes',{event:'*',schema:'public',table:'trip_items',filter:'trip_id=eq.'+meta.tripId},p=>{
        const r=p.new; if(r&&r.kind&&merge(r)){save();emit('items');if(r.kind==='ticket'||r.kind==='diary')prefetchFiles().catch(()=>{});}
      }).subscribe();
  }
  async function addFile(blob,ext){
    const path=`${meta.tripId}/${crypto.randomUUID()}.${ext}`;
    await FileCache.put(path,blob);
    pendingFiles.push(path);save();schedulePush();
    return path;
  }
  async function fileURL(path){
    let blob=await FileCache.get(path);
    if(!blob&&sb&&online()){const {data}=await sb.storage.from(BUCKET).download(path);if(data){blob=data;await FileCache.put(path,data);}}
    return blob?URL.createObjectURL(blob):null;
  }
  const hasFile=async path=>!!(await FileCache.get(path));

  /* ---------- auth & trip membership ---------- */
  async function signIn(email,password){const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;return data.session;}
  async function signUp(email,password){const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;return data.session;}
  async function myTrip(){
    const s=await session(); if(!s) return null;
    const {data,error}=await sb.from('trip_members').select('trip_id,trip_trips(id,name,invite_code)').eq('user_id',s.user.id).limit(1);
    if(error) throw error;
    if(!data.length) return null;
    useTrip(data[0].trip_trips,s.user.id);return data[0].trip_trips;
  }
  function useTrip(t,uid){
    if(meta.tripId&&meta.tripId!==t.id){items={};meta={};}
    meta.tripId=t.id;meta.uid=uid;meta.inviteCode=t.invite_code;meta.tripName=t.name;save();
  }
  async function createTrip(name,display,color){const s=await session();const {data,error}=await sb.rpc('trip_create',{p_name:name,p_display_name:display,p_color:color});if(error)throw error;useTrip(data,s.user.id);await syncNow();return data;}
  async function joinTrip(code,display,color){const s=await session();const {data,error}=await sb.rpc('trip_join',{p_code:code,p_display_name:display,p_color:color});if(error)throw error;useTrip(data,s.user.id);await syncNow();return data;}
  async function updateProfile(display,color){const {error}=await sb.from('trip_members').update({display_name:display,color}).eq('trip_id',meta.tripId).eq('user_id',meta.uid);if(error)throw error;await loadMembers();}
  async function signOut(){try{if(channel){sb.removeChannel(channel);channel=null;}await sb.auth.signOut();}catch(e){}
    items={};meta={};members=[];pendingFiles=[];['items','meta','members','pendingFiles'].forEach(LS.del);emit('items');}

  if(VIEW) setInterval(()=>{if(document.visibilityState==='visible')guestPull();},60000);
  // members turn the read-only link on or off, or read it
  async function share(mode){const {data,error}=await sb.rpc('trip_share_set',{p_trip:meta.tripId,p_mode:mode});if(error)throw error;return data;}
  window.addEventListener('online',()=>syncNow());
  window.addEventListener('offline',()=>setStatus('offline'));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow();});

  return {sb,put,remove,get,list,syncNow,share,addFile,fileURL,hasFile,signIn,signUp,signOut,session,myTrip,createTrip,joinTrip,updateProfile,
    on:f=>listeners.add(f),get meta(){return meta;},get members(){return members;},get status(){return status;},dirtyCount};
})();
