import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fetch from 'node-fetch';

// Your Firebase configuration
const firebaseConfig = {
apiKey: "AIzaSyAv9bJNPFrAwMDBlib3f3cMvksxptK9nck",
  authDomain: "votingcloud-cb476.firebaseapp.com",
  projectId: "votingcloud-cb476",
  storageBucket: "votingcloud-cb476.firebasestorage.app",
  messagingSenderId: "409780395196",
  appId: "1:409780395196:web:b411f594abbe7c20f284b9",
  measurementId: "G-6HDC1V8JVK",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const API_URL = 'http://localhost:3000';
const TEST_SESSION_ID = '3roXj5qsIy7J1CC6hXo2';

// Test credentials (replace with your test user credentials)
const TEST_EMAIL = 'leeweiquan12@gmail.com';
const TEST_PASSWORD = 'Omega2011';

async function testGetSessionDetails() {
  try {
    // First, sign in to get the auth token
    const userCredential = await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
    const token = await userCredential.user.getIdToken();

    // Get the session details with auth token
    const response = await fetch(`${API_URL}/api/sessions/3roXj5qsIy7J1CC6hXo2/details`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();

    console.log('Response Status:', response.status);
    console.log('Response Data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Run the test
testGetSessionDetails();