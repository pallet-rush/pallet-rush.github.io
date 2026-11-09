"""Lokaler Dev-Server für Pallet Rush.

Start:  python tools/devserver.py   (dann http://localhost:8080)

- Liefert das Spiel ohne Browser-Cache aus (Änderungen sofort sichtbar).
- POST /__save?file=levels.js speichert generierte Level nach js/data/.
  Nur von localhost erreichbar, nur Dateien in js/data/.
"""
import http.server
import os
import socketserver
import sys
from urllib.parse import urlparse, parse_qs

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_DIR = os.path.join(ROOT, 'js', 'data')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        url = urlparse(self.path)
        if url.path != '/__save' or self.client_address[0] not in ('127.0.0.1', '::1'):
            self.send_error(403)
            return
        name = parse_qs(url.query).get('file', [''])[0]
        if not name or '/' in name or '\\' in name or not name.endswith('.js'):
            self.send_error(400, 'bad file name')
            return
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        os.makedirs(DATA_DIR, exist_ok=True)
        with open(os.path.join(DATA_DIR, name), 'wb') as f:
            f.write(body)
        self.send_response(200)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'ok')


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


Handler.extensions_map.update({'.js': 'text/javascript', '.mjs': 'text/javascript',
                               '.webmanifest': 'application/manifest+json'})

if __name__ == '__main__':
    with Server(('127.0.0.1', PORT), Handler) as httpd:
        print(f'Pallet Rush Dev-Server: http://localhost:{PORT}')
        httpd.serve_forever()
