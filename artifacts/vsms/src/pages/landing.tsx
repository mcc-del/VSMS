import { useState } from "react";
import { Link } from "wouter";
import { RecyclingRibbon } from "@/components/recycling-ribbon";
import { ComingSoonBanner } from "@/components/coming-soon-banner";
import { useGetPublicThresholds } from "@workspace/api-client-react";

type Band = "elementary" | "middle" | "high";
const BAND_LABELS: Record<Band, string> = { elementary: "Kids (Grade 2–5)", middle: "Teens (Grade 6–10)", high: "Young Adults (Grade 11–12)" };
const FALLBACK: Record<Band, { bronze: number; silver: number; gold: number }> = {
  elementary: { bronze: 26, silver: 50, gold: 75 },
  middle: { bronze: 50, silver: 75, gold: 100 },
  high: { bronze: 100, silver: 175, gold: 250 },
};

const css = `
.mc-landing {
  --ground: #eef3f7;
  --surface: #ffffff;
  --surface-2: #f2f8fc;
  --ink: #2c414c;
  --ink-soft: #62757f;
  --line: #dde7ee;
  --blue: #5c9fd6;
  --blue-deep: #4589c4;
  --coral: #e05a4c;
  --teal: #5bb3a4;
  --gold: #e3ab2f;
  --gold-bright: #f4c34f;
  --brand-ink: #23414f;
  --focus: #4589c4;
  --shadow: 14px 14px 0 rgba(44, 65, 76, 0.06);
  --sf: "Public Sans", ui-sans-serif, system-ui, sans-serif;
  --display: "Bricolage Grotesque", var(--sf);
  --mono: "Space Mono", ui-monospace, monospace;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sf);
  line-height: 1.6;
  min-height: 100vh;
}
@media (prefers-color-scheme: dark) {
  .mc-landing {
    --ground: #0e1a22; --surface: #15242e; --surface-2: #1a2c37;
    --ink: #e9f2f7; --ink-soft: #9db2be; --line: #243844;
    --blue: #6fb0e6; --blue-deep: #8bc1ef; --coral: #ef6d61; --teal: #7fccbd;
    --gold: #f4c34f; --gold-bright: #f8d073; --brand-ink: #0c1d26;
    --shadow: 14px 14px 0 rgba(0, 0, 0, 0.28);
  }
}
.mc-landing * { box-sizing: border-box; }
.mc-landing h1, .mc-landing h2, .mc-landing h3 { font-family: var(--display); margin: 0; letter-spacing: -0.02em; line-height: 1.05; text-wrap: balance; }
.mc-landing p { margin: 0; }
.mc-landing a { color: inherit; text-decoration: none; }
.mc-landing .wrap { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
.mc-landing .eyebrow { font-family: var(--mono); font-size: 14px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--blue-deep); font-weight: 700; }

.mc-landing nav { display: flex; align-items: center; justify-content: space-between; max-width: 1080px; margin: 0 auto; padding: 16px 24px; }
.mc-landing .logo-img { height: 72px; width: auto; display: block; }
.mc-landing .btn { display: inline-flex; align-items: center; gap: 8px; font-family: var(--sf); font-weight: 700; font-size: 15px; padding: 12px 22px; border-radius: 999px; border: 2px solid transparent; cursor: pointer; transition: transform .12s, background .15s, border-color .15s; }
.mc-landing .btn-primary { background: var(--blue-deep); color: #fff; }
.mc-landing .btn-primary:hover { background: var(--blue); transform: translateY(-2px); }
.mc-landing .btn-ghost { border-color: var(--line); color: var(--ink); }
.mc-landing .btn-ghost:hover { border-color: var(--blue); color: var(--blue-deep); }
.mc-landing .btn-lg { padding: 16px 30px; font-size: 17px; }

/* ---- HERO ---- */
.mc-landing .hero-stage { position: relative; overflow: hidden; }
.mc-landing .hero-stage::before,
.mc-landing .hero-stage::after {
  content: ""; position: absolute; z-index: 0; border-radius: 50%;
  filter: blur(70px); opacity: 0.55; pointer-events: none;
}
.mc-landing .hero-stage::before {
  width: 520px; height: 520px; top: -160px; left: -120px;
  background: radial-gradient(circle at 30% 30%, var(--blue), transparent 70%);
}
.mc-landing .hero-stage::after {
  width: 460px; height: 460px; top: -80px; right: -140px;
  background: radial-gradient(circle at 60% 40%, var(--gold-bright), transparent 70%);
  opacity: 0.4;
}
@media (prefers-color-scheme: dark) {
  .mc-landing .hero-stage::before { opacity: 0.32; }
  .mc-landing .hero-stage::after { opacity: 0.24; }
}
.mc-landing .hero { position: relative; z-index: 1; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; padding: 32px 0 72px; }
.mc-landing .hero > div { animation: heroRise .7s cubic-bezier(.16,.84,.44,1) both; }
.mc-landing .hero > .card { animation-delay: .12s; }
@keyframes heroRise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }

.mc-landing .hero .eyebrow { display: block; }
.mc-landing .hero h1 { font-size: clamp(40px, 6.4vw, 66px); font-weight: 800; margin-top: 14px; }
.mc-landing .hero h1 .gold { position: relative; background: linear-gradient(100deg, var(--gold), var(--gold-bright) 45%, var(--gold)); background-size: 220% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: goldShine 4.5s ease-in-out infinite; }
@keyframes goldShine { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
.mc-landing .hero-sub { font-size: clamp(17px, 2vw, 20px); color: var(--ink-soft); margin-top: 20px; max-width: 30em; }
.mc-landing .hero-cta { display: flex; gap: 12px; margin-top: 30px; flex-wrap: wrap; }
.mc-landing .btn-primary { box-shadow: 0 10px 24px -10px color-mix(in srgb, var(--blue-deep) 80%, transparent); }
.mc-landing .hero-elig { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; padding-top: 26px; border-top: 2px solid var(--line); }
.mc-landing .elig-head { flex-basis: 100%; font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.12em; font-size: 11px; font-weight: 700; color: var(--ink-soft); }
.mc-landing .eb { background: var(--surface); border: 2px solid var(--line); border-radius: 14px; padding: 10px 16px; font-size: 15px; font-weight: 700; color: var(--ink); box-shadow: var(--shadow); }
.mc-landing .eb b { display: block; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--blue-deep); margin-bottom: 2px; }

.mc-landing .card { background: var(--surface); border: 2px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); padding: 26px; }
.mc-landing .hero .card { position: relative; border-radius: 26px; box-shadow: 22px 22px 0 rgba(44,65,76,0.06), 0 30px 60px -30px rgba(44,65,76,0.35); }
.mc-landing .hero .card::before { content: ""; position: absolute; inset: -2px; border-radius: 26px; padding: 2px; background: linear-gradient(140deg, color-mix(in srgb, var(--gold) 60%, transparent), transparent 45%, color-mix(in srgb, var(--blue) 55%, transparent)); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none; }
.mc-landing .card-badge { position: absolute; top: -16px; right: 22px; z-index: 2; display: inline-flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #3a2a06; background: linear-gradient(140deg, var(--gold-bright), var(--gold)); border-radius: 999px; padding: 7px 14px; box-shadow: 0 10px 20px -8px color-mix(in srgb, var(--gold) 80%, transparent); }
.mc-landing .lc-label { font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; color: var(--ink-soft); font-weight: 700; }
.mc-landing .lc-sub { font-size: 14px; color: var(--ink-soft); margin: 4px 0 16px; }
.mc-landing .ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.mc-landing .rung { display: flex; align-items: center; gap: 14px; padding: 13px 16px; border: 2px solid var(--line); border-radius: 15px; background: var(--surface-2); }
.mc-landing .rung.gold { border-color: color-mix(in srgb, var(--gold) 55%, var(--line)); background: color-mix(in srgb, var(--gold) 12%, var(--surface)); box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 45%, transparent); animation: goldPulse 3.2s ease-in-out infinite; }
@keyframes goldPulse { 0%,100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 40%, transparent); } 50% { box-shadow: 0 0 24px 2px color-mix(in srgb, var(--gold) 34%, transparent); } }
.mc-landing .rmedal { flex: none; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-family: var(--mono); font-weight: 700; color: #fff; }
.mc-landing .rmedal.b { background: var(--coral); } .mc-landing .rmedal.s { background: var(--teal); }
.mc-landing .rmedal.g { background: linear-gradient(140deg, var(--gold-bright), var(--gold)); color: #3a2a06; }
.mc-landing .rinfo b { font-family: var(--display); font-size: 17px; } .mc-landing .rinfo span { display: block; font-size: 12.5px; color: var(--ink-soft); }
.mc-landing .rhrs { margin-left: auto; font-family: var(--mono); font-weight: 700; font-size: 22px; }
.mc-landing .bandsel { display: inline-flex; gap: 4px; background: var(--surface-2); border: 2px solid var(--line); border-radius: 999px; padding: 4px; margin: 0 0 16px; }
.mc-landing .bandsel button { border: 0; background: transparent; font-family: var(--mono); font-size: 11.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ink-soft); padding: 7px 12px; border-radius: 999px; cursor: pointer; transition: all .15s; }
.mc-landing .bandsel button[aria-pressed="true"] { background: var(--blue-deep); color: #fff; box-shadow: 0 6px 14px -6px color-mix(in srgb, var(--blue) 80%, transparent); }

.mc-landing section { padding: 56px 0; }
.mc-landing .section-band { margin-top: 48px; margin-bottom: 40px; }
.mc-landing .sec-head { max-width: 34em; margin-bottom: 36px; }
.mc-landing .sec-head h2 { font-size: clamp(28px, 4vw, 38px); font-weight: 800; margin-top: 10px; }
.mc-landing .sec-head p { color: var(--ink-soft); margin-top: 12px; font-size: 17px; }
.mc-landing .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.mc-landing .step { padding: 24px; background: var(--surface); border: 2px solid var(--line); border-radius: 18px; }
.mc-landing .step-n { font-family: var(--mono); font-weight: 700; font-size: 13px; color: var(--blue-deep); border: 1.5px solid var(--blue); width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 16px; }
.mc-landing .step h3 { font-size: 20px; margin-bottom: 6px; }
.mc-landing .step p { color: var(--ink-soft); font-size: 15px; }

.mc-landing .band { background: var(--brand-ink); border-radius: 26px; padding: 44px 40px; color: #eaf4fb; }
.mc-landing .band .eyebrow { color: var(--gold-bright); }
.mc-landing .band h2 { color: #fff; font-size: clamp(26px, 3.6vw, 34px); font-weight: 800; margin-top: 8px; }
.mc-landing .tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 28px; }
.mc-landing .tier { background: rgba(255,255,255,0.06); border: 1.5px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 22px; }
.mc-landing .tier .hrs { font-family: var(--mono); font-size: 26px; font-weight: 700; color: var(--gold-bright); margin: 4px 0; }
.mc-landing .tier h3 { color: #fff; font-size: 18px; } .mc-landing .tier p { color: rgba(234,244,251,0.72); font-size: 14px; }

.mc-landing .trust { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.mc-landing .trust-item h3 { font-size: 16px; } .mc-landing .trust-item p { font-size: 14px; color: var(--ink-soft); margin-top: 3px; }
.mc-landing .check { width: 26px; height: 26px; border-radius: 8px; background: color-mix(in srgb, var(--blue) 16%, transparent); color: var(--blue-deep); display: grid; place-items: center; font-weight: 800; margin-bottom: 10px; }

.mc-landing .cta-final { text-align: center; padding: 72px 0 40px; }
.mc-landing .cta-final h2 { font-size: clamp(30px, 4.5vw, 44px); font-weight: 800; }
.mc-landing .cta-final p { color: var(--ink-soft); font-size: 18px; margin: 14px auto 28px; max-width: 26em; }
.mc-landing footer { border-top: 2px solid var(--line); padding: 28px 0 48px; font-family: var(--mono); font-size: 12.5px; color: var(--ink-soft); }

@media (max-width: 860px) {
  .mc-landing .hero { grid-template-columns: 1fr; gap: 32px; }
  .mc-landing .steps, .mc-landing .tiers, .mc-landing .trust { grid-template-columns: 1fr; }
  .mc-landing .logo-img { height: 48px; }
}
@media (max-width: 560px) {
  .mc-landing .wrap { padding: 0 28px; }
  .mc-landing nav { padding: 14px 22px; }
  .mc-landing .hero { padding: 20px 0 44px; gap: 26px; }
  .mc-landing .hero h1 { font-size: clamp(28px, 7.4vw, 38px); line-height: 1.15; margin-top: 10px; overflow-wrap: break-word; }
  .mc-landing .hero-sub { font-size: 16px; margin-top: 14px; }
  .mc-landing .hero-cta { margin-top: 22px; }
  .mc-landing .hero-elig { margin-top: 22px; padding-top: 20px; }
  .mc-landing .btn-lg { padding: 14px 22px; font-size: 16px; }
  .mc-landing section { padding: 36px 0; }
  .mc-landing .section-band { margin-top: 28px; }
  .mc-landing .sec-head { margin-bottom: 24px; }
  .mc-landing .band { padding: 30px 22px; border-radius: 20px; }
  .mc-landing .card { padding: 22px; }
  .mc-landing .cta-final { padding: 48px 0 28px; }
}
`;

export default function LandingPage() {
  const { data } = useGetPublicThresholds();
  const [band, setBand] = useState<Band>("high");
  const byLevel = (data?.levels ?? []).reduce(
    (acc, l) => { acc[l.level as Band] = { bronze: l.bronze, silver: l.silver, gold: l.gold }; return acc; },
    {} as Record<Band, { bronze: number; silver: number; gold: number }>,
  );
  const th = byLevel[band] ?? FALLBACK[band];

  return (
    <div className="mc-landing">
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <RecyclingRibbon />
      <ComingSoonBanner />

      <nav>
        <img className="logo-img" src="/medinacares-logo.png" alt="MedinaCares" />
        <Link href="/login" className="btn btn-ghost">Log in</Link>
      </nav>

      <div className="hero-stage">
        <header className="wrap hero">
          <div>
            <span className="eyebrow">Volunteer Service Awards &middot; 2026&ndash;2027</span>
            <h1>Turn caring into hours,<br />all the way to <span className="gold">Gold.</span></h1>
            <p className="hero-sub">
              Log your volunteer hours, get them verified, and earn Bronze, Silver &amp; Gold &mdash;
              celebrated at our annual awards ceremony.
            </p>
            <div className="hero-cta">
              <Link href="/register" className="btn btn-primary btn-lg">Create your account</Link>
              <Link href="/login" className="btn btn-ghost btn-lg">I already have one</Link>
            </div>
            <div className="hero-elig">
              <span className="elig-head">Eligibility</span>
              <span className="eb"><b>Medina students</b>Grades 2&ndash;9</span>
              <span className="eb"><b>Alumni &amp; community</b>Grades 2&ndash;12</span>
            </div>
          </div>

          <div className="card">
            <span className="card-badge">★ The awards</span>
            <div className="lc-label">The ladder</div>
            <div className="lc-sub">Reach the hours, earn the medal — goals adjust by grade.</div>
            <div className="bandsel" role="group" aria-label="Choose a grade band">
              {(["elementary", "middle", "high"] as Band[]).map((b) => (
                <button key={b} type="button" aria-pressed={band === b} onClick={() => setBand(b)}>
                  {BAND_LABELS[b]}
                </button>
              ))}
            </div>
            <ol className="ladder">
              <li className="rung gold"><span className="rmedal g">G</span><span className="rinfo"><b>Gold</b><span>Highest service honor</span></span><span className="rhrs">{th.gold}h+</span></li>
              <li className="rung"><span className="rmedal s">S</span><span className="rinfo"><b>Silver</b><span>Serious commitment</span></span><span className="rhrs">{th.silver}h+</span></li>
              <li className="rung"><span className="rmedal b">B</span><span className="rinfo"><b>Bronze</b><span>Your first milestone</span></span><span className="rhrs">{th.bronze}h+</span></li>
            </ol>
          </div>
        </header>
      </div>

      <section className="wrap">
        <div className="sec-head">
          <span className="eyebrow">How it works</span>
          <h2>Three steps, zero paperwork.</h2>
        </div>
        <div className="steps">
          <div className="step"><div className="step-n">1</div><h3>Log your hours</h3><p>Sign up for events, or add external volunteering.</p></div>
          <div className="step"><div className="step-n">2</div><h3>Get them verified</h3><p>A supervisor reviews and approves — no paper forms.</p></div>
          <div className="step"><div className="step-n">3</div><h3>Earn your medal</h3><p>Climb to Bronze, Silver &amp; Gold, honored at the ceremony.</p></div>
        </div>
      </section>

      <section className="wrap section-band">
        <div className="band">
          <span className="eyebrow">The milestones · {BAND_LABELS[band]}</span>
          <h2>Something to aim for.</h2>
          <div className="tiers">
            <div className="tier"><h3>Bronze</h3><div className="hrs">{th.bronze}h+</div><p>Your first big milestone — the habit is real.</p></div>
            <div className="tier"><h3>Silver</h3><div className="hrs">{th.silver}h+</div><p>Serious commitment to service.</p></div>
            <div className="tier"><h3>Gold</h3><div className="hrs">{th.gold}h+</div><p>The highest honor — recognized leadership.</p></div>
          </div>
        </div>
      </section>

      <section className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Why it counts</span>
          <h2>Built to make hours count — accurately.</h2>
        </div>
        <div className="trust">
          <div className="trust-item"><div className="check">✓</div><h3>Supervisor-verified</h3><p>Every hour is reviewed and approved.</p></div>
          <div className="trust-item"><div className="check">✓</div><h3>External hours count</h3><p>Volunteering with approved non-profits counts too.</p></div>
          <div className="trust-item"><div className="check">✓</div><h3>All in one place</h3><p>Events, hours, and progress on any device.</p></div>
        </div>
      </section>

      <section className="wrap cta-final">
        <span className="eyebrow">Start today</span>
        <h2>Ready to start logging?</h2>
        <p>Create your account in under a minute and put your first hours on the board.</p>
        <Link href="/register" className="btn btn-primary btn-lg">Create your free account</Link>
      </section>

      <footer>
        <div className="wrap">MedinaCares · Volunteer Service Awards — Medina Academy Redmond</div>
      </footer>
    </div>
  );
}
