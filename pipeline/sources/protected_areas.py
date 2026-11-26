"""Protected areas: indigenous lands (Funai) and conservation units (CNUC, Ministério do Meio Ambiente).

Both read from the ArcGIS map services of Infra S.A. (the federal planning company), which republish the official
layers with their attributes; Funai's own geoserver refuses feature downloads. Geometry comes simplified to about 1 km
(maxAllowableOffset), enough to say which map hexes (~43 km) an area covers.
"""

from __future__ import annotations

import json
import urllib.parse

from ..core.source import Source, SourceInfo

BASE = "https://geo.infrasa.gov.br/server/rest/services"
LAYERS = {
    "ti": ("Terras_Ind%C3%ADgenas/MapServer/0",
           "terrai_codigo,terrai_nome,etnia_nome,fase_ti,modalidade_ti,superficie_perimetro_ha,uf_sigla"),
    "uc": ("Unidades_de_Conserva%C3%A7%C3%A3o/MapServer/0",
           "cd_cnuc,nome_uc,categoria,grupo,esfera,ha_total,cria_ano,uf"),
}
PAGE = 500
SIMPLIFY_DEG = 0.01


class ProtectedAreas(Source):
    info = SourceInfo(
        id="protected_areas",
        title="Terras indígenas (Funai) e unidades de conservação (CNUC)",
        publisher="Fundação Nacional dos Povos Indígenas (Funai) e Ministério do Meio Ambiente (Cadastro Nacional de "
        "Unidades de Conservação), pelos serviços de mapa da Infra S.A.",
        homepage="https://geo.infrasa.gov.br/server/rest/services",
        license="Dados públicos do governo federal; citar Funai e MMA/CNUC",
        description="Os contornos das terras indígenas reconhecidas pela Funai, com a etnia e a fase do reconhecimento "
        "(em estudo, delimitada, declarada, homologada, regularizada), e das unidades de conservação federais, estaduais "
        "e municipais do cadastro nacional, com a categoria e o grupo (proteção integral ou uso sustentável).",
        used_for=["Camada do mapa: áreas protegidas", "Por quê"],
    )

    def _url(self, kind, offset):
        path, fields = LAYERS[kind]
        q = {"where": "1=1", "outFields": fields, "returnGeometry": "true", "outSR": "4326", "f": "geojson",
             "maxAllowableOffset": SIMPLIFY_DEG, "resultOffset": offset, "resultRecordCount": PAGE, "orderByFields": "objectid" if kind == "ti" else "id"}
        return f"{BASE}/{path}/query?{urllib.parse.urlencode(q)}"

    def fetch(self, force=False):
        for kind in LAYERS:
            offset = 0
            while True:
                p = self.download(self._url(kind, offset), f"{kind}_{offset:05d}.geojson", force=force)
                n = len(json.loads(p.read_text(encoding="utf-8")).get("features", []))
                if n < PAGE:
                    break
                offset += PAGE

    def process(self):
        out, files = {"ti": [], "uc": []}, []
        for p in sorted(self.raw_dir.glob("*.geojson")):
            kind = p.name.split("_")[0]
            files.append(p.name)
            for f in json.loads(p.read_text(encoding="utf-8")).get("features", []):
                if f.get("geometry"):
                    out[kind].append({"props": f["properties"], "geometry": f["geometry"]})
        return {"vintage": "Funai e CNUC (Infra S.A.), lido em 2026", "_files": files, **out}
