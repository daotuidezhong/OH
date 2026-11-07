# Usage: python scripts/normalize-cat-sprites.py asset-backup/cat-sprites-2026-11-07 public/game
"""Normalize cat sprite scale/anchors. Reads originals from SRC, writes to DST.
Reference per cat: idle frame (untouched, the feeding rig depends on it)."""
import sys, os, json
import numpy as np
from PIL import Image
SRC, DST = sys.argv[1], sys.argv[2]
DIRS = ["left","up-left","up","up-right","right","down-right","down","down-left"]
HEAD = {"left":"L","up-left":"L","down-left":"L","right":"R","up-right":"R","down-right":"R","up":"L","down":"L"}
FACING_LEFT = {"left","up-left","down-left"}
def load(name): return Image.open(os.path.join(SRC, name)).convert("RGBA")
def mask(im): return np.array(im.getchannel("A")) > 40
def anchors(m, head="R", band=0.35):
    ys, xs = np.nonzero(m); t, b, l, r = ys.min(), ys.max(), xs.min(), xs.max(); w = r-l+1
    cols = m[:, int(r-w*band):r+1] if head == "R" else m[:, l:int(l+w*band)+1]
    ear = np.nonzero(cols.any(1))[0].min()
    fb = m[int(b-(b-t)*.08):b+1]
    return dict(bottom=b, earh=b-ear, feetx=np.nonzero(fb)[1].mean())
def shifted(im, dx, dy):
    out = Image.new("RGBA", im.size, (0,0,0,0))
    out.paste(im, (int(dx), int(dy))); return out
def headw(m, head, frac=.30, center=False):
    a = anchors(m, head); y = int(a["bottom"] - a["earh"] + a["earh"]*frac)
    xs = np.nonzero(m[y])[0]; runs = np.split(xs, np.nonzero(np.diff(xs) > 2)[0] + 1)
    run = max(runs, key=len) if center else (runs[-1] if head == "R" else runs[0])
    return run.max() - run.min() + 1
def clamp_offset(m, dx, dy):
    ys, xs = np.nonzero(m); H, W = m.shape
    cdx = int(min(max(dx, -xs.min()), W-1-xs.max())); cdy = int(min(max(dy, -ys.min()), H-1-ys.max()))
    return cdx, cdy
def lost_pixels(im, dx, dy):
    m = mask(im); ys, xs = np.nonzero(m); nx, ny = xs+dx, ys+dy
    W, H = im.size; return int(((nx<0)|(nx>=W)|(ny<0)|(ny>=H)).sum())
report = {}
for pet in ["orange","cow","white"]:
    rep = report[pet] = {}
    idle = load(f"cat-{pet}-idle.png"); S = idle.width; ia = anchors(mask(idle)); ref = mask(idle)
    wf = [anchors(mask(load(f"cat-{pet}-walk-fixed-{i}.png"))) for i in range(1,5)]
    # ---- 418 single-frame sequences: same dx/dy for every frame in a sequence
    seqs = {"wake-yawn": ("iou", 4), "groom-fixed": ("iou", 4), "scratch": ("dy", 4), "walk-fixed": ("dy", 4), "wake": ("dy", 0), "sleep": ("dy", 0)}
    for seq, (mode, count) in seqs.items():
        names = [f"cat-{pet}-{seq}-{i}.png" for i in range(1, count+1)] if count else [f"cat-{pet}-{seq}.png"]
        ims = [load(n) for n in names]
        dy = int(ia["bottom"] - int(np.median([anchors(mask(i))["bottom"] for i in ims])))
        dx = 0
        if mode == "iou":
            best = (-1, 0)
            for cand in range(-130, 131):
                score = 0
                for i in ims:
                    m = np.roll(np.roll(mask(i), dy, 0), cand, 1)
                    score += (m & ref).sum() / (m | ref).sum()
                if score > best[0]: best = (score, cand)
            dx = best[1]
        want = (dx, dy)
        union = np.logical_or.reduce([mask(i) for i in ims])
        dx, dy = clamp_offset(union, dx, dy)
        lost = sum(lost_pixels(i, dx, dy) for i in ims)
        rep[seq] = dict(want=want, dx=dx, dy=dy, lost=lost)
        for n, i in zip(names, ims): shifted(i, dx, dy).save(os.path.join(DST, n))
    # ---- 8-direction walk sheet: uniform cat size across all 32 cells
    sheet = load(f"cat-{pet}-walk-8dir-v4.png"); C = sheet.width // 4
    tgt_earh = np.mean([a["earh"] for a in wf]) / S * C
    tgt_bottom = ia["bottom"] / S * C
    tgt_headw = np.mean([headw(mask(load(f"cat-{pet}-walk-fixed-{i}.png")), "R") for i in range(1,5)]) / S * C
    tgt_fx = np.mean([a["feetx"] for a in wf]) / S * C
    out = Image.new("RGBA", sheet.size, (0,0,0,0)); rows = {}
    for r, d in enumerate(DIRS):
        cells = [sheet.crop((c*C, r*C, c*C+C, r*C+C)) for c in range(4)]
        an = [anchors(mask(x), HEAD[d]) for x in cells]
        med = float(np.median([a["earh"] for a in an]))
        earh = [a["earh"] if abs(a["earh"]-med)/med <= .04 else med for a in an]
        hw = float(np.median([headw(mask(x), HEAD[d], center=d in ("up","down")) for x in cells]))
        row_scale = .5 * (tgt_earh / med + tgt_headw / hw)
        scales = [row_scale * med / e for e in earh]
        scaled = []
        for x, s in zip(cells, scales):
            n = max(1, round(C*s)); sx = x.resize((n, n), Image.NEAREST)
            scaled.append((sx, anchors(mask(sx), HEAD[d])))
        mean_fx = np.mean([a["feetx"] for _, a in scaled])
        fx_target = C - tgt_fx if d in FACING_LEFT else tgt_fx
        lost = 0
        for c, (sx, a) in enumerate(scaled):
            ox = round(fx_target + (a["feetx"] - mean_fx) - a["feetx"])
            oy = round(tgt_bottom - a["bottom"])
            ys, xs = np.nonzero(mask(sx))
            ox = int(min(max(ox, -xs.min()), C-1-xs.max())); oy = int(min(max(oy, -ys.min()), C-1-ys.max()))
            cell = Image.new("RGBA", (C, C), (0,0,0,0))
            cell.paste(sx, (ox, oy))
            lost += int(mask(sx).sum() - mask(cell).sum())
            out.paste(cell, (c*C, r*C))
        rows[d] = dict(scale=[round(s,3) for s in scales], lost=lost)
    rep["walk-8dir"] = rows
    out.save(os.path.join(DST, f"cat-{pet}-walk-8dir-v4.png"))
print(json.dumps(report, indent=1))
