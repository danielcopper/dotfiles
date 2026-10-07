"""Stand-in for ntfy: records every request as one JSON line, answers 200."""

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import override

log_path, port_path = sys.argv[1], sys.argv[2]


class Handler(BaseHTTPRequestHandler):
    def _record(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode()
        with open(log_path, "a") as f:
            _ = f.write(
                json.dumps(
                    {
                        "method": self.command,
                        "path": self.path,
                        "authorization": self.headers.get("Authorization"),
                        "title": self.headers.get("Title"),
                        "body": body,
                    }
                )
                + "\n"
            )
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        _ = self.wfile.write(b"{}")

    def do_POST(self) -> None:
        self._record()

    def do_PUT(self) -> None:
        self._record()

    def do_GET(self) -> None:
        self._record()

    @override
    def log_message(self, format: str, *args: object) -> None:
        pass


server = HTTPServer(("127.0.0.1", 0), Handler)
with open(port_path, "w") as f:
    _ = f.write(str(server.server_port))
server.serve_forever()
