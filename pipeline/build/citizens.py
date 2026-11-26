"""Cidadãos: a mistura de pessoas de cada cidade para os bonecos da tela da cidade (Censo 2022).

Cada linha soma os municípios da cidade e reparte um número fixo de bonecos pelo maior resto, então os bonecos de
uma linha somam sempre o total. Os "especialistas" são as categorias com parcela pelo menos 1,5 vez (ou no máximo
0,67 vez) a do Brasil; categorias abaixo de 1% na cidade e no país ficam de fora, por ruído.
"""

from __future__ import annotations

import json
from pathlib import Path

from ..core.paths import WEB_DATA
from ..core.store import load_interim, write_web

REQUIRES = ["ibge_citizens", "cities.json"]
PRODUCES = ["citizens.json"]

FIGURES = {"workforce": 20, "age": 10, "commute": 10}
HIGH, LOW, MIN_SHARE, MAX_HIGH, MAX_LOW = 1.5, 0.67, 0.01, 4, 2
ROWS = {
    "workforce": "Ocupados por atividade do trabalho principal, formais e informais, onde moram",
    "age": "Moradores por idade",
    "commute": "Quem trabalha fora de casa, pelo meio de transporte de ida",
    "education": "Adultos de 25 anos ou mais pelo nível de instrução",
}
LABELS = {
    "workforce": {"executive": "Administração pública", "engineer": "Informação, ciência e técnica",
                  "scholar": "Educação", "healer": "Saúde e serviços sociais", "service": "Comércio, alimentação e lazer",
                  "clerk": "Finanças, escritório e outros serviços", "farmer": "Agropecuária", "builder": "Construção",
                  "maker": "Indústria, energia e transporte"},
    "age": {"child": "Crianças (0 a 14)", "young": "Jovens (15 a 29)", "midlife": "Adultos (30 a 59)",
            "elder": "Idosos (60 ou mais)"},
    "commute": {"drove_alone": "Carro ou táxi", "carpool": "Van", "transit": "Ônibus, trem, metrô ou barco",
                "walk": "A pé ou de bicicleta", "other": "Moto e outros"},
    "education": {"less_than_hs": "Sem fundamental completo", "high_school": "Fundamental completo",
                  "some_college": "Médio completo", "bachelors": "Superior completo"},
}
RULE = (f"Especialistas: categorias com parcela de pelo menos {HIGH:g} vez (até {MAX_HIGH}) ou no máximo {LOW:g} vez "
        f"(até {MAX_LOW}) a parcela do Brasil; categorias abaixo de 1% na cidade e no país ficam de fora.").replace(".", ",", 0)


def largest_remainder(counts: dict[str, float], n: int) -> dict[str, int]:
    """n figures split by share, rounding by the largest remainder so they always sum to n."""
    total = sum(counts.values())
    if not total:
        return {k: 0 for k in counts}
    raw = {k: v / total * n for k, v in counts.items()}
    out = {k: int(v) for k, v in raw.items()}
    for k in sorted(raw, key=lambda k: -(raw[k] - out[k]))[: n - sum(out.values())]:
        out[k] += 1
    return out


def row_of(data: dict, row: str, codes: list[str]) -> dict | None:
    counts = {}
    for key, per in data[row].items():
        vals = [per.get(c) for c in codes]
        if any(v is None for v in vals):
            return None  # a suppressed or missing member: the row is unknown, never zeros
        counts[key] = round(sum(vals))
    total = sum(counts.values())
    if not total:
        return None
    out = {"total": total, "counts": counts, "shares": {k: round(v / total, 3) for k, v in counts.items()}}
    if row in FIGURES:
        out["figures"] = largest_remainder(counts, FIGURES[row])
    if row == "education":
        out["bachelors_plus"] = out["shares"]["bachelors"]
    return out


def specialists(rows: dict, nat: dict) -> list[dict]:
    hi, lo = [], []
    for row, r in rows.items():
        n = nat.get(row)
        if not r or not n:
            continue
        for key, c in r["counts"].items():
            s, ns = c / r["total"], n["counts"][key] / n["total"]
            if not ns or (s < MIN_SHARE and ns < MIN_SHARE):
                continue
            ratio = s / ns
            item = {"row": row, "key": key, "share": round(s, 3), "national": round(ns, 3), "ratio": round(ratio, 2)}
            if ratio >= HIGH:
                hi.append(item)
            elif ratio <= LOW:
                lo.append(item)
    return sorted(hi, key=lambda x: -x["ratio"])[:MAX_HIGH] + sorted(lo, key=lambda x: x["ratio"])[:MAX_LOW]


def build() -> None:
    d = load_interim("ibge_citizens")
    cities = json.loads((WEB_DATA / "cities.json").read_text())
    nat = {row: row_of(d["nation"], row, ["1"]) for row in ROWS}
    out = {}
    for c in cities:
        rows = {row: row_of(d["municipalities"], row, c["counties"]) for row in ROWS}
        out[c["id"]] = None if not any(rows.values()) else {**rows, "specialists": specialists(rows, nat), "reliable": True}
    groups = {row: [{"key": k, "label": LABELS[row][k], "icon": f"c-{k.replace('_', '-')}"} for k in d["groups"][row]]
              for row in ROWS}
    write_web("citizens.json", {
        "version": 1, "vintage": "Censo 2022", "year": 2022, "sources": ["ibge_citizens"],
        "figures": FIGURES, "rows": ROWS, "groups": groups,
        "rule": {"specialist_high": HIGH, "specialist_low": LOW, "min_share": MIN_SHARE, "max_high": MAX_HIGH,
                 "max_low": MAX_LOW, "text": RULE},
        "national": {**nat, "specialists": []}, "cities": out,
    })
    top = [(c["name"], out[c["id"]]["specialists"][0]) for c in cities[:400] if out.get(c["id"]) and out[c["id"]]["specialists"]]
    print(f"    {sum(1 for v in out.values() if v)} cities with citizens; e.g. "
          + "; ".join(f"{n}: {s['key']} ×{s['ratio']}" for n, s in top[:4]))


def check(web_dir: Path) -> list[tuple[str, str]]:
    p = Path(web_dir) / "citizens.json"
    if not p.exists():
        return [("NOTE", "citizens.json: missing (optional, skipped)")]
    doc = json.loads(p.read_text())
    bad = []
    for cid, row in doc["cities"].items():
        for name, n in doc["figures"].items():
            r = row and row.get(name)
            if r and sum(r["figures"].values()) != n:
                bad.append(f"{cid}/{name}")
    if bad:
        return [("FAIL", f"citizens.json: figures do not add up in {bad[:5]}")]
    return [("PASS", f"citizens.json: {sum(1 for v in doc['cities'].values() if v)} cities")]
