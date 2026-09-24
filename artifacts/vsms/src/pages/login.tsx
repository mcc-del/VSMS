import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useLogin, useGetPublicThresholds } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Award, HandHeart, Users, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { RecyclingRibbon } from "@/components/recycling-ribbon";
import { useState } from "react";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type Band = "elementary" | "middle" | "high";
const BAND_LABELS: Record<Band, string> = { elementary: "Kids (2–5)", middle: "Teens (6–10)", high: "Young Adults (11–12)" };
const FALLBACK: Record<Band, { bronze: number; silver: number; gold: number }> = {
  elementary: { bronze: 26, silver: 50, gold: 75 },
  middle: { bronze: 50, silver: 75, gold: 100 },
  high: { bronze: 100, silver: 175, gold: 250 },
};

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const { data: thresholds } = useGetPublicThresholds();
  const [band, setBand] = useState<Band>("high");
  const byLevel = (thresholds?.levels ?? []).reduce(
    (acc, l) => { acc[l.level as Band] = { bronze: l.bronze, silver: l.silver, gold: l.gold }; return acc; },
    {} as Record<Band, { bronze: number; silver: number; gold: number }>,
  );
  const th = byLevel[band] ?? FALLBACK[band];
  const MEDALS = [
    { label: "Bronze", hours: `${th.bronze}h+` },
    { label: "Silver", hours: `${th.silver}h+` },
    { label: "Gold", hours: `${th.gold}h+` },
  ];

  const form = useForm({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  function onSubmit(values: z.infer<typeof schema>) {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (data) => {
          login(data.token, data.role, data.firstName, data.userId ?? "");
        },
        onError: (err: any) => {
          toast({ title: "Login failed", description: err?.data?.error ?? "Invalid credentials", variant: "destructive" });
        },
      },
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <RecyclingRibbon />
      <div className="flex-1 lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-[hsl(207_60%_36%)] text-primary-foreground p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(40rem 40rem at 90% -10%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(30rem 30rem at -10% 110%, hsl(6 70% 59% / 0.35), transparent 60%)",
          }}
        />
        <Link href="/" className="relative flex items-center gap-3 hover:opacity-90">
          <img src="/medinacares-logo.png" alt="MedinaCares — home" className="w-11 h-11 object-contain rounded-xl bg-white/95 p-1.5" />
          <div className="leading-tight">
            <p className="font-bold">MedinaCares</p>
            <p className="text-xs text-primary-foreground/70">Volunteer Service Awards</p>
          </div>
        </Link>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Turn service into recognition.
          </h1>
          <p className="mt-4 text-primary-foreground/80 text-lg">
            Log volunteer hours, discover opportunities, and earn your Bronze, Silver, and Gold medals — all in one place.
          </p>

          <div className="mt-8 flex items-center gap-2">
            <span className="text-xs text-primary-foreground/70">Goals for</span>
            <div className="inline-flex gap-1 rounded-full bg-white/10 border border-white/15 p-1">
              {(["elementary", "middle", "high"] as Band[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBand(b)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${band === b ? "bg-white text-primary" : "text-primary-foreground/80 hover:text-white"}`}
                >
                  {BAND_LABELS[b]}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-3">
            {MEDALS.map((m) => (
              <div key={m.label} className="flex-1 rounded-2xl bg-white/10 backdrop-blur px-4 py-3 border border-white/15">
                <Award className="w-5 h-5 mb-2" />
                <p className="text-sm font-semibold">{m.label}</p>
                <p className="text-xs text-primary-foreground/70">{m.hours}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex gap-6 text-sm text-primary-foreground/80">
          <span className="flex items-center gap-2"><HandHeart className="w-4 h-4" /> Give back</span>
          <span className="flex items-center gap-2"><Users className="w-4 h-4" /> Together</span>
          <span className="flex items-center gap-2"><Award className="w-4 h-4" /> Get recognized</span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-4 py-10 app-surface min-h-screen lg:min-h-0">
        <div className="w-full max-w-sm">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <div className="mb-8 text-center lg:hidden">
            <Link href="/">
              <img src="/medinacares-logo.png" alt="MedinaCares — home" className="w-16 h-16 object-contain mx-auto mb-3 cursor-pointer" />
            </Link>
          </div>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="text-muted-foreground mt-1 text-sm">Sign in to continue your service journey.</p>
          </div>

          <div className="bg-card border border-card-border/70 rounded-2xl p-6 shadow-soft">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            data-testid="input-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className="pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button data-testid="button-submit" type="submit" className="w-full" size="lg" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
              </form>
            </Form>
          </div>

          <p className="text-center text-sm mt-3">
            <Link href="/forgot-password" className="text-muted-foreground hover:text-primary underline-offset-4 hover:underline">
              Forgot your password?
            </Link>
          </p>
          <p className="text-center text-sm text-muted-foreground mt-2">
            New volunteer?{" "}
            <Link href="/register" className="text-primary font-semibold underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
