const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const crypto = require('node:crypto');
const workspaceId = crypto.createHash('sha256').update(root.toLowerCase()).digest('hex');
const runtimeHash = crypto.createHash('sha256');
for (const file of ['serve.cjs', 'bridge.cjs', 'coach-runtime.cjs', 'codex-binary.cjs', 'diary.cjs', 'diary-settings.cjs', 'locks.cjs']) {
  runtimeHash.update(file); runtimeHash.update(fs.readFileSync(path.join(__dirname, file)));
}
// Include cached server-side domain modules, not the browser UI served from disk.
for (const file of ['storage.js', 'training-store.js', 'nutrition.js', 'insights.js', 'activity-coaching.js', 'coach.js', 'training-capacity.js', 'training-coaching.js', 'training.js', 'coach-query.js', 'coach-context.js']) {
  runtimeHash.update(`src/${file}`); runtimeHash.update(fs.readFileSync(path.join(root, 'src', file)));
}
const buildId = runtimeHash.digest('hex');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
function createServer(options = {}) {
  const bridge = options.bridge ? require('./bridge.cjs').createBridge(options.bridge === true ? {} : options.bridge) : null;
  const server = http.createServer(async (req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    let relative;
    let url;
    try { url = new URL(req.url, 'http://localhost'); relative = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400); res.end(); return; }
    if (req.method === 'GET' && url.pathname === '/api/app') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ product: 'macro-engine', workspaceId, buildId, bridge: Boolean(bridge) })); return;
    }
    if (bridge && await bridge.handle(req, res, url)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const file = path.resolve(root, '.' + (relative === '/' ? '/index.html' : relative));
    if (!file.startsWith(root + path.sep) || !/^\/(index\.html|src\/[^/]+\.(js|css)|assets\/[^/]+)$/.test(relative === '/' ? '/index.html' : relative)) {
      res.writeHead(404); res.end(); return;
    }
    fs.readFile(file, (error, body) => {
      if (error) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'text/plain', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  });
  server.on('close', () => bridge?.close());
  return server;
}
module.exports = { createServer, workspaceId, buildId };
if (require.main === module) {
  let port = Number(process.env.MACRO_PORT) || 4173;
  const server = createServer({ bridge: true });
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') { port += 1; server.listen(port, '127.0.0.1'); }
    else throw error;
  });
  server.on('listening', () => console.log(`Macro Engine: http://127.0.0.1:${port}`));
  server.listen(port, '127.0.0.1');
}
