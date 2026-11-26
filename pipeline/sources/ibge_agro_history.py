"""IBGE PAM and PPM since 1975: the harvested area of the main crops and the cattle herd of every municipality, every
five years. A municipality created later has no value ("...") in the years before it existed: its fields were counted
in the municipality it split from."""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo
from .ibge_sidra import MISSING, SIDRA, ZERO

FIRST, LAST, STEP = 1975, 2025, 5
YEARS = list(range(FIRST, LAST + 1, STEP))
# key → (table, variable, classification, category)
SERIES = {
    "crops": (5457, 216, 782, 0),        # every crop, temporary and permanent: hectares harvested (planted area starts only in 1988)
    "soy": (5457, 216, 782, 40124),
    "corn": (5457, 216, 782, 40122),
    "sugarcane": (5457, 216, 782, 40106),
    "coffee": (5457, 216, 782, 40139),
    "cattle": (3939, 105, 79, 2670),       # head of cattle on 31 December
}


class IbgeAgroHistory(Source):
    info = SourceInfo(
        id="ibge_agro_history",
        title=f"Produção Agrícola e Pecuária Municipal de {FIRST} a {LAST} (tabelas 5457 e 3939)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/5457",
        license="Dados públicos do IBGE; citar a fonte (IBGE, PAM e PPM)",
        description=f"A área colhida de todas as lavouras e de soja, milho, cana e café (hectares) e o rebanho bovino "
        f"(cabeças) de cada município, de cinco em cinco anos de {FIRST} a {LAST}.",
        used_for=["Linha do tempo: Lavoura", "Por quê"],
    )

    def _file(self, key, year):
        return f"{key}_{year}.json"

    def fetch(self, force=False):
        for key, (t, v, c, cat) in SERIES.items():
            for y in YEARS:
                self.download(f"{SIDRA}/t/{t}/n6/all/v/{v}/p/{y}/c{c}/{cat}", self._file(key, y), force=force)

    def process(self):
        out, files = {}, []
        for key in SERIES:
            d: dict[str, dict] = {}
            for y in YEARS:
                files.append(self._file(key, y))
                rows = json.loads((self.raw_dir / self._file(key, y)).read_text(encoding="utf-8"))[1:]
                for r in rows:
                    v = r["V"]
                    d.setdefault(r["D1C"], {})[str(y)] = None if v in MISSING else 0.0 if v == ZERO else float(v)
            out[key] = d
        return {"vintage": f"PAM e PPM {FIRST} a {LAST}", "_files": files, "years": [str(y) for y in YEARS], **out}
