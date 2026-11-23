// OH 放映厅像素画：温馨的家庭影院。房间和座位都画在 384×216 的像素画布上，再整体放大。
// 房间（静态 + 闪烁的小灯）与座位层（玩偶、转头、牵手）分开画，座位层只在状态变化或动画时重绘。

export const W = 384;
export const H = 216;
/** 银幕内框（B站画面贴在这里），16:9。 */
export const SCREEN = { x: 112, y: 18, w: 160, h: 90 };
export const SEATS = { left: 150, right: 234 } as const;
export type Side = keyof typeof SEATS;
/**
 * 座位层整体下移的距离：真实应用里 B站画面是叠在最上层的原生视图，
 * 玩偶、气泡、爱心都必须落在银幕框下沿（y ≈ 115）以下，不能被画面盖住。
 */
export const SEAT_DY = 14;
/** 气泡挂点（头的外侧）、爱心位置，单位：像素画坐标。 */
export const BUBBLE_Y = 150;
export const HEART = { x: 192, y: 127 };
/** 银幕框（含灯带）的最低处，座位层的任何东西都不能高过它。 */
export const SCREEN_BOTTOM = SCREEN.y + SCREEN.h + 8;
/** 玩偶最高处（蝴蝶结、耳机头带顶端），座位层坐标。 */
export const DOLL_TOP = 106;
const TABLE_X = 192;

type Ctx = CanvasRenderingContext2D;

// ---------- 调色板 ----------
const C = {
  ink: "#1d0d0c",
  wallTop: "#2e1a18", wall: "#4a2b25", wallLight: "#5c362d", plank: "#2a1714",
  base: "#2a1512", floor: "#3a221c", floorLight: "#4a2c23", floorLine: "#24130f",
  rug: "#d8b59c", rugMid: "#c99d88", rugEdge: "#b07a70", rugPink: "#e5a0a6",
  valance: "#8e1f2b", valanceDark: "#5e1019", curtain: "#a3283a", curtainDark: "#661520", curtainLight: "#c8434f",
  gold: "#efbd5e", goldDark: "#a8762c", goldLight: "#ffe2a0",
  frame: "#24161a", frameEdge: "#3e2629", frameLight: "#5a3a3a",
  wood: "#6b3f2a", woodLight: "#8a5536", woodDark: "#45261a", woodDeep: "#2f190f",
  metal: "#3a2c28", metalLight: "#6b5650", glass: "#ffd890", glassLight: "#fff2c8",
  chair: "#9e2432", chairLight: "#c33c48", chairHi: "#dd5a64", chairDark: "#6a1520", chairDeep: "#45101a",
  plaidRed: "#c9454d", plaidCream: "#f2e6dc", plaidRedDark: "#93303a",
  plaidBlue: "#6f8fc9", plaidBlueCream: "#e8eef8", plaidBlueDark: "#4c68a0",
  pink: "#fbdde3", pinkMid: "#f1c0cb", pinkShade: "#da9aab", pinkLine: "#8a4c5c",
  bow: "#ff93b4", bowDark: "#d9607f", bowLight: "#ffc6d6",
  white: "#fbf8f2", whiteMid: "#ebe5dc", whiteShade: "#cfc6b9", whiteLine: "#75695f",
  phoneBand: "#3a3a4c", phoneBandLight: "#5d5d74", phoneCup: "#7fb0e8", phoneCupDark: "#4a78b8", phoneCupLight: "#c7e1ff", phoneRing: "#eef4ff",
  blush: "#ff9fb1",
  popRed: "#e04a4a", popWhite: "#fff4ea", popcorn: "#ffe7aa", popcornShade: "#f0c868",
  cup: "#eceef4", cupShade: "#c5c8d6", straw: "#ff6f8f",
};

// ---------- 像素工具 ----------
function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function dot(ctx: Ctx, x: number, y: number, color: string) {
  rect(ctx, x, y, 1, 1, color);
}

/** 按行扫描填充椭圆；shade 按行返回颜色（用来做上亮下暗的体积感）。 */
function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, shade: string | ((row: number, x0: number, x1: number) => string)) {
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
    const dy = (y + 0.5 - cy) / ry;
    if (Math.abs(dy) > 1) continue;
    const half = rx * Math.sqrt(1 - dy * dy);
    const x0 = Math.round(cx - half);
    const x1 = Math.round(cx + half);
    if (x1 <= x0) continue;
    rect(ctx, x0, y, x1 - x0, 1, typeof shade === "string" ? shade : shade((y - (cy - ry)) / (2 * ry), x0, x1));
  }
}

/** 带描边、三段明暗的体积椭圆。 */
function blob(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, light: string, mid: string, dark: string, outline: string) {
  ellipse(ctx, cx, cy, rx + 1, ry + 1, outline);
  ellipse(ctx, cx, cy, rx, ry, (t) => (t < 0.3 ? light : t < 0.72 ? mid : dark));
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string) {
  for (let row = 0; row < h; row += 1) {
    const inset = row < r ? r - Math.round(Math.sqrt(r * r - (r - row - 0.5) ** 2)) : row >= h - r ? r - Math.round(Math.sqrt(r * r - (row - (h - r) + 0.5) ** 2)) : 0;
    rect(ctx, x + inset, y + row, w - inset * 2, 1, color);
  }
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, width = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    rect(ctx, x - (width - 1) / 2, y - (width - 1) / 2, width, width, color);
  }
}

function star(ctx: Ctx, cx: number, cy: number, color: string, light: string) {
  const rows = [[0, 0], [-1, 1], [-1, 1], [-4, 4], [-3, 3], [-2, 2], [-2, 2], [-3, -1, 1, 3], [-3, -2, 2, 3]];
  rows.forEach((spans, index) => {
    for (let i = 0; i < spans.length; i += 2) rect(ctx, cx + spans[i], cy - 4 + index, spans[i + 1] - spans[i] + 1, 1, color);
  });
  dot(ctx, cx, cy - 2, light);
  dot(ctx, cx - 1, cy, light);
}

function plaid(ctx: Ctx, x: number, y: number, w: number, h: number, base: string, stripe: string, dark: string) {
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const a = col % 6 < 2;
      const b = row % 6 < 2;
      dot(ctx, x + col, y + row, a && b ? dark : a || b ? stripe : base);
    }
  }
}

// ---------- 房间 ----------
function drawWallAndFloor(ctx: Ctx) {
  for (let y = 0; y < 160; y += 1) rect(ctx, 0, y, W, 1, y < 30 ? C.wallTop : C.wall);
  for (let x = 0; x < W; x += 12) {
    rect(ctx, x, 12, 1, 146, C.plank);
    rect(ctx, x + 1, 12, 1, 146, C.wallLight);
    for (let y = 26 + ((x * 7) % 30); y < 150; y += 38) rect(ctx, x + 5, y, 2, 1, C.plank);
  }
  // 顶部阴影（幔帐下方）
  for (let y = 12; y < 30; y += 2) rect(ctx, 0, y, W, 1, "rgba(20,8,8,0.35)");
  rect(ctx, 0, 156, W, 5, C.base);
  rect(ctx, 0, 156, W, 1, C.woodLight);
  for (let y = 161, step = 3; y < H; y += step, step += 1) {
    rect(ctx, 0, y, W, step, (y / 3) % 2 < 1 ? C.floor : C.floorLight);
    rect(ctx, 0, y, W, 1, C.floorLine);
  }
  // 地毯
  ellipse(ctx, 192, 203, 132, 23, C.rugEdge);
  ellipse(ctx, 192, 203, 128, 21, C.rug);
  ellipse(ctx, 192, 203, 116, 17, C.rugPink);
  ellipse(ctx, 192, 203, 113, 15, C.rug);
  ellipse(ctx, 192, 203, 92, 10, C.rugMid);
  ellipse(ctx, 192, 203, 89, 9, C.rug);
}

function drawScreenFrame(ctx: Ctx) {
  const { x, y, w, h } = SCREEN;
  roundRect(ctx, x - 7, y - 7, w + 14, h + 14, 3, C.ink);
  roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 3, C.frameEdge);
  rect(ctx, x - 5, y - 5, w + 10, h + 10, C.frame);
  rect(ctx, x - 5, y - 5, w + 10, 1, C.frameLight);
  rect(ctx, x - 1, y - 1, w + 2, h + 2, "#0a0506");
  rect(ctx, x, y, w, h, "#11161f");
  // 屏幕下沿的暖色灯带
  rect(ctx, x - 4, y + h + 6, w + 8, 1, C.goldLight);
  rect(ctx, x - 4, y + h + 7, w + 8, 1, C.gold);
}

function drawValanceAndLights(ctx: Ctx, t: number) {
  rect(ctx, 0, 0, W, 9, C.valance);
  rect(ctx, 0, 0, W, 2, C.valanceDark);
  for (let x = 0; x < W; x += 16) {
    ellipse(ctx, x + 8, 9, 8, 4, C.valance);
    rect(ctx, x, 9, 1, 3, C.valanceDark);
  }
  for (let x = 0; x < W; x += 3) dot(ctx, x, 12 + ((x / 3) % 2), C.gold);
  // 串灯
  for (let x = 6; x < W; x += 11) {
    const y = 16 + Math.round(2 * Math.sin(x / 19));
    dot(ctx, x, y - 1, C.ink);
    const on = Math.sin(t / 420 + x * 1.7) > -0.55;
    rect(ctx, x - 1, y, 2, 2, on ? C.glassLight : C.goldDark);
  }
  // 挂着的小星星
  for (const [sx, top, len] of [[70, 13, 26], [84, 13, 14], [314, 13, 26], [300, 13, 14]]) {
    rect(ctx, sx, top, 1, len, C.goldDark);
    star(ctx, sx, top + len + 4, C.gold, C.goldLight);
  }
}

function drawCurtain(ctx: Ctx, flip: boolean) {
  const xOf = (x: number) => (flip ? W - 1 - x : x);
  for (let y = 9; y < 172; y += 1) {
    // 上宽下收：在系带处收到最窄，下面再散开
    const tie = 112;
    const width = y < tie ? 48 - ((y - 9) / (tie - 9)) * 20 : 28 + ((y - tie) / (172 - tie)) * 16;
    for (let x = 0; x < width; x += 1) {
      const fold = Math.sin((x / width) * Math.PI * 4.2 + (y < tie ? 0 : 1.1));
      const color = x > width - 2 ? C.curtainDark : fold > 0.55 ? C.curtainLight : fold < -0.5 ? C.curtainDark : C.curtain;
      dot(ctx, xOf(x), y, color);
    }
  }
  // 金色系带 + 流苏
  for (let x = 0; x < 30; x += 1) dot(ctx, xOf(x), 112 + (x % 4 === 0 ? 1 : 0), C.gold);
  rect(ctx, xOf(flip ? 34 : 30), 110, 4, 5, C.goldDark);
  for (let i = 0; i < 4; i += 1) rect(ctx, xOf(flip ? 35 - i : 30 + i), 115, 1, 9, C.gold);
}

function drawLantern(ctx: Ctx, cx: number, t: number, seed: number) {
  rect(ctx, cx - 1, 52, 2, 6, C.metal);
  rect(ctx, cx - 6, 52, 7, 2, C.metal);
  rect(ctx, cx - 4, 58, 8, 2, C.metal);
  roundRect(ctx, cx - 5, 60, 10, 15, 2, C.metal);
  const flicker = Math.sin(t / 260 + seed) * 0.5 + Math.sin(t / 97 + seed * 2) * 0.5 > 0.7;
  rect(ctx, cx - 4, 61, 8, 13, flicker ? C.glass : C.glassLight);
  rect(ctx, cx - 1, 61, 2, 13, C.metal);
  rect(ctx, cx - 4, 67, 8, 1, C.metal);
  rect(ctx, cx - 5, 75, 10, 2, C.metal);
  rect(ctx, cx - 2, 77, 4, 2, C.metal);
}

function drawFrames(ctx: Ctx) {
  // 场记板
  rect(ctx, 60, 84, 30, 22, C.woodDark);
  rect(ctx, 61, 85, 28, 20, C.woodLight);
  rect(ctx, 63, 87, 24, 16, "#2a2224");
  rect(ctx, 64, 92, 22, 10, "#3c3436");
  for (let x = 64; x < 86; x += 4) rect(ctx, x, 88, 2, 3, "#e8e2d8");
  rect(ctx, 66, 95, 10, 1, "#e8e2d8");
  rect(ctx, 66, 98, 14, 1, "#e8e2d8");
  // 胶片盘
  rect(ctx, 292, 86, 28, 28, C.woodDark);
  rect(ctx, 293, 87, 26, 26, C.woodLight);
  rect(ctx, 295, 89, 22, 22, "#f1e6d4");
  ellipse(ctx, 306, 100, 9, 9, "#3a3434");
  ellipse(ctx, 306, 100, 8, 8, "#6a6262");
  for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) ellipse(ctx, 306 + dx, 100 + dy, 2, 2, "#f1e6d4");
  ellipse(ctx, 306, 100, 1.5, 1.5, "#3a3434");
}

function drawBookshelf(ctx: Ctx, t: number) {
  const x = 42;
  const y = 122;
  rect(ctx, x, y, 54, 50, C.woodDeep);
  rect(ctx, x + 1, y + 1, 52, 48, C.wood);
  rect(ctx, x + 1, y + 1, 52, 2, C.woodLight);
  for (const shelf of [y + 17, y + 33]) rect(ctx, x + 2, shelf, 50, 2, C.woodDark);
  rect(ctx, x + 3, y + 3, 48, 14, C.woodDeep);
  rect(ctx, x + 3, y + 19, 48, 14, C.woodDeep);
  rect(ctx, x + 3, y + 35, 48, 13, C.woodDeep);
  const books = ["#c94f4f", "#e0b25a", "#5f8fbf", "#7ba86a", "#d98aa0", "#a56fc0", "#e8d6b0", "#4f7f8f"];
  let bx = x + 4;
  books.forEach((color, index) => {
    const h = 10 + (index % 3) * 2;
    rect(ctx, bx, y + 17 - h, 4, h, color);
    rect(ctx, bx, y + 17 - h, 1, h, "rgba(255,255,255,0.25)");
    bx += index === 4 ? 9 : 5;
  });
  bx = x + 6;
  books.slice().reverse().forEach((color, index) => {
    if (index > 5) return;
    const h = 9 + ((index + 1) % 3) * 2;
    rect(ctx, bx, y + 33 - h, 4, h, color);
    bx += 5;
  });
  rect(ctx, x + 36, y + 24, 12, 9, "#e8d6b0");
  rect(ctx, x + 36, y + 24, 12, 2, "#c9a884");
  // 下层抽屉
  rect(ctx, x + 4, y + 37, 46, 10, C.woodLight);
  rect(ctx, x + 25, y + 41, 4, 2, C.gold);
  // 顶上睡觉的小猫
  blob(ctx, x + 18, y - 5, 11, 5, "#f7c08a", "#e8984f", "#c5743a", C.ink);
  ellipse(ctx, x + 10, y - 7, 5, 4, "#f7c08a");
  rect(ctx, x + 6, y - 12, 2, 3, "#e8984f");
  rect(ctx, x + 11, y - 12, 2, 3, "#e8984f");
  rect(ctx, x + 8, y - 7, 2, 1, C.ink);
  rect(ctx, x + 18, y - 9, 6, 1, "#c5743a");
  rect(ctx, x + 14, y - 3, 6, 1, "#fff2e0");
  line(ctx, x + 28, y - 2, x + 33, y - 6, "#e8984f", 2);
  // 星星台灯
  const glow = Math.sin(t / 900) > -0.2;
  rect(ctx, x + 41, y - 4, 6, 4, C.woodDark);
  star(ctx, x + 44, y - 10, glow ? C.goldLight : C.gold, "#fffbe8");
  // 垂下来的绿植
  rect(ctx, x - 2, y - 7, 9, 7, "#b06a4a");
  rect(ctx, x - 2, y - 7, 9, 1, "#d08a64");
  for (let i = 0; i < 46; i += 1) {
    const vx = x + Math.round(Math.sin(i / 4) * 2) - (i > 20 ? 1 : 0);
    dot(ctx, vx, y + i - 4, "#3f7a3e");
    if (i % 4 === 0) { rect(ctx, vx - 2, y + i - 4, 2, 2, "#5fa057"); rect(ctx, vx + 1, y + i - 3, 2, 2, "#4c8f48"); }
  }
  for (const [lx, ly] of [[x - 4, y - 10], [x + 2, y - 11], [x + 6, y - 9], [x - 1, y - 12]]) rect(ctx, lx, ly, 3, 3, "#5fa057");
}

function drawCabinetAndProjector(ctx: Ctx, t: number) {
  const x = 296;
  const y = 138;
  rect(ctx, x, y, 48, 34, C.woodDeep);
  rect(ctx, x + 1, y + 1, 46, 32, C.wood);
  rect(ctx, x, y, 48, 3, C.woodLight);
  for (const dy of [6, 19]) {
    rect(ctx, x + 4, y + dy, 40, 11, C.woodDark);
    rect(ctx, x + 5, y + dy + 1, 38, 9, C.woodLight);
    rect(ctx, x + 22, y + dy + 4, 4, 2, C.gold);
  }
  rect(ctx, x + 3, y + 34, 3, 4, C.woodDeep);
  rect(ctx, x + 42, y + 34, 3, 4, C.woodDeep);
  // 复古放映机
  rect(ctx, x + 10, y - 14, 26, 14, C.ink);
  rect(ctx, x + 11, y - 13, 24, 12, "#4a4044");
  rect(ctx, x + 11, y - 13, 24, 2, "#6a5e62");
  rect(ctx, x + 2, y - 10, 9, 6, "#3a3236");
  ellipse(ctx, x + 2, y - 7, 2, 3, C.glassLight);
  const spin = Math.floor(t / 160) % 4;
  for (const rx of [x + 16, x + 30]) {
    ellipse(ctx, rx, y - 20, 7, 7, C.ink);
    ellipse(ctx, rx, y - 20, 6, 6, "#7a7072");
    ellipse(ctx, rx, y - 20, 2, 2, C.ink);
    const angle = (spin * Math.PI) / 2;
    rect(ctx, rx + Math.round(Math.cos(angle) * 4) - 1, y - 20 + Math.round(Math.sin(angle) * 4) - 1, 2, 2, "#2a2426");
  }
  rect(ctx, x + 16, y - 14, 1, 1, C.ink);
  // 小相框
  rect(ctx, x - 2, y - 12, 10, 12, C.woodDark);
  rect(ctx, x - 1, y - 11, 8, 10, "#ffd9c0");
  ellipse(ctx, x + 3, y - 6, 2, 2, "#e88a8a");
  // 篮子里的小鸡
  blob(ctx, x + 14, y + 37, 10, 8, "#fff3a0", "#ffd84a", "#e8b030", C.ink);
  rect(ctx, x + 10, y + 34, 2, 2, C.ink);
  rect(ctx, x + 16, y + 34, 2, 2, C.ink);
  rect(ctx, x + 13, y + 37, 3, 2, "#ff9a3a");
  rect(ctx, x + 8, y + 38, 2, 1, C.blush);
  rect(ctx, x + 19, y + 38, 2, 1, C.blush);
  roundRect(ctx, x + 1, y + 40, 28, 12, 3, "#8a5a2e");
  for (let i = 0; i < 28; i += 3) rect(ctx, x + 1 + i, y + 41, 1, 10, "#a8763e");
  rect(ctx, x + 1, y + 40, 28, 2, "#b8864a");
  // 格子抱枕
  plaid(ctx, x + 32, y + 30, 20, 16, C.plaidCream, C.plaidRed, C.plaidRedDark);
  rect(ctx, x + 32, y + 30, 20, 1, C.ink);
  rect(ctx, x + 32, y + 45, 20, 1, C.ink);
}

/** 房间：每次调用整帧重画（画布很小，几毫秒）。t 用来让串灯、灯笼、台灯、放映机轻轻变化。 */
export function drawRoom(ctx: Ctx, t = 0) {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  drawWallAndFloor(ctx);
  drawFrames(ctx);
  drawScreenFrame(ctx);
  drawLantern(ctx, 84, t, 1);
  drawLantern(ctx, 300, t, 4);
  drawBookshelf(ctx, t);
  drawCabinetAndProjector(ctx, t);
  drawCurtain(ctx, false);
  drawCurtain(ctx, true);
  drawValanceAndLights(ctx, t);
}

// ---------- 座位、玩偶、牵手 ----------
export type SeatState = {
  partner: boolean;
  me: boolean;
  /** -1…1：转头方向（负 = 向左看，正 = 向右看） */
  yawLeft: number;
  yawRight: number;
  /** 0…1：牵手进度 */
  hold: number;
};

const ease = (p: number) => 1 - (1 - p) ** 3;

/** 内侧手臂：肩膀、爪子当前位置（座位层坐标，画到房间里时再加 SEAT_DY）。p = 0 时搭在扶手上，p = 1 时伸到小桌上方和对方牵在一起。 */
export function handPose(side: Side, p: number) {
  const cx = SEATS[side];
  const inward = side === "left" ? 1 : -1;
  const shoulder = { x: cx + inward * 17, y: 138 };
  const rest = { x: cx + inward * 28, y: 157 };
  const meet = { x: TABLE_X - inward * 3, y: 124 };
  const k = ease(Math.max(0, Math.min(1, p)));
  // 抬手时走一点弧线：先抬高再伸过去
  const lift = Math.sin(k * Math.PI) * 6;
  return {
    shoulder,
    paw: { x: rest.x + (meet.x - rest.x) * k, y: rest.y + (meet.y - rest.y) * k - lift },
  };
}

function drawChair(ctx: Ctx, cx: number, blanket: "red" | "blue", blanketSide: -1 | 1) {
  // 椅背（从后面看）
  roundRect(ctx, cx - 33, 147, 66, 75, 9, C.ink);
  roundRect(ctx, cx - 32, 148, 64, 74, 8, C.chair);
  for (let y = 150; y < H; y += 1) {
    const t = (y - 150) / 66;
    rect(ctx, cx - 30, y, 2, 1, C.chairLight);
    rect(ctx, cx + 28, y, 2, 1, C.chairDark);
    if (t > 0.55) rect(ctx, cx - 28, y, 56, 1, C.chairDark);
  }
  rect(ctx, cx - 26, 149, 52, 2, C.chairHi);
  // 绒面竖向缝线
  for (const dx of [-12, 12]) rect(ctx, cx + dx, 156, 1, 60, C.chairDark);
  // 扶手（圆滚滚）
  for (const dir of [-1, 1]) {
    const ax = cx + dir * 36;
    roundRect(ctx, ax - 9, 160, 18, 60, 7, C.ink);
    roundRect(ctx, ax - 8, 161, 16, 59, 6, dir < 0 ? C.chairLight : C.chair);
    ellipse(ctx, ax, 163, 8, 4, C.chairHi);
    rect(ctx, ax - 8, 175, 16, 1, C.chairDark);
  }
  // 搭着的格子毯
  const bx = cx + blanketSide * 30 - (blanketSide < 0 ? 14 : 0);
  if (blanket === "red") plaid(ctx, bx, 154, 18, 30, C.plaidCream, C.plaidRed, C.plaidRedDark);
  else plaid(ctx, bx, 154, 18, 30, C.plaidBlueCream, C.plaidBlue, C.plaidBlueDark);
  rect(ctx, bx, 154, 18, 1, C.ink);
  for (let i = 0; i < 18; i += 2) rect(ctx, bx + i, 184, 1, 3, blanket === "red" ? C.plaidRed : C.plaidBlue);
}

function drawTable(ctx: Ctx) {
  const x = TABLE_X;
  rect(ctx, x - 2, 158, 4, 50, C.woodDeep);
  rect(ctx, x - 1, 158, 1, 50, C.woodLight);
  ellipse(ctx, x, 206, 9, 3, C.woodDeep);
  ellipse(ctx, x, 157, 16, 4, C.woodDeep);
  ellipse(ctx, x, 156, 15, 3, C.woodLight);
  // 爆米花桶
  for (let row = 0; row < 16; row += 1) {
    const half = 6 + Math.floor(row / 5);
    for (let col = -half; col <= half; col += 1) dot(ctx, x - 5 + col, 154 - 16 + row + 1, Math.floor((col + 20) / 2) % 2 ? C.popRed : C.popWhite);
    dot(ctx, x - 5 - half - 1, 139 + row, C.ink);
    dot(ctx, x - 5 + half + 1, 139 + row, C.ink);
  }
  for (const [px, py] of [[-9, 137], [-5, 135], [-1, 136], [-7, 133], [-3, 132], [1, 134], [-11, 138], [3, 137]]) {
    ellipse(ctx, x + px, py, 2.4, 2.2, C.popcornShade);
    ellipse(ctx, x + px - 0.5, py - 0.5, 1.8, 1.6, C.popcorn);
  }
  // 饮料杯
  rect(ctx, x + 5, 142, 9, 13, C.ink);
  rect(ctx, x + 6, 143, 7, 11, C.cup);
  rect(ctx, x + 11, 143, 2, 11, C.cupShade);
  rect(ctx, x + 6, 147, 7, 3, "#ff8fa8");
  rect(ctx, x + 4, 141, 11, 2, "#fff");
  line(ctx, x + 10, 141, x + 13, 132, C.straw, 1);
}

function drawPinkDoll(ctx: Ctx, cx: number, yaw: number) {
  const shift = Math.round(yaw * 4);
  const cy = 132;
  blob(ctx, cx, cy, 24, 22, C.pink, C.pinkMid, C.pinkShade, C.pinkLine);
  // 毛绒高光与边缘的小绒毛
  for (const [dx, dy] of [[-10, 115], [-5, 113], [1, 113], [7, 115], [-12, 119]]) dot(ctx, cx + dx + shift, dy, "#fff8f5");
  // 垂耳：贴着头两侧垂下来；转头时，朝后的那只往后脑中间移、朝前的被挡住一部分
  for (const dir of [-1, 1]) {
    const toward = dir * yaw > 0; // 这只耳朵在转头方向那侧，转到前面去了
    const ex = cx + dir * 20 + (toward ? -dir * 3 : Math.round(yaw * 5));
    // 细长、下端圆圆的垂耳，从头顶两侧垂下来
    for (let row = 0; row < 32; row += 1) {
      const half = row < 4 ? 2 + row * 0.5 : row > 26 ? Math.max(1, 4 - (row - 26) * 0.6) : 4;
      const x0 = Math.round(ex - half + dir * row * 0.12);
      const w = Math.round(half * 2);
      rect(ctx, x0 - 1, 113 + row, w + 2, 1, C.pinkLine);
      rect(ctx, x0, 113 + row, w, 1, row > 22 ? C.pinkShade : toward ? C.pinkShade : C.pinkMid);
      if (row > 3 && row < 24) dot(ctx, x0 + (dir < 0 ? 1 : w - 2), 113 + row, C.pink);
    }
    rect(ctx, Math.round(ex - 4 + dir * 4), 146, 8, 1, C.pinkLine);
  }
  // 蝴蝶结
  const bx = cx - 8 + shift * 2;
  ellipse(ctx, bx - 6, 112, 6, 5, C.bowDark);
  ellipse(ctx, bx + 6, 112, 6, 5, C.bowDark);
  ellipse(ctx, bx - 6, 111.5, 5, 4, C.bow);
  ellipse(ctx, bx + 6, 111.5, 5, 4, C.bow);
  rect(ctx, bx - 2, 109, 4, 6, C.bowDark);
  rect(ctx, bx - 1, 110, 2, 4, C.bow);
  dot(ctx, bx - 8, 109, C.bowLight);
  dot(ctx, bx + 4, 109, C.bowLight);
  // 转头时，脸侧的腮红从轮廓边缘透出来
  if (Math.abs(yaw) > 0.4) {
    const side = Math.sign(yaw);
    rect(ctx, cx + side * 17 + (side > 0 ? 0 : -4), 137, 5, 2, C.blush);
  }
}

function drawWhiteDoll(ctx: Ctx, cx: number, yaw: number) {
  const shift = Math.round(yaw * 4);
  const cy = 132;
  blob(ctx, cx, cy, 25, 22, C.white, C.whiteMid, C.whiteShade, C.whiteLine);
  // 毛茸茸的边缘与高光
  for (const [dx, dy] of [[-10, 115], [-4, 112], [3, 112], [9, 115]]) dot(ctx, cx + dx + shift, dy, "#ffffff");
  // 头戴耳机：耳罩随转头绕头部移动，头带跟着变窄、偏移；转到前面的那只被头挡住
  const angle = yaw * 0.6;
  const cups = [-1, 1].map((dir) => ({ x: cx + Math.round(Math.sin((dir * Math.PI) / 2 + angle) * 25), front: Math.cos((dir * Math.PI) / 2 + angle) > -0.2 }));
  const left = Math.min(cups[0].x, cups[1].x);
  const right = Math.max(cups[0].x, cups[1].x);
  for (let x = left; x <= right; x += 1) {
    const k = (x - left) / Math.max(1, right - left);
    const y = Math.round(124 - Math.sin(k * Math.PI) * 17);
    rect(ctx, x, y, 1, 4, C.phoneBand);
    dot(ctx, x, y, C.phoneBandLight);
  }
  for (const cup of cups) {
    if (!cup.front) continue;
    const narrow = Math.abs(cup.x - cx) < 18;
    const rx = narrow ? 4 : 6;
    ellipse(ctx, cup.x, 128, rx + 1, 9, C.ink);
    ellipse(ctx, cup.x, 128, rx, 8, (t) => (t < 0.35 ? C.phoneCupLight : t < 0.75 ? C.phoneCup : C.phoneCupDark));
    ellipse(ctx, cup.x, 128, Math.max(1, rx - 3), 4, C.phoneRing);
    ellipse(ctx, cup.x, 128, Math.max(1, rx - 4), 3, C.phoneCup);
  }
  if (Math.abs(yaw) > 0.4) {
    const side = Math.sign(yaw);
    rect(ctx, cx + side * 18 + (side > 0 ? 0 : -4), 138, 5, 2, C.blush);
  }
}

function drawArm(ctx: Ctx, side: Side, p: number, light: string, mid: string, line: string) {
  const { shoulder, paw } = handPose(side, p);
  const steps = 14;
  for (let i = 0; i <= steps; i += 1) {
    const x = shoulder.x + ((paw.x - shoulder.x) * i) / steps;
    const y = shoulder.y + ((paw.y - shoulder.y) * i) / steps;
    ellipse(ctx, x, y, 4, 4, line);
  }
  for (let i = 0; i <= steps; i += 1) {
    const x = shoulder.x + ((paw.x - shoulder.x) * i) / steps;
    const y = shoulder.y + ((paw.y - shoulder.y) * i) / steps;
    ellipse(ctx, x, y, 3, 3, mid);
  }
  blob(ctx, paw.x, paw.y, 4, 4, light, mid, mid, line);
}

/** 座位层：两张扶手椅、小桌、玩偶（左 TA、右 我）和内侧手臂。 */
export function drawSeats(ctx: Ctx, state: SeatState) {
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.translate(0, SEAT_DY);
  // 玩偶在椅背后面露出上半身，先画
  if (state.partner) drawPinkDoll(ctx, SEATS.left, state.yawLeft);
  if (state.me) drawWhiteDoll(ctx, SEATS.right, state.yawRight);
  drawChair(ctx, SEATS.left, "red", -1);
  drawChair(ctx, SEATS.right, "blue", 1);
  drawTable(ctx);
  const both = state.partner && state.me;
  const p = both ? state.hold : 0;
  if (state.partner) drawArm(ctx, "left", p, C.pink, C.pinkMid, C.pinkLine);
  if (state.me) drawArm(ctx, "right", p, C.white, C.whiteMid, C.whiteLine);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
