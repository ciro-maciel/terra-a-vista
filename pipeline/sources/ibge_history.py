"""IBGE history: the population counted by every Census since 1970, municipal GDP since 2002 and the GDP deflator.

Population comes only from Census counts (1970, 1980, 1991, 2000 and 2010 from table 202; 2022 is ibge_census),
never from the yearly estimates between them: those were projected from the previous Census and jump when the next
one counts. A municipality appears from the first Census after it was created; before that its people were counted
in the municipality it split from. GDP is in current reais (table 5938, R$ mil); the yearly change of the GDP
deflator (national accounts, table 6784) turns it into reais of the latest GDP year, the way the IBGE measures real
growth. (The IPCA would measure consumer prices instead, and overstate it: +109% against about +60%, 2002 to 2023.)
"""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo
from .ibge_sidra import LEVELS, MISSING, SIDRA, ZERO

CENSUS_YEARS = [1970, 1980, 1991, 2000, 2010]
GDP_FIRST, GDP_LAST = 2002, 2023


def _rows(path):
    return json.loads(open(path, encoding="utf-8").read())[1:]


def _value(v):
    return None if v in MISSING else 0.0 if v == ZERO else float(v)


class IbgeHistory(Source):
    info = SourceInfo(
        id="ibge_history",
        title="Censos Demográficos de 1970 a 2010, PIB dos Municípios de 2002 a 2023 e deflator do PIB",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/202",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Censos Demográficos, PIB dos Municípios e Contas Nacionais)",
        description="A população contada por cada Censo desde 1970 (tabela 202), o PIB a preços correntes de cada "
        f"município de {GDP_FIRST} a {GDP_LAST} (tabela 5938) e a variação anual do deflator do PIB (Contas Nacionais, "
        f"tabela 6784), usada para levar o PIB a reais de {GDP_LAST}, como o IBGE mede o crescimento real. As estimativas anuais entre um Censo e outro ficam de fora: elas saltam "
        "quando o Censo seguinte conta.",
        used_for=["Linha do tempo", "Por quê"],
    )

    def _pop(self, level):
        return f"t202_pop_{level}.json"

    def _gdp(self, year, level):
        return f"t5938_gdp_{year}_{level}.json"

    def fetch(self, force=False):
        years = ",".join(map(str, CENSUS_YEARS))
        for level, n in LEVELS.items():
            self.download(f"{SIDRA}/t/202/{n}/v/93/p/{years}/c1/0/c2/0", self._pop(level), force=force)
            for y in range(GDP_FIRST, GDP_LAST + 1):
                self.download(f"{SIDRA}/t/5938/{n}/v/37/p/{y}", self._gdp(y, level), force=force)
        self.download(f"{SIDRA}/t/6784/n1/all/v/9811/p/all", "t6784_deflator.json", force=force)

    def process(self):
        out = {}
        files = ["t6784_deflator.json"]
        for level in LEVELS:
            pop: dict[str, dict] = {}
            for r in _rows(self.raw_dir / self._pop(level)):
                v = _value(r["V"])
                pop.setdefault(r["D1C"], {})[r["D3C"]] = None if v is None else round(v)
            gdp: dict[str, dict] = {}
            for y in range(GDP_FIRST, GDP_LAST + 1):
                files.append(self._gdp(y, level))
                for r in _rows(self.raw_dir / self._gdp(y, level)):
                    v = _value(r["V"])
                    gdp.setdefault(r["D1C"], {})[str(y)] = None if v is None else round(v * 1000)
            files.append(self._pop(level))
            out[level] = {"population": pop, "gdp": gdp}
        change = {r["D3C"]: _value(r["V"]) for r in _rows(self.raw_dir / "t6784_deflator.json")}
        deflator, level = {}, 100.0  # an index of the GDP deflator, 100 in the first year with a change
        for y in sorted(change):
            if change[y] is None:
                continue
            level *= 1 + change[y] / 100
            deflator[y] = level
        return {"vintage": f"Censos 1970 a 2010, PIB dos Municípios {GDP_FIRST} a {GDP_LAST}", "_files": files,
                "census_years": CENSUS_YEARS, "gdp_years": list(range(GDP_FIRST, GDP_LAST + 1)),
                "deflator_index": deflator, **out}
