import { Clock } from "lucide-react";

// Flip this to true (or delete the banner usages) once the competition opens.
export const COMPETITION_OPEN = true;

// A prominent notice shown on the public pages while the competition hasn't
// started. Kept in one place so it's a one-line change to turn off.
export function ComingSoonBanner() {
  if (COMPETITION_OPEN) return null;
  return (
    <div className="w-full bg-amber-500 text-amber-950">
      <div className="mx-auto max-w-5xl px-4 py-2.5 flex items-center justify-center gap-2 text-center text-sm font-medium">
        <Clock className="w-4 h-4 shrink-0" />
        <span>
          The 2026–2027 MedinaCares Service Awards aren't open yet — the site is being finalized.
          Please check back soon.
        </span>
      </div>
    </div>
  );
}
