import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import * as FirebaseAuth from "firebase/auth";
import type { Auth, Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLjmw_WTWAQF-l1_ppA5A4BbMz8lIMTmA",
  authDomain: "daily-planner-76712.firebaseapp.com",
  projectId: "daily-planner-76712",
  storageBucket: "daily-planner-76712.firebasestorage.app",
  messagingSenderId: "625887062096",
  appId: "1:625887062096:web:166e77bcebd11707a34955",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const reactNativeAuth = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence?: (storage: typeof AsyncStorage) => Persistence;
};

let authInstance: Auth;

try {
  authInstance = reactNativeAuth.getReactNativePersistence
    ? FirebaseAuth.initializeAuth(app, {
        persistence: reactNativeAuth.getReactNativePersistence(AsyncStorage),
      })
    : FirebaseAuth.getAuth(app);
} catch {
  authInstance = FirebaseAuth.getAuth(app);
}

export const auth = authInstance;
export const db = getFirestore(app);
