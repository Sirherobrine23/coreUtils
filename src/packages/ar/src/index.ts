import stream from "node:stream";
import path from "node:path";

export type arHeader = {
  name: string,
  time: Date,
  owner: number,
  group: number,
  mode: number,
  size: number,
};

export declare interface arParse extends stream.Writable {
  on(event: "close", listener: () => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: stream.Readable) => void): this;
  on(event: "unpipe", listener: (src: stream.Readable) => void): this;
  on(event: "entry", listener: (header: arHeader, stream: stream.Readable) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: "close", listener: () => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: stream.Readable) => void): this;
  once(event: "unpipe", listener: (src: stream.Readable) => void): this;
  once(event: "entry", listener: (header: arHeader, stream: stream.Readable) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function createHead(filename: string, info: {mode?: "100644", mtime?: Date|string, size: number}) {
  if (!info.mtime) info.mtime = new Date();
  const controlHead = Buffer.alloc(60, 0x20);
  controlHead.write(path.basename(filename), 0, 16);
  controlHead.write((typeof info.mtime === "string" ? info.mtime : (info.mtime.getTime()/1000).toFixed()), 16, 12);
  controlHead.write("0", 28, 6);
  controlHead.write("0", 34, 6);
  controlHead.write(String(info?.mode ?? "100644"), 40, 6);
  controlHead.write(String(info.size), 48, 10);
  controlHead.write("`\n`", 58, 2);
  return controlHead;
}

export default parse;
/**
 * Parse ar file and return file stream on entry event
*
 * @returns Writable stream to parse ar file
 * @example
  const ar = fs.createReadStream("test.ar").pipe(ar.parse());
  ar.on("error", (err) => console.error(err)).on("entry", (header, stream) => {
    console.log(header);
    stream.on("data", (chunk) => console.log(chunk.toString("base64")));
  });
 *
 */
export function parse(): arParse {
  let initialHead = true;
  let oldBuffer: Buffer;
  let fileStream: stream.Readable;
  let fileStreamSize: number;
  return new stream.Writable({
    defaultEncoding: "binary",
    objectMode: false,
    autoDestroy: true,
    decodeStrings: true,
    emitClose: true,
    highWaterMark: 1024,
    final(callback) {
      if (fileStream && oldBuffer) {
        if (!fileStream.destroyed||fileStream.readable) fileStream.push(oldBuffer.subarray(0, fileStreamSize));
      }
      oldBuffer = undefined;
      callback();
    },
    destroy(error, callback) {
      if (fileStream) fileStream.destroy(error);
      callback(error);
    },
    write(remoteChunk, encoding, callback) {
      let chunk = Buffer.isBuffer(remoteChunk) ? remoteChunk : Buffer.from(remoteChunk, encoding);
      if (oldBuffer) {
        chunk = Buffer.concat([oldBuffer, chunk]);
      }
      oldBuffer = undefined;
      // file signature
      if (initialHead) {
        // More buffer to maneger correctly
        if (chunk.length < 70) {
          oldBuffer = chunk;
          return callback();
        }
        const signature = chunk.subarray(0, 8).toString("ascii");
        if (signature !== "!<arch>\n") {
          return callback(new Error("Invalid ar file"));
        }
        initialHead = false;
        chunk = chunk.subarray(8);
      }

      // if exists chunk and is not empty save to next request
      if (chunk.length > 0) {
        // if exist file stream and chunk is not empty
        if (fileStream) {
          const fixedChunk = chunk.subarray(0, fileStreamSize);
          if (!fileStream.destroyed||fileStream.readable) fileStream.push(fixedChunk);
          fileStreamSize -= fixedChunk.length;
          chunk = chunk.subarray(fixedChunk.length);
          if (fileStreamSize <= 0) {
            fileStream.push(null);
            fileStream = undefined;
          }
          if (chunk.length <= 0) return callback();
        }
      }

      // more buffer
      if (chunk.length >= 60) {
        for (let chunkByte = 0; chunkByte < chunk.length; chunkByte++) {
          const lastByteHead = chunkByte;
          const fistCharByte = lastByteHead-60;
          if (fistCharByte < 0) continue;
          const head = chunk.subarray(fistCharByte, lastByteHead);
          const name = head.subarray(0, 16).toString("ascii").trim();
          const time = new Date(parseInt(head.subarray(16, 28).toString("ascii").trim()) * 1000);
          const owner = parseInt(head.subarray(28, 34).toString("ascii").trim());
          const group = parseInt(head.subarray(34, 40).toString("ascii").trim());
          const mode = parseInt(head.subarray(40, 48).toString("ascii").trim());
          const size = parseInt(head.subarray(48, 58).toString("ascii").trim());

          // One to error
          if ((!name)||(time.toString() === "Invalid Date")||(isNaN(owner))||(isNaN(group))||(isNaN(mode))||(isNaN(size))) continue;
          if (head.subarray(58, 60).toString("ascii") !== "`\n") continue;

          if (fistCharByte >= 1) {
            const chucked = chunk.subarray(0, fistCharByte);
            if (fileStream) {
              fileStream.push(chucked);
              fileStream.push(null);
            }
          }

          // Cut post header from chunk
          chunk = chunk.subarray(lastByteHead);

          fileStream = new stream.Readable({read() {}});
          this.emit("entry", {name, time, owner, group, mode, size}, fileStream);
          fileStreamSize = size;

          const fileSize = chunk.subarray(0, size);
          chunk = chunk.subarray(fileSize.length);
          if (!fileStream.destroyed||fileStream.readable) fileStream.push(fileSize);
          fileStreamSize -= fileSize.length;

          if (fileStreamSize === 0) {
            if (!fileStream.destroyed||fileStream.readable) fileStream.push(null);
            fileStream = undefined;
            fileStreamSize = undefined;
          }

          // Restart loop to check if chunk has more headers
          chunkByte = 0;
        }
      }

      // Get more buffer data
      if (chunk.length > 0) oldBuffer = chunk;
      return callback();
    }
  });
}