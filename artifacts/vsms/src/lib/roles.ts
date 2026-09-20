// User-facing labels for internal role keys. We keep the internal keys
// (org_admin, admin) unchanged in the database and code, and only relabel them
// in the UI: an org-scoped "org_admin" is shown as "Admin", and the global
// "admin" is shown as "Super Admin".
export function roleLabel(role: string | null | undefined): string {
  switch (role) {
    case "participant": return "Participant";
    case "parent": return "Parent";
    case "supervisor": return "Supervisor";
    case "org_admin": return "Admin";
    case "admin": return "Super Admin";
    default: return role ? role.charAt(0).toUpperCase() + role.slice(1) : "";
  }
}
