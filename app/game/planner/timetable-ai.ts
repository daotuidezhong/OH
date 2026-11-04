import { parseTimetableResult, type TimetableResult } from "./timetable-import.ts";

const SHARED_ENDPOINT = "https://berry-workout-island.light-gnat-9329.chatgpt.site/api/timetable-recognition";
const IMAGE_LONGEST_SIDE = 2000;

export type TimetableImage = { dataUrl: string };

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

export async function recognizeTimetable(image: TimetableImage, signal?: AbortSignal): Promise<TimetableResult> {
  let response: Response;
  try {
    response = await fetch(window.location.protocol === "berry:" ? SHARED_ENDPOINT : "/api/timetable-recognition", {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(70_000)]) : AbortSignal.timeout(70_000),
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: image.dataUrl }),
    });
  } catch {
    if (signal?.aborted) throw new Error("已取消识别");
    throw new Error("连不上课表识别服务，请检查网络后再试");
  }
  const body = await response.json().catch(() => null) as { error?: string; courses?: unknown[] } | null;
  if (!response.ok) throw new Error(body?.error || "课表识别暂时不可用，请稍后再试");
  if (!Array.isArray(body?.courses)) throw new Error("识别结果格式不对，请重试一次");
  return parseTimetableResult(body);
}
