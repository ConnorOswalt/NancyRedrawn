import { ArchiveParser, ArchiveEntry } from './archive-parser.mjs';
import { BinaryReader } from './binary-reader.mjs';

export const CIF_TREE_MAGIC = 'CIF TREE HerInteractive\0';

/**
 * Parsed entry within a Her Interactive CIF Tree container (.DAT, .CAL).
 */
export class CifTreeEntry extends ArchiveEntry {
  /**
   * @param {object} options
   * @param {string} options.name
   * @param {number} options.offset
   * @param {number} options.size
   * @param {number} [options.recordIndex]
   */
  constructor({ name, offset, size, recordIndex = 0 }) {
    super({
      name,
      offset,
      compressedSize: size,
      uncompressedSize: size,
      isCompressed: false,
    });
    this.size = size;
    this.recordIndex = recordIndex;
  }
}

/**
 * Parser for Her Interactive CIF Tree archive files (.DAT, .CAL).
 */
export class CifTreeParser extends ArchiveParser {
  /**
   * @param {Buffer} buffer
   */
  constructor(buffer) {
    super(buffer);
    /** @type {CifTreeEntry[]} */
    this.entries = [];
    this.versionMajor = 0;
    this.versionMinor = 0;
    this.entryCount = 0;
    this.recordsOffset = 0;
  }

  /**
   * Validates and parses the CIF Tree header and entry table.
   * @returns {{ format: string, version: string, entries: CifTreeEntry[] }}
   */
  parse() {
    this.reader.seek(0);
    this.reader.assertAvailable(32);

    const magic = this.reader.readString(24, 'ascii');
    if (magic !== CIF_TREE_MAGIC) {
      throw new Error(`Invalid CIF Tree signature: expected "${CIF_TREE_MAGIC.slice(0, -1)}", got "${magic.slice(0, 23)}".`);
    }

    this.versionMajor = this.reader.readUInt16LE();
    this.versionMinor = this.reader.readUInt16LE();

    // The count field is 4 bytes. In some .CAL variants, bit 24 indicates a 1024-entry lookup table.
    const rawCount = this.reader.readUInt32LE();
    const isCalVariant = Boolean(rawCount & 0x01000000);
    this.entryCount = rawCount & 0x00ffffff;

    // Lookup table size: 1024 entries (2048 bytes) for CAL variants, 1118 entries (2236 bytes) for standard DAT.
    const lookupEntries = isCalVariant ? 1024 : 1118;
    this.recordsOffset = 32 + (lookupEntries * 2);

    this.entries = [];
    for (let i = 0; i < this.entryCount; i++) {
      const entryPos = this.recordsOffset + (i * 94);
      this.reader.seek(entryPos);
      this.reader.assertAvailable(94);

      // Entry name: 32 bytes ASCII null-terminated
      const nameRaw = this.reader.readBytes(32);
      const nullIdx = nameRaw.indexOf(0);
      const name = nameRaw.subarray(0, nullIdx === -1 ? 32 : nullIdx).toString('ascii').trim();

      // Read offset (at byte +35 from record start, i.e. 32 + 3)
      this.reader.seek(entryPos + 35);
      const dataOffset = this.reader.readUInt32LE();

      // Read length (at byte +89 from record start)
      this.reader.seek(entryPos + 89);
      const dataLength = this.reader.readUInt32LE();

      this.entries.push(
        new CifTreeEntry({
          name: name || `entry_${i.toString().padStart(4, '0')}`,
          offset: dataOffset,
          size: dataLength,
          recordIndex: i,
        })
      );
    }

    return {
      format: 'CIF TREE',
      version: `${this.versionMajor}.${this.versionMinor}`,
      entries: this.entries,
    };
  }

  /**
   * Extracts the raw payload for a specific entry name.
   * @param {string} entryName
   * @returns {Buffer}
   */
  extract(entryName) {
    if (this.entries.length === 0) {
      this.parse();
    }
    const target = this.entries.find((e) => e.name.toLowerCase() === entryName.toLowerCase());
    if (!target) {
      throw new Error(`Entry "${entryName}" not found in CIF Tree.`);
    }
    if (target.size === 0) {
      return Buffer.alloc(0);
    }
    if (target.offset + target.size > this.reader.length) {
      throw new RangeError(
        `Entry "${target.name}" payload bounds [${target.offset}, ${target.offset + target.size}] exceed buffer length ${this.reader.length}.`
      );
    }
    return this.reader.buffer.subarray(target.offset, target.offset + target.size);
  }
}
