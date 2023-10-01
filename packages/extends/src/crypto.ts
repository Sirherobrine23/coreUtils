import crypto from "node:crypto";
import { Writable, nodeStream as stream } from "./stream.js";

export type hashAlgorithm =                            "sha1" | "sha256" | "sha512" | "md5";
const ALGORITHM_MAP: (hashAlgorithm|"all")[] = ["all", "sha1",  "sha256",  "sha512",  "md5"];

export type hashObject = {
  byteLength: number,
  hash: {
    [key in hashAlgorithm]?: string
  }
};

export type hashWrite = Writable<{ hashObject(hash: hashObject): void } & Record<hashAlgorithm, (hash: string) => void>>;
export function createHash(target?: "all"|hashAlgorithm, digestText?: crypto.BinaryToTextEncoding): hashWrite {
  if (!(ALGORITHM_MAP.includes(target))) target = "all";
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

export function randomBytesStream(size: number): stream.Readable {
  size = Math.abs(size);
  if (!(size > 0)) throw new Error("Invalid size");
  let producedSize = 0;
  return new stream.Readable({
    autoDestroy: true, emitClose: true,
    read(readSize) {
			let shouldEnd = false;
			if ((producedSize + readSize) >= size) {
				readSize = size - producedSize;
				shouldEnd = true;
			}
			crypto.randomBytes(readSize, (error, buffer): any => {
				if (error) return this.emit("error", error);
				producedSize += readSize;
				this.push(buffer);
				if (shouldEnd) this.push(null);
			});
		},
  });
}