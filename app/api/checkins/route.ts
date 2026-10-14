import { getJournalReward } from "@/app/game/journal-reward";

const devicePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const photoKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/journal-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;
const categories = new Set(["运动", "学习", "工作", "饮食", "睡眠", "其他"]);
function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const deviceId = params.get("device") ?? "";
  const beforeDate = params.get("before");
  if (!devicePattern.test(deviceId)) return json({ error: "无效设备" }, 400);
  if (beforeDate !== null && (!datePattern.test(beforeDate) || Number.isNaN(Date.parse(`${beforeDate}T00:00:00`)))) return json({ error: "无效日期" }, 400);
  const { listCheckins } = await import("@/db/checkins");
  return json(await listCheckins(deviceId, beforeDate));
}

export async function POST(request: Request) {
  let body: { deviceId?: string; date?: string; content?: string; category?: string; rating?: number | null; reward?: number | null; photo?: { key?: string; width?: number; height?: number } | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "记录内容无效" }, 400);
  }
  const deviceId = body.deviceId ?? "";
  const date = body.date ?? "";
  const content = body.content?.trim() ?? "";
  const category = body.category ?? "其他";
  const rating = body.rating == null ? null : Math.round(body.rating);
  const requestedReward = body.reward == null ? null : Math.round(body.reward);
  const photoProvided = body.photo != null;
  const photo = body.photo?.key && Number.isInteger(body.photo.width) && Number.isInteger(body.photo.height)
    ? { key: body.photo.key, width: Number(body.photo.width), height: Number(body.photo.height) }
    : null;
  const validPhoto = !photoProvided || Boolean(photo
    && photo.key.startsWith(`${deviceId}/journal-`)
    && photoKeyPattern.test(photo.key)
    && photo.width > 0 && photo.height > 0
    && photo.width <= 1600 && photo.height <= 1600);
  if (!devicePattern.test(deviceId) || !datePattern.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`)) || !content || content.length > 300 || !categories.has(category) || !validPhoto || (rating !== null && (rating < 1 || rating > 10)) || (requestedReward !== null && (requestedReward < 0 || requestedReward > 23))) {
    return json({ error: "记录内容无效" }, 400);
  }
  if (photo) {
    const { journalPhotoExists } = await import("@/db/journal-photos");
    if (!await journalPhotoExists(photo.key)) return json({ error: "照片不存在，请重新选择" }, 400);
  }
  const { countCheckinsForDate, saveCheckin } = await import("@/db/checkins");
  const reward = body.reward === null ? null : getJournalReward((await countCheckinsForDate(deviceId, date)) + 1);
  const record = await saveCheckin(deviceId, date, content, category, rating, reward, photo);
  return record ? json({ record }) : json({ error: "保存失败" }, 500);
}
