"""Phase 0 only: the empty core files the browser needs to open the map before Brazil has cities.

The app loads cities.json and nation.json before anything else. Until phase 1 rewrites cities.py for Brazil
(Censo 2022, PIB dos Municípios), this writes no cities and a nation whose every figure is null (unknown,
never 0), so the map shows terrain and states and the top bar shows dashes. Delete this module in phase 1.
"""

from __future__ import annotations

from ..core.store import load_interim, write_web
from .yields import GDP_INDUSTRIES, INDUSTRY_LINES, YIELDS

REQUIRES = ["_world"]
PRODUCES = ["cities.json", "nation.json"]


def build() -> None:
    load_interim("_world")  # only to fail clearly if the world was not built
    nation = {
        "population": None,
        "yields": {y["key"]: None for y in YIELDS},
        "jobs": {k: None for k in INDUSTRY_LINES},
        "employed": None,
        "median_income": None,
        "median_rent": None,
        "home_value": None,
        "unemployment": None,
        "rent_burden": None,
        "gdp": None,
        "gdp_year": None,
        "gdp_by_industry": None,
        "gdp_undisclosed": None,
        "gdp_estimated": None,
        "growth": None,
        "growth_years": None,
    }
    write_web("cities.json", [])
    write_web(
        "nation.json",
        {
            "vintage": "Fase 0: só o terreno",
            "year": None,
            "gdp_vintage": None,
            "nation": nation,
            "yields": YIELDS,
            "industries": {k: label for k, (_, label) in INDUSTRY_LINES.items()},
            "gdp_industries": GDP_INDUSTRIES,
        },
    )
