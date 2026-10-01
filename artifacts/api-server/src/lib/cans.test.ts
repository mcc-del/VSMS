import { describe, it, expect } from "vitest";
import { cansFromPounds, parseDropoff, CANS_PER_POUND, MAX_DROPOFF_LBS, SCHOOL_WIDE } from "./cans";

const GRADES = ["Kindergarten", "Grade 4"];

describe("cansFromPounds (35 cans per pound)", () => {
  it("converts whole and fractional pounds", () => {
    expect(CANS_PER_POUND).toBe(35);
    expect(cansFromPounds(1)).toBe(35);
    expect(cansFromPounds(2.5)).toBe(88); // 87.5 rounds up
    expect(cansFromPounds(10)).toBe(350);
  });
});

describe("parseDropoff", () => {
  it("accepts a valid drop-off and trims the name", () => {
    const r = parseDropoff({ grade: "Grade 4", contributorName: "  Aisha  ", weightLbs: 3.456 }, GRADES);
    expect(r).toEqual({ ok: true, value: { grade: "Grade 4", contributorName: "Aisha", weightLbs: 3.46 } });
  });
  it("treats the name as optional", () => {
    const r = parseDropoff({ grade: "Kindergarten", weightLbs: "2" }, GRADES);
    expect(r).toEqual({ ok: true, value: { grade: "Kindergarten", contributorName: null, weightLbs: 2 } });
  });
  it("requires a known grade", () => {
    expect(parseDropoff({ grade: "Grade 99", weightLbs: 2 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ weightLbs: 2 }, GRADES).ok).toBe(false);
  });
  it("rejects missing, zero, negative and absurd weights", () => {
    expect(parseDropoff({ grade: "Grade 4" }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: 0 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: -3 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: "abc" }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: MAX_DROPOFF_LBS + 1 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: 0.001 }, GRADES).ok).toBe(false);
  });
  it("credits the whole school and ignores grade when the grade competition is off", () => {
    expect(parseDropoff({ weightLbs: 2 }, null)).toEqual({
      ok: true,
      value: { grade: SCHOOL_WIDE, contributorName: null, weightLbs: 2 },
    });
    const r = parseDropoff({ grade: "Grade 4", weightLbs: 2 }, null);
    expect(r.ok && r.value.grade).toBe(SCHOOL_WIDE);
    expect(parseDropoff({ weightLbs: 0 }, null).ok).toBe(false);
  });
});
