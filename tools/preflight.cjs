const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
for (const file of ['Macro Engine.cmd', 'tools/start-app.ps1', 'tools/launch.cjs', 'tools/diary-settings.cjs', 'src/diary-ui.js']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing startup file: ${file}`);
  if (fs.readFileSync(path.join(root, file), 'utf8').includes('\uFFFD')) throw new Error(`Invalid UTF-8 content: ${file}`);
}
for (const file of ['index.html', 'src/app.js', 'src/nutrition.js', 'src/storage.js', 'src/insights.js', 'src/coach.js', 'src/training.js', 'src/training-store.js', 'src/training-ui.js', 'src/coach-conversation.js', 'src/client-bridge.js', 'src/styles.css', 'assets/lucide.min.js', 'README.md', 'docs/evidence.md', 'docs/training-evidence.md', 'tools/diary.cjs', 'tools/bridge.cjs', 'tools/coach-runtime.cjs', 'tools/coach.cjs', '.agents/skills/coach-diary/SKILL.md']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Missing product file: ${file}`);
  if (fs.readFileSync(path.join(root, file), 'utf8').includes('\uFFFD')) throw new Error(`Invalid UTF-8 content: ${file}`);
}
console.log('Product files and UTF-8 verified. Run npm run test:all for behavioral verification.');
