import { pgTable, uuid, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// The allowlist of pre-approved nonprofits a participant may log outside
// (external) volunteer hours for. A Super Admin curates this list; external
// submissions must reference one of these organizations.
export const nonprofitsTable = pgTable("nonprofits", {
  nonprofitId: uuid("nonprofit_id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 150 }).unique().notNull(),
  // Optional EIN (tax id) for verification / the service record.
  ein: varchar("ein", { length: 20 }),
  website: varchar("website", { length: 255 }),
  // When false, hidden from the submission dropdown (kept for historical rows).
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNonprofitSchema = createInsertSchema(nonprofitsTable).omit({
  nonprofitId: true,
  createdAt: true,
});
export type InsertNonprofit = z.infer<typeof insertNonprofitSchema>;
export type Nonprofit = typeof nonprofitsTable.$inferSelect;
