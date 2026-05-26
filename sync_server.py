#!/usr/bin/env python3
"""Quiz App LAN Sync Server

Usage: python sync_server.py [port]

Listens on 0.0.0.0:<port> (default 8081). Endpoints:
  GET  /ping            - Health check, returns local IP
  POST /push            - Receive encrypted data from remote device
  GET  /pull            - Return pending outgoing data
  GET  /check-incoming  - Check if new incoming data is available
  POST /upload-outgoing - Browser uploads data to be pulled by remote
"""

import json
import os
import sys
import socket
import tempfile
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
TEMP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
OUTGOING_FILE = os.path.join(TEMP_DIR, 'sync_outgoing.enc')
INCOMING_FILE = os.path.join(TEMP_DIR, 'sync_incoming.enc')
INCOMING_FLAG = os.path.join(TEMP_DIR, 'sync_incoming.flag')


def get_local_ip():
    """Get the local network IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    }


class SyncHandler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(204)
        for k, v in cors_headers().items():
            self.send_header(k, v)
        self.end_headers()

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        for k, v in cors_headers().items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _send_text(self, text, status=200):
        body = text.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Content-Length', len(body))
        for k, v in cors_headers().items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split('?')[0]

        if path == '/ping':
            self._send_json({
                'status': 'ok',
                'ip': get_local_ip(),
                'port': PORT,
            })

        elif path == '/pull':
            if os.path.exists(OUTGOING_FILE):
                with open(OUTGOING_FILE, 'r', encoding='utf-8') as f:
                    content = f.read()
                os.remove(OUTGOING_FILE)
                self._send_text(content)
            else:
                self._send_json({'error': 'no data available'}, 404)

        elif path == '/check-incoming':
            has_data = os.path.exists(INCOMING_FLAG)
            self._send_json({'hasData': has_data})

        else:
            self._send_json({'error': 'not found'}, 404)

    def do_POST(self):
        path = self.path.split('?')[0]
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ''

        if path == '/push':
            # Receive encrypted data from remote device
            if not body:
                self._send_json({'error': 'empty body'}, 400)
                return
            # Verify it looks like base64
            if len(body) < 20:
                self._send_json({'error': 'data too short'}, 400)
                return
            os.makedirs(TEMP_DIR, exist_ok=True)
            with open(INCOMING_FILE, 'w', encoding='utf-8') as f:
                f.write(body)
            # Create flag file so browser polling can detect it
            with open(INCOMING_FLAG, 'w') as f:
                f.write('1')
            print(f'[sync_server] Received {len(body)} bytes from remote device')
            self._send_json({'success': True, 'size': len(body)})

        elif path == '/upload-outgoing':
            # Browser uploads data to be pulled by remote
            if not body:
                self._send_json({'error': 'empty body'}, 400)
                return
            os.makedirs(TEMP_DIR, exist_ok=True)
            with open(OUTGOING_FILE, 'w', encoding='utf-8') as f:
                f.write(body)
            print(f'[sync_server] Stored {len(body)} bytes for outgoing pull')
            self._send_json({'success': True, 'size': len(body)})

        elif path == '/clear-incoming':
            # Clear incoming data and flag
            for f in [INCOMING_FILE, INCOMING_FLAG]:
                if os.path.exists(f):
                    os.remove(f)
            self._send_json({'success': True})

        else:
            self._send_json({'error': 'not found'}, 404)

    def log_message(self, format, *args):
        print(f'[sync_server] {args[0]}')


def main():
    os.makedirs(TEMP_DIR, exist_ok=True)
    # Clean up stale files
    for f in [INCOMING_FLAG]:
        if os.path.exists(f):
            os.remove(f)

    ip = get_local_ip()
    server = HTTPServer(('0.0.0.0', PORT), SyncHandler)
    print(f'[sync_server] Listening on http://{ip}:{PORT}')
    print(f'[sync_server] Endpoints: /ping /push /pull /check-incoming /upload-outgoing')
    print(f'[sync_server] Press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[sync_server] Stopped')
        server.shutdown()


if __name__ == '__main__':
    main()
