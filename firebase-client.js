import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

window.firebaseAuth = auth;
window.firebaseApp = app;

let currentUser = null;
let cloudUid = null;
let unsubscribeCloud = null;
let unsubscribePresence = null;

function getSavedOwner(){
  try { return JSON.parse(localStorage.getItem("coupleOwner") || "{}") || {}; }
  catch(e) { return {}; }
}

function emailKey(email){
  return String(email || "").trim().toLowerCase();
}

async function resolveCloudUid(user){
  if (!user) return null;
  const owner = getSavedOwner();
  if (owner.firebaseUid && user.uid === owner.firebaseUid) return user.uid;

  const email = emailKey(user.email);
  if (!email) return null;

  try {
    const memberSnap = await getDoc(doc(db, "coupleMembers", email));
    if (memberSnap.exists()) {
      const mapped = memberSnap.data();
      if (mapped.ownerUid) return mapped.ownerUid;
    }
  } catch(error) {
    console.warn("Partner mapping lookup:", error?.code || error?.message || error);
  }
  return null;
}

window.firebaseUser = () => currentUser;

async function startPresence(user){
  if(!user || !user.email) return;
  const email=emailKey(user.email);
  const presenceRef=doc(db,"couplePresence",email);
  try{
    await setDoc(presenceRef,{
      email,
      uid:user.uid,
      online:true,
      lastSeen:serverTimestamp()
    },{merge:true});

    window.addEventListener("pagehide", () => {
      setDoc(presenceRef,{
        online:false,
        lastSeen:serverTimestamp()
      },{merge:true}).catch(()=>{});
    }, {once:true});
  }catch(error){
    console.warn("Presence write:",error?.code||error?.message||error);
  }

  const owner=getSavedOwner();
  const partnerEmail=email===emailKey(owner.gmail)
    ? emailKey(owner.partnerGmail)
    : emailKey(owner.gmail);

  if(!partnerEmail) return;

  if(window.__presenceHeartbeat) clearInterval(window.__presenceHeartbeat);
  window.__presenceHeartbeat=setInterval(()=>{
    setDoc(presenceRef,{online:true,lastSeen:serverTimestamp()},{merge:true}).catch(()=>{});
  },30000);

  if(unsubscribePresence) unsubscribePresence();
  const partnerRef=doc(db,"couplePresence",partnerEmail);
  unsubscribePresence=onSnapshot(partnerRef,snap=>{
    const status=document.getElementById("presenceStatus");
    if(!status) return;
    if(!snap.exists()){
      status.textContent="🟡 Partner status မရသေးပါ";
      return;
    }
    const p=snap.data();
    status.textContent=p.online
      ? "🟢 Partner Online"
      : "⚪ Partner Offline · "+(p.lastSeen?.toDate ? p.lastSeen.toDate().toLocaleTimeString() : "last seen မရသေးပါ");
    status.style.color=p.online?"#86efac":"#a5b4fc";
  },error=>{
    console.warn("Presence read:",error?.code||error?.message||error);
  });
}


window.firebaseReady = new Promise(resolve => {
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    window.dispatchEvent(new CustomEvent("firebase-auth-changed", { detail: user || null }));
    resolve(user || null);
  });
});

window.connectOwnerFirebase = async function(){
  const owner = getSavedOwner();

  const errorEl = document.getElementById("ownerError");
  const show = (msg, ok=false) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = "block";
    errorEl.style.color = ok ? "#86efac" : "#fecaca";
  };

  if (!owner?.gmail && !owner?.partnerGmail) {
    show("အရင်ဆုံး Owner Gmail သို့မဟုတ် Partner Gmail ကို Save လုပ်ပါ။");
    return;
  }

  try {
    const errorEl = document.getElementById("ownerError");
    if (errorEl) {
      errorEl.textContent = "Google Login ကိုဖွင့်နေပါတယ်… Google Account ရွေးပြီး ပြန်ဝင်လာပါမယ်။";
      errorEl.style.display = "block";
      errorEl.style.color = "#fde68a";
    }
    await setPersistence(auth, browserLocalPersistence);
    provider.setCustomParameters({
      prompt: "select_account",
      login_hint: owner.gmail || owner.partnerGmail || ""
    });
    const result = await signInWithPopup(auth, provider);
    if (result && result.user) {
      await applyAuthenticatedOwner(result.user);
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.style.display = "none";
      }
    }
  } catch (error) {
    console.error(error);
    if (error?.code === "auth/popup-blocked") {
      try {
        show("Popup ပိတ်ထားလို့ Google Redirect Login ကို ပြောင်းနေပါတယ်…");
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirectError) {
        console.error(redirectError);
        show("Google Login မအောင်မြင်ပါ: " + (redirectError.code || redirectError.message));
        return;
      }
    }
    show("Firebase Google Sign-In မအောင်မြင်ပါ: " + (error.code || error.message));
  }
};

window.disconnectOwnerFirebase = async function(){
  try { await signOut(auth); } catch(e) { console.error(e); }

  try {
    const owner = JSON.parse(localStorage.getItem("coupleOwner") || "{}");
    delete owner.firebaseConnected;
    delete owner.firebaseUid;
    delete owner.photoURL;
    delete owner.email;
    delete owner.connectedAt;
    localStorage.setItem("coupleOwner", JSON.stringify(owner));
  } catch(e) {}

  if (window.renderOwnerSettings) window.renderOwnerSettings();

  const errorEl = document.getElementById("ownerError");
  if (errorEl) {
    errorEl.textContent = "Firebase Owner connection ဖြုတ်ပြီးပါပြီ။";
    errorEl.style.display = "block";
    errorEl.style.color = "#86efac";
  }
};

async function applyAuthenticatedOwner(user){
  if (!user) {
    if (window.renderOwnerSettings) window.renderOwnerSettings();
    return;
  }

  const owner = getSavedOwner();

  const email = (user.email || "").toLowerCase();
  const saved = emailKey(owner.gmail);
  const partner = emailKey(owner.partnerGmail);

  if (email !== saved && email !== partner) {
    const errorEl = document.getElementById("ownerError");
    if (errorEl) {
      errorEl.textContent = "ဒီ Google Gmail က သတ်မှတ်ထားတဲ့ Owner Gmail နဲ့ မတူပါ။";
      errorEl.style.display = "block";
      errorEl.style.color = "#fecaca";
    }
    await signOut(auth);
    return;
  }

  const isOwnerEmail = !!saved && email === saved;
  const isPartnerEmail = !!partner && email === partner;
  const isOwnerAccount = isOwnerEmail && (!owner.firebaseUid || user.uid === owner.firebaseUid);

  if(!isOwnerEmail && !isPartnerEmail){
    const errorEl = document.getElementById("ownerError");
    if(errorEl){
      errorEl.textContent = "ဒီ Google Gmail က Owner/Partner Gmail စာရင်းထဲမှာ မရှိပါ။";
      errorEl.style.display = "block";
      errorEl.style.color = "#fecaca";
    }
    await signOut(auth);
    return;
  }
  const next = {
    ...owner,
    gmail: owner.gmail || (isOwnerAccount ? email : ""),
    partnerGmail: owner.partnerGmail || (isPartnerEmail ? email : ""),
    email,
    name: user.displayName || owner.name || "Owner",
    photoURL: user.photoURL || "",
    firebaseConnected: true,
    firebaseUid: isOwnerAccount ? user.uid : (owner.firebaseUid || ""),
    partnerFirebaseUid: isPartnerEmail ? user.uid : (owner.partnerFirebaseUid || ""),
    connectedAt: new Date().toISOString()
  };

  localStorage.setItem("coupleOwner", JSON.stringify(next));
  cloudUid = await resolveCloudUid(user);
  await startPresence(user);
  if (!cloudUid && isOwnerAccount) cloudUid = user.uid;
  if (window.renderOwnerSettings) window.renderOwnerSettings();

  const status = document.getElementById("ownerStatus");
  if (status) status.textContent = isOwnerAccount
    ? "✓ Firebase Google Owner Connected: " + email
    : "✓ Firebase Google Partner Connected: " + email;

  try {
    if (isOwnerAccount) {
      await ensureCloudDocument(user.uid);
    }
  } catch (error) {
    console.error("Firestore owner document:", error);
    const errorEl = document.getElementById("ownerError");
    if (errorEl) {
      errorEl.textContent = "✓ Google/Firebase ချိတ်ပြီးပါပြီ။ Firestore Sync မှာသာ စစ်ဆေးရန်လိုနေပါတယ်: " + (error.code || error.message);
      errorEl.style.display = "block";
      errorEl.style.color = "#fde68a";
    }
  }
}

async function ensureCloudDocument(uid){
  const refDoc = doc(db, "couples", uid);
  const snap = await getDoc(refDoc);
  const owner = getSavedOwner();
  const ownerGmail = emailKey(owner.gmail || "");
  const partnerGmail = emailKey(owner.partnerGmail || "");

  if (!snap.exists()) {
    const local = window.getLocalCoupleData ? window.getLocalCoupleData() : null;
    if (local) {
      await setDoc(refDoc, {
        ...local,
        ownerUid: uid,
        ownerGmail,
        partnerGmail,
        updatedAt: serverTimestamp()
      });
    }
  } else if (owner.firebaseUid === uid && partnerGmail) {
    await setDoc(refDoc, { ownerGmail, partnerGmail, ownerUid: uid, updatedAt: serverTimestamp() }, {merge:true});
  }

  if (owner.firebaseUid === uid && partnerGmail) {
    await setDoc(doc(db, "coupleMembers", partnerGmail), {
      ownerUid: uid,
      partnerGmail,
      updatedAt: serverTimestamp()
    }, {merge:true});

    await setDoc(doc(db, "coupleMembers", ownerGmail), {
      ownerUid: uid,
      ownerGmail,
      partnerGmail,
      updatedAt: serverTimestamp()
    }, {merge:true});
  }
}

window.cloudMigrateLegacyMessages = async function(messages){
  if(!Array.isArray(messages) || !messages.length || !currentUser || !cloudUid) return {ok:true,count:0};
  const refCol=collection(db,"couples",cloudUid,"messages");
  const existing=await getDoc(doc(db,"couples",cloudUid));
  const marker=existing.exists() ? existing.data().messagesMigratedAt : null;
  if(marker) return {ok:true,count:0,already:true};

  for(const message of messages){
    const copy={...message};
    if(typeof copy.media==="string" && copy.media.startsWith("data:")) delete copy.media;
    await addDoc(refCol,{
      text:String(copy.text||""),
      kind:String(copy.kind||"text"),
      sender:String(copy.sender||""),
      senderUid:copy.senderUid||"",
      senderEmail:emailKey(copy.senderEmail||""),
      media:copy.media||"",
      sentAt:copy.createdAt ? new Date(copy.createdAt) : serverTimestamp(),
      deliveredAt:null,
      readAt:null
    });
  }
  await setDoc(doc(db,"couples",cloudUid),{messagesMigratedAt:serverTimestamp()},{merge:true});
  return {ok:true,count:messages.length};
};

window.cloudSaveCoupleData = async function(localData){
  const user = currentUser;
  if (!user) return {ok:false, reason:"not-authenticated"};

  let uid = cloudUid || user.uid;
  if(!cloudUid){
    cloudUid = await resolveCloudUid(user);
    uid = cloudUid || user.uid;
  }

  const payload = JSON.parse(JSON.stringify(localData || {}));
  delete payload.owner;
  delete payload.messages;

  const existing = await getDoc(doc(db, "couples", uid));
  const remote = existing.exists() ? existing.data() : {};
  const owner = getSavedOwner();

  // Always preserve the real couple owner UID, even when the partner is
  // the account currently writing the shared document.
  const ownerUid = remote.ownerUid || owner.firebaseUid || (emailKey(user.email) === emailKey(owner.gmail) ? user.uid : uid);
  const ownerGmail = emailKey(remote.ownerGmail || owner.gmail || "");
  const partnerGmail = emailKey(remote.partnerGmail || owner.partnerGmail || "");

  await setDoc(doc(db, "couples", uid), {
    ...payload,
    ownerUid,
    ownerGmail,
    partnerGmail,
    updatedAt: serverTimestamp()
  }, {merge:true});

  return {ok:true};
};

window.cloudLoadCoupleData = async function(){
  const user = currentUser;
  if (!user) return null;

  if(!cloudUid) cloudUid = await resolveCloudUid(user);
  const uid = cloudUid || user.uid;

  const snap = await getDoc(doc(db, "couples", uid));
  if (!snap.exists()) return null;
  return snap.data();
};

window.cloudSubscribeCoupleData = function(callback){
  if (unsubscribeCloud) unsubscribeCloud();
  if (!currentUser || !cloudUid) return () => {};

  unsubscribeCloud = onSnapshot(
    doc(db, "couples", cloudUid),
    snap => {
      if (snap.exists() && callback) callback(snap.data());
    },
    error => console.error("Cloud sync error:", error)
  );

  return unsubscribeCloud;
};


// Dedicated realtime chat messages. Messages live outside the couple document
// so chat growth does not push the main document toward Firestore's 1 MiB limit.
function messageCollection(){
  if(!cloudUid) return null;
  return collection(db, "couples", cloudUid, "messages");
}

window.cloudSendMessage = async function(message){
  const user=currentUser;
  if(!user) throw new Error("Firebase login လိုအပ်ပါတယ်။");

  let uid=cloudUid || user.uid;

  // Re-resolve the shared couple document before every message send.
  // This prevents a stale/new browser session from trying to write to the
  // wrong couple path.
  if(!cloudUid){
    cloudUid=await resolveCloudUid(user);
    if(!cloudUid && emailKey(user.email)===emailKey(getSavedOwner().gmail)){
      cloudUid=user.uid;
    }
    uid=cloudUid || user.uid;
  }

  // The message rules depend on couples/{uid} existing.
  const coupleSnap=await getDoc(doc(db,"couples",uid));
  if(!coupleSnap.exists()){
    if(uid===user.uid){
      await ensureCloudDocument(uid);
    }else{
      throw new Error("Couple Cloud document မတွေ့သေးပါ။ Owner account နဲ့ တစ်ကြိမ် Connect + Cloud Sync လုပ်ပါ။");
    }
  }

  const senderEmail=emailKey(user.email);
  const payload={
    text:String(message?.text || ""),
    kind:String(message?.kind || "text"),
    sender:String(message?.sender || ""),
    senderUid:user.uid,
    senderEmail,
    media:typeof message?.media==="string" && !message.media.startsWith("data:") ? message.media : "",
    sentAt:serverTimestamp(),
    deliveredAt:null,
    readAt:null
  };

  try{
    const refDoc=await addDoc(collection(db,"couples",uid,"messages"),payload);
    return {ok:true,id:refDoc.id};
  }catch(error){
    console.error("cloudSendMessage:",error);
    throw error;
  }
};

window.cloudSubscribeMessages = function(callback){
  if(!currentUser || !cloudUid) return ()=>{};
  const q=query(
    collection(db,"couples",cloudUid,"messages"),
    orderBy("sentAt","asc")
  );
  return onSnapshot(q, snapshot=>{
    const messages=snapshot.docs.map(d=>({id:d.id,...d.data()}));
    if(callback) callback(messages);
  }, error=>{
    console.error("Realtime messages error:",error);
    if(callback) callback([],error);
  });
};

window.cloudMarkMessageDelivered = async function(messageId){
  if(!currentUser || !cloudUid || !messageId) return;
  await updateDoc(doc(db,"couples",cloudUid,"messages",messageId),{
    deliveredAt:serverTimestamp()
  });
};

window.cloudMarkMessageRead = async function(messageId){
  if(!currentUser || !cloudUid || !messageId) return;
  await updateDoc(doc(db,"couples",cloudUid,"messages",messageId),{
    readAt:serverTimestamp(),
    deliveredAt:serverTimestamp()
  });
};

window.cloudUploadFile = async function(file, folder="media"){
  const user = currentUser;
  if (!user || !file) throw new Error("Firebase Owner login လိုအပ်ပါတယ်။");

  const safeName = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = "couples/" + user.uid + "/" + folder + "/" + Date.now() + "_" + safeName;
  const fileRef = ref(storage, path);

  await uploadBytes(fileRef, file, {
    contentType: file.type || "application/octet-stream"
  });

  return await getDownloadURL(fileRef);
};

getRedirectResult(auth).then(result => {
  if (result && result.user) {
    return applyAuthenticatedOwner(result.user);
  }
}).catch(error => {
  console.error("Firebase redirect result:", error);
  const errorEl = document.getElementById("ownerError");
  if (errorEl) {
    errorEl.textContent = "Google Sign-In ပြန်လာရာမှာ error ဖြစ်ပါတယ်: " + (error.code || error.message);
    errorEl.style.display = "block";
    errorEl.style.color = "#fecaca";
  }
});

onAuthStateChanged(auth, user => {
  applyAuthenticatedOwner(user).catch(error => console.error("Owner setup:", error));
});

window.addEventListener("beforeunload", () => {
  if (unsubscribeCloud) unsubscribeCloud();
});
