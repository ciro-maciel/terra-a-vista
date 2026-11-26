"""Anatel "Meu Município": telecom accesses and mobile coverage of every municipality.

Accesses (fixed broadband, mobile phone) in December of each year since 2019, with the density Anatel computes (fixed
broadband per 100 households, mobile per 100 inhabitants), and the share of residents inside the 4G and 5G coverage of
any operator, in the month of each year the file brings (November 2021, December 2022, June 2023, December 2024,
September 2025).
"""

from __future__ import annotations

import csv
import io
import zipfile

from ..core.source import Source, SourceInfo

URL = "https://www.anatel.gov.br/dadosabertos/paineis_de_dados/meu_municipio/meu_municipio.zip"
ZIP = "meu_municipio.zip"
SERVICES = {"Banda Larga Fixa": "broadband", "Telefonia Móvel": "mobile"}
TECHS = {"4G": "cov4g", "5G": "cov5g"}


def num(s: str) -> float | None:
    s = (s or "").strip()
    return None if not s else float(s.replace(".", "").replace(",", ".")) if "," in s else float(s)


class Anatel(Source):
    info = SourceInfo(
        id="anatel",
        title="Anatel, Meu Município: acessos de banda larga e celular, e cobertura 4G e 5G",
        publisher="Agência Nacional de Telecomunicações (Anatel)",
        homepage="https://www.gov.br/anatel/pt-br/dados/dados-abertos",
        license="Dados abertos da Anatel; citar a fonte (Anatel, Meu Município)",
        description="Os acessos de banda larga fixa e de telefonia móvel de cada município em dezembro de cada ano desde "
        "2019, com a densidade (banda larga por 100 domicílios, celular por 100 habitantes), e a parcela dos moradores "
        "dentro da área coberta por 4G e por 5G de qualquer operadora.",
        used_for=["Linha do tempo: Conexão", "Por quê"],
    )

    def fetch(self, force=False):
        self.download(URL, ZIP, force=force, expect_binary=True)

    def process(self):
        acc: dict = {k: {} for k in SERVICES.values()}
        base: dict = {k: {} for k in SERVICES.values()}
        cov: dict = {k: {} for k in TECHS.values()}
        with zipfile.ZipFile(self.raw_dir / ZIP) as z:
            with z.open("Meu_Municipio_Acessos.csv") as f:
                for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"), delimiter=";"):
                    key = SERVICES.get(r["Serviço"])
                    if not key:
                        continue
                    a, d = num(r["Acessos"]), num(r["Densidade"])
                    code, y = r["Código IBGE"], r["Ano"]
                    acc[key].setdefault(code, {})[y] = a
                    # the base Anatel divided by (households or inhabitants), so groups add up the same way
                    base[key].setdefault(code, {})[y] = (a * 100 / d) if a and d else None
            with z.open("Meu_Municipio_Cobertura.csv") as f:
                for r in csv.DictReader(io.TextIOWrapper(f, encoding="utf-8-sig"), delimiter=";"):
                    key = TECHS.get(r["Tecnologia"])
                    if key and r["Operadora"].lower() == "todas":
                        v = num(r["% moradores cobertos"])
                        cov[key].setdefault(r["Código IBGE"], {})[r["Ano"]] = None if v is None else v / 100
        return {"vintage": "Anatel, Meu Município (acessos até 2025, cobertura até set. 2025)", "_files": [ZIP],
                "accesses": acc, "base": base, "coverage": cov}
