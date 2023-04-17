import decompress, { compress, compressAvaible } from "@sirherobrine23/decompress";
import { createArStream, parseArStream } from "@sirherobrine23/ar";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { extendsCrypto, extendsFS } from "@sirherobrine23/extends";
import { tmpdir } from "node:os";
import stream_promise from "node:stream/promises";
import tarStream from "tar-stream";
import stream from "node:stream";
import path from "node:path";

/** Debian packages, get from `dpkg-architecture --list -L | grep 'musl-linux-' | sed 's|musl-linux-||g' | xargs`, version 1.21.1, Ubuntu */
export type debianArch = "all"|"armhf"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";

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

const archTest = ["all", "armhf", "i386", "ia64", "alpha", "amd64", "arc", "armeb", "arm", "arm64", "avr32", "hppa", "m32r", "m68k", "mips", "mipsel", "mipsr6", "mipsr6el", "mips64", "mips64el", "mips64r6", "mips64r6el", "nios2", "or1k", "powerpc", "powerpcel", "ppc64", "ppc64el", "riscv64", "s390", "s390x", "sh3", "sh3eb", "sh4", "sh4eb", "sparc", "sparc64", "tilegx"];

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
  const reduced = lineSplit.reduce<T>((acc, line) => {
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
  if (!(reduced.Package && reduced.Architecture && reduced.Version && reduced.Maintainer && reduced.Description)) throw new Error("Control file is invalid");
  if (!(archTest.includes(reduced.Architecture))) throw new Error("Invalid package architecture!");
  return reduced;
}

function keys<T>(obj: T): (keyof T)[] {
  return Object.keys(obj) as any;
}

export function createControl(controlObject: debianControl) {
  if (!(controlObject.Package && controlObject.Architecture && controlObject.Version)) throw new Error("Control is invalid");
  let controlFile: string[] = [];
  const desc = controlObject.Description;
  delete controlObject.Description;
  controlObject.Description = desc;
  for (const keyName of keys(controlObject)) {
    let keyString = keyName + ": ";
    let data = controlObject[keyName];
    if (data === undefined||data === null||data === "") continue;
    if (keyName === "Description") {
      if (typeof data !== "string") throw new TypeError("Description must be a string");
      else {
        controlFile.push(keyString+(data.split("\n").map((line, index) => {
          line = line.trim();
          if (index === 0) return line.trim();
          if (line.length < 1 || line === ".") return  ` .`;
          return ` ${line.trimEnd()}`;
        }).join("\n").trim()));
      }
    } else if (keyName === "Maintainer"||keyName === "Original-Maintainer") {
      const { Name, Email } = controlObject[keyName];
      controlFile.push(keyString+`${Name} <${Email}>`);
    } else {
      if (typeof data === "boolean") keyString += data ? "yes" : "no";
      else if (Array.isArray(data)) keyString += data.join(", ");
      else keyString += String(data);
      controlFile.push(keyString);
    }
  }

  // Add break line to end
  return controlFile.join("\n");
}

export async function parsePackage(debStream: stream.Readable, lowPackge: boolean = false) {
  const arStr = debStream.pipe(parseArStream());
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
  const arParse = fileStream.pipe(parseArStream());
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
    await stream_promise.finished(ar.entry("debian-binary", {size: 4}).end("2.0\n"));

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
    callback();
  });
}
