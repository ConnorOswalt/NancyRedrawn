import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectExecutable } from '../tools/inspect-executable.mjs';

const cli = fileURLToPath(new URL('../tools/inspect-executable.mjs', import.meta.url));

function syntheticPE(machine = 0x014c, magic = 0x10b) {
  const bytes = Buffer.alloc(90);
  bytes.write('MZ');
  bytes.writeUInt32LE(64, 0x3c);
  bytes.write('PE\0\0', 64);
  bytes.writeUInt16LE(machine, 68);
  bytes.writeUInt16LE(3, 70);
  bytes.writeUInt16LE(2, 84);
  bytes.writeUInt16LE(magic, 88);
  return bytes;
}

test('inspect synthetic executable fixtures without modifying them', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'nancy-redrawn-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'synthetic input.exe');

  for (const [machine, magic, architecture, format] of [
    [0x014c, 0x10b, 'x86', 'PE32'],
    [0x8664, 0x20b, 'x86-64', 'PE32+'],
    [0x1234, 0x10b, 'unknown', 'PE32'],
  ]) {
    await t.test(`${format} machine 0x${machine.toString(16)}`, async () => {
      const bytes = syntheticPE(machine, magic);
      await writeFile(input, bytes);
      assert.deepEqual(await inspectExecutable(input), {
        sizeBytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        format,
        machine: architecture,
        machineCode: `0x${machine.toString(16).padStart(4, '0')}`,
        sectionCount: 3,
      });
      assert.deepEqual(await readFile(input), bytes);
    });
  }

  for (const bytes of [Buffer.alloc(0), Buffer.from('not an executable')]) {
    await writeFile(input, bytes);
    assert.equal((await inspectExecutable(input)).format, 'unknown');
  }

  const dos = Buffer.alloc(64);
  dos.write('MZ');
  await writeFile(input, dos);
  assert.equal((await inspectExecutable(input)).format, 'MZ (non-PE)');

  for (const bytes of [
    Buffer.from('MZ'),
    syntheticPE().subarray(0, 89),
    syntheticPE().subarray(0, 70),
  ]) {
    await writeFile(input, bytes);
    await assert.rejects(inspectExecutable(input), /Truncated executable header/);
  }

  const invalidOffset = syntheticPE();
  invalidOffset.writeUInt32LE(1, 0x3c);
  await writeFile(input, invalidOffset);
  await assert.rejects(inspectExecutable(input), /overlaps/);

  const missingMagic = syntheticPE();
  missingMagic.writeUInt16LE(0, 84);
  await writeFile(input, missingMagic);
  await assert.rejects(inspectExecutable(input), /Missing PE optional-header magic/);

  await writeFile(input, syntheticPE(0x014c, 0xffff));
  await assert.rejects(inspectExecutable(input), /Unsupported PE optional-header magic/);
  await assert.rejects(inspectExecutable(directory), /regular file/);
  await assert.rejects(inspectExecutable(join(directory, 'missing.exe')), /ENOENT/);

  await writeFile(input, syntheticPE());
  const success = spawnSync(process.execPath, [cli, input], { encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).format, 'PE32');
  assert.equal(success.stderr, '');

  for (const args of [[], [input, input], [join(directory, 'missing.exe')]]) {
    const failure = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(failure.status, 1);
    assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /Usage:|Inspection failed:/);
  }
});
