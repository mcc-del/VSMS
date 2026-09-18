import { useState } from "react";
import { useListUsers, useCreateUser, useDeleteUser, useUpdateUser, useAddManualHours, useListOrganizations, useSetOrgAdmin, getListUsersQueryKey, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Clock, Building2, Pencil, FileText, Search, Eye, EyeOff } from "lucide-react";
import { useLocation } from "wouter";
import { roleLabel } from "@/lib/roles";
import { useAuth } from "@/hooks/use-auth";

const schema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8, "Min 8 characters"),
  role: z.enum(["participant", "supervisor", "admin"]),
  phone: z.string().optional(),
});

const hoursSchema = z.object({
  hours: z.coerce.number().min(0.5, "Min 0.5 hours").max(500, "Max 500 hours"),
  description: z.string().min(2, "Required").max(300),
  dateAwarded: z.string().min(1, "Required"),
});

const todayStr = new Date().toISOString().split("T")[0];

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 border-0",
    org_admin: "bg-teal-100 text-teal-800 border-0",
    supervisor: "bg-blue-100 text-blue-800 border-0",
    parent: "bg-amber-100 text-amber-800 border-0",
    participant: "bg-gray-100 text-gray-700 border-0",
  };
  return <Badge className={colors[role] ?? ""}>{roleLabel(role)}</Badge>;
}

export default function AdminUsers() {
  const { role: currentRole } = useAuth();
  const isSuperAdmin = currentRole === "admin";
  const { data: users, isLoading } = useListUsers();
  const { data: organizations } = useListOrganizations();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const addHours = useAddManualHours();
  const setOrgAdmin = useSetOrgAdmin();
  const updateUser = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [editUser, setEditUser] = useState<{ userId: string; firstName: string; lastName: string; phone: string } | null>(null);

  function saveEditUser() {
    if (!editUser) return;
    updateUser.mutate(
      { userId: editUser.userId, data: { firstName: editUser.firstName, lastName: editUser.lastName, phone: editUser.phone || null } },
      {
        onSuccess: () => {
          toast({ title: "User updated" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setEditUser(null);
        },
        onError: (err: any) => toast({ title: "Error", description: err?.data?.error ?? "Failed", variant: "destructive" }),
      },
    );
  }
  const [hoursUser, setHoursUser] = useState<{ userId: string; name: string } | null>(null);
  const [orgAdminUser, setOrgAdminUser] = useState<{ userId: string; name: string } | null>(null);
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);

  function openOrgAdmin(userId: string, name: string, current: string[]) {
    setOrgAdminUser({ userId, name });
    setSelectedOrgIds(current);
  }

  function toggleOrg(orgId: string) {
    setSelectedOrgIds((prev) =>
      prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId],
    );
  }

  function saveOrgAdmin() {
    if (!orgAdminUser) return;
    setOrgAdmin.mutate(
      { userId: orgAdminUser.userId, data: { organizationIds: selectedOrgIds } },
      {
        onSuccess: () => {
          toast({
            title: selectedOrgIds.length ? "Admin access updated" : "Reverted to participant",
          });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          setOrgAdminUser(null);
        },
        onError: (err: any) =>
          toast({ title: "Error", description: err?.data?.error ?? "Failed", variant: "destructive" }),
      },
    );
  }

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", role: "participant" as const, phone: "" },
  });

  const hoursForm = useForm({
    resolver: zodResolver(hoursSchema),
    defaultValues: { hours: 1, description: "", dateAwarded: todayStr },
  });

  function openAddHours(userId: string, name: string) {
    setHoursUser({ userId, name });
    hoursForm.reset({ hours: 1, description: "", dateAwarded: todayStr });
  }

  function onSubmitHours(values: z.infer<typeof hoursSchema>) {
    if (!hoursUser) return;
    addHours.mutate(
      { userId: hoursUser.userId, data: values },
      {
        onSuccess: () => {
          toast({ title: "Hours added", description: `${values.hours}h credited to ${hoursUser.name}.` });
          setHoursUser(null);
          hoursForm.reset();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Failed to add hours", variant: "destructive" });
        },
      },
    );
  }

  function onSubmit(values: z.infer<typeof schema>) {
    createUser.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: "User created" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          setShowCreate(false);
          form.reset();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Failed to create user", variant: "destructive" });
        },
      }
    );
  }

  function handleDelete(userId: string, name: string) {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    deleteUser.mutate(
      { userId },
      {
        onSuccess: () => {
          toast({ title: "User deleted" });
          queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to delete user", variant: "destructive" });
        },
      }
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">User Management</h1>
            <p className="text-muted-foreground text-sm mt-1">{users?.length ?? 0} registered users</p>
          </div>
          <Button data-testid="button-create-user" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add User
          </Button>
        </div>

        {(() => {
          const q = search.trim().toLowerCase();
          const filtered = (users ?? []).filter((u) => {
            if (roleFilter !== "all" && u.role !== roleFilter) return false;
            if (!q) return true;
            return (
              `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
              (u.email ?? "").toLowerCase().includes(q)
            );
          });
          const roleCount = (r: string) => (users ?? []).filter((u) => u.role === r).length;
          return (
        <Card>
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-base">Users ({filtered.length})</CardTitle>
              <div className="relative w-56 max-w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-user-search" />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                ["all", `All (${users?.length ?? 0})`],
                ["participant", `Participants (${roleCount("participant")})`],
                ["supervisor", `Supervisors (${roleCount("supervisor")})`],
                ["org_admin", `Admins (${roleCount("org_admin")})`],
                ["parent", `Parents (${roleCount("parent")})`],
                ["admin", `Super Admins (${roleCount("admin")})`],
              ].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setRoleFilter(val)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border ${roleFilter === val ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-muted-foreground border-transparent hover:bg-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No users match.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pb-2 font-medium text-muted-foreground">Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Email</th>
                    <th className="pb-2 font-medium text-muted-foreground">Role</th>
                    <th className="pb-2 font-medium text-muted-foreground">Joined</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((u) => (
                    <tr key={u.userId} data-testid={`row-user-${u.userId}`}>
                      <td className="py-3 font-medium">{u.firstName} {u.lastName}</td>
                      <td className="py-3 text-muted-foreground">{u.email}</td>
                      <td className="py-3"><RoleBadge role={u.role} /></td>
                      <td className="py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-3">
                        <div className="flex items-center justify-end gap-1">
                          {u.role === "participant" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-add-hours-${u.userId}`}
                              onClick={() => openAddHours(u.userId, `${u.firstName} ${u.lastName}`)}
                              className="text-muted-foreground hover:text-primary gap-1"
                            >
                              <Clock className="w-4 h-4" /> Add hours
                            </Button>
                          )}
                          {u.role === "participant" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-service-record-${u.userId}`}
                              onClick={() => setLocation(`/admin/users/${u.userId}/service-record`)}
                              className="text-muted-foreground hover:text-primary gap-1"
                            >
                              <FileText className="w-4 h-4" /> Service record
                            </Button>
                          )}
                          {isSuperAdmin && (u.role === "participant" || u.role === "org_admin" || u.role === "supervisor") && (
                            <Button
                              variant="ghost"
                              size="sm"
                              data-testid={`button-org-admin-${u.userId}`}
                              onClick={() =>
                                openOrgAdmin(
                                  u.userId,
                                  `${u.firstName} ${u.lastName}`,
                                  u.managedOrganizationIds ?? [],
                                )
                              }
                              className="text-muted-foreground hover:text-primary gap-1"
                            >
                              <Building2 className="w-4 h-4" /> Org admin
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            data-testid={`button-edit-user-${u.userId}`}
                            onClick={() =>
                              setEditUser({
                                userId: u.userId,
                                firstName: u.firstName,
                                lastName: u.lastName,
                                phone: u.phone ?? "",
                              })
                            }
                            className="text-muted-foreground hover:text-primary gap-1"
                          >
                            <Pencil className="w-4 h-4" /> Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-delete-user-${u.userId}`}
                            onClick={() => handleDelete(u.userId, `${u.firstName} ${u.lastName}`)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
          );
        })()}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="firstName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>First name</FormLabel>
                    <FormControl><Input placeholder="Jane" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="lastName" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last name</FormLabel>
                    <FormControl><Input placeholder="Smith" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="jane@example.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temporary password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input type={showCreatePw ? "text" : "password"} placeholder="Min 8 characters" className="pr-10" {...field} />
                      <button type="button" onClick={() => setShowCreatePw((v) => !v)} tabIndex={-1}
                        aria-label={showCreatePw ? "Hide password" : "Show password"}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                        {showCreatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground">We'll email the person an invite with a link to set their own password. This temporary one is a fallback.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone <span className="text-muted-foreground font-normal">(optional — shown to participants for supervisors)</span></FormLabel>
                  <FormControl><Input type="tel" placeholder="(425) 555-0100" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="participant">Participant</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                      {isSuperAdmin && <SelectItem value="admin">Super Admin</SelectItem>}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={createUser.isPending}>
                {createUser.isPending ? "Creating..." : "Create User"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={editUser !== null} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">First name</label>
                  <Input value={editUser.firstName} onChange={(e) => setEditUser({ ...editUser, firstName: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Last name</label>
                  <Input value={editUser.lastName} onChange={(e) => setEditUser({ ...editUser, lastName: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Phone</label>
                <Input
                  type="tel"
                  placeholder="(425) 555-0100"
                  value={editUser.phone}
                  onChange={(e) => setEditUser({ ...editUser, phone: e.target.value })}
                  data-testid="input-edit-phone"
                />
                <p className="text-xs text-muted-foreground">Shown to participants for supervisors.</p>
              </div>
              <Button className="w-full" onClick={saveEditUser} disabled={updateUser.isPending} data-testid="button-save-user">
                {updateUser.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={orgAdminUser !== null} onOpenChange={(open) => !open && setOrgAdminUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Admin access{orgAdminUser ? ` — ${orgAdminUser.name}` : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Check the organizations this person should manage — an Admin can create events, generate
            join codes, add participant hours, manage that org's users, and approve hours for those
            organizations. Checking at least one makes them an Admin; leaving all unchecked (and
            saving) removes Admin access and returns them to a regular participant.
          </p>
          <div className="space-y-2 pt-2 max-h-64 overflow-y-auto">
            {(organizations ?? []).map((o) => (
              <label key={o.organizationId} className="flex items-center gap-2.5 text-sm cursor-pointer">
                <Checkbox
                  checked={selectedOrgIds.includes(o.organizationId)}
                  onCheckedChange={() => toggleOrg(o.organizationId)}
                  data-testid={`checkbox-org-${o.organizationId}`}
                />
                {o.name}
              </label>
            ))}
          </div>
          <Button
            className="w-full mt-2"
            onClick={saveOrgAdmin}
            disabled={setOrgAdmin.isPending}
            data-testid="button-save-org-admin"
          >
            {setOrgAdmin.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={hoursUser !== null} onOpenChange={(open) => !open && setHoursUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add hours{hoursUser ? ` for ${hoursUser.name}` : ""}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            These hours are approved immediately and count toward the participant's total and award milestones.
          </p>
          <Form {...hoursForm}>
            <form onSubmit={hoursForm.handleSubmit(onSubmitHours)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <FormField control={hoursForm.control} name="hours" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours</FormLabel>
                    <FormControl><Input type="number" step="0.5" min="0.5" max="500" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={hoursForm.control} name="dateAwarded" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={hoursForm.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl><Input placeholder="e.g. Community cleanup (off-platform)" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={addHours.isPending}>
                {addHours.isPending ? "Adding..." : "Add hours"}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
