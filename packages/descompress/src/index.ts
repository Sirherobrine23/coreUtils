import { peek } from "./peek.js";
import stream from "stream";
import bzip2 from "unbzip2-stream";
import zstd from "@sirherobrine23/cppzst";
import zlib from "zlib";
import lzma from "lzma-native";

// Detect compression
export const isCompress = {
  deflate: (buf: Buffer) => ((buf[0] === 0x78) && (buf[1] === 1 || buf[1] === 0x9c || buf[1] === 0xda)),
  bzip2: (buf: Buffer) => ((buf[0] === 0x5A) && (buf[1] === 0x42) && (buf[3] === 0x68) && (buf[4] === 0x41) && (buf[5] === 0x31) && (buf[6] === 0x26) && (buf[7] === 0x59) && (buf[8] === 0x59) && (buf[9] === 0x53)),
  gzip: (buf: Buffer) => (buf[0] === 0x1F && (buf[1] === 0x8B) && (buf[2] === 0x08)),
  zst: (buf: Buffer) => ((buf[0] === 0xB5) && (buf[1] === 0x28) && (buf[2] === 0xFD) && (buf[3] === 0x2F)),
  xz: (buf: Buffer) => ((buf[0] === 0xFD) && (buf[1] === 0x37) && (buf[2] === 0x7A) && (buf[3] === 0x58) && (buf[4] === 0x5A) && (buf[5] === 0x00)),
}

// Default function
export default decompressStream;

export type decompressConfig = {
  deflate?: zlib.ZlibOptions;
  gzip?: zlib.ZlibOptions;
  xz?: lzma.LzmaOptions;
  zstd?: zstd.ZstdOptions;
}

/**
 * auto detect compress if is match to Xz/Lzma, gzip, bzip2, Zstd (Zstandard) or deflate pipe and decompress else echo Buffer.
 *
 * @param config - Set targets config
 */
export function decompressStream(config?: decompressConfig) {
  return peek({newLine: false, maxBuffer: 16}, async (data, swap) => {
    if (isCompress.deflate(data)) return swap(null, zlib.createInflate(config?.deflate));
    else if (isCompress.bzip2(data)) return swap(null, bzip2());
    else if (isCompress.gzip(data)) return swap(null, zlib.createGunzip(config?.gzip));
    else if (isCompress.xz(data)) return swap(null, lzma.createDecompressor(config?.xz));
    else if (isCompress.zst(data)) return swap(null, zstd.decompressStream(config?.zstd));
    swap(null, new stream.PassThrough());
  });
}

/**
 * Compressors avaible in this package.
 */
export type Compressors = Exclude<"passThrough"|keyof typeof isCompress, "bzip2">;

/**
 * Create compress to avaible compressos
 *
 * @param target - Compress target
 * @param options - Target options
 * @returns Transform stream
 */
export function compressStream<T extends Compressors, P extends (T extends "xz" ? lzma.LzmaOptions : T extends "zst" ? zstd.ZstdOptions : T extends "passThrough" ? never : zlib.ZlibOptions)>(target: T, options?: P): stream.Transform {
  if (target === "xz") return lzma.createCompressor(options as lzma.LzmaOptions);
  else if (target === "deflate") return zlib.createDeflate(options as zlib.ZlibOptions);
  else if (target === "gzip") return zlib.createGzip(options as zlib.ZlibOptions);
  else if (target === "zst") return zstd.compressStream(options as zstd.ZstdOptions);
  else if (target === "passThrough") return new stream.PassThrough();
  throw new Error("Target not avaible!");
}