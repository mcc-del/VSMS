import {
  useGetNotificationPreferences,
  useUpdateNotificationPreferences,
  getGetNotificationPreferencesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Bell } from "lucide-react";

// A small card letting staff turn their activity emails (sign-up alerts,
// new-user alerts) on or off. Password resets and invites always send.
export function NotificationToggle({ description }: { description?: string }) {
  const { data } = useGetNotificationPreferences({
    query: { queryKey: getGetNotificationPreferencesQueryKey() },
  });
  const update = useUpdateNotificationPreferences();
  const qc = useQueryClient();
  const { toast } = useToast();
  const on = data?.emailNotifications ?? true;

  function toggle(next: boolean) {
    update.mutate(
      { data: { emailNotifications: next } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
          toast({ title: next ? "Email notifications on" : "Email notifications off" });
        },
        onError: () => toast({ title: "Couldn't update", variant: "destructive" }),
      },
    );
  }

  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">Email notifications</p>
            <p className="text-xs text-muted-foreground">{description ?? "Get an email when there's new activity. Password resets always send."}</p>
          </div>
        </div>
        <Switch checked={on} onCheckedChange={toggle} disabled={update.isPending} />
      </CardContent>
    </Card>
  );
}
