import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BinaryReader, ArchiveParser, ArchiveEntry } from '../src/index.mjs';

test('BinaryReader: reads primitives and bounds-checks correctly', () => {
  const buf = Buffer.alloc(32);
  buf.writeUInt8(0x42, 0);
  buf.writeUInt16LE(0x1234, 1);
  buf.writeUInt32LE(0xdeadbeef, 3);
  buf.writeInt32LE(-42, 7);
  buf.write('TEST', 11, 'ascii');
  buf.write('HELLO\0WORLD', 15, 'utf8');

  const reader = new BinaryReader(buf);
  assert.equal(reader.length, 32);
  assert.equal(reader.remaining, 32);

  assert.equal(reader.readUInt8(), 0x42);
  assert.equal(reader.readUInt16LE(), 0x1234);
  assert.equal(reader.readUInt32LE(), 0xdeadbeef);
  assert.equal(reader.readInt32LE(), -42);
  assert.equal(reader.readString(4, 'ascii'), 'TEST');
  assert.equal(reader.readNullTerminatedString(), 'HELLO');

  reader.seek(0);
  assert.equal(reader.offset, 0);
  reader.skip(5);
  assert.equal(reader.offset, 5);

  assert.throws(() => reader.seek(999), RangeError);
  assert.throws(() => reader.readBytes(50), RangeError);
  assert.throws(() => new BinaryReader('invalid'), TypeError);
});

test('ArchiveParser and ArchiveEntry: class scaffolding works as expected', () => {
  const entry = new ArchiveEntry({
    name: 'test.dat',
    offset: 100,
    compressedSize: 50,
    uncompressedSize: 80,
    isCompressed: true,
  });
  assert.equal(entry.name, 'test.dat');
  assert.equal(entry.offset, 100);
  assert.equal(entry.isCompressed, true);

  const parser = new ArchiveParser(Buffer.alloc(16));
  assert.throws(() => parser.parse(), /must be implemented/);
});
