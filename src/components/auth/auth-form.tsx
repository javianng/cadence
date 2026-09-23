"use client";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { authErrorMessage } from "~/components/auth/auth-errors";
import { Alert, AlertDescription } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { auth, googleProvider } from "~/lib/firebase";

type Mode = "login" | "signup";

const COPY: Record<
  Mode,
  {
    title: string;
    description: string;
    submit: string;
    switchText: string;
    switchLink: string;
    switchHref: string;
  }
> = {
  login: {
    title: "Welcome back",
    description: "Log in to your Cadence account",
    submit: "Log in",
    switchText: "Don't have an account?",
    switchLink: "Sign up",
    switchHref: "/signup",
  },
  signup: {
    title: "Create your account",
    description: "Continuous pricing for sustainability-linked loans",
    submit: "Create account",
    switchText: "Already have an account?",
    switchLink: "Log in",
    switchHref: "/login",
  },
};

/**
 * Login / sign-up card. On success we don't navigate here: AuthProvider picks
 * up the new user, and the page's <GuestOnly> guard routes to onboarding or
 * the role home depending on whether a profile exists.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const copy = COPY[mode];
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  async function run(kind: "email" | "google", action: () => Promise<unknown>) {
    setError(null);
    setPending(kind);
    try {
      await action();
    } catch (err) {
      setError(authErrorMessage(err));
      setPending(null);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    void run("email", () =>
      mode === "signup"
        ? createUserWithEmailAndPassword(auth, email, password)
        : signInWithEmailAndPassword(auth, email, password),
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-lg">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={pending !== null}
                onClick={() =>
                  void run("google", () =>
                    signInWithPopup(auth, googleProvider),
                  )
                }
              >
                {pending === "google" ? (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                ) : (
                  <GoogleIcon />
                )}
                Continue with Google
              </Button>
            </Field>
            <FieldSeparator>or continue with email</FieldSeparator>
            {error && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 6 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            {mode === "signup" && (
              <Field>
                <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
            )}
            <Field>
              <Button type="submit" size="lg" disabled={pending !== null}>
                {pending === "email" && (
                  <Loader2Icon
                    className="animate-spin"
                    data-icon="inline-start"
                  />
                )}
                {copy.submit}
              </Button>
              <FieldDescription className="text-center">
                {copy.switchText}{" "}
                <Link href={copy.switchHref}>{copy.switchLink}</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" data-icon="inline-start">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
