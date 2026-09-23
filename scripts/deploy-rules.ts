/**
 * Publishes firestore.rules to the Firebase project via the Admin SDK
 * (service account from .env). Equivalent to `firebase deploy --only
 * firestore:rules` without needing the Firebase CLI.
 *
 *   npm run rules:deploy
 */
import { readFileSync } from "node:fs";
import { getSecurityRules } from "firebase-admin/security-rules";
import "~/lib/firebase/admin";

const source = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
const ruleset = await getSecurityRules().releaseFirestoreRulesetFromSource(source);
console.log(`Published firestore.rules as ${ruleset.name} (${ruleset.createTime})`);
process.exit(0);
