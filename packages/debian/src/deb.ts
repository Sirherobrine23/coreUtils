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
  Depends?: string[],
  "Pre-Depends"?: string[],
  Tags?: string[],
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

const splitKeys = [
  "Tag",
  "Depends",
  "Pre-Depends",
  "Recommends",
  "Replaces",
  "Suggests",
  "Breaks",
  "Provides",
];

const archTest = ["all", "armhf", "i386", "ia64", "alpha", "amd64", "arc", "armeb", "arm", "arm64", "avr32", "hppa", "m32r", "m68k", "mips", "mipsel", "mipsr6", "mipsr6el", "mips64", "mips64el", "mips64r6", "mips64r6el", "nios2", "or1k", "powerpc", "powerpcel", "ppc64", "ppc64el", "riscv64", "s390", "s390x", "sh3", "sh3eb", "sh4", "sh4eb", "sparc", "sparc64", "tilegx"];

export function parseControl<T = debianControl>(controlString: string|Buffer): T {
  if (Buffer.isBuffer(controlString)) controlString = controlString.toString("utf8");
  let lineSplit = controlString.trim().split("\n");
  for (let i = 0; i < lineSplit.length; i++) {
    if (!lineSplit[i]) continue;
    const indexOfKey = lineSplit[i].indexOf(":");
    if (indexOfKey === -1) {
      lineSplit[i - 1] += "\n";
      lineSplit[i - 1] += lineSplit[i];
      delete lineSplit[i];
      lineSplit = lineSplit.filter(Boolean);
      i = i-2;
    } else if (indexOfKey !== -1) {
      if (!(/[a-zA-Z\s]/.test(lineSplit[i][indexOfKey+1]))) {
        lineSplit[i - 1] += "\n" + lineSplit[i];
        delete lineSplit[i];
        lineSplit = lineSplit.filter(Boolean);
        i = i-2;
      }
    }
  }
  const reduced = lineSplit.reduce((acc, line) => {
    const indexOf = line.indexOf(":");
    let key: string;
    acc[(key = line.slice(0, indexOf).trim())] = line.slice(indexOf+1).trim();
    if ((["Size", "Installed-Size"]).includes(key)) acc[key] = Number(acc[key]);
    else if (splitKeys.includes(key)) acc[key] = acc[key].split(",").map(str => str.trim());
    else if (key === "Description") {
      const keysLe: string[] = acc[key].split("\n");
      let Space = /^(\s+)/;
      const spaceSkip = Array.from(new Set(keysLe.map(key => !(Space.test(key)) ? -1 : Space.exec(key).at(0).length).filter(a => a > 0).sort((a, b) => a - b))).at(0) ?? 1;
      acc[key] = keysLe.map((line, index) => line.trim() === "." ? "" : (index > 0 ? line.slice(spaceSkip) : line.trim())).join("\n");
    }
    return acc;
  }, {} as any);
  if (!(reduced.Package && reduced.Architecture && reduced.Version)) throw new Error("Control file is invalid");
  if (!(archTest.includes(reduced.Architecture))) throw new Error("Invalid package architecture!");
  return reduced;
}

export function createControl(controlObject: debianControl) {
  if (!(controlObject.Package && controlObject.Architecture && controlObject.Version)) throw new Error("Control is invalid");
  let controlFile: string[] = [];
  for (const keyName in controlObject) {
    let data = controlObject[keyName];
    // Ignore undefined and null values
    if (data === undefined||data === null||data === "") continue;
    if (keyName === "Description") {
      if (typeof data !== "string") throw new TypeError("Description must be a string");
      else {
        data = data.split("\n").map((line, index) => {
          line = line.trim();
          if (index === 0) return line;
          if (line.length < 1 || line === ".") return  ` .`;
          return ` ${line}`;
        }).join("\n");
      }
    }


    let keyString = keyName + ": ";
    if (typeof data === "boolean") keyString += data ? "yes" : "no";
    else if (Array.isArray(data)) keyString += data.join(", ");
    else keyString += String(data);
    controlFile.push(keyString);
  }

  // Add break line to end
  return controlFile.join("\n");
}

export async function parsePackage(debStream: stream.Readable, lowPackge: boolean = false) {
  const arStr = debStream.pipe(Ar());
  const hashPromise = extendsCrypto.createHashAsync(debStream);
  return new Promise<debianControl>((done, reject) => arStr.on("entry", (entry, fileStream) => {
    if (!(entry.name.startsWith("control.tar"))) return null;
    fileStream.pipe(decompress()).pipe(tarStream.extract()).on("error", reject).on("entry", async (entry, str, next) => {
      const controlArray: Buffer[] = [];
      if (path.basename(entry.name) === "control") {
        await stream_promise.finished(str.on("data", data => controlArray.push(data)));
        return done(parseControl(Buffer.concat(controlArray)));
      }
      return next();
    });
  })).then(async control => {
    if (lowPackge) return control;
    const { byteLength, hash } = await hashPromise;
    control["Size"] = byteLength;
    control.SHA512 = hash.sha512;
    control.SHA256 = hash.sha256;
    control.SHA1 = hash.sha1;
    control.MD5sum = hash.md5;
    return control;
  });
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
    /**
     * Compress the data.tar tar to the smallest possible size
     */
    data?: Exclude<compressAvaible, "deflate">;
    /**
     * @deprecated Control cause error in ar concat **DONT USE**
     */
    control?: Exclude<compressAvaible, |"deflate">;
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
  const com = (packageInfo.compress || {data: "gzip", control: "passThrough"});
  if (!(com.control === undefined || com.control === "passThrough")) {com.control = "passThrough"; console.warn("Disable control.tar compress");}
  const controlFilename = "control.tar",
  dataFilename = "data.tar"+(com.data === "xz" ? ".xz" : com.data === "gzip" ? ".gz" : "");

  // return stream
  return createStream(async function pack() {
    if (!(await extendsFS.exists(packageInfo?.dataFolder))) throw new TypeError("required dataFolder to create data.tar");
    else if (await extendsFS.isFile(packageInfo.dataFolder)) throw new TypeError("dataFolder is file");
    const filesStorage = await fs.mkdtemp(path.join(tmpdir(), "debianPack_"));
    // Write debian-binary
    await stream_promise.finished(this.entry("debian-binary", 4).end("2.0\n"));

    // control file
    const controlData = createControl(packageInfo.control);
    const con = tarStream.pack(), conSave = con.pipe(createWriteStream(path.join(filesStorage, controlFilename)));
    con.entry({name: "./control"}, controlData, () => con.finalize());
    await stream_promise.finished(conSave).then(() => this.addLocalFile(path.join(filesStorage, controlFilename))).then(() => fs.rm(path.join(filesStorage, controlFilename), {force: true}));

    // Data tarball
    const compressStr = compress(com.data || "passThrough");
    const data = tarStream.pack(), dataSave = data.pipe(compressStr).pipe(createWriteStream(path.join(filesStorage, dataFilename)));
    const filesFolder = await extendsFS.readdirV2(packageInfo.dataFolder, true);
    for (const file of filesFolder) {
      if (file.path.startsWith("DEBIAN")||file.path.startsWith("debian")||!(file.type === "file"||file.type === "directory")) continue;
      const entry = data.entry({
        name: path.posix.resolve(path.posix.sep, file.path.split(path.sep).join(path.posix.sep)),
        type: file.type,
        size: file.size
      });
      if (file.type === "file") createReadStream(file.fullPath).pipe(entry);
      else entry.end();
      await stream_promise.finished(entry);
    }
    data.finalize();
    await stream_promise.finished(dataSave).then(() => this.addLocalFile(path.join(filesStorage, dataFilename))).then(() => fs.rm(path.join(filesStorage, dataFilename), {force: true}));
    await fs.rm(filesStorage, {recursive: true, force: true});
  });
}
