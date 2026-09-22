import { useState } from "react";
import { useSuggestNonprofit } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

/**
 * A lightweight "suggest a nonprofit" flow: any user proposes an org (name +
 * optional EIN/website). It's created pending, and a Super Admin approves it
 * with one click on the Nonprofits page.
 */
export function SuggestNonprofit() {
  const suggest = useSuggestNonprofit();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", ein: "", website: "" });

  function submit() {
    if (form.name.trim().length < 2) {
      toast({ title: "Enter the nonprofit's name", variant: "destructive" });
      return;
    }
    if (form.ein.trim() && form.ein.replace(/[^0-9]/g, "").length !== 9) {
      toast({ title: "Check the EIN", description: "An EIN is 9 digits (e.g. 12-3456789).", variant: "destructive" });
      return;
    }
    suggest.mutate(
      { data: { name: form.name.trim(), ein: form.ein.trim() || null, website: form.website.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Thanks!", description: "We'll review it and add it if approved." });
          setForm({ name: "", ein: "", website: "" });
          setOpen(false);
        },
        onError: (err: any) => toast({ title: "Couldn't submit", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-primary font-medium hover:underline">
        Suggest a nonprofit
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest a nonprofit</DialogTitle>
            <DialogDescription>
              We'll review it against our approval criteria (registered 501(c)(3), student-appropriate
              opportunities, easy sign-up, supervision). Approved orgs appear in the list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div><Label className="text-xs">Nonprofit name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Hopelink" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">EIN (optional)</Label><Input value={form.ein} onChange={(e) => setForm({ ...form, ein: e.target.value })} placeholder="12-3456789" /></div>
              <div><Label className="text-xs">Website (optional)</Label><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="hopelink.org" /></div>
            </div>
            <Button className="w-full" onClick={submit} disabled={suggest.isPending}>
              {suggest.isPending ? "Sending…" : "Send for review"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
