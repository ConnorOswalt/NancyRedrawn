import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const dir of ['src', 'tools', 'tests']) {
  for (const file of await readdir(dir, { recursive: true })) {
    if (!file.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
const shell = spawnSync('bash', ['-n', 'tools/ghidra/analyze-game.sh'], { stdio: 'inherit' });
if (shell.error) throw shell.error;
if (shell.status !== 0) process.exit(shell.status ?? 1);
