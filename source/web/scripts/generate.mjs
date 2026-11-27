import { spawnSync } from 'node:child_process';
import { mkdtempSync, renameSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const web = fileURLToPath(new URL('../', import.meta.url));
const source = fileURLToPath(new URL('../../', import.meta.url));
const parserBuild = join(source, 'parser', 'build');
const cargoManifest = join(source, 'generator', 'Cargo.toml');
const suffix = process.platform === 'win32' ? '.exe' : '';
const run = (program, args) => {
  const result = spawnSync(program, args, { stdio: 'inherit', cwd: web });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(program + ' failed: ' + (result.status ?? result.signal));
};
run('cmake', ['-S', join(source, 'parser'), '-B', parserBuild, '-DCMAKE_BUILD_TYPE=Release']);
run('cmake', ['--build', parserBuild, '--config', 'Release', '--parallel']);
run('cargo', ['build', '--locked', '--release', '--manifest-path', cargoManifest, '--target-dir', join(source, 'generator', 'target')]);
const parser = join(parserBuild, 'markdown-parser' + suffix);
const generator = join(source, 'generator', 'target', 'release', 'site-generator' + suffix);
const stage = mkdtempSync(join(web, '.generation-'));
const candidate = join(stage, 'site');
const old = join(stage, 'previous');
const live = join(web, '.generated');
try {
  run(generator, [parser, join(source, 'data', 'articles'), candidate]);
  if (existsSync(live)) renameSync(live, old);
  try { renameSync(candidate, live); }
  catch (error) {
    if (existsSync(old)) renameSync(old, live);
    throw error;
  }
} finally {
  // Only delete the temporary directory owned by this invocation.
  if (!existsSync(old) || existsSync(live)) rmSync(stage, { recursive: true, force: true });
}
