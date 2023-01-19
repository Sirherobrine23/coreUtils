import { requestOptions, streamRequest } from "./simples.js";
import { createHashAsync } from "../extendsCrypto.js";
import extendFs from "../extendsFs.js";
import AdmZip from "adm-zip";
import path from "node:path";
import tar from "tar";
import fs from "node:fs";
import os from "node:os";

export async function saveFile(request: requestOptions["url"]|requestOptions & {filePath?: string}) {
  let filePath = path.join(os.tmpdir(), "save_"+(await createHashAsync(Buffer.from(JSON.stringify(request)), "sha256")).sha256);
  if (!(request instanceof URL||typeof request === "string")) if (await extendFs.exists(request.filePath)) filePath = request.filePath;
  const piped = (await streamRequest(request)).pipe(fs.createWriteStream(filePath));
  await new Promise<void>((done, reject) => piped.once("close", done).on("error", reject));
  return filePath;
}

export async function zipDownload(request: requestOptions["url"]|requestOptions) {
  return new AdmZip(await saveFile(request));
}

export function Tar(request: requestOptions["url"]|requestOptions) {
  async function extract(): Promise<tar.Parse>;
  async function extract(folderPath: string): Promise<string>;
  async function extract(folderPath?: string) {
    if (typeof folderPath === "string") {
      if (typeof folderPath === "string") {
        if (!await extendFs.exists(folderPath)) await fs.promises.mkdir(folderPath, {recursive: true});
      }
      const stream = await streamRequest(request);
      const piped = stream.pipe(tar.extract({cwd: folderPath}));
      await new Promise<void>(done => piped.once("close", done));
      return folderPath;
    }
    return streamRequest(request).then(res => res.pipe(tar.list()));
  }

  async function listFiles(): Promise<{path: string, size: number}[]>;
  async function listFiles(callback: (data: tar.ReadEntry) => void): Promise<void>;
  async function listFiles(callback?: (data: tar.ReadEntry) => void): Promise<{path: string, size: number}[]|void> {
    const piped = (await streamRequest(request)).pipe(tar.list());
    let files: void|{path: string, size: number}[];
    if (typeof callback === "function") piped.on("entry", entry => callback(entry));
    else {
      files = [];
      piped.on("entry", entry => typeof files === "undefined" ? null : files.push({
        path: entry.path,
        size: entry.size
      }));
    }
    await new Promise<void>(done => piped.on("end", done));
    return files;
  }

  const method = ((typeof request === "string"||request instanceof URL) ? "GET" : request?.method)||"GET";
  async function compress(folderPath: string) {
    if ((["get", "GET"]).includes(method)) throw new TypeError("Compress no avaible to GET method!");
    if (!folderPath) throw new TypeError("Required folder!");
    if (!await extendFs.exists(folderPath)) throw new Error("Folder not exists to compress");
    await streamRequest({
      ...(request as requestOptions),
      body: tar.create({
        cwd: folderPath,
        gzip: true
      }, [])
    });
  }

  return {
    extract,
    listFiles,
    compress
  };
}

export async function tarExtract(request: requestOptions["url"]|requestOptions & {folderPath?: string}) {
  let folderPath = path.join(os.tmpdir(), "tar_extract_"+(await createHashAsync(Buffer.from(JSON.stringify(request)), "sha256")).sha256);
  if (!(request instanceof URL||typeof request === "string")) if (await extendFs.exists(request.folderPath)) folderPath = request.folderPath;
  return Tar(request).extract(folderPath);
}

export async function extractZip(request: requestOptions["url"]|requestOptions & {folderTarget?: string}) {
  let folderPath = path.join(os.tmpdir(), "zip_ex_"+(await createHashAsync(Buffer.from(JSON.stringify(request)), "sha256")).sha256);
  if (!(request instanceof URL||typeof request === "string")) if (await extendFs.exists(request.folderTarget)) folderPath = request.folderTarget;
  const zip = await zipDownload(request);
  await new Promise<void>((done, reject) => zip.extractAllToAsync(folderPath, true, true, err => err ? reject(err) : done()));

}
