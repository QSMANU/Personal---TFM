import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
let failed = false;
for (const directory of ['src', 'ui', 'tools']) {
  for (const file of readdirSync(directory).filter(f => /\.(js|mjs)$/.test(f))) {
    const result = spawnSync(process.execPath, ['--check', join(directory, file)], { encoding: 'utf8' });
    if (result.status) { failed = true; process.stderr.write(result.stderr); }
  }
}
process.exitCode = failed ? 1 : 0;
if (!failed) console.log('Sintaxis: src, ui y tools OK.');
