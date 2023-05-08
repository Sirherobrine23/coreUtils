import crypto from "node:crypto";
import stream from "node:stream";

export type hashAlgorithm =                            "sha1" | "sha256" | "sha512" | "md5";
const ALGORITHM_MAP: (hashAlgorithm|"all")[] = ["all", "sha1",  "sha256",  "sha512",  "md5"];

export type hashObject = {
  byteLength: number,
  hash: {
    [key in hashAlgorithm]?: string
  }
};

export declare interface hashWrite extends stream.Writable {
  on(event: "close", listener: () => void): this;
  once(event: "close", listener: () => void): this;

  on(event: "drain", listener: () => void): this;
  once(event: "drain", listener: () => void): this;

  on(event: "error", listener: (err: Error) => void): this;
  once(event: "error", listener: (err: Error) => void): this;

  on(event: "finish", listener: () => void): this;
  once(event: "finish", listener: () => void): this;

  on(event: "pipe", listener: (src: stream.Readable) => void): this;
  once(event: "pipe", listener: (src: stream.Readable) => void): this;

  on(event: "unpipe", listener: (src: stream.Readable) => void): this;
  once(event: "unpipe", listener: (src: stream.Readable) => void): this;

  on(event: "hashObject", listener: (hash: hashObject) => void): this;
  once(event: "hashObject", listener: (hash: hashObject) => void): this;

  on(event: hashAlgorithm, listener: (hash: string) => void): this;
  once(event: hashAlgorithm, listener: (hash: string) => void): this;

  on(event: string | symbol, listener: (...args: any[]) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function createHash(target?: "all"|hashAlgorithm, digestText?: crypto.BinaryToTextEncoding): hashWrite {
  if (!ALGORITHM_MAP.includes(target)) target = "all";
  const crypHash: {[U in hashAlgorithm]?: crypto.Hash} = {};
  // sha512
  if ((["all", "sha512"]).includes(target)) crypHash.sha512 = crypto.createHash("sha512");

  // sha256
  if ((["all", "sha256"]).includes(target)) crypHash.sha256 = crypto.createHash("sha256");

  // sha1
  if ((["all", "sha1"]).includes(target)) crypHash.sha1 = crypto.createHash("sha1");

  // md5
  if ((["all", "md5"]).includes(target)) crypHash.md5 = crypto.createHash("md5");

  let byteLength = 0;
  return new stream.Writable({
    write(chunk, encoding, callback) {
      byteLength += Buffer.byteLength(chunk, encoding);
      for (const key in crypHash) {
        try {
          crypHash[key as hashAlgorithm].update(chunk);
        } catch (err) {
          this.emit("error", err);
          return callback(err);
        }
      }
      callback();
    },
    final(callback) {
      const crypDigest: hashObject = {byteLength, hash: {}};
      for (const key in crypHash) {
        try {
          crypDigest.hash[key] = crypHash[key as hashAlgorithm].digest(digestText || "hex");
          this.emit(key, crypDigest.hash[key]);
        } catch (err) {
          this.emit("error", err);
          return callback(err);
        }
      }
      this.emit("hashObject", crypDigest);
      callback();
    },
  });
}

export async function createHashAsync(from: stream.Readable|stream.Transform|stream.Duplex|Buffer|string, ...args: Parameters<typeof createHash>) {
  // if (!(from instanceof Buffer || from instanceof stream.Transform || from instanceof stream.Duplex || from instanceof stream.Readable || typeof from === "string")) throw new Error("Invalid input");
  return new Promise<hashObject>((resolve, reject) => {
    if (from instanceof Buffer || typeof from === "string") from = stream.Readable.from(from);
    return from.pipe(createHash(...args)).on("hashObject", resolve).on("error", reject);
  });
}

export class randomBytesStream extends stream.Readable {
  constructor(fileSize: number, options?: stream.ReadableOptions) {
    super({
      ...options,
      emitClose: false,
      autoDestroy: true,
      objectMode: false,
      read(_size) {
        if (fileSize > 0) {
          const dtr = crypto.randomBytes(Math.max(0, Math.min(Math.max(1, this.readableHighWaterMark), fileSize)));
          fileSize = fileSize - dtr.byteLength;
          if (!(this.closed||this.destroyed)) this.push(dtr);
          return;
        }
        this.push(null);
      },
    });
  }
}