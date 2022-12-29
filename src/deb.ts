import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { Readable, Writable } from "node:stream";
import { Decompressor, Compressor } from "lzma-native";
import { createHashAsync } from "./extendsCrypto.js";
import * as Ar from "./ar.js";
import extendsFs from "./extendsFs.js";
import path from "node:path";
import zlib from "node:zlib";
import tar from "tar";

export type debianControl = {
  Package: string,
  Architecture: string,
  Version: string,
  Priority: string,
  Maintainer?: string,
  Section?: string,
  Origin?: string,
  "Original-Maintainer"?: string,
  Bugs?: string,
  "Installed-Size"?: number,
  Depends?: string,
  Suggests?: string,
  Filename?: string,
  Size?: number,
  MD5sum?: string,
  SHA1?: string,
  SHA256?: string,
  Homepage?: string,
  Description?: string,
  Task?: string
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

  const data = controlObject as debianControl;
  data.Priority = data.Priority || "standard";
  return data;
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
                control.SHA1 = hash.sha1;
                control.SHA256 = hash.sha256;
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

export type packOptions = {
  cwd: string,
  outputFile?: string,
  compress?: "gzip"|"xz",
  getStream?: boolean,
};

async function createDpkgAr(out: string, control: string, data: string) {
  const timestamp = (Date.now()/1000).toFixed();
  const fd = await fs.open(out, "w");
  await fd.write(Buffer.from("213C617263683E0A", "hex"));

  // debian-binary
  const version = Buffer.from("2.0\n");
  await fd.write(Buffer.concat([
    Ar.createHead("debian-binary", {mtime: timestamp, size: version.length, mode: "100644"}),
    version
  ]));

  // control.tar
  await fd.write(Ar.createHead(control, {mtime: timestamp, size: 0, mode: "100644"}));
  const readControl = createReadStream(control);
  await new Promise((done, rejects) => {
    readControl.pipe(new Writable({
      write: (chunck, _, cb) => fd.write(chunck).then(() => cb()).catch(cb),
      destroy(error, callback) {
        if (error) rejects(error);
        callback(error);
        setTimeout(() => done(null), 100);
      },
    }));
  });

  // data.tar
  await fd.write(Ar.createHead(data, {mtime: timestamp, size: 0, mode: "100644"}));
  const readData = createReadStream(data);
  await new Promise((done, rejects) => {
    readData.pipe(new Writable({
      write: (chunck, _, cb) => fd.write(chunck).then(() => cb()).catch(cb),
      destroy(error, callback) {
        if (error) rejects(error);
        callback(error);
        setTimeout(() => done(null), 100);
      },
    }));
  });
}

export async function packDeb(options: packOptions) {
  const control = parseControlFile(await fs.readFile(path.join(options.cwd, "DEBIAN", "control"), "utf8"));
  if (!options.outputFile) options.outputFile = `${options.cwd}.deb`;
  const tmpFolder = path.resolve(options.cwd, "..", `tmp-${control.Package}-${control.Version}-${control.Architecture ?? "all"}`);
  if (!await extendsFs.exists(tmpFolder)) await fs.mkdir(tmpFolder, {recursive: true});
  const debianPath = await extendsFs.exists(path.join(options.cwd, "DEBIAN"))?path.join(options.cwd, "DEBIAN"):path.join(options.cwd, "debian");

  const controlFiles = (await fs.readdir(debianPath)).filter(file => {if (file === "control") return true; if (file === "md5sums") return true; if (file === "conffiles") return true; if (file === "preinst") return true; if (file === "postinst") return true; if (file === "prerm") return true; if (file === "postrm") return true; return false;});
  let controlFile = path.join(tmpFolder, "control.tar");
  await tar.create({
    cwd: debianPath,
    gzip: false,
    file: controlFile,
    mode: 100644,
    prefix: "./",
    portable: true
  }, controlFiles);

  if ((options.compress) === "gzip") {
    const gzip = createReadStream(controlFile).pipe(zlib.createGzip()).pipe(createWriteStream(controlFile+".gz"));
    await new Promise((done, reject) => gzip.once("close", done).once("error", reject));
    await fs.rm(controlFile)
    controlFile += ".gz";
  } else if (options.compress === "xz") {
    const xz = createReadStream(controlFile).pipe(Compressor()).pipe(createWriteStream(controlFile+".xz"));
    await new Promise((done, reject) => xz.once("close", done).once("error", reject));
    await fs.rm(controlFile)
    controlFile += ".xz";
  }

  const dataFiles = (await fs.readdir(options.cwd)).filter(file => !(["DEBIAN", "debian"].includes(file)));
  let dataFile = path.join(tmpFolder, "data.tar");
  await tar.create({
    cwd: options.cwd,
    gzip: false,
    file: dataFile,
    portable: true,
    mode: 100644
  }, dataFiles);
  if ((options.compress) === "gzip") {
    const gzip = createReadStream(dataFile).pipe(zlib.createGzip()).pipe(createWriteStream(dataFile+".gz"));
    await new Promise((done, reject) => gzip.once("close", done).once("error", reject));
    await fs.rm(dataFile);
    dataFile += ".gz";
  } else if (options.compress === "xz") {
    const xz = createReadStream(dataFile).pipe(Compressor()).pipe(createWriteStream(dataFile+".xz"));
    await new Promise((done, reject) => xz.once("close", done).once("error", reject));
    await fs.rm(dataFile);
    dataFile += ".xz";
  }

  // Create deb file
  await createDpkgAr(options.outputFile, controlFile, dataFile);

  // Remove tmp folder
  console.log(tmpFolder);
  // await fs.rm(tmpFolder, {recursive: true, force: true});

  // get return
  if (options.getStream) return createReadStream(options.outputFile);
  return options.outputFile;
}