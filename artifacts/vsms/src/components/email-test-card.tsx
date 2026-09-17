import { useState } from "react";
import { useSendTestEmail } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Mail } from "lucide-react";

// Admin utility: send a one-off test email to confirm the sending domain works.
export function EmailTestCard() {
  const [to, setTo] = useState("");
  const sendTest = useSendTestEmail();
  const { toast } = useToast();

  function send() {
    if (!to.trim()) return;
    sendTest.mutate(
      { data: { to: to.trim() } },
      {
        onSuccess: (res: any) =>
          toast({
            title: "Test email sent",
            description: `Sent to ${res?.to ?? to}. Check that inbox (and spam). Delivery also shows in Resend → Emails.`,
          }),
        onError: (err: any) =>
          toast({
            title: "Couldn't send",
            description: err?.data?.error ?? "Check EMAIL_FROM / RESEND_API_KEY and redeploy.",
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-600" /> Send a test email
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Confirms email is working. The message arrives in the inbox you enter below (e.g.
          your <code>@medinaacademy.org</code> mailbox) — not in Resend. Resend only shows the send log.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="email"
            placeholder="you@medinaacademy.org"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-64"
            data-testid="input-test-email"
          />
          <Button onClick={send} disabled={!to.trim() || sendTest.isPending} className="gap-1.5">
            <Mail className="w-4 h-4" /> {sendTest.isPending ? "Sending…" : "Send test"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
