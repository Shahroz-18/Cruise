import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

// Your existing config (keep exactly as is)
const firebaseConfig = {
  apiKey: "AIzaSyAp0JtoM0h8AwWNuYv0fvuftBCAm48M02w",
  authDomain: "cruise-2nd-year-me.firebaseapp.com",
  projectId: "cruise-2nd-year-me",
  storageBucket: "cruise-2nd-year-me.firebasestorage.app",
  messagingSenderId: "675655319979",
  appId: "1:675655319979:web:608eca9fdb819c887412ee"
};

const app = initializeApp(firebaseConfig);

let auth;
if (Platform.OS === 'web') {
  // Web uses browser local persistence
  auth = initializeAuth(app, {
    persistence: browserLocalPersistence
  });
} else {
  // Android/iOS use AsyncStorage persistence
  const ReactNativeAsyncStorage = require('@react-native-async-storage/async-storage').default;
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

const db = getFirestore(app);

export { auth, db };