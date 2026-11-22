#!/usr/bin/env python3
"""Локальный сервер для превью «Ходи Броди».

Отличия от `python -m http.server`:
- корректные MIME-типы для .webp и .svg (иначе часть браузеров
  не показывает изображения);
- no-store для HTML/CSS/JS, чтобы превью всегда показывало свежую
  версию, и короткий кеш для assets;
- явный лог только для ошибок и медленных запросов, чтобы не
  засорять вывод превью.
"""

import functools
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8000"))

# Python 3.11 не знает .webp в mimetypes на некоторых сборках.
EXTRA_TYPES = {
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
}

NO_STORE = (".html", ".css", ".js", ".json", ".ico", ".svg")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        **EXTRA_TYPES,
    }

    def end_headers(self):
        path = self.path.split("?", 1)[0].lower()
        ext = os.path.splitext(path)[1]
        if ext in NO_STORE or path in ("/", ""):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        # Разрешаем встраивание в iframe превью.
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Печатаем только ошибки: успешные запросы не нужны в превью.
        try:
            status = str(args[1]) if len(args) > 1 else ""
        except Exception:
            status = ""
        if status.startswith(("4", "5")):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == "__main__":
    os.chdir(ROOT)
    handler = functools.partial(Handler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), handler) as httpd:
        print(f"Ходи Броди: http://0.0.0.0:{PORT}/  (root: {ROOT})", flush=True)
        httpd.serve_forever()
