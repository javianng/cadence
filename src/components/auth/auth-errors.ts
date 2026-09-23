import { FirebaseError } from "firebase/app";

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Incorrect email or password.",
  "auth/invalid-email": "That email address isn't valid.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
  "auth/network-request-failed": "Network error. Check your connection.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup.",
  "auth/account-exists-with-different-credential":
    "This email is already registered with a different sign-in method.",
  "auth/operation-not-allowed":
    "This sign-in method isn't enabled in Firebase yet.",
};

/** Returns null for errors the user caused on purpose (e.g. closing the popup). */
export function authErrorMessage(err: unknown): string | null {
  if (err instanceof FirebaseError) {
    if (
      err.code === "auth/popup-closed-by-user" ||
      err.code === "auth/cancelled-popup-request"
    ) {
      return null;
    }
    return MESSAGES[err.code] ?? "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}
