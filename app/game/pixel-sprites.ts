// Small pixel-art icons for the HUD, drawn on a 12×12 grid so they match the room art instead of system emoji.
type Sprite = { palette: Record<string, string>; rows: string[] };

const CLOUD_TOP = [
  "............",
  "....oooo....",
  "...owwwwo...",
  "..owwwwwwooo",
  ".oowwwwwwwwo",
  "owwwwwwwwwwo",
  "owwwwwwwwwwo",
  ".oooooooooo.",
];

const SPRITES = {
  home: {
    palette: { o: "#4a2814", r: "#c9473d", h: "#e0705f", w: "#f1d9b0", b: "#6f9cc0", d: "#a5622f" },
    rows: [
      ".....oo.....",
      "....ohro....",
      "...ohrrro...",
      "..ohrrrrro..",
      ".ohrrrrrrro.",
      "oooooooooooo",
      ".owwwwwwwwo.",
      ".owbbwwddwo.",
      ".owbbwwddwo.",
      ".owwwwwddwo.",
      ".owwwwwddwo.",
      ".oooooooooo.",
    ],
  },
  sun: {
    palette: { o: "#c9783e", y: "#f0c45f", l: "#fbe3a0" },
    rows: [
      ".....yy.....",
      ".y...yy...y.",
      "..y......y..",
      "....oooo....",
      "...olyyyo...",
      "yy.olyyyo.yy",
      "yy.oyyyyo.yy",
      "...oyyyyo...",
      "....oooo....",
      "..y......y..",
      ".y...yy...y.",
      ".....yy.....",
    ],
  },
  moon: {
    palette: { o: "#9a7a2e", y: "#f2d78a", l: "#fff1c4" },
    rows: [
      "....oooo....",
      "..ooylyo....",
      ".oyylo......",
      ".oylo.......",
      "oyyo........",
      "oyyo........",
      "oyyo........",
      "oyyyo.......",
      ".oyyyoo..oo.",
      ".oyyyyyoolo.",
      "..ooyyyyyyo.",
      "....oooooo..",
    ],
  },
  cloud: {
    palette: { o: "#7c8c99", w: "#f4efe6" },
    rows: ["............", "............", ...CLOUD_TOP, "............", "............"],
  },
  rain: {
    palette: { o: "#6f7f8c", w: "#e3e6ea", b: "#5d93c4" },
    rows: [...CLOUD_TOP, "..b...b...b.", ".b...b...b..", "...b...b....", "..b...b....."],
  },
  storm: {
    palette: { o: "#55606b", w: "#c9ced5", y: "#f2c84b" },
    rows: [...CLOUD_TOP, ".....yy.....", "....yy......", ".....yy.....", "......y....."],
  },
  flame: {
    palette: { o: "#8a2e1a", r: "#e0592e", y: "#f6c14a", l: "#fff0b8" },
    rows: [
      ".....o......",
      "....oro.....",
      "...orro..o..",
      "...orrro.ro.",
      "..orrrrroro.",
      "..orryrrrro.",
      ".orryyyrrro.",
      ".orryylyrro.",
      ".oryyllyyro.",
      ".oryyllyyro.",
      "..orryyrro..",
      "...oooooo...",
    ],
  },
  strawberry: {
    palette: { o: "#7a2a24", g: "#5f8f4a", r: "#d94a4f", h: "#ee7a78", s: "#f6e3a0" },
    rows: [
      "....gg.g....",
      "...gggggg...",
      "..ooggggoo..",
      ".ohhrrrrrro.",
      ".ohsrrrsrro.",
      "orrrrrrrrrro",
      "orrrsrrrsrro",
      ".orrrrrrrro.",
      ".orrsrrrsro.",
      "..orrrrrro..",
      "...orrrro...",
      "....oooo....",
    ],
  },
  cart: {
    palette: { o: "#4a2814", w: "#c4834a", l: "#e2b07a", m: "#8a9aa8" },
    rows: [
      "oo..........",
      ".o..........",
      ".oooooooooo.",
      ".olllllllwo.",
      "..owwwwwwwo.",
      "..owwwwwwo..",
      "...ooooooo..",
      "...o........",
      "...oooooooo.",
      "............",
      "...omo..omo.",
      "....o....o..",
    ],
  },
  chair: {
    palette: { o: "#4a2814", w: "#c4834a", d: "#8a5530", r: "#d47a7f", m: "#ec9fa2" },
    rows: [
      "...oooooo...",
      "...owwwwo...",
      "...owmmwo...",
      "...owrrwo...",
      "...owwwwo...",
      "...owwwwo...",
      "..oooooooo..",
      "..ommmmmmo..",
      "..oooooooo..",
      "..od....do..",
      "..od....do..",
      "..oo....oo..",
    ],
  },
  floppy: {
    palette: { o: "#2f3d4d", b: "#6f9cc0", w: "#e8edf2", l: "#f8f4ea", d: "#4d7697" },
    rows: [
      "ooooooooooo.",
      "obbwwwwdwbbo",
      "obbwwwwdwbbo",
      "obbwwwwwwbbo",
      "obbbbbbbbbbo",
      "obbbbbbbbbbo",
      "obblllllllbo",
      "obbloooooolo",
      "obblllllllbo",
      "obbloooooolo",
      "obblllllllbo",
      "oooooooooooo",
    ],
  },
} satisfies Record<string, Sprite>;

export type PixelIconName = keyof typeof SPRITES;

export function spriteRuns(name: PixelIconName) {
  const sprite: Sprite = SPRITES[name];
  const runs: { x: number; y: number; width: number; color: string }[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end += 1;
      if (sprite.palette[key]) runs.push({ x, y, width: end - x, color: sprite.palette[key] });
      x = end;
    }
  });
  return runs;
}

const dataUrls = new Map<PixelIconName, string>();

/** The same icon as a standalone SVG image, for imperative effects that should not re-render React. */
export function pixelIconDataUrl(name: PixelIconName) {
  let url = dataUrls.get(name);
  if (!url) {
    const rects = spriteRuns(name).map((run) => `<rect x="${run.x}" y="${run.y}" width="${run.width}" height="1" fill="${run.color}"/>`).join("");
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" shape-rendering="crispEdges">${rects}</svg>`)}`;
    dataUrls.set(name, url);
  }
  return url;
}

