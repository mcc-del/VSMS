import { useEffect, useState } from "react";
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
import { GraduationCap, Users, Eye } from "lucide-react";

// Three guided sign-up paths. "student" and the two parent kinds all map to the
// backend's accountType (student | parent); the parent kinds differ only in
// guidance and where they go next.
type SignupType = "student" | "parent_participant" | "parent_viewer";

const SIGNUP_OPTIONS: { value: SignupType; title: string; blurb: string; icon: typeof Users }[] = [
  {
    value: "student",
    title: "I'm a student (grades 6–12)",
    blurb: "Sign up yourself, log your hours, and invite a parent to follow along.",
    icon: GraduationCap,
  },
  {
    value: "parent_participant",
    title: "I'm a parent of a grade 2–5 child",
    blurb: "You'll sign up and manage your child — young children don't get their own login.",
    icon: Users,
  },
  {
    value: "parent_viewer",
    title: "I'm a parent of a grade 6–12 student",
    blurb: "Your student signs up themselves; you get view-only access to their schedule.",
    icon: Eye,
  },
];

const MEDINA_SCHOOL = "Medina Academy Redmond";

const schema = z
  .object({
    signupType: z.enum(["student", "parent_participant", "parent_viewer"]),
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    parentEmail: z.string().email("Enter a valid parent email").or(z.literal("")).optional(),
    school: z.string().optional(),
    grade: z.string().optional(),
    organizationId: z.string().optional(),
    joinCode: z.string().optional(),
  })
  .refine((v) => v.signupType !== "student" || (v.parentEmail && v.parentEmail.length > 0), {
    message: "A parent email is required",
    path: ["parentEmail"],
  })
  .refine((v) => v.signupType !== "student" || (v.school && v.school.length > 0), {
    message: "Please select your school",
    path: ["school"],
  })
  .refine((v) => v.signupType !== "student" || (v.grade && v.grade.length > 0), {
    message: "Please select your grade",
    path: ["grade"],
  })
  .refine(
    (v) => v.signupType !== "student" || !v.organizationId || (v.joinCode != null && v.joinCode.trim().length > 0),
    { message: "A join code is required for this organization. Ask your school/program for it.", path: ["joinCode"] },
  );

export default function RegisterPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const { data: orgs } = useListOrganizations();

  const [signupType, setSignupType] = useState<SignupType>("student");
  const [affiliation, setAffiliation] = useState<string>("medina");
  const [otherSchool, setOtherSchool] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      signupType: "student" as SignupType,
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      parentEmail: "",
      school: MEDINA_SCHOOL,
      grade: "",
      organizationId: "",
      joinCode: "",
    },
  });

  const isStudent = signupType === "student";

  // Resolve the Medina / EF organization ids so affiliation stays a fixed set
  // of three first-person choices regardless of what's in the org table.
  const medinaOrg = (orgs ?? []).find((o) => /medina/i.test(o.name));
  const efOrg = (orgs ?? []).find((o) => /essentials/i.test(o.name));

  // Default a new student to Medina (the large majority), which also fills the
  // school. They can change it.
  useEffect(() => {
    if (isStudent && medinaOrg && !form.getValues("organizationId")) {
      form.setValue("organizationId", medinaOrg.organizationId);
      form.setValue("school", MEDINA_SCHOOL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent, medinaOrg?.organizationId]);

  function onAffiliationChange(v: string) {
    setAffiliation(v);
    // Single org per student: "both" is primarily a Medina student (sees Medina +
    // Open), "neither" is Community. EF Hygiene Champions pick "ef".
    if (v === "medina" || v === "both") {
      form.setValue("organizationId", medinaOrg?.organizationId ?? "");
      form.setValue("school", MEDINA_SCHOOL);
      setOtherSchool(false);
    } else if (v === "ef") {
      form.setValue("organizationId", efOrg?.organizationId ?? "");
      if (form.getValues("school") === MEDINA_SCHOOL) form.setValue("school", "");
    } else {
      form.setValue("organizationId", "");
      if (form.getValues("school") === MEDINA_SCHOOL) form.setValue("school", "");
    }
  }

  function selectType(t: SignupType) {
    setSignupType(t);
    form.setValue("signupType", t);
  }

  function onSubmit(values: z.infer<typeof schema>) {
    const accountType = values.signupType === "student" ? "student" : "parent";
    registerMutation.mutate(
      {
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          accountType,
          ...(accountType === "student"
            ? {
                parentEmail: values.parentEmail,
                school: values.school,
                grade: values.grade,
                organizationId: values.organizationId || null,
                ...(values.joinCode ? { joinCode: values.joinCode } : {}),
              }
            : {}),
        },
      },
      {
        onSuccess: (data) => {
          // New participants land on their dashboard scrolled to "My sign-ups"
          // so their next step (finding & joining events) is front and centre.
          if (data.role === "participant") {
            try { sessionStorage.setItem("mc_scroll_schedule", "1"); } catch { /* ignore */ }
          }
          login(data.token, data.role, data.firstName, data.userId ?? "");
        },
        onError: (err: any) => {
          toast({ title: "Registration failed", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background app-surface px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/medinacares-logo.png" alt="MedinaCares" className="w-20 h-20 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="text-muted-foreground mt-1 text-sm">Join the MedinaCares Volunteer Service Awards and start logging hours</p>
        </div>

        <div className="bg-card border border-card-border/70 rounded-2xl p-6 shadow-soft">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">How are you signing up?</label>
                <div className="space-y-2">
                  {SIGNUP_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = signupType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        data-testid={`toggle-${opt.value}`}
                        onClick={() => selectType(opt.value)}
                        className={`w-full text-left rounded-lg border p-3 flex gap-3 transition-colors ${
                          active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-input hover:bg-muted"
                        }`}
                      >
                        <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        <span>
                          <span className="block text-sm font-medium">{opt.title}</span>
                          <span className="block text-xs text-muted-foreground mt-0.5">{opt.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

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
                    <FormLabel>Your email address</FormLabel>
                    <FormControl>
                      <Input data-testid="input-email" type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormDescription>You'll use this to sign in. Use one you check often — reminders and confirmations go here.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Guidance for the two parent paths */}
              {signupType === "parent_participant" && (
                <p className="text-xs text-muted-foreground rounded-md bg-muted p-3">
                  After you create your account, you'll add your child (name, grade 2–5, school) and
                  manage their sign-ups and hours from your parent dashboard.
                </p>
              )}
              {signupType === "parent_viewer" && (
                <p className="text-xs text-muted-foreground rounded-md bg-muted p-3">
                  Your student signs up on their own and enters <strong>this email</strong> as their
                  parent's email — their schedule then appears on your dashboard automatically.
                </p>
              )}

              {isStudent && (
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

              {isStudent && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Program / affiliation</label>
                  <Select value={affiliation} onValueChange={onAffiliationChange}>
                    <SelectTrigger data-testid="select-organization">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medina">I'm a current Medina student</SelectItem>
                      <SelectItem value="ef">I'm an Essentials First Hygiene Champion</SelectItem>
                      <SelectItem value="both">I'm both!</SelectItem>
                      <SelectItem value="neither">I'm neither</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">This decides which opportunities you see.</p>
                </div>
              )}

              {isStudent && !!form.watch("organizationId") && (() => {
                const selectedOrg = (orgs ?? []).find((o) => o.organizationId === form.watch("organizationId"));
                return (
                  <FormField
                    control={form.control}
                    name="joinCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{selectedOrg?.name ?? "Organization"} join code</FormLabel>
                        <FormControl>
                          <Input data-testid="input-join-code" placeholder="Enter the code from your school or program" {...field} />
                        </FormControl>
                        <FormDescription>
                          {selectedOrg?.name ?? "Your organization"} gives this code to its students — it confirms you're really enrolled. Ask them if you don't have it.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                );
              })()}

              {isStudent && (
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="school"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>School</FormLabel>
                        <Select
                          value={otherSchool ? "__other__" : (field.value === MEDINA_SCHOOL ? MEDINA_SCHOOL : (field.value ? "__other__" : ""))}
                          onValueChange={(v) => {
                            if (v === "__other__") { setOtherSchool(true); field.onChange(""); }
                            else { setOtherSchool(false); field.onChange(v); }
                          }}
                        >
                          <SelectTrigger data-testid="select-school"><SelectValue placeholder="Select" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={MEDINA_SCHOOL}>Medina Academy Redmond</SelectItem>
                            <SelectItem value="__other__">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {otherSchool && (
                          <Input
                            className="mt-2"
                            placeholder="Enter your school"
                            value={field.value ?? ""}
                            onChange={(e) => field.onChange(e.target.value)}
                            data-testid="input-other-school"
                          />
                        )}
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
                    <FormDescription>At least 8 characters. You'll use this with your email to sign in.</FormDescription>
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
