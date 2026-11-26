"""ESA WorldCover 2021 land cover, read from the smallest overview of each cloud-optimised GeoTIFF tile.

Each 3° × 3° tile is a 36,000-pixel COG (10 m) with internal overviews down to 562 pixels (~590 m). The full
tiles over Brazil would be more than 10 GB; this source asks for two byte ranges per tile instead (the TIFF
header and the one overview block), about 70 kB, so the whole map costs a few megabytes.

The classes are translated to their NLCD equivalents (pipeline/build/world.py classifies NLCD codes), so the
hex rules stay one definition. WorldCover has no pasture class: pasture is in grassland (30).
"""

from __future__ import annotations

import json
import struct
import zlib
from collections import Counter

from ..core.source import Source, SourceInfo

BUCKET = "https://esa-worldcover.s3.eu-central-1.amazonaws.com"
GRID = f"{BUCKET}/esa_worldcover_grid.geojson"
TILE = BUCKET + "/v200/2021/map/ESA_WorldCover_10m_2021_v200_{name}_Map.tif"
HEADER_BYTES = 65536

# The map rectangle: Brazil's mainland plus the margin into the neighbours and the Atlantic.
LON, LAT = (-78.0, -30.0), (-37.0, 8.0)
TILE_DEG = 3
OUT = 140  # stored pixels per tile side (~2.4 km), each the most common class of a block of the overview

# WorldCover class → NLCD-equivalent code, and the character the interim stores.
TO_NLCD = {
    0: 0,     # no data
    10: 41,   # tree cover → forest (broadleaf)
    20: 52,   # shrubland → shrub/scrub (the Caatinga)
    30: 71,   # grassland → grassland (includes pasture: WorldCover does not split them)
    40: 82,   # cropland → cultivated crops
    50: 23,   # built-up → developed
    60: 31,   # bare / sparse vegetation → barren
    70: 12,   # snow and ice
    80: 11,   # permanent water bodies → open water
    90: 95,   # herbaceous wetland → emergent herbaceous wetland
    95: 90,   # mangroves → woody wetland
    100: 71,  # moss and lichen → grassland
}
LEGEND = {0: ".", 11: "w", 12: "i", 23: "m", 31: "b", 41: "d", 52: "s", 71: "g", 82: "c", 90: "f", 95: "v"}


def tile_name(lat0: int, lon0: int) -> str:
    """WorldCover tile name from its lower-left corner, e.g. (-24, -48) → S24W048."""
    ns = f"{'N' if lat0 >= 0 else 'S'}{abs(lat0):02d}"
    ew = f"{'E' if lon0 >= 0 else 'W'}{abs(lon0):03d}"
    return ns + ew


def parse_last_ifd(header: bytes) -> dict:
    """Width, tile size, offsets and byte counts of the last image (the smallest overview) of a classic TIFF."""
    if header[:2] != b"II" or struct.unpack("<H", header[2:4])[0] != 42:
        raise ValueError("not a little-endian classic TIFF")

    def values(ty, count, raw):
        fmt = {3: "H", 4: "I", 16: "Q"}[ty]
        size = struct.calcsize(fmt) * count
        if size <= 4:
            return list(struct.unpack("<" + fmt * count, raw[:size]))
        ptr = struct.unpack("<I", raw)[0]
        if ptr + size > len(header):
            raise ValueError("TIFF tag data beyond the header range")
        return list(struct.unpack("<" + fmt * count, header[ptr:ptr + size]))

    off, last = struct.unpack("<I", header[4:8])[0], None
    while off:
        if off + 2 > len(header):
            raise ValueError("TIFF directory beyond the header range")
        n = struct.unpack("<H", header[off:off + 2])[0]
        tags = {}
        for k in range(n):
            e = header[off + 2 + 12 * k: off + 14 + 12 * k]
            tag, ty, count = struct.unpack("<HHI", e[:8])
            tags[tag] = (ty, count, e[8:12])
        off = struct.unpack("<I", header[off + 2 + 12 * n: off + 6 + 12 * n])[0]
        last = tags
    out = {
        "width": values(*last[256])[0],
        "height": values(*last[257])[0],
        "tile_w": values(*last[322])[0],
        "tile_h": values(*last[323])[0],
        "compression": values(*last[259])[0],
        "predictor": values(*last[317])[0] if 317 in last else 1,
        "offsets": values(*last[324]),
        "counts": values(*last[325]),
    }
    if out["compression"] != 8 or out["predictor"] != 1:
        raise ValueError(f"unsupported overview encoding {out['compression']}/{out['predictor']}")
    if len(out["offsets"]) != 1 or out["width"] > out["tile_w"] or out["height"] > out["tile_h"]:
        raise ValueError("the smallest overview is expected to be one tile")
    return out


def downsample(pixels: bytes, stride: int, size: int, out: int) -> list[str]:
    """Rows of `out` characters, each the most common class of its block (no-data loses to any class)."""
    rows = []
    for r in range(out):
        r0, r1 = r * size // out, (r + 1) * size // out
        line = []
        for c in range(out):
            c0, c1 = c * size // out, (c + 1) * size // out
            counts = Counter(pixels[y * stride + x] for y in range(r0, r1) for x in range(c0, c1))
            counts.pop(0, None)
            code = TO_NLCD.get(counts.most_common(1)[0][0], 0) if counts else 0
            line.append(LEGEND[code])
        rows.append("".join(line))
    return rows


class WorldCover(Source):
    info = SourceInfo(
        id="worldcover",
        title="ESA WorldCover 10 m 2021 v200",
        publisher="European Space Agency (ESA)",
        homepage="https://esa-worldcover.org/",
        license="CC BY 4.0. © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) "
        "processed by ESA WorldCover consortium",
        description="Cobertura do solo mundial (floresta, arbustos, campo, lavoura, área construída, áreas úmidas, "
        "mangue) lida da menor versão interna de cada bloco (cerca de 590 m) e reduzida a cerca de 2,4 km pela "
        "classe mais comum. O bioma de cada hexágono sai de umas 400 amostras dentro dele. Não separa pasto de campo.",
        used_for=["Cobertura do solo de cada hexágono", "Parcelas de floresta, lavoura e área construída"],
    )

    def _tiles(self) -> list[str]:
        with open(self.raw_dir / "grid.geojson", encoding="utf-8") as f:
            names = {feat["properties"]["ll_tile"] for feat in json.load(f)["features"]}
        wanted = []
        for lat0 in range(int(LAT[0]) - int(LAT[0]) % TILE_DEG, int(LAT[1]), TILE_DEG):
            for lon0 in range(int(LON[0]) - int(LON[0]) % TILE_DEG, int(LON[1]), TILE_DEG):
                if (n := tile_name(lat0, lon0)) in names:
                    wanted.append(n)
        return wanted

    def fetch(self, force=False):
        self.download(GRID, "grid.geojson", force=force)
        for name in self._tiles():
            url = TILE.format(name=name)
            head = self.download(url, f"tiles/{name}.head", force=force,
                                 headers={"Range": f"bytes=0-{HEADER_BYTES - 1}"}, expect_binary=True)
            ifd = parse_last_ifd(head.read_bytes())
            a, n = ifd["offsets"][0], ifd["counts"][0]
            self.download(url, f"tiles/{name}.ovr", force=force,
                          headers={"Range": f"bytes={a}-{a + n - 1}"}, expect_binary=True)

    def process(self):
        tiles = self._tiles()
        lon0 = LON[0] - LON[0] % TILE_DEG
        lat_top = LAT[1] - LAT[1] % TILE_DEG + TILE_DEG
        lat_bottom = LAT[0] - LAT[0] % TILE_DEG
        cols = int((LON[1] - lon0 + TILE_DEG - 1) // TILE_DEG) * OUT
        nrows = int((lat_top - lat_bottom) // TILE_DEG) * OUT
        grid = [["."] * cols for _ in range(nrows)]
        files = ["grid.geojson"]
        for name in tiles:
            ifd = parse_last_ifd((self.raw_dir / f"tiles/{name}.head").read_bytes())
            raw = zlib.decompress((self.raw_dir / f"tiles/{name}.ovr").read_bytes())
            rows = downsample(raw, ifd["tile_w"], ifd["width"], OUT)
            lat = int(name[1:3]) * (1 if name[0] == "N" else -1)
            lon = int(name[4:7]) * (1 if name[3] == "E" else -1)
            r0 = int((lat_top - (lat + TILE_DEG)) // TILE_DEG) * OUT
            c0 = int((lon - lon0) // TILE_DEG) * OUT
            for r, line in enumerate(rows):
                grid[r0 + r][c0:c0 + OUT] = line
            files += [f"tiles/{name}.head", f"tiles/{name}.ovr"]
        step = TILE_DEG / OUT
        return {
            "vintage": "ESA WorldCover 2021 v200",
            "_files": files,
            "crs": "lonlat",
            # pixel (r, c) is centred on lon x0 + c·dx, lat y0 + r·dy
            "x0": lon0 + step / 2,
            "dx": step,
            "y0": lat_top - step / 2,
            "dy": -step,
            "cols": cols,
            "legend": {ch: code for code, ch in LEGEND.items()},
            "rows": ["".join(r) for r in grid],
        }
