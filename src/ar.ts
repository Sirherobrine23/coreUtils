import { Readable, Writable } from "node:stream";

type fileInfo = {
  name: string,
  time: Date,
  owner: number,
  group: number,
  mode: number,
  size: number,
  stream: Readable
};

function get_new_file(chunk: Buffer) {
  if (chunk.length < 60) return false;
  for (let i = 0; i < chunk.length+1;i++) {
    const startAt = i+2;
    if (chunk.subarray(i, startAt).toString() !== "`\n") continue;
    let startFrom = startAt-60;
    const head = chunk.subarray(startFrom, startAt);
    const name = head.subarray(0, 16).toString().trim();
    const time = new Date(parseInt(head.subarray(16, 28).toString().trim(), 10) * 1000);
    const owner = parseInt(head.subarray(28, 34).toString().trim(), 10);
    const group = parseInt(head.subarray(34, 40).toString().trim(), 10);
    const mode = parseInt(head.subarray(40, 48).toString().trim(), 8);
    const size = parseInt(head.subarray(48, 58).toString().trim(), 10);
    if (!name) return false;
    else if (time.toString() === "Invalid Date") return false;
    else if (isNaN(owner)) return false;
    else if (isNaN(group)) return false;
    else if (isNaN(mode)) return false;
    else if (isNaN(size)) return false;
    const data = {
      name,
      time,
      owner,
      group,
      mode,
      size,
      buffers: {
        back: chunk.subarray(0, startFrom),
        head,
        nextWithHead: chunk.subarray(startFrom, chunk.length),
        next: chunk.subarray(startAt, chunk.length),
      }
    };
    // console.log({
    //   back: data.buffers.back.length,
    //   head: data.buffers.head.length,
    //   next: data.buffers.next.length,
    // })
    return data;
  }
  return false;
}

export function createExtract(fn?: (info: fileInfo) => void) {
  const internalStream = new Writable();
  let entryStream: Readable;
  async function __push(chunk: Buffer, callback?: (error?: Error | null) => void) {
    if (!entryStream) {
      internalStream.destroy();
      return callback(new Error("Not an ar file"));
    }
    const info = get_new_file(chunk);
    if (info === false) {
      entryStream.push(chunk, "binary");
      return (callback ?? (() => console.log("no callback")))();
    }
    entryStream.push(info.buffers.back, "binary");
    entryStream.push(null);
    entryStream = undefined;
    return internalStream._write(info.buffers.nextWithHead, "binary", callback);
  }

  let __locked = false;
  let __fist = true;
  internalStream._write = (chunkRemote, encoding, callback) => {
    if (!Buffer.isBuffer(chunkRemote)) chunkRemote = Buffer.from(chunkRemote, encoding);
    let chunk = Buffer.from(chunkRemote);
    if (__locked === false) {
      if (!chunk.subarray(0, 8).toString().trim().startsWith("!<arch>")) {
        internalStream.destroy();
        return callback(new Error("Not an ar file"));
      }
      __locked = true;
      chunk = chunk.subarray(8);
    }

    // Send if entryStream is defined
    if (entryStream) return __push(chunk, callback);
    const info = get_new_file(chunk);
    if (info === false) {
      if (__fist) {
        internalStream.destroy();
        return callback(new Error("Not an ar file"));
      }
      return __push(chunk, callback);
    }
    __fist = false;
    entryStream = new Readable({read: (_size) => {}});
    if (fn) fn({
      name: info.name,
      time: info.time,
      owner: info.owner,
      group: info.group,
      mode: info.mode,
      size: info.size,
      stream: entryStream
    });
    return __push(info.buffers.next, callback);
    // process.exit(1);
  }

  internalStream._final = function _final(callback: (error?: Error) => void): void {
    if (entryStream) {
      entryStream.push(null);
      entryStream = undefined;
    }
    return callback();
  }

  internalStream._destroy = function _destroy(error: Error, callback: (error?: Error) => void): void {
    if (entryStream) {
      entryStream.push(null);
      entryStream = undefined;
    }
    return callback(error);
  }

  return internalStream;
}

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
      const head = Buffer.alloc(60);
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
      head.write("`\n", 58, 2);

      const fixeHead = Buffer.from(head.toString().split(/\x00/).join(" "), "utf8");
      console.log([fixeHead.toString()]);
      internalStream.push(fixeHead);
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
