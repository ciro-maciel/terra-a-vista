"""Atlas Digital de Desastres no Brasil: every disaster a municipality reported to the national civil defence
(S2iD and its paper predecessors), 1991 to 2025, with the people killed, made homeless and displaced.

A record is a municipality declaring a disaster (or having it recognised by the federal government): it counts events
the town reported, not every flood or drought that happened. Digital reporting began in 2013 (S2iD), and records grow
from then on partly because reporting got easier.
"""

from __future__ import annotations

import csv
import io

from ..core.source import Source, SourceInfo

URL = "https://atlasdigital.mdr.gov.br/arquivos/2026/BD_Atlas_1991_2025_v1.1_2026.08.06_Consolidado.csv"
FILE = "BD_Atlas_1991_2025_Consolidado.csv"
GROUPS = {
    "Estiagem e Seca": "drought",
    "Enxurradas": "rain", "Chuvas Intensas": "rain", "Inundações": "rain", "Alagamentos": "rain",
    "Movimento de Massa": "landslide", "Erosão": "landslide",
    "Vendavais e Ciclones": "wind", "Granizo": "wind", "Tornado": "wind",
}


def _int(s):
    try:
        return int(float((s or "0").replace(",", ".")))
    except ValueError:
        return 0


class AtlasDesastres(Source):
    info = SourceInfo(
        id="atlas_desastres",
        title="Atlas Digital de Desastres no Brasil, 1991 a 2025",
        publisher="Ministério da Integração e do Desenvolvimento Regional (Defesa Civil Nacional) e Ceped/UFSC",
        homepage="https://atlasdigital.mdr.gov.br/",
        license="Dados públicos do governo federal; citar a fonte (MIDR/Sedec, Atlas Digital de Desastres no Brasil)",
        description="Cada desastre que um município registrou na Defesa Civil de 1991 a 2025 (secas, enxurradas, "
        "inundações, deslizamentos, vendavais e outros), com os mortos, desabrigados e desalojados que ele declarou.",
        used_for=["Linha do tempo: Desastres", "Por quê"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force)

    def process(self):
        text = (self.raw_dir / FILE).read_bytes().decode("latin-1")
        out: dict[str, dict[str, dict[str, int]]] = {}
        biggest = []
        for r in csv.DictReader(io.StringIO(text), delimiter=";"):
            code, year = (r.get("Cod_IBGE_Mun") or "").strip(), (r.get("Data_Evento") or "")[-4:]
            if not code.isdigit() or not year.isdigit():
                continue
            g = GROUPS.get(r["descricao_tipologia"], "other")
            dead = _int(r["DH_MORTOS"])
            homeless = _int(r["DH_DESABRIGADOS"]) + _int(r["DH_DESALOJADOS"])
            m = out.setdefault(code, {})
            for key, v in ((g, 1), ("dead", dead), ("homeless", homeless)):
                d = m.setdefault(key, {})
                d[year] = d.get(year, 0) + v
            if dead >= 5:
                biggest.append({"code": code, "year": int(year), "date": r["Data_Evento"], "type": r["descricao_tipologia"],
                                "dead": dead, "homeless": homeless})
        biggest.sort(key=lambda e: -e["dead"])
        return {"vintage": "Atlas Digital de Desastres, 1991 a 2025", "_files": [FILE], "municipalities": out,
                "deadliest": biggest[:400]}
