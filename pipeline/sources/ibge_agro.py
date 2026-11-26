"""IBGE PAM and PPM 2025: crop production and the cattle herd, per municipality."""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo
from .ibge_sidra import MISSING, ZERO

SIDRA = "https://apisidra.ibge.gov.br/values"
YEAR = 2025
# product key → (table, variable, classification, category, unit)
PRODUCTS = {
    "soy": (5457, 214, 782, 40124, "t"), "corn": (5457, 214, 782, 40122, "t"),
    "sugarcane": (5457, 214, 782, 40106, "t"), "coffee": (5457, 214, 782, 40139, "t"),
    "orange": (5457, 214, 782, 40151, "t"), "cotton": (5457, 214, 782, 40099, "t"),
    "rice": (5457, 214, 782, 40102, "t"), "beans": (5457, 214, 782, 40112, "t"),
    "cassava": (5457, 214, 782, 40119, "t"), "wheat": (5457, 214, 782, 40127, "t"),
    "cocoa": (5457, 214, 782, 40138, "t"), "banana": (5457, 214, 782, 40136, "t"),
    "grape": (5457, 214, 782, 40274, "t"), "tobacco": (5457, 214, 782, 40113, "t"),
    "cattle": (3939, 105, 79, 2670, "cabeças"), "pigs": (3939, 105, 79, 32794, "cabeças"),
    "chickens": (3939, 105, 79, 32796, "cabeças"),
}


class IbgeAgro(Source):
    info = SourceInfo(
        id="ibge_agro",
        title=f"Produção Agrícola Municipal e Pesquisa da Pecuária Municipal {YEAR} (tabelas 5457 e 3939)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/5457",
        license="Dados públicos do IBGE; citar a fonte (IBGE, PAM e PPM)",
        description=f"Toneladas colhidas de soja, milho, cana-de-açúcar, café, laranja, algodão, arroz, feijão, mandioca, "
        f"trigo, cacau, banana, uva e fumo, e os rebanhos de bois, porcos e galinhas, por município, em {YEAR}.",
        used_for=["Agro como recursos"],
    )

    def _file(self, key):
        return f"{key}_{YEAR}.json"

    def fetch(self, force=False):
        for key, (t, v, c, cat, _) in PRODUCTS.items():
            self.download(f"{SIDRA}/t/{t}/n6/all/v/{v}/p/{YEAR}/c{c}/{cat}", self._file(key), force=force)

    def process(self):
        out = {}
        for key in PRODUCTS:
            rows = json.loads((self.raw_dir / self._file(key)).read_text(encoding="utf-8"))[1:]
            vals = {}
            for r in rows:
                v = r["V"]
                vals[r["D1C"]] = None if v in MISSING else 0 if v == ZERO else float(v)
            out[key] = vals
        return {"vintage": f"PAM e PPM {YEAR}", "_files": [self._file(k) for k in PRODUCTS], "year": YEAR,
                "units": {k: p[4] for k, p in PRODUCTS.items()}, "products": out}
