import decompress, { compress, compressAvaible } from "@sirherobrine23/decompress";
import Ar, { createStream } from "@sirherobrine23/ar";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { extendsCrypto, extendsFS } from "@sirherobrine23/extends";
import { tmpdir } from "node:os";
import stream_promise from "node:stream/promises";
import tarStream from "tar-stream";
import stream from "node:stream";
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
export async function parsePackage(fileStream: stream.Readable) {
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
export async function getPackageData(fileStream: stream.Readable) {
  const arParse = fileStream.pipe(Ar());
  const dataTar = await new Promise<stream.Readable>((done, rej) => arParse.once("close", () => rej(new Error("There is no data.tar or it is not a debian package"))).on("entry", (str, stream) => path.basename(str.name).startsWith("data.tar") ? done(stream) : null));
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

/**
 * Create debian package directly from Nodejs without external command
 *
 * This function is still under construction and some errors may appear.
 *
 * such as the ".deb" file being poorly compressed and returning a "malformed archive", and this can occur due to poor file compression in "gzip/gz" I recommend not doing any compression to control.tar and data.tar
 *
 * @param packageInfo - Package config
 * @returns .deb file stream
 */
export function createPackage(packageInfo: packageConfig) {
  return createStream(async function packDeb() {
    if (!(await extendsFS.exists(packageInfo?.dataFolder))) throw new TypeError("required dataFolder to create data.tar");
    else if (await extendsFS.isFile(packageInfo.dataFolder)) throw new TypeError("dataFolder is file");
    const posixNormalize = (path: string) => path.split("\\").join("/");
    const tmpFolder = await fs.mkdtemp(path.join(tmpdir(), "debianstream_"));
    packageInfo.compress ??= {};
    const targsPath = {
      control: path.join(tmpFolder, "control.tar"+(packageInfo.compress.control === "xz" ? ".xz" : packageInfo.compress.control === "gzip" ? ".gz" : "")),
      data: path.join(tmpFolder, "data.tar"+(packageInfo.compress.data === "xz" ? ".xz" : packageInfo.compress.data === "zst" ? ".zst" : packageInfo.compress.data === "gzip" ? ".gz" : "")),
    }

    const controlPack = tarStream.pack(), dataPack = tarStream.pack();
    const compressed = Promise.all([
      stream_promise.pipeline(controlPack.pipe(compress(packageInfo.compress.control || "passThrough")), createWriteStream(targsPath.control)),
      stream_promise.pipeline(dataPack.pipe(compress(packageInfo.compress.data || "passThrough")), createWriteStream(targsPath.data)),
    ]);

    // Control file
    const controlFile = createControl(packageInfo.control);
    await stream_promise.pipeline(controlFile, controlPack.entry({name: "./control", size: Buffer.byteLength(controlFile)}));

    // data tarball
    const dataFiles = await extendsFS.readdirV2(packageInfo.dataFolder, true, (fpath) => !(fpath.startsWith("DEBIAN")||fpath.startsWith("debian")));
    for (const target of dataFiles) {
      if (!(target.type === "file" || target.type === "dir" || target.type === "symbolicLink")) continue;
      const entry = dataPack.entry({
        name: posixNormalize(target.path),
        linkname: target.realPath ? posixNormalize(target.realPath) : undefined,
        type: target.type === "dir" ? "directory" : target.type === "symbolicLink" ? "symlink" : "file",
        size: target.size,
        gid: target.info.gid,
        uid: target.info.uid,
        mtime: target.info.mtime,
        mode: target.info.mode
      });
      if (target.type === "file") await stream_promise.pipeline(createReadStream(target.fullPath), entry);
      else await stream_promise.finished(entry.end());
    }

    dataPack.finalize();
    controlPack.finalize();
    await compressed;
    await this.addFile("2.0\n", "debian-binary", 4);
    await this.addLocalFile(targsPath.control);
    await this.addLocalFile(targsPath.data);
    await fs.rm(tmpFolder, {recursive: true, force: true});
    this.close();
  });
}