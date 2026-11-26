"""Inep Ideb: the Basic Education Development Index of every municipality's public schools, 2005 to 2023.

The Ideb joins how many pupils pass the year (Censo Escolar) with how they score in the Saeb tests, on a 0 to 10 scale,
every two years. Kept: the public network (state and municipal schools together, "Pública"), for the first years
(1st to 5th grade) and the last years (6th to 9th) of primary school. "-" (too few pupils took the test) is no value.
"""

from __future__ import annotations

import zipfile

from ..core import xlsx
from ..core.source import Source, SourceInfo

BASE = "https://download.inep.gov.br/ideb/resultados"
EDITION = 2023
STAGES = {"early": "anos_iniciais", "late": "anos_finais"}
YEARS = [str(y) for y in range(2005, EDITION + 1, 2)]


class InepIdeb(Source):
    info = SourceInfo(
        id="inep_ideb",
        title=f"Ideb 2005 a {EDITION} por município, anos iniciais e finais do ensino fundamental",
        publisher="Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira (Inep), Ministério da Educação",
        homepage="https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados",
        license="Dados abertos do Inep; citar a fonte (Inep, Ideb)",
        description="O Índice de Desenvolvimento da Educação Básica da rede pública (escolas estaduais e municipais) de "
        f"cada município, de 2005 a {EDITION}, de dois em dois anos: a aprovação dos alunos vezes a nota deles no Saeb, "
        "numa escala de 0 a 10, para os anos iniciais (1º ao 5º) e os anos finais (6º ao 9º) do ensino fundamental.",
        used_for=["Linha do tempo: Escola", "Conselheiro do conhecimento", "Por quê"],
    )

    def _zip(self, stage):
        return f"divulgacao_{STAGES[stage]}_municipios_{EDITION}.zip"

    def fetch(self, force=False):
        for stage in STAGES:
            self.download(f"{BASE}/{self._zip(stage)}", self._zip(stage), force=force, expect_binary=True)

    def process(self):
        out = {}
        for stage in STAGES:
            with zipfile.ZipFile(self.raw_dir / self._zip(stage)) as z:
                name = next(n for n in z.namelist() if n.endswith(".xlsx"))
                z.extract(name, self.raw_dir)
            path = self.raw_dir / name
            col = None
            d: dict[str, dict] = {}
            for r in xlsx.rows(path):
                if col is None:
                    if r and r[0] == "SG_UF":
                        col = {h: i for i, h in enumerate(r) if isinstance(h, str)}
                    continue
                if len(r) <= col["REDE"] or r[col["REDE"]] != "Pública":
                    continue
                code = str(int(r[col["CO_MUNICIPIO"]]))
                vals = {}
                for y in YEARS:
                    i = col.get(f"VL_OBSERVADO_{y}")
                    v = r[i] if i is not None and i < len(r) else None
                    vals[y] = v if isinstance(v, float) else None
                d[code] = vals
            path.unlink(missing_ok=True)
            out[stage] = d
        return {"vintage": f"Ideb 2005 a {EDITION}", "_files": [self._zip(s) for s in STAGES], "years": YEARS, **out}
