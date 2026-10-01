import { createHmac, timingSafeEqual } from "node:crypto";

// Weight → can conversion for the Million Cans dumpster drop-off form.
// Bags are too dirty to count by hand, so people weigh them on the scale next
// to the dumpster and we estimate: 35 aluminum cans ≈ 1 pound.
export const CANS_PER_POUND = 35;

// A single bag over this is almost certainly a typo (e.g. "150" for "15.0").
// Heavier loads can be entered as several bags.
export const MAX_DROPOFF_LBS = 100;

// The dumpster is weighed unsupervised, so there are no grade prizes: the
// whole school shares one goal. Grade is an OPTIONAL question on the form and
// the public page shows grade totals just for fun. Set false to hide the
// grade question and grade totals again.
export const GRADES_ENABLED = true;
// Staff "log a bin" stays off: the QR form is the only input to the total.
// Set true to bring it back (code kept, not deleted).
export const STAFF_BIN_LOGGING_ENABLED = false;
// Grade stored on drop-offs with no grade chosen.
export const SCHOOL_WIDE = "Whole school";

// Public display name for the top-contributors list: first name + last
// initial ("aisha  khan" -> "Aisha K.") so students' full names stay private.
export function publicName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  const first = cap(parts[0]);
  return parts.length > 1 ? `${first} ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : first;
}

// Grades a drop-off can be credited to (mirrors the frontend list).
export const GRADES = [
  "Pre-School",
  "Pre-K",
  "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9",
] as const;

export function cansFromPounds(lbs: number): number {
  return Math.round(lbs * CANS_PER_POUND);
}

export type DropoffInput = { grade: string; contributorName: string | null; weightLbs: number };

// Validates the public drop-off body. Returns the cleaned input or a
// user-facing error message.
// Grade is optional: none chosen -> SCHOOL_WIDE; an unknown grade is an error.
// Pass `grades: null` when grades are off: any grade sent is ignored.
export function parseDropoff(
  body: unknown,
  grades: readonly string[] | null,
): { ok: true; value: DropoffInput } | { ok: false; error: string } {
  const b = (body ?? {}) as { grade?: unknown; contributorName?: unknown; weightLbs?: unknown };

  let grade: string = SCHOOL_WIDE;
  const chosen = typeof b.grade === "string" ? b.grade.trim() : "";
  if (grades && chosen) {
    if (!grades.includes(chosen)) return { ok: false, error: "Please choose a grade from the list." };
    grade = chosen;
  }

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

// Self-service undo: right after a drop-off, the phone that made it can take
// it back (e.g. typed 30 lbs instead of 3.0). The token is an HMAC of the
// drop-off id and time, so nobody can undo someone else's entry, and it
// expires after UNDO_WINDOW_MS. Nothing extra is stored in the database.
export const UNDO_WINDOW_MS = 15 * 60 * 1000;

export function undoToken(secret: string, dropoffId: string, createdAt: Date): string {
  return createHmac("sha256", secret).update(`undo:${dropoffId}:${createdAt.getTime()}`).digest("base64url");
}

export function canUndo(
  secret: string,
  dropoffId: string,
  createdAt: Date,
  token: unknown,
  now = Date.now(),
): boolean {
  if (typeof token !== "string" || now - createdAt.getTime() > UNDO_WINDOW_MS) return false;
  const expected = Buffer.from(undoToken(secret, dropoffId, createdAt));
  const given = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
