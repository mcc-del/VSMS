import { useCreateEvent, useListUsers, useListOrganizations, getListEventsQueryKey, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ImageUpload } from "@/components/image-upload";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { calculateEventDuration, formatHours } from "@/lib/event-duration";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().min(1, "Description is required"),
  location: z.string().min(1, "Location is required"),
  eventDate: z.string().min(1, "Date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  maxCapacity: z.coerce.number().int().positive("Must be a positive integer"),
  supervisorId: z.string().min(1, "Select a supervisor"),
  organizationId: z.string().optional(),
  imageUrl: z.string().nullable(),
}).superRefine((values, ctx) => {
  if (calculateEventDuration(values.startTime, values.endTime) === null) {
    ctx.addIssue({ code: "custom", path: ["endTime"], message: "End time must be later than start time" });
  }
});

export default function AdminNewEvent() {
  const createEvent = useCreateEvent();
  const { data: users } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const supervisors = (users ?? []).filter(u => u.role === "supervisor");

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      eventDate: "",
      startTime: "09:00",
      endTime: "17:00",
      maxCapacity: 50,
      supervisorId: "",
      organizationId: "",
      imageUrl: null,
    },
  });
  const { data: organizations } = useListOrganizations();
  const plannedHours = calculateEventDuration(form.watch("startTime"), form.watch("endTime"));

  function onSubmit(values: z.infer<typeof schema>) {
    const payload: Record<string, unknown> = { ...values };
    if (!payload.imageUrl) delete payload.imageUrl;
    if (!payload.organizationId) delete payload.organizationId;

    createEvent.mutate(
      { data: payload as any },
      {
        onSuccess: () => {
          toast({ title: "Event created", description: `"${values.title}" has been added to the calendar.` });
          queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
          form.reset();
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error ?? "Failed to create event", variant: "destructive" });
        },
      }
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold">Create New Event</h1>
          <p className="text-muted-foreground text-sm mt-1">Add a volunteer event to the calendar</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event title</FormLabel>
                    <FormControl>
                      <Input data-testid="input-title" placeholder="Community Food Drive" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea data-testid="input-description" placeholder="Describe the volunteer activity..." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input data-testid="input-location" placeholder="Room 101 / Main Hall" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="eventDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event date</FormLabel>
                    <FormControl>
                      <Input data-testid="input-event-date" type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="startTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start time</FormLabel>
                      <FormControl>
                        <Input data-testid="input-start-time" type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="endTime" render={({ field }) => (
                    <FormItem>
                      <FormLabel>End time</FormLabel>
                      <FormControl>
                        <Input data-testid="input-end-time" type="time" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="rounded-lg border bg-muted/40 px-4 py-3">
                  <p className="text-sm font-medium">Planned service credit</p>
                  <p data-testid="text-calculated-hours" className="text-2xl font-bold text-primary mt-1">
                    {plannedHours === null ? "—" : `${formatHours(plannedHours)}h`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Calculated automatically from the start and end times.
                  </p>
                </div>

                <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max capacity (volunteers)</FormLabel>
                    <FormControl>
                      <Input data-testid="input-capacity" type="number" min="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="supervisorId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned supervisor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-supervisor">
                          <SelectValue placeholder="Select a supervisor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {supervisors.length === 0 ? (
                          <SelectItem value="none" disabled>No supervisors found — create one first</SelectItem>
                        ) : (
                          supervisors.map(s => (
                            <SelectItem key={s.userId} value={s.userId}>
                              {s.firstName} {s.lastName}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="organizationId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who can see this</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-organization">
                          <SelectValue placeholder="Open to all (community)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">Open to all (community)</SelectItem>
                        {(organizations ?? []).map((o) => (
                          <SelectItem key={o.organizationId} value={o.organizationId}>
                            {o.name} only
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      "Open to all" shows to every eligible student. Choosing an organization keeps it private to that org's students (e.g. Medina on-site events).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="imageUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event image (optional)</FormLabel>
                    <FormControl>
                      <ImageUpload value={field.value} onChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )} />

                <Button data-testid="button-create-event" type="submit" className="w-full" disabled={createEvent.isPending}>
                  {createEvent.isPending ? "Creating..." : "Create Event"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
