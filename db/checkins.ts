import { env } from "cloudflare:workers";

export type CheckinRecord = {
  id: number;
  date: string;
  content: string;
  category: string;
  rating: number | null;
  reward: number | null;
  createdAt: string;
  photo: { key: string; width: number; height: number } | null;
};

async function prepareCheckins() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    date TEXT NOT NULL,
    activity TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '其他',
    rating INTEGER,
    reward INTEGER,
    photo_key TEXT,
    photo_width INTEGER,
    photo_height INTEGER,
    created_at TEXT NOT NULL
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(checkins)").all<{ name: string }>();
  if (!columns.results.some((column) => column.name === "category")) await env.DB.prepare("ALTER TABLE checkins ADD category TEXT NOT NULL DEFAULT '其他'").run();
  if (!columns.results.some((column) => column.name === "rating")) await env.DB.prepare("ALTER TABLE checkins ADD rating INTEGER").run();
  if (!columns.results.some((column) => column.name === "reward")) await env.DB.prepare("ALTER TABLE checkins ADD reward INTEGER").run();
  if (!columns.results.some((column) => column.name === "photo_key")) await env.DB.prepare("ALTER TABLE checkins ADD photo_key TEXT").run();
  if (!columns.results.some((column) => column.name === "photo_width")) await env.DB.prepare("ALTER TABLE checkins ADD photo_width INTEGER").run();
  if (!columns.results.some((column) => column.name === "photo_height")) await env.DB.prepare("ALTER TABLE checkins ADD photo_height INTEGER").run();
  await env.DB.prepare("DROP INDEX IF EXISTS idx_checkins_device_date").run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_checkins_device_date_created ON checkins (device_id, date, created_at)").run();
}

export async function listCheckins(deviceId: string, beforeDate: string | null = null) {
  await prepareCheckins();
  const summary = await env.DB.prepare(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT date) AS totalDays FROM checkins WHERE device_id = ?",
  ).bind(deviceId).first<{ total: number; totalDays: number }>();
  const dates = await env.DB.prepare(
    `SELECT DISTINCT date FROM checkins WHERE device_id = ?${beforeDate ? " AND date < ?" : ""} ORDER BY date DESC LIMIT 3`,
  ).bind(...(beforeDate ? [deviceId, beforeDate] : [deviceId])).all<{ date: string }>();
  const pageDates = dates.results.slice(0, 2).map((row) => row.date);
  if (!pageDates.length) return { records: [], total: summary?.total ?? 0, totalDays: summary?.totalDays ?? 0, nextCursor: null };
  const result = await env.DB.prepare(
    `SELECT id, date, activity AS content, category, rating, reward, created_at AS createdAt, photo_key AS photoKey, photo_width AS photoWidth, photo_height AS photoHeight FROM checkins WHERE device_id = ? AND date IN (${pageDates.map(() => "?").join(", ")}) ORDER BY date DESC, created_at DESC, id DESC`,
  ).bind(deviceId, ...pageDates).all<CheckinRecord & { photoKey: string | null; photoWidth: number | null; photoHeight: number | null }>();
  return {
    records: result.results.map(({ photoKey, photoWidth, photoHeight, ...record }) => ({ ...record, photo: photoKey && photoWidth && photoHeight ? { key: photoKey, width: photoWidth, height: photoHeight } : null })),
    total: summary?.total ?? 0,
    totalDays: summary?.totalDays ?? 0,
    nextCursor: dates.results.length > 2 ? pageDates.at(-1)! : null,
  };
}

export async function countCheckinsForDate(deviceId: string, date: string) {
  await prepareCheckins();
  const result = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM checkins WHERE device_id = ? AND date = ?",
  ).bind(deviceId, date).first<{ count: number }>();
  return result?.count ?? 0;
}

export async function saveCheckin(deviceId: string, date: string, content: string, category: string, rating: number | null, reward: number | null, photo: { key: string; width: number; height: number } | null = null) {
  await prepareCheckins();
  const createdAt = new Date().toISOString();
  const result = await env.DB.prepare(`INSERT INTO checkins (device_id, date, activity, category, rating, reward, photo_key, photo_width, photo_height, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(deviceId, date, content, category, rating, reward, photo?.key ?? null, photo?.width ?? null, photo?.height ?? null, createdAt).run();
  const saved = await env.DB.prepare(
    "SELECT id, date, activity AS content, category, rating, reward, created_at AS createdAt, photo_key AS photoKey, photo_width AS photoWidth, photo_height AS photoHeight FROM checkins WHERE id = ? AND device_id = ?",
  ).bind(result.meta.last_row_id, deviceId).first<CheckinRecord & { photoKey: string | null; photoWidth: number | null; photoHeight: number | null }>();
  if (!saved) return null;
  const { photoKey, photoWidth, photoHeight, ...record } = saved;
  return { ...record, photo: photoKey && photoWidth && photoHeight ? { key: photoKey, width: photoWidth, height: photoHeight } : null };
}
