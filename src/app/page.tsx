import Link from "next/link";
import { CadenceMark } from "~/components/cadence-mark";
import { Button } from "~/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 p-6 text-center">
      <CadenceMark />
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Sustainability-linked pricing that moves when you do
        </h1>
        <p className="text-muted-foreground">
          Cadence replaces the annual margin reset with continuous, AI-verified,
          on-chain repricing.
        </p>
      </div>
      <div className="flex gap-3">
        <Button size="lg" render={<Link href="/signup" />} nativeButton={false}>
          Get started
        </Button>
        <Button
          size="lg"
          variant="outline"
          render={<Link href="/login" />}
          nativeButton={false}
        >
          Log in
        </Button>
      </div>
    </main>
  );
}
