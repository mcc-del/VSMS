import { useGetRecyclingSummary, getGetRecyclingSummaryQueryKey } from "@workspace/api-client-react";

// The always-on green banner for the Million Cans Recycling Competition.
// Reads the public summary endpoint, so it renders on login/landing too.
export function RecyclingRibbon() {
  const { data } = useGetRecyclingSummary({
    query: { queryKey: getGetRecyclingSummaryQueryKey(), staleTime: 60_000 },
  });
  if (!data) return null;

  const pct = data.goal > 0 ? Math.min(100, Math.round((data.totalCans / data.goal) * 100)) : 0;
  const remaining = Math.max(0, data.goal - data.totalCans);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flexWrap: "wrap",
        color: "#fff",
        padding: "9px 18px",
        fontSize: "14px",
        background: "linear-gradient(90deg, #2f7d47, #3f9e5a 55%, #3fae9c)",
      }}
    >
      <span style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap" }}>
        🥫 {data.name}
      </span>
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontWeight: 700,
          background: "rgba(255,255,255,0.16)",
          padding: "2px 9px",
          borderRadius: "999px",
          whiteSpace: "nowrap",
        }}
      >
        {data.totalCans.toLocaleString()} cans
      </span>
      <span
        style={{
          flex: 1,
          minWidth: "120px",
          height: "10px",
          background: "rgba(255,255,255,0.25)",
          borderRadius: "999px",
          overflow: "hidden",
        }}
      >
        <span
          style={{
            display: "block",
            width: `${pct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #fff, #f6c95a)",
            borderRadius: "999px",
          }}
        />
      </span>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px", whiteSpace: "nowrap", opacity: 0.95 }}>
        {pct}% to our {data.goal.toLocaleString()} goal · {remaining.toLocaleString()} to go 🎯
      </span>
    </div>
  );
}
