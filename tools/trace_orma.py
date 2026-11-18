# Source: ORMA_binder.pdf (Micha, 18.11.2026), option 2, page 3. Replace with the vector original when available.
# Traces the ORMA wordmark (option 2) from Micha's design file into a clean SVG.
import sys, numpy as np, potrace
from PIL import Image, ImageFilter
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("L")
a = np.array(im)
ink = a < 128
ys, xs = np.where(ink)
pad = 6
box = (xs.min() - pad, ys.min() - pad, xs.max() + pad, ys.max() + pad)
im = im.crop(box)
scale = 4
im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS).filter(ImageFilter.GaussianBlur(1.2))
bm = potrace.Bitmap(np.array(im) >= 128)  # potracer traces the False pixels
plist = bm.trace(turdsize=20, alphamax=1.0, opticurve=True, opttolerance=0.3)
s = 1 / scale
parts = []
for curve in plist:
    x, y = curve.start_point.x, curve.start_point.y
    d = [f"M{x*s:.2f},{y*s:.2f}"]
    for seg in curve.segments:
        if seg.is_corner:
            d.append(f"L{seg.c.x*s:.2f},{seg.c.y*s:.2f}L{seg.end_point.x*s:.2f},{seg.end_point.y*s:.2f}")
        else:
            d.append(f"C{seg.c1.x*s:.2f},{seg.c1.y*s:.2f} {seg.c2.x*s:.2f},{seg.c2.y*s:.2f} {seg.end_point.x*s:.2f},{seg.end_point.y*s:.2f}")
    parts.append("".join(d) + "Z")
w, h = (box[2] - box[0]), (box[3] - box[1])
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" role="img" aria-label="ORMA"><path fill="currentColor" fill-rule="evenodd" d="{"".join(parts)}"/></svg>\n'
open(out, "w").write(svg)
print(w, h, len(plist), "curves", len(svg), "bytes")
