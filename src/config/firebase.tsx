import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
 
const firebaseConfig = {
  apiKey: "AIzaSyAv9bJNPFrAwMDBlib3f3cMvksxptK9nck",
  authDomain: "votingcloud-cb476.firebaseapp.com",
  projectId: "votingcloud-cb476",
  storageBucket: "votingcloud-cb476.firebasestorage.app",
  messagingSenderId: "409780395196",
  appId: "1:409780395196:web:b411f594abbe7c20f284b9",
  measurementId: "G-6HDC1V8JVK",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// export const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";
export const API_URL =
  "https://voting-server-409780395196.asia-southeast1.run.app";
// export const API_URL = "http://localhost:3000";
