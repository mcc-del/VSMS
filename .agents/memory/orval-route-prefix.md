---
name: Orval base URL + Express route prefix
description: How the /api prefix works between Orval codegen and the Express router
---

Orval config sets `baseUrl: "/api"` → generated hooks prepend `/api` to all OpenAPI paths.
Express app mounts the router at `app.use("/api", router)`.
Therefore Express route handlers must use `/v1/...` prefix (not `/api/v1/...`).

**Why:** If routes used `/api/v1/...` they would never match (Express strips the mount prefix before matching).

**How to apply:** Correct URL chain: frontend → `/api/v1/foo` → proxy → Express `/api` → router `/v1/foo`
When testing with curl: always use `/api/v1/foo`, never `/api/foo`.
