// 放映厅的纯规则：放映厅码、房间凭据、聊天与“牵手”消息的编码。主进程、放映厅页面和测试共用。

/** 去掉容易看错的 0/O、1/I/L。 */
export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;
/** “牵手”信号。不可见的分隔符开头，普通聊天不可能打出来。 */
export const HOLD_TOKEN = "\u2063OH:HAND";
export const CHAT_MAX_LENGTH = 80;

export type TheaterRole = "master" | "member";
export type TheaterConfig = { code: string; role: TheaterRole };

export function generateRoomCode(random: () => number = Math.random) {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length) % ROOM_CODE_ALPHABET.length];
  }
  return code;
}

/** 接受带空格、横线、小写的输入；不合法时返回 null。 */
export function normalizeRoomCode(input: string) {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== ROOM_CODE_LENGTH) return null;
  return [...code].every((char) => ROOM_CODE_ALPHABET.includes(char)) ? code : null;
}

export function formatRoomCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** 两个人用同一个放映厅码算出同一组 VideoTogether 房间名和密码。 */
export function roomCredentials(code: string) {
  return { name: `OH-THEATER-${code}`, password: `oh-${code.toLowerCase()}-together` };
}

export function isTheaterConfig(value: unknown): value is TheaterConfig {
  if (!value || typeof value !== "object") return false;
  const { code, role } = value as Record<string, unknown>;
  return typeof code === "string" && normalizeRoomCode(code) === code && (role === "master" || role === "member");
}

export type TheaterMessage = { kind: "hold" } | { kind: "chat"; text: string };

export function cleanChatText(text: string) {
  return text.replace(/[⁣\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LENGTH);
}

export function parseTheaterMessage(raw: unknown): TheaterMessage | null {
  if (typeof raw !== "string") return null;
  if (raw === HOLD_TOKEN) return { kind: "hold" };
  const text = cleanChatText(raw);
  return text ? { kind: "chat", text } : null;
}

/** 把银幕平均色变成房间灯光：太暗时保留一点底光，太艳时略微压低饱和度。 */
export function screenLight(ambient: number[] | null | undefined) {
  if (!ambient || ambient.length !== 3 || ambient.some((value) => !Number.isFinite(value))) return { rgb: "170 190 240", level: 0.45 };
  const [r, g, b] = ambient.map((value) => Math.min(255, Math.max(0, value)));
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const gray = (r + g + b) / 3;
  const lift = luminance < 0.25 ? (0.25 - luminance) * 255 : 0;
  const mix = (value: number) => Math.round(Math.min(255, (value * 0.8 + gray * 0.2) + lift));
  return { rgb: `${mix(r)} ${mix(g)} ${mix(b)}`, level: Math.max(0.18, Math.min(1, luminance * 1.3)) };
}
