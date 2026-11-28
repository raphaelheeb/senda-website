"""Numbered geometry drawing on Micha's to-scale side view of the SENDA Vent.

Usage: python3 tools/vent_geometry_micha.py > assets/img/web/vent-geometry-numbered.svg
Base: assets/img/web/vent-stack-reach.svg (Micha's drawing, size XS, 0.4275 units per mm).
His red construction lines are removed; numbers 1-8 match the rows of the geometry table.
"""
import re
from math import cos, sin, radians, sqrt, atan2

src = open("assets/img/web/vent-stack-reach.svg").read()
head, body = src.split(">", 2)[0:2], src.split(">", 2)[2]
# Drop Micha's red stack/reach construction (stroke or fill in red)
body = re.sub(r'<path[^>]*rgb\((?:100|88\.198853)%, 0%, 0%\)[^>]*/>', "", body)
# and his grey STACK / REACH lettering (filled glyphs; the grey wheels are strokes)
body = re.sub(r'<path[^>]*fill="rgb\(70\.199585%[^>]*/>', "", body)
body = body.replace("</svg>", "")

# Geometry of the drawn size (XS) in mm, x forward, y up, origin at the bottom bracket
STACK, REACH, ETT, ST, HT = 510, 368, 505, 430, 108.5
HTA, STA, CS, DROP, WB = 71, 75, 410, 71, 971
K = 0.4275
BBX, BBY = 367.91, 374.22


def P(x, y):
    return (BBX + x * K, BBY - y * K)


# Axles as drawn (measured on the drawing), so the wheelbase line meets the wheels
rear = (-385.8, 67.8)
front = (557.0, 67.8)
ht_top = (REACH, STACK)
ht_bot = (REACH + HT * cos(radians(HTA)), STACK - HT * sin(radians(HTA)))
st_top = (-ST * cos(radians(STA)), ST * sin(radians(STA)))
ett_x = -STACK / sin(radians(STA)) * cos(radians(STA))

GREY, LINE, INK = "#8a8a8a", "#bdbdbd", "#151515"
out = []


def seg(a, b, color=LINE, w=0.8, dash="3 3"):
    (x1, y1), (x2, y2) = P(*a), P(*b)
    d = f' stroke-dasharray="{dash}"' if dash else ""
    out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{color}" stroke-width="{w}"{d}/>')


def dim(a, b):
    (x1, y1), (x2, y2) = P(*a), P(*b)
    out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{GREY}" stroke-width="0.9"/>')
    for (x, y), (ox, oy) in (((x1, y1), (x2, y2)), ((x2, y2), (x1, y1))):
        ang = atan2(oy - y, ox - x)
        for s in (-1, 1):
            out.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x + 6 * cos(ang + s * 0.42):.1f}" y2="{y + 6 * sin(ang + s * 0.42):.1f}" stroke="{GREY}" stroke-width="0.9"/>')


def num(n, a):
    x, y = P(*a)
    out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="8.5" fill="#fff" stroke="{INK}" stroke-width="0.9"/>')
    out.append(f'<text x="{x:.1f}" y="{y + 3.2:.1f}" font-family="JetBrains Mono, monospace" font-size="9" text-anchor="middle" fill="{INK}">{n}</text>')


def arc(center, r, a1, a2):
    cx, cy = P(*center)
    x1, y1 = cx + r * cos(radians(-a1)), cy + r * sin(radians(-a1))
    x2, y2 = cx + r * cos(radians(-a2)), cy + r * sin(radians(-a2))
    out.append(f'<path d="M{x1:.1f},{y1:.1f} A{r},{r} 0 0 0 {x2:.1f},{y2:.1f}" fill="none" stroke="{GREY}" stroke-width="0.9"/>')


# 1 Stack: vertical ahead of the head tube
sx = REACH + 130
seg((0, 0), (sx + 15, 0)); seg(ht_top, (sx + 15, STACK))
dim((sx, 0), (sx, STACK)); num(1, (sx, STACK * 0.42))
# 2 Reach: above the frame
ry = STACK + 105
seg((0, 0), (0, ry + 15)); seg(ht_top, (REACH, ry + 15))
dim((0, ry), (REACH, ry)); num(2, (REACH / 2, ry))
# 3 Effective top tube: horizontal at stack height
dim((ett_x, STACK), (REACH, STACK)); num(3, (ett_x + 70, STACK + 38))
# 4 Seat tube: parallel, behind the tube
off = (sin(radians(STA)) * 46, cos(radians(STA)) * 46)   # inside the front triangle
dim(off, (st_top[0] + off[0], st_top[1] + off[1])); num(4, (st_top[0] * 0.5 + off[0] + 24, st_top[1] * 0.5 + off[1]))
# 5 Head tube: parallel, ahead of the tube
o5 = (sin(radians(HTA)) * 48, cos(radians(HTA)) * 48)
dim((ht_top[0] + o5[0], ht_top[1] + o5[1]), (ht_bot[0] + o5[0], ht_bot[1] + o5[1]))
num(5, ((ht_top[0] + ht_bot[0]) / 2 + o5[0] + 26, (ht_top[1] + ht_bot[1]) / 2 + o5[1]))
# 6 Head tube angle: at the fork crown, against the horizontal
seg(ht_bot, (ht_bot[0] - 120, ht_bot[1])); arc(ht_bot, 30, 180 - HTA, 180); num(6, (ht_bot[0] - 135, ht_bot[1] + 30))
# 7 Seat tube angle: at the bottom bracket
seg((0, 0), (-150, 0)); arc((0, 0), 38, 180 - STA, 180); num(7, (-150, 40))
# 8 Wheelbase: below the wheels
wy = 67.8 - 340 - 55
seg(rear, (rear[0], wy - 15)); seg(front, (front[0], wy - 15))
dim((rear[0], wy), (front[0], wy)); num(8, ((rear[0] + front[0]) / 2, wy))

x0, y0 = P(rear[0] - 345, ry + 40)
x1, y1 = P(front[0] + 345, wy - 30)
vb = f"{x0:.0f} {y0:.0f} {x1 - x0:.0f} {y1 - y0:.0f}"
print('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="' + vb + '">')
print(body)
print("\n".join(out))
print("</svg>")
