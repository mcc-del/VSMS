import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Award, HandHeart, Users } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const MEDALS = [
  { label: "Bronze", hours: "40h" },
  { label: "Silver", hours: "75h" },
  { label: "Gold", hours: "80h" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

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
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-[hsl(207_60%_36%)] text-primary-foreground p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "radial-gradient(40rem 40rem at 90% -10%, rgba(255,255,255,0.18), transparent 60%), radial-gradient(30rem 30rem at -10% 110%, hsl(6 70% 59% / 0.35), transparent 60%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <img src="/medinacares-logo.png" alt="MedinaCares" className="w-11 h-11 object-contain rounded-xl bg-white/95 p-1.5" />
          <div className="leading-tight">
            <p className="font-bold">MedinaCares</p>
            <p className="text-xs text-primary-foreground/70">Volunteer Service Awards</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Turn service into recognition.
          </h1>
          <p className="mt-4 text-primary-foreground/80 text-lg">
            Log volunteer hours, discover opportunities, and earn your Bronze, Silver, and Gold medals — all in one place.
          </p>

          <div className="mt-8 flex gap-3">
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
          <div className="mb-8 text-center lg:hidden">
            <img src="/medinacares-logo.png" alt="MedinaCares" className="w-16 h-16 object-contain mx-auto mb-3" />
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
                        <Input data-testid="input-password" type="password" placeholder="••••••••" {...field} />
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

          <p className="text-center text-sm text-muted-foreground mt-5">
            New volunteer?{" "}
            <Link href="/register" className="text-primary font-semibold underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
