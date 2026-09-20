import { describe, it, expect } from "vitest";
import { isWithinAwardWindow } from "./season";

describe("isWithinAwardWindow (Sept 23 – Jun 22)", () => {
  it("accepts fall dates on/after Sept 23", () => {
    expect(isWithinAwardWindow("2026-09-23")).toBe(true);
    expect(isWithinAwardWindow("2026-12-01")).toBe(true);
  });
  it("accepts spring dates on/before Jun 22", () => {
    expect(isWithinAwardWindow("2027-01-15")).toBe(true);
    expect(isWithinAwardWindow("2027-06-22")).toBe(true);
  });
  it("rejects the summer gap (Jun 23 – Sep 22)", () => {
    expect(isWithinAwardWindow("2026-06-23")).toBe(false);
    expect(isWithinAwardWindow("2026-07-15")).toBe(false);
    expect(isWithinAwardWindow("2026-09-22")).toBe(false);
  });
  it("rejects malformed dates", () => {
    expect(isWithinAwardWindow("not-a-date")).toBe(false);
  });
});
