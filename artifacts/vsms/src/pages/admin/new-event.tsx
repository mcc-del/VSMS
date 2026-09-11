import { useEffect } from "react";
import { useCreateEvent, useListUsers, useListOrganizations, useGetManagedOrganizations, getListEventsQueryKey, getListUsersQueryKey, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ImageUpload } from "@/components/image-upload";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { calculateEventDuration, formatHours } from "@/lib/event-duration";
import { ALL_GRADES } from "@/lib/schools";
import { Plus, Trash2 } from "lucide-react";

const slotSchema = z.object({
  slotLabel: z.string().optional(),
  eventDate: z.string().min(1, "Date required"),
  startTime: z.string().min(1, "Start required"),
  endTime: z.string().min(1, "End required"),
  maxCapacity: z.coerce.number().int().positive("Must be positive"),
});

const NONE = "none";

const schema = z
  .object({
    title: z.string().min(1, "Title is required").max(150),
    description: z.string().min(1, "Description is required"),
    location: z.string().min(1, "Location is required"),
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    minGrade: z.string().optional(),
    maxGrade: z.string().optional(),
    supervisorId: z.string().min(1, "Select a supervisor"),
    organizationId: z.string().optional(),
    imageUrl: z.string().nullable(),
    slots: z.array(slotSchema).min(1, "Add at least one time slot"),
  })
  .superRefine((values, ctx) => {
    values.slots.forEach((s, i) => {
      if (calculateEventDuration(s.startTime, s.endTime) === null) {
        ctx.addIssue({ code: "custom", path: ["slots", i, "endTime"], message: "End must be after start" });
      }
    });
  });

type FormValues = z.infer<typeof schema>;

const emptySlot = { slotLabel: "", eventDate: "", startTime: "09:00", endTime: "17:00", maxCapacity: 6 };

export default function AdminNewEvent() {
  const createEvent = useCreateEvent();
  const { role, userId } = useAuth();
  const isOrgAdmin = role === "org_admin";
  const { data: users } = useListUsers({
    query: { enabled: !isOrgAdmin, queryKey: getListUsersQueryKey() },
  });
  const { data: managed } = useGetManagedOrganizations();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const supervisors = (users ?? []).filter((u) => u.role === "supervisor");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      minGrade: NONE,
      maxGrade: NONE,
      supervisorId: "",
      organizationId: "",
      imageUrl: null,
      slots: [{ ...emptySlot }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "slots" });
  const { data: organizations } = useListOrganizations();

  const selectableOrgs =
    isOrgAdmin && managed && !managed.all
      ? (organizations ?? []).filter((o) => managed.organizationIds.includes(o.organizationId))
      : organizations ?? [];

  useEffect(() => {
    if (isOrgAdmin && userId) form.setValue("supervisorId", userId);
    if (isOrgAdmin && selectableOrgs.length === 1) {
      form.setValue("organizationId", selectableOrgs[0].organizationId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOrgAdmin, userId, selectableOrgs.length]);

  async function onSubmit(values: FormValues) {
    const shared = {
      title: values.title,
      description: values.description,
      location: values.location,
      ...(values.street ? { street: values.street } : {}),
      ...(values.city ? { city: values.city } : {}),
      ...(values.state ? { state: values.state } : {}),
      ...(values.zip ? { zip: values.zip } : {}),
      minGrade: values.minGrade && values.minGrade !== NONE ? Number(values.minGrade) : null,
      maxGrade: values.maxGrade && values.maxGrade !== NONE ? Number(values.maxGrade) : null,
      supervisorId: values.supervisorId,
      ...(values.organizationId ? { organizationId: values.organizationId } : {}),
      ...(values.imageUrl ? { imageUrl: values.imageUrl } : {}),
    };

    try {
      for (const slot of values.slots) {
        await createEvent.mutateAsync({
          data: {
            ...shared,
            slotLabel: slot.slotLabel || undefined,
            eventDate: slot.eventDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            maxCapacity: slot.maxCapacity,
          } as any,
        });
      }
      queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() });
      const n = values.slots.length;
      toast({
        title: n === 1 ? "Event created" : `${n} opportunities created`,
        description: `"${values.title}" ${n === 1 ? "was added" : "slots were added"} to the calendar.`,
      });
      form.reset();
    } catch (err: any) {
      toast({ title: "Error", description: err?.data?.error ?? "Failed to create event", variant: "destructive" });
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-xl">
        <div>
          <h1 className="text-2xl font-bold">Create New Event</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Add a volunteer opportunity — with multiple time slots if needed.
          </p>
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
                      <Input data-testid="input-title" placeholder="Scholastic Book Fair" {...field} />
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

                {/* Location */}
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location name / venue</FormLabel>
                    <FormControl>
                      <Input data-testid="input-location" placeholder="Medina Academy — Main Hall" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="street" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street address <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input data-testid="input-street" placeholder="123 Main St" {...field} />
                    </FormControl>
                  </FormItem>
                )} />
                <div className="grid grid-cols-6 gap-3">
                  <div className="col-span-3">
                    <FormField control={form.control} name="city" render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl><Input data-testid="input-city" placeholder="Redmond" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-1">
                    <FormField control={form.control} name="state" render={({ field }) => (
                      <FormItem>
                        <FormLabel>State</FormLabel>
                        <FormControl><Input data-testid="input-state" placeholder="WA" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="col-span-2">
                    <FormField control={form.control} name="zip" render={({ field }) => (
                      <FormItem>
                        <FormLabel>ZIP</FormLabel>
                        <FormControl><Input data-testid="input-zip" placeholder="98052" {...field} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </div>

                {/* Grade limits */}
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="minGrade" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minimum grade <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-min-grade"><SelectValue placeholder="Any" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Any</SelectItem>
                          {ALL_GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormDescription>e.g. Grade 4+ for a checkout shift.</FormDescription>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxGrade" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum grade <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl><SelectTrigger data-testid="select-max-grade"><SelectValue placeholder="Any" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={NONE}>Any</SelectItem>
                          {ALL_GRADES.map((g) => <SelectItem key={g} value={g}>Grade {g}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                </div>

                {/* Time slots */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Time slots</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => append({ ...emptySlot })} data-testid="button-add-slot">
                      <Plus className="w-4 h-4 mr-1" /> Add time slot
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground -mt-1">
                    Each slot becomes its own sign-up. Add one per shift (e.g. setup, checkout, cleanup) across any days.
                  </p>

                  {fields.map((f, i) => {
                    const s = form.watch(`slots.${i}`);
                    const hrs = s ? calculateEventDuration(s.startTime, s.endTime) : null;
                    return (
                      <div key={f.id} className="rounded-lg border p-3 space-y-3" data-testid={`slot-${i}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Slot {i + 1}{hrs !== null ? ` · ${formatHours(hrs)}h credit` : ""}
                          </span>
                          {fields.length > 1 && (
                            <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-slot-${i}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <FormField control={form.control} name={`slots.${i}.slotLabel`} render={({ field }) => (
                          <FormItem>
                            <FormControl><Input placeholder="Label (optional) — e.g. Checkout, Cleanup crew" {...field} /></FormControl>
                          </FormItem>
                        )} />
                        <FormField control={form.control} name={`slots.${i}.eventDate`} render={({ field }) => (
                          <FormItem>
                            <FormControl><Input type="date" {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <div className="grid grid-cols-3 gap-2">
                          <FormField control={form.control} name={`slots.${i}.startTime`} render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Start</FormLabel>
                              <FormControl><Input type="time" {...field} /></FormControl>
                            </FormItem>
                          )} />
                          <FormField control={form.control} name={`slots.${i}.endTime`} render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">End</FormLabel>
                              <FormControl><Input type="time" {...field} /></FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                          <FormField control={form.control} name={`slots.${i}.maxCapacity`} render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-xs">Slots</FormLabel>
                              <FormControl><Input type="number" min="1" {...field} /></FormControl>
                            </FormItem>
                          )} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {!isOrgAdmin && (
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
                            supervisors.map((sv) => (
                              <SelectItem key={sv.userId} value={sv.userId}>
                                {sv.firstName} {sv.lastName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Participants will see the supervisor's name, phone, and email. Set their phone on the Users page.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}

                <FormField control={form.control} name="organizationId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Who can see this</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                      value={field.value || (isOrgAdmin ? "" : NONE)}
                    >
                      <FormControl>
                        <SelectTrigger data-testid="select-organization">
                          <SelectValue placeholder={isOrgAdmin ? "Select your organization" : "Open to all (community)"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {!isOrgAdmin && <SelectItem value={NONE}>Open to all (community)</SelectItem>}
                        {selectableOrgs.map((o) => (
                          <SelectItem key={o.organizationId} value={o.organizationId}>
                            {o.name} only
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {isOrgAdmin
                        ? "Your event is private to your organization's students."
                        : "\"Open to all\" shows to every eligible student. Choosing an organization keeps it private to that org's students (e.g. Medina on-site events)."}
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
                  {createEvent.isPending
                    ? "Creating..."
                    : fields.length > 1
                      ? `Create ${fields.length} opportunities`
                      : "Create Event"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
