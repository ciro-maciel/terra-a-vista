"""Draw the site icon, a small round Brazilian flag with a gold rim, as SVG and PNG (standard library only).

    uv run python tools/make_favicon.py      → web/favicon.svg, web/favicon-32.png, web/apple-touch-icon.png

The PNGs are rasterised here with 4×4 supersampling, so no image tool is needed. The shapes are the same as the
emblem in the top bar (web/index.html): green disc, yellow rhombus, blue globe, white band.
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
RIM, GREEN, YELLOW, BLUE, WHITE = (0xC9, 0xA4, 0x5C), (0x1E, 0x8A, 0x43), (0xF2, 0xC3, 0x18), (0x1F, 0x3F, 0x8F), (0xFF, 0xFF, 0xFF)

SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<circle cx="32" cy="32" r="31" fill="#c9a45c"/>
<circle cx="32" cy="32" r="28" fill="#1e8a43"/>
<path d="M32 9.6 56 32 32 54.4 8 32z" fill="#f2c318"/>
<circle cx="32" cy="32" r="12.3" fill="#1f3f8f"/>
<path d="M20.3 29.1c7.7-1.3 16.3.3 23.2 4.3l-.8 2.4c-6.7-3.7-14.7-5.3-22.1-4z" fill="#fff"/>
</svg>
"""


def colour_at(x: float, y: float):
    """The flag colour at (x, y) in the 64×64 design, or None outside the disc."""
    dx, dy = x - 32, y - 32
    r = math.hypot(dx, dy)
    if r > 31:
        return None
    if r > 28:
        return RIM
    if r <= 12.3:
        # the band: between two circular arcs through the globe, like the flag's "Ordem e Progresso" stripe
        c1 = math.hypot(x - 36, y - 62) - 31.5
        if -1.2 <= c1 <= 1.0:
            return WHITE
        return BLUE
    if abs(dx) / 24 + abs(dy) / 22.4 <= 1:
        return YELLOW
    return GREEN


def png(size: int, bg=None, scale: float = 1.0) -> bytes:
    """`bg` fills the corners (the iPhone masks the icon itself); `scale` < 1 leaves a margin around the disc."""
    ss = 4
    rows = []
    for py in range(size):
        row = bytearray([0])
        for px in range(size):
            acc = [0, 0, 0, 0]
            for sy in range(ss):
                for sx in range(ss):
                    x = 32 + ((px + (sx + 0.5) / ss) * 64 / size - 32) / scale
                    y = 32 + ((py + (sy + 0.5) / ss) * 64 / size - 32) / scale
                    c = colour_at(x, y) or bg
                    if c:
                        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 1
            n = acc[3]
            row += bytes([acc[0] // n, acc[1] // n, acc[2] // n, 255 * n // (ss * ss)] if n else [0, 0, 0, 0])
        rows.append(bytes(row))
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    (WEB / "favicon.svg").write_text(SVG)
    (WEB / "favicon-32.png").write_bytes(png(32))
    (WEB / "apple-touch-icon.png").write_bytes(png(180, bg=(0x17, 0x12, 0x0A), scale=0.86))
    print("web/favicon.svg, web/favicon-32.png, web/apple-touch-icon.png")
