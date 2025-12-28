#!/usr/bin/env python3
"""Simple HTTP server with config save endpoint."""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

class Handler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save-config':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                config = json.loads(post_data.decode('utf-8'))
                with open('config.json', 'w') as f:
                    json.dump(config, f, indent=2)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"success": true}')
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    port = 3000
    print(f'Starting server at http://localhost:{port}')
    HTTPServer(('', port), Handler).serve_forever()
