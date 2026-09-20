import { describe, it, expect } from "vitest";
import { canManageOrg, canActOnUser } from "./org-scope";

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

// User-management isolation: which users an admin may create/edit/delete.
describe("canActOnUser", () => {
  it("Super Admin can act on anyone", () => {
    expect(canActOnUser(null, "participant", "org-1")).toBe(true);
    expect(canActOnUser(null, "admin", null)).toBe(true);
    expect(canActOnUser(null, "org_admin", "org-2")).toBe(true);
  });
  it("Admin can act on non-admin users in their org", () => {
    expect(canActOnUser(["org-1"], "participant", "org-1")).toBe(true);
    expect(canActOnUser(["org-1"], "supervisor", "org-1")).toBe(true);
    expect(canActOnUser(["org-1"], "parent", "org-1")).toBe(true);
  });
  it("Admin cannot act on users in another org", () => {
    expect(canActOnUser(["org-1"], "participant", "org-2")).toBe(false);
    expect(canActOnUser(["org-1"], "participant", null)).toBe(false);
  });
  it("Admin can never act on other Admins or Super Admins", () => {
    expect(canActOnUser(["org-1"], "org_admin", "org-1")).toBe(false);
    expect(canActOnUser(["org-1"], "admin", "org-1")).toBe(false);
  });
});
