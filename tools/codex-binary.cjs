const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');

const targets = {
  'win32-x64': 'x86_64-pc-windows-msvc', 'win32-arm64': 'aarch64-pc-windows-msvc',
  'linux-x64': 'x86_64-unknown-linux-musl', 'linux-arm64': 'aarch64-unknown-linux-musl',
  'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin',
};

function nativeExecutable(file, platform) {
  try {
    const resolved = fs.realpathSync(file);
    if (!fs.statSync(resolved).isFile()) return null;
    const fd = fs.openSync(resolved, 'r');
    const header = Buffer.alloc(4);
    try { if (fs.readSync(fd, header, 0, 4, 0) < 4) return null; }
    finally { fs.closeSync(fd); }
    const valid = platform === 'win32' ? /\.exe$/i.test(resolved) && header[0] === 0x4d && header[1] === 0x5a
      : platform === 'linux' ? header.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
        : platform === 'darwin' && [0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcefaedfe, 0xcffaedfe, 0xbebafeca, 0xcafebabf, 0xbfbafeca].includes(header.readUInt32BE());
    if (!valid) return null;
    if (platform !== 'win32') fs.accessSync(resolved, fs.constants.X_OK);
    return resolved;
  } catch { return null; }
}

function readPackage(root) {
  const file = path.join(root, 'package.json');
  if (fs.statSync(file).size > 65536) throw new Error('Unsupported package metadata.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function packageExecutable(root, platform, arch) {
  try {
    const target = targets[`${platform}-${arch}`];
    if (!target) return null;
    const metadata = readPackage(root);
    if (metadata.name !== '@openai/codex' || metadata.bin?.codex !== 'bin/codex.js') return null;
    const executable = platform === 'win32' ? 'codex.exe' : 'codex';
    const platformPackage = `@openai/codex-${platform}-${arch}`;
    if (typeof metadata.optionalDependencies?.[platformPackage] === 'string') {
      try {
        const optionalRoot = path.dirname(createRequire(path.join(root, 'package.json')).resolve(`${platformPackage}/package.json`));
        const optional = readPackage(optionalRoot);
        if (['@openai/codex', platformPackage].includes(optional.name) && optional.os?.includes(platform) && optional.cpu?.includes(arch)) {
          const binary = nativeExecutable(path.join(optionalRoot, 'vendor', target, 'bin', executable), platform);
          if (binary) return binary;
        }
      } catch { /* Older official packages bundle the native binary. */ }
    }
    for (const directory of ['bin', 'codex']) {
      const binary = nativeExecutable(path.join(root, 'vendor', target, directory, executable), platform);
      if (binary) return binary;
    }
  } catch { /* Unknown wrappers and incomplete installs stay unavailable. */ }
  return null;
}

function findCodex(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const env = options.env || process.env;
  if (env.MACRO_CODEX_BIN) return nativeExecutable(path.resolve(env.MACRO_CODEX_BIN), platform);
  let output;
  try {
    output = (options.lookup || (() => execFileSync(platform === 'win32' ? 'where.exe' : 'which', ['codex'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 })))();
  } catch { return null; }
  for (const candidate of String(output).trim().split(/\r?\n/)) {
    if (!path.isAbsolute(candidate)) continue;
    const native = nativeExecutable(candidate, platform);
    if (native) return native;
    try {
      const resolved = fs.realpathSync(candidate);
      let root = null;
      if (path.basename(resolved) === 'codex.js' && path.basename(path.dirname(resolved)) === 'bin') {
        root = path.dirname(path.dirname(resolved));
      } else if (platform === 'win32' && /^codex(?:\.cmd|\.ps1)?$/i.test(path.basename(candidate))) {
        root = path.join(path.dirname(candidate), 'node_modules', '@openai', 'codex');
      }
      const binary = root && packageExecutable(root, platform, arch);
      if (binary) return binary;
    } catch { /* Continue to the next installed PATH entry. */ }
  }
  return null;
}

module.exports = { findCodex };
