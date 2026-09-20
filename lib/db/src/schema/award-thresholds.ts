import { pgTable, uuid, integer, varchar, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationsTable } from "./organizations";

// Configurable Bronze/Silver/Gold hour thresholds for the awards competition.
// A row can be scoped by school level (elementary/middle/high) and/or by
// organization. Resolution for a participant picks the most specific matching
// row: (level+org) > (org) > (level) > global default > built-in 40/60/80.
export const awardThresholdsTable = pgTable(
  "award_thresholds",
  {
    awardThresholdId: uuid("award_threshold_id").primaryKey().defaultRandom(),
    // null level = applies to all grade levels.
    level: varchar("level", { length: 20 }), // "elementary" | "middle" | "high" | null
    // null org = applies to all organizations (and community).
    organizationId: uuid("organization_id").references(() => organizationsTable.organizationId, {
      onDelete: "cascade",
    }),
    bronze: integer("bronze").notNull(),
    silver: integer("silver").notNull(),
    gold: integer("gold").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqScope: unique().on(t.level, t.organizationId),
  }),
);

export const insertAwardThresholdSchema = createInsertSchema(awardThresholdsTable).omit({
  awardThresholdId: true,
  updatedAt: true,
});
export type InsertAwardThreshold = z.infer<typeof insertAwardThresholdSchema>;
export type AwardThreshold = typeof awardThresholdsTable.$inferSelect;
