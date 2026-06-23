# Volunteer Service Management System (VSMS)

A full-stack volunteer service management platform where participants log hours, supervisors approve/reject submissions, and admins manage events and users.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET` (JWT signing)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui (artifact: `vsms`)
- API: Express 5 (artifact: `api-server`)
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- Auth: JWT via `jsonwebtoken`, stored in localStorage with 30-min inactivity timeout
- API codegen: Orval (from OpenAPI spec in `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)
- Password hashing: `bcryptjs` (no native build required)

## Where things live

- `lib/api-spec/openapi.yaml` — **source of truth for all API contracts**
- `lib/api-spec/orval.config.ts` — Orval codegen config (baseUrl: `/api`)
- `lib/db/src/schema/` — Drizzle DB schemas (users, events, submissions)
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod validation schemas
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — JWT middleware
- `artifacts/vsms/src/pages/` — React page components by role
- `artifacts/vsms/src/hooks/use-auth.tsx` — auth state + session management
- `artifacts/vsms/src/components/layout.tsx` — sidebar layout (role-aware nav)

## Architecture decisions

- **Contract-first API**: OpenAPI spec → Orval codegen → typed React Query hooks + Zod schemas. Never hand-write API fetch calls.
- **JWT in localStorage**: 30-minute inactivity timer resets on user activity. Token injected via global `window.fetch` override in `use-auth.tsx`.
- **Role-based routing**: Three roles — `participant`, `supervisor`, `admin`. `ProtectedRoute` component enforces role access and redirects appropriately.
- **bcryptjs over bcrypt**: Avoids native build requirements in the Replit environment.
- **Drizzle ORM**: Schema-first with `push` for dev migrations. Use `pnpm --filter @workspace/db run push` to sync schema after changes.

## Product

- **Participants**: View dashboard (hour totals, pending submissions), browse calendar events, claim hours for past events, view submission history
- **Supervisors**: Review pending hour claims (approve/reject with comments), view review history
- **Admins**: System-wide dashboard with stats, user management (create/delete), create volunteer events

## Seed Accounts (for testing)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vsms.org | Admin1234! |
| Supervisor | sarah.jones@vsms.org | Super1234! |
| Participant | john.doe@example.com | Volunteer1! |
| Participant | emily.chen@example.com | Volunteer2! |

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any schema change in `lib/db`, run `pnpm run typecheck:libs` before leaf artifact checks.
- Express 5 types `req.params` values as `string | string[]` — always cast: `req.params as { paramName: string }` before using in Drizzle `eq()`.
- The orval codegen prepends `/api` to all spec paths (configured in `orval.config.ts` `baseUrl`). Routes in the Express router must start with `/v1/...` since the app mounts the router at `/api`.
- Correct URL pattern: `GET /api/v1/dashboard/participant` (frontend → proxy → Express `/api` → router `/v1/dashboard/participant`)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
