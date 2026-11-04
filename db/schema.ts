import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const checkins = sqliteTable("checkins", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  deviceId: text("device_id").notNull(),
  date: text("date").notNull(),
  activity: text("activity").notNull(),
  category: text("category").notNull().default("其他"),
  rating: integer("rating"),
  reward: integer("reward"),
  photoKey: text("photo_key"),
  photoWidth: integer("photo_width"),
  photoHeight: integer("photo_height"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_checkins_device_date_created").on(table.deviceId, table.date, table.createdAt)]);

export const timetableUsage = sqliteTable("timetable_usage", {
  bucket: text("bucket").primaryKey(),
  count: integer("count").notNull().default(0),
  expiresAt: integer("expires_at").notNull(),
}, (table) => [index("idx_timetable_usage_expiry").on(table.expiresAt)]);
