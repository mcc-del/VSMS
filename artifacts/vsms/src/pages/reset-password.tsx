import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useResetPassword } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ResetPasswordPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const reset = useResetPassword();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    reset.mutate(
      { data: { token, password } },
      {
        onSuccess: () => { toast({ title: "Password updated", description: "You can sign in now." }); setLocation("/login"); },
        onError: (err: any) => toast({ title: "Couldn't reset", description: err?.data?.error ?? "Link may be expired.", variant: "destructive" }),
      },
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Set a new password</CardTitle></CardHeader>
        <CardContent>
          {!token ? (
            <div className="space-y-3 text-sm">
              <p>This reset link is missing its token. Please request a new one.</p>
              <Link href="/forgot-password" className="text-primary font-medium">Request a reset link</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>New password</Label>
                <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div>
                <Label>Confirm password</Label>
                <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={reset.isPending || password.length < 8}>
                {reset.isPending ? "Saving…" : "Set new password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
