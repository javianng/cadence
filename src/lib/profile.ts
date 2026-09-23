import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { z } from "zod";
import { db } from "~/lib/firebase/client";
import { ROLE_META, ROLES } from "~/lib/roles";

export { ROLE_META, ROLES, type Role } from "~/lib/roles";

export const INDUSTRIES = [
  "Agriculture",
  "Construction",
  "Energy & Utilities",
  "Manufacturing",
  "Real Estate",
  "Shipping & Logistics",
  "Technology",
  "Other",
] as const;

export const profileSchema = z
  .object({
    fullName: z.string().trim().min(1, "Enter your full name."),
    role: z.enum(ROLES, { message: "Choose your role." }),
    organisation: z.string().trim().min(1, "Enter your organisation."),
    jobTitle: z.string().trim().min(1, "Enter your job title."),
    industry: z.string().trim().optional(),
    country: z.string().trim().min(1, "Enter your country."),
  })
  .refine((p) => p.role !== "borrower" || !!p.industry, {
    message: "Choose your industry.",
    path: ["industry"],
  });

export type ProfileInput = z.infer<typeof profileSchema>;
export type UserProfile = ProfileInput & { email: string | null };

export function routeAfterAuth(profile: UserProfile | null): string {
  return profile ? ROLE_META[profile.role].home : "/onboarding";
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserProfile) : null;
}

export async function saveProfile(
  uid: string,
  email: string | null,
  input: ProfileInput,
): Promise<void> {
  const { industry, ...rest } = input;
  await setDoc(doc(db, "users", uid), {
    ...rest,
    // Firestore rejects `undefined`, and industry only applies to borrowers.
    ...(input.role === "borrower" ? { industry } : {}),
    email,
    onboardingComplete: true,
    createdAt: serverTimestamp(),
  });
}
