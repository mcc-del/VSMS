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
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X, Mail, Paperclip, Upload } from "lucide-react";

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

  const participants = data?.participants ?? [];
  const checkedIn = participants.filter((p) => p.status === "attended").length;

  return (
    <AppLayout>
      <div className="space-y-5 max-w-2xl">
        <button onClick={() => setLocation("/admin/events")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to events
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
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
          {canManage && (
            <Button variant="outline" className="gap-1.5 shrink-0" disabled={participants.length === 0} onClick={() => setMsgOpen(true)}>
              <Mail className="w-4 h-4" /> Message attendees
            </Button>
          )}
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
              {searchQ.length >= 2 && (
                <div className="mt-2 rounded-lg border divide-y max-h-64 overflow-y-auto">
                  {searching && results.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">Searching…</p>
                  ) : results.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-3">No matching participant. They may need to register first.</p>
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
          <CardHeader><CardTitle className="text-base">Participants</CardTitle></CardHeader>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-600"
                          onClick={() => mark(p.userId, "no_show")}
                          disabled={setAttendance.isPending}
                          title="Mark no-show"
                        >
                          <X className="w-4 h-4" />
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
