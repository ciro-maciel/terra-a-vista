"""Comex Stat: Brazil's exports by municipality, destination country and product (SH4), one year.

Read from the Comex Stat API (api-comexstat.mdic.gov.br), whose certificate is valid; the bulk files' host
(balanca.economia.gov.br) served an expired one when this was written. The municipality is the tax domicile of the
exporting company (domicílio fiscal), not always where the goods were grown or mined: a trader based in São Paulo
exporting soy from Mato Grosso counts in São Paulo. The API names municipalities "Name - UF"; they are matched to the
IBGE code by name and state.
"""

from __future__ import annotations

import json
import unicodedata

from ..core.source import Source, SourceInfo

API = "https://api-comexstat.mdic.gov.br"
YEAR = 2025


def norm(name: str) -> str:
    """Lower case, no accents, no punctuation: 'Pau D'Arco - PA' and 'Pau d'Arco' compare equal."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    return "".join(ch for ch in s if ch.isalnum())


def split_name(text: str) -> tuple[str, str]:
    name, _, uf = text.rpartition(" - ")
    return name, uf


class ComexStat(Source):
    info = SourceInfo(
        id="comex_stat",
        title=f"Comex Stat: exportações por município, país de destino e produto, {YEAR}",
        publisher="Secretaria de Comércio Exterior (Secex), Ministério do Desenvolvimento, Indústria, Comércio e Serviços",
        homepage="https://comexstat.mdic.gov.br/",
        license="Dados abertos do governo federal; citar a fonte (Secex/MDIC, Comex Stat)",
        description=f"O valor FOB, em dólares, de tudo o que saiu do Brasil em {YEAR}, por município da empresa "
        "exportadora, país de destino e produto (posição SH4 do Sistema Harmonizado). O município é o domicílio "
        "fiscal da empresa, não sempre onde a mercadoria foi produzida.",
        used_for=["Conselheiro do comércio: exportação", "Por quê"],
    )

    def _query(self, detail):
        return {"flow": "export", "monthDetail": False, "period": {"from": f"{YEAR}-01", "to": f"{YEAR}-12"},
                "details": ["city", detail], "metrics": ["metricFOB"]}

    def fetch(self, force=False):
        for detail in ["country", "heading"]:
            self.download_post(f"{API}/cities", f"exp_{YEAR}_city_{detail}.json", self._query(detail), force=force)

    def process(self):
        flows, products, files = {}, {}, []
        for detail in ["country", "heading"]:
            f = f"exp_{YEAR}_city_{detail}.json"
            files.append(f)
            rows = json.loads((self.raw_dir / f).read_text(encoding="utf-8"))["data"]["list"]
            key = "country" if detail == "country" else "headingCode"
            for r in rows:
                if detail == "heading":
                    products[r["headingCode"]] = r["heading"]
                name, uf = split_name(r["noMunMinsgUf"])
                m = flows.setdefault(f"{uf}|{norm(name)}", {"name": name, "uf": uf, "country": {}, "heading": {}})
                m[detail][r[key]] = m[detail].get(r[key], 0) + round(float(r["metricFOB"] or 0))
        return {"vintage": f"Comex Stat {YEAR}", "_files": files, "year": YEAR, "products": products, "municipalities": flows}
