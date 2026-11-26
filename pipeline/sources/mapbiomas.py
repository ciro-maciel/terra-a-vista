"""MapBiomas Coleção 11: area of every land cover and use class in every municipality, each year since 1985.

The statistics table the MapBiomas network publishes (biome × state × municipality, hectares per class per year,
Landsat 30 m). A municipality that spans two biomes has a row per biome; they are summed here. Kept per municipality
and year: total area and the hectares of the groups the map shows.
"""

from __future__ import annotations

import re
import zipfile

from ..core import xlsx
from ..core.source import Source, SourceInfo

URL = "https://drive.usercontent.google.com/download?id=1otOqymHuixvkRGVl65zTTNyfaHo46Gqk&export=download&confirm=t"
ZIP = "MAPBIOMAS_BRAZIL-COL.11-BIOME_STATE_MUNICIPALITY.zip"
SHEET = "COVERAGE_11"

# group → test on (class id, level_0, level_2). Natural = MapBiomas level 0 "Natural" (forest, savanna, grassland…).
GROUPS = {
    "natural": lambda cid, l0, l2: l0 == "Natural",
    "forest": lambda cid, l0, l2: l0 == "Natural" and l2.startswith("1."),
    "pasture": lambda cid, l0, l2: cid == 15,
    "agriculture": lambda cid, l0, l2: l2.startswith("3.2"),
    "soy": lambda cid, l0, l2: cid == 39,
    "sugarcane": lambda cid, l0, l2: cid == 20,
    "silviculture": lambda cid, l0, l2: cid == 9,
    "urban": lambda cid, l0, l2: cid == 24,
    "mining": lambda cid, l0, l2: cid == 30,
    "water": lambda cid, l0, l2: l2.startswith("5."),
}


class MapBiomas(Source):
    info = SourceInfo(
        id="mapbiomas",
        title="MapBiomas Coleção 11: cobertura e uso da terra por município, 1985 a 2025",
        publisher="Projeto MapBiomas (rede de universidades, ONGs e empresas de tecnologia)",
        homepage="https://brasil.mapbiomas.org/estatisticas/",
        license="CC BY 4.0; citar: Projeto MapBiomas, Coleção 11 da Série Anual de Mapas de Cobertura e Uso da Terra do Brasil",
        description="A área, em hectares, de cada classe de cobertura e uso da terra em cada município, ano a ano desde "
        "1985, a partir de imagens Landsat de 30 m classificadas pela rede MapBiomas. O mapa usa os grupos: vegetação "
        "nativa (todas as classes naturais), floresta, pastagem, agricultura, soja, cana, silvicultura, área urbanizada, "
        "mineração e água.",
        used_for=["Linha do tempo: Terra", "Por quê"],
    )

    def fetch(self, force=False):
        self.download(URL, ZIP, force=force, expect_binary=True)

    def process(self):
        with zipfile.ZipFile(self.raw_dir / ZIP) as z:
            name = next(n for n in z.namelist() if n.endswith(".xlsx"))
            z.extract(name, self.raw_dir)
        path = self.raw_dir / name
        it = xlsx.rows(path, SHEET)
        head = next(it)
        col = {h: i for i, h in enumerate(head)}
        ycols = [(h[1:], i) for h, i in col.items() if isinstance(h, str) and re.fullmatch(r"y\d{4}", h)]
        years = [y for y, _ in ycols]
        area: dict[str, dict[str, float]] = {}
        groups: dict[str, dict[str, dict[str, float]]] = {g: {} for g in GROUPS}
        for r in it:
            if len(r) <= ycols[-1][1] or not r[col["geocode"]]:
                continue
            code = str(r[col["geocode"]]).split(".")[0]
            cid = int(r[col["class"]]) if r[col["class"]] is not None else None
            l0, l2 = str(r[col["class_level_0"]] or ""), str(r[col["class_level_2"]] or "")
            a = area.setdefault(code, {})
            hit = [g for g, f in GROUPS.items() if f(cid, l0, l2)]
            for y, i in ycols:
                v = r[i] or 0.0
                a[y] = a.get(y, 0.0) + v
                for g in hit:
                    d = groups[g].setdefault(code, {})
                    d[y] = d.get(y, 0.0) + v
        rnd = lambda d: {c: {y: round(v, 1) for y, v in ys.items()} for c, ys in d.items()}
        path.unlink(missing_ok=True)
        return {"vintage": f"MapBiomas Coleção 11, {years[0]} a {years[-1]}", "_files": [ZIP], "years": years,
                "area_ha": rnd(area), "groups": {g: rnd(d) for g, d in groups.items()}}
