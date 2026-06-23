import { useCreateEvent, useListUsers, getListEventsQueryKey, getGetAdminDashboardQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const schema = z.object({
  title: z.string().min(1, "Title is required").max(150),
  description: z.string().min(1, "Description is required"),
  eventDate: z.string().min(1, "Date is required"),
  hoursValue: z.coerce.number().positive("Must be greater than 0"),
  maxCapacity: z.coerce.number().int().positive("Must be a positive integer"),
  supervisorId: z.string().min(1, "Select a supervisor"),
});

export default function AdminNewEvent() {
  const createEvent = useCreateEvent();
  const { data: users } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const supervisors = (users ?? []).filter(u => u.role === "supervisor");

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      eventDate: "",
      hoursValue: 4,
      maxCapacity: 50,
      supervisorId: "",
    },
  });

  function onSubmit(values: z.infer<typeof schema>) {
    createEvent.mutate(
      { data: values },
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

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="eventDate" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event date</FormLabel>
                      <FormControl>
                        <Input data-testid="input-event-date" type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="hoursValue" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Hours value</FormLabel>
                      <FormControl>
                        <Input data-testid="input-hours" type="number" step="0.5" min="0.5" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max capacity</FormLabel>
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
