"""ANEEL SIGA: every power plant in Brazil, with its position, type, fuel, capacity and phase."""

from __future__ import annotations

import csv

from ..core.source import Source, SourceInfo

URL = ("https://dadosabertos.aneel.gov.br/dataset/6d90b77c-c5f5-4d81-bdec-7bc619494bb9/resource/"
       "11ec447d-698d-4ab8-977f-b424d5deee6a/download/siga-empreendimentos-geracao.csv")
FILE = "siga-empreendimentos-geracao.csv"


def _num(s: str) -> float | None:
    s = (s or "").strip()
    if not s or s == ",00":
        return None
    try:
        return float(s.replace(",", "."))  # SIGA writes decimals with a comma and no thousands separator
    except ValueError:
        return None


class AneelSiga(Source):
    info = SourceInfo(
        id="aneel_siga",
        title="SIGA, Sistema de Informações de Geração da ANEEL",
        publisher="Agência Nacional de Energia Elétrica (ANEEL)",
        homepage="https://dadosabertos.aneel.gov.br/dataset/siga-sistema-de-informacoes-de-geracao-da-aneel",
        license="Dados abertos da ANEEL (Licença Aberta para Bases de Dados); citar a fonte",
        description="Todas as usinas do país, com posição, tipo (hidrelétrica, eólica, solar, térmica, nuclear), "
        "combustível, potência outorgada e fase. Só as usinas em operação entram no mapa.",
        used_for=["Usinas como recursos", "Capacidade de geração por estado"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force)

    def process(self):
        plants = []
        with open(self.raw_dir / FILE, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f, delimiter=";"):
                lat, lon = _num(r["NumCoordNEmpreendimento"]), _num(r["NumCoordEEmpreendimento"])
                kw = _num(r["MdaPotenciaOutorgadaKw"])
                plants.append({
                    "name": r["NomEmpreendimento"].strip(), "kind": r["SigTipoGeracao"], "phase": r["DscFaseUsina"],
                    "fuel": r["DscFonteCombustivel"], "origin": r["DscOrigemCombustivel"], "uf": r["SigUFPrincipal"],
                    "mw": None if kw is None else round(kw / 1000, 3), "lat": lat, "lon": lon,
                    "owner": r["DscPropriRegimePariticipacao"].strip(), "places": r["DscMuninicpios"].strip(),
                    "since": r["DatEntradaOperacao"][:4] or None,
                })
        return {"vintage": "ANEEL SIGA", "_files": [FILE], "plants": plants}
