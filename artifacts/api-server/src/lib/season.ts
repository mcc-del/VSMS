// The award season runs Sept 15 – Jun 15. Volunteer hours must fall inside an
// award window; dates in the summer gap (Jun 16 – Sep 14) are outside any
// season and are not accreditable.
export const SEASON_START = { month: 9, day: 15 }; // Sept 15
export const SEASON_END = { month: 6, day: 15 }; // Jun 15

// Returns true if a YYYY-MM-DD date falls within an award window (by month/day).
export function isWithinAwardWindow(dateStr: string): boolean {
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return false;
  const md = m * 100 + d; // e.g. Sept 15 -> 915, Jun 15 -> 615
  // Inside the window when on/after Sept 15 (fall) OR on/before Jun 15 (spring).
  return md >= 915 || md <= 615;
}

export const AWARD_WINDOW_MESSAGE =
  "That date is outside the award season (Sept 15 – Jun 15). Only hours volunteered during the season can be accredited.";
