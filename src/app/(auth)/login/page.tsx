import { type Metadata } from "next";
import { AuthForm } from "~/components/auth/auth-form";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: "Sign in",
  description:
    "Sign in to Cadence as a borrower, relationship manager or risk officer.",
};

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
