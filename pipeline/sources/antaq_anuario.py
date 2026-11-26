"""ANTAQ Anuário Estatístico Aquaviário 2025: the busiest port installations, container terminals and grain
export terminals of the year.

The raw ANTAQ base (ea.antaq.gov.br) was offline (HTTP 502) when this source was written, so the figures are the
ones the agency printed in its 2025 yearbook, transcribed below with the page each comes from. The PDF itself is
downloaded and checksummed, so anyone can check a number against it. Positions are the municipality seat of each
installation (the yearbook gives no coordinates).
"""

from __future__ import annotations

from ..core.source import Source, SourceInfo

URL = "https://www.gov.br/antaq/pt-br/central-de-conteudos/publicacoes-da-antaq/Anuario2025.pdf/@@download/file"
FILE = "Anuario2025.pdf"
YEAR = 2025

# name, kind, municipality, UF, cargo (million t, p. 5 ranking), containers (thousand TEU, p. 13),
# corn + soy exports (million t, p. 14). None = not in that ranking.
PO, TUP = "Porto organizado", "Terminal autorizado"
INSTALLATIONS = [
    ("Ponta da Madeira", TUP, "São Luís", "MA", 172.4, None, None),
    ("Santos", PO, "Santos", "SP", 142.8, 4051, 42.1),
    ("Tubarão", TUP, "Vitória", "ES", 87.4, None, 4.8),
    ("Tebig (Angra dos Reis)", TUP, "Angra dos Reis", "RJ", 70.4, None, None),
    ("Paranaguá", PO, "Paranaguá", "PR", 66.4, 1540, 19.7),
    ("Itaguaí", PO, "Itaguaí", "RJ", 62.8, None, None),
    ("TPET/TOIL (Açu)", TUP, "São João da Barra", "RJ", 60.4, None, None),
    ("Tebar (São Sebastião)", TUP, "São Sebastião", "SP", 54.1, None, None),
    ("Itaqui", PO, "São Luís", "MA", 36.8, None, 18.8),
    ("Rio Grande", PO, "Rio Grande", "RS", 31.6, 1018, 5.6),
    ("Terminal da Ilha Guaíba", TUP, "Mangaratiba", "RJ", 31.5, None, None),
    ("Porto Sudeste", TUP, "Itaguaí", "RJ", 30.6, None, None),
    ("Suape", PO, "Ipojuca", "PE", 24.3, 698, None),
    ("Terminal de Minério (Açu)", TUP, "São João da Barra", "RJ", 24.2, None, None),
    ("Vila do Conde", PO, "Barcarena", "PA", 21.3, None, None),
    ("Itapoá", TUP, "Itapoá", "SC", None, 1446, None),
    ("DP World Santos", TUP, "Santos", "SP", None, 1142, None),
    ("Portonave", TUP, "Navegantes", "SC", None, 1034, None),
    ("Rio de Janeiro", PO, "Rio de Janeiro", "RJ", None, 939, None),
    ("Chibatão", TUP, "Manaus", "AM", None, 712, None),
    ("Pecém", TUP, "São Gonçalo do Amarante", "CE", None, 665, None),
    ("Terminal Graneleiro Hermasa", TUP, "Itacoatiara", "AM", None, None, 5.3),
    ("Terminal Novo Remanso", TUP, "Itacoatiara", "AM", None, None, 2.9),
    ("Santarém", PO, "Santarém", "PA", None, None, 7.1),
    ("Terfron", TUP, "Barcarena", "PA", None, None, 6.0),
    ("Hidrovias do Brasil Vila do Conde", TUP, "Barcarena", "PA", None, None, 7.2),
    ("Cotegipe", TUP, "Salvador", "BA", None, None, 4.7),
    ("TIPLAM", TUP, "Santos", "SP", None, None, 5.1),
    ("São Francisco do Sul", PO, "São Francisco do Sul", "SC", None, None, 9.1),
]


class AntaqAnuario(Source):
    info = SourceInfo(
        id="antaq_anuario",
        title=f"Anuário Estatístico Aquaviário {YEAR}",
        publisher="Agência Nacional de Transportes Aquaviários (ANTAQ)",
        homepage="https://www.gov.br/antaq/pt-br/central-de-conteudos/publicacoes-da-antaq/estatisticos-aquaviarios",
        license="Dados públicos da ANTAQ; citar a fonte",
        description=f"As instalações portuárias que mais movimentaram carga em {YEAR} (p. 5), os maiores terminais de "
        "contêineres (p. 13) e os principais terminais de exportação de milho e soja (p. 14), transcritos do anuário "
        "(a base bruta do Estatístico Aquaviário estava fora do ar). Cada instalação fica na sede do seu município.",
        used_for=["Portos no mapa"],
    )

    def fetch(self, force=False):
        self.download(URL, FILE, force=force, expect_binary=True)

    def process(self):
        rows = [{"name": n, "kind": k, "municipality": m, "uf": uf,
                 "tons": None if t is None else round(t * 1e6), "teu": None if teu is None else teu * 1000,
                 "grain_export_t": None if g is None else round(g * 1e6)}
                for n, k, m, uf, t, teu, g in INSTALLATIONS]
        return {"vintage": f"ANTAQ, Anuário {YEAR}", "_files": [FILE], "year": YEAR, "installations": rows}
