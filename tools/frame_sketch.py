"""Pencil-style sketch of a frame photo (dark frame on a light background).

Usage: python3 tools/frame_sketch.py <photo.jpg> <out-prefix>
Writes <out-prefix>-2000.jpg and <out-prefix>-1000.jpg (square, white paper).
Used for the SENDA Gravel tile until a hand drawing exists.
"""
import sys
import cv2
import numpy as np

src, prefix = sys.argv[1], sys.argv[2]
rng = np.random.default_rng(7)
g = cv2.cvtColor(cv2.imread(src), cv2.COLOR_BGR2GRAY)

# Frame mask: the dark carbon, largest parts only, outline smoothed
m = (g < 95).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
for k in range(1, n):
    if st[k, cv2.CC_STAT_AREA] > 20000:
        keep[lab == k] = 255
mask = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41)))
mask = (cv2.GaussianBlur(mask, (0, 0), 5) > 127).astype(np.uint8) * 255
H, W = mask.shape

canvas = np.full((H, W), 255, np.float32)
# Soft graphite shading inside, following the carbon's light and dark
inside = cv2.GaussianBlur(g, (0, 0), 3).astype(np.float32)
shade = (1 - np.clip((inside - 10) / 90, 0, 1)) * 55
yy, xx = np.mgrid[0:H, 0:W]
hatch = ((xx + yy) % 9 < 2).astype(np.float32)
mf = cv2.GaussianBlur(mask, (0, 0), 1.5).astype(np.float32) / 255
canvas -= mf * (10 + shade * hatch * 2.2)
# Inner details (junctions, ports) as light lines
e = cv2.Canny(cv2.GaussianBlur(g, (5, 5), 0), 25, 70)
e = cv2.bitwise_and(e, cv2.erode(mask, np.ones((15, 15), np.uint8)))
canvas -= cv2.GaussianBlur(e.astype(np.float32), (0, 0), 1.0) * 0.3
# Outline, drawn three times with a slight wobble
cnts, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
lines = np.zeros((H, W), np.uint8)
for pas in range(3):
    for c in cnts:
        if len(c) < 60:
            continue
        pts = c[:, 0, :].astype(np.float32)
        off = rng.normal(0, 1.8, (max(len(pts) // 80, 3), 2)).astype(np.float32)
        off = cv2.resize(off, (2, len(pts)), interpolation=cv2.INTER_CUBIC)
        cv2.polylines(lines, [(pts + off).astype(np.int32)], True, int(170 + 40 * pas), 2 if pas == 0 else 1, cv2.LINE_AA)
canvas -= cv2.GaussianBlur(lines.astype(np.float32), (0, 0), 0.8) * 1.15
# A few faint construction lines along the main tubes
L = cv2.HoughLinesP(cv2.Canny(mask, 50, 150), 1, np.pi / 360, threshold=260, minLineLength=420, maxLineGap=12)
cons = np.zeros((H, W), np.uint8)
if L is not None:
    for x1, y1, x2, y2 in L.reshape(-1, 4)[:12]:
        d = np.array([x2 - x1, y2 - y1], float)
        d /= np.linalg.norm(d) + 1e-9
        a = (np.array([x1, y1]) - d * 260).astype(int)
        b = (np.array([x2, y2]) + d * 260).astype(int)
        cv2.line(cons, (int(a[0]), int(a[1])), (int(b[0]), int(b[1])), 255, 1, cv2.LINE_AA)
canvas -= cons.astype(np.float32) * 0.15
canvas += rng.normal(0, 2.0, (H, W))
out = np.clip(canvas, 0, 255).astype(np.uint8)

# Square crop around the frame on white paper
ys, xs = np.where(mask > 0)
cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
side = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.12)
sq = np.full((side, side), 255, np.uint8)
x0, y0 = cx - side // 2, cy - side // 2
sx0, sy0 = max(x0, 0), max(y0, 0)
crop = out[sy0:min(y0 + side, H), sx0:min(x0 + side, W)]
sq[sy0 - y0:sy0 - y0 + crop.shape[0], sx0 - x0:sx0 - x0 + crop.shape[1]] = crop
for w in (2000, 1000):
    cv2.imwrite(f"{prefix}-{w}.jpg", cv2.resize(sq, (w, w), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
