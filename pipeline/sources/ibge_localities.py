"""IBGE Localidades 2022: the position of every municipal seat (sede municipal)."""

from __future__ import annotations

import struct
import zipfile

from ..core.source import Source, SourceInfo

URL = ("https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/"
       "Localidades_do_Brasil/2022/Localidades_Brasil_shp.zip")
FILE = "Localidades_Brasil_shp.zip"
SEAT = "Sede Municipal"
# Two municipalities have no "Sede Municipal" point: Brasília is filed as "Capital Federal" and Fernando de
# Noronha as a "Distrito Estadual". Their seat is that point.
SEAT_OTHER = {("Cidade", "Capital Federal"), ("Distrito Estadual de Fernando de Noronha", "")}


def read_dbf(data: bytes, encoding: str = "utf-8"):
    """Yield each record of a dBase III table as {field: text}."""
    n = struct.unpack("<I", data[4:8])[0]
    header_len, rec_len = struct.unpack("<HH", data[8:12])
    fields, o = [], 32
    while data[o] != 0x0D:
        fields.append((data[o:o + 11].split(b"\0")[0].decode("ascii"), data[o + 16]))
        o += 32
    for k in range(n):
        rec = data[header_len + k * rec_len: header_len + (k + 1) * rec_len]
        if rec[:1] == b"*":  # deleted
            continue
        row, p = {}, 1
        for name, ln in fields:
            row[name] = rec[p:p + ln].decode(encoding, errors="replace").strip()
            p += ln
        yield row


class IbgeLocalities(Source):
    info = SourceInfo(
        id="ibge_localities",
        title="Localidades do Brasil 2022",
        publisher="Instituto Brasileiro de Geografia e Estatística (IBGE)",
        homepage="https://www.ibge.gov.br/geociencias/organizacao-do-territorio/estrutura-territorial/27385-localidades.html",
        license="Dados públicos do IBGE; citar a fonte (IBGE)",
        description="A posição de cada sede municipal (a cidade que dá nome ao município). O estandarte de cada "
        "cidade do mapa fica na sede do seu município principal.",
        used_for=["Posição das cidades no mapa"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force, expect_binary=True)

    def process(self):
        with zipfile.ZipFile(self.raw_dir / FILE) as z:
            name = next(n for n in z.namelist() if n.lower().endswith(".dbf"))
            data = z.read(name)
        seats = {}
        for r in read_dbf(data):
            if r["SCT_LOCALI"] == SEAT or (r["CT_LOCALID"], r["SCT_LOCALI"]) in SEAT_OTHER:
                seats[r["CD_MUN"]] = {"name": r["NM_LOCALID"], "lon": float(r["LONG_LOCAL"]), "lat": float(r["LAT_LOCALI"])}
        return {"vintage": "Localidades 2022", "_files": [FILE], "seats": seats}
