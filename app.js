const $=id=>document.getElementById(id);

let raw=JSON.parse(localStorage.getItem('coupleData')||'{}');
let data={start:raw.start||'',names:Array.isArray(raw.names)?raw.names:['',''],messages:Array.isArray(raw.messages)?raw.messages:[],trips:[],finished:[]};

function authKey(){return 'coupleAuth';}
function isLoginPage(){return location.pathname.endsWith('/login.html')||location.pathname.endsWith('login.html')}
function getAuth(){try{return JSON.parse(localStorage.getItem(authKey())||'null')}catch(e){return null}}
function requireAuth(){if(!isLoginPage()&&!getAuth()){location.replace('login.html');return false}return true}

function loginCouple(){
  const code=($('coupleCode')?.value||'').trim().toUpperCase();
  const pin=$('pin')?.value||'';
  const a=getAuth();
  const err=$('loginError');
  if(!a){
    if(err){err.textContent='ဒီဖုန်းမှာ Couple Account မရှိသေးပါ။ အောက်က Setup ကို အရင်လုပ်ပါ။';err.style.display='block'}
    return;
  }
  if(code!==a.code||pin!==a.pin){
    if(err){err.textContent='Couple Code သို့မဟုတ် PIN မမှန်ပါ။';err.style.display='block'}
    return;
  }
  sessionStorage.setItem('coupleSession','1');
  location.replace('index.html');
}

function createCoupleAccount(){
  const code=($('setupCode')?.value||'').trim().toUpperCase();
  const n1=($('setupName1')?.value||'').trim();
  const n2=($('setupName2')?.value||'').trim();
  const pin=$('setupPin')?.value||'';
  const start=$('setupStart')?.value||'';
  const err=$('setupError');

  if(!code||!n1||!n2||!start||!/^[0-9]{4,6}$/.test(pin)){
    if(err){
      err.textContent='Code, နှစ်ယောက်အမည်, PIN (4–6 လုံး) နဲ့ Relationship Start Date အားလုံးဖြည့်ပါ။';
      err.style.display='block';
    }
    return;
  }

  localStorage.setItem(authKey(),JSON.stringify({code,pin}));
  data.names=[n1,n2];
  data.start=start;
  save();
  sessionStorage.setItem('coupleSession','1');
  location.replace('index.html');
}

function getOwner(){
  try{return JSON.parse(localStorage.getItem('coupleOwner')||'null')}catch(e){return null}
}

function saveOwnerSettings(){
  const gmail=($('ownerGmail')?.value||'').trim().toLowerCase();
  const partnerGmail=($('partnerGmail')?.value||'').trim().toLowerCase();
  const name=($('ownerName')?.value||'').trim();
  const err=$('ownerError');

  if(!gmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmail)){
    if(err){
      err.textContent='မှန်ကန်တဲ့ Gmail address ထည့်ပါ။';
      err.style.display='block';
      err.style.color='#fecaca';
    }
    return;
  }

  const old=getOwner()||{};
  if(partnerGmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerGmail)){
    if(err){
      err.textContent='Partner Gmail address မှန်ကန်စွာ ထည့်ပါ။';
      err.style.display='block';
      err.style.color='#fecaca';
    }
    return;
  }

  localStorage.setItem('coupleOwner',JSON.stringify({
    ...old,
    gmail,
    partnerGmail,
    name,
    updatedAt:new Date().toISOString()
  }));

  if(window.cloudSaveCoupleData && window.firebaseUser?.()){
    window.cloudSaveCoupleData(getLocalCoupleData()).catch(e=>console.warn('Owner metadata sync:',e));
  }

  if(err){
    err.textContent='✓ Owner Gmail ကို သိမ်းပြီးပါပြီ။';
    err.style.display='block';
    err.style.color='#86efac';
  }
  renderOwnerSettings();
}

function renderOwnerSettings(){
  const o=getOwner();

  if($('ownerGmail')) $('ownerGmail').value=o?.gmail||'';
  if($('partnerGmail')) $('partnerGmail').value=o?.partnerGmail||'';
  if($('ownerName')) $('ownerName').value=o?.name||'';

  if($('ownerStatus')){
    if(o?.firebaseConnected){
      $('ownerStatus').textContent='✓ Firebase Google Owner Connected: '+(o.email||o.gmail);
    }else if(o?.gmail){
      $('ownerStatus').textContent='Owner Gmail: '+o.gmail+' · Firebase မချိတ်ရသေးပါ';
    }else{
      $('ownerStatus').textContent='Owner Gmail မသတ်မှတ်ရသေးပါ';
    }
  }
}

function disconnectOwnerFirebase(){
  const o=getOwner()||{};
  delete o.firebaseConnected;
  delete o.firebaseUid;
  delete o.photoURL;
  delete o.email;
  delete o.connectedAt;
  localStorage.setItem('coupleOwner',JSON.stringify(o));
  renderOwnerSettings();
}
function logoutCouple(){
  sessionStorage.removeItem('coupleSession');
  location.replace('login.html');
}

async function syncCloudNow(){
  const status=$('cloudSyncStatus');
  const setStatus=(msg,ok=false)=>{
    if(status){
      status.textContent=msg;
      status.style.color=ok?'#86efac':'';
    }
  };

  if(!window.firebaseUser || !window.firebaseUser()){
    setStatus('⚠️ Firebase Owner အဖြစ် Google နဲ့ အရင် Connect လုပ်ပါ။');
    return;
  }

  try{
    setStatus('☁️ Cloud Sync စစ်နေပါတယ်...');
    await window.cloudSaveCoupleData(getLocalCoupleData());
    const remote=await window.cloudLoadCoupleData();
    if(remote){
      setStatus('✓ Firestore Cloud Sync အလုပ်လုပ်နေပါပြီ။ '+new Date().toLocaleTimeString(),true);
    }else{
      setStatus('⚠️ Firestore document မတွေ့သေးပါ။');
    }
  }catch(error){
    console.error(error);
    setStatus('❌ Cloud Sync Error: '+(error.code||error.message||error));
  }
}


async function checkFirebaseNow(){
  const status=$('firebaseStatus');
  const setStatus=(msg,ok=false)=>{
    if(status){
      status.textContent=msg;
      status.style.color=ok?'#86efac':'#fde68a';
    }
  };

  try{
    setStatus('⏳ Firebase connection စစ်နေပါတယ်…');
    if(!window.firebaseReady || !window.firebaseUser){
      setStatus('❌ Firebase client မဖွင့်နိုင်သေးပါ။');
      return;
    }
    await window.firebaseReady;
    const user=window.firebaseUser();
    if(!user){
      setStatus('⚠️ Firebase Google account မချိတ်ရသေးပါ။ Connect with Google ကိုနှိပ်ပါ။');
      return;
    }
    const owner=getOwner()||{};
    if(owner.gmail && user.email && owner.gmail.toLowerCase()!==user.email.toLowerCase()){
      setStatus('❌ Google account နဲ့ Owner Gmail မကိုက်ပါ။');
      return;
    }
    if(window.cloudLoadCoupleData){
      const remote=await window.cloudLoadCoupleData();
      if(remote){
        setStatus('✓ Firebase + Google Auth + Firestore အလုပ်လုပ်နေပါပြီ။ '+user.email,true);
      }else{
        setStatus('✓ Google Auth အလုပ်လုပ်နေပါပြီ။ Firestore document မရှိသေးပါ။',true);
      }
    }else{
      setStatus('✓ Google Auth ချိတ်ပြီးပါပြီ။ Cloud module မပြည့်စုံသေးပါ။',true);
    }
  }catch(error){
    console.error(error);
    setStatus('❌ Firebase Error: '+(error.code||error.message||error));
  }
}
window.checkFirebaseNow=checkFirebaseNow;
if(!isLoginPage()) requireAuth();

function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#039;'
  }[c]));
}

function getLocalCoupleData(){
  return {
    start:data.start||'',
    names:Array.isArray(data.names)?data.names:[],
    messages:Array.isArray(data.messages)?data.messages:[],
    trips:Array.isArray(data.trips)?data.trips:[],
    finished:Array.isArray(data.finished)?data.finished:[]
  };
}
window.getLocalCoupleData=getLocalCoupleData;

function save(){
  const snapshot=getLocalCoupleData();
  localStorage.setItem('coupleData',JSON.stringify(snapshot));

  if(window.cloudSaveCoupleData && !window.__cloudHydrating){
    window.cloudSaveCoupleData(snapshot).catch(error=>{
      console.warn('Cloud save skipped:',error?.code||error?.message||error);
    });
  }
}

function duration(s){
  let a=new Date(s),b=new Date();
  let y=b.getFullYear()-a.getFullYear();
  let m=b.getMonth()-a.getMonth();
  let d=b.getDate()-a.getDate();
  if(d<0){
    m--;
    d+=new Date(b.getFullYear(),b.getMonth(),0).getDate();
  }
  if(m<0){
    y--;
    m+=12;
  }
  return y+'y '+m+'m '+d+'d';
}

function makeTrip(name,dest,date){
  return {id:Date.now()+Math.random(),name,dest,date,steps:[],finishedAt:null};
}

function normalizeTrips(list){
  const grouped=[];
  (list||[]).forEach(item=>{
    if(Array.isArray(item.steps)){
      grouped.push({...item,steps:item.steps||[]});
      return;
    }
    const key=(item.name||'')+'|'+(item.dest||'')+'|'+(item.date||'');
    let t=grouped.find(x=>x._legacyKey===key);
    if(!t){
      t=makeTrip(item.name||'Unnamed Trip',item.dest||'',item.date||'');
      t._legacyKey=key;
    }
    t.steps.push({
      id:item.id||Date.now()+Math.random(),
      route:item.route||'',
      expense:Number(item.expense||0),
      type:item.type||'Transport',
      arrivedAt:null
    });
    if(!grouped.includes(t)) grouped.push(t);
  });
  grouped.forEach(t=>delete t._legacyKey);
  return grouped;
}

function normalizeFinished(list){
  const grouped=[];
  (list||[]).forEach(item=>{
    if(Array.isArray(item.steps)){
      grouped.push({...item,steps:item.steps||[]});
      return;
    }
    const key=(item.name||'')+'|'+(item.dest||'')+'|'+(item.date||'');
    let t=grouped.find(x=>x._legacyKey===key);
    if(!t){
      t=makeTrip(item.name||'Unnamed Trip',item.dest||'',item.date||'');
      t.finishedAt=item.finishedAt||null;
      t._legacyKey=key;
    }
    t.steps.push({
      id:item.id||Date.now()+Math.random(),
      route:item.route||'',
      expense:Number(item.expense||0),
      type:item.type||'Transport',
      arrivedAt:item.arrivedAt||null
    });
    if(!grouped.includes(t)) grouped.push(t);
  });
  grouped.forEach(t=>delete t._legacyKey);
  return grouped;
}

data.trips=normalizeTrips(raw.trips);
data.finished=normalizeFinished(raw.finished);
save();

function tripTotal(t){
  return (t.steps||[]).reduce((sum,s)=>sum+Number(s.expense||0),0);
}

function init(){
  // Login page has its own UI and must not run the main app renderer.
  if(isLoginPage()) return;
  if(!requireAuth()) return;

  if($('name1')){
    $('name1').value=data.names[0]||'';
    $('name2').value=data.names[1]||'';
  }

  if($('startDate')&&data.start) $('startDate').value=data.start;
  if($('duration')) $('duration').textContent=data.start?duration(data.start):'Set date';

  if($('total')){
    $('total').textContent='฿'+[...data.trips,...data.finished]
      .reduce((a,t)=>a+tripTotal(t),0)
      .toLocaleString();
  }

  if($('chatbox')){
    $('chatbox').innerHTML=data.messages.map(m=>{
      let media='';
      if(m.kind==='photo'&&m.media)
        media='<img src="'+m.media+'" style="max-width:100%;border-radius:12px;margin-top:6px">';

      if(m.kind==='location'&&m.media)
        media='<a class="back" style="display:inline-flex;margin-top:6px" target="_blank" rel="noopener" href="'+m.media+'">📍 Open Location</a>';

      if(m.kind==='voice'&&m.media)
        media='<audio controls src="'+m.media+'" style="width:100%;margin-top:6px"></audio>';

      return '<div class="msg '+(m.sender===currentSender()?'me':'')+'">'+
        '<b style="font-size:11px">'+esc(m.sender||'Me')+'</b>'+
        '<div>'+esc(m.text)+'</div>'+
        media+
        '<div class="muted">'+esc(m.time)+'</div>'+
        '</div>';
    }).join('')||'<div class="empty">No messages yet.</div>';

    $('chatbox').scrollTop=$('chatbox').scrollHeight;
  }

  if($('ownerGmail')) renderOwnerSettings();

  if($('trips')){
    renderTripSelect();
    renderTrips();
  }

  if($('finishedList')) renderFinished();
}

function saveDate(){
  if(!$('startDate')) return;
  data.start=$('startDate').value;
  save();
  init();
}

function saveNames(){
  if(!$('name1')||!$('name2')) return;
  data.names=[$('name1').value.trim(),$('name2').value.trim()];
  save();
  init();
}

function currentSender(){
  return localStorage.getItem('coupleSender')||data.names[0]||'Me';
}

function sendMsg(){
  const input=$('chatInput');
  if(!input) return;
  const v=input.value.trim();
  if(!v) return;

  data.messages.push({
    text:v,
    sender:currentSender(),
    time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
    kind:'text'
  });

  input.value='';
  save();
  init();
}

function setSender(name){
  localStorage.setItem('coupleSender',name);
}

async function addPhoto(input){
  const file=input.files?.[0];
  if(!file) return;

  try{
    let media='';
    if(window.firebaseUser?.() && window.cloudUploadFile){
      media=await window.cloudUploadFile(file,'photos');
    }else{
      media=await new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>resolve(reader.result);
        reader.onerror=reject;
        reader.readAsDataURL(file);
      });
    }

    data.messages.push({
      text:'📷 Photo',
      sender:currentSender(),
      time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
      kind:'photo',
      media
    });

    save();
    init();
  }catch(error){
    console.error(error);
    alert('Photo upload မအောင်မြင်ပါ။ Firebase Storage ကို Enable လုပ်ထားရမလား စစ်ပေးပါ။');
  }finally{
    input.value='';
  }
}

function shareLocation(){
  if(!navigator.geolocation){
    alert('Location မရနိုင်ပါ');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    p=>{
      const loc='https://maps.google.com/?q='+p.coords.latitude+','+p.coords.longitude;
      data.messages.push({
        text:'📍 My location',
        sender:currentSender(),
        time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
        kind:'location',
        media:loc
      });
      save();
      init();
    },
    ()=>alert('Location permission ကို Allow လုပ်ပေးပါ။')
  );
}

let mediaRecorder=null;
let voiceChunks=[];

async function toggleVoice(){
  if(mediaRecorder?.state==='recording'){
    mediaRecorder.stop();
    return;
  }

  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    voiceChunks=[];
    mediaRecorder=new MediaRecorder(stream);

    mediaRecorder.ondataavailable=e=>{
      if(e.data.size>0) voiceChunks.push(e.data);
    };

    mediaRecorder.onstop=()=>{
      const blob=new Blob(voiceChunks,{type:'audio/webm'});
      const reader=new FileReader();

      reader.onload=()=>{
        data.messages.push({
          text:'🎙️ Voice message',
          sender:currentSender(),
          time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),
          kind:'voice',
          media:reader.result
        });
        save();
        init();
      };

      reader.readAsDataURL(blob);
      stream.getTracks().forEach(t=>t.stop());
    };

    mediaRecorder.start();
    alert('🎙️ Recording စတင်ပါပြီ။ ရပ်ချင်ရင် Voice ခလုတ်ကို ထပ်နှိပ်ပါ။');
  }catch(e){
    console.error(e);
    alert('Microphone permission မရပါ။ Browser Settings မှာ Microphone ကို Allow လုပ်ပေးပါ။');
  }
}

function createTrip(){
  const n=$('tripName').value.trim();
  const d=$('destination').value.trim();
  const date=$('tripDate').value;
  const err=$('tripError');

  if(!n||!d){
    if(err){
      err.textContent=!n?'⚠️ ခရီးစဉ်အမည် ထည့်ပေးပါ။':'⚠️ သွားမည့်နေရာ ထည့်ပေးပါ။';
      err.style.display='block';
    }
    return;
  }

  if(err){
    err.textContent='';
    err.style.display='none';
  }

  const t=makeTrip(n,d,date);
  data.trips.push(t);
  save();

  $('tripName').value='';
  $('destination').value='';
  $('tripDate').value='';

  init();

  if($('tripSelect')) $('tripSelect').value=String(t.id);
}

function addRouteStep(){
  const trip=data.trips.find(t=>String(t.id)===$('tripSelect').value);
  const route=$('route').value.trim();
  const expense=Number($('expense').value||0);
  const type=$('expenseType').value;

  if(!trip){
    alert('အရင်ဆုံး ခရီးစဉ်တစ်ခုရွေးပါ');
    return;
  }

  if(!route){
    alert('လမ်းကြောင်း / ကားအဆင့် ထည့်ပါ');
    return;
  }

  trip.steps.push({
    id:Date.now()+Math.random(),
    route,
    expense,
    type,
    arrivedAt:null
  });

  save();
  $('route').value='';
  $('expense').value='';
  init();
}

function markArrived(tripId,stepId){
  const t=data.trips.find(x=>x.id===tripId);
  const s=t?.steps.find(x=>x.id===stepId);

  if(s){
    s.arrivedAt=new Date().toISOString();
    save();
    init();
  }
}

function categoryTotals(t){
  return (t.steps||[]).reduce((a,s)=>{
    a[s.type]=(a[s.type]||0)+Number(s.expense||0);
    return a;
  },{});
}

function useCurrentLocation(){
  if(!navigator.geolocation){
    alert('ဒီ browser မှာ Location မရနိုင်ပါ');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    p=>{
      const t=data.trips.find(x=>String(x.id)===$('tripSelect').value);

      if(!t){
        alert('အရင်ဆုံး ခရီးစဉ်ရွေးပါ');
        return;
      }

      const route='📍 Current location '+p.coords.latitude.toFixed(5)+', '+p.coords.longitude.toFixed(5);

      t.steps.push({
        id:Date.now()+Math.random(),
        route,
        expense:0,
        type:'Location',
        arrivedAt:new Date().toISOString(),
        lat:p.coords.latitude,
        lng:p.coords.longitude
      });

      save();
      init();
    },
    ()=>alert('Location permission ကို Allow လုပ်ပေးပါ။')
  );
}

function openRouteMap(tid,sid){
  const t=data.trips.find(x=>x.id===tid);
  const s=t?.steps.find(x=>x.id===sid);
  if(s?.lat&&s?.lng){
    window.open('https://www.google.com/maps?q='+s.lat+','+s.lng,'_blank');
  }
}

function finishTrip(id){
  const index=data.trips.findIndex(x=>x.id===id);
  if(index<0) return;

  const t=data.trips[index];

  if(!t.steps.length){
    alert('အနည်းဆုံး လမ်းကြောင်းတစ်ခု ထည့်ပြီးမှ Finish လုပ်ပါ');
    return;
  }

  t.finishedAt=new Date().toISOString();
  data.finished.push(t);
  data.trips.splice(index,1);
  save();
  init();
}

function renderTripSelect(){
  if(!$('tripSelect')) return;

  $('tripSelect').innerHTML=
    '<option value="">ခရီးစဉ်ရွေးပါ</option>'+
    data.trips.map(t=>
      '<option value="'+t.id+'">'+esc(t.name)+' — '+esc(t.dest)+'</option>'
    ).join('');
}

function renderTrips(){
  if(!$('trips')) return;

  $('trips').innerHTML=data.trips.length
    ?data.trips.map(t=>{
      const total=tripTotal(t);
      const count=t.steps.length;
      const arrived=t.steps.filter(s=>s.arrivedAt).length;
      const cats=categoryTotals(t);
      const catText=Object.entries(cats)
        .map(([k,v])=>esc(k)+' ฿'+v.toLocaleString())
        .join(' • ');

      const steps=t.steps.length
        ?t.steps.map((s,i)=>
          '<div class="route-row">'+
          '<div class="route-no">'+(i+1)+'</div>'+
          '<div class="route-main">'+
          '<b>'+esc(s.route)+'</b>'+
          '<div class="route-meta"><span>'+esc(s.type)+'</span><span>฿'+Number(s.expense||0).toLocaleString()+'</span></div>'+
          '</div>'+
          '<div class="route-status">'+
          (s.arrivedAt
            ?'<span class="pill">✓ Arrived</span>'
            :'<button class="btn small" onclick="markArrived('+t.id+','+s.id+')">Arrived</button>')+
          '</div>'+
          '</div>'
        ).join('')
        :'<div class="empty">ဒီခရီးစဉ်အတွက် Route မထည့်ရသေးပါ။ အပေါ်က Add Route Step ကိုသုံးပါ။</div>';

      return '<div class="trip trip-group">'+
        '<div class="trip-head">'+
        '<div><div class="trip-name">✈️ '+esc(t.name)+'</div>'+
        '<div class="trip-destination">📍 '+esc(t.dest)+(t.date?' · 📅 '+esc(t.date):'')+'</div></div>'+
        '<div class="trip-total"><small>စုစုပေါင်း</small><strong>฿'+total.toLocaleString()+'</strong></div>'+
        '</div>'+
        '<div class="trip-summary"><span>🧭 '+count+' Route'+(count!==1?'s':'')+'</span><span>✓ '+arrived+'/'+count+' Arrived</span></div>'+
        '<div class="steps">'+steps+'</div>'+
        '<div class="trip-summary"><span>💰 '+esc(catText||'No expenses')+'</span></div>'+
        '<button class="btn finish-btn" onclick="finishTrip('+t.id+')">✓ Finish Trip</button>'+
        '</div>';
    }).join('')
    :'<div class="empty">လက်ရှိသွားမည့်ခရီးစဉ် မရှိသေးပါ။</div>';
}

function renderFinished(){
  if(!$('finishedList')) return;

  $('finishedList').innerHTML=data.finished.length
    ?data.finished.slice().reverse().map(t=>{
      const steps=t.steps.map((s,i)=>
        '<div class="trip-step"><div><b>'+((i+1)+'. ')+esc(s.route)+'</b>'+
        '<div class="muted">'+esc(s.type)+' • ฿'+Number(s.expense||0).toLocaleString()+(s.arrivedAt?' • Arrived ✓':'')+
        '</div></div></div>'
      ).join('');

      return '<div class="trip trip-group">'+
        '<div class="trip-head"><div><b>✈️ '+esc(t.name)+'</b>'+
        '<div class="muted">'+esc(t.dest)+(t.date?' • '+esc(t.date):'')+'</div></div>'+
        '<span class="pill">Total ฿'+tripTotal(t).toLocaleString()+'</span></div>'+
        '<div class="steps">'+steps+'</div>'+
        '<div class="muted" style="margin-top:8px">Finished ✓</div>'+
        '</div>';
    }).join('')
    :'<div class="empty">No finished trips.</div>';
}

window.addEventListener('firebase-auth-changed', async function(event){
  const user=event.detail;
  if(!user || !window.cloudLoadCoupleData) return;

  try{
    window.__cloudHydrating=true;
    const remote=await window.cloudLoadCoupleData();

    if(remote){
      data.start=remote.start||'';
      data.names=Array.isArray(remote.names)?remote.names:['',''];
      data.messages=Array.isArray(remote.messages)?remote.messages:[];
      data.trips=normalizeTrips(remote.trips);
      data.finished=normalizeFinished(remote.finished);
      localStorage.setItem('coupleData',JSON.stringify(getLocalCoupleData()));
      init();
    }else if(window.cloudSaveCoupleData){
      await window.cloudSaveCoupleData(getLocalCoupleData());
    }
  }catch(error){
    console.warn('Cloud load failed:',error?.code||error?.message||error);
  }finally{
    window.__cloudHydrating=false;
  }

  if(window.cloudSubscribeCoupleData){
    window.cloudSubscribeCoupleData(remote=>{
      if(!remote) return;

      const next={
        start:remote.start||'',
        names:Array.isArray(remote.names)?remote.names:['',''],
        messages:Array.isArray(remote.messages)?remote.messages:[],
        trips:normalizeTrips(remote.trips),
        finished:normalizeFinished(remote.finished)
      };

      window.__cloudHydrating=true;
      data.start=next.start;
      data.names=next.names;
      data.messages=next.messages;
      data.trips=next.trips;
      data.finished=next.finished;
      localStorage.setItem('coupleData',JSON.stringify(getLocalCoupleData()));
      init();
      window.__cloudHydrating=false;
    });
  }
});

init();
