import { parseTimetableResult, TIMETABLE_PROMPT } from "../app/game/planner/timetable-import.ts";

export const TIMETABLE_PATH = "/api/timetable-recognition";
const SITE_ORIGIN = "https://berry-workout-island.light-gnat-9329.chatgpt.site";
const MAX_BODY_BYTES = 6_000_000;
const DAY_MS = 86_400_000;

export type TimetableEnv = {
  DB: D1Database;
  DEEPSEEK_API_KEY?: string;
  TIMETABLE_DAILY_LIMIT?: string;
  TIMETABLE_IP_DAILY_LIMIT?: string;
};

async function boundedJson(body: ReadableStream<Uint8Array> | null, limit: number) {
  if (!body) throw new Error("empty body");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limit) { await reader.cancel(); throw new Error("body too large"); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode()) as unknown;
  } finally { reader.releaseLock(); }
}

function dailyLimit(value: string | undefined, fallback: number) {
  const number = Number(value);
  return value && Number.isInteger(number) && number >= 0 && number <= 100_000 ? number : fallback;
}

async function claimQuota(env: TimetableEnv, bucket: string, limit: number, expiresAt: number) {
  if (!limit) return false;
  const row = await env.DB.prepare(`INSERT INTO timetable_usage (bucket, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = timetable_usage.count + 1
    WHERE timetable_usage.count < ? RETURNING count`).bind(bucket, expiresAt, limit).first<{ count: number }>();
  return Boolean(row);
}

export async function handleTimetableRecognition(request: Request, env: TimetableEnv, fetchImpl: typeof fetch = fetch, now = Date.now()) {
  const origin = request.headers.get("origin");
  const allowed = !origin || [SITE_ORIGIN, "berry://game", new URL(request.url).origin].includes(origin);
  const headers: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (allowed && origin) headers["Access-Control-Allow-Origin"] = origin;
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (!allowed) return json({ error: "此来源无法使用课表识别" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } });
  if (request.method !== "POST") return json({ error: "请上传课表截图" }, 405);
  const key = env.DEEPSEEK_API_KEY?.trim();
  if (!key) return json({ error: "课表识别服务尚未配置，请稍后再试" }, 503);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "请上传课表截图" }, 415);
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return json({ error: "截图太大，请裁剪后再试" }, 413);
  let image: string;
  try {
    const payload = await boundedJson(request.body, MAX_BODY_BYTES) as { image?: unknown } | null;
    if (typeof payload?.image !== "string" || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(payload.image)) throw new Error("invalid image");
    image = payload.image;
    const prefix = atob(image.slice(image.indexOf(",") + 1, image.indexOf(",") + 17));
    if (!prefix.startsWith("\xff\xd8\xff")) throw new Error("invalid JPEG");
  } catch { return json({ error: "截图读取失败，请重新选择图片" }, 400); }

  try {
    const day = Math.floor(now / DAY_MS);
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    const hmacKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const digest = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`${day}|${ip}`));
    const ipHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const expiresAt = (day + 2) * DAY_MS;
    await env.DB.prepare("DELETE FROM timetable_usage WHERE expires_at < ?").bind(now).run();
    if (!await claimQuota(env, `ip:${day}:${ipHash}`, dailyLimit(env.TIMETABLE_IP_DAILY_LIMIT, 20), expiresAt)) return json({ error: "今天的课表识别次数已用完，请明天再试" }, 429);
    if (!await claimQuota(env, `all:${day}`, dailyLimit(env.TIMETABLE_DAILY_LIMIT, 200), expiresAt)) return json({ error: "今天的共用课表识别额度已用完，请明天再试" }, 429);

    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST", signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-flash", thinking: { type: "disabled" }, max_tokens: 8000, response_format: { type: "json_object" },
          messages: [{ role: "system", content: TIMETABLE_PROMPT }, { role: "user", content: [
            { type: "image_url", image_url: { url: image, detail: "high" } }, { type: "text", text: "请整理这张课表，按上面的 JSON 格式输出。" },
          ] }],
        }),
      });
      if (!response.ok) { await response.body?.cancel(); return json({ error: response.status === 429 ? "识别服务繁忙，请稍后再试" : "课表识别暂时不可用，请稍后再试" }, 503); }
      const body = await boundedJson(response.body, 256_000) as { choices?: { finish_reason?: string; message?: { content?: string } }[] };
      const choice = body?.choices?.[0];
      if (choice?.finish_reason === "length") return json({ error: "课表内容太多，请分成两张截图分别导入" }, 422);
      const content = choice?.message?.content?.trim();
      if (!content) continue;
      try { return json(parseTimetableResult(JSON.parse(content))); } catch { /* Retry one malformed JSON answer. */ }
    }
    return json({ error: "识别结果格式不正确，请重试" }, 502);
  } catch { return json({ error: "课表识别暂时不可用，请稍后再试" }, 503); }
}
