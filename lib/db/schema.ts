import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import type { Card } from "@/lib/types";

export const cardSnapshots = sqliteTable("card_snapshots", {
  slug: text("slug").primaryKey(),
  displayRank: integer("display_rank").notNull(),
  payload: text("payload", { mode: "json" }).$type<Card>().notNull(),
  sourcePayload: text("source_payload", { mode: "json" }).$type<unknown>().notNull(),
  sourceUpdatedAt: text("source_updated_at"),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const cardSuppressions = sqliteTable("card_suppressions", {
  slug: text("slug").primaryKey(),
  reason: text("reason", { enum: ["missing", "unavailable", "unusable"] }).notNull(),
  fetchedAt: integer("fetched_at", { mode: "timestamp_ms" }).notNull(),
});

export const refreshRuns = sqliteTable("refresh_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  trigger: text("trigger", { enum: ["manual", "scheduled"] }).notNull(),
  status: text("status", { enum: ["running", "succeeded", "failed"] }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  requestCount: integer("request_count").notNull().default(0),
  cardCount: integer("card_count").notNull().default(0),
  error: text("error"),
});

export type CardSnapshotInsert = typeof cardSnapshots.$inferInsert;
export type CardSuppressionInsert = typeof cardSuppressions.$inferInsert;
export type RefreshRun = typeof refreshRuns.$inferSelect;
