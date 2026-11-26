"""IBGE Censo 2022: the citizen mix of the City View (work, age, commute, schooling), per municipality.

Each group below is one SIDRA request listing the categories it adds up; the reply has one row per territory and
category, summed here per territory. Work counts every occupied resident (formal and informal) by the activity of
their main job, where they live (table 10262); commute counts the occupied who work away from home (10332).
"""

from __future__ import annotations

import json
from collections import defaultdict

from ..core.source import Source, SourceInfo
from .ibge_sidra import LEVELS, MISSING, SIDRA, ZERO

ROWS = {
    "workforce": ("t/10262/{n}/v/4090/p/2022/c11913/96165/c11805/{cats}", {
        "executive": [95383], "engineer": [12647, 12649], "scholar": [95384], "healer": [12651],
        "service": [12645, 95379, 12652], "clerk": [12648, 9205, 12650, 12653, 95387, 99809, 99810],
        "farmer": [12640], "builder": [95377], "maker": [12641, 12642, 12643, 12644, 12646],
    }),
    "age": ("t/9514/{n}/v/93/p/2022/c2/6794/c286/113635/c287/{cats}", {
        "child": [93070, 93084, 93085], "young": [93086, 93087, 93088],
        "midlife": [93089, 93090, 93091, 93092, 93093, 93094],
        "elder": [93095, 93096, 93097, 93098, 49108, 49109, 60040, 60041, 6653],
    }),
    "commute": ("t/10332/{n}/v/13377/p/2022/c1568/120704/c86/95251/c2088/{cats}", {
        "drove_alone": [79197, 79198], "carpool": [79207, 79211], "transit": [79208, 79209, 79210, 79212, 79213],
        "walk": [79193, 79194], "other": [79195, 79196, 79214],
    }),
    "education": ("t/10061/{n}/v/2667/p/2022/c58/108866/c2/6794/c86/95251/c1568/{cats}", {
        "less_than_hs": [9493], "high_school": [9494], "some_college": [9495], "bachelors": [99713],
    }),
}


def summed(path) -> dict[str, float | None]:
    """{territory: sum of the reply's rows} (a suppressed row makes the territory None)."""
    rows = json.loads(open(path, encoding="utf-8").read())[1:]
    out: dict[str, float | None] = defaultdict(float)
    for r in rows:
        v, t = r["V"], r["D1C"]
        if out[t] is None:
            continue
        out[t] = None if v in MISSING else out[t] + (0 if v == ZERO else float(v))
    return dict(out)


class IbgeCitizens(Source):
    info = SourceInfo(
        id="ibge_citizens",
        title="Censo Demográfico 2022: trabalho, idade, deslocamento e instrução por município",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://censo2022.ibge.gov.br/",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Censo Demográfico 2022)",
        description="Os cidadãos da tela da cidade: ocupados por atividade do trabalho principal, formais e informais, "
        "onde moram (tabela 10262); população por idade (9514); meio de transporte de quem trabalha fora de casa "
        "(10332); e nível de instrução dos adultos de 25 anos ou mais (10061).",
        used_for=["Cidadãos da tela da cidade"],
    )

    def _file(self, row, key, level):
        return f"{row}_{key}_{level}.json"

    def fetch(self, force=False):
        for row, (path, groups) in ROWS.items():
            for key, cats in groups.items():
                for level, n in LEVELS.items():
                    url = f"{SIDRA}/{path.format(n=n, cats=','.join(map(str, cats)))}"
                    self.download(url, self._file(row, key, level), force=force)

    def process(self):
        out = {lv: {} for lv in LEVELS}
        files = []
        for row, (_, groups) in ROWS.items():
            for level in LEVELS:
                out[level][row] = {}
                for key in groups:
                    files.append(self._file(row, key, level))
                    out[level][row][key] = summed(self.raw_dir / self._file(row, key, level))
        return {"vintage": "Censo 2022", "_files": files, "groups": {r: list(g) for r, (_, g) in ROWS.items()}, **out}
