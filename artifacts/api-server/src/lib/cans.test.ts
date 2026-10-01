import { describe, it, expect } from "vitest";
import {
  cansFromPounds,
  parseDropoff,
  publicName,
  undoToken,
  canUndo,
  CANS_PER_POUND,
  MAX_DROPOFF_LBS,
  SCHOOL_WIDE,
  UNDO_WINDOW_MS,
} from "./cans";

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
  it("treats grade as optional but rejects unknown grades", () => {
    expect(parseDropoff({ grade: "Grade 99", weightLbs: 2 }, GRADES).ok).toBe(false);
    const none = parseDropoff({ weightLbs: 2 }, GRADES);
    expect(none.ok && none.value.grade).toBe(SCHOOL_WIDE);
    const blank = parseDropoff({ grade: "  ", weightLbs: 2 }, GRADES);
    expect(blank.ok && blank.value.grade).toBe(SCHOOL_WIDE);
  });
  it("rejects missing, zero, negative and absurd weights", () => {
    expect(parseDropoff({ grade: "Grade 4" }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: 0 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: -3 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: "abc" }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: MAX_DROPOFF_LBS + 1 }, GRADES).ok).toBe(false);
    expect(parseDropoff({ grade: "Grade 4", weightLbs: 0.001 }, GRADES).ok).toBe(false);
  });
  it("ignores grade when grades are turned off", () => {
    expect(parseDropoff({ weightLbs: 2 }, null)).toEqual({
      ok: true,
      value: { grade: SCHOOL_WIDE, contributorName: null, weightLbs: 2 },
    });
    const r = parseDropoff({ grade: "Grade 4", weightLbs: 2 }, null);
    expect(r.ok && r.value.grade).toBe(SCHOOL_WIDE);
    expect(parseDropoff({ weightLbs: 0 }, null).ok).toBe(false);
  });
});

describe("publicName (first name + last initial)", () => {
  it("shortens and tidies names", () => {
    expect(publicName("  aisha   khan ")).toBe("Aisha K.");
    expect(publicName("Omar ibn Ali")).toBe("Omar A.");
    expect(publicName("ZAYD")).toBe("Zayd");
    expect(publicName("   ")).toBe("");
  });
});

describe("undo tokens", () => {
  const secret = "test-secret-at-least-16-chars";
  const at = new Date("2026-10-01T12:00:00Z");
  const tok = undoToken(secret, "drop-1", at);

  it("lets the same phone undo within the window", () => {
    expect(canUndo(secret, "drop-1", at, tok, at.getTime() + 60_000)).toBe(true);
  });
  it("expires after the window", () => {
    expect(canUndo(secret, "drop-1", at, tok, at.getTime() + UNDO_WINDOW_MS + 1)).toBe(false);
  });
  it("rejects a token for another drop-off, a wrong secret or garbage", () => {
    expect(canUndo(secret, "drop-2", at, tok, at.getTime())).toBe(false);
    expect(canUndo("another-secret-1234567", "drop-1", at, tok, at.getTime())).toBe(false);
    expect(canUndo(secret, "drop-1", at, "nope", at.getTime())).toBe(false);
    expect(canUndo(secret, "drop-1", at, undefined, at.getTime())).toBe(false);
  });
});
