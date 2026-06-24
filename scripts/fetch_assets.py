#!/usr/bin/env python3
"""Vendor the site's third-party assets locally so it works fully offline.

Downloads:
  - ECharts            -> site/assets/vendor/echarts.min.js
  - Noto Naskh Arabic   -> site/assets/fonts/*.woff2  (+ site/assets/fonts.css)

Re-run to refresh the pinned versions. Requires network access.
"""
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "site", "assets")
FONTS_DIR = os.path.join(ASSETS, "fonts")
VENDOR_DIR = os.path.join(ASSETS, "vendor")

ECHARTS_URL = "https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"
# the site uses a single typeface — Noto Naskh Arabic — for everything
FONTS_CSS_URL = ("https://fonts.googleapis.com/css2"
                 "?family=Noto+Naskh+Arabic:wght@400;500;700&display=swap")
# a modern UA makes Google Fonts serve woff2 + unicode-range subsets
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def fetch(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def vendor_echarts():
    os.makedirs(VENDOR_DIR, exist_ok=True)
    data = fetch(ECHARTS_URL)
    with open(os.path.join(VENDOR_DIR, "echarts.min.js"), "wb") as f:
        f.write(data)
    print(f"echarts.min.js  {len(data) // 1024} KB")


def vendor_fonts():
    os.makedirs(FONTS_DIR, exist_ok=True)
    for f in os.listdir(FONTS_DIR):  # start clean so stale weights don't linger
        if f.endswith(".woff2"):
            os.remove(os.path.join(FONTS_DIR, f))
    css = fetch(FONTS_CSS_URL, {"User-Agent": UA}).decode("utf-8")
    urls = dict.fromkeys(re.findall(r"https://fonts\.gstatic\.com/[^)\s]+\.woff2", css))
    total = 0
    for url in urls:
        name = url.rsplit("/", 1)[-1]
        data = fetch(url, {"User-Agent": UA})
        with open(os.path.join(FONTS_DIR, name), "wb") as f:
            f.write(data)
        total += len(data)
        css = css.replace(url, "fonts/" + name)
    with open(os.path.join(ASSETS, "fonts.css"), "w", encoding="utf-8") as f:
        f.write("/* self-hosted via scripts/fetch_assets.py — Noto Naskh Arabic (OFL) */\n")
        f.write(css)
    print(f"{len(urls)} font files, {total // 1024} KB -> fonts.css")


if __name__ == "__main__":
    vendor_echarts()
    vendor_fonts()
    print("done — site is now self-contained.")
