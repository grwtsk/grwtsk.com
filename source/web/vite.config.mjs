import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./.generated/', import.meta.url));
const outDir = fileURLToPath(new URL('./dist/', import.meta.url));
const articleRoot = join(root, 'articles');
const input = [join(root, 'index.html')];
if (existsSync(articleRoot)) {
  for (const entry of readdirSync(articleRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) input.push(join(articleRoot, entry.name, 'index.html'));
  }
}
export default defineConfig({
  root,
  publicDir: false,
  appType: 'mpa',
  server: { host: '127.0.0.1', fs: { strict: true, allow: [root] } },
  preview: { host: '127.0.0.1' },
  build: { outDir, emptyOutDir: true, rollupOptions: { input } }
});
