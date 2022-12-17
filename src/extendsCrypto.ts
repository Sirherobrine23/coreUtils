import { Readable as streamReadable, Duplex as streamDuplex } from "node:stream";
import { ReadStream as fsReadStream } from "node:fs";
import crypto from "node:crypto";

/**
* Create hash string for sha256 and md5 (md5sum) and return Object with hash strings.
*
* @param stream - Buffer, StreamReadable or fsReadStream
* @param Hash - Encoding hash
* @param streamWait - function to wait stream, @default new Promise(done => Buffer.isBuffer(stream) ? done() : stream.once("end", done))
* @returns
*/
export async function createSHA256_MD5(stream: streamReadable|fsReadStream|streamDuplex|Buffer, Hash: "both", streamWait?: Promise<void>): Promise<{sha256: string, md5: string}>;
/**
* Create hash string for sha256 or md5 (md5sum) and return hash string.
*
* @param stream - Buffer, StreamReadable or fsReadStream
* @param Hash - Encoding hash
* @param streamWait - function to wait stream, @default new Promise(done => Buffer.isBuffer(stream) ? done() : stream.once("end", done))
* @returns
*/
export async function createSHA256_MD5(stream: streamReadable|fsReadStream|streamDuplex|Buffer, Hash: "sha256"|"md5", streamWait?: Promise<void>): Promise<string>;
/**
* Create hash string for sha256 and md5 (md5sum) and return hash string or Object with hash strings.
*
* @param stream - Buffer, StreamReadable or fsReadStream
* @param Hash - Encoding hash
* @param streamWait - function to wait stream, @default new Promise(done => Buffer.isBuffer(stream) ? done() : stream.once("end", done))
* @returns
*/
export async function createSHA256_MD5(stream: streamReadable|fsReadStream|streamDuplex|Buffer, Hash: "sha256"|"md5"|"both" = "both", streamWait: Promise<void> = new Promise<void>(done => Buffer.isBuffer(stream) ? done() : stream.once("end", done))): Promise<string|{sha256: string, md5: string}> {
  if (!((["sha256", "md5", "both"]).includes(Hash))) Hash = "both";
  const hashObject: {sha256?: crypto.Hash, md5?: crypto.Hash} = {};
  if (Hash === "sha256"||Hash === "both") hashObject.sha256 = crypto.createHash("sha256");
  if (Hash === "md5"||Hash === "both") hashObject.md5 = crypto.createHash("md5");

  if (Buffer.isBuffer(stream)) Object.keys(hashObject).forEach(() => hashObject[Hash] = hashObject[Hash].update(stream));
  else stream.on("data", data => Object.keys(hashObject).forEach(() => hashObject[Hash] = hashObject[Hash].update(data)));

  // Wait promise if exists
  if (streamWait) await streamWait;

  return Hash === "both" ? {sha256: hashObject.sha256?.digest("hex"), md5: hashObject.md5?.digest("hex")} : hashObject[Hash].digest("hex");
}