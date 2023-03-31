import { PassThrough, Transform } from "stream";
import duplexify from "duplexify";

function isObject(data: Buffer) {
  return !Buffer.isBuffer(data) && typeof data !== 'string';
}

export interface options {
  maxBuffer?: number;
  newLine?: boolean;
  strict?: any
}

export type onpeek = (data: Buffer, swap: (err?: any, str?: Transform) => void) => void

export function peek(opts: options, onpeek: onpeek): duplexify.Duplexify;
export function peek(onpeek: onpeek): duplexify.Duplexify;
export function peek(opts: number): duplexify.Duplexify;
export function peek(): duplexify.Duplexify;
export function peek(opts?: options|number|onpeek, onpeek?: onpeek): duplexify.Duplexify {
  if (typeof opts === "number") opts = {maxBuffer: opts};
  if (typeof opts === "function") return peek(null, opts)
  if (!opts) opts = {};
  const maxBuffer = typeof opts.maxBuffer === "number" ? opts.maxBuffer : 65535;
  const newline = opts.newLine !== false;
  const strict = opts.strict;
  const dup = duplexify.obj();
  let buffer = [], bufferSize = 0;

  function onpreend() {
    if (strict) return dup.destroy(new Error('No newline found'));
    dup.cork();
    return ready(Buffer.concat(buffer), null, (err) => err ? dup.destroy(err) : dup.uncork());
  }

  function ready(data: Buffer, overflow, cb) {
    dup.removeListener("preend", onpreend)
    onpeek(data, function(err, parser) {
      if (err) return cb(err)
      dup.setWritable(parser);
      dup.setReadable(parser);
      if (data) parser.write(data);
      if (overflow) parser.write(overflow);
      overflow = buffer = peeker = null; // free the data
      return cb();
    });
  };

  var peeker = new PassThrough({
    highWaterMark: 1,
    transform(chunk, encoding, callback) {
      if (isObject(chunk)) return ready(chunk, null, callback)
      if (!Buffer.isBuffer(chunk)) chunk = Buffer.from(chunk, encoding);

      if (newline) {
        var nl = Array.prototype.indexOf.call(chunk, 10);
        if (nl > 0 && chunk[nl-1] === 13) nl--;
        if (nl > -1) {
          buffer.push(chunk.slice(0, nl))
          return ready(Buffer.concat(buffer), chunk.slice(nl), callback)
        }
      }

      buffer.push(chunk)
      bufferSize += chunk.length

      if (bufferSize < maxBuffer) return callback();
      if (strict) return callback(new Error("No newline found"));
      ready(Buffer.concat(buffer), null, callback)
    },
  });

  dup.on("preend", onpreend);
  dup.setWritable(peeker);
  return dup;
}
