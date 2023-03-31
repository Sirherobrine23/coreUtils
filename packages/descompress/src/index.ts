import { peek } from "./peek.js";
import stream from "stream";
const isCompress = {
  deflate: (buf: Buffer) => ((buf[0] === 0x78) && (buf[1] === 1 || buf[1] === 0x9c || buf[1] === 0xda)),
  bzip2: (buf: Buffer) => ((buf[0] === 0x5A) && (buf[1] === 0x42) && (buf[3] === 0x68) && (buf[4] === 0x41) && (buf[5] === 0x31) && (buf[6] === 0x26) && (buf[7] === 0x59) && (buf[8] === 0x59) && (buf[9] === 0x53)),
  gzip: (buf: Buffer) => (buf[0] === 0x1F && (buf[1] === 0x8B) && (buf[2] === 0x08)),
  zst: (buf: Buffer) => ((buf[0] === 0xB5) && (buf[1] === 0x28) && (buf[2] === 0xFD) && (buf[3] === 0x2F)),
  xz: (buf: Buffer) => ((buf[0] === 0xFD) && (buf[1] === 0x37) && (buf[2] === 0x7A) && (buf[3] === 0x58) && (buf[4] === 0x5A)),
}

export default decompress;
/**
 * auto detect compress if is match to Xz/Lzma, gzip, bzip2 or deflate pipe and decompress else echo Buffer
 */
export function decompress() {
  return peek({newLine: false, maxBuffer: 16}, async (data, swap) => {
    if (isCompress.deflate(data)) return import("zlib").then(({createInflate}) => swap(null, createInflate())).catch(err => swap(err));
    else if (isCompress.bzip2(data)) return import("unbzip2-stream").then(({default: bzip}) => swap(null, bzip())).catch(err => swap(err));
    else if (isCompress.gzip(data)) return import("zlib").then(({createGunzip}) => swap(null, createGunzip())).catch(err => swap(err));
    else if (isCompress.zst(data)) return import("@xingrz/cppzst").then(({decompressStream}) => swap(null, decompressStream())).catch(err => swap(err));
    else if (isCompress.xz(data)) return import("lzma-native").then(({createDecompressor}) => swap(null, createDecompressor())).catch(err => swap(err));
    swap(null, new stream.PassThrough());
  });
}

export type compressAvaible = "deflate"|"gzip"|"zst"|"xz";

/**
 * Create compress stream
 */
export function compress(target: compressAvaible) {
  return peek({newLine: false, maxBuffer: 1}, async (_data, swap) => {
    if (target === "deflate") return import("zlib").then(({createDeflate}) => swap(null, createDeflate())).catch(err => swap(err));
    else if (target === "gzip") return import("zlib").then(({createGzip}) => swap(null, createGzip())).catch(err => swap(err));
    else if (target === "zst") return import("@xingrz/cppzst").then(({compressStream}) => swap(null, compressStream())).catch(err => swap(err));
    else if (target === "xz") return import("lzma-native").then(({createCompressor}) => swap(null, createCompressor())).catch(err => swap(err));
    swap(new Error("Target not avaible!"));
  });
}