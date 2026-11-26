"""IBGE CEMPRE (Cadastro Central de Empresas), table 9528: salaried jobs by CNAE 2.0 activity and municipality.

CEMPRE is built from RAIS and the IBGE business surveys; it counts formal salaried employees where the local unit
is. Only the municipalities that make up the map's cities are fetched (arranjo members, plus municipalities of
at least MIN_ISOLATED_POP people outside every arranjo, the same rule as pipeline/build/cities.py), and the nation,
which is all a location quotient needs. That keeps the download to a few megabytes.

The interim has the shape the districts builder reads (the QCEW layout of the upstream project): one "ownership"
(all), employment per code and municipality, and the national figure per code. Wages are not fetched (null).
"""

from __future__ import annotations

import json
import re
from urllib.parse import quote

from ..core.source import Source, SourceInfo
from ..core.store import load_interim

TABLE, VARIABLE, YEAR = 9528, 708, 2024
API = f"https://servicodados.ibge.gov.br/api/v3/agregados/{TABLE}"
CLASS = 12762
TOTAL_ID = 117897
CHUNK_MUN, CHUNK_CAT = 120, 40
MIN_ISOLATED_POP = 50_000
# Groups (3-digit CNAE) the district catalog names as specialities; sections and divisions are always fetched.
GROUPS = ["06.0", "07.1", "10.1", "15.3", "19.2", "24.1", "24.2", "29.1", "30.4", "46.2", "50.1", "52.3", "52.4",
          "62.0", "72.1", "85.3", "93.1", "93.2", "35.1", "36.0", "84.1"]
SUPPRESSED = {"X", "...", ".."}


def code_of(name: str) -> str:
    """'29.1 Fabricação de automóveis…' → '29.1'; 'A Agricultura…' → 'A'; 'Total' → 'total'."""
    if name == "Total":
        return "total"
    return name.split(" ", 1)[0]


def map_municipalities() -> list[str]:
    """The municipalities that belong to a map city (see pipeline/build/cities.py)."""
    pop = load_interim("ibge_census")["municipalities"]
    codes = {m["code"] for a in load_interim("ibge_arranjos")["arranjos"] for m in a["members"]}
    codes |= {k for k, v in pop.items() if v is not None and v >= MIN_ISOLATED_POP}
    return sorted(c for c in codes if c in pop)


class IbgeCempre(Source):
    info = SourceInfo(
        id="ibge_cempre",
        title=f"Cadastro Central de Empresas {YEAR}: pessoal assalariado por atividade (tabela {TABLE})",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage=f"https://sidra.ibge.gov.br/tabela/{TABLE}",
        license="Dados públicos do IBGE; citar a fonte (IBGE, Cadastro Central de Empresas)",
        description="Empregados assalariados formais por seção, divisão e grupo da CNAE 2.0, por município, onde fica "
        "a unidade local. Os distritos de cada cidade vêm daqui, pelo quociente locacional. Não conta o trabalho "
        "informal, que é perto de 4 em cada 10 ocupados no Brasil; o IBGE suprime as células com poucos informantes.",
        used_for=["Distritos e tipo de cidade", "Empregos por setor"],
    )

    def _meta(self):
        return self.raw_dir / "metadados.json"

    def _categories(self) -> dict[int, str]:
        cats = json.loads(self._meta().read_text())["classificacoes"][0]["categorias"]
        keep = {}
        for c in cats:
            code = code_of(c["nome"])
            if c["id"] == TOTAL_ID or c["nivel"] in (1, 2) or code in GROUPS:
                keep[c["id"]] = c["nome"]
        return keep

    def _files(self, munis: list[str]):
        cats = sorted(self._categories())
        for i in range(0, len(munis), CHUNK_MUN):
            for j in range(0, len(cats), CHUNK_CAT):
                yield (f"N6[{','.join(munis[i:i + CHUNK_MUN])}]", cats[j:j + CHUNK_CAT], f"mun_{i:05d}_cat_{j:03d}.json")
        for j in range(0, len(cats), CHUNK_CAT):
            yield ("N1[all]", cats[j:j + CHUNK_CAT], f"nation_cat_{j:03d}.json")
            yield ("N3[all]", cats[j:j + CHUNK_CAT], f"states_cat_{j:03d}.json")

    def fetch(self, force=False):
        self.download(f"{API}/metadados", "metadados.json", force=force)
        for loc, cats, name in self._files(map_municipalities()):
            url = (f"{API}/periodos/{YEAR}/variaveis/{VARIABLE}?localidades={quote(loc, safe=',')}"
                   f"&classificacao={CLASS}{quote('[' + ','.join(map(str, cats)) + ']', safe=',')}")
            self.download(url, name, force=force)

    def process(self):
        titles = {code_of(n): re.sub(r"^\S+ ", "", n) if n != "Total" else "Total" for n in self._categories().values()}
        counties: dict[str, dict] = {}
        us: dict[str, list] = {}
        totals: dict[str, list] = {}
        states: dict[str, dict] = {}  # code → {UF code: jobs or None}
        files = ["metadados.json"]
        for _, _, name in self._files(map_municipalities()):
            files.append(name)
            for res in json.loads((self.raw_dir / name).read_text())[0]["resultados"]:
                code = code_of(next(iter(res["classificacoes"][0]["categoria"].values())))
                for s in res["series"]:
                    v = s["serie"].get(str(YEAR))
                    emp = None if v in SUPPRESSED or v is None else (0 if v == "-" else int(v))
                    row = [[emp, None, 0]] if emp is not None else [None]
                    loc = s["localidade"]
                    if loc["nivel"]["id"] == "N1":
                        us[code] = row
                    elif loc["nivel"]["id"] == "N3":
                        states.setdefault(code, {})[loc["id"]] = emp
                    elif code == "total":
                        totals[loc["id"]] = [emp, None] if emp is not None else None
                    else:
                        counties.setdefault(code, {})[loc["id"]] = row
        us_total = us.pop("total")[0]
        return {
            "vintage": f"CEMPRE {YEAR}",
            "_files": files,
            "year": YEAR,
            "owns": [1],
            "codes": titles,
            "us_total": [us_total[0], None, 0],
            "us": us,
            "totals": totals,
            "counties": counties,
            "states": states,
            "has_wages": False,
            "has_change": False,
        }
