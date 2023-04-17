import oldFs, { promises as fs } from "node:fs";
import { extendsFS } from "@sirherobrine23/extends";
import { finished } from "node:stream/promises";
import { format } from "node:util";
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

export type fileInfo = {size: number, mtime?: Date|string, mode?: string, owner?: number, group?: number}
export function createHead(filename: string, info: fileInfo) {
  info.mtime ||= new Date();
  info.mode ||= "644";
  info.owner ||= 0;
  if (info.owner < 0) info.owner = 0;
  info.group ||= 0;
  if (info.group < 0) info.group = 0;
  const controlHead = Buffer.alloc(60, 0x20);

  // Filename
  controlHead.write(path.basename(filename), 0, 16, "ascii");

  // Timestamp
  if (info.mtime instanceof Date) controlHead.write((info.mtime.getTime()/1000).toFixed(), 16, 12); else controlHead.write(info.mtime, 16, 12);

  // Owner ID
  controlHead.write(info.owner.toString(), 28, 6);

  // Group ID
  controlHead.write(info.group.toString(), 34, 6);

  // File mode
  controlHead.write(info.mode, 40, 8);

  // File size
  controlHead.write(info.size.toString(), 48, 10);

  // ending
  controlHead[58] = 0x60; controlHead[59] = 0x0A;
  return controlHead;
}


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
export function parseArStream(): arParse {
  let initialHead = true, oldBuffer: Buffer, fileStream: stream.Readable, fileStreamSize: number;
  return new stream.Writable({
    defaultEncoding: "binary",
    objectMode: false,
    autoDestroy: true,
    decodeStrings: true,
    emitClose: true,
    highWaterMark: 1024,
    final(callback) {
      if (fileStream && oldBuffer) {
        if (!fileStream.destroyed||fileStream.readable) {
          fileStream.push(oldBuffer.subarray(0, fileStreamSize));
          fileStream.push(null);
        }
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
      if (oldBuffer) chunk = Buffer.concat([oldBuffer, chunk]);
      oldBuffer = undefined;
      // file signature
      if (initialHead) {
        // More buffer to maneger correctly
        if (chunk.length < 70) {
          oldBuffer = chunk;
          return callback();
        }
        const signature = chunk.subarray(0, 8).toString("ascii");
        if (signature !== "!<arch>\n") return callback(new Error(format("Invalid ar file, recived: %O", signature)));
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

          if (fileStreamSize <= 0) {
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

export interface arStream extends stream.Readable {
  close(): void;
  entry(...args: Parameters<typeof createHead>): stream.Writable;
  addLocalFile(filePath: string, filename?: string): Promise<void>;
  getEntrys(): {[fileName: string]: fileInfo};
}

/**
 * Create ar file and return file stream
 * 
 * @param onRedable - Callback with ar stream
 * @returns
 */
export function createArStream(onRedable?: (ar: arStream, callback: (err?: any) => void) => void) {
  const entrys = new Map<string, fileInfo>();
  let lockWrite = false;
  return new (class arStream extends stream.Readable {
    constructor() {
      super({autoDestroy: true, read() {}})
      this.push(Buffer.from([0x21, 0x3C, 0x61, 0x72, 0x63, 0x68, 0x3E, 0x0A]), "binary");
      if (typeof onRedable === "function") Promise.resolve().then(() => onRedable(this, this.#callback)).catch(this.#callback);
    }
    #callback(err?: any) {
      lockWrite = true;
      if (err) this.emit("error", err);
      this.push(null);
    };
    close() {this.#callback();}
    getEntrys() {
      return Array.from(entrys.keys()).reduce<{[fileName: string]: fileInfo}>((acc, key) => {
        acc[key] = entrys.get(key);
        return acc;
      }, {});
    }
    entry(filename, info) {
      if (entrys.has(filename)) throw new Error("File are exists in ar file!");
      else if (lockWrite) throw new Error("Write locked");
      lockWrite = true;
      this.push(createHead(filename, info), "binary");
      entrys.set(filename, {...info});
      return new stream.Writable({
        autoDestroy: true,
        decodeStrings: false,
        emitClose: true,
        write: (chunk, encoding, callback) => {
          this.push(chunk, encoding);
          callback();
        },
        final: (callback) => {
          lockWrite = false;
          if (entrys.get(filename).size & 1) this.push("\n");
          callback();
        },
        destroy: (error, callback) => {
          if (!!error) this.emit("error", error);
          callback(error);
        },
      });
    }
    async addLocalFile(filePath: string, filename = path.basename(filePath)) {
      if (!(await extendsFS.isFile(filePath))) throw new Error("path is not file!");
      const stats = await fs.stat(filePath);
      await finished(oldFs.createReadStream(filePath).pipe(this.entry(filename, {
        size: stats.size,
        mtime: stats.mtime,
        owner: stats.uid || 0,
        group: stats.gid || 0
      })));
    }
  })();
}

/**
 * Create ar file localy
 *
 * @param filePath - File path
 * @returns
 */
export async function createFile(filePath: string) {
  await fs.writeFile(filePath, Buffer.from([0x21, 0x3C, 0x61, 0x72, 0x63, 0x68, 0x3E, 0x0A]), "binary");
  let lock = false;
  const entrys = new Map<string, {mtime?: Date|string, size: number, mode?: string}>();
  async function entry(filename: string, info: {mtime?: Date|string, size: number, mode?: string}) {
    if (lock) throw new Error("Wait before entry end!");
    if (entrys.has((filename = path.basename(filename)))) throw new Error("File ared exists");
    entrys.set(filename, {...info});
    lock = true;
    await fs.appendFile(filePath, createHead(filename, info));
    const src = oldFs.createWriteStream(filePath, {flags: "a+"});
    return new stream.Writable({
      write(chunk, encoding, callback) {
        return src.write(chunk, encoding, callback);
      },
      async final(callback) {
        if (entrys.get(filename).size & 1) await fs.appendFile(filePath, "\n");
        lock = false;
        callback();
        src.close(callback);
      },
    });
  }

  return {
    entry,
    getEntrys() {
      return Array.from(entrys.keys()).reduce<{[filename: string]: ReturnType<typeof entrys.get>}>((acc, key) => {
        acc[key] = entrys.get(key);
        return acc;
      }, {});
    }
  };
}

/**
 * Parse file and return headers array with function with file stream
 *
 * @param filePath - File path
 */
export async function parseFile(filePath: string) {
  if (!((await extendsFS.readFile(filePath, 0, 8)).toString("ascii").startsWith("!<arch>\n"))) throw new Error("Invalid ar file, invalid magic head!");
  const heads: {head: arHeader, start: number, end: number}[] = [];

  let oldBuffer: Buffer, fileStreamSize: number = 0, offset = 8;
  await finished(oldFs.createReadStream(filePath, {start: 8}).pipe(new stream.Writable({
    write(chunk, _encoding, callback) {
      if (oldBuffer) chunk = Buffer.concat([oldBuffer, chunk]); oldBuffer = undefined;
      offset += Buffer.byteLength(chunk);
      if (fileStreamSize >= 1) {
        const fixedChunk = chunk.subarray(0, fileStreamSize);
        fileStreamSize -= fixedChunk.byteLength;
        chunk = chunk.subarray(fixedChunk.length);
        if (fileStreamSize <= 0) fileStreamSize = 0;
        if (chunk.length <= 0) return callback();;
      }
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
          if ((!name)||(time.toString() === "Invalid Date")||(isNaN(owner))||(isNaN(group))||(isNaN(mode))||(isNaN(size))) continue;
          if (head.subarray(58, 60).toString("ascii") !== "`\n") continue;
          chunk = chunk.subarray(lastByteHead);
          heads.push({
            start: offset-chunk.length,
            end: (offset-chunk.length-1)+size,
            head: {
              name,
              time,
              owner,
              group,
              mode,
              size
            }
          });
          const fileSize = chunk.subarray(0, size);
          fileStreamSize = size - fileSize.byteLength;
          chunk = chunk.subarray(fileSize.length);
          chunkByte = 0;
        }
      }

      // Get more buffer data
      if (chunk.length > 0) oldBuffer = chunk;
      callback();
    },
  })));
  return heads.map(info => ({
    head: info.head,
    startOn: info.start,
    endOf: info.end,
    getFile() {
      return oldFs.createReadStream(filePath, {
        start: info.start,
        end: info.end
      });
    }
  }));
}