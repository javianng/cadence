import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { env } from "~/env";

const firebaseConfig = {
  apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const app: FirebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

let analyticsPromise: Promise<Analytics | null> | undefined;

/**
 * Analytics needs a browser (it's unsupported during SSR and in some
 * browsers/environments), so this is resolved lazily and only on the client.
 */
export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return Promise.resolve(null);

  analyticsPromise ??= isSupported().then((supported) =>
    supported ? getAnalytics(app) : null,
  );

  return analyticsPromise;
}
