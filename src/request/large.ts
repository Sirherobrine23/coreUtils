import { requestOptions, pipeFetch } from "./simples.js";
import * as extendFs from "../extendsFs.js";
import stream from "node:stream";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import path from "node:path";
import tar from "tar";
import fs from "node:fs";
import os from "node:os";

export async function saveFile(request: string|requestOptions & {filePath?: string}) {
  if (typeof request === "string") request = {url: request};
  const filePath = request?.filePath||path.join(os.tmpdir(), `raw_bdscore_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  await pipeFetch({...request, waitFinish: true, stream: fs.createWriteStream(filePath, {autoClose: false})});
  return filePath;
}

export async function zipDownload(request: string|requestOptions) {
  if (typeof request === "string") request = {url: request};
  return new AdmZip(await saveFile(request));
}

export function Tar(request: string|requestOptions) {
  async function extract(folderPath: string): Promise<string>;
  async function extract(folderPath: string): Promise<stream.Writable>;
  async function extract(folderPath?: string) {
    if (typeof folderPath === "string") {
      if (!await extendFs.exists(folderPath)) await fs.promises.mkdir(folderPath, {recursive: true});
    }
    const piped = (await pipeFetch(request)).pipe(tar.extract((typeof folderPath === "string" ? {
      cwd: folderPath,
      noChmod: false,
      noMtime: false,
      preserveOwner: true,
      keep: true,
      p: true
    }:{})));
    if (typeof folderPath === "string") {
      await new Promise(done => piped.once("finish", done));
      return folderPath;
    }
    return piped;
  }

  async function listFiles(): Promise<{path: string, size: number}[]>;
  async function listFiles(callback: (data: tar.ReadEntry) => void): Promise<void>;
  async function listFiles(callback?: (data: tar.ReadEntry) => void): Promise<{path: string, size: number}[]|void> {
    const piped = (await pipeFetch(request)).pipe(tar.list());
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

  async function compress(folderPath: string) {
    if (!((["get", "GET"]).includes((typeof request === "string" ? undefined : request?.method)||"GET"))) throw new TypeError("Compress no avaible to GET method!");
    if (!folderPath) throw new TypeError("Required folder!");
    if (!await extendFs.exists(folderPath)) throw new Error("Folder not exists to compress");
    await pipeFetch({
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

export async function tarExtract(request: string|requestOptions & {folderPath?: string}) {
  if (typeof request === "string") request = {url: request};
  const folderToExtract = request.folderPath||path.join(os.tmpdir(), `raw_bdscore_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  await (Tar(request)).extract(folderToExtract);
  return folderToExtract;
}

const githubAchive = /github.com\/[\S\w]+\/[\S\w]+\/archive\//;
export async function extractZip(request: string|requestOptions & {folderTarget?: string}) {
  const zip = await zipDownload(request);
  if (typeof request === "string") request = {url: request};
  if (!request.folderTarget) request.folderTarget = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bdscoreTmpExtract_"));
  const targetFolder = githubAchive.test(request.url)?await fs.promises.mkdtemp(path.join(os.tmpdir(), "githubRoot_"), "utf8"):request.folderTarget;
  await new Promise<void>((done, reject) => zip.extractAllToAsync(targetFolder, true, true, (err) => {
    if (!err) return done();
    return reject(err);
  }));

  if (githubAchive.test(request.url)) {
    const files = await fs.promises.readdir(targetFolder);
    if (files.length === 0) throw new Error("Invalid extract");
    await fs.promises.cp(path.join(targetFolder, files[0]), request.folderTarget, {recursive: true, force: true, preserveTimestamps: true, verbatimSymlinks: true});
    return await fs.promises.rm(targetFolder, {recursive: true, force: true});
  }
  return;
}
