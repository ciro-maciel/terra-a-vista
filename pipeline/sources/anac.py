"""ANAC: passengers and cargo per airport and per route, and the position of every public aerodrome.

The flight statistics are one 362 MB CSV (every airline × month × origin × destination since 2000) with no
subset on offer. It is streamed once through a reducer that keeps only the years from FIRST_YEAR on, summed per
airport and per Brazilian airport pair; only that summary (a few hundred kB) is cached. The manifest records the
size and sha256 of the whole stream.
"""

from __future__ import annotations

import csv
import json
from collections import defaultdict

from ..core import fetch
from ..core.source import Source, SourceInfo

BASE = "https://sistemas.anac.gov.br/dadosabertos"
STATS = f"{BASE}/Voos%20e%20opera%C3%A7%C3%B5es%20a%C3%A9reas/Dados%20Estat%C3%ADsticos%20do%20Transporte%20A%C3%A9reo/Dados_Estatisticos.csv"
AERODROMES = (f"{BASE}/Aerodromos/Aer%C3%B3dromos%20P%C3%BAblicos/Lista%20de%20aer%C3%B3dromos%20p%C3%BAblicos/"
              "AerodromosPublicos.csv")
FIRST_YEAR = 2024
BRAZIL = "BRASIL"


def _num(s: str) -> float:
    s = (s or "").strip()
    return float(s.replace(".", "").replace(",", ".")) if s else 0.0


def reduce_stats(lines) -> dict:
    """{year: {"airports": {icao: {...}}, "routes": {"A-B": pax}}} for years >= FIRST_YEAR."""
    it = iter(lines)
    for line in it:  # skip the "Atualizado em" line and anything before the header
        if line.lstrip("﻿").startswith('"EMPRESA_SIGLA"'):
            header = next(csv.reader([line.lstrip("\ufeff")], delimiter=";"))
            break
    else:
        raise ValueError("ANAC statistics: header not found")
    col = {name: k for k, name in enumerate(header)}
    years: dict = defaultdict(lambda: {"airports": {}, "routes": defaultdict(float), "months": set()})
    for row in csv.reader(it, delimiter=";"):
        if len(row) < len(header):
            continue
        try:
            year = int(row[col["ANO"]])
        except ValueError:
            continue
        if year < FIRST_YEAR:
            continue
        y = years[year]
        y["months"].add(int(row[col["MES"]] or 0))
        pax = _num(row[col["PASSAGEIROS_PAGOS"]]) + _num(row[col["PASSAGEIROS_GRATIS"]])
        cargo = _num(row[col["CARGA_PAGA_KG"]]) + _num(row[col["CARGA_GRATIS_KG"]]) + _num(row[col["CORREIO_KG"]])
        flights = _num(row[col["DECOLAGENS"]])
        ends = []
        for side in ("ORIGEM", "DESTINO"):
            code = row[col[f"AEROPORTO_DE_{side}_SIGLA"]].strip()
            if not code or row[col[f"AEROPORTO_DE_{side}_PAIS"]].strip() != BRAZIL:
                ends.append(None)
                continue
            ends.append(code)
            a = y["airports"].setdefault(code, {"name": row[col[f"AEROPORTO_DE_{side}_NOME"]].strip(),
                                                "uf": row[col[f"AEROPORTO_DE_{side}_UF"]].strip(),
                                                "pax": 0.0, "cargo_kg": 0.0, "departures": 0.0, "intl_pax": 0.0})
            a["pax"] += pax
            a["cargo_kg"] += cargo
            if side == "ORIGEM":
                a["departures"] += flights
            if row[col["NATUREZA"]].strip() == "INTERNACIONAL":
                a["intl_pax"] += pax
        if ends[0] and ends[1] and ends[0] != ends[1]:
            key = "-".join(sorted(ends))
            y["routes"][key] += pax
    out = {}
    for year, y in sorted(years.items()):
        out[str(year)] = {
            "months": sorted(y["months"]),
            "airports": {k: {**v, **{f: round(v[f]) for f in ("pax", "cargo_kg", "departures", "intl_pax")}}
                         for k, v in y["airports"].items()},
            "routes": {k: round(v) for k, v in sorted(y["routes"].items(), key=lambda kv: -kv[1])[:400]},
        }
    return out


class Anac(Source):
    info = SourceInfo(
        id="anac",
        title="ANAC: Dados Estatísticos do Transporte Aéreo e lista de aeródromos públicos",
        publisher="Agência Nacional de Aviação Civil (ANAC)",
        homepage="https://sistemas.anac.gov.br/dadosabertos/",
        license="Dados abertos da ANAC; citar a fonte",
        description="Passageiros (pagos e grátis), carga e correio e decolagens por aeroporto e por rota, somados das "
        "estatísticas mensais de todas as empresas aéreas; e a posição de cada aeródromo público. O arquivo de "
        "estatísticas (362 MB) é lido em fluxo e só o resumo dos anos recentes é guardado.",
        used_for=["Aeroportos no mapa", "Rotas aéreas"],
    )

    def fetch(self, force=False):
        self.download(AERODROMES, "AerodromosPublicos.csv", force=force)
        fetch.download_reduced(self.id, STATS, "estatisticas_resumo.json", reduce_stats, force=force)

    def process(self):
        stats = json.loads((self.raw_dir / "estatisticas_resumo.json").read_text(encoding="utf-8"))
        full = [y for y, v in stats.items() if len(v["months"]) == 12]
        year = max(full) if full else max(stats)
        pos = {}
        with open(self.raw_dir / "AerodromosPublicos.csv", encoding="latin-1", newline="") as f:
            rows = list(csv.reader(f, delimiter=";"))
        head = next(i for i, r in enumerate(rows) if r and r[0].startswith("Código OACI"))
        cols = rows[head]
        ci = {n: k for k, n in enumerate(cols)}
        for r in rows[head + 1:]:
            if len(r) < len(cols) or not r[0].strip():
                continue
            try:
                lat, lon = float(r[ci["LATGEOPOINT"]].replace(",", ".")), float(r[ci["LONGEOPOINT"]].replace(",", "."))
            except ValueError:
                continue
            pos[r[0].strip()] = {"name": r[ci["Nome"]].strip(), "city": r[ci["Município Servido"]].strip().title(),
                                 "lat": lat, "lon": lon}
        return {"vintage": f"ANAC, Dados Estatísticos {year}", "_files": ["AerodromosPublicos.csv", "estatisticas_resumo.json"],
                "year": int(year), "airports": stats[year]["airports"], "routes": stats[year]["routes"], "positions": pos}
