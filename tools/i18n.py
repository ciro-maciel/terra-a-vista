"""The English dictionary of the map: what it must hold and what it holds wrong.

Portuguese is the source language. Every text people read is its own key, gathered from four places:
  - the code: the first argument of every tr("...") call in web/js and in the pages' inline scripts;
  - the pages: text, readable attributes and data-i18n-html blocks of web/index.html and the standalone pages;
  - the data: every string value of web/data/*.json, except the place names web/i18n/skip.json lists;
  - web/i18n/extra.json: text that arrives at run time from elsewhere (the MCP server's weekly index).
web/i18n/en.json maps each key to its English text.

    uv run python tools/i18n.py                 # report; exit 1 if the interface misses a key or a translation is broken
    uv run python tools/i18n.py --missing FILE  # also write the missing keys as {"key": ""} for translation
    uv run python tools/i18n.py --strict        # data keys missing also fail
"""
from __future__ import annotations

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
I18N = WEB / "i18n"
PAGES = [WEB / "index.html", WEB / "pergunte" / "index.html", WEB / "como-contamos" / "index.html"]
ATTRS = ("title", "aria-label", "placeholder", "alt")
META = re.compile(r'^(description|og:.*|twitter:.*)$')

_ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}


def js_unescape(s: str) -> str:
    out, i = [], 0
    while i < len(s):
        c = s[i]
        if c == "\\" and i + 1 < len(s):
            n = s[i + 1]
            if n == "u" and s[i + 2:i + 3] == "{":
                j = s.index("}", i); out.append(chr(int(s[i + 3:j], 16))); i = j + 1; continue
            if n == "u":
                out.append(chr(int(s[i + 2:i + 6], 16))); i += 6; continue
            if n == "x":
                out.append(chr(int(s[i + 2:i + 4], 16))); i += 4; continue
            out.append(_ESC.get(n, n)); i += 2; continue
        out.append(c); i += 1
    return "".join(out)


TR_CALL = re.compile(r"""(?<![\w$.])tr\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')""")


def code_keys(text: str) -> set[str]:
    return {js_unescape(m.group(1) if m.group(1) is not None else m.group(2)) for m in TR_CALL.finditer(text)}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


class _Page(HTMLParser):
    """Collects what translateDocument (web/js/i18n.js) looks up: text nodes, attributes, title, meta, blocks."""

    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.keys: set[str] = set()
        self.stack: list[str] = []
        self.block_depth = 0
        self.block_buf: list[str] = []
        self.skip = 0  # inside script/style

    def _attrs_html(self, attrs):
        parts = []
        for k, v in attrs:
            if v is None:
                parts.append(f" {k}=\"\"")
            else:
                parts.append(f' {k}="' + v.replace("&", "&amp;").replace('"', "&quot;") + '"')
        return "".join(parts)

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ("script", "style"):
            self.skip += 1
        for a in ATTRS:
            if d.get(a) and norm(d[a]):
                self.keys.add(d[a].strip())
        if tag == "meta" and META.match(d.get("name") or d.get("property") or "") and d.get("content"):
            self.keys.add(d["content"].strip())
        if self.block_depth:
            kept = [(k, v) for k, v in attrs if k != "data-i18n-html"]
            self.block_buf.append(f"<{tag}{self._attrs_html(kept)}>")
            if tag not in self.VOID:
                self.block_depth += 1
        elif "data-i18n-html" in d:
            self.block_depth = 1; self.block_buf = []
        if tag not in self.VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1
        if self.block_depth:
            self.block_depth -= 1
            if self.block_depth == 0:
                self.keys.add(norm("".join(self.block_buf)))
            else:
                self.block_buf.append(f"</{tag}>")
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()

    def handle_data(self, data):
        if self.skip:
            return
        if self.block_depth:
            self.block_buf.append(data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
            return
        if self.stack and self.stack[-1] == "title":
            self.keys.add(data.strip()); return
        if norm(data) and re.search(r"[A-Za-zÀ-ú]", data):
            self.keys.add(norm(data))


def page_keys(path: Path) -> set[str]:
    html = path.read_text(encoding="utf-8")
    p = _Page(); p.feed(html)
    keys = p.keys
    for m in re.finditer(r"<script type=\"module\">(.*?)</script>", html, re.S):
        keys |= code_keys(m.group(1))
    return keys


def data_keys(skip: dict[str, list[str]]) -> set[str]:
    """The same walk as translateData in web/js/i18n.js."""
    keys: set[str] = set()
    units: set[str] = set()  # one-word units ("anos", "cabeças") are text even though they look like ids
    for f in sorted((WEB / "data").glob("*.json")):
        name = f.stem
        skipped = set(skip.get(name, []))
        if "*" in skipped:
            continue
        data = json.loads(f.read_text(encoding="utf-8"))

        def walk(o, path):
            if isinstance(o, list):
                for v in o:
                    if isinstance(v, str):
                        if path not in skipped:
                            keys.add(v)
                    elif isinstance(v, (dict, list)):
                        walk(v, path)
                return
            for k, v in o.items():
                p = f"{path}.{k}" if path else k
                if isinstance(v, str):
                    if p not in skipped and path not in skipped:
                        keys.add(v)
                        if k == "unit" and is_token(v):
                            units.add(v)
                elif isinstance(v, (dict, list)) and p not in skipped:
                    walk(v, p)

        walk(data, "")
    return {k for k in keys if wants_translation(k)} | units


def wants_translation(s: str) -> bool:
    """Strings with words in them; ids, codes, colours, urls and numbers stay as they are."""
    if not re.search(r"[A-Za-zÀ-ú]{2,}", s):
        return False
    if re.fullmatch(r"#[0-9a-fA-F]{3,8}|https?://\S+|[\w.\-/]+\.(json|csv|zip|xlsx|gpkg|tif|pbf|shp|parquet)|[A-Z0-9_]{2,12}", s):
        return False
    if is_token(s):
        return False
    return True


TOKEN = re.compile(r"[a-zà-ú0-9_\-:.]+")


def is_token(s: str) -> bool:
    """One lowercase word or code: an id ("misto", "ibge_censo2022"), never text, except as a unit (see data_keys)."""
    return bool(TOKEN.fullmatch(s))


def all_keys() -> dict[str, set[str]]:
    skip = json.loads((I18N / "skip.json").read_text(encoding="utf-8"))
    code: set[str] = set()
    for f in sorted((WEB / "js").rglob("*.js")):
        code |= code_keys(f.read_text(encoding="utf-8"))
    pages: set[str] = set()
    for p in PAGES:
        pages |= page_keys(p)
    extra = set(json.loads((I18N / "extra.json").read_text(encoding="utf-8")))
    return {"code": code, "pages": pages, "extra": extra, "data": data_keys(skip)}


PLACEHOLDER = re.compile(r"\{\w+\}")
TAG = re.compile(r"</?([a-zA-Z][\w-]*)")


def broken(key: str, value: str) -> str | None:
    """Why a translation cannot stand in for its key: a lost or added placeholder or tag."""
    if not isinstance(value, str) or not value.strip():
        return "empty"
    if sorted(PLACEHOLDER.findall(key)) != sorted(PLACEHOLDER.findall(value)):
        return f"placeholders {sorted(PLACEHOLDER.findall(key))} != {sorted(PLACEHOLDER.findall(value))}"
    if sorted(TAG.findall(key)) != sorted(TAG.findall(value)):
        return "tags differ"
    if key.startswith(" ") != value.startswith(" ") or key.endswith(" ") != value.endswith(" "):
        return "edge spaces differ"
    return None


def load_dict() -> dict[str, str]:
    path = I18N / "en.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def report(strict: bool = False, missing_out: Path | None = None) -> int:
    keys = all_keys()
    en = load_dict()
    ui = keys["code"] | keys["pages"] | keys["extra"]
    every = ui | keys["data"]
    missing_ui = sorted(k for k in ui if k not in en)
    missing_data = sorted(k for k in keys["data"] - ui if k not in en)
    bad = sorted((k, why) for k, v in en.items() if (why := broken(k, v)))
    stale = sorted(k for k in en if k not in every)
    print(f"keys: code {len(keys['code'])}, pages {len(keys['pages'])}, extra {len(keys['extra'])}, data {len(keys['data'])}")
    print(f"dictionary: {len(en)} entries, {len(stale)} no longer used")
    for k in missing_ui[:40]:
        print(f"  MISSING (interface) {k[:110]!r}")
    if len(missing_ui) > 40:
        print(f"  ... and {len(missing_ui) - 40} more")
    print(f"missing: interface {len(missing_ui)}, data {len(missing_data)}")
    for k, why in bad[:40]:
        print(f"  BROKEN {why}: {k[:90]!r}")
    if missing_out:
        missing_out.write_text(json.dumps({k: "" for k in missing_ui + missing_data}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"wrote {len(missing_ui) + len(missing_data)} missing keys to {missing_out}")
    failed = bool(missing_ui or bad or (strict and missing_data))
    return 1 if failed else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    out = Path(args[args.index("--missing") + 1]) if "--missing" in args else None
    sys.exit(report(strict="--strict" in args, missing_out=out))
