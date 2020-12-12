/* jshint esversion: 6 */
/* global pako */

var gzip = gzip || {};

gzip.Archive = class {

    constructor(buffer) {
        const reader = buffer instanceof Uint8Array ? new gzip.Reader(buffer) : buffer;
        this._entries = [];
        const signature = [ 0x1f, 0x8b ];
        if (reader.length < 18 || !reader.peek(2).every((value, index) => value === signature[index])) {
            throw new gzip.Error('Invalid gzip archive.');
        }
        this._entries.push(new gzip.Entry(reader));
        reader.seek(0);
    }

    get entries() {
        return this._entries;
    }
};

gzip.Entry = class {

    constructor(reader) {
        const signature = [ 0x1f, 0x8b ];
        if (reader.position + 2 > reader.length || !reader.read(2).every((value, index) => value === signature[index])) {
            throw new gzip.Error('Invalid gzip signature.');
        }
        const compressionMethod = reader.byte();
        if (compressionMethod != 8) {
            throw new gzip.Error("Invalid compression method '" + compressionMethod.toString() + "'.");
        }
        const flags = reader.byte();
        reader.uint32(); // MTIME
        reader.byte();
        reader.byte(); // OS
        if ((flags & 4) != 0) {
            const xlen = reader.uint16();
            reader.skip(xlen);
        }
        if ((flags & 8) != 0) {
            this._name = reader.string();
        }
        if ((flags & 16) != 0) { // FLG.FCOMMENT
            reader.string();
        }
        if ((flags & 1) != 0) {
            reader.uint16(); // CRC16
        }
        const compressedData = reader.read();
        if (typeof process === 'object' && typeof process.versions == 'object' && typeof process.versions.node !== 'undefined') {
            this._data = require('zlib').inflateRawSync(compressedData);
        }
        else if (typeof pako !== 'undefined') {
            this._data = pako.inflateRaw(compressedData);
        }
        else {
            this._data = new require('./zip').Inflater().inflateRaw(compressedData);
        }
        reader.seek(-8);
        reader.uint32(); // CRC32
        const size = reader.uint32();
        if (size != this._data.length) {
            throw new gzip.Error('Invalid size.');
        }
    }

    get name() {
        return this._name;
    }

    get data() {
        return this._data;
    }

};

gzip.Reader = class {

    constructor(buffer) {
        this._buffer = buffer;
        this._position = 0;
        this._length = buffer.length;
        this._view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    }

    get position() {
        return this._position;
    }

    seek(position) {
        this._position = position >= 0 ? position : this._length + position;
    }

    skip(offset) {
        this._position += offset;
        if (this._position > this._length) {
            throw new gzip.Error('Expected ' + (this._position - this._length) + ' more bytes. The file might be corrupted. Unexpected end of file.');
        }
    }

    read(length) {
        const position = this._position;
        length = length !== undefined ? length : this._length - position;
        this.skip(length);
        return this._buffer.subarray(position, this._position);
    }

    byte() {
        const position = this._position;
        this.skip(1);
        return this._buffer[position];
    }

    uint16() {
        const position = this._position;
        this.skip(2);
        return this._view.getUint16(position, true);
    }

    uint32() {
        const position = this._position;
        this.skip(4);
        return this._view.getUint32(position, true);
    }

    string() {
        let result = '';
        const end = this._buffer.indexOf(0x00, this._position);
        if (end < 0) {
            throw new gzip.Error('End of string not found.');
        }
        while (this._position < end) {
            result += String.fromCharCode(this._buffer[this._position++]);
        }
        this._position++;
        return result;
    }

};

gzip.Error = class extends Error {
    constructor(message) {
        super(message);
        this.name = 'Gzip Error';
    }
};

if (typeof module !== 'undefined' && typeof module.exports === 'object') {
    module.exports.Archive = gzip.Archive;
}