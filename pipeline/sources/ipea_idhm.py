"""IDHM (Atlas do Desenvolvimento Humano no Brasil, PNUD, Ipea and FJP) for 1991, 2000 and 2010, read from the
Ipeadata open API: the index and its three dimensions (education, longevity, income) for every municipality, state
and Brazil. The 1991 and 2000 values were recomputed on the 2010 municipal borders, so the three years compare.
The Ipeadata base has no municipal IDHM computed with the 2022 Census.
"""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo

API = "http://www.ipeadata.gov.br/api/odata4/ValoresSerie(SERCODIGO='{code}')"
SERIES = {"idhm": "ADH_IDHM", "education": "ADH_IDHM_E", "longevity": "ADH_IDHM_L", "income": "ADH_IDHM_R"}
LEVEL = {"Municípios": "municipalities", "Estados": "states", "Brasil": "nation"}


class IpeaIdhm(Source):
    info = SourceInfo(
        id="ipea_idhm",
        title="IDHM 1991, 2000 e 2010: Atlas do Desenvolvimento Humano no Brasil (pelo Ipeadata)",
        publisher="PNUD, Instituto de Pesquisa Econômica Aplicada (Ipea) e Fundação João Pinheiro",
        homepage="http://www.ipeadata.gov.br/",
        license="Dados públicos; citar a fonte (PNUD, Ipea e FJP, Atlas do Desenvolvimento Humano no Brasil)",
        description="O Índice de Desenvolvimento Humano Municipal de 1991, 2000 e 2010, de 0 a 1, e as suas três "
        "dimensões: educação (escolaridade dos adultos e fluxo escolar dos jovens), longevidade (esperança de vida ao "
        "nascer) e renda (renda per capita), calculados com os Censos e nos limites municipais de 2010.",
        used_for=["Linha do tempo: IDH", "Por quê"],
    )

    def fetch(self, force=False):
        for key, code in SERIES.items():
            self.download(API.format(code=code), f"{code}.json", force=force)

    def process(self):
        out: dict = {}
        for key, code in SERIES.items():
            for r in json.loads((self.raw_dir / f"{code}.json").read_text(encoding="utf-8"))["value"]:
                level = LEVEL.get(r["NIVNOME"])
                if not level or r["VALVALOR"] is None:
                    continue
                out.setdefault(level, {}).setdefault(key, {}).setdefault(str(r["TERCODIGO"]), {})[r["VALDATA"][:4]] = r["VALVALOR"]
        return {"vintage": "Atlas do Desenvolvimento Humano, 1991, 2000 e 2010", "_files": [f"{c}.json" for c in SERIES.values()],
                "years": ["1991", "2000", "2010"], **out}
