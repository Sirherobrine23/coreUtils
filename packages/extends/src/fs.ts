import { Stats, createWriteStream } from "node:fs";
import { randomBytes } from "node:crypto";
import { finished } from "node:stream/promises";
import stream from "node:stream";
import path from "node:path";
import fs from "node:fs/promises";

export type dirRecursive = {path: string, stat: Stats};

export async function exists(filePath: string) {
  return fs.access(path.resolve(filePath)).then(() => true).catch(() => false);
}

export async function isDirectory(filePath: string) {
  if (!await exists(filePath)) return false;
  try {
    return (await fs.lstat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

export async function isFile(filePath: string) {
  if (!await exists(filePath)) return false;
  try {
    return (await fs.lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

export type fileInfo = {
  path: string,
  type: "file"|"directory"|"symbolicLink"|"unknown",
  realPath: string,
  relaType: "file"|"directory"|"symbolicLink"|"unknown",
  size: number,
  mtime: Date,
  mode?: number,
  gid?: number,
  uid?: number,
};

export async function readdir(options: string): Promise<string[]>;
export async function readdir(options: {folderPath: string|string[], filter?: (path: string, stat: Stats) => boolean|Promise<boolean>}): Promise<string[]>;
export async function readdir(options: {folderPath: string|string[], filter?: (path: string, stat: Stats) => boolean|Promise<boolean>, withInfo: true, }): Promise<fileInfo[]>;
export async function readdir(options: string|{folderPath: string|string[], filter?: (path: string, stat: Stats) => boolean|Promise<boolean>, withInfo?: boolean, }): Promise<(string|fileInfo)[]> {
  if (typeof options === "string") return readdir({folderPath: options});
  if (typeof options.folderPath !== "string") return (await Promise.all(options.folderPath.map(folder => readdir({...options, folderPath: folder})))).flat();
  const resolvedPath = path.resolve(options.folderPath);
  if (!await exists(resolvedPath)) throw new Error("Folder not exists");
  if (await isFile(resolvedPath)) {
    if (!options.withInfo) return [resolvedPath];
    const stat = await fs.stat(resolvedPath);
    const relaStat = await fs.stat(await fs.realpath(resolvedPath));
    stat.mode
    return [
      {
        path: resolvedPath,
        type: stat.isFile()?"file":stat.isDirectory()?"directory":stat.isSymbolicLink()?"symbolicLink":"unknown",
        realPath: await fs.realpath(resolvedPath),
        relaType: relaStat.isFile()?"file":relaStat.isDirectory()?"directory":relaStat.isSymbolicLink()?"symbolicLink":"unknown",
        size: stat.size,
        mtime: stat.mtime,
        uid: stat.uid,
        gid: stat.gid,
        mode: stat.mode,
      }
    ];
  }
  const info = (await Promise.all((await fs.readdir(resolvedPath)).map(async folder => {
    const folderPath = path.join(resolvedPath, folder);
    if (options.filter && !(await options.filter(folderPath, await fs.stat(folderPath)))) return [];
    if (isDirectory(folderPath)) return readdir({...options, folderPath: folderPath});
    if (!options.withInfo) return folderPath;
    const stat = await fs.stat(folderPath);
    const relaStat = await fs.stat(await fs.realpath(folderPath));
    return {
      path: folderPath,
      type: stat.isFile()?"file":stat.isDirectory()?"directory":stat.isSymbolicLink()?"symbolicLink":"unknown",
      realPath: await fs.realpath(folderPath),
      relaType: relaStat.isFile()?"file":relaStat.isDirectory()?"directory":relaStat.isSymbolicLink()?"symbolicLink":"unknown",
      size: stat.size,
      mtime: stat.mtime,
      uid: stat.uid,
      gid: stat.gid,
      mode: stat.mode,
    };
  })));
  return info.map(d => Array.isArray(d)?d.flat():d).flat() as any;
}

export interface fileData {
  path: string;
  fullPath: string;
  type: "file"|"directory"|"blockDevice"|"characterDevice"|"fifo"|"socket"|"symbolicLink";
  realPath?: string;
  size?: number;
  info: {
    mtime: Date;
    uid: number;
    gid: number;
    mode: number;
  }
}

export type filterCallback = (relativePath: string, stats: Stats, fullPath: string) => boolean|Promise<boolean>;

export async function readdirV2(folderPath: string, withStats: true, filter: filterCallback): Promise<fileData[]>;
export async function readdirV2(folderPath: string, withStats: true): Promise<fileData[]>;
export async function readdirV2(folderPath: string, filter: filterCallback): Promise<string[]>;
export async function readdirV2(folderPath: string): Promise<string[]>;
export async function readdirV2(folderPath: string, ...args: (boolean|filterCallback)[]): Promise<(fileData|string)[]> {
  let withStats: boolean = args.find(f => typeof f === "boolean") as any;
  let filter: filterCallback = (args.find(c => typeof c === "function") as any);
  withStats ??= false
  filter ??= () => true;

  const filesArray: (fileData|string)[] = [];
  async function read(fpath: string) {
    if (!(await Promise.resolve().then(async () => filter(path.relative(folderPath, fpath), await fs.lstat(fpath), fpath)).then(data => !!data))) return;
    if (!withStats) filesArray.push(fpath);
    else {
      const stat = await fs.lstat(fpath);
      const d: fileData = {
        path: path.relative(folderPath, fpath),
        fullPath: fpath,
        type: stat.isBlockDevice() ? "blockDevice" : stat.isCharacterDevice() ? "characterDevice" : stat.isFIFO() ? "fifo" : stat.isSocket() ? "socket" : stat.isSymbolicLink() ? "symbolicLink" :  stat.isDirectory() ? "directory" : "file",
        info: {
          mtime: stat.mtime,
          gid: stat.gid,
          uid: stat.uid,
          mode: stat.mode
        }
      }
      if (d.type === "symbolicLink") d.realPath = await fs.realpath(fpath);
      if (d.type !== "directory") d.size = stat.size
      filesArray.push(d);
    }
    if (await isDirectory(fpath)) await Promise.all((await fs.readdir(fpath)).map(async f => read(path.join(fpath, f))));
  }
  await read(path.resolve(folderPath));
  return filesArray;
}

export async function createRandomFile(filePath: string, fileSize: number) {
  if (fileSize < 0 || (isNaN(fileSize)||fileSize === Infinity)) throw new Error("Require positive file size and not Infinity");
  const str = createWriteStream(filePath);
  (new stream.Readable({
    emitClose: true,
    highWaterMark: 32,
    read() {
      if (fileSize > 0) {
        const dtr = randomBytes(Math.min(32, fileSize));
        fileSize = fileSize - dtr.byteLength;
        return this.push(dtr);
      }
      return this.push(null);
    },
  })).pipe(str);
  await finished(str);
  return fs.lstat(filePath);
}