import { Stats, createReadStream, createWriteStream } from "node:fs";
import { randomBytesStream } from "./crypto.js";
import { finished } from "node:stream/promises";
import path from "node:path";
import fs from "node:fs/promises";

export { constants, createReadStream, createWriteStream, watchFile } from "node:fs";
export * from "node:fs/promises";
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

export type filterCallback = (relativePath: string, fullPath: string, stats: Stats) => boolean|Promise<boolean>;
export type callback = (relativePath: string, fullPath: string, stats: Stats) => void;
/**
 *
 * @param folderPath - Folder path
 * @param withStats - Add file/folder stats
 * @param filter - Filter function
 * @param callback - File/folder callback
 */
export async function readdirV2(folderPath: string, withStats: true, filter: filterCallback, callback: callback): Promise<void>;
/**
 * List the files and filter them returning an array with the paths and Stats.
 *
 * @param folderPath - Folder path
 * @param withStats - Add file/folder stats
 * @param filter - Filter function
 */
export async function readdirV2(folderPath: string, withStats: true, filter: filterCallback): Promise<fileData[]>;
/**
 * List files and folders recursively returning an array with paths and stats.
 *
 * @param folderPath - Folder path
 * @param withStats - Add file/folder stats
 */
export async function readdirV2(folderPath: string, withStats: true): Promise<fileData[]>;
/**
 * List and filter files and folders recursively returning an array of paths.
 *
 * @param folderPath - Folder path
 * @param filter - Filter function
 */
export async function readdirV2(folderPath: string, filter: filterCallback): Promise<string[]>;
/**
 * List all files in a folder recursively returning an array with the paths.
 * @param folderPath - Folder path
 */
export async function readdirV2(folderPath: string): Promise<string[]>;
export async function readdirV2(folderPath: string, arg0?: boolean|filterCallback, arg1?: filterCallback, arg2?: callback): Promise<void|(fileData|string)[]> {
  let withStats = false, filter: filterCallback = () => true, callback: undefined|callback;
  if (typeof arg0 === "function") filter = arg0;
  else if (typeof arg0 === "boolean") {
    withStats = arg0;
    if (typeof arg1 === "function") filter = arg1;
    if (typeof arg2 === "function") callback = arg2;
  }


  const filesArray: (fileData|string)[] = [];
  async function read(fpath: string): Promise<any> {
    if (!(await Promise.resolve().then(async () => filter(path.relative(folderPath, fpath), fpath, await fs.lstat(fpath))).then(data => !!data))) return;
    if (typeof callback === "function") await fs.lstat(fpath).then(stat => callback(path.relative(folderPath, fpath), fpath, stat));
    else if (!withStats) filesArray.push(fpath);
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
    if (await isDirectory(fpath)) for (const d of await fs.readdir(fpath)) await read(path.join(fpath, d));
  }
  await read(path.resolve(folderPath));
  if (typeof callback !== "function") return filesArray;
}

export async function readFile(filePath: string, options?: {start: number, end: number}) {
  return new Promise<Buffer>((done, reject) => {
    let buf: Buffer[] = [];
    createReadStream(filePath, { start: options?.start, end: options?.end }).on("error", reject).on("data", (data: Buffer) => buf.push(data)).on("close", () => {
      done(Buffer.concat(buf));
      buf = null;
    });
  });
}

export async function createRandomFile(filePath: string, fileSize: number) {
  if (fileSize < 0 || (isNaN(fileSize)||fileSize === Infinity)) throw new Error("Require positive file size and not Infinity");
  const str = createWriteStream(filePath);
  await finished((new randomBytesStream(fileSize)).pipe(str));
  return fs.lstat(filePath);
}
