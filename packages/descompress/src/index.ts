import { peek } from "./peek.js";
import stream from "stream";

function isDeflate(buf: Buffer) {
  if (!buf || buf.length < 2) return false;
  return buf[0] === 0x78 && (buf[1] === 1 || buf[1] === 0x9c || buf[1] === 0xda);
}

function isGzip(buf: Buffer) {
	if (!buf || buf.length < 3) return false;
	return buf[0] === 0x1F && buf[1] === 0x8B && buf[2] === 0x08;
}

function isXz(buf: Buffer) {
  if (!buf || buf.length < 5) return false;
  return (buf[0] === 0xFD) && (buf[1] === 0x37) && (buf[2] === 0x7A) && (buf[3] === 0x58) && (buf[4] === 0x5A);
}

export default decompress;
/**
 * auto detect compress if is match to Xz/Lzma, gzip or deflate pipe and decompress else echo Buffer
 */
export function decompress() {
  return peek({newLine: false, maxBuffer: 10}, async (data, swap) => {
    if (isDeflate(data)) import("zlib").then(({createInflate}) => swap(null, createInflate())).catch(err => swap(err));
    else if (isGzip(data)) import("zlib").then(({createGunzip}) => swap(null, createGunzip())).catch(err => swap(err));
    else if (isXz(data)) import("lzma-native").then(({createDecompressor}) => swap(null, createDecompressor())).catch(err => swap(err));
    else swap(null, new stream.PassThrough());
  });
}