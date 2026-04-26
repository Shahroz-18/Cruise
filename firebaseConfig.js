import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Your config (keep exactly as you had it)
const firebaseConfig = {
  apiKey: "AIzaSyAp0JtoM0h8AwWNuYv0fvuftBCAm48M02w",
  authDomain: "cruise-2nd-year-me.firebaseapp.com",
  projectId: "cruise-2nd-year-me",
  storageBucket: "cruise-2nd-year-me.firebasestorage.app",
  messagingSenderId: "675655319979",
  appId: "1:675655319979:web:608eca9fdb819c887412ee"
};

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: browserLocalPersistence });
const db = getFirestore(app);

export { auth, db };