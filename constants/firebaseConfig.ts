import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBLjmw_WTWAQF-l1_ppA5A4BbMz8lIMTmA",
  authDomain: "daily-planner-76712.firebaseapp.com",
  projectId: "daily-planner-76712",
  storageBucket: "daily-planner-76712.firebasestorage.app",
  messagingSenderId: "625887062096",
  appId: "1:625887062096:web:166e77bcebd11707a34955",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
