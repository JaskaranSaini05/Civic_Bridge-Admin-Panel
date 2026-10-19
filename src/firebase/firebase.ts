import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  // your config
  apiKey: "AIzaSyBnrcJBu918P2GcpEqaxI7NK0nz7WszAJI",
  authDomain: "civic-bridge-83dbd.firebaseapp.com",
  projectId: "civic-bridge-83dbd",
  storageBucket: "civic-bridge-83dbd.firebasestorage.app",
  messagingSenderId: "543917276390",
  appId: "1:543917276390:web:8c73bdd48f319948aa0f27"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ✅ SECOND AUTH INSTANCE (fix logout problem)
export const secondaryAuth = getAuth(initializeApp(firebaseConfig, "secondary"));
