// 검증 전용 정적 서버 (배포 zip에는 포함되지 않음)
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, 'tubefolder-extension');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/manager.html';
  const fp = path.join(root, p);
  fs.readFile(fp, (e, data) => {
    if (e) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(fp)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8731, () => console.log('tubefolder preview on http://localhost:8731'));
