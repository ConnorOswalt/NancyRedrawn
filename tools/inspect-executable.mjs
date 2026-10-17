import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const machines = new Map([
  [0x014c, 'x86'],
  [0x8664, 'x86-64'],
  [0x01c4, 'ARM Thumb-2'],
  [0xaa64, 'ARM64'],
]);

async function readExactly(file, offset, length) {
  const buffer = Buffer.alloc(length);
  let total = 0;
  while (total < length) {
    const { bytesRead } = await file.read(buffer, total, length - total, offset + total);
    if (bytesRead === 0) {
      throw new Error(`Truncated executable header at byte ${offset + total}.`);
    }
    total += bytesRead;
  }
  return buffer;
}

export async function inspectExecutable(filePath) {
  const file = await open(filePath, 'r');
  try {
    const stats = await file.stat();
    const { size } = stats;
    if (!stats.isFile()) {
      throw new Error('Input must be a regular file.');
    }

    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
    const result = {
      sizeBytes: size,
      sha256: hash.digest('hex'),
      format: 'unknown',
    };
    if (size < 2) return result;

    const signature = await readExactly(file, 0, 2);
    if (!signature.equals(Buffer.from([0x4d, 0x5a]))) return result;
    const dos = await readExactly(file, 0, 64);
    result.format = 'MZ (non-PE)';
    const peOffset = dos.readUInt32LE(0x3c);
    if (peOffset === 0) return result;
    if (peOffset < 64) throw new Error('PE header offset overlaps the DOS header.');

    const peSignature = await readExactly(file, peOffset, 4);
    if (!peSignature.equals(Buffer.from([0x50, 0x45, 0, 0]))) return result;

    const coff = await readExactly(file, peOffset + 4, 20);
    const optionalSize = coff.readUInt16LE(16);
    if (optionalSize < 2) throw new Error('Missing PE optional-header magic.');
    const optional = await readExactly(file, peOffset + 24, optionalSize);
    const magic = optional.readUInt16LE(0);
    if (magic !== 0x10b && magic !== 0x20b) {
      throw new Error(`Unsupported PE optional-header magic: 0x${magic.toString(16)}.`);
    }

    const machine = coff.readUInt16LE(0);
    return {
      ...result,
      format: magic === 0x10b ? 'PE32' : 'PE32+',
      machine: machines.get(machine) ?? 'unknown',
      machineCode: `0x${machine.toString(16).padStart(4, '0')}`,
      sectionCount: coff.readUInt16LE(2),
    };
  } finally {
    await file.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !args[0].trim()) {
    console.error('Usage: node tools/inspect-executable.mjs <local-executable-path>');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await inspectExecutable(args[0]), null, 2));
    } catch (error) {
      console.error(`Inspection failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
