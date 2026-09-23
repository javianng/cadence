import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "~/components/ui/card";

/** Empty dashboard skeleton: the role's question plus unfilled metric cards. */
export function DashboardPlaceholder({
  title,
  question,
  metrics,
}: {
  title: string;
  question: string;
  metrics: string[];
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-muted-foreground text-sm">{question}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((m) => (
          <Card key={m} size="sm">
            <CardHeader>
              <CardDescription>{m}</CardDescription>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">—</CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardContent className="text-muted-foreground flex h-64 items-center justify-center text-sm">
          Charts and activity coming soon.
        </CardContent>
      </Card>
    </div>
  );
}
