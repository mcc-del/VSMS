export type SchoolLevel = "elementary" | "middle" | "high";

// Map a stored grade string to a school level. Grades 2-5 => elementary,
// 6-8 => middle, 9-12 => high. Returns null when unknown.
export function gradeToLevel(grade: string | null | undefined): SchoolLevel | null {
  if (!grade) return null;
  const n = Number(String(grade).replace(/[^0-9]/g, ""));
  if (!Number.isFinite(n) || n === 0) return null;
  if (n <= 5) return "elementary";
  if (n <= 8) return "middle";
  return "high";
}

// Whether an org that serves the given level-allow flags is eligible for a level.
export function orgAllowsLevel(
  org: { allowsElementary: boolean; allowsMiddle: boolean; allowsHigh: boolean },
  level: SchoolLevel | null,
): boolean {
  if (!level) return true; // unknown level: don't hide anything
  if (level === "elementary") return org.allowsElementary;
  if (level === "middle") return org.allowsMiddle;
  return org.allowsHigh;
}
