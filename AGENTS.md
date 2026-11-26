# AGENTS.md

Guidance for coding agents working on Terra à Vista.

- **Read `docs/DATA_CONTRACTS.md` first.** It is the shape of every `web/data` file, shared by the
  Python pipeline and the browser. Change a contract there first, then on both sides.
- **Flow:** source (`pipeline/sources/`) → interim → builder (`pipeline/build/`) → `web/data/*.json`.
  Sources know nothing about hexes; builders declare `REQUIRES` and `PRODUCES`.
- **Python is standard library only.** No dependencies, on purpose. The browser is plain ES modules
  and Canvas 2D: no framework, no npm, no build step.
- **`null` means unknown, never `0`.** Never fill a missing figure with a guess.
- **Every selection is a published rule** (`rule` text inside the data file), never a hand pick
  without saying so (`curated: true`).
- **`uv run python -m pipeline check` must have no FAIL**, and `uv run python -m unittest discover -s tests`
  must pass. A test counts only if breaking the code it protects turns it red.
- **Text people read is Brazilian Portuguese; identifiers, files and comments are English.** Portuguese is the source
  and the key: wrap every text in `tr("...")` from `web/js/i18n.js` (`{0}`, `{1}` for values), and the map also reads
  in English from `web/i18n/en.json`. After adding or changing text, run `uv run python tools/i18n.py`; it lists what
  has no English yet, and `tests/test_i18n.py` fails on any interface text without it. Place names are never
  translated (`web/i18n/skip.json`). Numbers go through `web/js/format.js` (`dec`, `UNIT`, `DEC`), never a hard comma.
- **No name, art or trademark of an existing game.** The genre is fine; a specific game is not.
- Big downloads (the first full `pipeline all`) belong on a CI runner, not on a laptop.
