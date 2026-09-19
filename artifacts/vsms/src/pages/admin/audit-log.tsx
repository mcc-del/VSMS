import { useState } from "react";
import { useGetAuditLog, getGetAuditLogQueryKey } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ScrollText, Search } from "lucide-react";

const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: "All", value: "" },
  { label: "Users", value: "user." },
  { label: "Hours", value: "hours." },
  { label: "Organizations", value: "org." },
  { label: "Events", value: "event." },
];

function actionBadge(action: string) {
  const cls = action.includes("delete")
    ? "bg-red-100 text-red-700"
    : action.includes("create") || action.includes("grant")
      ? "bg-green-100 text-green-700"
      : "bg-blue-100 text-blue-700";
  return <Badge className={`${cls} border-0 font-mono text-[11px]`}>{action}</Badge>;
}

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [text, setText] = useState("");
  const { data, isLoading } = useGetAuditLog(
    { action: action || undefined, limit: 300 },
    { query: { queryKey: getGetAuditLogQueryKey({ action: action || undefined, limit: 300 }) } },
  );

  const q = text.trim().toLowerCase();
  const rows = (data ?? []).filter((r) =>
    !q ||
    [r.summary, r.actorName, r.targetLabel].filter(Boolean).join(" ").toLowerCase().includes(q),
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="w-6 h-6 text-primary" /> Audit log</h1>
          <p className="text-muted-foreground text-sm mt-1">A record of significant admin actions across the program.</p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by who, what, or target" value={text} onChange={(e) => setText(e.target.value)} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ACTION_FILTERS.map((f) => (
                <Button key={f.value} type="button" size="sm" variant={action === f.value ? "default" : "outline"} onClick={() => setAction(f.value)}>
                  {f.label}
                </Button>
              ))}
              <span className="text-xs text-muted-foreground ml-auto self-center">{rows.length} shown</span>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : rows.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No activity recorded yet.</CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y">
              {rows.map((r) => (
                <div key={r.auditLogId} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {actionBadge(r.action)}
                      <span className="text-sm font-medium">{r.summary}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      by {r.actorName} <span className="opacity-70">({r.actorRole})</span>
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
