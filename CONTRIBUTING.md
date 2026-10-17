# Contributing to the MedinaCares Volunteer Service Awards platform

This is **proprietary software owned by Medina Academy** (see [LICENSE](./LICENSE)).
It is not open source. Contributions are accepted **only** from people
authorized in writing by Medina Academy.

> **Before you are given any access**, you must have signed:
> 1. an **Intellectual-Property Assignment** (your work becomes Medina
>    Academy's property), and
> 2. a **Confidentiality / NDA** covering the code, the data, and any
>    credentials.
>
> A starting template is in
> [`docs/contributor-agreement-template.md`](./docs/contributor-agreement-template.md).
> It must be reviewed and finalized by Medina Academy's legal advisor.

---

## Golden rule: never touch production or real student data

The live app holds **personal data of minors** (grades 2–12), which carries
legal obligations (e.g. COPPA, and FERPA where applicable). Developers work
against **test data in a separate environment** and **never** receive
production database credentials or the production publish keys. Only Medina
Academy deploys to production.

## The workflow

```
your feature branch  →  pull request  →  review by Medina Academy  →  merge to main  →  MedinaCares publishes
```

1. **Get access.** After your agreements are signed, you are added as a
   GitHub collaborator (or you fork the repo). You receive **development**
   credentials only.
2. **Branch.** Create a feature branch off `main`:
   `git checkout -b feature/<short-name>`. Never commit directly to `main`.
3. **Build and test** against your own dev environment (see below).
4. **Open a pull request.** Describe what changed and how you tested it.
   Someone at Medina Academy reviews and merges. Do not merge your own PR.
5. **Never** publish/deploy to production, and never add real people's data.

## Development environment

This is a pnpm monorepo. Core commands:

```bash
pnpm install                                   # install dependencies
pnpm --filter @workspace/db exec tsc --build   # build shared libs first
pnpm --filter @workspace/api-zod exec tsc --build
pnpm --filter @workspace/api-client-react exec tsc --build

# typecheck
pnpm --filter @workspace/api-server exec tsc --noEmit
pnpm --filter @workspace/vsms exec tsc --noEmit

# build the frontend
PORT=8080 BASE_PATH=/ pnpm --filter @workspace/vsms run build
```

### Your own secrets (dev only)

Set these in your dev environment — **never** commit them, and never use the
production values:

- `DATABASE_URL` — point at your **own Neon dev branch**, not production.
- `SESSION_SECRET` — any random 32+ character string for local use.
- Email keys — leave unset, or use `EMAIL_MINIMAL=1` so the app doesn't send
  real email while you develop.
- `SEED_TEST_DATA=1` — seeds safe demo accounts so you have data to work with.

### Database changes

Schema lives in `lib/db/src/schema`. Apply changes to **your** database with
`pnpm --filter db push`. Never run migrations or scripts against production.

## Code expectations

- Match the style of the surrounding code; keep changes focused.
- Typecheck both apps before opening a PR.
- Do not add third-party services, trackers, or data exports without Medina
  Academy's approval — this app handles children's data.
- Do not put secrets, real names, or real data in commits, code, or the
  repository.

## Questions / access requests

Email **mcc@medinaacademy.org**.
