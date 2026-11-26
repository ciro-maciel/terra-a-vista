# Terra à Vista MCP

The map's public data as a remote MCP server, and the weekly anonymous index of what people ask it.

- Server: `https://terra-a-vista.mcp.myagents.click/mcp` (Streamable HTTP, stateless, no sign-in: the data is public).
- How to connect, for people: https://ciro-maciel.github.io/terra-a-vista/pergunte/
- The index rules, for people: https://ciro-maciel.github.io/terra-a-vista/como-contamos/

## Tools (all read-only)

| Tool | What it answers |
|---|---|
| `guide` | what the map knows, every measure, the rules, the privacy of the index |
| `place_profile` | one municipality, city or state: population, growth, GDP, income, exports, the city hall's money, type of city, the latest value of every theme |
| `find_places` | filter and sort places of one level by any measures |
| `compare_places` | 2 to 10 places side by side |
| `place_trend` | one theme through the years (people, gdp, land, farm, health, school, net, disasters, idhm) |
| `trends` | the weekly anonymous index |

The data is read from the files the map publishes (`web/data/*.json` on GitHub Pages), so the map and the server
always say the same thing. `src/places.js` holds the measures; each series measure has a latest value
(`land.natural`) and a change since its first comparable year (`land.natural.change`).

## The index

`src/tally.js` (pure rules, tested) and `src/tally-object.js` (one Durable Object holding the open week):

1. Observations come only from structured tool arguments: resolved IBGE codes, measure ids, the shape of a search with
   population in bands. Free text and unresolved names are never kept. The conversation never reaches the server.
2. Each observation is counted by distinct stamps: SHA-256 of the connection (address and client) with a random key
   for the week. Neither the address nor the key leaves the object; the address is never stored.
3. On Monday 03:00 UTC the week closes: boxes with fewer than 10 stamps are dropped, the rest get Laplace noise (never
   below 10), the rankings are written to KV, and every stamp and the week's key are deleted.
4. More than 60 calls a minute from one stamp are refused.

`test/tally.test.js` turns red if the minimum is lowered or if text a person typed would be counted.

## Develop

```bash
cd mcp
bun install
bun test
bunx wrangler dev --local --port 8799     # then POST JSON-RPC to http://localhost:8799/mcp
```

Deployed by `.github/workflows/deploy-mcp.yml` on every push to `main` that touches `mcp/`.
