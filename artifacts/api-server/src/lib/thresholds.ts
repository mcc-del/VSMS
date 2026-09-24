import { gradeToLevel, type SchoolLevel } from "./levels";

export interface Thresholds {
  bronze: number;
  silver: number;
  gold: number;
}

// PVSA hour thresholds per band (minimum hours for each medal):
//   Kids (grades 2–5):        Bronze 26, Silver 50, Gold 75
//   Teens (grades 6–10):      Bronze 50, Silver 75, Gold 100
//   Young Adults (grades 11–12): Bronze 100, Silver 175, Gold 250
export const LEVEL_DEFAULTS: Record<SchoolLevel, Thresholds> = {
  elementary: { bronze: 26, silver: 50, gold: 75 },
  middle: { bronze: 50, silver: 75, gold: 100 },
  high: { bronze: 100, silver: 175, gold: 250 },
};

// Fallback when a participant's grade/band is unknown — the Teens band.
export const DEFAULT_THRESHOLDS: Thresholds = LEVEL_DEFAULTS.middle;

export interface ThresholdRow {
  level: string | null;
  organizationId: string | null;
  bronze: number;
  silver: number;
  gold: number;
}

// Pick the most specific matching threshold row for a participant.
// Precedence: level+org > org-only > level-only > global (both null) > default.
export function resolveThresholds(
  rows: ThresholdRow[],
  level: SchoolLevel | null,
  organizationId: string | null,
): Thresholds {
  const matches = (r: ThresholdRow) =>
    (r.level === null || r.level === level) &&
    (r.organizationId === null || r.organizationId === organizationId);
  const score = (r: ThresholdRow) =>
    (r.level !== null ? 2 : 0) + (r.organizationId !== null ? 1 : 0);
  const best = rows
    .filter(matches)
    .sort((a, b) => score(b) - score(a))[0];
  // No configured row: fall back to the PVSA default for this band (or the
  // generic default when the band is unknown).
  if (!best) return level ? LEVEL_DEFAULTS[level] : DEFAULT_THRESHOLDS;
  return { bronze: best.bronze, silver: best.silver, gold: best.gold };
}

// Convenience: resolve directly from a stored grade string.
export function thresholdsForGrade(
  rows: ThresholdRow[],
  grade: string | null | undefined,
  organizationId: string | null,
): Thresholds {
  return resolveThresholds(rows, gradeToLevel(grade), organizationId);
}

// The earned medal for a given approved-hours total under the thresholds.
export function medalFor(hours: number, t: Thresholds): "Gold" | "Silver" | "Bronze" | null {
  if (hours >= t.gold) return "Gold";
  if (hours >= t.silver) return "Silver";
  if (hours >= t.bronze) return "Bronze";
  return null;
}
