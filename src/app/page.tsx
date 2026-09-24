import { type Metadata } from "next";
import {
  BotIcon,
  Building2Icon,
  CheckIcon,
  DatabaseIcon,
  FileCode2Icon,
  Link2Icon,
  Repeat2Icon,
  SearchCheckIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SparklesIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { MarginVsAnnualChart } from "~/components/cadence/charts";
import { CadenceLogo } from "~/components/cadence-mark";
import {
  AgentTraceLink,
  CopyAddressButton,
  ExternalTextLink,
  HeaderAuthAction,
  PersonaButton,
  ScrollToButton,
} from "~/components/landing/interactive";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { env } from "~/env";
import { getLandingStats, getMarginHistory } from "~/lib/server/landing";
import type { Role } from "~/lib/roles";
import { siteConfig } from "~/lib/site";

// Stats and the chart are read live from Firestore on every request.
export const dynamic = "force-dynamic";

const CONTRACT = env.CADENCE_CONTRACT_ADDRESS;
const CONTRACT_URL = `${env.NEXT_PUBLIC_EXPLORER_BASE}/address/${CONTRACT}`;
const SHOWCASE_LOAN = "straits-build";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
        {title}
      </h2>
      {description ? (
        <p className="text-muted-foreground text-base">{description}</p>
      ) : null}
    </div>
  );
}

const Section = ({
  id,
  children,
}: {
  id?: string;
  children: React.ReactNode;
}) => (
  <section
    id={id}
    className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20 md:py-28"
  >
    {children}
  </section>
);

// --- 1. Hero ------------------------------------------------------------------

function Hero() {
  return (
    <div className="relative overflow-hidden">
      {/* Decorative: faint grid + a single restrained red glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] mask-[radial-gradient(ellipse_at_top,black_30%,transparent_75%)] bg-size-[64px_64px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-10%] size-168 rounded-full bg-[radial-gradient(circle,rgb(238_39_34/0.18),transparent_65%)]"
      />
      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pt-16 pb-24 md:pt-24 md:pb-32 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-8">
          <Badge variant="outline" className="h-6 px-3">
            <span className="size-1.5 rounded-full bg-(--brand-red)" />
            Agentic AI · Blockchain · Net Zero
          </Badge>
          <h1 className="text-5xl leading-[1.02] font-semibold tracking-tight text-balance md:text-7xl">
            Sustainability-linked loans, priced continuously.
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed">
            Cadence replaces the once-a-year covenant check with a live,
            agent-verified score, settled on-chain, where every rate increase is
            still owned by a human.
          </p>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <ScrollToButton targetId="enter">Enter the demo</ScrollToButton>
            <ExternalTextLink href={CONTRACT_URL} className="text-sm">
              View the verified contract ↗
            </ExternalTextLink>
          </div>
        </div>
        <div className="relative hidden justify-center lg:flex">
          <div
            aria-hidden
            className="absolute inset-8 rounded-full bg-[radial-gradient(circle,rgb(238_39_34/0.22),transparent_70%)] blur-2xl"
          />
          <Image
            src="/icon_transparent.png"
            alt=""
            width={360}
            height={360}
            priority
            className="relative size-72 drop-shadow-2xl xl:size-80"
          />
        </div>
      </div>
    </div>
  );
}

// --- 2. Mechanism --------------------------------------------------------------

const MECHANISM_POINTS = [
  "Scores are computed from verified data every period, not once a year",
  "Margin decreases apply automatically; increases always wait for RM approval",
  "Every decision is hashed and recorded on a public blockchain",
];

async function MechanismChart() {
  try {
    const points = await getMarginHistory(SHOWCASE_LOAN);
    if (points.length === 0) throw new Error("no history");
    return <MarginVsAnnualChart points={points} className="h-72" />;
  } catch {
    return <Skeleton className="h-72 w-full" />;
  }
}

function Mechanism() {
  return (
    <Section>
      <Card className="gap-0 p-0">
        <div className="grid gap-10 p-8 md:p-12 lg:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Eyebrow>The mechanism</Eyebrow>
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              From an annual reset to a continuous one
            </h2>
            <p className="text-muted-foreground text-base leading-relaxed">
              Across the market, sustainability-linked loans are typically
              verified once a year, through ESG data platforms such as ESGpedia
              or a Second Party Opinion. Pricing therefore reflects a
              borrower&apos;s real performance on one day out of 365, and
              improvements (or slippage) wait up to a year to show up in the
              rate.
            </p>
            <ul className="flex flex-col gap-3">
              {MECHANISM_POINTS.map((point) => (
                <li key={point} className="flex gap-3 text-sm">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-(--brand-red-text)" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <div className="bg-background ring-foreground/10 rounded-lg p-4 ring-1">
              <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                <MechanismChart />
              </Suspense>
            </div>
            <p className="text-muted-foreground text-xs">
              Straits Build Pte Ltd (demo borrower): weekly Cadence margin vs
              the annual model, read live from the ledger.
            </p>
          </div>
        </div>
      </Card>
    </Section>
  );
}

// --- 3. Live stat bar ------------------------------------------------------------

function StatSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-10 lg:grid-cols-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex flex-col gap-3">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

async function LiveStats() {
  let stats;
  try {
    stats = await getLandingStats();
  } catch {
    // Firestore unreachable: keep shimmering rather than invent numbers.
    return <StatSkeleton />;
  }
  const items = [
    { value: stats.loans, label: "loans live on testnet" },
    { value: stats.onChainUpdates, label: "on-chain price updates" },
    { value: `${stats.averageScore}%`, label: "average transition score" },
    {
      value: stats.loansWithExceptions,
      label: "exceptions caught before the annual review would have",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-10 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-2">
          <dt className="sr-only">{item.label}</dt>
          <dd className="text-primary text-5xl font-semibold tracking-tight tabular-nums">
            {item.value}
          </dd>
          <dd className="text-muted-foreground max-w-48 text-sm">
            {item.label}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function StatBar() {
  return (
    <Section>
      <div className="flex flex-col gap-10">
        <Eyebrow>Live from Polygon Amoy</Eyebrow>
        <Suspense fallback={<StatSkeleton />}>
          <LiveStats />
        </Suspense>
      </div>
    </Section>
  );
}

// --- 4. Benefits ------------------------------------------------------------------

const BENEFITS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Repeat2Icon,
    title: "Continuous, not annual",
    body: "Pricing reflects performance within weeks, not a year later.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Humans own every penalty",
    body: "The contract can only lower a rate automatically. Every increase waits for a relationship manager.",
  },
  {
    icon: Link2Icon,
    title: "Tamper-evident by design",
    body: "Every score is hashed and timestamped on-chain — anyone can verify the record hasn't changed.",
  },
  {
    icon: SparklesIcon,
    title: "Agent, not automation",
    body: "A multi-step AI agent verifies, reconciles, and explains every decision in plain language.",
  },
];

function Benefits() {
  return (
    <Section>
      <div className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="Why Cadence"
          title="Pricing that keeps pace with performance"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader className="gap-4">
                <Icon className="text-primary size-6" />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {body}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}

// --- 5. Architecture ---------------------------------------------------------------

function Architecture() {
  const parts: {
    icon: LucideIcon;
    title: string;
    body: string;
    link?: React.ReactNode;
  }[] = [
    {
      icon: BotIcon,
      title: "Agent",
      body: "Gemini verifies incoming data, reconciles conflicting sources, and explains every score change in plain language.",
      link: <AgentTraceLink className="text-sm" />,
    },
    {
      icon: FileCode2Icon,
      title: "Contract",
      body: "A Solidity contract on Polygon Amoy turns each score into a margin, using a pricing grid locked in at origination.",
      link: (
        <ExternalTextLink href={`${CONTRACT_URL}#code`} className="text-sm">
          Read the verified source ↗
        </ExternalTextLink>
      ),
    },
    {
      icon: DatabaseIcon,
      title: "Ledger",
      body: "Every stakeholder — borrower, relationship manager, risk — sees the same data, filtered to what they're allowed to see.",
    },
  ];
  return (
    <Section>
      <div className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="Architecture"
          title="Three parts, one source of truth"
          description="AI handles the reasoning, code computes the numbers, and the chain keeps the record."
        />
        <div className="grid gap-10 md:grid-cols-3">
          {parts.map(({ icon: Icon, title, body, link }) => (
            <div
              key={title}
              className="border-border flex flex-col gap-4 border-t pt-6"
            >
              <Icon className="text-primary size-6" />
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {body}
              </p>
              {link}
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

// --- 6. Entry points ------------------------------------------------------------------

const PERSONAS: {
  icon: LucideIcon;
  title: string;
  body: string;
  role: Role;
}[] = [
  {
    icon: Building2Icon,
    title: "Borrower",
    body: "See your transition score, your margin, and why it moved.",
    role: "borrower",
  },
  {
    icon: UsersIcon,
    title: "Relationship manager",
    body: "Review flagged exceptions and approve or hold rate changes.",
    role: "rm",
  },
  {
    icon: ShieldIcon,
    title: "Risk",
    body: "Monitor the whole portfolio and audit the agent's decisions.",
    role: "risk",
  },
];

function EntryPoints() {
  const cardClass =
    "transition-shadow hover:ring-(--brand-red)/60 focus-within:ring-(--brand-red)/60";
  return (
    <Section id="enter">
      <div className="flex flex-col gap-12">
        <SectionHeading
          eyebrow="Enter the demo"
          title="Choose a seat at the table"
          description="The same loan, seen three ways — plus a public record anyone can check."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERSONAS.map(({ icon: Icon, title, body, role }) => (
            <Card key={role} className={cardClass}>
              <CardHeader className="gap-4">
                <Icon className="text-primary size-6" />
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {body}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <PersonaButton role={role} />
              </CardFooter>
            </Card>
          ))}
          <Card className={cardClass}>
            <CardHeader className="gap-4">
              <SearchCheckIcon className="text-primary size-6" />
              <CardTitle className="text-base">Public verification</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Anyone can confirm a loan&apos;s on-chain record hasn&apos;t
                been altered.
              </CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              {/* TODO: link to /verify/[tokenId] for the first seeded loan once that page exists. */}
              <a
                href={CONTRACT_URL}
                target="_blank"
                rel="noreferrer"
                className="bg-primary text-primary-foreground hover:bg-primary/85 inline-flex h-11 items-center gap-2 rounded-md px-5 text-[1.1667rem] font-bold transition-colors"
              >
                Verify ↗
              </a>
            </CardFooter>
          </Card>
        </div>
      </div>
    </Section>
  );
}

// --- 7. Footer ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer className="border-border border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-8 text-sm">
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="text-muted-foreground h-7 border-(--brand-red)/60 px-2.5 font-mono text-[11px]"
          >
            {CONTRACT}
          </Badge>
          <CopyAddressButton address={CONTRACT} />
        </div>
        <ExternalTextLink href={CONTRACT_URL}>
          View on Polygonscan
        </ExternalTextLink>
        <p className="text-muted-foreground md:ml-auto">
          Built by{" "}
          <a
            href="https://www.javianng.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Javian
          </a>
        </p>
      </div>
    </footer>
  );
}

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
};

export default function LandingPage() {
  return (
    <div className="dark landing min-h-svh">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <span className="flex items-center gap-2 text-base font-semibold">
            <CadenceLogo className="size-7" />
            Cadence
          </span>
          <HeaderAuthAction />
        </div>
      </header>
      <main className="pt-16">
        <Hero />
        <Mechanism />
        <Separator className="mx-auto max-w-6xl" />
        <StatBar />
        <Separator className="mx-auto max-w-6xl" />
        <Benefits />
        <Architecture />
        <EntryPoints />
      </main>
      <Footer />
    </div>
  );
}
