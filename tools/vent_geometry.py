"""Numbered geometry drawing of the SENDA Vent (size M), for the geometry table.

Usage: python3 tools/vent_geometry.py > assets/img/web/vent-geometry-numbered.svg
Numbers 1-8 match the rows of the table on the bike page.
"""
from math import cos, sin, radians, sqrt, atan2, degrees

# Size M
STACK, REACH, ETT, ST, HT = 534, 382, 535, 485, 130
HTA, STA, CS, DROP, WB = 72, 74, 410, 71, 983
R = 340  # wheel radius with tyre

bb = (0.0, 0.0)
rear = (-sqrt(CS ** 2 - DROP ** 2), DROP)
front = (rear[0] + WB, DROP)
ht_top = (REACH, STACK)
d_ht = (cos(radians(HTA)), -sin(radians(HTA)))
ht_bot = (ht_top[0] + HT * d_ht[0], ht_top[1] + HT * d_ht[1])
d_st = (-cos(radians(STA)), sin(radians(STA)))
st_top = (ST * d_st[0], ST * d_st[1])
ett_x = -STACK / sin(radians(STA)) * cos(radians(STA))   # seat axis at stack height
stay_top = (0.86 * st_top[0], 0.86 * st_top[1])

# drawing space: x right, y up -> SVG
X0, Y0, S = -790, 760, 1.0
def P(p):
    return f"{(p[0] - X0) * S:.1f},{(Y0 - p[1]) * S:.1f}"
W, H = 1720, 1180

INK, GREY, LINE = "#151515", "#8a8a8a", "#c8c8c8"
out = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" font-family="JetBrains Mono, ui-monospace, monospace">']
# wheels
for c in (rear, front):
    cx, cy = P(c).split(",")
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{R * S}" fill="none" stroke="{LINE}" stroke-width="2"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="{GREY}"/>')
# frame
frame = [(rear, bb), (bb, ht_bot), (ht_bot, ht_top), (st_top, ht_top), (bb, st_top), (rear, stay_top), (ht_bot, front)]
for a, b in frame:
    out.append(f'<line x1="{P(a).split(",")[0]}" y1="{P(a).split(",")[1]}" x2="{P(b).split(",")[0]}" y2="{P(b).split(",")[1]}" stroke="{INK}" stroke-width="7" stroke-linecap="round"/>')
cx, cy = P(bb).split(",")
out.append(f'<circle cx="{cx}" cy="{cy}" r="16" fill="#fff" stroke="{INK}" stroke-width="5"/>')

def dim(a, b, dash=True):
    (x1, y1), (x2, y2) = [tuple(map(float, P(p).split(","))) for p in (a, b)]
    d = ' stroke-dasharray="8 7"' if dash else ""
    out.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{GREY}" stroke-width="2"{d}/>')
    for (x, y), (ox, oy) in (((x1, y1), (x2, y2)), ((x2, y2), (x1, y1))):
        ang = atan2(oy - y, ox - x)
        for s in (-1, 1):
            out.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x + 16 * cos(ang + s * 0.4):.1f}" y2="{y + 16 * sin(ang + s * 0.4):.1f}" stroke="{GREY}" stroke-width="2"/>')

def num(n, p):
    x, y = map(float, P(p).split(","))
    out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="22" fill="#fff" stroke="{INK}" stroke-width="2"/>')
    out.append(f'<text x="{x:.1f}" y="{y + 8:.1f}" font-size="22" text-anchor="middle" fill="{INK}">{n}</text>')

def arc(center, r, a1, a2):
    (cx, cy) = map(float, P(center).split(","))
    x1, y1 = cx + r * cos(radians(-a1)), cy + r * sin(radians(-a1))
    x2, y2 = cx + r * cos(radians(-a2)), cy + r * sin(radians(-a2))
    out.append(f'<path d="M{x1:.1f},{y1:.1f} A{r},{r} 0 0 0 {x2:.1f},{y2:.1f}" fill="none" stroke="{GREY}" stroke-width="2"/>')

# 1 stack (vertical, ahead of the head tube)
sx = REACH + 150
dim((sx, 0), (sx, STACK)); out.append(f'<line x1="{P((0,0)).split(",")[0]}" y1="{P((0,0)).split(",")[1]}" x2="{P((sx+20,0)).split(",")[0]}" y2="{P((sx+20,0)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
out.append(f'<line x1="{P(ht_top).split(",")[0]}" y1="{P(ht_top).split(",")[1]}" x2="{P((sx+20,STACK)).split(",")[0]}" y2="{P((sx+20,STACK)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
num(1, (sx, STACK / 2))
# 2 reach (horizontal, above)
ry = STACK + 130
dim((0, ry), (REACH, ry))
out.append(f'<line x1="{P((0,0)).split(",")[0]}" y1="{P((0,0)).split(",")[1]}" x2="{P((0,ry+20)).split(",")[0]}" y2="{P((0,ry+20)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
out.append(f'<line x1="{P(ht_top).split(",")[0]}" y1="{P(ht_top).split(",")[1]}" x2="{P((REACH,ry+20)).split(",")[0]}" y2="{P((REACH,ry+20)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
num(2, (REACH / 2, ry))
# 3 effective top tube (horizontal at stack height)
dim((ett_x, STACK), (REACH, STACK))
num(3, ((ett_x + REACH) / 2 - 60, STACK + 40))
# 4 seat tube (parallel, offset behind)
off = (-sin(radians(STA)) * 70, -cos(radians(STA)) * 70)
dim((off[0], off[1]), (st_top[0] + off[0], st_top[1] + off[1]))
num(4, (st_top[0] / 2 + off[0] - 30, st_top[1] / 2 + off[1]))
# 5 head tube (parallel, offset ahead)
o5 = (sin(radians(HTA)) * 60, cos(radians(HTA)) * 60)
dim((ht_top[0] + o5[0], ht_top[1] + o5[1]), (ht_bot[0] + o5[0], ht_bot[1] + o5[1]))
num(5, ((ht_top[0] + ht_bot[0]) / 2 + o5[0] + 34, (ht_top[1] + ht_bot[1]) / 2 + o5[1]))
# 6 head tube angle (arc at the fork crown, against the horizontal)
arc(ht_top, 80, 180 - HTA + 180 - 180 + 0, 0) if False else arc(ht_bot, 80, 180 - HTA, 180)
out.append(f'<line x1="{P(ht_bot).split(",")[0]}" y1="{P(ht_bot).split(",")[1]}" x2="{P((ht_bot[0]-120, ht_bot[1])).split(",")[0]}" y2="{P((ht_bot[0]-120, ht_bot[1])).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
num(6, (ht_bot[0] - 115, ht_bot[1] + 45))
# 7 seat tube angle (arc at the bottom bracket)
arc(bb, 100, 180 - STA, 180)
out.append(f'<line x1="{P(bb).split(",")[0]}" y1="{P(bb).split(",")[1]}" x2="{P((-150, 0)).split(",")[0]}" y2="{P((-150, 0)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
num(7, (-150, 55))
# 9 wheelbase (below the wheels)
wy = DROP - R - 70
dim((rear[0], wy), (front[0], wy))
for c in (rear, front):
    out.append(f'<line x1="{P(c).split(",")[0]}" y1="{P(c).split(",")[1]}" x2="{P((c[0], wy - 20)).split(",")[0]}" y2="{P((c[0], wy - 20)).split(",")[1]}" stroke="{LINE}" stroke-width="1.5" stroke-dasharray="4 6"/>')
num(8, ((rear[0] + front[0]) / 2, wy))
out.append("</svg>")
print("\n".join(out))
