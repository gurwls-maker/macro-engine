'use strict';
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createServer, workspaceId, buildId } = require('./serve.cjs');

function probe(port, timeout = 180) {
  return new Promise(resolve => {
    let settled = false, timer;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const request = http.get({ hostname: '127.0.0.1', port, path: '/api/app', timeout }, response => {
      let value = '';
      response.on('data', chunk => { value += chunk; if (value.length > 4096) { finish(false); request.destroy(); } });
      response.once('error', () => finish(false));
      response.once('aborted', () => finish(false));
      response.once('close', () => finish(false));
      response.on('end', () => {
        try { const result = JSON.parse(value); finish(response.statusCode === 200 && result.product === 'macro-engine' && result.workspaceId === workspaceId && result.buildId === buildId && result.bridge === true); }
        catch { finish(false); }
      });
    });
    const expire = () => { finish(false); request.destroy(); };
    timer = setTimeout(expire, timeout);
    request.on('timeout', expire);
    request.on('error', () => finish(false));
  });
}
function openBrowser(url) {
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
async function launch(options = {}) {
  const firstPort = options.port ?? (Number(process.env.MACRO_PORT) || 4173);
  if (!Number.isInteger(firstPort) || firstPort < 1024 || firstPort > 65515) throw new Error('Choose a local port between 1024 and 65515.');
  const open = options.open || openBrowser, check = options.probe || probe;
  for (let port = firstPort; port <= firstPort + 20; port++) {
    if (await check(port)) { const url = `http://127.0.0.1:${port}`; await open(url); return { url, reused: true, server: null }; }
  }
  const server = (options.createServer || createServer)({ bridge: true });
  let port = firstPort;
  try {
    await new Promise((resolve, reject) => {
      function failure(error) {
        if (error.code === 'EADDRINUSE' && port < firstPort + 20) { port += 1; server.listen(port, '127.0.0.1'); }
        else { server.removeListener('error', failure); reject(error); }
      }
      server.on('error', failure);
      server.once('listening', () => { server.removeListener('error', failure); resolve(); });
      server.listen(port, '127.0.0.1');
    });
    const url = `http://127.0.0.1:${port}`;
    await open(url);
    return { url, reused: false, server };
  } catch (error) {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    throw error;
  }
}
module.exports = { launch, probe };
if (require.main === module) launch().then(result => console.log(`Macro Engine: ${result.url}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
