# VSMS — Project notes for Claude

## Branding — ALWAYS use for any deliverable (decks/PowerPoint, flyers, headers, graphics, emails)

MedinaCares Volunteer Service Awards, Medina Academy (Redmond, WA). Apply this branding to
every presentation, PowerPoint, flyer, QR/graphic, or document unless the user says otherwise.

- **Logo:** `artifacts/vsms/public/medinacares-logo.png` (hand + heart under a multicolor arch; embed it on covers/flyers). White background works best for the logo.
- **Colors (from the app tokens):**
  - Ink / primary dark: `#23414f` (also `#2c414c`)
  - Blue: `#4589c4` (deep) / `#5c9fd6`
  - Gold: `#e3ab2f` / `#f4c34f` (accent; use for "Gold" and highlights)
  - Coral: `#ef6d61`, Teal: `#7fccbd` (logo-arch accents; nice as a 4-color ribbon: blue · coral · teal · gold)
  - Cream / light bg: `#f7f4ee` (avoid pure #fff/#000)
  - Soft body text: `#4a5568` on light, `#bfd8d5` on dark
- **Fonts:** Display = **Libre Baskerville** (serif); Body = **Public Sans** (sans). Both Google Fonts.
- **Tagline:** "Turn caring into hours — all the way to Gold."
- **Tiers (PVSA):** Kids (Gr 2–5) 26/50/75 · Teens (Gr 6–10) 50/75/100 · Young Adults (Gr 11–12) 100/175/250.
- **Site / contact:** https://vsa.medinaacademy.org · mcc@medinaacademy.org
- Reusable assets built this project live in the session scratchpad: newsletter header, QR code, flyer, and the overview slide deck.

## Workflow
- Develop on branch `claude/modest-cerf-u4r29f`; commit + push there. Don't open PRs unless asked.
- Prefer promoting to production only after testing (staging setup recommended: 2nd Replit deploy + separate Neon DB branch).
- Do NOT put model identifiers in commits/PRs/code.
