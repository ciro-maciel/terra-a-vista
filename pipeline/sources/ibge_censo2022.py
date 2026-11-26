"""IBGE Censo 2022, municipal tables for the lenses and the city panels (SIDRA).

Each series is one SIDRA request for one variable and one category of every classification, at the nation, state
and municipality levels, so every file holds one number per territory. Counts (not rates) are fetched where a city
must add up its municipalities: income is the total monthly earnings of workers ÷ the employed, unemployment is
the unemployed ÷ the labour force.
"""

from __future__ import annotations

from ..core.source import Source, SourceInfo
from .ibge_sidra import LEVELS, SIDRA, sidra_values

ALL = "c2/6794/c86/95251"  # sex: total; colour or race: total
SERIES = {
    "area_km2": "t/4714/{n}/v/6318/p/2022",
    "median_age": "t/9515/{n}/v/10613/p/2022",
    "ageing_index": "t/9515/{n}/v/10612/p/2022",
    "literacy": f"t/9543/{{n}}/v/2513/p/2022/{ALL}/c287/100362",
    "adults25": f"t/10061/{{n}}/v/2667/p/2022/c1568/120704/c58/108866/{ALL}",
    "adults25_degree": f"t/10061/{{n}}/v/2667/p/2022/c1568/99713/c58/108866/{ALL}",
    "earnings_total": f"t/10289/{{n}}/v/13424/p/2022/{ALL}",
    "earnings_median": f"t/10289/{{n}}/v/13537/p/2022/{ALL}",
    "labour_force": f"t/9517/{{n}}/v/1641/p/2022/c629/32386/{ALL}/c1568/120704",
    "employed": f"t/9517/{{n}}/v/1641/p/2022/c629/32387/{ALL}/c1568/120704",
    "unemployed": f"t/9517/{{n}}/v/1641/p/2022/c629/32446/{ALL}/c1568/120704",
    "households": "t/6805/{n}/v/381/p/2022/c11558/46292",
    "households_sewer": "t/6805/{n}/v/381/p/2022/c11558/72110",
    "households_water": "t/6803/{n}/v/381/p/2022/c1821/72144",
}


class IbgeCenso2022(Source):
    info = SourceInfo(
        id="ibge_censo2022",
        title="Censo Demográfico 2022: área, idade, alfabetização, instrução, trabalho, rendimento e saneamento",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://censo2022.ibge.gov.br/",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Censo Demográfico 2022)",
        description="Por município, estado e país: área territorial, idade mediana, índice de envelhecimento, taxa de "
        "alfabetização (15 anos ou mais), adultos de 25 anos ou mais com superior completo, força de trabalho, "
        "ocupados e desocupados, massa e mediana do rendimento de todos os trabalhos, e domicílios ligados à rede "
        "de esgoto e à rede de água (tabelas 4714, 9515, 9543, 10061, 9517, 10289, 6805 e 6803).",
        used_for=["Lentes", "Renda e desemprego das cidades e dos estados"],
    )

    def _file(self, key, level):
        return f"{key}_{level}.json"

    def fetch(self, force=False):
        for key, path in SERIES.items():
            for level, n in LEVELS.items():
                self.download(f"{SIDRA}/{path.format(n=n)}", self._file(key, level), force=force)

    def process(self):
        out = {lv: {} for lv in LEVELS}
        for key in SERIES:
            for level in LEVELS:
                out[level][key] = sidra_values(self.raw_dir / self._file(key, level))
        return {"vintage": "Censo 2022", "_files": [self._file(k, lv) for k in SERIES for lv in LEVELS], **out}
