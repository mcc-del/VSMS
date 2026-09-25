import { useState } from "react";
import {
  useListEvents,
  useDeleteEvent,
  useUpdateEvent,
  useListUsers,
  useGetManagedOrganizations,
  getListEventsQueryKey,
  getListUsersQueryKey,
  getGetAdminDashboardQueryKey,
  useListOrganizations,
  getListOrganizationsQueryKey,
  customFetch,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormLabel, FormDescription, FormMessage } from "@/components/ui/form";
import { ImageUpload } from "@/components/image-upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, MapPin, Clock, Calendar, Plus, Users, Search, UserCheck, Building2 } from "lucide-react";
import { Link } from "wouter";
import { AuthenticatedImage } from "@/components/authenticated-image";
import { calculateEventDuration, formatHours } from "@/lib/event-duration";
import { eventHasEnded } from "@/lib/event-time";
import { ALL_GRADES } from "@/lib/schools";

const NONE = "none";

const editSchema = z.object({
  title: z.string().min(1, "Required").max(150),
  description: z.string().optional(),
  slotLabel: z.string().optional(),
  location: z.string().min(1, "Required"),
  street: z.string().min(1, "Street address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: z.string().min(1, "ZIP is required"),
  eventDate: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  maxCapacity: z.coerce.number().int().positive("Must be positive"),
  minGrade: z.string().optional(),
  maxGrade: z.string().optional(),
  openToAll: z.boolean(),
  status: z.enum(["draft", "coming_soon", "open"]),
  organizationId: z.string(),
  supervisorId: z.string().min(1, "Required"),
  imageUrl: z.string().nullable(),
}).superRefine((values, ctx) => {
  if (calculateEventDuration(values.startTime, values.endTime) === null) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be later than start time" });
  }
});

function formatTime(t: string) {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = Number(hStr);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${ampm}`;
}

export default function AdminEventsPage() {
  const { role, userId } = useAuth();
  const isOrgAdmin = role === "org_admin";
  const isSupervisor = role === "supervisor";
  const isSelfSupervised = isOrgAdmin || isSupervisor;
  const { data: events, isLoading } = useListEvents();
  const { data: managed } = useGetManagedOrganizations();
  const isSuperAdmin = role === "admin";
  const { data: organizations } = useListOrganizations({
    query: { enabled: isSuperAdmin, queryKey: getListOrganizationsQueryKey() },
  });
  const { data: users } = useListUsers({
    query: { enabled: !isSelfSupervised, queryKey: getListUsersQueryKey() },
  });
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingEvent, setEditingEvent] = useState<any | null>(null);
  const [search, setSearch] = useState("");
  const [whenFilter, setWhenFilter] = useState<"all" | "upcoming" | "past">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showOptional, setShowOptional] = useState(false);

  // Anyone who can run an event: plain supervisors plus org admins and admins.
  const ROLE_LABEL: Record<string, string> = { supervisor: "Supervisor", org_admin: "Admin", admin: "Super Admin" };
  const supervisors = (users ?? []).filter((u) => ["supervisor", "org_admin", "admin"].includes(u.role));

  // Org admins manage their own org's events; supervisors manage events they
  // supervise; admins see everything.
  const visibleEvents = isSupervisor
    ? (events ?? []).filter((e) => e.supervisorId === userId)
    : isOrgAdmin && managed && !managed.all
      ? (events ?? []).filter(
          (e) => e.organizationId && managed.organizationIds.includes(e.organizationId),
        )
      : events ?? [];

  const q = search.trim().toLowerCase();
  const filteredEvents = visibleEvents.filter((e) => {
    if (whenFilter === "upcoming" && eventHasEnded(e.eventDate, (e as any).endTime)) return false;
    if (whenFilter === "past" && !eventHasEnded(e.eventDate, (e as any).endTime)) return false;
    if (fromDate && e.eventDate < fromDate) return false;
    if (toDate && e.eventDate > toDate) return false;
    if (q) {
      const hay = [e.title, (e as any).supervisorName, (e as any).organizationName, e.location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const hasFilters = !!q || whenFilter !== "all" || !!fromDate || !!toDate;

  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: "",
      description: "",
      slotLabel: "",
      location: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      eventDate: "",
      startTime: "09:00",
      endTime: "17:00",
      maxCapacity: 50,
      minGrade: NONE,
      maxGrade: NONE,
      openToAll: true,
      status: "open",
      organizationId: NONE,
      supervisorId: "",
      imageUrl: null,
    },
  });

  function openEdit(event: any) {
    setEditingEvent(event);
    form.reset({
      title: event.title,
      description: event.description,
      slotLabel: event.slotLabel ?? "",
      location: event.location ?? "",
      street: event.street ?? "",
      city: event.city ?? "",
      state: event.state ?? "",
      zip: event.zip ?? "",
      eventDate: event.eventDate,
      startTime: (event.startTime ?? "09:00:00").slice(0, 5),
      endTime: (event.endTime ?? "17:00:00").slice(0, 5),
      maxCapacity: event.maxCapacity,
      minGrade: event.minGrade != null ? String(event.minGrade) : NONE,
      maxGrade: event.maxGrade != null ? String(event.maxGrade) : NONE,
      openToAll: event.openToAll ?? true,
      status: (event.status as "draft" | "coming_soon" | "open") ?? "open",
      organizationId: event.organizationId ?? NONE,
      supervisorId: event.supervisorId,
      imageUrl: event.imageUrl ?? null,
    });
  }
  const plannedHours = calculateEventDuration(form.watch("startTime"), form.watch("endTime"));

  async function forceDelete(eventId: string) {
    try {
      await customFetch(`/api/v1/events/${eventId}?force=true`, { method: "DELETE" });
      toast({ title: "Event deleted" });
      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  function handleDelete(eventId: string, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    deleteEvent.mutate(
      { eventId },
      {
        onSuccess: () => {
          toast({ title: "Event deleted" });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
        },
        onError: (err: any) => {
          if (err?.data?.code === "has_approved_hours") {
            if (role === "admin") {
              if (
                confirm(
                  `"${title}" has approved volunteer hours logged against it. Deleting it anyway will remove the event but keep those hours on students' records. Delete anyway?`,
                )
              ) {
                forceDelete(eventId);
              }
            } else {
              toast({
                title: "Can't delete this event",
                description:
                  "It has approved volunteer hours. Ask a Super Admin to remove it.",
                variant: "destructive",
              });
            }
            return;
          }
          toast({ title: "Delete failed", variant: "destructive" });
        },
      },
    );
  }

  function onSubmit(values: z.infer<typeof editSchema>) {
    if (!editingEvent) return;
    const payload: Record<string, unknown> = { ...values };
    if (payload.imageUrl === null || payload.imageUrl === undefined || payload.imageUrl === "") {
      payload.imageUrl = null;
    }
    payload.slotLabel = values.slotLabel?.trim() || null;
    payload.street = values.street?.trim() || null;
    payload.city = values.city?.trim() || null;
    payload.state = values.state?.trim() || null;
    payload.zip = values.zip?.trim() || null;
    payload.minGrade = values.minGrade && values.minGrade !== NONE ? Number(values.minGrade) : null;
    payload.maxGrade = values.maxGrade && values.maxGrade !== NONE ? Number(values.maxGrade) : null;
    // Only Super Admins can retarget the host org; otherwise leave it untouched.
    if (isSuperAdmin) {
      payload.organizationId = values.organizationId && values.organizationId !== NONE ? values.organizationId : null;
    } else {
      delete payload.organizationId;
    }

    updateEvent.mutate(
      {
        eventId: editingEvent.eventId,
        data: payload as any,
      },
      {
        onSuccess: () => {
          toast({ title: "Event updated", description: `"${values.title}" saved.` });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          setEditingEvent(null);
        },
        onError: (err: any) => {
          toast({ title: "Update failed", description: err?.data?.error ?? "Error", variant: "destructive" });
        },
      },
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Events</h1>
            <p className="text-muted-foreground text-sm mt-1">Create, edit, or remove volunteer opportunities</p>
          </div>
          <Link href="/admin/events/new">
            <Button data-testid="button-new-event"><Plus className="w-4 h-4 mr-1" /> New Event</Button>
          </Link>
        </div>

        {!isLoading && visibleEvents.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by title, supervisor, organization, or location"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-events"
                />
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex gap-1.5">
                  {(["all", "upcoming", "past"] as const).map((w) => (
                    <Button
                      key={w}
                      type="button"
                      size="sm"
                      variant={whenFilter === w ? "default" : "outline"}
                      onClick={() => setWhenFilter(w)}
                      className="capitalize"
                    >
                      {w}
                    </Button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">To</label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9" />
                  </div>
                </div>
                {hasFilters && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => { setSearch(""); setWhenFilter("all"); setFromDate(""); setToDate(""); }}
                  >
                    Clear
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto self-center">
                  {filteredEvents.length} of {visibleEvents.length}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : visibleEvents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No events yet.</CardContent>
          </Card>
        ) : filteredEvents.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No events match your filters.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {[...filteredEvents].sort((a, b) => a.eventDate.localeCompare(b.eventDate)).map((event) => {
              const isUpcoming = !eventHasEnded(event.eventDate, (event as any).endTime);
              return (
                <Card key={event.eventId}>
                  <CardContent className="flex items-start gap-4 p-4">
                    {event.imageUrl && (
                      <AuthenticatedImage
                        objectPath={event.imageUrl}
                        alt={event.title}
                        className="w-16 h-16 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">
                          {event.title}
                          {event.slotLabel && <span className="text-muted-foreground font-normal"> — {event.slotLabel}</span>}
                        </h3>
                        <Badge className={isUpcoming ? "bg-green-100 text-green-700 border-0" : "bg-gray-100 text-gray-600 border-0"}>
                          {isUpcoming ? "Upcoming" : "Past"}
                        </Badge>
                        {(event as any).status === "draft" && (
                          <Badge className="bg-amber-100 text-amber-700 border-0">Draft</Badge>
                        )}
                        {(event as any).status === "coming_soon" && (
                          <Badge className="bg-blue-100 text-blue-700 border-0">Coming soon</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {event.eventDate}
                        </span>
                        {event.startTime && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTime(event.startTime)} – {formatTime(event.endTime ?? "")}
                          </span>
                        )}
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {event.location}
                          </span>
                        )}
                        <span>{event.registrationCount}/{event.maxCapacity} registered</span>
                        <span>{event.hoursValue}h credit</span>
                        {(event as any).supervisorName && (
                          <span className="flex items-center gap-1">
                            <UserCheck className="w-3 h-3" /> {(event as any).supervisorName}
                          </span>
                        )}
                        {(event as any).organizationName && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" /> {(event as any).organizationName}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link href={`/supervisor/roster/${event.eventId}`}>
                        <Button size="sm" variant="outline" data-testid={`button-roster-${event.eventId}`}>
                          <Users className="w-3.5 h-3.5 mr-1" /> Roster
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid={`button-edit-${event.eventId}`}
                        onClick={() => openEdit(event)}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        data-testid={`button-delete-${event.eventId}`}
                        onClick={() => handleDelete(event.eventId, event.title)}
                        disabled={deleteEvent.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={!!editingEvent} onOpenChange={() => setEditingEvent(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
              <FormField control={form.control} name="title" render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl><Input {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="description" render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location name / venue</FormLabel>
                  <FormControl><Input placeholder="Medina Academy — Main Hall" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="street" render={({ field }) => (
                <FormItem>
                  <FormLabel>Street address</FormLabel>
                  <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-6 gap-3">
                <div className="col-span-3">
                  <FormField control={form.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Redmond" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-1">
                  <FormField control={form.control} name="state" render={({ field }) => (
                    <FormItem><FormLabel>State</FormLabel><FormControl><Input placeholder="WA" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <div className="col-span-2">
                  <FormField control={form.control} name="zip" render={({ field }) => (
                    <FormItem><FormLabel>ZIP</FormLabel><FormControl><Input placeholder="98052" {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
              </div>
              <FormField control={form.control} name="eventDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl><Input type="date" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="startTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endTime" render={({ field }) => (
                  <FormItem>
                    <FormLabel>End time</FormLabel>
                    <FormControl><Input type="time" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="rounded-lg border bg-muted/40 px-4 py-3">
                <p className="text-sm font-medium">Planned service credit</p>
                <p className="text-xl font-bold text-primary mt-1">
                  {plannedHours === null ? "—" : `${formatHours(plannedHours)}h`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Calculated from the event times.</p>
              </div>

              <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max capacity (volunteers)</FormLabel>
                  <FormControl><Input type="number" min="1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="openToAll" render={({ field }) => (
                <FormItem>
                  <FormLabel>Who can join?</FormLabel>
                  <FormControl>
                    <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border p-3">
                      <Checkbox checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} className="mt-0.5" />
                      <span>
                        Open to all organizations
                        <span className="block text-xs text-muted-foreground">
                          Students from any organization can see and sign up. Uncheck to keep this event private to your organization only.
                        </span>
                      </span>
                    </label>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {isSuperAdmin && (
                <FormField control={form.control} name="organizationId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host organization</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger data-testid="select-edit-org"><SelectValue placeholder="Community (no host org)" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value={NONE}>Community (no host org)</SelectItem>
                        {(organizations ?? []).map((o) => (
                          <SelectItem key={o.organizationId} value={o.organizationId}>{o.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>The organization that owns this event and can manage its roster / check-in.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="status" render={({ field }) => (
                <FormItem>
                  <FormLabel>Publish status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft — only managers can see it</SelectItem>
                      <SelectItem value="coming_soon">Coming soon — visible, sign-ups not open yet</SelectItem>
                      <SelectItem value="open">Open — visible and open for sign-up</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {!isSelfSupervised && (
                <FormField control={form.control} name="supervisorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Supervisor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a supervisor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {supervisors.map((s) => (
                          <SelectItem key={s.userId} value={s.userId}>
                            {s.firstName} {s.lastName}{ROLE_LABEL[s.role] ? ` (${ROLE_LABEL[s.role]})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <div className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => setShowOptional((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium"
                >
                  <span>Optional details <span className="text-muted-foreground font-normal">— slot label, grade limits, image</span></span>
                  <span className="text-muted-foreground">{showOptional ? "−" : "+"}</span>
                </button>
                {showOptional && (
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    <FormField control={form.control} name="slotLabel" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slot label</FormLabel>
                        <FormControl><Input placeholder="e.g. Checkout, Cleanup crew" {...field} /></FormControl>
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="minGrade" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Minimum grade</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={NONE}>Any</SelectItem>
                              {ALL_GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="maxGrade" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Maximum grade</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={NONE}>Any</SelectItem>
                              {ALL_GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="imageUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event image</FormLabel>
                        <FormControl>
                          <ImageUpload value={field.value} onChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" className="flex-1" disabled={updateEvent.isPending}>
                  {updateEvent.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditingEvent(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
