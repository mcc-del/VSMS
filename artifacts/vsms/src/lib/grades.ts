// Grades that can be credited in the Million Cans Recycling Competition.
// Keep in sync with GRADES in artifacts/api-server/src/lib/cans.ts.
export const GRADES = [
  "Pre-School",
  "Kindergarten",
  "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6",
  "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12",
];

// Public drop-off form path — this is what the QR code on the dumpster opens.
export const CAN_DROPOFF_PATH = "/cans";

export function canDropoffUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}${CAN_DROPOFF_PATH}`;
}
