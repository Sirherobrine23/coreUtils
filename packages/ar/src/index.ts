import oldFs, { createReadStream, promises as fs } from "node:fs";
import { extendsFS, extendStream as stream } from "@sirherobrine23/extends";
import { finished } from "node:stream/promises";
import { format } from "node:util";
import path from "node:path";
import { EventMap, defineEvents } from "@sirherobrine23/extends/src/stream.js";

export type arHeader = {
  name: string,
  time: Date,
  owner: number,
  group: number,
  mode: number,
  size: number,
};

export type fileInfo = {size: number, mtime?: Date, mode?: number, owner?: number, group?: number};
export function createHead(filename: string, info: fileInfo) {
  if (isNaN(info.size) && !isFinite(info.size) && info.size <= 0) throw new Error("Invalid file size!");
  if (!(info.mtime instanceof Date && !isNaN(info.mtime.getTime()))) info.mtime = new Date();
  if (!(info.mode > 1 && !isNaN(info.mode) && isFinite(info.mode))) info.mode = 644;
  if (!(info.owner > 0 && !isNaN(info.owner) && isFinite(info.owner))) info.owner = 0;
  if (!(info.group > 0 && !isNaN(info.group) && isFinite(info.group))) info.group = 0;

  // Init head
  const controlHead = Buffer.alloc(60, 0x20);

  // Filename
  controlHead.write(path.basename(filename), 0, 16, "ascii");

  // Timestamp
  controlHead.write((info.mtime.getTime()/1000).toFixed(), 16, 12);

  // Owner ID
  controlHead.write(Math.round(info.owner).toString(), 28, 6);

  // Group ID
  controlHead.write(Math.round(info.group).toString(), 34, 6);

  // File mode
  controlHead.write(Math.round(info.mode).toString(), 40, 8);

  // File size
  controlHead.write(Math.round(info.size).toString(), 48, 10);

  // ending
  controlHead[58] = 0x60; controlHead[59] = 0x0A;
  return controlHead;
}

export class arParse<T extends EventMap = {}> extends stream.Writable<defineEvents<{ entry(header: arHeader, stream: stream.nodeStream.Readable): void }>, [T]> {
  #fileStreamSize: number;
  #fileStream?: stream.Readable;
  #oldBuffer?: Buffer;
  #initialHead = true;
  constructor(private entry?: (header: arHeader, stream: stream.nodeStream.Readable) => void) {
    super({
      defaultEncoding: "binary",
      objectMode: false,
      autoDestroy: true,
      decodeStrings: true,
      emitClose: true,
      highWaterMark: 1024
    });
  }

  _destroy(error: Error, callback: (error?: Error) => void): void {
    if (this.#fileStream && error) this.#fileStream.destroy(error);
    callback(error);
  }

  _final(callback: (error?: Error) => void): void {
    if (this.#fileStream && this.#oldBuffer) {
      if (!this.#fileStream.destroyed||this.#fileStream.readable) {
        this.#fileStream.push(this.#oldBuffer.subarray(0, this.#fileStreamSize));
        this.#fileStream.push(null);
      }
    }
    this.#oldBuffer = undefined;
    callback();
  }

  _write(remoteChunk: Buffer, encoding: BufferEncoding, callback: (error?: Error) => void) {
    let chunk = Buffer.isBuffer(remoteChunk) ? remoteChunk : Buffer.from(remoteChunk, encoding);
    if (this.#oldBuffer) chunk = Buffer.concat([this.#oldBuffer, chunk]);
    this.#oldBuffer = undefined;
    // file signature
    if (this.#initialHead) {
      // More buffer to maneger correctly
      if (chunk.length < 70) {
        this.#oldBuffer = chunk;
        return callback();
      }
      const signature = chunk.subarray(0, 8).toString("ascii");
      if (signature !== "!<arch>\n") return callback(new Error(format("Invalid ar file, recived: %O", signature)));
      this.#initialHead = false;
      chunk = chunk.subarray(8);
    }

    // if exists chunk and is not empty save to next request
    if (chunk.length > 0) {
      // if exist file stream and chunk is not empty
      if (this.#fileStream) {
        const fixedChunk = chunk.subarray(0, this.#fileStreamSize);
        if (!this.#fileStream.destroyed||this.#fileStream.readable) this.#fileStream.push(fixedChunk);
        this.#fileStreamSize -= fixedChunk.length;
        chunk = chunk.subarray(fixedChunk.length);
        if (this.#fileStreamSize <= 0) {
          this.#fileStream.push(null);
          this.#fileStream = undefined;
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
          if (this.#fileStream && chucked[0] !== 0x0A) {
            this.#fileStream.push(chucked);
            this.#fileStream.push(null);
          }
        }

        // Cut post header from chunk
        chunk = chunk.subarray(lastByteHead);
        if (typeof this.entry === "function" && this.entry.length >= 1) this.entry({name, time, owner, group, mode, size}, (this.#fileStream = new stream.Readable({read() {}})));
        else this.emit("entry", {name, time, owner, group, mode, size}, (this.#fileStream = new stream.Readable({read() {}})));

        this.#fileStreamSize = size;

        const fileSize = chunk.subarray(0, size);
        chunk = chunk.subarray(fileSize.length);
        if (!this.#fileStream.destroyed||this.#fileStream.readable) this.#fileStream.push(fileSize);
        this.#fileStreamSize -= fileSize.length;

        if (this.#fileStreamSize <= 0) {
          if (!this.#fileStream.destroyed||this.#fileStream.readable) this.#fileStream.push(null);
          this.#fileStream = undefined;
          this.#fileStreamSize = -1;
        }

        // Restart loop to check if chunk has more headers
        chunkByte = 0;
      }
    }

    // Get more buffer data
    if (chunk.length > 0) this.#oldBuffer = chunk;
    return callback();
  }
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
export function parseArStream() {
  return new arParse();
}

export class arStream extends stream.Readable {
  #fileEntrys = new Map<string, fileInfo>();
  #sendMagic = true;
  constructor(callback?: (ar: arStream, callback?: (err?: any) => void) => void) {
    super({read(){}, autoDestroy: true});
    if (typeof callback === "function") {
      if (callback.length === 1) {
        Promise.resolve().then(() => callback(this)).then(() => this.finalize(), err => this.emit("error", err));
      } else {
        Promise.resolve().then(() => callback(this, (err) => {
          if (err) this.emit("error", err);
          this.finalize();
        })).catch(err => this.emit("error", err));
      }
    }
  }

  /**
   * Get files added in ar file
   * @returns Files registred on stream
   */
  getFiles() {
    return Array.from(this.#fileEntrys.keys()).reduce<{[fileName: string]: fileInfo}>((acc, fileName) => {
      acc[fileName] = this.#fileEntrys.get(fileName);
      return acc;
    }, {});
  }

  /**
   * Close redable stream
   */
  finalize() {
    this.push(null);
  }

  #locked = false;
  /**
   * Get writable stream to add file in ar file
   *
   * @param fileName - file name
   * @param fileInfo - file info to set in head
   * @returns
   */
  addEntry(fileName: string, fileInfo: fileInfo): stream.Writable;
  /**
   *
   * @param fileName - file name
   * @param fileInfo - file info to set in head
   * @param data - File Buffer os string
   * @param encoding - optional data encoding
   */
  addEntry(fileName: string, fileInfo: fileInfo, data: string|Buffer, encoding?: BufferEncoding): void;
  addEntry(fileName: string, fileInfo: fileInfo, data?: string|Buffer, encoding?: BufferEncoding): void|stream.Writable {
    if (this.#fileEntrys.has(fileName)) throw new Error("File added in ar file");
    else if (this.#locked) throw new Error("Fist end previus Writable stream!");
    else if (this.closed) throw new Error("Stream closed not possible send new chuncks");
    if (this.#sendMagic) {
      this.#sendMagic = false;
      // Send initial head
      this.push(Buffer.from([0x21, 0x3C, 0x61, 0x72, 0x63, 0x68, 0x3E, 0x0A]), "binary");
    }
    const fileHead = createHead(fileName, fileInfo);
    this.#fileEntrys.set(fileName, {...fileInfo});
    const self = this;
    this.push(fileHead, "binary");
    if (typeof data === "string"||data instanceof Buffer) {
      this.push(data, encoding);
      this.#locked = false;
      return;
    }
    return new stream.Writable({
      autoDestroy: true,
      emitClose: true,
      write(chunk, encoding, callback) {
        self.push(chunk, encoding);
        callback();
      },
      destroy(error, callback) {
       self.#locked = false;
       if (error) self.destroy(error);
       if (self.#fileEntrys.get(fileName).size & 1) self.push("\n", "utf8");
        callback(error);
      }
    });
  }

  async addLocalFile(filePath: string) {
    const stats = await fs.lstat(filePath);
    if (stats.isDirectory()) throw new Error("Invalid file path, informed directory not file!");
    await finished(createReadStream(filePath).pipe(this.addEntry(filePath, {
      size: stats.size,
      mode: stats.mode,
      mtime: stats.mtime,
      owner: stats.uid,
      group: stats.gid
    })));

    return stats;
  }
}

/**
 *
 * @param createdCallback - call before stream created
 * @returns
 */
export function createArStream(callback?: (ar: arStream, callback?: (err?: any) => void) => void) {
  return new arStream(callback);
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
  const entrys = new Map<string, fileInfo>();
  async function entry(filename: string, info: fileInfo) {
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
  if (!((await extendsFS.readFile(filePath, {start: 0, end: 8})).toString("ascii").startsWith("!<arch>\n"))) throw new Error("Invalid ar file, invalid magic head!");
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