type Tier = "gold" | "silver" | "bronze" | "none";

const TIERS: Record<Exclude<Tier, "none">, { from: string; to: string; ring: string }> = {
  gold: { from: "#FDE68A", to: "#D4A017", ring: "#B8860B" },
  silver: { from: "#F1F5F9", to: "#94A3B8", ring: "#64748B" },
  bronze: { from: "#F0C9A0", to: "#B26A2E", ring: "#8B4A1F" },
};

/** A small premium medal disc with ribbon + star, colored by tier. */
export function MedalBadge({ tier, size = 40 }: { tier: Tier; size?: number }) {
  if (tier === "none") {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="26" r="15" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" strokeDasharray="3 3" />
        <text x="24" y="31" textAnchor="middle" fontSize="14" fill="currentColor" fillOpacity="0.4">·</text>
      </svg>
    );
  }
  const c = TIERS[tier];
  const id = `mg-${tier}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={`${tier} medal`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.from} />
          <stop offset="100%" stopColor={c.to} />
        </linearGradient>
      </defs>
      {/* ribbons */}
      <path d="M17 6 L20 24 L14 22 Z" fill={c.to} opacity="0.85" />
      <path d="M31 6 L28 24 L34 22 Z" fill={c.to} opacity="0.85" />
      {/* disc */}
      <circle cx="24" cy="28" r="15" fill={`url(#${id})`} stroke={c.ring} strokeWidth="1.5" />
      <circle cx="24" cy="28" r="10.5" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1" />
      {/* star */}
      <path
        d="M24 20.5 l1.9 3.9 4.3 .6 -3.1 3 .7 4.3 -3.8 -2 -3.8 2 .7 -4.3 -3.1 -3 4.3 -.6 Z"
        fill="#ffffff"
        fillOpacity="0.92"
      />
    </svg>
  );
}
