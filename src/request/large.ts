import { requestOptions, pipeFetch } from "./simples";
import { exists } from "../extendsFs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import tar from "tar";
import AdmZip from "adm-zip";

export async function saveFile(request: string|requestOptions & {filePath?: string}) {
  if (typeof request === "string") request = {url: request};
  const filePath = request.filePath||path.join(os.tmpdir(), `raw_bdscore_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  await pipeFetch({...request, waitFinish: true, stream: fs.createWriteStream(filePath, {autoClose: false})});
  return filePath;
}

export async function zipDownload(request: string|requestOptions) {
  if (typeof request === "string") request = {url: request};
  return new AdmZip(await saveFile(request));
}

export async function tarExtract(request: string|requestOptions & {folderPath?: string}) {
  if (typeof request === "string") request = {url: request};
  const folderToExtract = request.folderPath||path.join(os.tmpdir(), `raw_bdscore_${Date.now()}_${(path.parse(request.url||request.socket?.path||crypto.randomBytes(16).toString("hex"))).name}`);
  if (!await exists(folderToExtract)) await fs.promises.mkdir(folderToExtract, {recursive: true});
  await pipeFetch({
    ...request,
    waitFinish: true,
    stream: tar.extract({
      cwd: folderToExtract,
      noChmod: false,
      noMtime: false,
      preserveOwner: true,
      keep: true,
      p: true
    })
  });
  return folderToExtract
}

const githubAchive = /github.com\/[\S\w]+\/[\S\w]+\/archive\//;
export async function extractZip(request: string|requestOptions & {folderTarget?: string}) {
  const zip = await zipDownload(request);
  if (typeof request === "string") request = {url: request};
  if (!request.folderTarget) request.folderTarget = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bdscoreTmpExtract_"));
  const targetFolder = githubAchive.test(request.url)?await fs.promises.mkdtemp(path.join(os.tmpdir(), "githubRoot_"), "utf8"):request.folderTarget;
  await new Promise<void>((done, reject) => {
    zip.extractAllToAsync(targetFolder, true, true, (err) => {
      if (!err) return done();
      return reject(err);
    })
  });

  if (githubAchive.test(request.url)) {
    const files = await fs.promises.readdir(targetFolder);
    if (files.length === 0) throw new Error("Invalid extract");
    await fs.promises.cp(path.join(targetFolder, files[0]), request.folderTarget, {recursive: true, force: true, preserveTimestamps: true, verbatimSymlinks: true});
    return await fs.promises.rm(targetFolder, {recursive: true, force: true});
  }
  return;
}
