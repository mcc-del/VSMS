// Preset list of schools shown in the sign-up dropdown.
// TODO: replace these with the real list of participating schools.
export const SCHOOLS = [
  "Medina Academy",
  "Al-Huda School",
  "Iman Academy",
  "Crescent Prep",
  "Other",
];

// Grades a student may self-register with (middle & high — elementary is
// parent-led, so it is not offered on the student sign-up form).
export const GRADES = ["6", "7", "8", "9", "10", "11", "12"];

// Every grade, including elementary — used on the parent "add child" form
// where a parent enrolls a young child who has no login of their own.
export const ALL_GRADES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Elementary grades only. A parent-managed child (no login) must be grades 2–5;
// older students self-register with their own account.
export const ELEM_GRADES = ["2", "3", "4", "5"];
