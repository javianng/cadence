import { type Metadata } from "next";
import { AuthForm } from "~/components/auth/auth-form";

export const metadata: Metadata = {
  alternates: { canonical: "/signup" },
  title: "Create account",
  description:
    "Create a Cadence account to track sustainability-linked loan pricing.",
};

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
