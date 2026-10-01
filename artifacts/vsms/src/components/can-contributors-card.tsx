import { useState } from "react";
import { useListCanContributors, getListCanContributorsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Users } from "lucide-react";

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Admin view of everyone who typed a name on the dumpster QR form, with their
// running totals, so students can be recognized. Names are free text, so the
// server groups them ignoring case and spacing; anonymous drop-offs are left out.
export function CanContributorsCard() {
  const { data: rows } = useListCanContributors({
    query: { queryKey: getListCanContributorsQueryKey() },
  });
  const [filter, setFilter] = useState("");

  const shown = (rows ?? []).filter((r) => r.name.toLowerCase().includes(filter.trim().toLowerCase()));

  function downloadCsv() {
    if (!rows) return;
    const lines = [
      ["Name", "Drop-offs", "Pounds", "Cans", "First drop-off", "Last drop-off"].join(","),
      ...rows.map((r) =>
        [
          r.name,
          r.dropoffs,
          r.weightLbs,
          r.cans,
          new Date(r.firstDropoffAt).toLocaleString(),
          new Date(r.lastDropoffAt).toLocaleString(),
        ]
          .map(csvCell)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `million-cans-contributors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="w-4 h-4 text-green-600" /> Million Cans — contributors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          Everyone who added their name on the QR form, with their totals. Only Super Admins can see this list.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          <Input
            placeholder="Search a name"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 w-56"
            data-testid="input-contributor-search"
          />
          <Button variant="outline" size="sm" className="gap-1.5 h-9" onClick={downloadCsv} disabled={!rows?.length}>
            <Download className="w-4 h-4" /> Download CSV
          </Button>
        </div>

        {!rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No named drop-offs yet.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground text-left">
                <tr>
                  <th className="py-1.5 font-medium">Name</th>
                  <th className="py-1.5 font-medium text-right">Bags</th>
                  <th className="py-1.5 font-medium text-right">Lbs</th>
                  <th className="py-1.5 font-medium text-right">Cans</th>
                  <th className="py-1.5 font-medium text-right hidden sm:table-cell">Last drop-off</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.name.toLowerCase()}>
                    <td className="py-1.5 pr-2">{r.name}</td>
                    <td className="py-1.5 text-right font-mono">{r.dropoffs}</td>
                    <td className="py-1.5 text-right font-mono">{r.weightLbs}</td>
                    <td className="py-1.5 text-right font-mono font-semibold">{r.cans.toLocaleString()}</td>
                    <td className="py-1.5 text-right text-muted-foreground hidden sm:table-cell">
                      {new Date(r.lastDropoffAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2">
              {rows.length} {rows.length === 1 ? "person" : "people"} · names that are spelled differently show up as separate rows.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
