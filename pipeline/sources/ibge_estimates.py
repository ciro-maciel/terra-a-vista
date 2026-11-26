"""IBGE population estimates (Estimativas da População, table 6579): 2024 to the latest year.

The 2024 and later estimates are built on the 2022 Census with a coverage adjustment, so they are higher than the
Census count (212.6 million in 2024 against 203.1 million counted in 2022). Growth is therefore measured between
estimates only (FIRST to the latest year), never from the Census count to an estimate.
"""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo
from .ibge_sidra import LEVELS, MISSING, SIDRA, ZERO

FIRST, LAST = 2024, 2026
YEARS = list(range(FIRST, LAST + 1))


class IbgeEstimates(Source):
    info = SourceInfo(
        id="ibge_estimates",
        title="Estimativas da população residente (tabela 6579)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/6579",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Estimativas da População)",
        description=f"População estimada em 1º de julho de cada ano, de {FIRST} a {LAST}, por município, estado e país. "
        "O crescimento do mapa compara só estimativas entre si: elas incluem um ajuste de cobertura do Censo 2022 e "
        "ficam acima da contagem do Censo.",
        used_for=["Crescimento da população", "Série anual das cidades"],
    )

    def _file(self, level):
        return f"t6579_{FIRST}_{LAST}_{level}.json"

    def fetch(self, force=False):
        years = ",".join(map(str, YEARS))
        for level, n in LEVELS.items():
            self.download(f"{SIDRA}/t/6579/{n}/v/9324/p/{years}", self._file(level), force=force)

    def process(self):
        out = {}
        for level in LEVELS:
            rows = json.loads((self.raw_dir / self._file(level)).read_text(encoding="utf-8"))[1:]
            series: dict[str, dict] = {}
            for r in rows:
                v = r["V"]
                series.setdefault(r["D1C"], {})[r["D3C"]] = None if v in MISSING else 0 if v == ZERO else int(v)
            out[level] = series
        return {"vintage": f"Estimativas da População {LAST}", "_files": [self._file(lv) for lv in LEVELS],
                "years": YEARS, **out}
