import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
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
let unsubscribeCloud = null;

window.firebaseUser = () => currentUser;

window.firebaseReady = new Promise(resolve => {
  onAuthStateChanged(auth, user => {
    currentUser = user || null;
    window.dispatchEvent(new CustomEvent("firebase-auth-changed", { detail: user || null }));
    resolve(user || null);
  });
});

window.connectOwnerFirebase = async function(){
  const owner = (() => {
    try { return JSON.parse(localStorage.getItem("coupleOwner") || "null"); }
    catch(e) { return null; }
  })();

  const errorEl = document.getElementById("ownerError");
  const show = (msg, ok=false) => {
    if (!errorEl) return;
    errorEl.textContent = msg;
    errorEl.style.display = "block";
    errorEl.style.color = ok ? "#86efac" : "#fecaca";
  };

  if (!owner?.gmail) {
    show("အရင်ဆုံး Owner Gmail ကို Save လုပ်ပါ။");
    return;
  }

  try {
    await signInWithRedirect(auth, provider);
  } catch (error) {
    console.error(error);
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

  const owner = (() => {
    try { return JSON.parse(localStorage.getItem("coupleOwner") || "null"); }
    catch(e) { return null; }
  })() || {};

  const email = (user.email || "").toLowerCase();
  const saved = (owner.gmail || "").toLowerCase();

  if (saved && email !== saved) {
    const errorEl = document.getElementById("ownerError");
    if (errorEl) {
      errorEl.textContent = "ဒီ Google Gmail က သတ်မှတ်ထားတဲ့ Owner Gmail နဲ့ မတူပါ။";
      errorEl.style.display = "block";
      errorEl.style.color = "#fecaca";
    }
    await signOut(auth);
    return;
  }

  const next = {
    ...owner,
    gmail: saved || email,
    email,
    name: user.displayName || owner.name || "Owner",
    photoURL: user.photoURL || "",
    firebaseConnected: true,
    firebaseUid: user.uid,
    connectedAt: new Date().toISOString()
  };

  localStorage.setItem("coupleOwner", JSON.stringify(next));
  if (window.renderOwnerSettings) window.renderOwnerSettings();

  const status = document.getElementById("ownerStatus");
  if (status) status.textContent = "✓ Firebase Google Owner Connected: " + email;

  await ensureCloudDocument(user.uid);
}

async function ensureCloudDocument(uid){
  const refDoc = doc(db, "couples", uid);
  const snap = await getDoc(refDoc);
  if (!snap.exists()) {
    const local = window.getLocalCoupleData ? window.getLocalCoupleData() : null;
    if (local) {
      await setDoc(refDoc, {
        ...local,
        ownerUid: uid,
        updatedAt: serverTimestamp()
      });
    }
  }
}

window.cloudSaveCoupleData = async function(localData){
  const user = currentUser;
  if (!user) return {ok:false, reason:"not-authenticated"};

  const payload = JSON.parse(JSON.stringify(localData || {}));
  delete payload.owner;

  if (Array.isArray(payload.messages)) {
    payload.messages = payload.messages.map(message => {
      const copy = { ...message };
      if (typeof copy.media === "string" && copy.media.startsWith("data:")) {
        delete copy.media;
        copy.mediaPending = true;
      }
      return copy;
    });
  }

  await setDoc(doc(db, "couples", user.uid), {
    ...payload,
    ownerUid: user.uid,
    updatedAt: serverTimestamp()
  }, {merge:true});

  return {ok:true};
};

window.cloudLoadCoupleData = async function(){
  const user = currentUser;
  if (!user) return null;

  const snap = await getDoc(doc(db, "couples", user.uid));
  if (!snap.exists()) return null;
  return snap.data();
};

window.cloudSubscribeCoupleData = function(callback){
  if (unsubscribeCloud) unsubscribeCloud();
  if (!currentUser) return () => {};

  unsubscribeCloud = onSnapshot(
    doc(db, "couples", currentUser.uid),
    snap => {
      if (snap.exists() && callback) callback(snap.data());
    },
    error => console.error("Cloud sync error:", error)
  );

  return unsubscribeCloud;
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

getRedirectResult(auth).catch(error => {
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
