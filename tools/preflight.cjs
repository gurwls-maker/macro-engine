const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of ['index.html', 'src/app.js', 'src/nutrition.js', 'src/storage.js', 'src/insights.js', 'src/coach.js', 'src/styles.css', 'assets/lucide.min.js', 'README.md', 'docs/evidence.md']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing product file: ${file}`);
  if (fs.readFileSync(path.join(root, file), 'utf8').includes('\uFFFD')) throw new Error(`Invalid UTF-8 content: ${file}`);
}
console.log('Product files and UTF-8 verified. Run npm run test:all for behavioral verification.');
