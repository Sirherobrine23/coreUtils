import { Readable, Writable } from "node:stream";

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

export function get_new_file(chunk: Buffer) {
  if (chunk.length < 60) return false;
  for (let i = 0; i < chunk.length+1;i++) {
    const lastByteHead = i+2;
    if (chunk.subarray(i, lastByteHead).toString() !== "`\n") continue;
    let fistCharByte = lastByteHead-60;
    const head = chunk.subarray(fistCharByte, lastByteHead);
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
      fileInfo: {
        name,
        time,
        owner,
        group,
        mode,
        size
      },
      buffersStart: {
        lastByteHead,
        fistCharByte,
      }
    };
    return data;
  }
  return false;
}


export function createUnpack(fn?: (...arg: any[]) => void) {
  const __writed = new Writable();
  let __locked = false;
  let entryStream: Readable;
  let size = 0;
  function check_new_file(chunk: Buffer) {
    return !!(chunk.subarray(0, 60).toString().replace(/\s+\`(\n)?$/, "").trim().match(/^([\w\s\S]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$/));
  }
  function _final(callback: (error?: Error) => void): void {
    if (entryStream) {
      entryStream.push(null);
      entryStream = undefined;
    }
    return callback();
  }
  function _destroy(error: Error, callback: (error?: Error) => void): void {
    if (entryStream) {
      entryStream.push(null);
      entryStream = undefined;
    }
    return callback(error);
  }
  async function __push(chunk: Buffer, callback?: (error?: Error | null) => void) {
    if (0 < size) {
      if (check_new_file(chunk.subarray(size))) {
        // console.log("[Ar]: Nextfile");
        const silpChuck = chunk.subarray(0, size);
        chunk = chunk.subarray(size);
        // console.log("[Ar]: Nextfile: %f", chunk.length);
        entryStream.push(silpChuck, "binary");
        entryStream.push(null);
        entryStream = undefined;
        size = 0;
        return __writed._write(chunk, "binary", callback);
      }
    }
    size -= chunk.length;
    entryStream.push(chunk, "binary");
    return callback();
  }
  let waitMore: Buffer;
  __writed._write = (chunkRemote, encoding, callback) => {
    if (!Buffer.isBuffer(chunkRemote)) chunkRemote = Buffer.from(chunkRemote, encoding);
    let chunk = Buffer.from(chunkRemote);
    if (__locked === false) {
      // console.log("[Ar]: Fist chunk length: %f", chunk.length);
      if (waitMore) {
        chunk = Buffer.concat([waitMore, chunk]);
        waitMore = undefined;
      }
      if (chunk.length < 70) {
        waitMore = chunk;
        callback();
      }
      if (!chunk.subarray(0, 8).toString().trim().startsWith("!<arch>")) {
        this.destroy();
        return callback(new Error("Not an ar file"));
      }
      __locked = true;
      chunk = chunk.subarray(8);
    }
    if (entryStream) return __push(chunk, callback);
    const info = chunk.subarray(0, 60).toString().replace(/\s+\`(\n)?$/, "").trim();
    chunk = chunk.subarray(60);
    // debian-binary   1668505722  0     0     100644  4
    const dataMathc = info.match(/^([\w\s\S]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$/);
    if (!dataMathc) {
      size = chunk.length;
      return __push(chunk, callback);
    }
    const [, name, time, owner, group, mode, sizeM] = dataMathc;
    const data = {
      name: name.trim(),
      time: new Date(parseInt(time)*1000),
      owner: parseInt(owner),
      group: parseInt(group),
      mode: parseInt(mode),
      size: parseInt(sizeM)
    };
    size = data.size;
    entryStream = new Readable({read() {}});
    fn(data, entryStream);
    return __push(chunk, callback);
    // process.exit(1);
  }
  __writed._final = (callback) => {return _final.call(this, callback);};
  __writed._destroy = (error, callback) => {return _destroy.call(this, error, callback);};
  return __writed;
}