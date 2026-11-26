"""Read the rows of an .xlsx sheet with the standard library only (zipfile + streaming XML).

Values come back as str (shared or inline strings) or float (numbers); empty cells are None. Rows stream, so a sheet
of hundreds of MB never sits in memory.
"""

from __future__ import annotations

import re
import zipfile
from pathlib import Path
from typing import Iterator
from xml.etree.ElementTree import iterparse

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_COL = re.compile(r"([A-Z]+)")


def _col(ref: str) -> int:
    n = 0
    for ch in _COL.match(ref).group(1):
        n = n * 26 + ord(ch) - 64
    return n - 1


def sheet_names(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        return [e.get("name") for _, e in iterparse(z.open("xl/workbook.xml")) if e.tag == NS + "sheet"]


def _sheet_file(z: zipfile.ZipFile, name: str | None) -> str:
    sheets = [(e.get("name"), e.get(REL + "id")) for _, e in iterparse(z.open("xl/workbook.xml")) if e.tag == NS + "sheet"]
    rels = {e.get("Id"): e.get("Target") for _, e in iterparse(z.open("xl/_rels/workbook.xml.rels")) if e.get("Id")}
    rid = sheets[0][1] if name is None else dict(sheets)[name]
    target = rels[rid].lstrip("/")
    return target if target.startswith("xl/") else "xl/" + target


def _shared(z: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    out = []
    for _, e in iterparse(z.open("xl/sharedStrings.xml")):
        if e.tag == NS + "si":
            out.append("".join(t.text or "" for t in e.iter(NS + "t")))
            e.clear()
    return out


def rows(path: Path, sheet: str | None = None) -> Iterator[list]:
    """Each row of the sheet as a list, cells placed by their column letter."""
    with zipfile.ZipFile(path) as z:
        strings = _shared(z)
        for _, e in iterparse(z.open(_sheet_file(z, sheet))):
            if e.tag != NS + "row":
                continue
            row: list = []
            for c in e.iter(NS + "c"):
                k = _col(c.get("r")) if c.get("r") else len(row)
                t, v = c.get("t"), c.find(NS + "v")
                if t == "s":
                    val = strings[int(v.text)] if v is not None else None
                elif t == "inlineStr":
                    val = "".join(x.text or "" for x in c.iter(NS + "t"))
                elif t in ("str", "e"):
                    val = v.text if v is not None else None
                elif v is not None and v.text is not None:
                    val = float(v.text)
                else:
                    val = None
                while len(row) < k:
                    row.append(None)
                row.append(val)
            e.clear()
            yield row
