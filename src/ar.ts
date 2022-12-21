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
  console.clear();
  let initialHead = true;
  let oldBuffer: Buffer;
  let fileStream: Readable;
  let fileStreamSize: number;
  const internalStream = new Writable({
    write(remoteChunk, encoding, callback) {
      let chunk = Buffer.isBuffer(remoteChunk) ? remoteChunk : Buffer.from(remoteChunk, encoding);
      if (oldBuffer) {
        chunk = Buffer.concat([oldBuffer, chunk]);
        debugArExtract("concat old buffer with length %f and new buffer with length %f", oldBuffer.length, chunk.length);
        oldBuffer = undefined;
      }
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
      const fileSizeDiff = fileStreamSize-chunk.length;
      debugArExtract("chunk length %f, required %f, diff %f", chunk.length, fileStreamSize, fileSizeDiff);
      if (!isNaN(fileSizeDiff)) {
        if (fileStream) {
          // if chunk is bigger than file size send rest of chunk to file stream
          if (fileSizeDiff > 0) {
            debugArExtract("send to file stream %f bytes", fileStreamSize);
            fileStreamSize -= chunk.length;
            fileStream.push(chunk.subarray(0, fileStreamSize));
            chunk = chunk.subarray(fileStreamSize);
          }
        }
      }

      // more buffer
      if (chunk.length > 70) {
        for (let i = 0; i < chunk.length; i++) {
          const lastByteHead = i+2;
          const fistCharByte = lastByteHead-60;
          // check if new file
          if (chunk.subarray(i, lastByteHead).toString("ascii") !== endHead.toString("ascii")) continue;
          debugArExtract("new file found, testing header, start in %f end in the %f", fistCharByte, lastByteHead);
          const head = chunk.subarray(fistCharByte, lastByteHead);
          const name = head.subarray(0, 16).toString().trim();
          const time = new Date(parseInt(head.subarray(16, 28).toString().trim(), 10) * 1000);
          const owner = parseInt(head.subarray(28, 34).toString().trim(), 10);
          const group = parseInt(head.subarray(34, 40).toString().trim(), 10);
          const mode = parseInt(head.subarray(40, 48).toString().trim(), 8);
          const size = parseInt(head.subarray(48, 58).toString().trim(), 10);
          if ((!name)||(time.toString() === "Invalid Date")||(isNaN(owner))||(isNaN(group))||(isNaN(mode))||(isNaN(size))) {
            if (fileStream) {
              debugArExtract("invalid file header, send to file stream");
              if (0 >= (fileStreamSize - chunk.length)) {
                fileStreamSize -= chunk.length;
                fileStream.push(chunk);
              } else {
                fileStream.push(chunk.subarray(0, fileStreamSize));
                fileStream.push(null);
                fileStream = undefined;
                fileStreamSize = 0;
                oldBuffer = chunk.subarray(fileStreamSize);
                // console.log("end file, send next file with length %f", chunk.length);
              }
              return callback();
            }
            debugArExtract("invalid file header, recived '%o'", [head.toString("ascii")]);
            return callback(new Error("cannot send file to stream"));
          }
          debugArExtract("file header valid, name '%s', time '%s', owner '%f', group '%f', mode '%f', size '%f'", name, time, owner, group, mode, size);
          if (fileStream) {
            debugArExtract("send rest of file to file stream to old stream");
            const oldChunk = chunk.subarray(0, fistCharByte);
            fileStream.push(oldChunk);
            fileStream.push(null);
            fileStream = undefined;
            fileStreamSize = 0;
            chunk = chunk.subarray(fistCharByte);
          }

          fileStream = new Readable({read() {}});
          if (fn) fn({name, time, owner, group, mode, size}, fileStream);
          chunk = chunk.subarray(lastByteHead);
          const fileSize = chunk.subarray(0, size);
          fileStreamSize = size - fileSize.length;
          fileStream.push(fileSize);

          if (0 <= (fileSize.length - size)) {
            fileStream.push(null);
            fileStream = undefined;
            debugArExtract("end file stream, closing stream, send next file with length %f", chunk.length);
            chunk = chunk.subarray(size);
          }

          if (chunk.length === 0) {
            debugArExtract("end file, no stream required");
            return callback();
          }
        }
      }

      // if exist file stream and chunk is not empty
      if (fileStream) {
        debugArExtract("send rest of file to file stream, no new file detect");
        if (0 <= (fileStreamSize - chunk.length)) {
          fileStreamSize -= chunk.length;
          fileStream.push(chunk);
        } else {
          fileStream.push(chunk.subarray(0, fileStreamSize));
          fileStream.push(null);
          fileStream = undefined;
          fileStreamSize = 0;
          oldBuffer = chunk.subarray(fileStreamSize);
          debugArExtract("end file, send next file with length %f", chunk.length);
        }
      }

      if (chunk === undefined||chunk?.length <= 0) return callback();
      oldBuffer = chunk;
      debugArExtract("end file and function, send next file with length %f to next request", chunk?.length);
      return callback();
    }
  });
  return internalStream;
}