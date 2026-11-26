"""UNESCO World Heritage List: the Brazilian sites, with their coordinates (UNESCO open data API)."""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo

URL = ("https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records?limit=100&refine=states_names%3ABrazil"
       "&select=name_en,id_no,category,date_inscribed,coordinates,danger")
FILE = "whc_brazil.json"

# The official Portuguese names (IPHAN / UNESCO Brasil); the API gives English and French only.
NAME_PT = {
    124: "Cidade Histórica de Ouro Preto", 189: "Centro Histórico de Olinda", 275: "Ruínas de São Miguel das Missões",
    309: "Centro Histórico de Salvador", 334: "Santuário do Bom Jesus de Congonhas", 355: "Parque Nacional do Iguaçu",
    445: "Brasília", 606: "Parque Nacional da Serra da Capivara", 821: "Centro Histórico de São Luís",
    890: "Centro Histórico de Diamantina", 892: "Reservas da Mata Atlântica da Costa do Descobrimento",
    893: "Reservas da Mata Atlântica do Sudeste", 993: "Centro Histórico da Cidade de Goiás",
    998: "Complexo de Conservação da Amazônia Central", 999: "Área de Conservação do Pantanal",
    1000: "Ilhas Atlânticas Brasileiras: Fernando de Noronha e Atol das Rocas",
    1035: "Áreas Protegidas do Cerrado: Chapada dos Veadeiros e Parque Nacional das Emas",
    1100: "Rio de Janeiro, Paisagens Cariocas entre a Montanha e o Mar",
    1272: "Praça de São Francisco em São Cristóvão", 1308: "Paraty e Ilha Grande: Cultura e Biodiversidade",
    1493: "Conjunto Moderno da Pampulha", 1548: "Sítio Arqueológico Cais do Valongo", 1611: "Parque Nacional dos Lençóis Maranhenses",
    1620: "Sítio Roberto Burle Marx", 1747: "Cânion do Rio Peruaçu", 1774: "Teatros da Amazônia",
}
CATEGORY_PT = {"Natural": "natural", "Cultural": "cultural", "Mixed": "misto"}


class UnescoWhc(Source):
    info = SourceInfo(
        id="unesco_whc",
        title="Lista do Patrimônio Mundial (UNESCO), sítios do Brasil",
        publisher="UNESCO, Centro do Patrimônio Mundial",
        homepage="https://whc.unesco.org/en/statesparties/br",
        license="Dados abertos da UNESCO (CC BY-SA 3.0 IGO); citar a fonte",
        description="Todos os sítios brasileiros inscritos na Lista do Patrimônio Mundial, com categoria (natural, "
        "cultural ou misto), ano de inscrição e coordenadas. São as maravilhas do mapa.",
        used_for=["Maravilhas"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force)

    def process(self):
        rows = json.loads((self.raw_dir / FILE).read_text(encoding="utf-8"))["results"]
        sites = []
        for r in rows:
            pts = ((r.get("coordinates") or {}).get("geometry") or {}).get("coordinates") or []
            sites.append({"id": int(r["id_no"]), "name": NAME_PT.get(int(r["id_no"]), r["name_en"]), "name_en": r["name_en"],
                          "category": CATEGORY_PT.get(r["category"], r["category"]), "inscribed": int(r["date_inscribed"]),
                          "danger": bool(r.get("danger")), "points": pts})
        return {"vintage": "Lista do Patrimônio Mundial (UNESCO)", "_files": [FILE], "sites": sites}
