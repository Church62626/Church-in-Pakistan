/**
 * Firebase Configuration - Lord's Recovery Church (Pakistan)
 *
 * Modular Firebase v9+ (tree-shakeable) setup.
 * Credentials belong to the `church-in-pakistan-web` project.
 *
 * Nothing else in the app initializes Firebase - importing this module is
 * enough, and every component gets the same `auth` / `db` instances plus the
 * ready-made `authMethods` helpers.
 */
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAm7pLtYb6UETmzdyU3Inf5EGcJcaZfBU0",
  authDomain: "church-in-pakistan-web.firebaseapp.com",
  projectId: "church-in-pakistan-web",
  storageBucket: "church-in-pakistan-web.firebasestorage.app",
  messagingSenderId: "42888140578",
  appId: "1:42888140578:web:fb57a58c59a1a424ebf77b",
  measurementId: "G-0067NHYVSW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google OAuth provider (shared instance - Firebase popups reuse it)
const provider = new GoogleAuthProvider();

// Export Auth Methods for the Vue components
export const authMethods = {
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  signUp: (email, password) => createUserWithEmailAndPassword(auth, email, password),
  signInWithGoogle: () => signInWithPopup(auth, provider),
  logout: () => signOut(auth),
  onAuthChange: (callback) => onAuthStateChanged(auth, callback)
};
