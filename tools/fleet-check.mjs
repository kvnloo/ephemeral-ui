import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!name.startsWith(root) || !fs.existsSync(name) || !fs.statSync(name).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
  fs.createReadStream(name).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const args = ['--test', ...process.argv.slice(2)];
  if (args.length === 1) args.push('tools/fleet.test.mjs', 'tools/infra.test.mjs', 'tools/dock.test.mjs');
  const child = spawn(process.execPath, args, { stdio: 'inherit', env: { ...process.env, EUI_BROWSER_URL: process.env.EUI_BROWSER_URL || `http://127.0.0.1:${server.address().port}` } });
  process.exitCode = await new Promise(resolve => child.on('exit', resolve));
} finally { server.close(); }
