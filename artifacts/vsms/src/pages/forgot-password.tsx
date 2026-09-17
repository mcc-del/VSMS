import { useState } from "react";
import { Link } from "wouter";
import { useForgotPassword } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const forgot = useForgotPassword();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    forgot.mutate({ data: { email: email.trim() } }, { onSettled: () => setSent(true) });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>Reset your password</CardTitle></CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-3 text-sm">
              <p>If an account exists for <b>{email}</b>, we've emailed a reset link. It expires in 1 hour.</p>
              <p className="text-muted-foreground">Check your spam folder if you don't see it.</p>
              <Link href="/login" className="text-primary font-medium">Back to sign in</Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-muted-foreground">Enter your email and we'll send you a link to set a new password.</p>
              <div>
                <Label>Email</Label>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <Button type="submit" className="w-full" disabled={forgot.isPending || !email.trim()}>
                {forgot.isPending ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-center text-sm"><Link href="/login" className="text-primary font-medium">Back to sign in</Link></p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
