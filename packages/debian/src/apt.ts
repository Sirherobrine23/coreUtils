import { parseControl, debianControl } from "./deb.js";
import { finished } from "stream/promises";
import coreHTTP from "@sirherobrine23/http";
import openpgp from "openpgp";
import stream from "stream";
import path from "path";
import decompress from "@sirherobrine23/decompress";

type Sums = {[T in ("MD5Sum"|"SHA512"|"SHA256"|"SHA1")]?: {hash: string, size: number, path: string}[]};
export interface packageObject extends Sums {
  Origin?: string;
  Lebel?: string;
  Suite?: string;
  Codename?: string;
  Changelogs?: string;
  Date?:  Date;
  "Valid-Until"?: Date;
  "Acquire-By-Hash"?: boolean;
  "No-Support-for-Architecture-all"?: string;
  Architectures?: string[];
  Components?: string[];
  Description?: string;
}

export function parseRelease<T = packageObject>(sourceFile: string): T {
  /* pretty tabs */ sourceFile = sourceFile.replace(/\t/gi, "  ");
  let previus: string;
  const obj = sourceFile.split("\n").reduce((acc, line) => {
    if (line.startsWith(" ") && previus) {
      if (typeof acc[previus] === "string") acc[previus] = [acc[previus].trim()];
      acc[previus].push(line.trim())
      return acc;
    }
    const indexDots = line.indexOf(":");
    if (indexDots === -1) return acc;
    previus = undefined
    acc[(previus = line.slice(0, indexDots))] = line.slice(indexDots+1).trim();
    if (!(acc[previus])) acc[previus] = [];
    return acc;
  }, {} as any);
  Object.keys(obj).forEach(key => {
    if (obj[key] === "yes"||obj[key] === "no") obj[key] = obj[key] === "yes";
    else if ((new Date(obj[key])).toString() !== "Invalid Date") obj[key] = new Date(obj[key]);
    else if (Array.isArray(obj[key])) {
      obj[key] = obj[key].map((line: string) => {
        const hash = line.slice(0, line.indexOf(" "));
        line = line.slice(line.indexOf(" ")).trim();
        const size = Number(line.slice(0, line.indexOf(" ")).trim());
        line = line.slice(line.indexOf(" ")).trim();
        return {
          hash,
          size,
          path: line,
        };
      });
    }
  });
  if (obj.Architectures) obj.Architectures = obj.Architectures.split(/\s+/);
  if (obj.Components) obj.Components = obj.Components.split(/\s+/);
  return obj;
}

export type sourceList = {
  type: "source"|"packages",
  src: string,
  distname: string,
  components: string[],
  options?: {[keyName: string]: string}
}[];

export function parseSourceList(sourceFile: string): sourceList {
  if (typeof sourceFile !== "string") throw new TypeError("invalid sourceFile");
  const sourceLines = sourceFile.replace(/\t/gi, "  ").split("\n").filter(line => !(line.trim().startsWith("#") || !line.trim()));
  return sourceLines.reduce((acc, line) => {
    if (line.startsWith("deb")) {
      const isSource = line.startsWith("deb-src"); line = line.slice(line.indexOf(" ")).trim();
      let options: any, optionsIndexof: number;
      if (line.startsWith("[") && ((optionsIndexof = line.indexOf("]")) !== -1)) {options = line.slice(1, optionsIndexof).trim(); line = line.slice(optionsIndexof+1).trim();}
      const src = line.slice(0, line.indexOf(" ")).trim(); line = line.slice(line.indexOf(" ")).trim();
      const dist = line.slice(0, line.indexOf(" ")).trim(); line = line.slice(line.indexOf(" ")).trim();
      if (typeof options === "string") {
        let optionsLine: string = options; options = {};
        while (optionsLine.trim()) {
          const key = optionsLine.slice(0, optionsLine.indexOf("="));
          optionsLine = optionsLine.slice(optionsLine.indexOf("=")+1).trim();
          options[key] = "";
          const spaceIndex = optionsLine.indexOf(" ");
          if (spaceIndex === -1) {
            options[key] = optionsLine;
            break;
          }
          options[key] = optionsLine.slice(0, spaceIndex).trim();
          optionsLine = optionsLine.slice(spaceIndex).trim();
        }
      }
      acc.push({
        type: isSource ? "source" : "packages",
        src,
        distname: dist,
        components: line.split(/\s+/gi),
        ...((typeof options !== "undefined") ? {options} : {}),
      });
    }
    return acc;
  }, [] as sourceList);
}

export interface packageStream extends stream.Writable {
  on(event: "close", listener: () => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: stream.Readable) => void): this;
  on(event: "unpipe", listener: (src: stream.Readable) => void): this;
  on(event: "entry", listener: (control: debianControl) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: "close", listener: () => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: stream.Readable) => void): this;
  once(event: "unpipe", listener: (src: stream.Readable) => void): this;
  once(event: "entry", listener: (control: debianControl) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function parsePackages(): packageStream {
  let oldBuffer: Buffer;
  return new stream.Writable({
    write(chunk: Buffer, encoding, callback) {
      if (!(Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);
      if (oldBuffer) {chunk = Buffer.concat([oldBuffer, chunk]); oldBuffer = null;}
      for (let i = 0; i < chunk.length; i++) {
        if ((chunk[i] === 0x0A) && (chunk[i + 1] === 0x0A)) {
          const controlBuf = chunk.subarray(0, i);
          chunk = chunk.subarray(i);
          try {this.emit("entry", parseControl(controlBuf));} catch {}
          i = 0;
          continue;
        }
      }
      if (chunk.length > 0) oldBuffer = chunk;
      callback();
    },
    final(callback) {
      if (oldBuffer) try {this.emit("entry", parseControl(oldBuffer));} catch {}
      oldBuffer = null;
      callback();
    }
  });
}

export async function getRepoPackages(aptSrc: sourceList) {
  const pkgObj: {[src: string]: {[distName: string]: {[componentName: string]: {[arch: string]: debianControl[]}}}} = {};
  for (const target of aptSrc) {
    const main_url = new URL(target.src);
    const rel = new URL(main_url);
    rel.pathname = path.posix.join(rel.pathname, "dists", target.distname);
    const release = parseRelease(await coreHTTP.bufferRequestBody(rel.toString()+"/InRelease").then(async data => (await openpgp.readCleartextMessage({cleartextMessage: data.toString()})).getText()).catch(() => coreHTTP.bufferRequestBody(rel.toString()+"/Release").then(data => data.toString())));
    for (const Component of release.Components) for (const Arch of release.Architectures) {
      for (const ext of (["", ".gz", ".xz"])) {
        const mainReq = new URL(path.join(rel.pathname, Component, `binary-${Arch}`, `Packages${ext}`), rel);
        try {
          await coreHTTP.streamRequest(mainReq).then(str => finished(str.pipe(decompress()).pipe(parsePackages()).on("entry", entry => {
            pkgObj[target.src] ??= {};
            pkgObj[target.src][target.distname] ??= {};
            pkgObj[target.src][target.distname][Component] ??= {};
            pkgObj[target.src][target.distname][Component][Arch] ??= [];
            pkgObj[target.src][target.distname][Component][Arch].push(entry);
          })));
          break;
        } catch {}
      }
    }
  }

  return pkgObj;
}