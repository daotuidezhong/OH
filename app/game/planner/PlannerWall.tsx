import { useEffect, useRef } from "react";
import { getTeachingWeek, PLANNER_SLOTS, visiblePlannerItems, weekDates, type PlannerColor, type PlannerItem, type PlannerState } from "./planner";

type Props = { open: boolean; planner: PlannerState; today: string; now: number; onOpen: (rect: DOMRect) => void };

// The calendar is drawn as pixel art at this resolution and scaled up with nearest-neighbour sampling,
// so it shares the grain of the painted room instead of looking like a web widget on top of it.
const ART_WIDTH = 96;
const ART_HEIGHT = 58;
const WALL_BARS_PER_SLOT = 2;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

// Colours sampled from the room art: the vinyl cabinet wood, the wall plaster and a muted brick red.
const PALETTE = {
  outline: "#4a2814", wood: "#a5622f", woodLight: "#c4834a", woodDark: "#7a4322", trim: "#d9b07a",
  paper: "#ecdcbf", paperLine: "#d9c29d", paperShade: "#dcc8a4", header: "#b4583f", headerLight: "#c8705a", headerDark: "#8a3c2a",
  ink: "#f4e4c6", number: "#8a6a55", weekend: "#b4583f", today: "#f2d595", todayEdge: "#c8783e", ring: "#9aa0a8", ringLight: "#d5d9de",
  pin: "#c9473d", pinLight: "#ec8a7a", pinDark: "#7a2a24", plus: "#b4583f",
};

const ITEM_COLORS: Record<PlannerColor, [string, string]> = {
  berry: ["#d47a7f", "#a8555c"], orange: ["#dd9450", "#b06c32"], sage: ["#87a877", "#5f7f52"],
  sky: ["#6f9cc0", "#4d7697"], lilac: ["#9a84bd", "#735e96"], cream: ["#d1ad4f", "#a58634"],
};

const GLYPHS: Record<string, string[]> = {
  "一": ["00000", "00000", "11111", "00000", "00000"], "二": ["01110", "00000", "00000", "00000", "11111"],
  "三": ["11111", "00000", "01110", "00000", "11111"], "四": ["11111", "10101", "10101", "11011", "11111"],
  "五": ["11111", "00100", "01110", "00110", "11111"], "六": ["00100", "11111", "00000", "01010", "10001"],
  "日": ["11111", "10001", "11111", "10001", "11111"],
  "0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "001", "010", "010"], "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"], A: ["010", "101", "111", "101", "101"], B: ["110", "101", "110", "101", "110"],
  C: ["011", "100", "100", "100", "011"], D: ["110", "101", "101", "101", "110"], E: ["111", "100", "110", "100", "111"],
  F: ["111", "100", "110", "100", "100"], G: ["011", "100", "101", "101", "011"], J: ["001", "001", "001", "101", "010"],
  L: ["100", "100", "100", "100", "111"], M: ["10001", "11011", "10101", "10001", "10001"], N: ["1001", "1101", "1011", "1001", "1001"],
  O: ["010", "101", "101", "101", "010"], P: ["110", "101", "110", "100", "100"], R: ["110", "101", "110", "101", "101"],
  S: ["011", "100", "010", "001", "110"], T: ["111", "010", "010", "010", "010"], U: ["101", "101", "101", "101", "111"],
  V: ["101", "101", "101", "101", "010"], W: ["10001", "10001", "10101", "10101", "01010"], Y: ["101", "101", "010", "010", "010"],
};

function textWidth(text: string) {
  return [...text].reduce((width, char) => width + (GLYPHS[char]?.[0].length ?? 3) + 1, -1);
}

function hexToRgb(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return [value >> 16 & 255, value >> 8 & 255, value & 255];
}

type Painter = { rect: (x: number, y: number, width: number, height: number, color: string, grain?: number) => void; text: (text: string, x: number, y: number, color: string) => void };

function createPainter(image: ImageData): Painter {
  let seed = 7;
  const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const put = (x: number, y: number, [r, g, b]: number[], grain: number) => {
    if (x < 0 || y < 0 || x >= ART_WIDTH || y >= ART_HEIGHT) return;
    const shift = grain ? Math.round((random() - .5) * grain * 2) : 0;
    const index = (y * ART_WIDTH + x) * 4;
    image.data[index] = Math.max(0, Math.min(255, r + shift));
    image.data[index + 1] = Math.max(0, Math.min(255, g + shift));
    image.data[index + 2] = Math.max(0, Math.min(255, b + shift));
    image.data[index + 3] = 255;
  };
  return {
    rect(x, y, width, height, color, grain = 0) {
      const rgb = hexToRgb(color);
      for (let row = y; row < y + height; row += 1) for (let column = x; column < x + width; column += 1) put(column, row, rgb, grain);
    },
    text(text, x, y, color) {
      const rgb = hexToRgb(color);
      let cursor = x;
      for (const char of text) {
        const glyph = GLYPHS[char];
        if (glyph) glyph.forEach((line, row) => [...line].forEach((bit, column) => { if (bit === "1") put(cursor + column, y + row, rgb, 0); }));
        cursor += (glyph?.[0].length ?? 3) + 1;
      }
    },
  };
}

function drawFrame(paint: Painter) {
  const top = 4;
  paint.rect(0, top, ART_WIDTH, ART_HEIGHT - top, PALETTE.outline);
  paint.rect(1, top + 1, ART_WIDTH - 2, ART_HEIGHT - top - 2, PALETTE.wood, 7);
  // Wood grain streaks and bevel: light from the window on the left, shadow towards the bottom right.
  for (const y of [top + 2, ART_HEIGHT - 3]) for (let x = 3; x < ART_WIDTH - 3; x += 7) paint.rect(x, y, 3, 1, PALETTE.woodDark, 5);
  paint.rect(1, top + 1, ART_WIDTH - 2, 1, PALETTE.woodLight, 6);
  paint.rect(1, top + 1, 1, ART_HEIGHT - top - 2, PALETTE.woodLight, 6);
  paint.rect(1, ART_HEIGHT - 2, ART_WIDTH - 2, 1, PALETTE.woodDark, 5);
  paint.rect(ART_WIDTH - 2, top + 1, 1, ART_HEIGHT - top - 2, PALETTE.woodDark, 5);
  paint.rect(4, top + 4, ART_WIDTH - 8, ART_HEIGHT - top - 8, PALETTE.trim, 4);
  paint.rect(5, top + 5, ART_WIDTH - 10, ART_HEIGHT - top - 10, PALETTE.paper, 5);
}

function drawHeader(paint: Painter, month: string, week: number | null) {
  paint.rect(5, 9, ART_WIDTH - 10, 9, PALETTE.header, 5);
  paint.rect(5, 9, ART_WIDTH - 10, 1, PALETTE.headerLight, 4);
  paint.rect(5, 17, ART_WIDTH - 10, 1, PALETTE.headerDark, 3);
  paint.rect(5, 18, ART_WIDTH - 10, 1, PALETTE.paperShade, 3);
  paint.text(month, 9, 11, PALETTE.ink);
  if (week) { const label = `W${week}`; paint.text(label, ART_WIDTH - 9 - textWidth(label), 11, PALETTE.ink); }
  // Binder rings that hold the pages to the board.
  for (const x of [30, 64]) {
    paint.rect(x, 6, 2, 6, PALETTE.ring);
    paint.rect(x, 6, 1, 5, PALETTE.ringLight);
    paint.rect(x - 1, 11, 4, 1, PALETTE.headerDark);
  }
  // Hanging pin above the frame.
  paint.rect(46, 0, 4, 4, PALETTE.pin);
  paint.rect(45, 1, 6, 2, PALETTE.pin);
  paint.rect(46, 1, 2, 1, PALETTE.pinLight);
  paint.rect(47, 4, 2, 1, PALETTE.pinDark);
}

function drawWeek(paint: Painter, dates: string[], today: string, items: PlannerItem[]) {
  const columnWidth = 12;
  const left = 6;
  dates.forEach((date, index) => {
    const x = left + index * columnWidth;
    const weekday = new Date(`${date}T12:00:00`).getDay();
    if (date === today) {
      paint.rect(x, 20, columnWidth, 33, PALETTE.today, 4);
      for (let step = 0; step < columnWidth; step += 2) { paint.rect(x + step, 20, 1, 1, PALETTE.todayEdge); paint.rect(x + step + 1, 52, 1, 1, PALETTE.todayEdge); }
      for (let step = 0; step < 33; step += 2) { paint.rect(x, 20 + step, 1, 1, PALETTE.todayEdge); paint.rect(x + columnWidth - 1, 21 + step, 1, 1, PALETTE.todayEdge); }
    }
    const day = WEEKDAYS[weekday];
    paint.text(day, x + Math.round((columnWidth - textWidth(day)) / 2), 22, date === today ? PALETTE.weekend : weekday === 0 || weekday === 6 ? PALETTE.weekend : PALETTE.number);
    PLANNER_SLOTS.forEach((slot, slotIndex) => {
      const y = 29 + slotIndex * 8;
      const slotItems = items.filter((item) => item.date === date && item.slot === slot);
      const shown = slotItems.slice(0, WALL_BARS_PER_SLOT);
      shown.forEach((item, barIndex) => {
        const [light, dark] = ITEM_COLORS[item.color];
        const width = barIndex === 1 && slotItems.length > shown.length ? 5 : 8;
        paint.rect(x + 2, y + 1 + barIndex * 3, width, 1, light, 3);
        paint.rect(x + 2, y + 2 + barIndex * 3, width, 1, dark, 3);
      });
      if (slotItems.length > shown.length) {
        paint.rect(x + 8, y + 5, 3, 1, PALETTE.plus);
        paint.rect(x + 9, y + 4, 1, 3, PALETTE.plus);
      }
    });
  });
  // Dotted rules between the morning, afternoon and evening rows, and under the weekdays.
  for (let x = left; x < left + columnWidth * 7; x += 2) {
    paint.rect(x, 28, 1, 1, PALETTE.paperLine);
    paint.rect(x + 1, 36, 1, 1, PALETTE.paperLine);
    paint.rect(x, 44, 1, 1, PALETTE.paperLine);
  }
}

export default function PlannerWall({ open, planner, today, now, onOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dates = today ? weekDates(today, planner.weekStartsOn) : [];
  const items = dates.length ? visiblePlannerItems(planner, dates, now) : [];
  const week = today ? getTeachingWeek(today, planner.semesterStart) : null;
  const month = today ? MONTHS[Number(today.slice(5, 7)) - 1] : "";
  const signature = `${month}|${week}|${today}|${dates.join(",")}|${items.map((item) => `${item.key}:${item.slot}:${item.color}`).join(",")}`;

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context || !today) return;
    const image = context.createImageData(ART_WIDTH, ART_HEIGHT);
    const paint = createPainter(image);
    drawFrame(paint);
    drawHeader(paint, month, week);
    drawWeek(paint, dates, today, items);
    context.putImageData(image, 0, 0);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayCount = items.filter((item) => item.date === today).length;
  return <div className={`scene-planner ${open ? "is-open" : ""}`}>
    <canvas ref={canvasRef} className="scene-planner-art" width={ART_WIDTH} height={ART_HEIGHT} aria-hidden="true" />
    <button type="button" data-interactive className="planner-hotspot room-hint" data-hint="日程本" aria-label={`打开墙上的日程本${week ? `，第 ${week} 周` : ""}，今天还有 ${todayCount} 项安排`} disabled={open} onPointerDown={(event) => event.stopPropagation()} onClick={() => { const rect = canvasRef.current?.getBoundingClientRect(); if (rect) onOpen(rect); }} />
  </div>;
}
