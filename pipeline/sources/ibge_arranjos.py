"""IBGE Arranjos Populacionais (2nd edition): which municipalities form one functional city."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile

from ..core.source import Source, SourceInfo

URL = ("https://geoftp.ibge.gov.br/organizacao_do_territorio/divisao_regional/arranjos_populacionais/"
       "tabelas_xls_2ed/tab01.xlsx")
FILE = "tab01.xlsx"
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def read_xlsx_rows(path, sheet: str = "xl/worksheets/sheet1.xml") -> list[dict[str, str | None]]:
    """Rows of the first sheet as {column letter: text}, standard library only."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si"):
                shared.append("".join(t.text or "" for t in si.iter(NS + "t")))
        rows = []
        for row in ET.fromstring(z.read(sheet)).iter(NS + "row"):
            cells = {}
            for c in row.iter(NS + "c"):
                col = re.match(r"[A-Z]+", c.get("r")).group(0)
                v = c.find(NS + "v")
                text = None if v is None else (shared[int(v.text)] if c.get("t") == "s" else v.text)
                cells[col] = text.strip() if isinstance(text, str) else text
            rows.append(cells)
        return rows


def parse_arranjos(rows: list[dict]) -> list[dict]:
    """A title row (name in column A, no code in B) opens an arranjo; member rows carry the 7-digit code in B."""
    out, cur = [], None
    for r in rows:
        a, b = r.get("A"), r.get("B")
        if b and re.fullmatch(r"\d{7}", b):
            if cur is None:
                raise ValueError(f"member {a} before any arranjo title")
            cur["members"].append({"code": b, "name": re.sub(r" \([A-Z]{2}\)$", "", a or ""), "nucleus": r.get("D") == "Sim"})
        elif a and "/" in a and not b and len(a) < 120:
            cur = {"name": a, "members": []}
            out.append(cur)
    return [x for x in out if x["members"]]


class IbgeArranjos(Source):
    info = SourceInfo(
        id="ibge_arranjos",
        title="Arranjos Populacionais e Concentrações Urbanas do Brasil, 2ª edição (tabela 1.1)",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/divisao-regional/15782-arranjos-populacionais-e-concentracoes-urbanas-do-brasil.html",
        license="Dados públicos do IBGE; citar a fonte (IBGE)",
        description="Os 294 arranjos populacionais: grupos de municípios tão integrados pelo deslocamento para "
        "trabalhar e estudar, ou pela mancha urbana contínua, que funcionam como uma cidade só (como as áreas "
        "metropolitanas dos EUA). A composição é de 2010; a população e o PIB somados são os de hoje.",
        used_for=["Quais municípios formam cada cidade do mapa"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force, expect_binary=True)

    def process(self):
        arr = parse_arranjos(read_xlsx_rows(self.raw_dir / FILE))
        return {"vintage": "Arranjos Populacionais, 2ª edição (base 2010)", "_files": [FILE], "arranjos": arr}
