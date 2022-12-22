import { Readable, Writable } from "node:stream";
import debug from "debug";
const debugArExtract = debug("coreutils:ar:extract");
const endHead = Buffer.from([0x60, 0x0A]);

export function createPack() {
  const internalStream = new Readable();
  let initial = true;
  let lockStream: Readable;
  internalStream._read = (size) => {
    if (initial) return internalStream.push("!<arch>\n");
    initial = true;
    if (lockStream) return lockStream._read(size);
    return internalStream.push(null);
  };

  let lockToWrite = false;
  return {
    stream: internalStream,
    end: () => {internalStream.push(null)},
    addFile: (name: string, size: number, stream: Readable) => {
      if (lockToWrite) throw new Error("Can't write more files, wait for the end of the stream");
      if (initial) internalStream.push("!<arch>\n");
      initial = true;
      lockToWrite = true;
      const head = Buffer.alloc(60, 0x20, "ascii");
      // name
      head.write(name.slice(0, 16), 0, 16);
      // unix timestamp
      head.write((Date.now()/1000).toFixed(0).slice(0, 12), 16, 12);
      // owner and group
      head.write("0", 28, 6);
      head.write("0", 34, 6);
      head.write("100644", 40, 6);
      head.write(size.toFixed(0), 46, 10);
      // end head
      head.write(endHead.toString("ascii"), 58, 2);
      internalStream.push(head);
      lockStream = stream;
      stream.on("data", data => internalStream.push(data));
      stream.on("end", () => {
        lockStream = undefined;
        lockToWrite = false;
      });
      return;
    },
  };
}

export type fileInfo = {
  name: string,
  time: Date,
  owner: number,
  group: number,
  mode: number,
  size: number,
};

/**
 * extract ar file with stream
 *
 * File schema
 *
 * !<arch>\n
 * 60 bytes header to gnu ar
 *  name (16 bytes) (max 16 chars)
 *  unix timestamp (12 bytes)
 *  owner (6 bytes)
 *  group (6 bytes)
 *  mode (6 bytes)
 *  size (10 bytes)
 *  end header (2 bytes) `\n
 * file content
 */
export function createUnpack(fn?: (info: fileInfo, stream: Readable) => void) {
  let initialHead = true;
  let oldBuffer: Buffer;
  let fileStream: Readable;
  let fileStreamSize: number;
  let filename: string;
  const internalStream = new Writable({
    defaultEncoding: "binary",
    objectMode: false,
    autoDestroy: true,
    decodeStrings: true,
    emitClose: true,
    highWaterMark: 1024,
    final(callback) {
      if (fileStream && oldBuffer) fileStream.push(oldBuffer);
      oldBuffer = undefined;
      debugArExtract("end file stream");
      callback();
    },
    destroy(error, callback) {
      if (fileStream) fileStream.destroy(error);
      callback(error);
    },
    write(remoteChunk, encoding, callback) {
      let chunk = Buffer.isBuffer(remoteChunk) ? remoteChunk : Buffer.from(remoteChunk, encoding);
      // debugArExtract("File size in start function %f", fileStreamSize);
      if (oldBuffer) {
        chunk = Buffer.concat([oldBuffer, chunk]);
        // debugArExtract("concat old buffer with length %f and new buffer with length %f", oldBuffer.length, chunk.length);
      }
      oldBuffer = undefined;
      // file signature
      if (initialHead) {
        // More buffer to maneger correctly
        if (chunk.length < 70) {
          oldBuffer = chunk;
          // debugArExtract("wait more buffer to read file signature");
          return callback();
        }
        const signature = chunk.subarray(0, 8).toString("ascii");
        if (signature !== "!<arch>\n") {
          debugArExtract("invalid file signature, recived '%s'", signature);
          return callback(new Error("Invalid ar file"));
        }
        initialHead = false;
        chunk = chunk.subarray(8);
      }

      // more buffer
      if (chunk.length >= 60) {
        for (let i = 0; i < chunk.length; i++) {
          if (i <= 60) continue;
          const lastByteHead = i;
          const fistCharByte = lastByteHead-60;
          const head = chunk.subarray(fistCharByte, lastByteHead);

          // Header info
          const name = head.subarray(0, 16).toString("ascii").trim();
          const time = new Date(parseInt(head.subarray(16, 28).toString("ascii").trim()) * 1000);
          const owner = parseInt(head.subarray(28, 34).toString("ascii").trim());
          const group = parseInt(head.subarray(34, 40).toString("ascii").trim());
          const mode = parseInt(head.subarray(40, 46).toString("ascii").trim());
          const size = parseInt(head.subarray(46, 58).toString("ascii").trim());

          // One to error
          if ((!name)||(time.toString() === "Invalid Date")||(isNaN(owner))||(isNaN(group))||(isNaN(mode))||(isNaN(size))) continue;
          if (head.subarray(58, 60).toString("ascii") !== endHead.toString("ascii")) continue;
          // Cut header from chunk
          chunk = chunk.subarray(lastByteHead);

          debugArExtract("file header valid, name '%s', time '%s', owner '%f', group '%f', mode '%f', size '%f', start in %f and %f", name, time, owner, group, mode, size, fistCharByte, lastByteHead);
          fileStream = new Readable({read() {}});
          if (fn) fn({name, time, owner, group, mode, size}, fileStream);
          filename = name;
          fileStreamSize = size;

          const fileSize = chunk.subarray(0, size);
          chunk = chunk.subarray(fileSize.length);
          fileStream.push(fileSize);
          fileStreamSize -= fileSize.length;

          if (fileStreamSize === 0) {
            fileStream.push(null);
            debugArExtract("Close stream %s, current buffer includes data bytes %f, new Buffer size %f", name, fileSize.length, chunk.length);
            fileStream = undefined;
            fileStreamSize = undefined;
            filename = undefined;
            if (chunk.length === 0) return callback();
          }
        }
      }

      // if exists chunk and is not empty save to next request
      if (chunk.length > 0) {
        // if exist file stream and chunk is not empty
        if (fileStream) {
          const fixedChunk = chunk.subarray(0, fileStreamSize);
          fileStream.push(fixedChunk);
          fileStreamSize -= fixedChunk.length;
          chunk = chunk.subarray(fixedChunk.length);
          debugArExtract("send chunk to file stream, total %f, rest file to send %f, chunk avaible %f", fixedChunk.length, fileStreamSize, chunk.length, filename);
        }
      }

      // Get more buffer data
      oldBuffer = chunk;
      debugArExtract("End funcion file size %f, current file %s", fileStreamSize, filename);
      return callback();
    }
  });
  return internalStream;
}
