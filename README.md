# Terra à Vista

**Brazil drawn as a turn-based strategy map, built from real public data.** Find your city: its
banner shows its GDP, its districts come from what its people actually do for work, and its land
is the real terrain and land cover. Every number traces back to a public source.

[Leia em português](README.pt-BR.md)

> **Status: under construction (phase 0).** The code here is still the United States version it
> started from. The Brazil pipeline is being written source by source; the plan is in
> [docs/PLAN.pt-BR.md](docs/PLAN.pt-BR.md).

## Where it comes from

Terra à Vista starts from [usaciv](https://karpathy.ai/usaciv/) by Andrej Karpathy (MIT), which
draws the United States the same way from 31 federal sources. We keep its browser app (hex grid,
painted terrain, City View, Advisors, the in-browser trailer maker) and rewrite the data pipeline for
Brazil: IBGE (Census 2022, municipal GDP), RAIS formal jobs, MapBiomas land cover, ANEEL, ANP, ANM,
ANTAQ, ANAC, ICMBio and more. His original README is kept in
[docs/upstream/README.md](docs/upstream/README.md).

The look is inspired by turn-based 4X strategy games. Every glyph, icon and texture is original and
drawn in code. This project is not affiliated with or endorsed by any game publisher.

## Run it

You need [uv](https://docs.astral.sh/uv/). Nothing else.

```bash
uv run python -m pipeline serve        # http://127.0.0.1:8765
uv run python -m unittest discover -s tests
```

Rebuilding the data downloads hundreds of megabytes from the publishers (`uv run python -m pipeline all`).

## Reading the map honestly

- Yields are names given to real figures. Gold is GDP.
- Districts measure **formal** employment (RAIS). About 4 in 10 Brazilian workers are informal, and
  the legend says so.
- Missing data stays missing: `null`, never `0`.
- Selections (wonders, districts, routes) follow rules published inside the data files.

## License

Code: MIT, see [LICENSE](LICENSE) and [NOTICE](NOTICE). The data belongs to its publishers and keeps
their terms; the in-app Almanac lists each one.

Made by [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-terra-a-vista).
