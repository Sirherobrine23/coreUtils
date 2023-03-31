import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { extendsCrypto, extendsFS } from "@sirherobrine23/extends";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import decompress, { compress, compressAvaible } from "@sirherobrine23/decompress";
import Ar, { createStream } from "@sirherobrine23/ar";
import tarStream from "tar-stream";
import path from "node:path";

/** Debian packages, get from `dpkg-architecture --list -L | grep 'musl-linux-' | sed 's|musl-linux-||g' | xargs`, version 1.21.1, Ubuntu */
export type debianArch = "all"|"armhf"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";

export interface debianControl {
  [anyKey: string]: string|number|boolean,
  Package: string,
  Architecture: debianArch,
  Version: string,
  Priority: string,
  Maintainer?: string,
  Section?: string,
  Origin?: string,
  "Original-Maintainer"?: string,
  "Installed-Size"?: number,
  Bugs?: string,
  Depends?: string,
  Suggests?: string,
  Filename?: string,
  Size?: number,
  MD5sum?: string,
  SHA512?: string,
  SHA256?: string,
  SHA1?: string,
  Homepage?: string,
  Description?: string,
  Task?: string,
};

function findLastChar(data: Buffer) {
  for (let i = data.length; i >= 0; i--) if (data[i] !== 0x20) return i;
  return -1;
}

/**
 *
 * @param control - Control buffer file
 * @returns
 */
export function parseControl(control: Buffer) {
  if (!control) throw new TypeError("Control is empty");
  else if (!Buffer.isBuffer(control)) throw new TypeError("Control is not a buffer");
  const packageData: {value: Buffer, data: Buffer}[] = [];

  for (let chuckLength = 0; chuckLength < control.length; chuckLength++) {
    // ':' and ' '
    if (control[chuckLength-1] === 0x3A && control[chuckLength] === 0x20) {
      // Find break line
      const key = control.subarray(0, chuckLength-1);
      control = control.subarray(chuckLength+1);
      chuckLength = 0;
      for (let breakLine = 0; breakLine < control.length; breakLine++) {
        if (control[breakLine] === 0x0A) {
          const data = control.subarray(0, breakLine);
          if (data.at(findLastChar(data)) === 0x2e) continue;
          control = control.subarray(breakLine+1);
          packageData.push({
            value: key,
            data: data,
          });
          break;
        }
      }
    }
  }

  const reduced = packageData.reduce((main, curr) => {
    const keyName = curr.value.toString("utf8").trim();
    const data = curr.data.toString("utf8").trim().split("\n").map(line => line.trim()).filter(Boolean).map(line => line === "." ? "" : line).join("\n");
    curr.data = null;
    curr.value = null;
    if ((["Size", "Installed-Size"]).includes(keyName)) main[keyName] = Number(data);
    else main[keyName] = data;
    return main;
  }, {} as Partial<debianControl>);

  // check required fields are present
  if (!(reduced.Package && reduced.Architecture && reduced.Version)) throw new Error("Control file is invalid");

  return reduced as debianControl;
}

export function createControl(controlObject: debianControl) {
  let controlFile: string[] = [];
  for (const keyName in controlObject) {
    let data = controlObject[keyName];
    // Ignore undefined and null values
    if (data === undefined||data === null) continue;
    let keyString = "";
    if (keyName === "Description") {
      if (typeof data !== "string") throw new TypeError("Description must be a string");
      else {
        data = data.split("\n").map((line, index) => {
          line = line.trim();
          if (index === 0) return line;
          if (line.length < 1 || line === ".") return  `  .`;
          return `  ${line}`;
        }).join("\n");
      }
    }

    if (typeof data === "boolean") keyString = `${keyName}: ${data ? "yes" : "no"}`;
    else keyString = `${keyName}: ${String(data)}`;
    if (keyString.length > 0) controlFile.push(keyString)
  }

  // Add break line to end
  return controlFile.join("\n");
}

/**
 * Parse package, add File size and Hashs
 * @param fileStream - Debian file stream
 * @returns control file
 */
export async function parsePackage(fileStream: Readable) {
  const arParse = fileStream.pipe(Ar());
  const filesData: ({path: string} & ({type: "file", size: number}|{type: "folder"}))[] = [];

  const dataPromises = await Promise.all([
    extendsCrypto.createHashAsync(fileStream),
    new Promise<debianControl>((done, reject) => {
      let loaded = false;
      arParse.once("close", () => (!loaded)?reject(new Error("Invalid debian package")):null);
      arParse.on("entry", async (info, stream) => {
        const fileBasename = path.basename(info.name).trim();
        if (!(fileBasename.startsWith("control.tar"))) return stream.on("error", reject);
        loaded = true;
        return stream.pipe(decompress()).pipe(tarStream.extract()).on("error", reject).on("entry", (head, str) => {
          if (path.basename(head.name) === "control") {
            let controlFile: Buffer[] = [];
            return str.on("data", chuck => controlFile.push(chuck)).on("error", reject).on("end", () => done(parseControl(Buffer.concat(controlFile))));
          }
          return null;
        });
      });
    }),
    new Promise<void>((done, reject) => {
      let loaded = false;
      arParse.once("close", () => {if (!loaded) return reject(new Error("Invalid debian package"))}).on("entry", async (info, stream) => {
        const fileBasename = path.basename(info.name).trim();
        if (!(fileBasename.startsWith("data.tar"))) return stream.on("error", reject);
        return stream.pipe(decompress()).pipe(tarStream.extract()).on("entry", (entry) => {
          const fixedPath = path.posix.resolve("/", entry.name);
          if (entry.type === "file") filesData.push({
            type: "file",
            path: fixedPath,
            size: entry.size
          }); else filesData.push({
            type: "folder",
            path: fixedPath
          });
        }).on("error" as any, reject).on("end", done);
      });
    }),
  ]);

  dataPromises[1]["Size"] = dataPromises[0].byteLength;
  dataPromises[1]["MD5Sum"] = dataPromises[0].hash.md5;
  dataPromises[1]["SHA512"] = dataPromises[0].hash.sha512;
  dataPromises[1]["SHA256"] = dataPromises[0].hash.sha256;
  dataPromises[1]["SHA1"] = dataPromises[0].hash.sha1;
  return {
    control: dataPromises[1],
    files: filesData
  };
}

/**
 * Get tar data end auto descompress
 *
 * @param fileStream - Package file stream
 * @returns
 */
export async function getPackageData(fileStream: Readable) {
  const arParse = fileStream.pipe(Ar());
  const dataTar = await new Promise<Readable>((done, rej) => arParse.once("close", () => rej(new Error("There is no data.tar or it is not a debian package"))).on("entry", (str, stream) => path.basename(str.name).startsWith("data.tar") ? done(stream) : null));
  return dataTar.pipe(decompress());
}

export interface packageConfig {
  dataFolder: string;
  control: debianControl;
  compress?: {
    control?: Exclude<compressAvaible, "zst"|"deflate">;
    data?: Exclude<compressAvaible, "deflate">;
  }
}

export async function createPackage(packageInfo: packageConfig) {
  if (!(await extendsFS.exists(packageInfo?.dataFolder))) throw new TypeError("required dataFolder to create data.tar");
  else if (await extendsFS.isFile(packageInfo.dataFolder)) throw new TypeError("dataFolder is file");
  packageInfo.compress ??= {};
  packageInfo.compress.control ??= "gzip";
  packageInfo.compress.data ??= "gzip";
  const tmpFolder = await fs.mkdtemp(path.join(tmpdir(), "debianstream_"));

  const tars = {
    controlTar: tarStream.pack(),
    dataTar: tarStream.pack(),
    size: {
      control: 0,
      data: 0
    }
  }

  let controlPath = path.join(tmpFolder, "control.tar");
  if (packageInfo.compress.control === "gzip") controlPath += ".gz";
  else if (packageInfo.compress.control === "xz") controlPath += ".xz";

  let dataPath = path.join(tmpFolder, "data.tar");
  if (packageInfo.compress.data === "gzip") dataPath += ".gz";
  else if (packageInfo.compress.data === "xz") dataPath += ".xz";
  else if (packageInfo.compress.data === "zst") dataPath += ".zst";

  // Write temp files
  const controlPipe = pipeline(tars.controlTar.pipe(compress(packageInfo.compress.control)).on("data", data => tars.size.control += Buffer.byteLength(data)), createWriteStream(controlPath));
  const pipeDataPromise = pipeline(tars.dataTar.pipe(compress(packageInfo.compress.data)).on("data", data => tars.size.data += Buffer.byteLength(data)), createWriteStream(dataPath));
  const filesDate = new Date();

  return createStream(async function pack() {
    // Write debian binary
    await this.addFile("2.0\n", "debian-binary", 4, filesDate);

    // Write control file
    const controlFile = createControl(packageInfo.control);
    tars.controlTar.entry({name: "./control", size: Buffer.byteLength(controlFile)}, () => tars.controlTar.finalize()).end(controlFile);

    // Wait to write
    await controlPipe.then(async () => this.addFile(createReadStream(controlPath), path.basename(controlPath), tars.size.control, filesDate));

    const dataFiles = await extendsFS.readdir({
      filter: (path) => !(path.startsWith("DEBIAN") || path.startsWith("debian")),
      folderPath: packageInfo.dataFolder,
      withInfo: true,
    });

    for (const ff of dataFiles) {
      const entryFolder = path.posix.resolve("/", path.posix.normalize(path.relative(packageInfo.dataFolder, ff.path)));
      if (ff.type === "directory") tars.dataTar.entry({name: entryFolder, size: ff.size, mtime: ff.mtime, type: "directory", uid: ff.uid, gid: ff.gid, mode: ff.mode}).end();
      else if (ff.type === "file") await pipeline(createReadStream(ff.path), tars.dataTar.entry({name: entryFolder, size: ff.size, mtime: ff.mtime, type: "file", uid: ff.uid, gid: ff.gid, mode: ff.mode}));
      else if (ff.type === "symbolicLink") tars.dataTar.entry({name: entryFolder, linkname: ff.realPath, size: ff.size, mtime: ff.mtime, type: "symlink", uid: ff.uid, gid: ff.gid, mode: ff.mode}).end();
    }

    // End
    tars.dataTar.finalize();
    await pipeDataPromise.then(async () => this.addFile(createReadStream(dataPath), path.basename(dataPath), tars.size.data, filesDate));
    console.log(tars.size);
    await fs.rm(tmpFolder, {recursive: true, force: true}).catch(err => this.emit("error", err));
    this.close();
  });
}