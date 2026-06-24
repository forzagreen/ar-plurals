# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`ar-plurals` publishes an Arabic broken-plurals (جموع التكسير) correspondence dataset plus a static GitHub Pages site that explores it. Each dataset row is one correspondence: a singular pattern (وزن المفرد) → a plural pattern (وزن الجمع) → a type (`اسم`/`صفة`), with free-text examples. There is no application server, framework, package.json, or test suite — just Python build scripts and a vanilla-JS site.

The only Python dependency is `openpyxl`.

## Commands

```bash
# one-time setup
python -m venv .venv && source .venv/bin/activate && pip install openpyxl

# rebuild every published artifact from the master sheet (see gotcha below)
python scripts/build_dataset.py

# serve the site locally with caching disabled (plain http.server caused stale-asset bugs)
python scripts/serve.py [port]          # default 8000, serves site/ at /

# re-vendor ECharts + the Noto Naskh Arabic font (needs network; refreshes pinned versions)
python scripts/fetch_assets.py

# parse_examples sanity check: re-parses the JSON and reports anomalous pairs / prose
python scripts/parse_examples.py
```

There is no lint step and no automated test. `scripts/parse_examples.py` run as `__main__` is the closest thing to a test — it parses every row and prints any "pair" that looks malformed (overly long singular, missing plural).

## Build pipeline (the important architecture)

```
sources/الجدول-الموحد المعدل.xlsx   ← expert-revised master sheet (UNTRACKED — see gotcha)
        │  scripts/build_dataset.py  (imports scripts/parse_examples.py)
        ▼
data/csv/جموع التكسير.csv      (UTF-8 BOM)
data/json/جموع التكسير.json    (adds structured `أمثلة`)
data/xlsx/جموع التكسير.xlsx    (formatted, RTL sheet)
site/assets/data.js            (window.PLURALS = {...} — what the site actually reads)
```

`build_dataset.py` loads the master sheet, drops the `الفروق` column, re-sorts rows (dediacritized singular, then plural, then type), parses examples, and writes all four outputs in one pass. **The four outputs must always be regenerated together** — never hand-edit `data/*` or `site/assets/data.js`; change the source sheet (or the script) and re-run.

`parse_examples.py` turns each free-text `الأمثلة` cell into structured blocks `{شرط, شاذ, أزواج, ملاحظة}` (condition / irregular flag / `[singular, plural]` pairs / optional note). Parentheticals are protected before any `:`/`،`/`-` splitting because they can contain those delimiters. `build_dataset.py` re-keys these to ascii (`cond/irregular/pairs/note`) for the site payload.

**`extract_tables.py` and `merge_tables.py` are archival** — the original Word→xlsx extraction and the two-table merge that produced the pre-revision master. They read/write files under `sources/` and are not part of the active pipeline. Don't run them when rebuilding the dataset.

### Gotcha: the build input is untracked

`sources/` is gitignored except `دليل جموع التكسير.pdf`, so the master sheet `sources/الجدول-الموحد المعدل.xlsx` that `build_dataset.py` reads **lives only on the local disk** — it is not in git. On a fresh clone the build cannot run until that file is restored. The committed `data/*` artifacts are the canonical published output.

## Site (`site/`)

Static, framework-free, fully offline/self-contained (ECharts and the font are vendored locally; no CDN or Google Fonts at runtime). `index.html` loads `assets/data.js` → `assets/vendor/echarts.min.js` → `assets/app.js`. All logic is in `app.js` (one IIFE) over `window.PLURALS`.

Three tabs, deep-linked via `#hash` (`table` / `graph` / `matrix`):
- **Table** — instant search (diacritic-insensitive; `normalize()` folds hamza/alef, ى→ي, ة→ه and strips ḥarakāt), type filter, and three modes (flat / by-singular / by-plural).
- **Sankey** (ECharts) — all correspondences at once; singular nodes on the right (depth 1), plural on the left (depth 0), flowing R→L like Arabic. `animation:false` is deliberate (headless screenshots hang otherwise).
- **Matrix** — singular rows × plural columns heatmap; cell color encodes اسم/صفة/both.

Clicking any pattern (in any tab) does an **exact** filter of the table via `filterExact()` and shows a dismissible chip; clicking a matrix cell filters to that exact pair. Theme is auto/light/dark, resolved before first paint and persisted in `localStorage`; the canvas Sankey re-reads CSS color tokens on theme change.

`REPO_URL` in `app.js` controls the header GitHub link. The single typeface everywhere (UI and Arabic, including ECharts `fontFamily`) is **Noto Naskh Arabic**.

## Deployment

Push to `main`; `.github/workflows/pages.yml` copies `site/` into `_site/`, copies `data/` into `_site/data/` (so the download buttons resolve in production the way the local `site/data` symlink does in dev), and deploys to GitHub Pages.

## Conventions

- **Western digits only (0-9), never Arabic-Indic (٠-٩)**, even inside Arabic text — in data, code, and prose.
- Arabic counted-noun agreement matters in UI strings: see `countWazn()` in `app.js` (1 / 2 / 3-10 / 11+ forms).
- The user-facing docs (`README.md`, `docs/DETAILS.md`) are written in Arabic with `dir="rtl"` wrappers; keep that style when editing them.
