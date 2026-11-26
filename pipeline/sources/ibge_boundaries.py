"""IBGE state (UF) and municipality outlines and names, from the IBGE data service API."""

import json

from ..core.geo import geojson_rings, load_geojson
from ..core.source import Source, SourceInfo

API = "https://servicodados.ibge.gov.br/api"
GEOJSON = "formato=application/vnd.geo%2Bjson"
FILES = {
    # Outlines of the whole country, split into states or into municipalities. "minima" is the coarsest
    # generalisation, plenty for 25 km hexes; the states use "intermediaria" for smoother coasts.
    "states.geojson": f"{API}/v3/malhas/paises/BR?{GEOJSON}&qualidade=intermediaria&intrarregiao=UF",
    "municipalities.geojson": f"{API}/v3/malhas/paises/BR?{GEOJSON}&qualidade=minima&intrarregiao=municipio",
    "states.json": f"{API}/v1/localidades/estados",
    "municipalities.json": f"{API}/v1/localidades/municipios",
}


class IbgeBoundaries(Source):
    info = SourceInfo(
        id="ibge_boundaries",
        title="Malhas territoriais e localidades (UFs e municípios)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://servicodados.ibge.gov.br/api/docs/malhas?versao=3",
        license="Dados públicos do IBGE; citar a fonte (IBGE)",
        description="Contornos generalizados das 27 unidades da federação e dos 5.570 municípios, com nomes e "
        "códigos. Decidem a que estado e a que município cada hexágono pertence.",
        used_for=["Mapa: terra e água", "Divisas estaduais", "Município de cada hexágono"],
    )

    def fetch(self, force=False):
        for name, url in FILES.items():
            self.download(url, name, force=force)

    def process(self):
        with open(self.raw_dir / "states.json", encoding="utf-8") as f:
            uf = {str(s["id"]): s for s in json.load(f)}
        with open(self.raw_dir / "municipalities.json", encoding="utf-8") as f:
            mun = {str(m["id"]): m for m in json.load(f)}

        states = []
        for feat in load_geojson(self.raw_dir / "states.geojson"):
            code = str(feat["properties"]["codarea"])
            s = uf[code]
            states.append({"fips": code, "abbr": s["sigla"], "name": s["nome"], "rings": geojson_rings(feat["geometry"])})

        counties, water = [], []
        for feat in load_geojson(self.raw_dir / "municipalities.geojson"):
            code = str(feat["properties"]["codarea"])
            m = mun.get(code)
            if m is None:
                # The municipal mesh also carries the big coastal lagoons (Lagoa dos Patos, Lagoa Mirim) as
                # areas outside any municipality: they are water, not a place.
                water.append(code)
                continue
            counties.append({"geoid": code, "name": m["nome"], "state_fips": code[:2], "rings": geojson_rings(feat["geometry"])})

        return {
            "vintage": "Malha municipal do IBGE (API v3), localidades v1",
            "_files": list(FILES),
            "states": states,
            "counties": counties,
            "water_areas": water,
        }
