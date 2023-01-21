import { Readable, Writable } from "node:stream";
import crypto from "node:crypto";
export type hashTarget = "sha512"|"sha256"|"sha1"|"md5";
export type hashObject = {
  dataReceived: number,
  hash: {[U in hashTarget]?: string}
};

export function createHash(target: "all"|hashTarget = "all", fn?: (Error?: Error, hash?: hashObject) => void) {
  if (!(["all", "sha256", "sha1", "md5"]).includes(target)) target = "all";
  const crypHash: {[U in hashTarget]?: crypto.Hash} = {};
  // sha512
  if ((["all", "sha512"]).includes(target)) crypHash.sha512 = crypto.createHash("sha512");
  // sha256
  if ((["all", "sha256"]).includes(target)) crypHash.sha256 = crypto.createHash("sha256");
  // sha1
  if ((["all", "sha1"]).includes(target)) crypHash.sha1 = crypto.createHash("sha1");
  // md5
  if ((["all", "md5"]).includes(target)) crypHash.md5 = crypto.createHash("md5");
  let dataReceived = 0;
  let getError: any;
  return new Writable({
    write(chunk, encoding, callback) {
      if (getError) return callback(getError);
      dataReceived += Buffer.byteLength(chunk, encoding);

      for (const key in crypHash) {
        try {
          crypHash[key] = crypHash[key as hashTarget].update(chunk, encoding);
        } catch (err) {
          getError = err;
          if (fn) fn(err, undefined);
          fn = undefined;
          return callback(err);
        }
      }
      callback();
    },
    final(callback) {
      const crypDigest: hashObject = {
        dataReceived,
        hash: {},
      };
      for (const key in crypHash) {
        try {
          crypDigest.hash[key] = crypHash[key as hashTarget].digest("hex");
        } catch (err) {
          if (fn) fn(err, undefined);
          fn = undefined;
          return callback(err);
        }
      }
      if (fn) fn(null, crypDigest);
      callback();
    },
  });
}

export async function createHashAsync(stream: Readable|Buffer, target: "all"|hashTarget = "all"): Promise<hashObject> {
  return new Promise((resolve, reject) => {
    if (stream instanceof Buffer) stream = Readable.from(stream);
    stream.pipe(createHash(target, (err, hash) => {
      if (err) return reject(err);
      resolve(hash);
    }));
  });
}
