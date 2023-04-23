import decompress, { compress, compressAvaible, decompressStream } from "@sirherobrine23/decompress";
import { arParseAbstract, createArStream, parseArStream } from "@sirherobrine23/ar";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { extendsCrypto, extendsFS } from "@sirherobrine23/extends";
import { tmpdir } from "node:os";
import stream_promise, { finished } from "node:stream/promises";
import tarStream from "tar-stream";
import stream from "node:stream";
import path from "node:path";

/** Debian packages, get from `dpkg-architecture --list -L | grep 'musl-linux-' | sed 's|musl-linux-||g' | xargs`, version 1.21.1, Ubuntu */
export type debianArch = "all"|"armhf"|"armel"|"mipsn32"|"mipsn32el"|"mipsn32r6"|"mipsn32r6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"powerpcspe"|"x32"|"arm64ilp32"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";
export type Maintainer = {
  Name: string;
  Email?: string;
};

export interface debianControl {
  Package: string,
  Architecture: debianArch,
  Version: string,
  Maintainer: Maintainer,
  Description: string,
  Priority?: string,
  Section?: string,
  Origin?: string,
  "Original-Maintainer"?: Maintainer,
  "Installed-Size"?: number,
  Bugs?: string,
  Depends?: string[],
  "Pre-Depends"?: string[],
  Tags?: string[],
  Suggests?: string,
  Size?: number,
  MD5sum?: string,
  SHA512?: string,
  SHA256?: string,
  SHA1?: string,
  Homepage?: string,
  Task?: string,
  Filename?: string,
};

// Archs array
const archTest = ["all", "armhf", "armel", "mipsn32", "mipsn32el", "mipsn32r6", "mipsn32r6el", "mips64", "mips64el", "mips64r6", "mips64r6el", "powerpcspe", "x32", "arm64ilp32", "i386", "ia64", "alpha", "amd64", "arc", "armeb", "arm", "arm64", "avr32", "hppa", "m32r", "m68k", "mips", "mipsel", "mipsr6", "mipsr6el", "nios2", "or1k", "powerpc", "powerpcel", "ppc64", "ppc64el", "riscv64", "s390", "s390x", "sh3", "sh3eb", "sh4", "sh4eb", "sparc", "sparc64", "tilegx"];

/**
 * Parse `control` file and return Object with package config.
 *
 * @param controlString - Buffer os String debian control file.
 * @returns
 */
export function parseControl<T extends debianControl = debianControl>(controlString: string|Buffer): T {
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
  const controlConfig = lineSplit.reduce<T>((acc, line) => {
    const indexOf = line.indexOf(":");
    let key: keyof debianControl;
    acc[(key = line.slice(0, indexOf).trim() as any)] = line.slice(indexOf+1).trim();
    if (!acc[key]) {
      delete acc[key];
      return acc;
    }
    if (key === "Size" || key === "Installed-Size") acc[key] = Number(acc[key]);
    else if (key === "Description") {
      const keysLe: string[] = acc[key].split("\n");
      let Space = /^(\s+)/;
      const spaceSkip = Array.from(new Set(keysLe.map(key => !(Space.test(key)) ? -1 : Space.exec(key).at(0).length).filter(a => a > 0).sort((a, b) => a - b))).at(0) ?? 1;
      acc[key] = keysLe.map((line, index) => line.trim() === "." ? "" : (index > 0 ? line.slice(spaceSkip).trimEnd() : line.trim())).join("\n");
    } else if (key === "Maintainer") {
      const line = acc[key] as any as string;
      const emailIndex_1 = line.indexOf("<"), emailIndex_2 = line.indexOf(">");
      if (emailIndex_1 > 0 && (emailIndex_1 < emailIndex_2)) {
        const Email = line.slice(emailIndex_1+1, emailIndex_2);
        if (Email.length <= 2) throw new Error("Invalid email!");
        acc[key] = {
          Name: line.slice(0, emailIndex_1).trim(),
          Email
        };
      } else acc[key] = {Name: line.trim()};
    }
    return acc;
  }, {} as any);
  if (!(controlConfig.Package && controlConfig.Architecture && controlConfig.Version && controlConfig.Maintainer && controlConfig.Description)) throw new Error("Control file is invalid");
  if (!(archTest.includes(controlConfig.Architecture))) throw new Error("Invalid package architecture!");
  return controlConfig;
}

function keys<T>(obj: T): (keyof T)[] {
  return Object.keys(obj) as any;
}

/**
 * Create control file from Object and and set if valid control Object.
 *
 * @param controlObject - Control object.
 */
export function createControl(controlConfig: debianControl) {
  if (!(controlConfig.Package && controlConfig.Architecture && controlConfig.Version && controlConfig.Maintainer && controlConfig.Description)) throw new Error("Control file is invalid");
  if (!(archTest.includes(controlConfig.Architecture))) throw new Error("Invalid package architecture!");
  let controlFile: string[] = [];
  const desc = controlConfig.Description;
  delete controlConfig.Description;
  controlConfig.Description = desc;
  keys(controlConfig).forEach(keyName => {
    let keyString = keyName + ": ";
    if (controlConfig[keyName] === undefined||controlConfig[keyName] === null||controlConfig[keyName] === "") return;
    else if (keyName === "Description") {
      controlFile.push(keyString+(controlConfig[keyName].trim().split("\n").map((line, index) => {
        if (index === 0) return line.trim();
        if ((line = line.trimEnd()).length === 0 || line === ".") return  ` .`;
        return ` ${line.trimEnd()}`;
      }).join("\n").trim()));
    } else if (keyName === "Maintainer"||keyName === "Original-Maintainer") {
      const { Name, Email } = controlConfig[keyName];
      if (!Email) controlFile.push(keyString+Name); else controlFile.push(keyString+`${Name} <${Email}>`);
    } else {
      const data = controlConfig[keyName];
      if (typeof data === "boolean") keyString += data ? "yes" : "no";
      else if (Array.isArray(data)) keyString += data.join(", ");
      else keyString += String(data);
      controlFile.push(keyString);
    }
  });
  return controlFile.join("\n");
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
     * compress control file to the smallest file possible
     */
    control?: Exclude<compressAvaible, |"deflate">;
  },

  /**
   * Scripts or binary files to run post or pre action
   *
   * If set file path load directly
     @example {
       "preinst": "#!/bin/bash\nset -ex\necho \"Ok Google\"",
       "postinst": "/var/lib/example/removeMicrosoft.sh"
     }
   */
  scripts?: {
    /** Run script before install packages */
    preinst?: string;
    /** Run script before remove package */
    prerm?: string;
    /** After install package */
    postinst?: string;
    /** After package removed */
    postrm?: string;
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
  const com = (packageInfo.compress || {data: "gzip", control: "gzip"});
  const controlFilename = "control.tar"+(com.control === "xz" ? ".xz" : com.control === "gzip" ? ".gz" : ""),
  dataFilename = "data.tar"+(com.data === "xz" ? ".xz" : com.data === "gzip" ? ".gz" : "");

  // return stream
  return createArStream(async function pack(ar, callback) {
    if (!(await extendsFS.exists(packageInfo?.dataFolder))) throw new TypeError("required dataFolder to create data.tar");
    else if (await extendsFS.isFile(packageInfo.dataFolder)) throw new TypeError("dataFolder is file");
    const filesStorage = await fs.mkdtemp(path.join(tmpdir(), "debianPack_"));
    // Write debian-binary
    ar.addEntry("debian-binary", {size: 4}, "2.0\n", "utf8");

    // control file
    const controlTar = tarStream.pack(), conSave = controlTar.pipe(compress(com.control || "passThrough")).pipe(createWriteStream(path.join(filesStorage, controlFilename)));

    // Control file
    const controlData = createControl(packageInfo.control).concat("\n");
    await stream_promise.finished(controlTar.entry({name: "./control", type: "file", size: controlData.length}).end(controlData));

    // Scripts
    if (packageInfo.scripts) {
      for (const scr of keys(packageInfo.scripts)) {
        const data = packageInfo.scripts[scr];
        if (!data.includes("\n") && path.isAbsolute(path.resolve(process.cwd(), data)) && await extendsFS.exists(path.resolve(process.cwd(), data))) {
          const stats = await fs.lstat(path.resolve(process.cwd(), data));
          await stream_promise.finished(createReadStream(path.resolve(process.cwd(), data)).pipe(controlTar.entry({name: "./"+scr, size: stats.size, type: "file"})));
        } else await stream_promise.finished(controlTar.entry({name: scr, type: "file", size: data.length}).end(data));
      }
    }

    controlTar.finalize();
    await stream_promise.finished(conSave).then(() => ar.addLocalFile(path.join(filesStorage, controlFilename))).then(() => fs.rm(path.join(filesStorage, controlFilename), {force: true}));

    // Data tarball
    const compressStr = compress(com.data || "passThrough");
    const data = tarStream.pack(), dataSave = data.pipe(compressStr).pipe(createWriteStream(path.join(filesStorage, dataFilename)));
    const filesFolder = await extendsFS.readdirV2(packageInfo.dataFolder, true);
    for (const file of filesFolder) {
      if (file.path.startsWith("DEBIAN")||file.path.startsWith("debian")||!(file.type === "file"||file.type === "directory")) continue;
      const entry = data.entry({
        name: path.posix.join(".", path.posix.resolve(path.posix.sep, file.path.split(path.sep).join(path.posix.sep))),
        type: file.type,
        size: file.size
      });
      if (file.type === "file") createReadStream(file.fullPath).pipe(entry);
      else entry.end();
      await stream_promise.finished(entry);
    }
    data.finalize();
    await stream_promise.finished(dataSave).then(() => ar.addLocalFile(path.join(filesStorage, dataFilename))).then(() => fs.rm(path.join(filesStorage, dataFilename), {force: true}));
    await fs.rm(filesStorage, {recursive: true, force: true});
    return callback();
  });
}

/**
 * Parse debian package promised function
 * @param debStream - Package stream
 * @returns
 */
export async function parsePackage(debStream: stream.Readable) {
  const hashPromise = extendsCrypto.createHashAsync(debStream);
  const files = new Set<tarStream.Headers>();
  let controlFile: debianControl;
  await finished(debStream.pipe(parsePackageStream()).on("control", control => controlFile = control).on("dataFile", source => files.add(source)));
  const { byteLength, hash } = await hashPromise;

  // Set extra info
  controlFile.Size = byteLength;
  controlFile.MD5sum = hash.md5;
  controlFile.SHA1 = hash.sha1;
  controlFile.SHA256 = hash.sha256;
  controlFile.SHA512 = hash.sha512;

  return {
    controlFile,
    files: Array.from(files.values()),
  };
}

export interface parseStream extends arParseAbstract {
  on(event: "close", listener: () => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: stream.Readable) => void): this;
  on(event: "unpipe", listener: (src: stream.Readable) => void): this;
  on(event: "dataFile", listener: (fileInfo: tarStream.Headers, fileStream: stream.Readable) => void): this;
  on(event: "control", listener: (packageControl: debianControl) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: "close", listener: () => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: stream.Readable) => void): this;
  once(event: "unpipe", listener: (src: stream.Readable) => void): this;
  once(event: "dataFile", listener: (fileInfo: tarStream.Headers, fileStream: stream.Readable) => void): this;
  once(event: "control", listener: (packageControl: debianControl) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

export function parsePackageStream(): parseStream {
  return new class parseStream extends arParseAbstract {
    #isDebian = false;
    #filesList = new Set<tarStream.Headers>();
    getFiles() {
      return Array.from(this.#filesList.values());
    }

    #controlFile: debianControl;
    getControl() {
      if (!this.#controlFile) throw new Error("Package not loaded!");
      return this.#controlFile;
    }

    constructor() {
      super(async (head, fileStream) => {
        if (path.basename(head.name).startsWith("debian-binary")) this.#isDebian = true;
        else if (!this.#isDebian) throw new Error("Cannot extract debian file, malformed debian package!");
        else if (path.basename(head.name).startsWith("control.tar")) {
          const controlTar = fileStream.pipe(decompressStream()).pipe(tarStream.extract());
          controlTar.on("entry", async (entry, fileStr, next) => {
            next();
            if (path.basename(entry.name) === "control") {
              const bufferConcat: Buffer[] = [];
              await finished(fileStr.on("data", data => bufferConcat.push(data)));
              this.emit("control", (this.#controlFile = parseControl(Buffer.concat(bufferConcat))));
            } else if (path.basename(entry.name) === "md5sums") {

            }
          });
          await finished(controlTar, {error: true});
        } else if (path.basename(head.name).startsWith("data.tar")) {
          await finished(fileStream.pipe(decompressStream()).pipe(tarStream.extract()).on("entry", (entry, str, next) => {
            next();
            this.emit("dataFile", entry, str);
            this.#filesList.add(entry);
          }), {error: true});
        } else throw new Error("Invalid file");
      });
    }
  }
}

/**
 * Get tar data end auto descompress
 *
 * @param fileStream - Package file stream
 * @returns
 */
export async function getPackageData(fileStream: stream.Readable) {
  const arParse = fileStream.pipe(parseArStream());
  const dataTar = await new Promise<stream.Readable>((done, rej) => arParse.once("close", () => rej(new Error("There is no data.tar or it is not a debian package"))).on("entry", (str, stream) => path.basename(str.name).startsWith("data.tar") ? done(stream) : null));
  return dataTar.pipe(decompress());
}