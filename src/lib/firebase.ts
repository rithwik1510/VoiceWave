import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(
  (value) => typeof value === "string" && value.trim().length > 0
);
const isTestMode = import.meta.env.MODE === "test";
const enableFirebaseDuringTests = import.meta.env.VITE_ENABLE_FIREBASE_IN_TEST === "true";
const shouldBootFirebase = hasFirebaseConfig && (!isTestMode || enableFirebaseDuringTests);

const firebaseApp = shouldBootFirebase
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig)
  : null;

export const firebaseEnabled = Boolean(firebaseApp);
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firebaseDb = firebaseApp ? getFirestore(firebaseApp) : null;
