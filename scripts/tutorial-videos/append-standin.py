from http.server import BaseHTTPRequestHandler, HTTPServer
class H(BaseHTTPRequestHandler):
    def do_POST(self):
        self.rfile.read(int(self.headers.get('content-length', 0)))
        self.send_response(200); self.send_header('content-type','application/json'); self.end_headers(); self.wfile.write(b'{}')
    def log_message(self, *a): pass
HTTPServer(('127.0.0.1', 4555), H).serve_forever()
