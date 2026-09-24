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
    const [u] = await db
      .select({ digest: usersTable.emailDigestDaily, notify: usersTable.emailNotifications })
      .from(usersTable)
      .where(eq(usersTable.userId, userId))
      .limit(1);
    if (u && !u.notify) return; // opted out of activity emails entirely
    if (u?.digest) {
      await db.insert(emailDigestQueueTable).values({ userId, category, line });
      return;
    }
  }
  await sendNow();
}
