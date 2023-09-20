import { extendsStream } from "@sirherobrine23/extends";
import * as headers from "./header.js";

export class Extract extends extendsStream.Writable<{ entry(header: headers.Header, stream: extendsStream.Readable): void }> {}
/**
 * Parse
 * @returns Write stream
 */
export function extract() {
  return new Extract({
    write(chunk: Buffer, encoding, callback) {
      if (!(Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);

      return callback();
    },
    emitClose: true,
    autoDestroy: true,
    final(callback) {callback()},
  });
}