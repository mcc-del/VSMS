import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { useRegister, useListOrganizations } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GRADES } from "@/lib/schools";
import { GraduationCap, Users, Eye, EyeOff, ArrowLeft } from "lucide-react";

// Two guided sign-up paths. Both map to the backend's accountType
// (student | parent). One parent account covers everything: you manage younger
// children (grades 2–5) directly and follow older students (grades 6–12) who
// have their own login — no separate parent types needed.
type SignupType = "student" | "parent";

const SIGNUP_OPTIONS: { value: SignupType; title: string; blurb: string; icon: typeof Users }[] = [
  {
    value: "student",
    title: "I'm a student (grades 6–12)",
    blurb: "Sign up yourself and log your hours.",
    icon: GraduationCap,
  },
  {
    value: "parent",
    title: "I'm a parent",
    blurb: "Manage a younger child (grades 2–5), and follow older students who sign up themselves.",
    icon: Users,
  },
];

const MEDINA_SCHOOL = "Medina Academy Redmond";

const schema = z
  .object({
    signupType: z.enum(["student", "parent"]),
    firstName: z.string().min(2).max(50),
    lastName: z.string().min(2).max(50),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    parentEmail: z.string().email("Enter a valid parent email").or(z.literal("")).optional(),
    school: z.string().optional(),
    grade: z.string().optional(),
    organizationId: z.string().optional(),
    joinCode: z.string().optional(),
    phone: z.string().optional(),
  })
  .refine((v) => v.phone != null && v.phone.trim().length > 0, {
    message: "A phone number is required",
    path: ["phone"],
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
  .refine((v) => v.signupType !== "student" || (v.organizationId != null && v.organizationId.length > 0), {
    message: "Please select your organization",
    path: ["organizationId"],
  })
  .refine(
    (v) => v.signupType !== "student" || (v.joinCode != null && v.joinCode.trim().length > 0),
    { message: "A join code is required. Ask your school/program for it.", path: ["joinCode"] },
  );

export default function RegisterPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const registerMutation = useRegister();
  const { data: orgs } = useListOrganizations();

  const [signupType, setSignupType] = useState<SignupType>("student");
  const [affiliation, setAffiliation] = useState<string>("medina");
  const [otherSchool, setOtherSchool] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      phone: "",
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

  // Every student belongs to an organization and enters its join code. The
  // options are driven by the organizations list, so any org a Super Admin
  // creates appears here automatically.
  function onAffiliationChange(orgId: string) {
    setAffiliation(orgId);
    form.setValue("organizationId", orgId);
    const org = (orgs ?? []).find((o) => o.organizationId === orgId);
    if (org && /medina/i.test(org.name)) {
      form.setValue("school", MEDINA_SCHOOL);
      setOtherSchool(false);
    } else if (form.getValues("school") === MEDINA_SCHOOL) {
      form.setValue("school", "");
    }
    // Reset the code when switching orgs (a code is org-specific).
    form.setValue("joinCode", "");
  }

  function selectType(t: SignupType) {
    setSignupType(t);
    form.setValue("signupType", t);
  }

  function submitRegister(values: z.infer<typeof schema>, confirmDuplicate: boolean) {
    const accountType = values.signupType === "student" ? "student" : "parent";
    registerMutation.mutate(
      {
        data: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
          accountType,
          ...(confirmDuplicate ? { confirmDuplicate: true } : {}),
          ...(accountType === "student"
            ? {
                parentEmail: values.parentEmail,
                school: values.school,
                grade: values.grade,
                organizationId: values.organizationId || null,
                parentPhone: values.phone,
                ...(values.joinCode ? { joinCode: values.joinCode } : {}),
              }
            : { phone: values.phone }),
        } as any,
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
          // A phone that matches an existing account — let them proceed if it's
          // really them, or bounce to sign-in.
          if (err?.data?.code === "possible_duplicate") {
            const ok = confirm(
              `${err.data.error}\n\nClick OK to create a new account anyway, or Cancel to go sign in.`,
            );
            if (ok) {
              submitRegister(values, true);
            } else {
              setLocation("/login");
            }
            return;
          }
          toast({ title: "Registration failed", description: err?.data?.error ?? "Something went wrong", variant: "destructive" });
        },
      },
    );
  }

  function onSubmit(values: z.infer<typeof schema>) {
    submitRegister(values, false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background app-surface px-4 py-8">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <div className="mb-8 text-center">
          <Link href="/">
            <img src="/medinacares-logo.png" alt="MedinaCares — home" className="w-20 h-20 object-contain mx-auto mb-4 cursor-pointer" />
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
          <p className="text-muted-foreground mt-1 text-sm">Start logging your service hours.</p>
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
                      <FormLabel>{isStudent ? "First name" : "Parent first name"}</FormLabel>
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
                      <FormLabel>{isStudent ? "Last name" : "Parent last name"}</FormLabel>
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
                    <FormLabel>{isStudent ? "Your email address" : "Parent email address"}</FormLabel>
                    <FormControl>
                      <Input data-testid="input-email" type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormDescription>You'll sign in with this. Reminders go here too.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Guidance for the parent path */}
              {signupType === "parent" && (
                <p className="text-xs text-muted-foreground rounded-md bg-muted p-3">
                  Next, add a younger child (grades 2–5) to manage them directly. For an older
                  student (grades 6–12), have them sign up themselves and enter <strong>this email</strong>{" "}
                  as their parent's — they'll then appear on your dashboard (view-only).
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
                      <FormDescription>They can sign up with this email to follow your schedule.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{isStudent ? "Parent's phone" : "Your phone"}</FormLabel>
                    <FormControl>
                      <Input data-testid="input-phone" type="tel" placeholder="(425) 555-0100" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isStudent && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Program / affiliation</label>
                  <Select value={form.watch("organizationId") || ""} onValueChange={onAffiliationChange}>
                    <SelectTrigger data-testid="select-organization">
                      <SelectValue placeholder="Select your program" />
                    </SelectTrigger>
                    <SelectContent>
                      {(orgs ?? []).filter((o) => (o as any).showInEnrollment !== false).map((o) => (
                        <SelectItem key={o.organizationId} value={o.organizationId}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Pick your program, then enter its join code.</p>
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
                        <FormLabel>Program join code</FormLabel>
                        <FormControl>
                          <Input data-testid="input-join-code" placeholder="Enter the code from your school or program" {...field} />
                        </FormControl>
                        <FormDescription>Your program gives you this code. No code? Email mcc@medinaacademy.org.</FormDescription>
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
                      <div className="relative">
                        <Input data-testid="input-password" type={showPassword ? "text" : "password"} placeholder="Min. 8 characters" {...field} className="pr-10" />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormDescription>At least 8 characters.</FormDescription>
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
