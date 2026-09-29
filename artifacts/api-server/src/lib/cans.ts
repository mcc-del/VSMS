// Weight → can conversion for the Million Cans dumpster drop-off form.
// Bags are too dirty to count by hand, so people weigh them on the scale next
// to the dumpster and we estimate: 35 aluminum cans ≈ 1 pound.
export const CANS_PER_POUND = 35;

// A single bag over this is almost certainly a typo (e.g. "150" for "15.0").
// Heavier loads can be entered as several bags.
export const MAX_DROPOFF_LBS = 100;

// Grades a drop-off can be credited to (mirrors the frontend list).
export const GRADES = [
  "Pre-School",
  "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
] as const;

export function cansFromPounds(lbs: number): number {
  return Math.round(lbs * CANS_PER_POUND);
}

export type DropoffInput = { grade: string; contributorName: string | null; weightLbs: number };

// Validates the public drop-off body. Returns the cleaned input or a
// user-facing error message.
export function parseDropoff(
  body: unknown,
  grades: readonly string[],
): { ok: true; value: DropoffInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { grade?: unknown; contributorName?: unknown; weightLbs?: unknown };

  const grade = typeof b.grade === "string" ? b.grade.trim() : "";
  if (!grades.includes(grade)) return { ok: false, error: "Please choose a grade." };

  const weightLbs =
    typeof b.weightLbs === "number"
      ? b.weightLbs
      : typeof b.weightLbs === "string"
        ? Number(b.weightLbs)
        : NaN;
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) {
    return { ok: false, error: "Please enter the weight shown on the scale." };
  }
  if (weightLbs > MAX_DROPOFF_LBS) {
    return {
      ok: false,
      error: `That's more than ${MAX_DROPOFF_LBS} lbs — please double-check the scale, or enter each bag separately.`,
    };
  }
  if (cansFromPounds(weightLbs) < 1) {
    return { ok: false, error: "That weight is too small to count — please double-check the scale." };
  }

  const rawName = typeof b.contributorName === "string" ? b.contributorName.trim() : "";
  const contributorName = rawName ? rawName.slice(0, 80) : null;

  return { ok: true, value: { grade, contributorName, weightLbs: Math.round(weightLbs * 100) / 100 } };
}
