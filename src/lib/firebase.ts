import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { rewriteLoopbackHostPort } from "./loopback-host";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase's Auth SDK throws eagerly on a blank/invalid apiKey, so only
// initialize once real credentials are provided — mirrors the backend's
// firebase-admin provider, which returns null under the same condition.
const firebaseApp: FirebaseApp | null = firebaseConfig.apiKey
  ? getApps().length
    ? getApps()[0]
    : initializeApp(firebaseConfig)
  : null;

export const auth: Auth | null = firebaseApp ? getAuth(firebaseApp) : null;

const configuredEmulatorHost = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
if (auth && configuredEmulatorHost && !auth.emulatorConfig) {
  // Same loopback problem as the API URL: from the Android emulator's browser
  // `localhost:9099` is the device's own port 9099, so sign-in never reaches
  // the Auth Emulator running on this machine.
  const emulatorHost = rewriteLoopbackHostPort(configuredEmulatorHost);
  connectAuthEmulator(auth, `http://${emulatorHost}`, {
    disableWarnings: true,
  });
}
