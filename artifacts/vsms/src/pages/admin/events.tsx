import { useState } from "react";
import {
  useListEvents,
  useDeleteEvent,
  useUpdateEvent,
  useListUsers,
  getListEventsQueryKey,
  getGetAdminDashboardQueryKey,
} from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ImageUpload } from "@/components/image-upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2, MapPin, Clock, Calendar } from "lucide-react";

const editSchema = z.object({
  title: z.string().min(1, "Required").max(150),
  description: z.string().min(1, "Required"),
  location: z.string().min(1, "Required"),
  eventDate: z.string().min(1, "Required"),
  startTime: z.string().min(1, "Required"),
  endTime: z.string().min(1, "Required"),
  hoursValue: z.coerce.number().positive("Must be > 0"),
  maxCapacity: z.coerce.number().int().positive("Must be positive"),
  supervisorId: z.string().min(1, "Required"),
  imageUrl: z.string().nullable(),
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
  const today = new Date().toISOString().split("T")[0];
  const { data: events, isLoading } = useListEvents();
  const { data: users } = useListUsers();
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingEvent, setEditingEvent] = useState<any | null>(null);

  const supervisors = (users ?? []).filter((u) => u.role === "supervisor");

  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      eventDate: "",
      startTime: "09:00",
      endTime: "17:00",
      hoursValue: 4,
      maxCapacity: 50,
      supervisorId: "",
      imageUrl: null,
    },
  });

  function openEdit(event: any) {
    setEditingEvent(event);
    form.reset({
      title: event.title,
      description: event.description,
      location: event.location ?? "",
      eventDate: event.eventDate,
      startTime: (event.startTime ?? "09:00:00").slice(0, 5),
      endTime: (event.endTime ?? "17:00:00").slice(0, 5),
      hoursValue: event.hoursValue,
      maxCapacity: event.maxCapacity,
      supervisorId: event.supervisorId,
      imageUrl: event.imageUrl ?? null,
    });
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
        onError: () => {
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
        <div>
          <h1 className="text-2xl font-bold">Manage Events</h1>
          <p className="text-muted-foreground text-sm mt-1">Edit or delete volunteer events</p>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (events ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">No events yet.</CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {[...(events ?? [])].sort((a, b) => b.eventDate.localeCompare(a.eventDate)).map((event) => {
              const isUpcoming = event.eventDate >= today;
              return (
                <Card key={event.eventId}>
                  <CardContent className="flex items-start gap-4 p-4">
                    {event.imageUrl && (
                      <img
                        src={`/api/storage${event.imageUrl}`}
                        alt=""
                        className="w-16 h-16 rounded-lg object-cover shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold truncate">{event.title}</h3>
                        <Badge className={isUpcoming ? "bg-green-100 text-green-700 border-0" : "bg-gray-100 text-gray-600 border-0"}>
                          {isUpcoming ? "Upcoming" : "Past"}
                        </Badge>
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
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
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
                  <FormLabel>Description</FormLabel>
                  <FormControl><Textarea rows={3} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="location" render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl><Input placeholder="Room 101 / Community Center" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="eventDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl><Input type="date" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="hoursValue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hours value</FormLabel>
                    <FormControl><Input type="number" step="0.5" min="0.5" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

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

              <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Max capacity (volunteers)</FormLabel>
                  <FormControl><Input type="number" min="1" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

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
                          {s.firstName} {s.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="imageUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Event image</FormLabel>
                  <FormControl>
                    <ImageUpload value={field.value} onChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />

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
