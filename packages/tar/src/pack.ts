import { extendsStream } from "@sirherobrine23/extends";
import { Header, encode, modeToType } from "./header.js";
const END_OF_TAR = Buffer.alloc(1024);

export type HeaderPack = Partial<Header> & { name: string };
export class Pack extends extendsStream.Readable {
  #size = 0;
  #lock = false;
  constructor() {
    super({
      autoDestroy: true,
      emitClose: true,
      encoding: "binary",
      read: (size) => this.#size += size,
    });
  }

  #overflow(size: number) {
    size &= 511;
    if (size) this.push(END_OF_TAR.subarray(0, 512 - size));
  }

  async finalize() {
    this.push(END_OF_TAR);
    this.push(null);
  }
  entry(header: HeaderPack): extendsStream.nodeStream.Writable;
  entry(header: HeaderPack, buffer: string | Buffer): Promise<void>;
  entry() {
    if (this.destroyed||this.readableEnded) throw new Error("already finalized or destroyed");
    else if (this.#lock) throw new Error("Entry locked");
    else if (arguments.length === 0) throw new Error("Set file info!");
    const [ header ] = Array.from(arguments) as [ HeaderPack ];
    if (!header.size || header.type === 'symlink') header.size = 0;
    if (!header.type) header.type = modeToType(header.mode);
    if (!header.mode) header.mode = header.type === 'directory' ? 0o755 : 0o644;
    if (!header.uid) header.uid = 0;
    if (!header.gid) header.gid = 0;
    if (!header.mtime) header.mtime = new Date();

    if (typeof arguments[1] === "string" || Buffer.isBuffer(arguments[1])) {
      header.size = Buffer.byteLength(arguments[1]);
      return extendsStream.finished(extendsStream.nodeStream.Readable.from(arguments[1]).pipe(this.entry(header)), { error: true });
    }
    this.#lock = true;
    const bufHead = encode(header);
    if (!bufHead) throw new Error("Invalid header!");
    this.push(bufHead);
    let size = header.size;

    const self = this;
    const str = new extendsStream.nodeStream.Writable({
      autoDestroy: true, emitClose: true,
      write(chunk: Buffer, encoding, callback) {
        if (this.writableFinished) return callback();
        else if (size <= 0) {
          callback();
          return this.end();
        }
        if (!(Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);
        const ss = chunk.subarray(0, size);
        self.push(ss, "binary");
        size -= ss.byteLength; self.#size += ss.byteLength;
        callback();
      },
      final(callback) {
        self.#lock = false;
        self.#overflow(header.size);
        callback();
      },
      destroy(error, callback) {
        self.#lock = false;
        if (!!error) self.emit("error", error);
        callback(error);
      },
    });
    if (!header.size) str.end();
    return str;
  }
}

export function pack() {
  return new Pack();
}