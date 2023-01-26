import { Readable } from "node:stream";
import { extendsCrypto } from "../../extends/src/index.js";
import Ar from "../../ar/src/index.js";
import lzma from "lzma-native";
import path from "node:path";
import zlib from "node:zlib";
import tar from "tar";

/** Debian packages, get from `dpkg-architecture --list -L | grep 'musl-linux-' | sed 's|musl-linux-||g' | xargs`, version 1.21.1, Ubuntu */
export type debianArch = "all"|"armhf"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";

export type debianControl = {
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
  for (let i = data.length; i >= 0; i--) {
    if (data[i] !== 0x20) return i;
  }
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
  let spaceInsident = Array(3).join(" ");
  let control: Buffer;
  for (const keyName in controlObject) {
    let data = controlObject[keyName];
    // Ignore undefined and null values
    if (data === undefined||data === null) continue;
    let keyString: string;

    if (keyName === "Description") {
      if (typeof data !== "string") throw new TypeError("Description must be a string");
      else {
        let dataSplit = data.split("\n").map(line => line.trim());
        data = dataSplit.map((line, index) => {
          if (index === 0) return line;
          if (line.length < 1 || line === ".") return  `${spaceInsident}.`;
          return `${spaceInsident}${line}`;
        }).join("\n");
      }
    }

    if (typeof data === "string") keyString = `${keyName}: ${data}`;
    else if (typeof data === "number") keyString = `${keyName}: ${data}`;
    else if (typeof data === "boolean") keyString = `${keyName}: ${data ? "yes" : "no"}`;

    // Add to Head
    keyString = keyString?.trim();
    if (keyString?.length <= 0) continue;
    if (control) control = Buffer.concat([control, Buffer.from("\n", "utf8"), Buffer.from(keyString, "utf8")]);
    else control = Buffer.from(keyString, "utf8");
    keyString = null;
  }

  // Add break line to end
  return control;
}


/**
 *
 * @param fileStream - Debian file stream
 * @returns control file
 */
export async function parsePackage(fileStream: Readable): Promise<{control: debianControl, files: {path: string, size: number}[]}> {
  const fileHash = extendsCrypto.createHashAsync(fileStream);
  const arParse = fileStream.pipe(Ar());
  const control = new Promise<debianControl>((done, reject) => {
    arParse.on("entry", async (info, stream) => {
      const fileBasename = path.basename(info.name).trim();
      if (!(fileBasename.startsWith("control.tar"))) return stream.on("error", reject);
      if (fileBasename.endsWith(".xz")) stream = stream.pipe(lzma.Decompressor());
      else if (fileBasename.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());

      // control stream
      const entry = await new Promise<tar.ReadEntry>((done, reject) => stream.pipe(tar.list({filter: (filePath) => path.basename(filePath) === "control", onentry: (entry) => done(entry)})).on("error" as any, reject));
      let controlFile: Buffer;
      await new Promise<void>((done, reject) => entry.on("data", chuck => controlFile = !controlFile ? chuck : Buffer.concat([controlFile, chuck])).on("error", reject).once("end", () => done()));
      return done(parseControl(controlFile));
    });
  });

  const files = new Promise<{path: string, size: number}[]>((done, reject) => {
    arParse.on("entry", async (info, stream) => {
      const fileBasename = path.basename(info.name).trim();
      if (!(fileBasename.startsWith("data.tar"))) return stream.on("error", reject);
      if (fileBasename.endsWith(".xz")) stream = stream.pipe(lzma.Decompressor());
      else if (fileBasename.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());

      // data stream
      const files: {path: string, size: number}[] = [];
      await new Promise<void>((done, reject) => stream.pipe(tar.list({onentry: (entry) => files.push({path: entry.path, size: entry.size})})).on("error" as any, reject).once("end", () => done()));
      return done(files);
    });
  });

  // Wait datas
  const [fileHashData, controlData, filesData ] = await Promise.all([fileHash, control, files]);
  controlData["Size"] = fileHashData.bytesReceived;
  controlData["MD5Sum"] = fileHashData.hash.md5;
  controlData["SHA512"] = fileHashData.hash.sha512;
  controlData["SHA256"] = fileHashData.hash.sha256;
  controlData["SHA1"] = fileHashData.hash.sha1;
  return {
    control: controlData,
    files: filesData
  };
}