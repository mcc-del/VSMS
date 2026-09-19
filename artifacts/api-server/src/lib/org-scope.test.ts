import { describe, it, expect } from "vitest";
import { canManageOrg } from "./org-scope";

// Org isolation is the highest-risk area as more organizations are onboarded:
// an Admin must never act outside the org(s) they manage.
describe("canManageOrg", () => {
  it("Super Admin (managed = null) can act on any org", () => {
    expect(canManageOrg(null, "org-1")).toBe(true);
    expect(canManageOrg(null, null)).toBe(true);
  });
  it("Admin can act only on their managed orgs", () => {
    expect(canManageOrg(["org-1", "org-2"], "org-1")).toBe(true);
    expect(canManageOrg(["org-1"], "org-2")).toBe(false);
  });
  it("Admin cannot act on open/no-org items", () => {
    expect(canManageOrg(["org-1"], null)).toBe(false);
  });
  it("a user managing no org can act on nothing", () => {
    expect(canManageOrg([], "org-1")).toBe(false);
  });
});
