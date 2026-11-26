"""ANM SIGMINE: active mining concessions (concessão de lavra) for the metals and coal the map shows."""

from __future__ import annotations

import json
from urllib.parse import urlencode

from ..core.geo import geojson_rings
from ..core.source import Source, SourceInfo

QUERY = "https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query"
PAGE = 1000
# SIGMINE substance names → the map's mineral. Each concession counts once, under its substance.
MINERAL = {
    "FERRO": "iron", "MINÉRIO DE FERRO": "iron",
    "OURO": "gold", "MINÉRIO DE OURO": "gold",
    "COBRE": "copper", "MINÉRIO DE COBRE": "copper",
    "BAUXITA": "bauxite", "MINÉRIO DE ALUMÍNIO": "bauxite", "ALUMÍNIO": "bauxite",
    "MANGANÊS": "manganese", "MINÉRIO DE MANGANÊS": "manganese",
    "NÍQUEL": "nickel", "MINÉRIO DE NÍQUEL": "nickel",
    "CASSITERITA": "tin", "ESTANHO": "tin", "MINÉRIO DE ESTANHO": "tin",
    "CARVÃO": "coal_mine", "CARVÃO MINERAL": "coal_mine",
}


class AnmSigmine(Source):
    info = SourceInfo(
        id="anm_sigmine",
        title="SIGMINE: processos minerários ativos (concessões de lavra)",
        publisher="Agência Nacional de Mineração (ANM)",
        homepage="https://geo.anm.gov.br/",
        license="Dados abertos da ANM; citar a fonte",
        description="As concessões de lavra ativas de ferro, ouro, cobre, bauxita, manganês, níquel, estanho e "
        "carvão, com o polígono e a área concedida. É a área com direito de lavra, não a produção: a ANM não "
        "publica a produção por mina com posição.",
        used_for=["Minas como recursos"],
    )

    def _where(self):
        subs = ",".join("'" + s.replace("'", "''") + "'" for s in MINERAL)
        return f"FASE='CONCESSÃO DE LAVRA' AND SUBS IN ({subs})"

    def _url(self, offset):
        return QUERY + "?" + urlencode({
            "where": self._where(), "outFields": "PROCESSO,NOME,SUBS,AREA_HA,UF", "returnGeometry": "true",
            "outSR": "4326", "maxAllowableOffset": "0.005", "resultOffset": str(offset),
            "resultRecordCount": str(PAGE), "orderByFields": "OBJECTID", "f": "geojson"})

    def fetch(self, force=False):
        offset = 0
        while True:
            path = self.download(self._url(offset), f"concessions_{offset:05d}.geojson", force=force)
            n = len(json.loads(path.read_text(encoding="utf-8")).get("features", []))
            if n < PAGE:
                break
            offset += PAGE

    def process(self):
        files = sorted(p.name for p in self.raw_dir.glob("concessions_*.geojson"))
        out = []
        for name in files:
            for f in json.loads((self.raw_dir / name).read_text(encoding="utf-8")).get("features", []):
                p = f["properties"]
                rings = geojson_rings(f["geometry"]) if f.get("geometry") else []
                pts = [q for r in rings for q in r]
                if not pts:
                    continue
                out.append({"process": p["PROCESSO"], "holder": (p.get("NOME") or "").strip(), "subs": p["SUBS"],
                            "mineral": MINERAL.get(p["SUBS"]), "ha": p.get("AREA_HA"), "uf": p.get("UF"),
                            "lon": sum(q[0] for q in pts) / len(pts), "lat": sum(q[1] for q in pts) / len(pts)})
        return {"vintage": "SIGMINE (ANM)", "_files": files, "concessions": out}
