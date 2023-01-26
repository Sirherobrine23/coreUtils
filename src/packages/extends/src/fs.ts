import { Stats } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

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
    return [
      {
        path: resolvedPath,
        type: stat.isFile()?"file":stat.isDirectory()?"directory":stat.isSymbolicLink()?"symbolicLink":"unknown",
        realPath: await fs.realpath(resolvedPath),
        relaType: relaStat.isFile()?"file":relaStat.isDirectory()?"directory":relaStat.isSymbolicLink()?"symbolicLink":"unknown",
        size: stat.size,
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
    };
  })));
  return info.map(d => Array.isArray(d)?d.flat():d).flat() as any;
}