import { useRoute, useLocation } from "wouter";
import {
  useGetMyServiceRecord,
  useGetUserServiceRecord,
  useGetChildServiceRecord,
  getGetMyServiceRecordQueryKey,
  getGetUserServiceRecordQueryKey,
  getGetChildServiceRecordQueryKey,
} from "@workspace/api-client-react";
import type { ServiceRecord } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";

const css = `
.sr-screen { --ink:#23333d; --soft:#5f7079; --line:#d7e2e9; --gold:#c9971d; --brand:#23414f; --bg:#eef3f7;
  background: var(--bg); min-height:100vh; padding: 24px 16px 64px; color: var(--ink);
  font-family:"Public Sans", ui-sans-serif, system-ui, sans-serif; }
.sr-bar { max-width: 820px; margin: 0 auto 16px; display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; }
.sr-bar button, .sr-bar a { font: inherit; font-weight:700; font-size:14px; padding:10px 18px; border-radius:10px; border:2px solid var(--line);
  background:#fff; color:var(--ink); cursor:pointer; text-decoration:none; }
.sr-bar .primary { background: var(--brand); color:#fff; border-color: var(--brand); }
.sr-doc { max-width: 820px; margin: 0 auto; background:#fff; border:1px solid var(--line); border-radius:14px;
  box-shadow: 0 20px 50px -30px rgba(35,51,61,.4); padding: 48px 52px; }
.sr-doc h1,.sr-doc h2,.sr-doc h3 { margin:0; font-family:"Bricolage Grotesque","Public Sans",sans-serif; letter-spacing:-0.01em; }
.sr-brand { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid var(--brand); padding-bottom:18px; }
.sr-brand .org { font-size:22px; font-weight:800; color:var(--brand); }
.sr-brand .prog { font-size:12.5px; color:var(--soft); letter-spacing:.04em; text-transform:uppercase; margin-top:2px; }
.sr-brand .season { text-align:right; font-size:12.5px; color:var(--soft); }
.sr-title { font-size:26px; font-weight:800; margin-top:26px; }
.sr-sub { color:var(--soft); font-size:14px; margin-top:4px; }
.sr-meta { display:grid; grid-template-columns:1fr 1fr; gap:8px 32px; margin:24px 0 8px; }
.sr-meta .row { display:flex; gap:8px; font-size:14px; padding:7px 0; border-bottom:1px dashed var(--line); }
.sr-meta .k { color:var(--soft); min-width:96px; }
.sr-meta .v { font-weight:600; }
.sr-summary { display:flex; align-items:center; gap:22px; background:#f6fafc; border:1px solid var(--line); border-radius:12px; padding:20px 24px; margin:22px 0; }
.sr-hours { font-family:"Bricolage Grotesque",sans-serif; font-size:44px; font-weight:800; line-height:1; color:var(--brand); }
.sr-hours span { font-size:16px; color:var(--soft); font-weight:600; margin-left:4px; }
.sr-medal { margin-left:auto; text-align:right; }
.sr-medal .lbl { font-size:12px; color:var(--soft); text-transform:uppercase; letter-spacing:.06em; }
.sr-medal .m { font-family:"Bricolage Grotesque",sans-serif; font-size:24px; font-weight:800; }
.sr-medal .m.gold{color:var(--gold);} .sr-medal .m.silver{color:#7d8a92;} .sr-medal .m.bronze{color:#b06a34;} .sr-medal .m.none{color:var(--soft);}
table.sr-tbl { width:100%; border-collapse:collapse; font-size:13.5px; margin-top:6px; }
table.sr-tbl th { text-align:left; font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--soft); border-bottom:2px solid var(--line); padding:8px 10px; }
table.sr-tbl td { padding:9px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
table.sr-tbl td.hrs { text-align:right; font-weight:700; white-space:nowrap; }
table.sr-tbl .tag { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color:var(--soft); }
.sr-tfoot td { font-weight:800; border-top:2px solid var(--brand); border-bottom:none; padding-top:12px; }
.sr-attest { margin-top:28px; font-size:13px; color:var(--ink); line-height:1.7; }
.sr-sign { display:flex; justify-content:space-between; gap:40px; margin-top:44px; }
.sr-sign .line { flex:1; border-top:1.5px solid var(--ink); padding-top:6px; font-size:12px; color:var(--soft); }
.sr-foot { margin-top:34px; font-size:11px; color:var(--soft); text-align:center; border-top:1px solid var(--line); padding-top:14px; }
.sr-empty { text-align:center; color:var(--soft); padding:28px; font-style:italic; }
@media (max-width: 640px){ .sr-doc{ padding:28px 20px; } .sr-meta{ grid-template-columns:1fr; } }
@media print {
  .sr-screen { background:#fff; padding:0; }
  .no-print { display:none !important; }
  .sr-doc { box-shadow:none; border:none; border-radius:0; max-width:none; padding:0; }
}
`;

function medalClass(m: string | null | undefined) {
  return (m ?? "none").toLowerCase();
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function typeLabel(t: string) {
  return t === "event" ? "In-program" : t === "external" ? "External" : "Credit";
}

function Document({ rec }: { rec: ServiceRecord }) {
  const total = rec.totalApprovedHours;
  return (
    <div className="sr-doc">
      <div className="sr-brand">
        <div>
          <div className="org">Medina Academy</div>
          <div className="prog">MedinaCares · Volunteer Service Awards</div>
        </div>
        <div className="season">
          Award season<br />
          <strong>{rec.season}</strong>
        </div>
      </div>

      <h1 className="sr-title">Verified Record of Service Hours</h1>
      <p className="sr-sub">
        This statement certifies volunteer service hours reviewed and approved through the
        MedinaCares program and accredited by Medina Academy.
      </p>

      <div className="sr-meta">
        <div className="row"><span className="k">Name</span><span className="v">{rec.studentName}</span></div>
        <div className="row"><span className="k">Grade</span><span className="v">{rec.grade || "—"}</span></div>
        <div className="row"><span className="k">School</span><span className="v">{rec.school || "—"}</span></div>
        <div className="row"><span className="k">Affiliation</span><span className="v">{rec.organizationName || "Community"}</span></div>
      </div>

      <div className="sr-summary">
        <div className="sr-hours">{total}<span>approved hours</span></div>
        <div className="sr-medal">
          <div className="lbl">Award level</div>
          <div className={`m ${medalClass(rec.medal)}`}>{rec.medal || "In progress"}</div>
        </div>
      </div>

      {rec.items.length === 0 ? (
        <p className="sr-empty">No approved hours to report yet.</p>
      ) : (
        <table className="sr-tbl">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity</th>
              <th>Organization</th>
              <th>Verified by</th>
              <th style={{ textAlign: "right" }}>Hours</th>
            </tr>
          </thead>
          <tbody>
            {rec.items.map((it, i) => (
              <tr key={i}>
                <td>{fmtDate(it.date)}</td>
                <td>{it.activity}<div className="tag">{typeLabel(it.type)}</div></td>
                <td>{it.organization || "—"}</td>
                <td>{it.verifiedBy}</td>
                <td className="hrs">{it.hours}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="sr-tfoot">
              <td colSpan={4}>Total approved hours</td>
              <td className="hrs">{total}</td>
            </tr>
          </tfoot>
        </table>
      )}

      <p className="sr-attest">
        The hours listed above were logged by the participant and independently reviewed and
        approved by the named supervisor or verifier for each activity. Medina Academy accredits
        these hours toward its Volunteer Service Awards (Bronze, Silver, and Gold; hour goals vary by grade).
      </p>

      <div className="sr-sign">
        <div className="line">Authorized signature — Medina Academy</div>
        <div className="line">Date</div>
      </div>

      <div className="sr-foot">
        Generated {fmtDate(rec.generatedAt)} · MedinaCares Volunteer Service Awards · Medina Academy, Redmond, WA
      </div>
    </div>
  );
}

export default function ServiceRecordPage() {
  const { role } = useAuth();
  const [, setLocation] = useLocation();
  const [isAdminRoute, params] = useRoute("/admin/users/:userId/service-record");
  const [isParentRoute, pParams] = useRoute("/parent/children/:childId/service-record");
  const userId = isAdminRoute ? (params?.userId ?? "") : "";
  const childId = isParentRoute ? (pParams?.childId ?? "") : "";

  const mine = useGetMyServiceRecord({
    query: { enabled: !isAdminRoute && !isParentRoute, queryKey: getGetMyServiceRecordQueryKey() },
  });
  const forUser = useGetUserServiceRecord(userId, {
    query: { enabled: isAdminRoute && !!userId, queryKey: getGetUserServiceRecordQueryKey(userId) },
  });
  const forChild = useGetChildServiceRecord(childId, {
    query: { enabled: isParentRoute && !!childId, queryKey: getGetChildServiceRecordQueryKey(childId) },
  });

  const q = isAdminRoute ? forUser : isParentRoute ? forChild : mine;
  const rec = q.data;

  const backTo = isAdminRoute
    ? "/admin/users"
    : isParentRoute
      ? "/parent"
      : role === "participant"
        ? "/dashboard"
        : "/login";

  return (
    <div className="sr-screen">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="sr-bar no-print">
        <button onClick={() => setLocation(backTo)}>← Back</button>
        {rec && (
          <button className="primary" onClick={() => window.print()}>
            Print / Save as PDF
          </button>
        )}
      </div>

      {q.isLoading ? (
        <div className="sr-doc"><p className="sr-empty">Loading your record…</p></div>
      ) : q.isError || !rec ? (
        <div className="sr-doc"><p className="sr-empty">Could not load this service record.</p></div>
      ) : (
        <Document rec={rec} />
      )}
    </div>
  );
}
