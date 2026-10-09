#!/usr/bin/env python3
"""Static file server for local testing that disables caching, so edited
source files are always reflected on the next browser reload.

`Cache-Control: no-store` is what guarantees that. An earlier version also sent
`Clear-Site-Data: "cache"` on every response, which asks the browser to wipe its
cache for the whole origin - thirty-five times per page load, once per script tag.
The cost of a wipe scales with how much is in the cache, so the page loaded
instantly on an empty profile and stalled for minutes on a warm everyday one.
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    http.server.test(HandlerClass=NoCacheHandler, port=port)
