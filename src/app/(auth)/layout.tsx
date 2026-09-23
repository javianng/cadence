import Link from "next/link";
import { GuestOnly } from "~/components/auth/require-auth";
import { CadenceMark } from "~/components/cadence-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <GuestOnly>
      <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link href="/" className="self-center">
            <CadenceMark />
          </Link>
          {children}
        </div>
      </main>
    </GuestOnly>
  );
}
