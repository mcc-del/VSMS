import { useEffect, useState } from "react";

type Detail = { studentName: string; activity: string; organization: string; date: string; hours: number; status: string };

export default function ExternalReviewPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "rejected" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setError("Missing review link."); setLoading(false); return; }
    fetch(`/api/v1/external-review/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "This link is no longer valid."); }
        return r.json();
      })
      .then((d: Detail) => setDetail(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function act(action: "approve" | "reject") {
    setSubmitting(true);
    try {
      const r = await fetch(`/api/v1/external-review/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error ?? "Something went wrong."); }
      setDone(action === "approve" ? "approved" : "rejected");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef3f7", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 460, background: "#fff", border: "1px solid #dde7ee", borderRadius: 16, padding: 28, boxShadow: "0 10px 30px -18px rgba(44,65,76,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <img src="/medinacares-logo.png" alt="MedinaCares" style={{ width: 40, height: 40, objectFit: "contain" }} />
          <div>
            <div style={{ fontWeight: 700 }}>MedinaCares</div>
            <div style={{ fontSize: 12, color: "#62757f" }}>Volunteer Service Awards</div>
          </div>
        </div>

        {loading ? (
          <p style={{ color: "#62757f" }}>Loading…</p>
        ) : done ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>{done === "approved" ? "Approved — thank you!" : "Declined"}</h1>
            <p style={{ color: "#62757f", fontSize: 14 }}>
              {done === "approved"
                ? "These hours have been confirmed and now count toward the student's award. You can close this page."
                : "You've declined these hours. The student and MedinaCares have been notified. You can close this page."}
            </p>
          </>
        ) : error ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 8px" }}>Can't open this review</h1>
            <p style={{ color: "#62757f", fontSize: 14 }}>{error}</p>
          </>
        ) : detail ? (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Verify volunteer hours</h1>
            <p style={{ color: "#62757f", fontSize: 14, margin: "0 0 16px" }}>
              {detail.studentName} listed you as their supervisor. Please confirm these hours.
            </p>
            <div style={{ background: "#f2f8fc", border: "1px solid #dde7ee", borderRadius: 12, padding: 16, fontSize: 14, lineHeight: 1.8 }}>
              <div><strong>Student:</strong> {detail.studentName}</div>
              <div><strong>Activity:</strong> {detail.activity}</div>
              <div><strong>Organization:</strong> {detail.organization}</div>
              <div><strong>Date:</strong> {detail.date}</div>
              <div><strong>Hours:</strong> {detail.hours}</div>
            </div>
            {detail.status !== "pending" ? (
              <p style={{ color: "#62757f", fontSize: 14, marginTop: 16 }}>These hours have already been {detail.status}. No further action needed.</p>
            ) : (
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => act("approve")} disabled={submitting}
                  style={{ flex: 1, background: "#4589c4", color: "#fff", border: 0, borderRadius: 10, padding: "12px 16px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {submitting ? "…" : "Approve"}
                </button>
                <button onClick={() => act("reject")} disabled={submitting}
                  style={{ flex: 1, background: "#fff", color: "#e05a4c", border: "1.5px solid #e05a4c", borderRadius: 10, padding: "12px 16px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
                  {submitting ? "…" : "Decline"}
                </button>
              </div>
            )}
            <p style={{ color: "#93a3ac", fontSize: 12, marginTop: 16 }}>
              Approving confirms the student volunteered these hours with your organization. Questions? Email mcc@medinaacademy.org.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
