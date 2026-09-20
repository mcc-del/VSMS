import { gradeToLevel, type SchoolLevel } from "./levels";

export interface Thresholds {
  bronze: number;
  silver: number;
  gold: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { bronze: 40, silver: 60, gold: 80 };

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
  if (!best) return DEFAULT_THRESHOLDS;
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
