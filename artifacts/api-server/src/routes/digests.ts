import { Router } from "express";
import { db, usersTable, emailDigestQueueTable } from "@workspace/db";
import { eq, inArray, asc } from "drizzle-orm";
import { sendDigest } from "../lib/email";

const router = Router();

// POST /api/v1/digests/flush — send each queued user's activity as one summary
// email, then clear the queue. Meant to be hit once a day by an external cron
// (Replit Scheduled Deployment, cron-job.org, etc.). Protected by a shared
// secret in the `x-digest-secret` header matching the DIGEST_SECRET env var.
// If DIGEST_SECRET isn't set, the endpoint is disabled (503) so it can't be
// abused before it's configured.
router.post("/v1/digests/flush", async (req, res) => {
  const secret = process.env["DIGEST_SECRET"];
  if (!secret) {
    res.status(503).json({ error: "Digest flushing is not configured (set DIGEST_SECRET)." });
    return;
  }
  if (req.header("x-digest-secret") !== secret) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  let items: { id: string; userId: string; line: string }[];
  try {
    items = await db
      .select({ id: emailDigestQueueTable.id, userId: emailDigestQueueTable.userId, line: emailDigestQueueTable.line })
      .from(emailDigestQueueTable)
      .orderBy(asc(emailDigestQueueTable.createdAt));
  } catch {
    res.status(503).json({ error: "Digest table not found — apply the database update (pnpm --filter db push) first." });
    return;
  }

  if (items.length === 0) {
    res.json({ recipients: 0, items: 0 });
    return;
  }

  const byUser = new Map<string, string[]>();
  for (const it of items) {
    const list = byUser.get(it.userId) ?? [];
    list.push(it.line);
    byUser.set(it.userId, list);
  }

  const userIds = [...byUser.keys()];
  const users = await db
    .select({ userId: usersTable.userId, email: usersTable.email, firstName: usersTable.firstName })
    .from(usersTable)
    .where(inArray(usersTable.userId, userIds));
  const userById = new Map(users.map((u) => [u.userId, u]));

  let recipients = 0;
  for (const [uid, lines] of byUser) {
    const u = userById.get(uid);
    if (u?.email) {
      await sendDigest(u.email, u.firstName ?? "", lines);
      recipients++;
    }
  }

  // Clear everything we just processed.
  await db.delete(emailDigestQueueTable).where(inArray(emailDigestQueueTable.id, items.map((i) => i.id)));

  res.json({ recipients, items: items.length });
});

export default router;
