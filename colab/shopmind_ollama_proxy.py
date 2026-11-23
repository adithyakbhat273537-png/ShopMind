"""Small authenticated Colab gateway for ShopMind's Ollama API calls.

Start this beside Ollama in Colab and expose only this port through HTTPS ngrok.
Set SHOPMIND_OLLAMA_TOKEN to the same secret as backend OLLAMA_API_KEY.
"""
import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


TOKEN = os.environ.get("SHOPMIND_OLLAMA_TOKEN", "")
OLLAMA_URL = os.environ.get("OLLAMA_LOCAL_URL", "http://127.0.0.1:11434").rstrip("/")
MAX_BODY = 2 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not log request headers or secrets.
        print("ShopMind Ollama gateway:", fmt % args)

    def _authorized(self):
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {TOKEN}"
        return bool(TOKEN) and hmac.compare_digest(supplied.encode(), expected.encode())

    def _send(self, status, payload, content_type="application/json"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _proxy(self, path, body=None):
        req = Request(f"{OLLAMA_URL}{path}", data=body,
                      headers={"Content-Type": "application/json", "Accept": "application/json"},
                      method="POST" if body is not None else "GET")
        try:
            with urlopen(req, timeout=125) as response:
                self._send(response.status, response.read(MAX_BODY + 1))
        except HTTPError as error:
            self._send(error.code, error.read(MAX_BODY + 1))
        except (URLError, TimeoutError):
            self._send(503, {"error": "Local Ollama is unavailable in this Colab runtime"})

    def do_GET(self):
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized"})
        if self.path != "/api/tags":
            return self._send(404, {"error": "Not found"})
        self._proxy("/api/tags")

    def do_POST(self):
        if not self._authorized():
            return self._send(401, {"error": "Unauthorized"})
        if self.path != "/api/chat":
            return self._send(404, {"error": "Not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._send(400, {"error": "Invalid content length"})
        if size <= 0 or size > MAX_BODY:
            return self._send(413, {"error": "Request body is empty or too large"})
        try:
            payload = json.loads(self.rfile.read(size))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._send(400, {"error": "Invalid JSON"})
        if not isinstance(payload, dict) or not isinstance(payload.get("messages"), list):
            return self._send(400, {"error": "Expected an Ollama chat payload"})
        payload["stream"] = False
        self._proxy("/api/chat", json.dumps(payload).encode())


if __name__ == "__main__":
    if not TOKEN:
        raise SystemExit("Set SHOPMIND_OLLAMA_TOKEN before starting this gateway")
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
