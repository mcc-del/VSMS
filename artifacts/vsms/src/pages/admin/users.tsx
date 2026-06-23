import { useState } from "react";
import { useListUsers, useCreateUser, useDeleteUser, getListUsersQueryKey, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
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
import { Plus, Trash2 } from "lucide-react";

const schema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8, "Min 8 characters"),
  role: z.enum(["participant", "supervisor", "admin"]),
});

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-purple-100 text-purple-800 border-0",
    supervisor: "bg-blue-100 text-blue-800 border-0",
    participant: "bg-gray-100 text-gray-700 border-0",
  };
  return <Badge className={colors[role] ?? ""}>{role}</Badge>;
}

export default function AdminUsers() {
  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "", role: "participant" as const },
  });

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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Users</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0,1,2,3].map(i => <Skeleton key={i} className="h-12" />)}</div>
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
                  {users?.map((u) => (
                    <tr key={u.userId} data-testid={`row-user-${u.userId}`}>
                      <td className="py-3 font-medium">{u.firstName} {u.lastName}</td>
                      <td className="py-3 text-muted-foreground">{u.email}</td>
                      <td className="py-3"><RoleBadge role={u.role} /></td>
                      <td className="py-3 text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</td>
                      <td className="py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          data-testid={`button-delete-user-${u.userId}`}
                          onClick={() => handleDelete(u.userId, `${u.firstName} ${u.lastName}`)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
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
                  <FormLabel>Password</FormLabel>
                  <FormControl><Input type="password" placeholder="Min 8 characters" {...field} /></FormControl>
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
                      <SelectItem value="admin">Admin</SelectItem>
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
    </AppLayout>
  );
}
