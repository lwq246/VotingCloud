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
export const performance = getPerformance(app);
export const functions = getFunctions(app);

// Cloud Run configuration
export const CLOUD_RUN_CONFIG = {
  serviceName: "voting-server",
  region: "asia-southeast1",
  minInstances: 0,
  maxInstances: 10,
  concurrency: 80,
  timeoutSeconds: 300,
  cpu: "1",
  memory: "512Mi",
};

// Verify performance monitoring is working
const verifyPerformanceMonitoring = () => {
  try {
    const testTrace = trace(performance, "firebase_init_trace");
    testTrace.start();
    testTrace.putAttribute(
      "environment",
      process.env.NODE_ENV || "development",
    );
    testTrace.putMetric("init_timestamp", Date.now());
    testTrace.stop();
    console.log("Firebase Performance Monitoring initialized successfully");
    return true;
  } catch (error) {
    console.error(
      "Firebase Performance Monitoring initialization error:",
      error,
    );
    return false;
  }
};

// Run the verification
verifyPerformanceMonitoring();

// export const API_URL = "http://localhost:3000";
export const API_URL =
  "https://voting-server-409780395196.asia-southeast1.run.app";
