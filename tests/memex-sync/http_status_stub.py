"""Answers every request with one fixed HTTP status (401 asks for Basic auth)."""

import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import override

status, port_path = int(sys.argv[1]), sys.argv[2]


class Handler(BaseHTTPRequestHandler):
    def _answer(self) -> None:
        self.send_response(status)
        if status == 401:
            self.send_header("WWW-Authenticate", 'Basic realm="test"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        self._answer()

    def do_POST(self) -> None:
        self._answer()

    @override
    def log_message(self, format: str, *args: object) -> None:
        pass


server = HTTPServer(("127.0.0.1", 0), Handler)
with open(port_path, "w") as f:
    _ = f.write(str(server.server_port))
server.serve_forever()
