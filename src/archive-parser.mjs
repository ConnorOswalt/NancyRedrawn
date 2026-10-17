import { BinaryReader } from './binary-reader.mjs';

/**
 * Base representation of a parsed file entry in an archive container.
 */
export class ArchiveEntry {
  constructor({ name, offset, compressedSize, uncompressedSize, isCompressed = false }) {
    this.name = name;
    this.offset = offset;
    this.compressedSize = compressedSize;
    this.uncompressedSize = uncompressedSize;
    this.isCompressed = isCompressed;
  }
}

/**
 * Starter scaffold for parsing game container and archive formats.
 */
export class ArchiveParser {
  /**
   * @param {Buffer} buffer
   */
  constructor(buffer) {
    this.reader = new BinaryReader(buffer);
    this.entries = [];
  }

  /**
   * Parses the archive header and table of contents.
   * To be extended/implemented per detected format specification.
   * @returns {{ format: string, entries: ArchiveEntry[] }}
   */
  parse() {
    throw new Error('parse() must be implemented by format-specific subclasses.');
  }
}
