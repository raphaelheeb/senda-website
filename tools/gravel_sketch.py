# Generates the SENDA Gravel teaser drawing from the frame chart (size 500).
# Run: python3 tools/gravel_sketch.py > src/_includes/svg/gravel-sketch.svg
import math
G = dict(seat=500, head_len=151, cs=430, ha=71, sa=74, drop=74, fc=632, reach=396, stack=578, fork=400)
r = math.radians
RA = (-math.sqrt(G['cs']**2 - G['drop']**2), G['drop'])
FA = (math.sqrt(G['fc']**2 - G['drop']**2), G['drop'])
HTt = (G['reach'], G['stack'])
HTb = (HTt[0] + G['head_len']*math.cos(r(G['ha'])), HTt[1] - G['head_len']*math.sin(r(G['ha'])))
st = lambda l: (-l*math.cos(r(G['sa'])), l*math.sin(r(G['sa'])))
STt, TTj, SSj, SADDLE = st(G['seat']), st(470), st(420), st(735)
steer = (HTt[0] - 45*math.cos(r(G['ha'])), HTt[1] + 45*math.sin(r(G['ha'])))
psi = r(90 - G['ha'] - 10)
STEM = (steer[0] + 100*math.cos(psi), steer[1] + 100*math.sin(psi))
axis_y = G['drop']
t = (HTt[1] - axis_y) / math.sin(r(G['ha']))
HAx = (HTt[0] + t*math.cos(r(G['ha'])), axis_y)
TYRE, RIM = 350, 311
X0, TOP = -820, 760
W, H = 1850, 760 + (TYRE - G['drop']) + 6
P = lambda p: (round(p[0] - X0, 1), round(TOP - p[1], 1))
def line(a, b, cls="t"):
    (x1, y1), (x2, y2) = P(a), P(b)
    return f'<line class="{cls}" pathLength="1" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>'
def circ(c, rad, cls):
    x, y = P(c); return f'<circle class="{cls}" pathLength="1" cx="{x}" cy="{y}" r="{rad}"/>'
def text(p, s, cls="lab", anchor="middle", dx=0, dy=0):
    x, y = P(p); return f'<text class="{cls}" x="{x+dx}" y="{y+dy}" text-anchor="{anchor}">{s}</text>'
def arc(c, rad, a0, a1):
    # angles in degrees, mathematical (counter-clockwise from +x)
    x0, y0 = P((c[0] + rad*math.cos(r(a0)), c[1] + rad*math.sin(r(a0))))
    x1, y1 = P((c[0] + rad*math.cos(r(a1)), c[1] + rad*math.sin(r(a1))))
    return f'<path class="d" pathLength="1" d="M{x0},{y0} A{rad},{rad} 0 0 0 {x1},{y1}"/>'
fork_mid = ((HTb[0] + FA[0])/2 + 18, (HTb[1] + FA[1])/2)
fx0, fy0 = P(HTb); fxm, fym = P(fork_mid); fx1, fy1 = P(FA)
out = [f'<svg class="sketch" viewBox="0 0 {W} {round(H)}" role="img" aria-labelledby="sketch-title" xmlns="http://www.w3.org/2000/svg">',
       '<title id="sketch-title">Line drawing of the SENDA Gravel frame: longer chainstays, a lower bottom bracket and a slacker head angle than SENDA Vent</title>',
       '<g class="sketch__wheels">', circ(RA, TYRE, "w"), circ(RA, RIM, "w w--rim"), circ(FA, TYRE, "w"), circ(FA, RIM, "w w--rim"), '</g>',
       '<g class="sketch__frame">',
       line((0, 0), RA), line(SSj, RA), line((0, 0), STt), line(TTj, (HTt[0]-6, HTt[1]-22)),
       line((0, 0), (HTb[0]-4, HTb[1]+14)), line(HTt, HTb),
       f'<path class="t" pathLength="1" d="M{fx0},{fy0} Q{fxm},{fym} {fx1},{fy1}"/>',
       circ((0, 0), 22, "t"), '</g>',
       '<g class="sketch__ghost">', line(STt, SADDLE, "g"), line((SADDLE[0]-70, SADDLE[1]), (SADDLE[0]+80, SADDLE[1]), "g"),
       line(HTt, steer, "g"), line(steer, STEM, "g"), circ(STEM, 16, "g"), '</g>',
       '<g class="sketch__dims">',
       line((RA[0]-60, axis_y), (FA[0]+60, axis_y), "d d--axis"),
       line((-150, 0), (150, 0), "d d--axis"),
       line((170, 0), (170, axis_y), "d"), line((158, 0), (182, 0), "d"), line((158, axis_y), (182, axis_y), "d"),
       text((190, axis_y/2), "74 mm", anchor="start", dy=7),
       text((RA[0]*0.62, RA[1]*0.62), "430 mm", anchor="end", dx=-10, dy=52),
       arc(HAx, 90, 0, G['ha']), text(HAx, "71°", anchor="start", dx=100, dy=-40),
       arc((0, 0), 120, 180 - G['sa'], 180), text((-128, 130), "74°", anchor="end"),
       '</g>',
       '</svg>']
import sys
if "--tile" in sys.argv:
    # Square, self-contained image for tiles: lines only, inline styles, tinted ground.
    body = [l for l in out[2:-1]]
    keep, skip = [], False
    for l in body:
        if l.startswith('<g class="sketch__dims"'): skip = True
        if not skip: keep.append(l)
        if skip and l == '</g>': skip = False
    pad = (W - H) / 2
    print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 {-pad - 60:.0f} {W + 120} {W + 120}">')
    print('<style>.t{fill:none;stroke:#151515;stroke-width:6;stroke-linecap:round}.w{fill:none;stroke:#151515;stroke-width:2.5}.w--rim{stroke:#9a9a9a;stroke-width:2}.g{fill:none;stroke:#9a9a9a;stroke-width:2.5;stroke-dasharray:.012 .01}</style>')
    print(f'<rect x="-60" y="{-pad - 60:.0f}" width="{W + 120}" height="{W + 120}" fill="#f4f4f2"/>')
    print("\n".join(keep))
    print("</svg>")
else:
    print("\n".join(out))
