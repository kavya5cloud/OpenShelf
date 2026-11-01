// Local dev server: static files from the project root, /api/* to the same
// handler Vercel runs. Usage: npm run dev  (needs DATABASE_URL in .env)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import handler from '../api/index.js';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT) || 3000;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api' || pathname.startsWith('/api/')) return handler(req, res);
  const file = path.join(root, decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep) || /[\\/](api|scripts|test|node_modules)[\\/]|[\\/]\./.test(file.slice(root.length))) {
    res.statusCode = 404; return res.end('Not found');
  }
  try {
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch (e) {
    res.statusCode = 404; res.end('Not found');
  }
}).listen(port, () => console.log(`OpenShelf running at http://localhost:${port}`));
