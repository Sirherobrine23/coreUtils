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

function get_new_file(chunk: Buffer) {
  if (chunk.length < 60) return null;
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
    if (!name) return null;
    else if (time.toString() === "Invalid Date") return null;
    else if (isNaN(owner)) return null;
    else if (isNaN(group)) return null;
    else if (isNaN(mode)) return null;
    else if (isNaN(size)) return null;
    let fileBufferEnd: Buffer;
    let nextBuffer = chunk.subarray(lastByteHead+1);
    const backBuffer = chunk.subarray(0, fistCharByte);
    if (nextBuffer.length > size) {
      fileBufferEnd = nextBuffer.subarray(0, size);
      nextBuffer = nextBuffer.subarray(size+1);
    }
    const data = {
      fileInfo: {
        name,
        time,
        owner,
        group,
        mode,
        size
      },
      buffers: {
        backBuffer,
        head,
        nextBuffer,
        fileBufferEnd
      }
    };
    return data;
  }
  return null;
}

export type fileInfo = (ReturnType<typeof get_new_file>)["fileInfo"];

/**
 * extract ar file with stream
 */
export function createUnpack(fn?: (info: fileInfo, stream: Readable) => void) {
  let initialHead = true;
  let fileStream: Readable;
  let oldBuffer: Buffer;
  const internalStream = new Writable({
    write(remoteChunk, encoding, callback) {
      let chunk = Buffer.isBuffer(remoteChunk) ? remoteChunk : Buffer.from(remoteChunk, encoding);
      if (oldBuffer) {
        chunk = Buffer.concat([oldBuffer, chunk]);
        oldBuffer = undefined;
      }
      if (initialHead) {
        if (chunk.toString().slice(0, 8) !== "!<arch>\n") return callback(new Error("Invalid ar file"));
        initialHead = false;
        chunk = chunk.subarray(8);
      }
      const info = get_new_file(chunk);
      if (fileStream) {
        if (info) {
          fileStream.push(info.buffers.backBuffer);
          fileStream.push(null);
          fileStream = undefined;
          fileStream = new Readable();
          fileStream._read = (size) => size;
          if (fn) fn(info.fileInfo, fileStream);
          if (info.buffers.fileBufferEnd) {
            fileStream.push(info.buffers.fileBufferEnd);
            fileStream.push(null);
            fileStream = undefined;
            oldBuffer = info.buffers.nextBuffer;
            return callback();
          }
          chunk = info.buffers.nextBuffer;
        }
        fileStream.push(chunk);
      } else {
        if (info) {
          fileStream = new Readable();
          fileStream._read = (size) => size;
          if (fn) fn(info.fileInfo, fileStream);
          fileStream.push(info.buffers.backBuffer);
          if (info.buffers.fileBufferEnd) {
            fileStream.push(info.buffers.fileBufferEnd);
            fileStream.push(null);
            fileStream = undefined;
            return this.write(info.buffers.nextBuffer, encoding, callback);
          }
          oldBuffer = info.buffers.nextBuffer;
        }
        oldBuffer = chunk;
      }
      console.log(info);
      return callback();
    }
  });
  return internalStream;
}