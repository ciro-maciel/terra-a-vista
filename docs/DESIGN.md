# Terra à Vista: design

The map looks like a strategy game board made from real data: dark sea, gilded frames, parchment ink, a serif for
names and a sans for numbers. This file is the system behind it, so a new screen (a page, a panel, a bar) looks like
it was always there. `web/css/style.css` holds the tokens; `web/css/page.css` gives standalone pages (Pergunte ao mapa,
Como contamos) the same look without the map.

## Tokens

| Token | Value | Use |
|---|---|---|
| `--ink` | `#efe4c6` | text |
| `--ink-dim` | `#b9ab88` | secondary text, captions, sources |
| `--gold` | `#c9a45c` | frames, rules, section kickers |
| `--gold-bright` | `#ecd08e` | active state, links, the one thing to look at |
| `--panel` / `--panel-2` | `rgba(16,25,35,.98)` / `rgba(28,41,56,.98)` | panel gradient, bottom to top |
| `--line` | `rgba(201,164,92,.55)` | panel border |
| sea | `#0d2a47` | page background behind everything |
| `--serif` | Palatino, Book Antiqua, Georgia | names: places, titles, numbers that headline |
| `--sans` | system UI | everything else; tabular figures for numbers |

Data colours are not tokens: each lens and series carries its own ramp (`pipeline/build/lenses.py` `RAMPS`), always
monotone in lightness, low values light on the dark map only when "low" is the story (native vegetation).

## Components

- **Panel**: the gradient, a 1 px `--line` border, a 6 px radius, a deep shadow and a faint inner highlight.
- **Kicker + title**: a small uppercase gold kicker with letter spacing over a serif title.
- **Button**: transparent with a gold hairline; pressed or current = `--gold-bright` fill with dark ink. One primary
  per screen.
- **Segmented control**: buttons joined, the current one lit (timeline themes, Cidades / Estados).
- **Chip**: a small rounded pill for a filter or a fact.
- **Language switch**: a segmented control, PT | EN, the current one filled with `--gold-bright` and dark ink; last in
  the top bar and in the header of the standalone pages.
- **Table**: tabular numbers right-aligned, the label left with a thin gold bar under it showing the share.
- **Source line**: `--ink-dim`, smaller, at the end of every block that shows a number: the rule and the source.
- **Icon**: inline SVG in `currentColor` (`web/js/ui/icon.js`), never an emoji or a text symbol (the repository's
  hook refuses them).
- **Emblem**: a round Brazilian flag with a gold rim (`tools/make_favicon.py` draws the favicon from the same shapes).

## Rules

1. Every number on screen says where it comes from and what it cannot show, near it.
2. Portuguese on screen by default, English when the visitor picks it (the PT | EN switch at the end of the top bar,
   or `?lang=en`); English in code and files. Every text goes through `tr()` (`web/js/i18n.js`), every number through
   `web/js/format.js`, so both languages read naturally: 1,2 mi and 2,9× in Portuguese, 1.2M and 2.9× in English.
3. One primary action per screen; everything else is a hairline button or a link.
4. Nothing waits in the dark: a block that loads shows "Lendo…" and then the answer or the reason it has none.
5. Works at 390 px wide: panels become full width, rows wrap, nothing scrolls sideways.
6. No religion, elections or the military; no names or art from an existing game.
