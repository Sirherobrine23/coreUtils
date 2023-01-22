import { createReadStream, createWriteStream, promises as fs, ReadStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import lzma, { Compressor } from "lzma-native";
import { createHashAsync } from "./extendsCrypto.js";
import * as Ar from "./ar.js";
import { streamRequest } from "./request/simples.js";
import extendsFs from "./extendsFs.js";
import path from "node:path";
import zlib from "node:zlib";
import tar from "tar";

export function parseSource(data: Buffer) {
  const lines: Buffer[] = [];
  for (let bufferLocate = 0; bufferLocate < data.length; bufferLocate++) {
    if (data[bufferLocate] === 0x0A) {
      lines.push(data.subarray(0, bufferLocate));
      data = data.subarray(bufferLocate+1);
      bufferLocate = 0;
    }
  }

  function trimStar(str: Buffer) {
    for (let i = 0; i < str.length; i++) {
      if (str[i] === 0x20 || str[i] === 0x09) continue;
      return str.subarray(i);
    }
    return str;
  }

  return lines.map((curr) => {
    if (curr.subarray(0, 3).toString().startsWith("deb")) {
      curr = curr.subarray(3);
      let isSrc = false;
      if (curr.subarray(0, 4).toString().startsWith("-src")) {
        curr = curr.subarray(5);
        isSrc = true;
      }

      // Trim start spaces
      curr = trimStar(curr);

      let Options: Buffer;
      if (curr[0] === 0x5B) {
        for (let i = 0; i < curr.length; i++) {
          if (curr[i] === 0x5D) {
            Options = curr.subarray(1, i);
            curr = trimStar(curr.subarray(i+1));
            break;
          } else if (curr[i] === 0x20 || curr[i] === 0x09) throw new Error("Invalid sources file, options must be in brackets \"[]\"");
        }
      }


      let url: Buffer;
      for (let space = 0; space < curr.length; space++) {
        if (curr[space] === 0x20 || curr[space] === 0x09) {
          url = curr.subarray(0, space);
          curr = trimStar(curr.subarray(space));
          break;
        }
      }
      const urlMain = new URL(url.toString("utf8").trim());

      // Component
      let component: Buffer;
      for (let space = 0; space < curr.length; space++) {
        if (curr[space] === 0x20 || curr[space] === 0x09) {
          component = curr.subarray(0, space);
          curr = trimStar(curr.subarray(space));
          break;
        }
      }

      return {
        type: isSrc ? "src" : "deb",
        url: urlMain,
        component: component.toString("utf8").trim(),
        options: Options ? Options.toString("utf8").trim().split(/\s+/g).filter(Boolean) : [],
        dist: curr.toString("utf8").trim().split(/\s+/g).map((curr) => {
          const comp = curr.trim();
          const url = new URL(urlMain);
          url.pathname = path.join(url.pathname, component.toString().trim(), comp);
          return {
            name: comp,
            url,
          };
        }).filter(Boolean),
      };
    }
    return undefined;
  }).filter(Boolean);
}

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
 * Extract all Packages from binary file (/dists/${distribuition}/${suite}/binary-${arch}/Packages
 *
 * @param streamRead - Packages stream (raw text not gzip or xz)
 * @returns
 */
export async function parsePackages(streamRead: Readable|ReadStream) {
  const packageArray: debianControl[] = [];
  await new Promise<void>((done, reject) => {
    let oldBuffer: Buffer;
    streamRead.pipe(new Writable({
      defaultEncoding: "binary",
      decodeStrings: true,
      highWaterMark: 1024,
      final(callback) {
        if (oldBuffer?.length > 0) {
          packageArray.push(parseControl(oldBuffer));
        }
        oldBuffer = undefined;
        callback();
        done();
      },
      write(chunk, encoding, callback) {
        if (!(encoding === "binary" && Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);
        if (oldBuffer?.length > 0) chunk = Buffer.concat([oldBuffer, chunk]);
        for (let chunckLength = 0; chunckLength < chunk.length; chunckLength++) {
          // \n == 0x0A
          if (chunk[chunckLength] === 0x0A && chunk[chunckLength+1] === 0x0A) {
            packageArray.push(parseControl(chunk.subarray(0, chunckLength)));
            chunk = chunk.subarray(chunckLength+2);
            chunckLength = 0;
          }
        }
        oldBuffer = chunk;
        callback();
      },
    })).on("error", reject);
  });
  return packageArray;
}

/**
 *
 * @param fileStream - Debian file stream
 * @returns control file
 */
export async function getControl(fileStream: Readable|ReadStream) {
  return new Promise<debianControl>((done, reject) => {
    const fileHash = createHashAsync(fileStream).catch(reject);
    return fileStream.on("error", reject).pipe(Ar.createUnpack((info, stream) => {
      const fileBasename = path.basename(info.name).trim();
      if (!(fileBasename.startsWith("control.tar"))) return stream.on("error", reject);
      if (fileBasename.endsWith(".xz")) stream = stream.pipe(lzma.Decompressor());
      else if (fileBasename.endsWith(".gz")) stream = stream.pipe(zlib.createGunzip());

      // get contro file
      let controlFile: Buffer;
      return stream.on("error", reject).pipe(tar.list({
        filter: (filePath) => path.basename(filePath) === "control",
        onentry: (entry) => entry.on("data", chuck => controlFile = !controlFile ? chuck : Buffer.concat([controlFile, chuck])).on("error", reject).once("end", async () => {
          const hashData = await fileHash;
          if (!hashData) return reject(new Error("Cannot calculate hash"));
          const packageControl = parseControl(controlFile);
          controlFile = null;
          packageControl.MD5Sum = hashData.hash.md5;
          packageControl.SHA512 = hashData.hash.sha512;
          packageControl.SHA256 = hashData.hash.sha256;
          packageControl.SHA1 = hashData.hash.sha1;
          packageControl.Size = hashData.dataReceived;
          return done(packageControl);
        })
      }));
    }).on("error", reject));
  }).catch(err => {
    fileStream.destroy(err);
    throw err;
  });
}

export type releaseType = Partial<{
  Origin: string,
  Label: string,
  Suite: string,
  Codename: string,
  Date: Date,
  "Valid-Until": Date,
  Architectures: string[],
  Components: string[],
  Description: string,
  "Acquire-By-Hash": boolean,
  MD5Sum: {hash: string, size: number, file: string}[],
  SHA512: {hash: string, size: number, file: string}[],
  SHA256: {hash: string, size: number, file: string}[],
  SHA1: {hash: string, size: number, file: string}[],
  Changelogs: string,
}>;

export async function parseRelease(fileData: Buffer): Promise<releaseType> {
  const releaseData: {[key: string]: any} = {};
  let latestKey: string;
  for (let chunckLength = 0; chunckLength < fileData.length; chunckLength++) {
    if (!latestKey && (fileData[chunckLength] === 0x3A && fileData[chunckLength+1] !== 0x3A)) {
      latestKey = fileData.subarray(0, chunckLength).toString();
      fileData = fileData.subarray(chunckLength+1);
      chunckLength = 0;
      continue;
    }

    if (fileData[chunckLength] === 0x0A) {
      if (!latestKey) latestKey = Object.keys(releaseData).at(-1);
      const value = fileData.subarray(0, chunckLength).toString();
      fileData = fileData.subarray(chunckLength+1);
      if (!releaseData[latestKey]) releaseData[latestKey] = value;
      else if (Array.isArray(releaseData[latestKey])) (releaseData[latestKey] as string[]).push(value);
      else releaseData[latestKey] = [releaseData[latestKey] as string, value];
      chunckLength = 0;
      latestKey = undefined;
      continue;
    }
  }

  // trim strings
  const sum = /([^\s]+)(\t|\s+)([0-9]+)(\t|\s+)([^\s]+)/;
  Object.keys(releaseData).forEach(key => {
    if (typeof releaseData[key] === "string") releaseData[key] = releaseData[key].trim();
    else if (Array.isArray(releaseData[key])) releaseData[key] = releaseData[key].map(str => {
      if (typeof str === "string") str = str.trim();
      if (sum.test(str)) {
        const [, hash,, size,, file] = sum.exec(str);
        return {hash, size: parseInt(size), file};
      };
      return str;
    });
    if (["yes", "no"].includes(releaseData[key])) releaseData[key] = (releaseData[key] === "yes");
  });

  if (releaseData.Date) releaseData.Date = new Date(releaseData.Date);
  if (releaseData["Valid-Until"]) releaseData["Valid-Until"] = new Date(releaseData["Valid-Until"]);
  if (releaseData.Architectures) releaseData.Architectures = releaseData.Architectures.split(" ").map(str => str.trim()).filter(Boolean);
  if (releaseData.Components) releaseData.Components = releaseData.Components.split(" ").map(str => str.trim()).filter(Boolean);
  return releaseData;
}

export async function getPackagesFromAPT(baseURL: string|URL, Release: releaseType) {
  const packagesObj: {[component: string]: {[arch: string]: debianControl[]}} = {};
  const {Components, Architectures} = Release;
  for (const component of Components) {
    for (const arch of Architectures) {
      const baseRequest = new URL(baseURL);
      baseRequest.pathname = path.posix.resolve(baseRequest.pathname, component, `binary-${arch}`, "Packages");
      const packagesURLString = baseRequest.toString();
      const stream = await streamRequest(packagesURLString).catch(() => streamRequest(packagesURLString+".gz").then(stream => stream.pipe(zlib.createGunzip()))).catch(() => streamRequest(packagesURLString+".xz").then(stream => stream.pipe(lzma.Decompressor())));
      packagesObj[component] ??= {};
      packagesObj[component][arch] ??= [];
      packagesObj[component][arch] = await parsePackages(stream);
    }
  }
  return packagesObj;
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
      async destroy(error, callback) {
        if (error) {
          await fd.close();
          rejects(error);
        }
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
      async destroy(error, callback) {
        if (error) {
          await fd.close();
          rejects(error);
        }
        callback(error);
        setTimeout(() => done(null), 100);
      },
    }));
  });

  await fd.close();
}

export async function packDeb(options: packOptions) {
  const control = parseControl(await fs.readFile(path.join(options.cwd, "DEBIAN", "control")));
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
  await fs.rm(tmpFolder, {recursive: true, force: true});

  // get return
  if (options.getStream) return createReadStream(options.outputFile);
  return options.outputFile;
}
