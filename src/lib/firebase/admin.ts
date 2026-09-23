import "server-only";

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "~/env";

const adminApp = getApps().length
  ? getApp()
  : initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
        // .env files store the PEM with literal "\n" escapes.
        privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      }),
    });

export const adminDb = getFirestore(adminApp);
// Optional fields (e.g. a recommendation only on escalations) may be undefined.
if (
  !(globalThis as { __cadenceDbConfigured?: boolean }).__cadenceDbConfigured
) {
  adminDb.settings({ ignoreUndefinedProperties: true });
  (globalThis as { __cadenceDbConfigured?: boolean }).__cadenceDbConfigured =
    true;
}
export const adminAuth = getAuth(adminApp);
