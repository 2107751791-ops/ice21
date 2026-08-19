from pathlib import Path
from PIL import Image, ImageDraw


WIDTH, HEIGHT = 1400, 1100
BACKGROUND = "#F5F3EE"
OUTLINE = "#20312A"
DIVIDER = "#D9D4C9"
OUTPUT_DIR = Path(__file__).resolve().parent

# Exact footprint from the web game's B1 mesh. Extrusion depth is 0.1.
FOOTPRINT = [
    (-0.84, -1.20),
    (0.84, -1.20),
    (0.84, 0.72),
    (0.00, 1.32),
    (-0.84, 0.72),
]

TERRAINS = [
    ("grassland", "#8EAE70", "#9FBD63", "grass"),
    ("snowfield", "#EDF6F4", "#FFFFFF", "snow"),
    ("bare-ground", "#B89B7C", "#5F4937", "bare"),
    ("shrubland", "#4F7B63", "#9FBD63", "shrub"),
]


def polygon(draw, points, fill, width=4):
    draw.polygon(points, fill=fill)
    draw.line(points + [points[0]], fill=OUTLINE, width=width, joint="curve")


def ellipse(draw, box, fill, width=3):
    draw.ellipse(box, fill=fill, outline=OUTLINE, width=width)


def top_point(x, z, cx, cy, scale):
    return (round(cx + x * scale), round(cy - z * scale))


def iso_point(x, y, z, cx, cy, scale, mirror=False):
    if mirror:
        x = -x
    return (
        round(cx + (x - z * 0.42) * scale),
        round(cy + (x * 0.25 + z * 0.23 - y) * scale),
    )


def mark_top(draw, kind, cx, cy, scale, accent):
    positions = [(-0.35, 0.20), (0.00, 0.20), (0.35, 0.20)]
    if kind == "snow":
        positions = [(-0.25, 0.10), (0.25, 0.10)]
    elif kind == "bare":
        positions = [(-0.28, 0.15), (0.16, 0.15)]

    for x, z in positions:
        px, py = top_point(x, z, cx, cy, scale)
        if kind == "grass":
            polygon(draw, [(px, py + 4), (px - 11, py - 22), (px - 2, py - 13)], accent, 2)
            polygon(draw, [(px, py + 4), (px + 2, py - 29), (px + 7, py - 12)], accent, 2)
            polygon(draw, [(px, py + 4), (px + 14, py - 20), (px + 7, py - 8)], accent, 2)
        elif kind == "snow":
            ellipse(draw, [px - 30, py - 16, px + 30, py + 16], accent)
        elif kind == "bare":
            polygon(draw, [(px - 18, py + 6), (px - 10, py - 10), (px + 6, py - 14), (px + 19, py + 3), (px + 4, py + 12)], accent, 3)
        else:
            polygon(draw, [(px - 20, py + 8), (px - 14, py - 12), (px, py - 25), (px + 16, py - 12), (px + 21, py + 8)], accent, 3)


def mark_iso(draw, kind, cx, cy, scale, accent, mirror=False):
    positions = [(-0.35, 0.20), (0.00, 0.20), (0.35, 0.20)]
    if kind == "snow":
        positions = [(-0.25, 0.10), (0.25, 0.10)]
    elif kind == "bare":
        positions = [(-0.28, 0.15), (0.16, 0.15)]

    for x, z in positions:
        px, py = iso_point(x, 0, z, cx, cy, scale, mirror)
        if kind == "grass":
            polygon(draw, [(px, py), (px - 8, py - 22), (px - 1, py - 13)], accent, 2)
            polygon(draw, [(px, py), (px + 1, py - 29), (px + 7, py - 11)], accent, 2)
            polygon(draw, [(px, py), (px + 12, py - 19), (px + 6, py - 7)], accent, 2)
        elif kind == "snow":
            ellipse(draw, [px - 25, py - 12, px + 25, py + 8], accent)
        elif kind == "bare":
            polygon(draw, [(px - 14, py + 4), (px - 8, py - 8), (px + 6, py - 10), (px + 15, py + 2), (px + 3, py + 8)], accent, 2)
        else:
            polygon(draw, [(px - 16, py + 5), (px - 11, py - 11), (px, py - 22), (px + 13, py - 10), (px + 17, py + 5)], accent, 2)


def draw_top(draw, base, accent, kind, cx=350, cy=285, scale=180):
    points = [top_point(x, z, cx, cy, scale) for x, z in FOOTPRINT]
    polygon(draw, points, base)
    mark_top(draw, kind, cx, cy, scale, accent)


def draw_iso(draw, base, accent, kind, cx, cy, scale=180, mirror=False):
    upper = [iso_point(x, 0, z, cx, cy, scale, mirror) for x, z in FOOTPRINT]
    lower = [iso_point(x, -0.10, z, cx, cy, scale, mirror) for x, z in FOOTPRINT]
    for i in range(len(upper)):
        j = (i + 1) % len(upper)
        polygon(draw, [upper[i], upper[j], lower[j], lower[i]], base, 3)
    polygon(draw, upper, base)
    mark_iso(draw, kind, cx, cy, scale, accent, mirror)


def draw_side(draw, base, accent, kind, cx=350, cy=830, scale=250):
    half_width = 0.84 * scale
    depth = 0.10 * scale
    polygon(draw, [
        (round(cx - half_width), round(cy - depth)),
        (round(cx + half_width), round(cy - depth)),
        (round(cx + half_width), round(cy)),
        (round(cx - half_width), round(cy)),
    ], base)
    positions = [-0.35, 0.0, 0.35]
    if kind in ("snow", "bare"):
        positions = [-0.25, 0.25]
    for x in positions:
        px = round(cx + x * scale)
        py = round(cy - depth)
        if kind == "grass":
            polygon(draw, [(px, py), (px - 7, py - 23), (px - 1, py - 13)], accent, 2)
            polygon(draw, [(px, py), (px + 2, py - 29), (px + 7, py - 11)], accent, 2)
        elif kind == "snow":
            ellipse(draw, [px - 24, py - 12, px + 24, py + 5], accent)
        elif kind == "bare":
            polygon(draw, [(px - 14, py), (px - 7, py - 10), (px + 7, py - 10), (px + 14, py)], accent, 2)
        else:
            polygon(draw, [(px - 15, py), (px - 10, py - 13), (px, py - 23), (px + 12, py - 12), (px + 15, py)], accent, 2)


def render(name, base, accent, kind):
    image = Image.new("RGB", (WIDTH, HEIGHT), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.line([(WIDTH // 2, 0), (WIDTH // 2, HEIGHT)], fill=DIVIDER, width=4)
    draw.line([(0, HEIGHT // 2), (WIDTH, HEIGHT // 2)], fill=DIVIDER, width=4)
    draw_top(draw, base, accent, kind)
    draw_iso(draw, base, accent, kind, 1050, 295, mirror=False)
    draw_side(draw, base, accent, kind)
    draw_iso(draw, base, accent, kind, 1050, 835, mirror=True)
    image.save(OUTPUT_DIR / f"terrain-{name}-flat-reference.png")


for terrain in TERRAINS:
    render(*terrain)
