import { Readable as streamReadable, Duplex as streamDuplex } from "node:stream";
import { ReadStream as fsReadStream } from "node:fs";
import crypto from "node:crypto";

/**
 *  Create hash string for sha256 and md5 (md5sum) and return hex string.
 *
 * @param stream - Buffer, StreamReadable or fsReadStream
 * @param Hash - Encoding hash
 * @param streamWait - function to wait stream, @default new Promise(done => Buffer.isBuffer(stream) ? done() : stream.once("close", done))
 * @returns
 */
export async function createSHA256_MD5(stream: streamReadable|fsReadStream|streamDuplex|Buffer, Hash: "sha256"|"md5" = "sha256", streamWait: Promise<void> = new Promise<void>(done => Buffer.isBuffer(stream) ? done() : stream.once("close", done))) {
  if (!((["sha256", "md5"]).includes(Hash))) Hash = "sha256"
  let hash = crypto.createHash(Hash);
  if (Buffer.isBuffer(stream)) hash = hash.update(stream);
  else stream.on("data", data => hash = hash.update(data));
  if (streamWait) await streamWait;
  return hash.digest("hex");
}