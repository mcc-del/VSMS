import { db, orgAdminsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// The set of organizations an admin-type user may act on.
//   - Super Admin (role "admin"): returns null, meaning "all organizations".
//   - Organization Admin (role "org_admin"): the org IDs they manage.
//   - Anyone else: an empty array.
export async function managedOrgIds(
  userId: string,
  role: string,
): Promise<string[] | null> {
  if (role === "admin") return null; // null == unrestricted
  if (role !== "org_admin") return [];
  const rows = await db
    .select({ organizationId: orgAdminsTable.organizationId })
    .from(orgAdminsTable)
    .where(eq(orgAdminsTable.userId, userId));
  return rows.map((r) => r.organizationId);
}

// Whether the user may act on a specific organization. Super Admin: always.
export function canManageOrg(managed: string[] | null, organizationId: string | null): boolean {
  if (managed === null) return true; // super admin
  if (!organizationId) return false; // org admins can't touch open/no-org items
  return managed.includes(organizationId);
}
