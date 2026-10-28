"""Slice the NightBorne sheet into the per-animation strips the game loads.

The source is a 23x5 grid of 80x80 cells, and the rows are, in order:
idle / run / attack / hurt / death.

That mapping is asserted, not assumed. The number of populated cells in each row
must match the author's published frame counts (9, 6, 12, 5, 23); if the layout
ever changes, this fails loudly instead of silently slicing the wrong frames.

Run from the repo root, with the downloaded pack at `NightBorne/`:

    python3 tools/extract-boss.py

Everything is stdlib (zlib for the IDAT stream) so there is no imaging
dependency, and the pack directory itself is gitignored - only the strips this
writes into src/assets/boss/ are tracked.
"""

import os
import struct
import zlib

SRC = "NightBorne/NightBorne.png"
OUT = "src/assets/boss"
CELL = 80
ROWS = [
    ("Idle", 0, 9),
    ("Run", 1, 6),
    ("Attack", 2, 12),
    ("Hurt", 3, 5),
    ("Death", 4, 23),
]


def read_png(path):
    data = open(path, "rb").read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", f"{path} is not a PNG"
    pos, idat, w, h, bitd, ct = 8, b"", 0, 0, 8, 6
    while pos < len(data):
        ln = struct.unpack(">I", data[pos : pos + 4])[0]
        typ = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + ln]
        if typ == b"IHDR":
            w, h, bitd, ct = struct.unpack(">IIBB", chunk[:10])
        elif typ == b"IDAT":
            idat += chunk
        pos += 12 + ln
    assert bitd == 8 and ct == 6, f"expected 8-bit RGBA, got bitd={bitd} ct={ct}"

    raw = zlib.decompress(idat)
    stride = w * 4
    pixels = bytearray(w * h * 4)
    prev = bytearray(stride)
    i = 0
    for y in range(h):
        ft = raw[i]
        i += 1
        line = bytearray(raw[i : i + stride])
        i += stride
        if ft == 1:
            for x in range(4, stride):
                line[x] = (line[x] + line[x - 4]) & 0xFF
        elif ft == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ft == 3:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                line[x] = (line[x] + (a + prev[x]) // 2) & 0xFF
        elif ft == 4:
            for x in range(stride):
                a = line[x - 4] if x >= 4 else 0
                b = prev[x]
                c = prev[x - 4] if x >= 4 else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        pixels[y * stride : (y + 1) * stride] = line
        prev = line
    return w, h, pixels


def write_png(path, w, h, px):
    raw = b"".join(b"\x00" + bytes(px[y * w * 4 : (y + 1) * w * 4]) for y in range(h))

    def chunk(typ, payload):
        return (
            struct.pack(">I", len(payload))
            + typ
            + payload
            + struct.pack(">I", zlib.crc32(typ + payload) & 0xFFFFFFFF)
        )

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9))
    out += chunk(b"IEND", b"")
    open(path, "wb").write(out)


SW, SH, src = read_png(SRC)
cols, rows = SW // CELL, SH // CELL
print(f"source {SW}x{SH} = {cols}x{rows} cells of {CELL}")
assert (cols, rows) == (23, 5), f"unexpected grid {cols}x{rows}"

os.makedirs(OUT, exist_ok=True)
ok = True

for name, row, frames in ROWS:
    # Count cells with ANY ink. A threshold would be wrong here: the death strip
    # dissolves, and its last two frames are down to 41 and 6 opaque pixels -
    # real frames, not padding. Counting them as empty reports 21 against a
    # published 23 and sends you looking for a layout bug that is not there.
    populated = 0
    ink_centres = []
    for c in range(cols):
        xs = [x for x in range(c * CELL, (c + 1) * CELL) if any(src[(y * SW + x) * 4 + 3] > 20 for y in range(row * CELL, (row + 1) * CELL))]
        if xs:
            populated += 1
            ink_centres.append(((xs[0] - c * CELL) + (xs[-1] - c * CELL)) / 2)

    status = "ok" if populated == frames else f"MISMATCH - expected {frames}"
    if populated != frames:
        ok = False

    centres = sorted(ink_centres)
    median_centre = centres[len(centres) // 2] if centres else 0.0
    print(
        f"  {name:7} row {row}: {populated:2} populated cells  {status}"
        f"   ink centre {median_centre:.1f} of {CELL} (nudge {CELL / 2 - median_centre:+.1f})"
    )

    sw, sh = frames * CELL, CELL
    out = bytearray(sw * sh * 4)
    for y in range(CELL):
        sy = row * CELL + y
        out[y * sw * 4 : (y + 1) * sw * 4] = src[(sy * SW) * 4 : (sy * SW + sw) * 4]
    write_png(os.path.join(OUT, f"NightBorne{name}.png"), sw, sh, out)

    lowest = 0
    for y in range(CELL):
        if any(out[(y * sw + x) * 4 + 3] > 20 for x in range(sw)):
            lowest = y
    print(f"          feet row {lowest} -> footOrigin {(lowest + 1) / CELL:.4f}")

assert ok, "row layout no longer matches the published frame counts - do not ship these strips"

print("\nwritten:")
for name, _, frames in ROWS:
    p = os.path.join(OUT, f"NightBorne{name}.png")
    print(f"  {p}  {frames} frames  {os.path.getsize(p)} bytes")
