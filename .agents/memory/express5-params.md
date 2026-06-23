---
name: Express 5 params typing
description: Express 5 types req.params values as string | string[], not plain string — must cast before Drizzle eq()
---

In Express 5, `req.params` has type `ParamsDictionary` where values are `string | string[]`.
Drizzle's `eq()` function only accepts `string | SQLWrapper`, so passing a raw param causes TS2769.

**Why:** Breaking change from Express 4 (params were always `string`). Caught at typecheck time.

**How to apply:** Always cast destructured params: `const { userId } = req.params as { userId: string };`
