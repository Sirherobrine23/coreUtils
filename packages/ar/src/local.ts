import oldFs, { promises as fs } from "node:fs";
import stream from "node:stream";
import path from "node:path";
import { extendsFS } from "@sirherobrine23/extends";
import { finished } from "node:stream/promises";

export type arHeader = {
  name: string,
  time: Date,
  owner: number,
  group: number,
  mode: number,
  size: number,
};

export function createHead(filename: string, info: {size: number, mtime?: Date|string, mode?: string, owner?: number, group?: number}) {
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