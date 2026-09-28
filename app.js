const $=id=>document.getElementById(id);
let raw=JSON.parse(localStorage.getItem('coupleData')||'{}');
let data={start:raw.start||'',names:Array.isArray(raw.names)?raw.names:['',''],messages:Array.isArray(raw.messages)?raw.messages:[],trips:[],finished:[]};

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function save(){localStorage.setItem('coupleData',JSON.stringify(data))}
function duration(s){let a=new Date(s),b=new Date(),y=b.getFullYear()-a.getFullYear(),m=b.getMonth()-a.getMonth(),d=b.getDate()-a.getDate();if(d<0){m--;d+=new Date(b.getFullYear(),b.getMonth(),0).getDate()}if(m<0){y--;m+=12}return y+'y '+m+'m '+d+'d'}

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
    if(!t){t=makeTrip(item.name||'Unnamed Trip',item.dest||'',item.date||'');t._legacyKey=key;grouped.push(t)}
    t.steps.push({id:item.id||Date.now()+Math.random(),route:item.route||'',expense:Number(item.expense||0),type:item.type||'Transport',arrivedAt:null});
  });
  grouped.forEach(t=>delete t._legacyKey);
  return grouped;
}
function normalizeFinished(list){
  const grouped=[];
  (list||[]).forEach(item=>{
    if(Array.isArray(item.steps)){grouped.push({...item,steps:item.steps||[]});return}
    const key=(item.name||'')+'|'+(item.dest||'')+'|'+(item.date||'');
    let t=grouped.find(x=>x._legacyKey===key);
    if(!t){t=makeTrip(item.name||'Unnamed Trip',item.dest||'',item.date||'');t.finishedAt=item.finishedAt||null;t._legacyKey=key;grouped.push(t)}
    t.steps.push({id:item.id||Date.now()+Math.random(),route:item.route||'',expense:Number(item.expense||0),type:item.type||'Transport',arrivedAt:item.arrivedAt||null});
  });
  grouped.forEach(t=>delete t._legacyKey);
  return grouped;
}
data.trips=normalizeTrips(raw.trips);
data.finished=normalizeFinished(raw.finished);
save();

function tripTotal(t){return (t.steps||[]).reduce((sum,s)=>sum+Number(s.expense||0),0)}
function init(){
  if($('name1')){$('name1').value=data.names[0]||'';$('name2').value=data.names[1]||''}
  if($('startDate')&&data.start)$('startDate').value=data.start;
  if($('duration'))$('duration').textContent=data.start?duration(data.start):'Set date';
  if($('total'))$('total').textContent='฿'+[...data.trips,...data.finished].reduce((a,t)=>a+tripTotal(t),0).toLocaleString();
  if($('chatbox')){$('chatbox').innerHTML=data.messages.map(m=>'<div class="msg me">'+esc(m.text)+'<div class="muted">'+esc(m.time)+'</div></div>').join('')||'<div class="empty">No messages yet.</div>';$('chatbox').scrollTop=$('chatbox').scrollHeight}
  if($('trips')){renderTripSelect();renderTrips()}
  if($('finishedList'))renderFinished();
}
function saveDate(){data.start=$('startDate').value;save();init()}
function saveNames(){data.names=[$('name1').value.trim(),$('name2').value.trim()];save();init()}
function sendMsg(){let v=$('chatInput').value.trim();if(!v)return;data.messages.push({text:v,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});$('chatInput').value='';save();init()}

function createTrip(){
  const n=$('tripName').value.trim(),d=$('destination').value.trim(),date=$('tripDate').value;
  const err=$('tripError');
  if(!n||!d){
    if(err){err.textContent=!n?'⚠️ ခရီးစဉ်အမည် ထည့်ပေးပါ။':'⚠️ သွားမည့်နေရာ ထည့်ပေးပါ။';err.style.display='block'}
    return;
  }
  if(err){err.textContent='';err.style.display='none'}
  const t=makeTrip(n,d,date);
  data.trips.push(t);
  save();
  $('tripName').value='';$('destination').value='';$('tripDate').value='';
  init();
  $('tripSelect').value=String(t.id);
}
function addRouteStep(){
  const trip=data.trips.find(t=>String(t.id)===$('tripSelect').value);
  const route=$('route').value.trim(),expense=Number($('expense').value||0),type=$('expenseType').value;
  if(!trip){alert('အရင်ဆုံး ခရီးစဉ်တစ်ခုရွေးပါ');return}
  if(!route){alert('လမ်းကြောင်း / ကားအဆင့် ထည့်ပါ');return}
  trip.steps.push({id:Date.now()+Math.random(),route,expense,type,arrivedAt:null});save();
  $('route').value='';$('expense').value='';init();
}
function markArrived(tripId,stepId){
  const t=data.trips.find(x=>x.id===tripId),s=t?.steps.find(x=>x.id===stepId);
  if(s){s.arrivedAt=new Date().toISOString();save();init()}
}
function finishTrip(id){
  const index=data.trips.findIndex(x=>x.id===id);if(index<0)return;
  const t=data.trips[index];
  if(!t.steps.length){alert('အနည်းဆုံး လမ်းကြောင်းတစ်ခု ထည့်ပြီးမှ Finish လုပ်ပါ');return}
  t.finishedAt=new Date().toISOString();data.finished.push(t);data.trips.splice(index,1);save();init();
}
function renderTripSelect(){
  if(!$('tripSelect'))return;
  $('tripSelect').innerHTML='<option value="">ခရီးစဉ်ရွေးပါ</option>'+data.trips.map(t=>'<option value="'+t.id+'">'+esc(t.name)+' — '+esc(t.dest)+'</option>').join('');
}
function renderTrips(){
  $('trips').innerHTML=data.trips.length?data.trips.map(t=>{
    const total=tripTotal(t), count=t.steps.length, arrived=t.steps.filter(s=>s.arrivedAt).length;
    const steps=t.steps.length?t.steps.map((s,i)=>'<div class="route-row"><div class="route-no">'+(i+1)+'</div><div class="route-main"><b>'+esc(s.route)+'</b><div class="route-meta"><span>'+esc(s.type)+'</span><span>฿'+Number(s.expense||0).toLocaleString()+'</span></div></div><div class="route-status">'+(s.arrivedAt?'<span class="pill">✓ Arrived</span>':'<button class="btn small" onclick="markArrived('+t.id+','+s.id+')">Arrived</button>')+'</div></div>').join(''):'<div class="empty">ဒီခရီးစဉ်အတွက် Route မထည့်ရသေးပါ။ အပေါ်က Add Route Step ကိုသုံးပါ။</div>';
    return '<div class="trip trip-group"><div class="trip-head"><div><div class="trip-name">✈️ '+esc(t.name)+'</div><div class="trip-destination">📍 '+esc(t.dest)+(t.date?' · 📅 '+esc(t.date):'')+'</div></div><div class="trip-total"><small>စုစုပေါင်း</small><strong>฿'+total.toLocaleString()+'</strong></div></div><div class="trip-summary"><span>🧭 '+count+' Route'+(count!==1?'s':'')+'</span><span>✓ '+arrived+'/'+count+' Arrived</span></div><div class="steps">'+steps+'</div><button class="btn finish-btn" onclick="finishTrip('+t.id+')">✓ Finish Trip</button></div>';
  }).join(''):'<div class="empty">လက်ရှိသွားမည့်ခရီးစဉ် မရှိသေးပါ။</div>';
}
function renderFinished(){
  $('finishedList').innerHTML=data.finished.length?data.finished.slice().reverse().map(t=>{
    const steps=t.steps.map((s,i)=>'<div class="trip-step"><div><b>'+((i+1)+'. ')+esc(s.route)+'</b><div class="muted">'+esc(s.type)+' • ฿'+Number(s.expense||0).toLocaleString()+(s.arrivedAt?' • Arrived ✓':'')+'</div></div></div>').join('');
    return '<div class="trip trip-group"><div class="trip-head"><div><b>✈️ '+esc(t.name)+'</b><div class="muted">'+esc(t.dest)+(t.date?' • '+esc(t.date):'')+'</div></div><span class="pill">Total ฿'+tripTotal(t).toLocaleString()+'</span></div><div class="steps">'+steps+'</div><div class="muted" style="margin-top:8px">Finished ✓</div></div>';
  }).join(''):'<div class="empty">No finished trips.</div>';
}
init();