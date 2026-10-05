const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.copyFileSync(require.resolve('lucide/dist/umd/lucide.min.js'), path.join(root, 'assets/lucide.min.js'));
fs.copyFileSync(path.join(root, 'node_modules/lucide/LICENSE'), path.join(root, 'assets/LUCIDE-LICENSE'));
