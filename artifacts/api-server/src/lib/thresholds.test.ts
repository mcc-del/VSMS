import { describe, it, expect } from "vitest";
import { resolveThresholds, thresholdsForGrade, medalFor, DEFAULT_THRESHOLDS } from "./thresholds";

const rows = [
  { level: null, organizationId: null, bronze: 40, silver: 60, gold: 80 },        // global
  { level: "elementary", organizationId: null, bronze: 20, silver: 30, gold: 40 }, // lower grades
  { level: null, organizationId: "org-1", bronze: 50, silver: 70, gold: 90 },       // org override
  { level: "high", organizationId: "org-1", bronze: 55, silver: 75, gold: 95 },     // most specific
];

describe("resolveThresholds precedence", () => {
  it("falls back to the built-in default when no rows match", () => {
    expect(resolveThresholds([], "middle", null)).toEqual(DEFAULT_THRESHOLDS);
  });
  it("uses the global row for a plain participant", () => {
    expect(resolveThresholds(rows, "middle", null)).toEqual({ bronze: 40, silver: 60, gold: 80 });
  });
  it("applies a lower bar for elementary", () => {
    expect(resolveThresholds(rows, "elementary", null)).toEqual({ bronze: 20, silver: 30, gold: 40 });
  });
  it("org override beats the global default", () => {
    expect(resolveThresholds(rows, "middle", "org-1")).toEqual({ bronze: 50, silver: 70, gold: 90 });
  });
  it("level+org is the most specific and wins", () => {
    expect(resolveThresholds(rows, "high", "org-1")).toEqual({ bronze: 55, silver: 75, gold: 95 });
  });
});

describe("thresholdsForGrade + medalFor", () => {
  it("maps a grade string to the right band", () => {
    expect(thresholdsForGrade(rows, "3", null)).toEqual({ bronze: 20, silver: 30, gold: 40 });
  });
  it("awards the right medal at the elementary bar", () => {
    const t = thresholdsForGrade(rows, "3", null);
    expect(medalFor(39, t)).toBe("Silver"); // 39 ≥ 30 but < 40
    expect(medalFor(40, t)).toBe("Gold");
    expect(medalFor(10, t)).toBeNull();
  });
});
