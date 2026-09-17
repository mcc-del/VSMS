// The award season runs Sept 23 – Jun 22. Volunteer hours must fall inside an
// award window; dates in the summer gap (Jun 23 – Sep 22) are outside any
// season and are not accreditable.
export const SEASON_START = { month: 9, day: 23 }; // Sept 23
export const SEASON_END = { month: 6, day: 22 }; // Jun 22

// Returns true if a YYYY-MM-DD date falls within an award window (by month/day).
export function isWithinAwardWindow(dateStr: string): boolean {
  const m = Number(dateStr.slice(5, 7));
  const d = Number(dateStr.slice(8, 10));
  if (Number.isNaN(m) || Number.isNaN(d)) return false;
  const md = m * 100 + d; // e.g. Sept 23 -> 923, Jun 22 -> 622
  // Inside the window when on/after Sept 23 (fall) OR on/before Jun 22 (spring).
  return md >= 923 || md <= 622;
}

export const AWARD_WINDOW_MESSAGE =
  "That date is outside the award season (Sept 23 – Jun 22). Only hours volunteered during the season can be accredited.";
