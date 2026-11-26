"""IBGE SIDRA tables: Censo 2022 population and municipal GDP, for the nation, the states and every municipality."""

from __future__ import annotations

import json

from ..core.source import Source, SourceInfo

SIDRA = "https://apisidra.ibge.gov.br/values"
LEVELS = {"nation": "n1/all", "states": "n3/all", "municipalities": "n6/all"}
# SIDRA symbols: "..." not available, ".." not applicable, "X" suppressed to protect an informant → None (unknown).
# "-" is an absolute zero, a real 0.
MISSING = {"...", "..", "X", ""}
ZERO = "-"


def sidra_values(path) -> dict[str, float | None]:
    """{territory code: value} from a SIDRA /values JSON (first row is the header). Suppressed → None."""
    with open(path, encoding="utf-8") as f:
        rows = json.load(f)[1:]
    out = {}
    for r in rows:
        v = r["V"]
        out[r["D1C"]] = None if v in MISSING else 0.0 if v == ZERO else float(v)
    return out


class _Sidra(Source):
    TABLE: int
    VARIABLE: int
    PERIOD: str

    def _file(self, level):
        return f"t{self.TABLE}_v{self.VARIABLE}_p{self.PERIOD}_{level}.json"

    def fetch(self, force=False):
        for level, n in LEVELS.items():
            url = f"{SIDRA}/t/{self.TABLE}/{n}/v/{self.VARIABLE}/p/{self.PERIOD}"
            self.download(url, self._file(level), force=force)

    def _read(self):
        return {level: sidra_values(self.raw_dir / self._file(level)) for level in LEVELS}


class CensusPopulation(_Sidra):
    TABLE, VARIABLE, PERIOD = 4709, 93, "2022"
    info = SourceInfo(
        id="ibge_census",
        title="Censo Demográfico 2022: população residente (tabela 4709)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/4709",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Censo Demográfico 2022)",
        description="População residente contada pelo Censo 2022, por município, estado e país. É contagem, não "
        "amostra: a população de uma cidade é a soma dos seus municípios.",
        used_for=["População das cidades, dos estados e do país"],
    )

    def process(self):
        d = self._read()
        to_int = lambda m: {k: (round(v) if v is not None else None) for k, v in m.items()}
        return {"vintage": "Censo 2022", "_files": [self._file(lv) for lv in LEVELS], "year": 2022,
                **{lv: to_int(m) for lv, m in d.items()}}


class MunicipalGdp(_Sidra):
    TABLE, VARIABLE, PERIOD = 5938, 37, "2023"
    info = SourceInfo(
        id="ibge_gdp",
        title="Produto Interno Bruto dos Municípios 2023 (tabela 5938)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://sidra.ibge.gov.br/tabela/5938",
        license="Dados públicos do IBGE; citar a fonte (IBGE, PIB dos Municípios)",
        description="PIB a preços correntes de 2023, em reais, por município, estado e país. O Ouro de uma cidade é "
        "a soma do PIB dos seus municípios. A soma dos municípios bate com o PIB do país.",
        used_for=["Ouro (PIB) das cidades, dos estados e do país"],
    )

    def process(self):
        d = self._read()
        reais = lambda m: {k: (round(v * 1000) if v is not None else None) for k, v in m.items()}  # table is in R$ mil
        return {"vintage": "PIB dos Municípios 2023", "_files": [self._file(lv) for lv in LEVELS], "year": 2023,
                **{lv: reais(m) for lv, m in d.items()}}
