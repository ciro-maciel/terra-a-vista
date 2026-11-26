"""Datasus (Ministério da Saúde) through TabNet: infant deaths (SIM) and live births (Sinasc) by municipality of
residence and year, and doctors and hospital beds registered in the CNES in December of some years.

TabNet answers a form (in latin-1) with a ";"-separated table inside <PRE>; municipalities come as the 6-digit IBGE
code (without the check digit) and the name. "-" is zero.

CNES counts a doctor once per place they work (vínculo), not once per person, so a doctor with three jobs counts three
times; beds are the existing hospital beds (SUS and not SUS).
"""

from __future__ import annotations

import html
import re

from ..core.source import Source, SourceInfo
from .ibge_sidra import SIDRA

TABNET = "http://tabnet.datasus.gov.br/cgi/tabcgi.exe"
DEATH_YEARS = list(range(1999, 2025))       # infant deaths and births, 1999 to 2024 (3-year windows around each year)
CNES_YEARS = [2010, 2015, 2020, 2024]        # December of each
POP_YEARS = [2015, 2020, 2024]               # IBGE estimates (table 6579); 2010 is the Census


def _yy(y):
    return f"{y % 100:02d}"


def parse_tabnet(text: str) -> tuple[list[str], dict[str, list[float]]]:
    """(column headers, {6-digit municipality code: values}) from a TabNet "prn" answer."""
    m = re.search(r"<PRE>(.*?)</PRE>", text, re.S | re.I)
    if not m:
        raise ValueError("TabNet: no <PRE> table in the answer")
    lines = [ln.strip() for ln in html.unescape(m.group(1)).splitlines() if ln.strip()]
    head = [h.strip('"') for h in lines[0].split(";")]
    out = {}
    for ln in lines[1:]:
        cells = ln.split(";")
        label = cells[0].strip('"').strip()
        code = label.split(" ", 1)[0]
        if not code.isdigit() or len(code) != 6:
            continue  # "MUNICIPIO IGNORADO", "Total"
        out[code] = [0.0 if c.strip() in ("-", "") else float(c.replace(".", "").replace(",", ".")) for c in cells[1:]]
    return head[1:], out


class Datasus(Source):
    info = SourceInfo(
        id="datasus",
        title="Datasus: óbitos infantis (SIM), nascidos vivos (Sinasc), médicos e leitos (CNES)",
        publisher="Ministério da Saúde, Departamento de Informação e Informática do SUS (Datasus)",
        homepage="http://tabnet.datasus.gov.br/",
        license="Dados públicos do Ministério da Saúde; citar a fonte (MS/SVSA/CGIAE, SIM e Sinasc; MS/CNES)",
        description=f"Óbitos de menores de 1 ano e nascidos vivos por município de residência da mãe, de "
        f"{DEATH_YEARS[0]} a {DEATH_YEARS[-1]}; médicos (vínculos) e leitos de internação existentes no Cadastro "
        f"Nacional de Estabelecimentos de Saúde em dezembro de {', '.join(map(str, CNES_YEARS))}; e as estimativas de "
        "população do IBGE usadas para dividir.",
        used_for=["Linha do tempo: Saúde", "Conselheiro da saúde", "Por quê"],
    )

    def _tab(self, def_path, rel, fields, force):
        self.download_form(f"{TABNET}?{def_path}", rel, fields, encoding="latin-1", force=force)

    def fetch(self, force=False):
        base = [("Linha", "Município"), ("formato", "prn"), ("mostre", "Mostra")]
        self._tab("sim/cnv/inf10br.def", "infant_deaths.html", base + [
            ("Coluna", "Ano_do_Óbito"), ("Incremento", "Óbitos_p/Residênc"), ("SMunicípio", "TODAS_AS_CATEGORIAS__")]
            + [("Arquivos", f"infbr{_yy(y)}.dbf") for y in DEATH_YEARS], force)
        self._tab("sinasc/cnv/nvbr.def", "births.html", base + [
            ("Coluna", "Ano_do_nascimento"), ("Incremento", "Nascim_p/resid.mãe"), ("SMunicípio", "TODAS_AS_CATEGORIAS__")]
            + [("Arquivos", f"nvbr{_yy(y)}.dbf") for y in DEATH_YEARS], force)
        for y in CNES_YEARS:
            self._tab("cnes/cnv/prid02br.def", f"doctors_{y}.html", base + [
                ("Coluna", "--Não-Ativa--"), ("Incremento", "Quantidade"), ("Arquivos", f"pfbr{_yy(y)}12.dbf"),
                ("SMunicípio", "TODAS_AS_CATEGORIAS__")] + [("SMédicos", str(k)) for k in range(1, 73)], force)
            self._tab("cnes/cnv/leiintbr.def", f"beds_{y}.html", base + [
                ("Coluna", "--Não-Ativa--"), ("Incremento", "Quantidade_existente"), ("Arquivos", f"ltbr{_yy(y)}12.dbf"),
                ("SMunicípio", "TODAS_AS_CATEGORIAS__")], force)
        for y in POP_YEARS:
            self.download(f"{SIDRA}/t/6579/n6/all/v/9324/p/{y}", f"pop_{y}.json", force=force)

    def process(self):
        import json
        read = lambda f: parse_tabnet((self.raw_dir / f).read_bytes().decode("latin-1"))
        files = ["infant_deaths.html", "births.html"]
        heads, deaths = read("infant_deaths.html")
        hb, births = read("births.html")
        by_year = lambda head, d: {code: {h: v for h, v in zip(head, vals) if h.isdigit()} for code, vals in d.items()}
        out = {"deaths": by_year(heads, deaths), "births": by_year(hb, births), "doctors": {}, "beds": {}, "population": {}}
        for y in CNES_YEARS:
            for key in ("doctors", "beds"):
                f = f"{key}_{y}.html"
                files.append(f)
                _, d = read(f)
                for code, vals in d.items():
                    out[key].setdefault(code, {})[str(y)] = vals[0]
        for y in POP_YEARS:
            f = f"pop_{y}.json"
            files.append(f)
            for r in json.loads((self.raw_dir / f).read_text(encoding="utf-8"))[1:]:
                if r["V"] not in ("...", "-", "X", ""):
                    out["population"].setdefault(r["D1C"], {})[str(y)] = float(r["V"])
        return {"vintage": f"SIM e Sinasc {DEATH_YEARS[0]} a {DEATH_YEARS[-1]}, CNES dez. {CNES_YEARS[-1]}", "_files": files,
                "death_years": [str(y) for y in DEATH_YEARS], "cnes_years": [str(y) for y in CNES_YEARS], **out}
