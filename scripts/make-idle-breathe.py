# Usage: python scripts/make-idle-breathe.py public/game
# Builds cat-<pet>-idle-breathe.png: the chest and head rise by DY pixels while
# the paws, haunch and floor contact stay exactly where they are in idle.
import sys, os
import numpy as np
from PIL import Image
root = sys.argv[1]
DY = 4          # ~1 screen pixel at the in-game cat size
CUT = .42       # rows below this share of the figure height (from the feet) never move
for pet in ["orange", "cow", "white"]:
    src = os.path.join(root, f"cat-{pet}-idle.png")
    a = np.array(Image.open(src).convert("RGBA"))
    ys = np.nonzero(a[..., 3].max(1) > 40)[0]
    top, bottom = ys.min(), ys.max()
    cut = int(bottom - (bottom - top) * CUT)
    out = a.copy()
    out[:cut - DY] = a[DY:cut]          # lift everything above the cut
    out[cut - DY:cut] = a[cut]          # stretch the seam row so nothing tears
    Image.fromarray(out).save(os.path.join(root, f"cat-{pet}-idle-breathe.png"))
    print(pet, "cut row", cut)
