import { Writable } from "node:stream";
import crypto from "node:crypto";

export function createHash(target: "all"|"sha256"|"sha1"|"md5" = "all", fn?: (hash: {[key: string]: string}) => void) {
  const crypHash: {[key: string]: crypto.Hash} = {};
  const crypDigest: {[key: string]: string} = {};
  // sha256
  if ((["all", "sha256"]).includes(target)) crypHash.sha256 = crypto.createHash("sha256");
  // sha1
  if ((["all", "sha1"]).includes(target)) crypHash.sha1 = crypto.createHash("sha1");
  // md5
  if ((["all", "md5"]).includes(target)) crypHash.md5 = crypto.createHash("md5");
  const internalWrite = new Writable({});
  internalWrite._write = (chunk, encoding, callback) => {
    for (const key in crypHash) {
      crypHash[key] = crypHash[key].update(chunk, encoding);
    }
    callback();
  }
  internalWrite.on("finish", () => {
    for (const key in crypHash) {
      crypDigest[key] = crypHash[key].digest("hex");
    }
    if (fn) fn(crypDigest);
  });
  return internalWrite;
}
