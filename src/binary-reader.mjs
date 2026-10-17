/**
 * Safe, bounds-checked binary reader for reverse-engineering file formats.
 */
export class BinaryReader {
  /**
   * @param {Buffer} buffer
   */
  constructor(buffer) {
    if (!Buffer.isBuffer(buffer)) {
      throw new TypeError('Expected a Buffer instance.');
    }
    this.buffer = buffer;
    this.offset = 0;
  }

  get length() {
    return this.buffer.length;
  }

  get remaining() {
    return this.buffer.length - this.offset;
  }

  seek(position) {
    if (position < 0 || position > this.buffer.length) {
      throw new RangeError(`Seek position ${position} out of bounds [0, ${this.buffer.length}].`);
    }
    this.offset = position;
  }

  skip(bytes) {
    this.seek(this.offset + bytes);
  }

  assertAvailable(count) {
    if (this.offset + count > this.buffer.length) {
      throw new RangeError(
        `Unexpected end of data: requested ${count} bytes at offset ${this.offset}, length ${this.buffer.length}.`
      );
    }
  }

  readUInt8() {
    this.assertAvailable(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  readUInt16LE() {
    this.assertAvailable(2);
    const value = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  readUInt32LE() {
    this.assertAvailable(4);
    const value = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readInt32LE() {
    this.assertAvailable(4);
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readString(length, encoding = 'utf8') {
    this.assertAvailable(length);
    const value = this.buffer.toString(encoding, this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readNullTerminatedString(maxLength = this.remaining, encoding = 'utf8') {
    const end = Math.min(this.offset + maxLength, this.buffer.length);
    let nullPos = -1;
    for (let i = this.offset; i < end; i++) {
      if (this.buffer[i] === 0) {
        nullPos = i;
        break;
      }
    }
    if (nullPos === -1) {
      throw new Error(`Null terminator not found within ${maxLength} bytes at offset ${this.offset}.`);
    }
    const str = this.buffer.toString(encoding, this.offset, nullPos);
    this.offset = nullPos + 1;
    return str;
  }

  readBytes(length) {
    this.assertAvailable(length);
    const slice = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return slice;
  }
}
