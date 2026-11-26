"""Siconfi (Tesouro Nacional): what each city hall took in during one year, and from where.

The DCA (Declaração de Contas Anuais, annex I-C, gross revenue) of every municipality, from the Tesouro's open data
API, which answers one municipality at a time (~350 accounts each). The fetch keeps only the accounts the map uses,
one file per state, so the cache stays small: total revenue, the city's own taxes and fees, current and capital
transfers, and inside them the FPM (federal fund), the ICMS share (state tax) and the royalties of oil, minerals and
water.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from ..core import fetch
from ..core.source import Source, SourceInfo
from ..core.store import load_interim

API = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca"
YEAR = 2024
COLUMN = "Receitas Brutas Realizadas"
ACCOUNTS = {
    "ReceitasExcetoIntraOrcamentarias": "total",
    "RO1.1.0.0.00.0.0": "own",          # impostos, taxas e contribuições de melhoria (IPTU, ISS, ITBI, taxas)
    "RO1.7.0.0.00.0.0": "transfers",    # transferências correntes
    "RO2.4.0.0.00.0.0": "capital_transfers",
    "RO1.7.1.1.51.0.0": "fpm",
    "RO1.7.2.1.50.0.0": "icms",
    "RO1.7.1.2.00.0.0": "royalties",
}


def keep(items: list[dict]) -> dict[str, float]:
    """The accounts the map uses from one municipality's DCA rows."""
    out = {}
    for r in items:
        key = ACCOUNTS.get(r.get("cod_conta"))
        if key and r.get("coluna") == COLUMN and r.get("valor") is not None:
            out[key] = round(float(r["valor"]), 2)
    return out


class Siconfi(Source):
    info = SourceInfo(
        id="siconfi",
        title=f"Siconfi: receitas das prefeituras em {YEAR} (DCA, anexo I-C)",
        publisher="Secretaria do Tesouro Nacional, Ministério da Fazenda",
        homepage="https://siconfi.tesouro.gov.br/",
        license="Dados abertos do Tesouro Nacional; citar a fonte (STN, Siconfi)",
        description=f"Quanto cada prefeitura arrecadou em {YEAR} e de onde veio o dinheiro, pela declaração de contas "
        "anuais que ela mesma entrega ao Tesouro: impostos e taxas próprios (IPTU, ISS, ITBI), transferências da União "
        "(o FPM) e do estado (a parte do ICMS), royalties de petróleo, minérios e água. A prefeitura que não entregou "
        "a declaração fica sem dado.",
        used_for=["Por quê", "Lente: dinheiro próprio da prefeitura"],
    )

    def _get(self, code: str) -> dict:
        url = f"{API}?an_exercicio={YEAR}&no_anexo=DCA-Anexo%20I-C&id_ente={code}"
        for n in range(8):
            try:
                time.sleep(0.25)  # the API answers 429 above a few requests per second
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": fetch.USER_AGENT}), timeout=90) as r:
                    return keep(json.loads(r.read()).get("items", []))
            except urllib.error.HTTPError as e:
                if n == 7 or e.code not in (429, 500, 502, 503, 504):
                    raise
                wait = float(e.headers.get("Retry-After") or 0) or 5 * 2 ** min(n, 4)
                time.sleep(wait)
            except (urllib.error.URLError, TimeoutError):
                if n == 7:
                    raise
                time.sleep(5 * (n + 1))
        return {}

    def fetch(self, force=False):
        counties = load_interim("ibge_boundaries")["counties"]
        by_uf: dict[str, list[str]] = {}
        for m in counties:
            by_uf.setdefault(m["geoid"][:2], []).append(m["geoid"])
        for uf, codes in sorted(by_uf.items()):
            def attempt(tmp: Path, codes=codes):
                with ThreadPoolExecutor(2) as pool:
                    got = dict(zip(codes, pool.map(self._get, codes)))
                data = json.dumps({c: v for c, v in got.items() if v}, separators=(",", ":")).encode()
                tmp.write_bytes(data)
                import hashlib
                return hashlib.sha256(data).hexdigest(), len(data)
            fetch._download_with(self.id, f"{API}?an_exercicio={YEAR}&no_anexo=DCA-Anexo%20I-C&id_ente=<{uf}…>",
                                 f"dca_{YEAR}_uf{uf}.json", attempt, force=force, note=f" ({len(codes)} municipalities)")

    def process(self):
        out, files = {}, sorted(p.name for p in self.raw_dir.glob(f"dca_{YEAR}_uf*.json"))
        for f in files:
            out.update(json.loads((self.raw_dir / f).read_text()))
        return {"vintage": f"Siconfi, DCA {YEAR}", "_files": files, "year": YEAR, "municipalities": out}
