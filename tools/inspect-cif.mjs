import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CifTreeParser } from '../src/index.mjs';

/**
 * Inspects a CIF Tree container (.DAT, .CAL).
 * Usage:
 *   node tools/inspect-cif.mjs <cif-file-path> [--extract <entry-name> <output-file>]
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node tools/inspect-cif.mjs <cif-file-path> [--extract <entry-name> <output-file>]');
    process.exitCode = 1;
    return;
  }

  const filePath = args[0];
  const buffer = await readFile(filePath);
  const parser = new CifTreeParser(buffer);
  const result = parser.parse();

  if (args[1] === '--extract') {
    const entryName = args[2];
    const outputPath = args[3];
    if (!entryName || !outputPath) {
      console.error('Error: --extract requires <entry-name> and <output-file>');
      process.exitCode = 1;
      return;
    }
    const data = parser.extract(entryName);
    await writeFile(outputPath, data);
    console.log(`Extracted "${entryName}" (${data.length} bytes) -> ${outputPath}`);
    return;
  }

  const summary = {
    file: filePath,
    format: result.format,
    version: result.version,
    totalEntries: result.entries.length,
    entries: result.entries.map((e) => ({
      name: e.name,
      offset: e.offset,
      size: e.size,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`CIF inspection error: ${err.message}`);
    process.exitCode = 1;
  });
}
