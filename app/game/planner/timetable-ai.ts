import { parseTimetableResult, TIMETABLE_PROMPT, type TimetableResult } from "./timetable-import.ts";

export const TIMETABLE_MODEL = "deepseek-flash";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const WEB_KEY_STORAGE = "oh-deepseek-api-key";
const IMAGE_LONGEST_SIDE = 2000;

export type TimetableImage = { dataUrl: string };

// The key is the player's own and never enters `berry-*` saves, so backups and sync never carry it.
export const aiKey = {
  async has() {
    const desktop = window.gameUpdater?.aiKey;
    if (desktop) return desktop.has();
    try { return Boolean(window.localStorage.getItem(WEB_KEY_STORAGE)); } catch { return false; }
  },
  async get() {
    const desktop = window.gameUpdater?.aiKey;
    if (desktop) return desktop.get();
    try { return window.localStorage.getItem(WEB_KEY_STORAGE); } catch { return null; }
  },
  async set(key: string) {
    const desktop = window.gameUpdater?.aiKey;
    if (desktop) { await desktop.set(key); return; }
    window.localStorage.setItem(WEB_KEY_STORAGE, key);
  },
  async clear() {
    const desktop = window.gameUpdater?.aiKey;
    if (desktop) { await desktop.clear(); return; }
    try { window.localStorage.removeItem(WEB_KEY_STORAGE); } catch { /* Nothing stored. */ }
  },
};

/** Re-encodes a screenshot so the request stays small while timetable text stays legible. */
export async function prepareTimetableImage(file: Blob): Promise<TimetableImage> {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张图片");
  if (file.size > 30_000_000) throw new Error("图片太大了，请换一张不超过 30 MB 的截图");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, IMAGE_LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("图片处理失败"); }
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return { dataUrl: canvas.toDataURL("image/jpeg", .92) };
}

function statusMessage(status: number, detail: string) {
  if (status === 401) return "API Key 无效，请点“更换 API Key”重新填写";
  if (status === 402) return "DeepSeek 账户余额不足，请充值后再试";
  if (status === 429) return "请求太频繁了，请稍等一会儿再试";
  if (status === 400 || status === 422) return `识别请求被拒绝：${detail || "请换一张截图再试"}`;
  return `DeepSeek 服务暂时出错（${status}），请稍后再试`;
}

async function requestOnce(apiKey: string, image: TimetableImage, signal?: AbortSignal) {
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_ENDPOINT, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TIMETABLE_MODEL,
        max_tokens: 8000,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: TIMETABLE_PROMPT },
          { role: "user", content: [
            { type: "image_url", image_url: { url: image.dataUrl, detail: "high" } },
            { type: "text", text: "请整理这张课表，按上面的 JSON 格式输出。" },
          ] },
        ],
      }),
    });
  } catch {
    if (signal?.aborted) throw new Error("已取消识别");
    throw new Error("连不上 DeepSeek 服务，请检查网络后再试");
  }
  const body = await response.json().catch(() => null) as { error?: { message?: string }; choices?: { finish_reason?: string; message?: { content?: string | null } }[] } | null;
  if (!response.ok) throw new Error(statusMessage(response.status, body?.error?.message ?? ""));
  const choice = body?.choices?.[0];
  if (choice?.finish_reason === "length") throw new Error("课表内容太多，请分成两张截图分别导入");
  return choice?.message?.content?.trim() ?? "";
}

export async function recognizeTimetable(image: TimetableImage, signal?: AbortSignal): Promise<TimetableResult> {
  const apiKey = await aiKey.get();
  if (!apiKey) throw new Error("还没有填写 API Key");
  // JSON mode can occasionally return blank content; one retry is enough in practice.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await requestOnce(apiKey, image, signal);
    if (!text) continue;
    try { return parseTimetableResult(JSON.parse(text)); } catch { /* Retry once with a fresh answer. */ }
  }
  throw new Error("识别结果格式不对，请重试一次");
}
