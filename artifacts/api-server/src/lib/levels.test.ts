import { describe, it, expect } from "vitest";
import { gradeToLevel, orgAllowsLevel } from "./levels";

describe("gradeToLevel", () => {
  it("maps grades 2–5 to elementary", () => {
    expect(gradeToLevel("2")).toBe("elementary");
    expect(gradeToLevel("5")).toBe("elementary");
  });
  it("maps grades 6–8 to middle", () => {
    expect(gradeToLevel("6")).toBe("middle");
    expect(gradeToLevel("8")).toBe("middle");
  });
  it("maps grades 9–12 to high", () => {
    expect(gradeToLevel("9")).toBe("high");
    expect(gradeToLevel("12")).toBe("high");
  });
  it("returns null for unknown/empty", () => {
    expect(gradeToLevel(null)).toBeNull();
    expect(gradeToLevel("")).toBeNull();
    expect(gradeToLevel("K")).toBeNull();
  });
  it("tolerates decorated grade strings", () => {
    expect(gradeToLevel("Grade 4")).toBe("elementary");
    expect(gradeToLevel("11th")).toBe("high");
  });
});

describe("orgAllowsLevel", () => {
  const org = { allowsElementary: false, allowsMiddle: true, allowsHigh: true };
  it("enforces the org's level flags", () => {
    expect(orgAllowsLevel(org, "elementary")).toBe(false);
    expect(orgAllowsLevel(org, "middle")).toBe(true);
    expect(orgAllowsLevel(org, "high")).toBe(true);
  });
  it("does not hide events when the level is unknown", () => {
    expect(orgAllowsLevel(org, null)).toBe(true);
  });
});
