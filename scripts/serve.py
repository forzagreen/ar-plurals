#!/usr/bin/env python3
"""Local dev server for the site, with caching disabled so edits always show.

    python scripts/serve.py [port]   # default 8000, serves ./site at /

Mirrors the deployed layout: data/ is reachable at /data via the site/data
symlink, so the download buttons work locally too.
"""
import http.server
import os
import socketserver
import sys

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "site")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCache(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


with Server(("127.0.0.1", PORT), NoCache) as httpd:
    print(f"serving {ROOT} at http://127.0.0.1:{PORT}/  (no-cache)")
    httpd.serve_forever()
