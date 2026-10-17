import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { CifTreeParser, CidParser, CIF_TREE_MAGIC } from '../src/index.mjs';

function createSyntheticCifTree({ isCal = false, entries = [] } = {}) {
  const lookupCount = isCal ? 1024 : 1118;
  const recordsOffset = 32 + lookupCount * 2;
  const recordsSize = entries.length * 94;
  const dataStart = recordsOffset + recordsSize;

  let totalDataSize = 0;
  for (const entry of entries) {
    totalDataSize += entry.data.length;
  }

  const totalSize = dataStart + totalDataSize;
  const buffer = Buffer.alloc(totalSize);

  // Magic (24 bytes)
  buffer.write(CIF_TREE_MAGIC, 0, 'ascii');
  // Versions
  buffer.writeUInt16LE(2, 24);
  buffer.writeUInt16LE(2, 26);
  // Count with optional CAL bit
  const countField = (isCal ? 0x01000000 : 0) | (entries.length & 0x00ffffff);
  buffer.writeUInt32LE(countField, 28);

  let currentDataOffset = dataStart;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const recOffset = recordsOffset + i * 94;

    // Name (32 bytes)
    buffer.write(entry.name, recOffset, 'ascii');
    // Offset (at +35)
    buffer.writeUInt32LE(currentDataOffset, recOffset + 35);
    // Length (at +89)
    buffer.writeUInt32LE(entry.data.length, recOffset + 89);

    // Copy data payload
    entry.data.copy(buffer, currentDataOffset);
    currentDataOffset += entry.data.length;
  }

  return buffer;
}

test('CifTreeParser: parses synthetic standard CIF Tree container', () => {
  const payload1 = Buffer.from('ASSET_ONE_DATA_BYTES');
  const payload2 = Buffer.from('ASSET_TWO_PAYLOAD');
  const cifBuffer = createSyntheticCifTree({
    isCal: false,
    entries: [
      { name: 'FIRST_ITEM', data: payload1 },
      { name: 'SECOND_ITEM', data: payload2 },
    ],
  });

  const parser = new CifTreeParser(cifBuffer);
  const result = parser.parse();

  assert.equal(result.format, 'CIF TREE');
  assert.equal(result.version, '2.2');
  assert.equal(result.entries.length, 2);

  assert.equal(result.entries[0].name, 'FIRST_ITEM');
  assert.equal(result.entries[0].size, payload1.length);
  assert.equal(result.entries[1].name, 'SECOND_ITEM');
  assert.equal(result.entries[1].size, payload2.length);

  assert.deepEqual(parser.extract('FIRST_ITEM'), payload1);
  assert.deepEqual(parser.extract('second_item'), payload2); // case-insensitive
  assert.throws(() => parser.extract('NON_EXISTENT'), /not found/);
});

test('CifTreeParser: parses synthetic CAL variant container', () => {
  const animPayload = Buffer.from('CAL_ANIMATION_FRAME_DATA');
  const cifBuffer = createSyntheticCifTree({
    isCal: true,
    entries: [{ name: 'HEAD_FRAME_01', data: animPayload }],
  });

  const parser = new CifTreeParser(cifBuffer);
  const result = parser.parse();

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].name, 'HEAD_FRAME_01');
  assert.deepEqual(parser.extract('HEAD_FRAME_01'), animPayload);
});

test('CifTreeParser: rejects invalid signatures or truncated data', () => {
  const bad = Buffer.alloc(100);
  bad.write('INVALID HEADER SIGNATURE', 0, 'ascii');
  const parser = new CifTreeParser(bad);
  assert.throws(() => parser.parse(), /Invalid CIF Tree signature/);
});

test('CidParser: parses metadata lines correctly', () => {
  const cidText = '13\r\nNancy Drew: Last Train to Blue Moon Canyon\r\nAdventure Series\r\nHer Interactive\r\n';
  const parser = new CidParser(cidText);
  const parsed = parser.parse();

  assert.equal(parsed.gameId, '13');
  assert.equal(parsed.title, 'Nancy Drew: Last Train to Blue Moon Canyon');
  assert.equal(parsed.series, 'Adventure Series');
  assert.equal(parsed.company, 'Her Interactive');
});

test('CifTreeParser: validates real Promotree.DAT if available', async () => {
  const realFile = 'local-data/working/game/Ciftree/Promotree.DAT';
  if (!existsSync(realFile)) return;

  const buf = await readFile(realFile);
  const parser = new CifTreeParser(buf);
  const result = parser.parse();

  assert.equal(result.format, 'CIF TREE');
  assert.equal(result.entries.length, 17);
  assert.equal(result.entries[0].name, 'GAMEFLOW');
  assert.equal(parser.extract('GAMEFLOW').length, 0); // node header
  const asset = parser.extract('S8000');
  assert.equal(asset.length, 273);
});
