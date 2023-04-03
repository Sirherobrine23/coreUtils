import { peek } from "./peek.js";
import stream from "stream";
import bzip2 from "unbzip2-stream";
import zlib from "zlib";
import lzma from "lzma-native";

export type compressAvaible = Exclude<"passThrough"|keyof typeof isCompress, "bzip2">;
const isCompress = {
  deflate: (buf: Buffer) => ((buf[0] === 0x78) && (buf[1] === 1 || buf[1] === 0x9c || buf[1] === 0xda)),
  bzip2: (buf: Buffer) => ((buf[0] === 0x5A) && (buf[1] === 0x42) && (buf[3] === 0x68) && (buf[4] === 0x41) && (buf[5] === 0x31) && (buf[6] === 0x26) && (buf[7] === 0x59) && (buf[8] === 0x59) && (buf[9] === 0x53)),
  gzip: (buf: Buffer) => (buf[0] === 0x1F && (buf[1] === 0x8B) && (buf[2] === 0x08)),
  // zst: (buf: Buffer) => ((buf[0] === 0xB5) && (buf[1] === 0x28) && (buf[2] === 0xFD) && (buf[3] === 0x2F)),
  xz: (buf: Buffer) => ((buf[0] === 0xFD) && (buf[1] === 0x37) && (buf[2] === 0x7A) && (buf[3] === 0x58) && (buf[4] === 0x5A)),
}

export default decompress;
/**
 * auto detect compress if is match to Xz/Lzma, gzip, bzip2 or deflate pipe and decompress else echo Buffer
 */
export function decompress() {
  return peek({newLine: false, maxBuffer: 16}, async (data, swap) => {
    if (isCompress.deflate(data)) return swap(null, zlib.createInflate());
    else if (isCompress.bzip2(data)) return swap(null, bzip2());
    else if (isCompress.gzip(data)) return swap(null, zlib.createGunzip());
    else if (isCompress.xz(data)) return swap(null, lzma.createDecompressor());
    swap(null, new stream.PassThrough());
  });
}

export function compress(target: compressAvaible): stream.Transform {
  if (target === "deflate") return zlib.createDeflate();
  else if (target === "gzip") return zlib.createGzip();
  else if (target === "xz") return lzma.createCompressor();
  else if (target === "passThrough") return new stream.PassThrough();
  throw new Error("Target not avaible!");
}