import {
  useGetNotificationPreferences,
  useUpdateNotificationPreferences,
  getGetNotificationPreferencesQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Bell, Mailbox } from "lucide-react";

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
  const digest = (data as any)?.emailDigestDaily ?? false;

  function save(patch: { emailNotifications?: boolean; emailDigestDaily?: boolean }, label: string) {
    update.mutate(
      { data: patch as any },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetNotificationPreferencesQueryKey() });
          toast({ title: label });
        },
        onError: () => toast({ title: "Couldn't update", variant: "destructive" }),
      },
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Email notifications</p>
              <p className="text-xs text-muted-foreground">{description ?? "Get an email when there's new activity. Password resets always send."}</p>
            </div>
          </div>
          <Switch checked={on} onCheckedChange={(v) => save({ emailNotifications: v }, v ? "Email notifications on" : "Email notifications off")} disabled={update.isPending} />
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <div className="flex items-center gap-3">
            <Mailbox className="w-5 h-5 text-muted-foreground shrink-0" />
            <div>
              <p className="text-sm font-medium">Daily digest</p>
              <p className="text-xs text-muted-foreground">Bundle activity emails into one summary per day instead of one per event.</p>
            </div>
          </div>
          <Switch checked={digest} onCheckedChange={(v) => save({ emailDigestDaily: v }, v ? "Daily digest on" : "Daily digest off")} disabled={update.isPending || !on} />
        </div>
      </CardContent>
    </Card>
  );
}
