import { Link } from "wouter";

const css = `
.mc-landing {
  --ground: #eef3f7;
  --surface: #ffffff;
  --surface-2: #f2f8fc;
  --ink: #2c414c;
  --ink-soft: #62757f;
  --line: #dde7ee;
  --brand: #5c9fd6;
  --brand-bright: #4589c4;
  --gold: #e3ab2f;
  --gold-bright: #f4c34f;
  --bronze: #e05a4c;
  --silver: #5bb3a4;
  --focus: #4589c4;
  --shadow: 14px 14px 0 rgba(44, 65, 76, 0.06);
  --sf: "Public Sans", ui-sans-serif, system-ui, sans-serif;
  --display: "Bricolage Grotesque", var(--sf);
  --mono: "Space Mono", ui-monospace, monospace;

  position: fixed;
  inset: 0;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--sf);
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}
@media (prefers-color-scheme: dark) {
  .mc-landing {
    --ground: #0e1a22; --surface: #15242e; --surface-2: #1a2c37;
    --ink: #e9f2f7; --ink-soft: #9db2be; --line: #243844;
    --brand: #6fb0e6; --brand-bright: #8bc1ef;
    --gold: #f4c34f; --gold-bright: #f8d073; --bronze: #ef6d61; --silver: #7fccbd;
    --shadow: 14px 14px 0 rgba(0, 0, 0, 0.28);
  }
}

.mc-landing * { box-sizing: border-box; }
.mc-landing .screen { height: 100%; display: flex; flex-direction: column; }
.mc-landing h1 { font-family: var(--display); text-wrap: balance; margin: 0; letter-spacing: -0.02em; line-height: 1.04; }
.mc-landing p { margin: 0; }
.mc-landing a { color: inherit; text-decoration: none; }

.mc-landing .eyebrow { font-family: var(--mono); font-size: 15px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-bright); font-weight: 700; }

.mc-landing nav { flex: none; display: flex; align-items: center; justify-content: space-between; padding: 14px clamp(20px, 4vw, 44px); max-width: 1120px; margin: 0 auto; width: 100%; }
.mc-landing .logo-img { height: 92px; width: auto; display: block; }
.mc-landing .nav-actions { display: flex; align-items: center; gap: 10px; }

.mc-landing .btn { display: inline-flex; align-items: center; gap: 8px; font-family: var(--sf); font-weight: 700; font-size: 15px; padding: 12px 22px; border-radius: 999px; border: 2px solid transparent; cursor: pointer; transition: transform .12s ease, background .15s ease, border-color .15s; }
.mc-landing .btn-primary { background: var(--brand); color: #fff; }
.mc-landing .btn-primary:hover { background: var(--brand-bright); transform: translateY(-2px); }
.mc-landing .btn-ghost { background: transparent; color: var(--ink); border-color: var(--line); }
.mc-landing .btn-ghost:hover { border-color: var(--brand); color: var(--brand-bright); }
.mc-landing .btn-lg { padding: 15px 30px; font-size: 16px; }
.mc-landing .btn:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px; }

.mc-landing .hero { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: clamp(32px, 5vw, 60px); align-items: center; max-width: 1120px; margin: 0 auto; width: 100%; padding: 0 clamp(20px, 4vw, 44px); }
.mc-landing .hero h1 { font-size: clamp(38px, 5.6vw, 62px); font-weight: 800; }
.mc-landing .hero h1 .grad { background: linear-gradient(100deg, var(--gold), var(--gold-bright)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.mc-landing .hero-sub { font-size: clamp(16px, 1.8vw, 19px); color: var(--ink-soft); margin-top: 13px; max-width: 30em; }
.mc-landing .hero-cta { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
.mc-landing .steps-inline { display: flex; gap: 22px; margin-top: 18px; flex-wrap: wrap; }
.mc-landing .si { display: flex; align-items: center; gap: 9px; font-size: 14px; font-weight: 700; color: var(--ink-soft); }
.mc-landing .si b { font-family: var(--mono); width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; color: #fff; }
.mc-landing .si:nth-child(1) b { background: var(--bronze); }
.mc-landing .si:nth-child(2) b { background: var(--silver); }
.mc-landing .si:nth-child(3) b { background: var(--gold); }

.mc-landing .card { background: var(--surface); border: 2px solid var(--line); border-radius: 22px; box-shadow: var(--shadow); }
.mc-landing .ladder-card { padding: 22px; }
.mc-landing .lc-head { display: flex; flex-direction: column; gap: 3px; margin-bottom: 13px; }
.mc-landing .lc-label { font-family: var(--mono); text-transform: uppercase; letter-spacing: 0.14em; font-size: 11px; color: var(--ink-soft); font-weight: 700; }
.mc-landing .lc-sub { font-size: 14px; color: var(--ink-soft); font-weight: 600; }
.mc-landing .ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
.mc-landing .rung { display: flex; align-items: center; gap: 14px; padding: 11px 16px; border: 2px solid var(--line); border-radius: 15px; background: var(--surface-2); opacity: 0; transform: translateY(12px); animation: mc-rise .55s cubic-bezier(.22,.61,.36,1) forwards; }
.mc-landing .rung:nth-child(1) { animation-delay: .06s; }
.mc-landing .rung:nth-child(2) { animation-delay: .16s; }
.mc-landing .rung:nth-child(3) { animation-delay: .26s; }
@keyframes mc-rise { to { opacity: 1; transform: none; } }
.mc-landing .rung.gold { border-color: color-mix(in srgb, var(--gold) 55%, var(--line)); background: color-mix(in srgb, var(--gold) 12%, var(--surface)); }
.mc-landing .rmedal { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-family: var(--mono); font-weight: 700; font-size: 16px; color: #fff; }
.mc-landing .rung.bronze .rmedal { background: var(--bronze); }
.mc-landing .rung.silver .rmedal { background: var(--silver); }
.mc-landing .rung.gold .rmedal { background: linear-gradient(140deg, var(--gold-bright), var(--gold)); color: #3a2a06; box-shadow: 0 0 0 4px color-mix(in srgb, var(--gold) 22%, transparent); }
.mc-landing .rinfo { display: flex; flex-direction: column; }
.mc-landing .rinfo b { font-family: var(--display); font-size: 17px; font-weight: 700; }
.mc-landing .rinfo span { font-size: 12.5px; color: var(--ink-soft); }
.mc-landing .rhrs { margin-left: auto; font-family: var(--mono); font-weight: 700; font-size: 24px; color: var(--ink); font-variant-numeric: tabular-nums; }
.mc-landing .rhrs i { font-style: normal; font-size: 15px; color: var(--ink-soft); margin-left: 1px; }

.mc-landing footer { flex: none; text-align: center; padding: 16px; font-family: var(--mono); font-size: 12px; letter-spacing: 0.02em; color: var(--ink-soft); }

@media (max-width: 820px) {
  .mc-landing { position: absolute; height: auto; min-height: 100dvh; overflow-x: hidden; overflow-y: auto; }
  .mc-landing .screen { min-height: 100dvh; }
  .mc-landing nav { padding: 12px 18px; }
  .mc-landing .logo-img { height: 58px; }
  .mc-landing .hero { grid-template-columns: 1fr; gap: 22px; padding: 6px 20px 32px; align-items: start; }
  .mc-landing .hero h1 { font-size: clamp(30px, 8.5vw, 44px); }
  .mc-landing .hero h1 br { display: none; }
  .mc-landing .hero-sub { font-size: 16px; margin-top: 12px; }
}
@media (max-width: 480px) {
  .mc-landing nav { padding: 10px 16px; }
  .mc-landing .logo-img { height: 48px; }
  .mc-landing .hero { padding: 4px 16px 28px; gap: 18px; }
  .mc-landing .hero h1 { font-size: 29px; }
  .mc-landing .eyebrow { font-size: 13px; }
  .mc-landing .hero-cta { width: 100%; }
  .mc-landing .hero-cta .btn { width: 100%; justify-content: center; }
  .mc-landing .steps-inline { gap: 12px 16px; margin-top: 16px; }
  .mc-landing .ladder-card { padding: 18px; }
  .mc-landing .rhrs { font-size: 22px; }
  .mc-landing footer { padding: 14px 16px; line-height: 1.5; }
}
@media (prefers-reduced-motion: reduce) {
  .mc-landing .rung { opacity: 1; transform: none; animation: none; }
  .mc-landing .btn:hover { transform: none; }
}
`;

export default function LandingPage() {
  return (
    <div className="mc-landing">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className="screen">
        <nav>
          <img className="logo-img" src="/medinacares-logo.png" alt="MedinaCares" />
          <div className="nav-actions">
            <Link href="/login" className="btn btn-ghost">Log in</Link>
          </div>
        </nav>

        <main className="hero">
          <div>
            <span className="eyebrow">Volunteer Service Awards &middot; 2026&ndash;2027</span>
            <h1>Turn caring into hours,<br />all the way to <span className="grad">Gold.</span></h1>
            <p className="hero-sub">Log the volunteer work you do &mdash; at school or out in the community &mdash; get it verified by a supervisor, and watch your total climb toward Bronze, Silver, and Gold.</p>
            <div className="hero-cta">
              <Link href="/register" className="btn btn-primary btn-lg">Create your account</Link>
            </div>
            <div className="steps-inline">
              <span className="si"><b>1</b> Log hours</span>
              <span className="si"><b>2</b> Get verified</span>
              <span className="si"><b>3</b> Earn your medal</span>
            </div>
          </div>

          <div className="card ladder-card" aria-hidden="true">
            <div className="lc-head">
              <span className="lc-label">The awards</span>
              <span className="lc-sub">Reach the hours, earn the medal.</span>
            </div>
            <ol className="ladder">
              <li className="rung gold">
                <span className="rmedal">G</span>
                <span className="rinfo"><b>Gold</b><span>Highest service honor</span></span>
                <span className="rhrs">80<i>h</i></span>
              </li>
              <li className="rung silver">
                <span className="rmedal">S</span>
                <span className="rinfo"><b>Silver</b><span>Serious commitment</span></span>
                <span className="rhrs">75<i>h</i></span>
              </li>
              <li className="rung bronze">
                <span className="rmedal">B</span>
                <span className="rinfo"><b>Bronze</b><span>Your first milestone</span></span>
                <span className="rhrs">40<i>h</i></span>
              </li>
            </ol>
          </div>
        </main>

        <footer>MedinaCares &middot; Medina Academy volunteer service &mdash; opening to more schools soon</footer>
      </div>
    </div>
  );
}
