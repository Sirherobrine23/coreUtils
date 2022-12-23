import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { format } from "node:util";
import { Decompressor } from "lzma-native";
import { createHashAsync } from "./extendsCrypto.js";
import * as Ar from "./ar.js";
import path from "node:path";
import extendFs from "./extendsFs.js";
import tar from "tar";

export type debianControl = {
  Package: string
  Version: string,
  Maintainer: string,
  Architecture: string,
  "Installed-Size"?: number,
  Depends?: string,
  Homepage?: string,
  Section?: string,
  Priority?: string,
  Size?: number,
  MD5sum?: string,
  SHA256?: string,
  SHA1?: string,
  Description?: string,
};

export function parseControlFile(control: string|Buffer) {
  if (Buffer.isBuffer(control)) control = control.toString();
  const controlObject: {[key: string]: string|number} = {};
  for (const line of control.split(/\r?\n/)) {
    if (/^[\w\S]+:/.test(line)) {
      const [, key, value] = line.match(/^([\w\S]+):(.*)$/);
      controlObject[key.trim()] = value.trim();
    } else {
      controlObject[Object.keys(controlObject).at(-1)] += line;
    }
  }

  // Delete blank keys
  Object.keys(controlObject).forEach((key) => {
    if (controlObject[key].toString().trim().length <= 0) delete controlObject[key];
  });

  // Convert numbers
  Object.keys(controlObject).forEach((key) => {
    if (!isNaN(Number(controlObject[key]))) controlObject[key] = Number(controlObject[key]);
  });
  return controlObject as debianControl;
}

export async function extractControl(fileStream: Readable, fnControl?: (control: debianControl) => void) {
  return new Promise<debianControl>((done, reject) => {
    let fileSize = 0;
    const fileHash = createHashAsync("all", fileStream).catch(reject);
    fileStream.on("data", chunck => fileSize += chunck.length);
    return fileStream.pipe(Ar.createUnpack((info, stream) => {
      if (info.name === "debian-binary") return null;
      if (info.name.includes("control.tar")) {
        if (!(info.name.endsWith(".gz") || info.name.endsWith(".xz"))) return null;
        return (info.name.endsWith(".xz")?stream.pipe(Decompressor()):stream).pipe(tar.list({
          onentry: controlEntry => {
            if (!controlEntry.path.endsWith("control")) return null;
            let controlFile: Buffer;
            return controlEntry.on("data", chunck => controlFile = (!controlFile)?chunck:Buffer.concat([controlFile, chunck])).once("end", () => {
              const control = parseControlFile(controlFile.toString());
              return fileHash.then(hash => {
                if (!hash) return reject(new Error("Hash not gerenate"));
                control.MD5sum = hash.md5;
                control.SHA256 = hash.sha256;
                control.SHA1 = hash.sha1;
                control.Size = fileSize;
                if (fnControl) fnControl(control);
                done(control);
                return control;
              });
            }).on("error", reject);
          }
        }));
      }
      return null;
    }));
  }).catch(err => {
    fileStream.destroy(err);
    throw err;
  });
}

export async function packDeb(folderPath: string) {
  // throw new Error("Not implemented");
  if (!await extendFs.isDirectory(folderPath)) throw new Error(format("'%s' if not directory", folderPath));
  let debianFolder = path.resolve(folderPath, "DEBIAN");
  if (await extendFs.exists(path.resolve(folderPath, "debian"))) debianFolder = path.resolve(folderPath, "debian");
  if (!await extendFs.exists(debianFolder)) throw new Error("debian folder not exists");
  const controlFile = path.resolve(debianFolder, "control");
  if (!await extendFs.exists(controlFile)) throw new Error("control file not exists");

  const pack = Ar.createPack();
  Promise.resolve().then(async () => {
    // control.tar.gz
    const tmpControl = path.resolve(folderPath, "..", "control.tar.gz");
    const tmpData = path.resolve(folderPath, "..", "data.tar.gz");
    if (!((await fs.readFile(controlFile)).toString().endsWith("\n"))) await fs.appendFile(controlFile, "\n");
    const dataFiles = (await fs.readdir(folderPath)).filter(filePath => !(filePath === "DEBIAN"||filePath === "debian"));
    const debianFiles = (await fs.readdir(debianFolder)).filter(filePath => {
      const data = ["changelog", "compat", "control", "copyright", "docs", "rules", "source", "watch"];
      return data.includes(filePath);
    });

    // debian-binary
    const debianBinary = Buffer.from("2.0\n", "utf8");
    await pack.addFile({
      name: "debian-binary",
      size: debianBinary.length,
      time: new Date(),
      owner: 0,
      group: 0,
      mode: 100644
    }, debianBinary);

    await tar.create({
      gzip: true,
      cwd: debianFolder,
      file: tmpControl
    }, debianFiles)
    const controlStats = await fs.stat(controlFile);
    await pack.addFile({
      name: "control.tar.gz",
      size: controlStats.size,
      time: controlStats.mtime,
      mode: 100644,
      owner: 0,
      group: 0,
    }, createReadStream(tmpControl));

    await tar.create({
      gzip: true,
      cwd: folderPath,
      file: tmpData
    }, dataFiles)
    const dataStats = await fs.stat(tmpData);
    await pack.addFile({
      name: "data.tar.gz",
      size: dataStats.size,
      time: dataStats.mtime,
      mode: 100644,
      owner: 0,
      group: 0,
    }, createReadStream(tmpData));

    await fs.rm(tmpControl);
    await fs.rm(tmpData);
    return pack.push(null);
  }).catch(err => pack.emit("error", err));
  return {
    pack,
    wait: async () => new Promise<void>((done, reject) => {
      pack.once("end", done);
      pack.on("error", reject);
    }),
  };
}