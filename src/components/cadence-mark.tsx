import Image from "next/image";
import { cn } from "~/lib/utils";

/** The Cadence app icon (public/icon_transparent.png, resized by next/image). */
export function CadenceLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/icon_transparent.png"
      alt="Cadence"
      width={64}
      height={64}
      className={cn("size-6 shrink-0", className)}
      priority
    />
  );
}

export function CadenceMark() {
  return (
    <span className="flex items-center gap-2 font-medium">
      <CadenceLogo />
      Cadence
    </span>
  );
}
