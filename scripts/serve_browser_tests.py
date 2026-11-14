"""Serve packaged assets with byte-range support for native media seeking."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import re,os

class AssetHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.byte_range=None
        path=self.translate_path(self.path)
        header=self.headers.get('Range')
        if not header or not path.endswith('.mp3') or not os.path.isfile(path):
            return super().send_head()
        match=re.fullmatch(r'bytes=(\d*)-(\d*)',header)
        size=os.path.getsize(path)
        if not match:return super().send_head()
        start=int(match[1]) if match[1] else max(0,size-int(match[2] or 0))
        end=min(size-1,int(match[2])) if match[2] and match[1] else size-1
        if start>end or start>=size:
            self.send_response(416);self.send_header('Content-Range',f'bytes */{size}');self.end_headers();return None
        self.send_response(206)
        for key,value in {'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Range':f'bytes {start}-{end}/{size}','Content-Length':str(end-start+1)}.items():self.send_header(key,value)
        self.end_headers();source=open(path,'rb');source.seek(start);self.byte_range=(start,end);return source
    def copyfile(self,source,outputfile):
        if self.byte_range:
            remaining=self.byte_range[1]-self.byte_range[0]+1
            while remaining:
                data=source.read(min(65536,remaining))
                if not data:break
                outputfile.write(data);remaining-=len(data)
        else:super().copyfile(source,outputfile)

class TestServer(ThreadingHTTPServer):
    request_queue_size=128

if __name__=='__main__':
    with TestServer(('127.0.0.1',int(os.environ.get('NINEFOLD_TEST_PORT','8770'))),partial(AssetHandler,directory='out')) as server:server.serve_forever()
