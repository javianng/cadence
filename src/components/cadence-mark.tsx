import { ActivityIcon } from "lucide-react";

export function CadenceMark() {
  return (
    <span className="flex items-center gap-2 font-medium">
      <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
        <ActivityIcon className="size-4" />
      </span>
      Cadence
    </span>
  );
}
