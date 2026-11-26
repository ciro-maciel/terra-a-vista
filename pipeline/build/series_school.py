"""Série da escola (Inep Ideb): a nota da rede pública nos anos iniciais e finais do ensino fundamental, de dois em
dois anos desde 2005."""

from __future__ import annotations

from ..core.store import load_interim
from .series_util import build_series, check_series

REQUIRES = ["inep_ideb", "ibge_census", "_world", "ibge_boundaries", "cities.json"]
PRODUCES = ["series_school.json"]

RULE = ("O Ideb da rede pública (escolas estaduais e municipais) de cada município, de 0 a 10: a taxa de aprovação "
        "vezes a nota média do Saeb (Inep). Uma cidade e um estado são a média dos seus municípios ponderada pela "
        "população do Censo 2022; o Inep calcula o Ideb oficial de cada estado pelos alunos, então o número aqui pode "
        "diferir um pouco do dele. Um município sem nota num ano teve poucos alunos na prova. 2021 foi o ano da "
        "pandemia: a aprovação automática ergueu a nota em muitos lugares.")


def weighted(ideb: dict, pop: dict) -> tuple[dict, dict]:
    """num = Ideb × population, den = population, for the municipality-years that have a score."""
    num, den = {}, {}
    for code, ys in ideb.items():
        p = pop.get(code)
        if not p:
            continue
        num[code] = {y: (v * p if v is not None else None) for y, v in ys.items()}
        den[code] = {y: (p if v is not None else None) for y, v in ys.items()}
    return num, den


def build() -> None:
    d = load_interim("inep_ideb")
    pop = load_interim("ibge_census")["municipalities"]
    metrics = []
    for key, name, desc in [("early", "Anos iniciais", "Ideb do 1º ao 5º ano, rede pública."),
                            ("late", "Anos finais", "Ideb do 6º ao 9º ano, rede pública.")]:
        num, den = weighted(d[key], pop)
        metrics.append({"id": key, "name": name, "unit": "Ideb, de 0 a 10", "format": "float", "ramp": "blue",
                        "higher_is": "good", "description": desc, "num": num, "den": den})
    build_series({"id": "school", "name": "Escola", "vintage": d.get("vintage") or "Ideb", "sources": ["inep_ideb"],
                  "years": d["years"], "rule": RULE, "question": "Como a escola pública mudou desde {first}?",
                  "fixed_borders": True, "movers_min_pop": 10000}, metrics)


def check(web_dir):
    return check_series(web_dir, "school", min_munis=5000)
