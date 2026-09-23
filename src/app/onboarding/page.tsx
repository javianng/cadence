"use client";

import { AlertCircleIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "~/components/auth/auth-provider";
import { FullPageSpinner, RequireAuth } from "~/components/auth/require-auth";
import { CadenceMark } from "~/components/cadence-mark";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldTitle,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  INDUSTRIES,
  ROLE_META,
  ROLES,
  profileSchema,
  routeAfterAuth,
  saveProfile,
  type ProfileInput,
  type Role,
} from "~/lib/profile";

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <Onboarding />
    </RequireAuth>
  );
}

type FormState = Omit<ProfileInput, "role"> & { role: Role | "" };
type Errors = Partial<Record<keyof FormState, string>>;

function Onboarding() {
  const { user, profile, refreshProfile } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    fullName: user?.displayName ?? "",
    role: "",
    organisation: "",
    jobTitle: "",
    industry: "",
    country: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Already onboarded (e.g. navigated here directly) → go to role home.
  useEffect(() => {
    if (profile && !saving) router.replace(routeAfterAuth(profile));
  }, [profile, saving, router]);

  if (!user || (profile && !saving)) return <FullPageSpinner />;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user) return;
    const parsed = profileSchema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      await saveProfile(user.uid, user.email, parsed.data);
      const saved = await refreshProfile();
      router.replace(routeAfterAuth(saved));
    } catch (err) {
      console.error("Failed to save profile", err);
      setSubmitError("Couldn't save your profile. Please try again.");
      setSaving(false);
    }
  }

  const textField = (
    key: "fullName" | "organisation" | "jobTitle" | "country",
    label: string,
    placeholder: string,
    autoComplete: string,
  ) => (
    <Field data-invalid={!!errors[key] || undefined}>
      <FieldLabel htmlFor={key}>{label}</FieldLabel>
      <Input
        id={key}
        placeholder={placeholder}
        autoComplete={autoComplete}
        aria-invalid={!!errors[key] || undefined}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
      <FieldError>{errors[key]}</FieldError>
    </Field>
  );

  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="self-center">
          <CadenceMark />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tell us about yourself</CardTitle>
            <CardDescription>
              We use this to set up the right view for you.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate>
              <FieldGroup>
                {submitError && (
                  <Alert variant="destructive">
                    <AlertCircleIcon />
                    <AlertDescription>{submitError}</AlertDescription>
                  </Alert>
                )}
                {textField("fullName", "Full name", "Alex Tan", "name")}

                <FieldSet data-invalid={!!errors.role || undefined}>
                  <FieldLegend variant="label">Your role</FieldLegend>
                  <RadioGroup
                    value={form.role}
                    onValueChange={(v) => set("role", v as Role)}
                  >
                    {ROLES.map((role) => (
                      <FieldLabel key={role} htmlFor={`role-${role}`}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{ROLE_META[role].label}</FieldTitle>
                            <FieldDescription>
                              &ldquo;{ROLE_META[role].question}&rdquo;
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem value={role} id={`role-${role}`} />
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                  <FieldError>{errors.role}</FieldError>
                </FieldSet>

                {textField(
                  "organisation",
                  form.role === "borrower" ? "Company" : "Organisation",
                  form.role === "borrower"
                    ? "Acme Holdings Pte Ltd"
                    : "Bank of Singapore",
                  "organization",
                )}
                {textField(
                  "jobTitle",
                  "Job title",
                  "Head of Sustainability",
                  "organization-title",
                )}

                {form.role === "borrower" && (
                  <Field data-invalid={!!errors.industry || undefined}>
                    <FieldLabel htmlFor="industry">Industry</FieldLabel>
                    <NativeSelect
                      id="industry"
                      className="w-full"
                      aria-invalid={!!errors.industry || undefined}
                      value={form.industry}
                      onChange={(e) => set("industry", e.target.value)}
                    >
                      <NativeSelectOption value="">
                        Select industry
                      </NativeSelectOption>
                      {INDUSTRIES.map((i) => (
                        <NativeSelectOption key={i} value={i}>
                          {i}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <FieldError>{errors.industry}</FieldError>
                  </Field>
                )}

                {textField("country", "Country", "Singapore", "country-name")}

                <Button type="submit" size="lg" disabled={saving}>
                  {saving && (
                    <Loader2Icon
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  )}
                  Continue
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
