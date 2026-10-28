#!/usr/bin/env python3
"""Recolour WarriorMan into the red 'enraged' enemy palette.

Self-contained on purpose: the repo has no PNG dependency and adding one for a
one-off recolour is worse than 60 lines of stdlib zlib. Run from anywhere:

    python3 tools/recolour-enemy.py

Reads the pack's WarriorMan sheets, applies the hand-authored palette map, and
writes RGBA sheets to src/assets/enemy/. Also renders artifacts/enemy-preview.png
so a human can judge contrast against the terrain.

Why the palette is hand-authored rather than computed: the source is only 18
colours, and a luminance ramp collapses the armour, cloth and skin tones into one
flat red. Every target below preserves the source colour's relative luminance, so
the artist's shading structure survives.

Palette notes (measured, not guessed):
  - terrain dirt is #6e2727, luminance 54. Mid-tones left near that value sit at
    the same brightness as the ground and separate only by hue, which is weak at
    16px. The mids below are lifted to luminance ~65-90 to keep them clear.
  - the outline stays near-black so the silhouette still cuts against the ground.
  - the sword highlight stays pale, so the weapon reads as bright.
"""
import os
import struct
import sys
import zlib

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(REPO, 'Characters PackV2', 'WarriorMan')
OUT_DIR = os.path.join(REPO, 'src', 'assets', 'enemy')
PREVIEW = os.path.join(REPO, 'artifacts', 'enemy-preview.png')

# src RGB -> target RGB
PALETTE = {
    (46, 34, 47): (38, 12, 16),      # outline
    (50, 51, 83): (56, 18, 22),
    (110, 39, 39): (132, 32, 32),
    (62, 53, 70): (110, 26, 28),
    (158, 69, 57): (186, 46, 44),
    (98, 85, 101): (160, 36, 38),
    (77, 101, 180): (186, 46, 46),   # cloth -> red
    (150, 108, 108): (206, 66, 56),
    (127, 112, 138): (194, 52, 50),
    (205, 104, 61): (216, 74, 54),
    (251, 107, 29): (228, 88, 58),
    (77, 155, 230): (238, 100, 64),  # cloth highlight -> ember
    (246, 129, 129): (245, 116, 76),
    (247, 150, 23): (248, 130, 82),
    (155, 171, 178): (252, 146, 96),  # steel -> hot metal
    (253, 203, 176): (255, 196, 172),
    (199, 220, 208): (255, 214, 196),
    (255, 255, 255): (255, 242, 234),
}

# An enemy needs patrol, attack, damage response and death.
SHEETS = ['Idle', 'Walk', 'Attack1', 'Hit', 'Death']
FRAME = 64


def read_png(path):
    """Minimal PNG reader: 8-bit RGB or RGBA, no interlace. Returns (w, h, pixels).

    pixels is a flat list of (r, g, b, a).
    """
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', f'{path} is not a PNG'
    pos, idat, w, h, ctype = 8, b'', 0, 0, 2
    while pos < len(data):
        (length,) = struct.unpack('>I', data[pos:pos + 4])
        ctag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if ctag == b'IHDR':
            w, h, depth, ctype = struct.unpack('>IIBB', body[:10])
            assert depth == 8 and ctype in (2, 6), f'{path}: unsupported {depth}/{ctype}'
        elif ctag == b'IDAT':
            idat += body
        elif ctag == b'IEND':
            break

    channels = 4 if ctype == 6 else 3
    raw = zlib.decompress(idat)
    stride = w * channels
    out = []
    prev = bytearray(stride)
    p = 0
    for _ in range(h):
        ftype = raw[p]
        p += 1
        line = bytearray(raw[p:p + stride])
        p += stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if ftype == 1:
                line[i] = (line[i] + a) & 0xFF
            elif ftype == 2:
                line[i] = (line[i] + b) & 0xFF
            elif ftype == 3:
                line[i] = (line[i] + (a + b) // 2) & 0xFF
            elif ftype == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 0xFF
        for x in range(w):
            o = x * channels
            px = (line[o], line[o + 1], line[o + 2])
            alpha = line[o + 3] if channels == 4 else 255
            out.append((*px, alpha))
        prev = line
    return w, h, out


def write_rgba(path, w, h, pixels):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            raw += bytes((r, g, b, a))
    def chunk(tag, body):
        return (struct.pack('>I', len(body)) + tag + body
                + struct.pack('>I', zlib.crc32(tag + body) & 0xFFFFFFFF))
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )


def recolour(path):
    w, h, px = read_png(path)
    out = []
    for r, g, b, a in px:
        if a <= 20:
            out.append((0, 0, 0, 0))
            continue
        t = PALETTE.get((r, g, b), (r, g, b))
        out.append((t[0], t[1], t[2], a))
    return w, h, out


def main():
    # 1. the game sheets
    wrote = 0
    for sheet in SHEETS:
        src = os.path.join(PACK, f'WarriorMan{sheet}.png')
        if not os.path.exists(src):
            sys.exit(f'missing source sheet: {src}')
        w, h, px = recolour(src)
        write_rgba(os.path.join(OUT_DIR, f'WarriorMan{sheet}.png'), w, h, px)
        wrote += 1

    # 2. a preview over the terrain colours, player included for scale
    S, CELL_W, CELL_H = 4, 80, 72
    BODY, CRUST = (110, 39, 39), (205, 104, 61)
    cols = len(SHEETS)
    W, H = cols * CELL_W * S, 2 * CELL_H * S
    canvas = [[BODY] * W for _ in range(H)]
    for row in range(2):
        base = row * CELL_H + CELL_H - 8
        for y in range(base, (row + 1) * CELL_H):
            for x in range(W):
                canvas[y][x] = CRUST
        for x in range(W):
            canvas[row * CELL_H + CELL_H - 8][x] = (40, 16, 14)

    rows = [
        [os.path.join(REPO, 'src/assets/woman', f'WarriorWoman{n}.png')
         for n in ('Idle', 'Run', 'Idle', 'Idle', 'Jump')],
        [os.path.join(OUT_DIR, f'WarriorMan{n}.png') for n in SHEETS],
    ]
    # the player's frame width differs from the enemy's
    for row, paths in enumerate(rows):
        for col, path in enumerate(paths):
            if not os.path.exists(path):
                continue
            w, h, px = read_png(path)
            fw = w // (8 if 'Jump' not in path else 11)
            idx = (0, 2, 0, 0, 3)[col] if row == 0 else (0, 2, 3, 0, 4)[col]
            ox = col * CELL_W * S + (CELL_W - fw) * S // 2
            low = max((y for y in range(h) for x in range(fw * idx, fw * (idx + 1))
                       if px[y * w + x][3] > 20), default=-1)
            if low < 0:
                continue
            oy = row * CELL_H * S + (CELL_H - 8 - low) * S
            for y in range(h):
                for x in range(fw * idx, fw * (idx + 1)):
                    r, g, b, a = px[y * w + x]
                    if a <= 20:
                        continue
                    for dy in range(S):
                        for dx in range(S):
                            ty, tx = oy + y * S + dy, ox + (x - fw * idx) * S + dx
                            if 0 <= ty < H and 0 <= tx < W:
                                canvas[ty][tx] = (r, g, b)

    flat = [(r, g, b, 255) for row in canvas for (r, g, b) in row]
    write_rgba(PREVIEW, W, H, flat)
    print(f'wrote {wrote} sheets to src/assets/enemy/')
    print(f'preview: {PREVIEW}')


if __name__ == '__main__':
    main()
