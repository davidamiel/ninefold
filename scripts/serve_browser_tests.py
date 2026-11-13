"""Serve the packaged app with room for the browser's parallel asset requests."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class TestServer(ThreadingHTTPServer):
    request_queue_size = 128


if __name__ == "__main__":
    handler = partial(SimpleHTTPRequestHandler, directory="out")
    with TestServer(("127.0.0.1", 8768), handler) as server:
        server.serve_forever()
