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
      if (fileStream) {
        if (fileStreamSize > 0) {
          debugArExtract("Send all buffer data size %f", oldBuffer.length);
          const restFile = oldBuffer.subarray(0, fileStreamSize);
          fileStream.push(restFile);
          fileStreamSize -= restFile.length;
          oldBuffer = oldBuffer.subarray(restFile.length);
          if (oldBuffer.length === 0) oldBuffer = undefined;
        }
        fileStream.push(null);
        fileStream = undefined;
      }
      if (oldBuffer?.length > 0) {
        debugArExtract("Old buffer length %f, data:\n%O", oldBuffer.length, [
          oldBuffer.toString("ascii")
        ]);
      }
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
      debugArExtract("File size in start function %f", fileStreamSize);
      if (oldBuffer) {
        chunk = Buffer.concat([oldBuffer, chunk]);
        debugArExtract("concat old buffer with length %f and new buffer with length %f", oldBuffer.length, chunk.length);
      }
      oldBuffer = undefined;
      // file signature
      if (initialHead) {
        // More buffer to maneger correctly
        if (chunk.length < 70) {
          oldBuffer = chunk;
          debugArExtract("wait more buffer to read file signature");
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

      if (fileStream) {
        // if chunk is bigger than file size send rest of chunk to file stream
        if (fileStreamSize > 0) {
          const fixedChunk = chunk.subarray(0, fileStreamSize);
          fileStream.push(fixedChunk);
          fileStreamSize -= fixedChunk.length;
          chunk = chunk.subarray(fixedChunk.length);
          if (chunk.length === 0) return callback();
        }
      }

      // more buffer
      if (chunk.length > 70) {
        for (let i = 0; i < chunk.length-2; i++) {
          const lastByteHead = i+2;
          const fistCharByte = lastByteHead-60;
          // check if new file
          if (chunk.subarray(i, lastByteHead).toString("ascii") !== endHead.toString("ascii")) continue;
          // debugArExtract("Detect new file head, testing header, start in %f end in the %f", fistCharByte, lastByteHead);
          const head = chunk.subarray(fistCharByte, lastByteHead);
          const name = head.subarray(0, 16).toString().trim();
          const time = new Date(parseInt(head.subarray(16, 28).toString().trim(), 10) * 1000);
          const owner = parseInt(head.subarray(28, 34).toString().trim(), 10);
          const group = parseInt(head.subarray(34, 40).toString().trim(), 10);
          const mode = parseInt(head.subarray(40, 48).toString().trim(), 8);
          const size = parseInt(head.subarray(48, 58).toString().trim(), 10);
          if ((!name)||(time.toString() === "Invalid Date")||(isNaN(owner))||(isNaN(group))||(isNaN(mode))||(isNaN(size))) {
            if (fileStream) {
              const oldBuffer = chunk.subarray(0, fileStreamSize);
              if (oldBuffer.length > 0) {
                fileStream.push(oldBuffer);
                fileStream.push(null);
                fileStream = undefined;
                fileStreamSize -= oldBuffer.length;
                chunk = chunk.subarray(oldBuffer.length);
                debugArExtract("Close old stream with data buffer size %f", oldBuffer.length, fileStreamSize);
                if (fileStreamSize > 0) {
                  debugArExtract("Send all buffer data size %f", oldBuffer.length);
                  const restFile = oldBuffer.subarray(0, fileStreamSize);
                  fileStream.push(restFile);
                  fileStreamSize -= restFile.length;
                  chunk = chunk.subarray(restFile.length);
                }
                debugArExtract("New chunk size %f", oldBuffer.length);
              }
            }
            continue;
          }
          debugArExtract("file header valid, name '%s', time '%s', owner '%f', group '%f', mode '%f', size '%f'", name, time, owner, group, mode, size);
          // send rest of chunk to file stream
          if (fileStream) {
            if (fileStreamSize <= 0) fileStreamSize = chunk.subarray(0, fistCharByte-1).length;
            if (fileStreamSize > 0) {
              const oldBuffer = chunk.subarray(0, fileStreamSize);
              fileStream.push(oldBuffer);
              fileStream.push(null);
              debugArExtract("Close stream %s with data buffer size %f", filename, oldBuffer.length);
              fileStream = undefined;
              fileStreamSize = undefined;
              chunk = chunk.subarray(oldBuffer.length);
              debugArExtract("New chunk size %f", oldBuffer.length);
            }
          }
          chunk = chunk.subarray(lastByteHead);
          fileStream = new Readable({read() {}});
          if (fn) fn({name, time, owner, group, mode, size}, fileStream);
          filename = name;
          // Remove file header from chunk
          const fileSize = chunk.subarray(0, size);
          // Remove file size from chunk
          chunk = chunk.subarray(fileSize.length);
          fileStreamSize = size - fileSize.length;
          fileStream.push(fileSize);

          // if all file is in chunk send null to file stream and remove file stream
          if (0 <= (fileSize.length - size)) {
            fileStream.push(null);
            debugArExtract("Close stream %s with data buffer size %f", filename, fileSize.length);
            fileStream = undefined;
            fileStreamSize = undefined;
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
          debugArExtract("send chunk to file stream, total %f, rest file to send %f, chunk avaible %f", fixedChunk.length, fileStreamSize, chunk.length);
        } else {
          oldBuffer = chunk;
          debugArExtract("end file and function, send next file with length %f to next request", chunk?.length);
        }
      }

      // Get more buffer data
      debugArExtract("End funcion file size %f", fileStreamSize);
      return callback();
    }
  });
  return internalStream;
}
