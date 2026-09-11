import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useRegister, useListOrganizations } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GRADES } from "@/lib/schools";
import { SchoolSelect } from "@/components/school-select";

const schema = z
  .object({
    accountType: z.enum(["student", "parent"]),
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    parentEmail: z.string().email("Enter a valid parent email").or(z.literal("")).optional(),
    school: z.string().optional(),
    grade: z.string().optional(),
    organizationId: z.string().optional(),
  })
  .refine((v) => v.accountType !== "student" || (v.parentEmail && v.parentEmail.length > 0), {
    message: "A parent email is required",
    path: ["parentEmail"],
  })
  .refine((v) => v.accountType !== "student" || (v.school && v.school.length > 0), {
    message: "Please select your school",
    path: ["school"],
  });

export default function RegisterPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const { data: orgs } = useListOrganizations();

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { accountType: "student" as const, firstName: "", lastName: "", email: "", password: "", parentEmail: "", school: "", grade: "", organizationId: "" },
  });

  const accountType = form.watch("accountType");

  function onSubmit(values: z.infer<typeof schema>) {
    registerMutation.mutate(
      {
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          accountType: values.accountType,
          ...(values.accountType === "student"
            ? {
                parentEmail: values.parentEmail,
                school: values.school,
                grade: values.grade,
                organizationId: values.organizationId || null,
              }
            : {}),
        },
      },
      {
        onSuccess: (data) => {
          login(data.token, data.role, data.firstName, data.userId ?? "");
        },
        onError: (err: any) => {
          toast({ title: "Registration failed", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/medinacares-logo.png" alt="MedinaCares" className="w-20 h-20 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="text-muted-foreground mt-1 text-sm">Join the MedinaCares Volunteer Service Awards and start logging hours</p>
        </div>

        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>I am a…</FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {(["student", "parent"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          data-testid={`toggle-${t}`}
                          onClick={() => field.onChange(t)}
                          className={`rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                            field.value === t
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-input text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First name</FormLabel>
                      <FormControl>
                        <Input data-testid="input-first-name" placeholder="Jane" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last name</FormLabel>
                      <FormControl>
                        <Input data-testid="input-last-name" placeholder="Smith" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input data-testid="input-email" type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {accountType === "student" && (
                <FormField
                  control={form.control}
                  name="parentEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent's email</FormLabel>
                      <FormControl>
                        <Input data-testid="input-parent-email" type="email" placeholder="parent@example.com" {...field} />
                      </FormControl>
                      <FormDescription>
                        Your parent can sign up with this email to see your schedule and drive you to events.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {accountType === "student" && (
                <FormField
                  control={form.control}
                  name="organizationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Program / affiliation</FormLabel>
                      <Select
                        value={field.value || "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-organization">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None / Community</SelectItem>
                          {(orgs ?? []).map((o) => (
                            <SelectItem key={o.organizationId} value={o.organizationId}>
                              {o.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose your school program if you have one — it decides which opportunities you see. Pick "None / Community" otherwise.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              {accountType === "student" && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="school"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School</FormLabel>
                        <FormControl>
                          <SchoolSelect
                            value={field.value ?? ""}
                            onValueChange={field.onChange}
                            placeholder="Select"
                            testId="select-school"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-grade"><SelectValue placeholder="Select" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input data-testid="input-password" type="password" placeholder="Min. 8 characters" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button data-testid="button-register" type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creating account..." : "Create account"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-4">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
