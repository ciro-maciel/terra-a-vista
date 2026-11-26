"""ANP GeoMaps (WFS): oil and gas fields, offshore production units (platforms) and refineries."""

from __future__ import annotations

import json
import re

from ..core.geo import geojson_rings
from ..core.source import Source, SourceInfo

WFS = ("https://geomaps.anp.gov.br/geoserver/ows?service=WFS&version=1.0.0&request=GetFeature"
       "&outputFormat=application/json&typeName=")
LAYERS = {"fields.json": "sisroc:field_shp_geoanp", "units.json": "geoanp:unidade_de_producao",
          "refineries.json": "geoanp:refinarias"}


def _dms(s) -> float | None:
    """'-03:08:44,730' → -3.1458…"""
    if s is None:
        return None
    m = re.fullmatch(r"\s*(-?)(\d+):(\d+):(\d+(?:[.,]\d+)?)\s*", str(s))
    if not m:
        return None
    v = int(m[2]) + int(m[3]) / 60 + float(m[4].replace(",", ".")) / 3600
    return -v if m[1] else v


def _centroid(rings):
    pts = [p for r in rings for p in r]
    if not pts:
        return None, None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


class AnpGeo(Source):
    info = SourceInfo(
        id="anp_geo",
        title="GeoMaps ANP: campos de produção, unidades de produção e refinarias",
        publisher="Agência Nacional do Petróleo, Gás Natural e Biocombustíveis (ANP)",
        homepage="https://geomaps.anp.gov.br/",
        license="Dados abertos da ANP; citar a fonte",
        description="Os campos de petróleo e gás (etapa, fluido principal, terra ou mar, bacia, área), as unidades "
        "de produção no mar (plataformas e FPSOs, com a capacidade de processar petróleo) e as refinarias. O pré-sal "
        "aparece onde está: no mar.",
        used_for=["Petróleo e gás como recursos", "Plataformas no mar"],
    )

    def fetch(self, force=False):
        for name, layer in LAYERS.items():
            self.download(WFS + layer, name, force=force)

    def process(self):
        load = lambda n: json.loads((self.raw_dir / n).read_text(encoding="utf-8"))["features"]
        fields = []
        for f in load("fields.json"):
            p = f["properties"]
            lon, lat = _centroid(geojson_rings(f["geometry"])) if f.get("geometry") else (None, None)
            fields.append({"name": (p.get("NOM_CAMPO") or "").title(), "stage": p.get("ETAPA"),
                           "fluid": p.get("FLUIDO_PRI"), "where": p.get("Localizaca"), "basin": p.get("NOM_BACIA"),
                           "area_km2": p.get("AREA"), "operator": p.get("OPERADOR_C"), "lon": lon, "lat": lat})
        units = []
        for f in load("units.json"):
            p, g = f["properties"], f.get("geometry") or {}
            lon, lat = (g.get("coordinates") or [None, None])[:2]
            units.append({"name": (p.get("NOM_INSTALACAO") or "").strip(), "kind": p.get("DESC_TIPO_UEP"),
                          "oil_bpd": p.get("QTD_PROCESSAMENTO_PETROLEO"), "gas": p.get("QTD_PROCESSAMENTO_GAS"),
                          "depth_m": p.get("MED_DISTANCIA_LAMINA"), "fields": p.get("DESC_ATENDIMENTOS"),
                          "owner": p.get("NOM_PROPRIETARIO"), "lon": lon, "lat": lat})
        refineries = []
        for f in load("refineries.json"):
            p = f["properties"]
            refineries.append({"name": (p.get("NOME") or "").title(), "code": p.get("SIGLA"), "uf": p.get("UF"),
                               "bpd": p.get("CAPAC_BPD"), "company": p.get("EMPRESA"),
                               "lon": _dms(p.get("LONG")), "lat": _dms(p.get("LAT"))})
        return {"vintage": "GeoMaps ANP", "_files": list(LAYERS), "fields": fields, "units": units,
                "refineries": refineries}
