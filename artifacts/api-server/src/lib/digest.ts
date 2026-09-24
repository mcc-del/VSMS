import { db, usersTable, emailDigestQueueTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Route an activity notification for a *user* recipient. If that user opted into
 * the daily digest, the one-line summary is queued (the flush endpoint mails it
 * once a day); otherwise the immediate email (`sendNow`) is sent right away.
 * Users who turned activity emails off entirely get nothing.
 *
 * Recipients without a user account (e.g. an external supervisor, or a parent
 * email with no account yet) don't pass a userId — send those immediately.
 */
export async function notifyUser(opts: {
  userId?: string | null;
  category: string;
  line: string;
  sendNow: () => Promise<void>;
}): Promise<void> {
  const { userId, category, line, sendNow } = opts;
  if (userId) {
    // Activity opt-out (emailNotifications) — this column always exists.
    const [u] = await db
      .select({ notify: usersTable.emailNotifications })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (u && !u.notify) return;

    // Digest is opt-in and depends on the newer column/table. If the migration
    // hasn't been run yet, these reads/inserts throw — we swallow that and fall
    // through to sending immediately, so email keeps working without the push.
    try {
      const [d] = await db
        .select({ digest: usersTable.emailDigestDaily })
        .from(usersTable)
        .where(eq(usersTable.userId, userId))
        .limit(1);
      if (d?.digest) {
        await db.insert(emailDigestQueueTable).values({ userId, category, line });
        return;
      }
    } catch {
      /* digest column/table not migrated yet — send immediately */
    }
  }
  await sendNow();
}
