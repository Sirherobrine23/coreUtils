import { extendsCrypto } from "@sirherobrine23/extends";
import { Readable } from "node:stream";
import bzip2 from "unbzip2-stream";
import lzma from "lzma-native";
import path from "node:path";
import zlib from "node:zlib";
import tar from "tar";
import Ar from "@sirherobrine23/ar";

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
      arParse.once("close", () => {if(!loaded) return reject(new Error("Invalid debian package"))}).on("entry", async (info, stream) => {
        const fileBasename = path.basename(info.name).trim();
        if (!(fileBasename.startsWith("control.tar"))) return stream.on("error", reject);
        if (fileBasename.endsWith(".xz")) stream = stream.pipe(lzma.Decompressor());
        else if (fileBasename.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());
        else if (fileBasename.endsWith(".zst")) throw new Error("Facebook zst not supported to extract data");
        loaded = true;
        return stream.pipe(tar.list({
          filter: (filePath) => path.basename(filePath) === "control",
          onentry: (entry) => {
          // control stream
          let controlFile: Buffer[] = [];
          return entry.on("data", chuck => controlFile.push(chuck)).on("error", reject).on("end", () => done(parseControl(Buffer.concat(controlFile))));
        }})).on("error" as any, reject)
      });
    }),
    new Promise<void>((done, reject) => {
      let loaded = false;
      arParse.once("close", () => {if (!loaded) return reject(new Error("Invalid debian package"))}).on("entry", async (info, stream) => {
        const fileBasename = path.basename(info.name).trim();
        if (!(fileBasename.startsWith("data.tar"))) return stream.on("error", reject);
        if (fileBasename.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());
        else if (fileBasename.endsWith(".bz2")) stream = stream.pipe(bzip2());
        else if (fileBasename.endsWith(".xz")||fileBasename.endsWith(".lzma")) stream = stream.pipe(lzma.Decompressor());
        else if (fileBasename.endsWith(".zst")) throw new Error("Facebook zst not supported to extract data");
        loaded = true;
        return stream.pipe(tar.list({
          onentry: (entry) => {
            const fixedPath = path.posix.resolve("/", entry.path);
            if (entry.type === "File") filesData.push({
              type: "file",
              path: fixedPath,
              size: entry.size
            }); else filesData.push({
              type: "folder",
              path: fixedPath
            });
          }
        })).on("error" as any, reject).on("end", done);
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