/* 本地静态预览服务（仅开发/验收用；产品本身是纯静态站点，可直接托管在任何静态服务器）。
 * 端口 8790（不占用「梗一下」的 8765）。无任何模型/密钥逻辑。
 * 用法：node server/serve.cjs   → http://127.0.0.1:8790/player/index.html
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = parseInt(process.env.STORY_PORT || '8790', 10);
const HOST = process.env.STORY_HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
  '.md': 'text/markdown; charset=utf-8'
};

function safeJoin(root, urlPath) {
  const clean = decodeURIComponent(String(urlPath).split('?')[0].split('#')[0]);
  const p = path.normalize(path.join(root, clean));
  if (!p.startsWith(root)) return null;
  return p;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  let target = req.url === '/' ? '/player/index.html' : req.url;
  const file = safeJoin(ROOT, target);
  if (!file) { res.writeHead(403); res.end('forbidden'); return; }

  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 not found（本地预览服务不提供 SPA 回退：缺失资源返回真实错误）');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('「如果当时」本地预览：http://' + HOST + ':' + PORT + '/player/index.html');
  console.log('工程根目录：' + ROOT);
});
