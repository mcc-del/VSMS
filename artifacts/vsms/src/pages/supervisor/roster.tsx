import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetEventRoster,
  useSetAttendance,
  useBroadcastToEvent,
  useAddEventAttendee,
  useSearchParticipants,
  getGetEventRosterQueryKey,
  getSearchParticipantsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X, Mail, Paperclip, Upload, LogOut, Printer, Trash2 } from "lucide-react";
import { AuthenticatedImage } from "@/components/authenticated-image";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

function statusBadge(s: string) {
  if (s === "attended") return <Badge className="bg-green-100 text-green-700 border-0">Checked in</Badge>;
  if (s === "no_show") return <Badge className="bg-red-100 text-red-700 border-0">No-show</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-0">Registered</Badge>;
}

export default function RosterPage() {
  const [, params] = useRoute("/supervisor/roster/:eventId");
  const [, setLocation] = useLocation();
  const eventId = params?.eventId ?? "";
  const { data, isLoading } = useGetEventRoster(eventId, {
    query: { enabled: !!eventId, queryKey: getGetEventRosterQueryKey(eventId) },
  });
  const setAttendance = useSetAttendance();
  const broadcast = useBroadcastToEvent();
  const addAttendee = useAddEventAttendee();
  const [search, setSearch] = useState("");
  const canManage = (data as any)?.canManage ?? false;
  const searchQ = search.trim();
  const { data: searchData, isFetching: searching } = useSearchParticipants(
    { q: searchQ },
    { query: { enabled: searchQ.length >= 2, queryKey: getSearchParticipantsQueryKey({ q: searchQ }) } },
  );
  const results = (searchData as any)?.participants ?? [];

  function addParticipant(userId: string, name: string) {
    addAttendee.mutate(
      { eventId, data: { userId } as any },
      {
        onSuccess: () => {
          toast({ title: "Participant added", description: `${name} was added to this event.` });
          queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
          setSearch("");
        },
        onError: (e: any) => toast({ title: "Couldn't add", description: e?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  // Walk-in who isn't in the system: create + invite them, then credit hours.
  const [wiFirst, setWiFirst] = useState("");
  const [wiLast, setWiLast] = useState("");
  const [wiEmail, setWiEmail] = useState("");
  function addWalkIn() {
    if (!wiFirst.trim() || !wiLast.trim()) {
      toast({ title: "Enter a first and last name", variant: "destructive" });
      return;
    }
    if (wiEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wiEmail.trim())) {
      toast({ title: "That email doesn't look valid", description: "Leave it blank if you don't have one.", variant: "destructive" });
      return;
    }
    const emailed = !!wiEmail.trim();
    addAttendee.mutate(
      { eventId, data: { email: wiEmail.trim() || undefined, firstName: wiFirst.trim(), lastName: wiLast.trim() } as any },
      {
        onSuccess: () => {
          toast({ title: "Added", description: emailed ? `${wiFirst} was added and emailed an invite. Check them out to credit hours.` : `${wiFirst} was added. Check them out to credit hours; you can add an email later.` });
          queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
          setSearch(""); setWiFirst(""); setWiLast(""); setWiEmail("");
        },
        onError: (e: any) => toast({ title: "Couldn't add", description: e?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [msgOpen, setMsgOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeGuardians, setIncludeGuardians] = useState(true);
  const [attachments, setAttachments] = useState<{ path: string; filename: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  async function uploadAttachment(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Attachments must be 10 MB or smaller.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const tok = localStorage.getItem("vsms_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (tok) headers["Authorization"] = `Bearer ${tok}`;
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST", headers,
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) {
        const e = (await urlRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Upload failed");
      }
      const { uploadURL, objectPath } = (await urlRes.json()) as { uploadURL: string; objectPath: string };
      const put = await fetch(uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Upload failed");
      setAttachments((a) => [...a, { path: objectPath, filename: file.name }]);
    } catch (e: any) {
      toast({ title: "Couldn't attach", description: e?.message ?? "Try again.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function sendMessage() {
    if (subject.trim().length < 2 || message.trim().length < 2) {
      toast({ title: "Add a subject and message", variant: "destructive" });
      return;
    }
    broadcast.mutate(
      { eventId, data: { subject: subject.trim(), message: message.trim(), includeGuardians, attachments } },
      {
        onSuccess: (res) => {
          if (!res.emailConfigured) {
            toast({ title: "Email isn't set up yet", description: "The server has no email provider configured, so nothing was sent.", variant: "destructive" });
            return;
          }
          toast({ title: "Message sent", description: `Delivered to ${res.recipients} recipient${res.recipients === 1 ? "" : "s"}.` });
          setMsgOpen(false);
          setSubject("");
          setMessage("");
          setAttachments([]);
        },
        onError: (err: any) => toast({ title: "Couldn't send", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  function mark(userId: string, status: "attended" | "no_show" | "registered") {
    setAttendance.mutate(
      { eventId, data: { userId, status } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) }),
        onError: (err: any) => toast({ title: "Couldn't update", description: err?.data?.error ?? "Try again.", variant: "destructive" }),
      },
    );
  }

  // Bulk paste-a-list importer.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);
  function parseNames(text: string): { firstName: string; lastName: string; email?: string }[] {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        // Optional email after a comma, tab, or angle brackets.
        const emailMatch = line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/);
        const email = emailMatch ? emailMatch[0] : undefined;
        let namePart = line.replace(/[<,\t].*$/, "").replace(email ?? "", "").trim();
        if (!namePart) namePart = line.replace(email ?? "", "").replace(/[<>,]/g, "").trim();
        const parts = namePart.split(/\s+/).filter(Boolean);
        const firstName = parts.shift() ?? "";
        const lastName = parts.join(" ");
        return { firstName, lastName, email };
      })
      .filter((p) => p.firstName && p.lastName);
  }
  async function importPaste() {
    const people = parseNames(pasteText);
    if (people.length === 0) {
      toast({ title: "No valid names found", description: "Use one 'First Last' per line.", variant: "destructive" });
      return;
    }
    setPasteBusy(true);
    try {
      const r = await customFetch<{ added: number; skipped: number }>(`/api/v1/events/${eventId}/attendees/bulk`, {
        method: "POST",
        body: JSON.stringify({ people }),
      });
      toast({ title: `Added ${r.added}`, description: r.skipped ? `${r.skipped} skipped (already on the event or incomplete).` : "All added to the event." });
      queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
      setPasteText(""); setPasteOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setPasteBusy(false);
    }
  }

  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  async function removeFromRoster(userId: string, name: string) {
    if (!confirm(`Remove ${name} from this event's roster?`)) return;
    setRemoveBusy(userId);
    try {
      await customFetch(`/api/v1/events/${eventId}/attendees/${userId}`, { method: "DELETE" });
      toast({ title: "Removed from roster" });
      queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
    } catch (err: any) {
      toast({ title: "Couldn't remove", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setRemoveBusy(null);
    }
  }

  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  async function checkOutAll() {
    if (!confirm("Check out everyone who's checked in and credit the full event hours to each?\n\nFor anyone who left early, use their individual Check out button to enter fewer hours.")) return;
    setBulkBusy(true);
    try {
      const r = await customFetch<{ checkedOut: number }>(`/api/v1/events/${eventId}/checkout-all`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: `Checked out ${r.checkedOut} student${r.checkedOut === 1 ? "" : "s"}`, description: "Hours credited." });
      queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
    } catch (err: any) {
      toast({ title: "Couldn't check out all", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  }
  // Check-out dialog: enter actual in/out times → computes hours (or edit hours
  // directly).
  const [coTarget, setCoTarget] = useState<{ userId: string; name: string } | null>(null);
  const [coHours, setCoHours] = useState("");
  const [coIn, setCoIn] = useState("");
  const [coOut, setCoOut] = useState("");
  function hoursBetween(inT: string, outT: string): number | null {
    if (!inT || !outT) return null;
    const [ih, im] = inT.split(":").map(Number);
    const [oh, om] = outT.split(":").map(Number);
    if ([ih, im, oh, om].some((n) => Number.isNaN(n))) return null;
    const mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) return null;
    return Math.round((mins / 60) * 4) / 4; // round to nearest 0.25h
  }
  function openCheckout(userId: string, name: string) {
    setCoTarget({ userId, name });
    const start = ((data as any)?.startTime ?? "").slice(0, 5);
    const end = ((data as any)?.endTime ?? "").slice(0, 5);
    setCoIn(start);
    setCoOut(end);
    setCoHours(String((data as any)?.plannedHours ?? ""));
  }
  function setTimes(inT: string, outT: string) {
    setCoIn(inT); setCoOut(outT);
    const h = hoursBetween(inT, outT);
    if (h != null) setCoHours(String(h));
  }
  async function confirmCheckout() {
    if (!coTarget) return;
    const n = Number(coHours);
    if (!Number.isFinite(n) || n < 0.25 || n > 24) {
      toast({ title: "Enter hours between 0.25 and 24", variant: "destructive" });
      return;
    }
    const { userId } = coTarget;
    setCheckoutBusy(userId);
    try {
      await customFetch(`/api/v1/events/${eventId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ userId, checkedOut: true, hours: n }),
      });
      toast({ title: `Checked out — ${n}h credited` });
      queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
      setCoTarget(null);
    } catch (err: any) {
      toast({ title: "Couldn't update", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setCheckoutBusy(null);
    }
  }
  async function undoCheckout(userId: string) {
    setCheckoutBusy(userId);
    try {
      await customFetch(`/api/v1/events/${eventId}/checkout`, {
        method: "POST",
        body: JSON.stringify({ userId, checkedOut: false }),
      });
      toast({ title: "Checkout undone" });
      queryClient.invalidateQueries({ queryKey: getGetEventRosterQueryKey(eventId) });
    } catch (err: any) {
      toast({ title: "Couldn't update", description: err?.data?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setCheckoutBusy(null);
    }
  }

  const participants = data?.participants ?? [];
  const checkedIn = participants.filter((p) => p.status === "attended").length;

  function printRoster() {
    const rows = participants
      .map(
        (p: any, i: number) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.grade ? "Gr " + escapeHtml(String(p.grade)) : ""}</td><td>${escapeHtml(p.school ?? "")}</td><td class="box"></td><td class="sig"></td></tr>`,
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Roster</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;}
        h1{font-size:20px;margin:0 0 2px;} .sub{color:#555;font-size:13px;margin:0 0 16px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th,td{border:1px solid #bbb;padding:6px 8px;text-align:left;}
        th{background:#f2f2f2;} td.box{width:60px;} td.sig{width:180px;}
        @media print{@page{margin:14mm;}}
      </style></head><body>
      <h1>${escapeHtml(data?.eventTitle ?? "Roster")}</h1>
      <p class="sub">${participants.length} signed up · Printed ${new Date().toLocaleDateString()}</p>
      <table><thead><tr><th>#</th><th>Name</th><th>Grade</th><th>School</th><th>Present</th><th>Signature</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No participants</td></tr>'}</tbody></table>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) { toast({ title: "Pop-up blocked", description: "Allow pop-ups to print.", variant: "destructive" }); return; }
    w.document.write(html);
    w.document.close();
  }

  return (
    <AppLayout>
      <div className="space-y-5 max-w-2xl">
        <button onClick={() => setLocation("/admin/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-4">
            {(data as any)?.imageUrl && (
              <AuthenticatedImage objectPath={(data as any).imageUrl} alt={data?.eventTitle ?? "Event"} className="w-20 h-20 rounded-lg object-cover shrink-0" />
            )}
            <div>
            <h1 className="text-2xl font-bold">{data?.eventTitle ?? "Roster"}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {participants.length} signed up · {checkedIn} checked in.{canManage ? " Tap ✓ to check a student in at the event." : ""}
            </p>
            {!canManage && (
              <p className="text-xs text-muted-foreground mt-1">
                You're viewing this roster from another supervisor in your organization. It's read-only — only the event's supervisor can check students in or message attendees.
              </p>
            )}
            <p className="text-xs text-amber-700 mt-1">
              Before sharing building access (e.g. a QR code), confirm each attendee is a verified member — "Community · unverified" means they joined without an organization join code.
            </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" className="gap-1.5" disabled={participants.length === 0} onClick={printRoster}>
              <Printer className="w-4 h-4" /> Print
            </Button>
            {canManage && (
              <Button variant="outline" className="gap-1.5" disabled={participants.length === 0} onClick={() => setMsgOpen(true)}>
                <Mail className="w-4 h-4" /> Message attendees
              </Button>
            )}
          </div>
        </div>

        {canManage && (
          <Card>
            <CardHeader><CardTitle className="text-base">Add a participant</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">
                Search by name and pick the student to add — including younger children managed by a parent. They must already have an account; new people register first. Adding vouches for a specific student without opening the event to everyone.
              </p>
              <Input
                placeholder="Type a student's name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />

              <div className="mt-3 border-t pt-3">
                {!pasteOpen ? (
                  <button type="button" className="text-sm text-primary font-medium hover:underline" onClick={() => setPasteOpen(true)}>
                    + Paste a list of names (bulk add)
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      One person per line: <span className="font-mono">First Last</span>. Email is optional — add it after a comma to also send an invite (e.g. <span className="font-mono">Maya Khan, maya@email.com</span>).
                    </p>
                    <Textarea
                      rows={6}
                      placeholder={"Maya Khan\nAli Rahman\nSara Ahmed, sara@email.com"}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" disabled={pasteBusy} onClick={importPaste}>{pasteBusy ? "Adding…" : `Add ${parseNames(pasteText).length || ""} to event`.trim()}</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setPasteOpen(false); setPasteText(""); }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
              {searchQ.length >= 2 && (
                <div className="mt-2 rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {searching && results.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">Searching…</p>
                  ) : results.length === 0 ? (
                    <div className="p-3 space-y-2">
                      <p className="text-sm text-muted-foreground">No matching participant. Add them with just a name — no email needed. If you add an email, they'll also get an invite to join. Either way you can credit their hours now.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input placeholder="First name" value={wiFirst} onChange={(e) => setWiFirst(e.target.value)} />
                        <Input placeholder="Last name" value={wiLast} onChange={(e) => setWiLast(e.target.value)} />
                      </div>
                      <Input type="email" placeholder="Email (optional)" value={wiEmail} onChange={(e) => setWiEmail(e.target.value)} />
                      <Button size="sm" disabled={addAttendee.isPending} onClick={addWalkIn}>Add participant</Button>
                    </div>
                  ) : (
                    results.map((p: any) => (
                      <div key={p.userId} className="flex items-center justify-between gap-3 p-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[p.grade ? `Gr ${p.grade}` : null, p.school, p.organizationName, p.isManaged ? "managed" : p.email].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <Button size="sm" className="shrink-0" disabled={addAttendee.isPending} onClick={() => addParticipant(p.userId, p.name)}>
                          Add
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <CardTitle className="text-base">Participants</CardTitle>
            {canManage && checkedIn > 0 && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={checkOutAll} disabled={bulkBusy}>
                <LogOut className="w-4 h-4" /> Check out all
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : participants.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No one has signed up yet.</p>
            ) : (
              <div className="divide-y">
                {participants.map((p) => (
                  <div key={p.userId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.name || "Participant"}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {statusBadge(p.status)}
                        {p.organizationName ? (
                          <Badge className="bg-blue-100 text-blue-700 border-0">{p.organizationName}</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-800 border-0">Community · unverified</Badge>
                        )}
                        {p.grade && <span className="text-xs text-muted-foreground">Gr {p.grade}</span>}
                        {p.school && <span className="text-xs text-muted-foreground">· {p.school}</span>}
                        {p.hoursStatus && <span className="text-xs text-muted-foreground">· hours {p.hoursStatus}</span>}
                      </div>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant={p.status === "attended" ? "default" : "outline"}
                          className="gap-1"
                          onClick={() => mark(p.userId, p.status === "attended" ? "registered" : "attended")}
                          disabled={setAttendance.isPending}
                        >
                          <Check className="w-4 h-4" /> {p.status === "attended" ? "Checked in" : "Check in"}
                        </Button>
                        {p.status !== "no_show" && (
                          (p as any).hoursStatus === "approved" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-800"
                              onClick={() => undoCheckout(p.userId)}
                              disabled={checkoutBusy === p.userId}
                              title="Undo checkout (removes credited hours)"
                            >
                              <Check className="w-4 h-4" /> Checked out
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => openCheckout(p.userId, p.name)}
                              disabled={checkoutBusy === p.userId}
                              title="Check out and credit hours"
                            >
                              <LogOut className="w-4 h-4" /> Check out
                            </Button>
                          )
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-amber-600"
                          onClick={() => mark(p.userId, p.status === "no_show" ? "registered" : "no_show")}
                          disabled={setAttendance.isPending}
                          title={p.status === "no_show" ? "Undo no-show" : "Mark no-show"}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => removeFromRoster(p.userId, p.name)}
                          disabled={removeBusy === p.userId}
                          title="Remove from roster"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={coTarget !== null} onOpenChange={(o) => { if (!o) setCoTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Check out {coTarget?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Check-in time</Label>
                <Input type="time" value={coIn} onChange={(e) => setTimes(e.target.value, coOut)} />
              </div>
              <div>
                <Label className="text-sm">Check-out time</Label>
                <Input type="time" value={coOut} onChange={(e) => setTimes(coIn, e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Hours credited</Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0.25"
                max="24"
                step="0.25"
                value={coHours}
                onChange={(e) => setCoHours(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Auto-calculated from the times above — or type hours directly. Defaults to the full event time.</p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCoTarget(null)}>Cancel</Button>
              <Button onClick={confirmCheckout} disabled={checkoutBusy === coTarget?.userId}>Check out &amp; credit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message attendees</DialogTitle>
            <DialogDescription>
              Email everyone signed up for “{data?.eventTitle ?? "this event"}”. Recipients are emailed individually — they won't see each other's addresses.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Subject</label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Parking & check-in details" maxLength={150} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Message</label>
              <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your update to attendees…" maxLength={4000} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={includeGuardians} onCheckedChange={(v) => setIncludeGuardians(v === true)} />
              Also email parents/guardians (recommended for younger volunteers)
            </label>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Attachments <span className="text-muted-foreground font-normal">(optional)</span></label>
              {attachments.map((a, i) => (
                <div key={a.path} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 truncate">{a.filename}</span>
                  <button type="button" onClick={() => setAttachments((arr) => arr.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {attachments.length < 5 && (
                <label className="inline-flex items-center gap-1.5 text-sm text-primary cursor-pointer hover:underline">
                  <Upload className="w-4 h-4" /> {uploading ? "Uploading…" : "Add a file (image or PDF, ≤10 MB)"}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgOpen(false)}>Cancel</Button>
            <Button onClick={sendMessage} disabled={broadcast.isPending}>
              {broadcast.isPending ? "Sending…" : "Send message"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
