import { createReadStream, createWriteStream, promises as fs, ReadStream } from "node:fs";
import { Readable, Writable } from "node:stream";
import lzma, { Compressor } from "lzma-native";
import { createHashAsync } from "./extendsCrypto.js";
import * as Ar from "./ar.js";
import extendsFs from "./extendsFs.js";
import path from "node:path";
import zlib from "node:zlib";
import tar from "tar";

export type debianArch = "all"|"amd64"|"arm64"|"armel"|"armhf"|"i386"|"mips64el"|"mipsel"|"ppc64el"|"s390x";
export type debianControl = {
  Package: string,
  Architecture: debianArch,
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
  SHA512?: string,
  SHA256?: string,
  SHA1?: string,
  Homepage?: string,
  Description?: string,
  Task?: string,
  [anyKey: string]: string|number|boolean
};

/**
 *
 * @param control - Control buffer file
 * @returns
 */
export function parseControl(control: Buffer) {
  if (!control) throw new Error("Control is empty");
  else if (!Buffer.isBuffer(control)) throw new TypeError("Control is not a buffer");
  const packageData: {[key: string]: string} = {};
  let key: string;
  for (let chuckLength = 0; chuckLength < control.length; chuckLength++) {
    // Get new key
    if (!key && (control[chuckLength] === 0x3A && control[chuckLength+1] !== 0x3A)) {
      key = control.subarray(0, chuckLength).toString().trim();
      control = control.subarray(chuckLength+1);
      chuckLength = 0;
      continue;
    }

    // Add to key
    if (key) {
      if (control[chuckLength] === 0x0A) {
        if (!packageData[key]) packageData[key] = "";
        packageData[key] += control.subarray(0, chuckLength).toString();
        control = control.subarray(chuckLength);
        if (packageData[key].trim() === ".") continue;
        chuckLength = 0;
        key = undefined;
        continue;
      }
    }
  }

  // Check is valid object
  Object.keys(packageData).forEach(key => packageData[key] = packageData[key].trim());
  if (!(packageData.Package && packageData.Architecture && packageData.Version)) {
    const err = new Error("Invalid control file");
    err["packageData"] = packageData;
    throw err;
  }
  if (packageData.Size) packageData.Size = Number(packageData.Size) as any;
  if (packageData["Installed-Size"]) packageData["Installed-Size"] = Number(packageData["Installed-Size"]) as any;
  return packageData as debianControl;
}

export function createControl(controlObject: debianControl) {
  let spaceInsident = Array(2).fill("").join(" ");
  let control: Buffer;
  for (const keyName in controlObject) {
    let data = controlObject[keyName];
    // Ignore undefined and null values
    if (data === undefined||data === null) continue;
    let keyBuffer: Buffer;

    if (keyName === "Depends" || keyName === "Suggests") {
      keyBuffer = Buffer.from(`${keyName}: ${data}`, "utf8");
    } else if (keyName === "Description" && typeof data === "string") {
      const description = data.trim().split("\n").map(line => line.trim());
      const fistDesc = description.shift();
      const newBreakes = description.map(line => line === "" ? "." : line).map(line => `${spaceInsident}${line}`);
      keyBuffer = Buffer.from(`${keyName}: ${fistDesc}\n${spaceInsident}${newBreakes.join("\n"+spaceInsident)}`, "utf8");
    } else if (typeof data === "string") keyBuffer = Buffer.from(`${keyName}: ${data}`, "utf8");
    else if (typeof data === "number") keyBuffer = Buffer.from(`${keyName}: ${data}`, "utf8");
    else if (typeof data === "boolean") keyBuffer = Buffer.from(`${keyName}: ${data}`, "utf8");

    // Add to Head
    if (keyBuffer?.length < 0) continue;
    if (control) control = Buffer.concat([control, Buffer.from("\n", "utf8"), keyBuffer]);
    else control = keyBuffer;
  }

  // Add break line to end
  return control = Buffer.concat([control, Buffer.from("\n", "utf8")]);
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
    let fileSize = 0;
    const fileHash = createHashAsync(fileStream).catch(reject);
    return fileStream.on("error", reject).on("data", chunck => fileSize += chunck.length).pipe(Ar.createUnpack((info, stream) => {
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
          packageControl.MD5Sum = hashData.md5;
          packageControl.SHA512 = hashData.sha512;
          packageControl.SHA256 = hashData.sha256;
          packageControl.SHA1 = hashData.sha1;
          packageControl.Size = fileSize;
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
  SHA1: {hash: string, size: number, file: string}[],
  SHA256: {hash: string, size: number, file: string}[],
  SHA512: {hash: string, size: number, file: string}[],
  MD5Sum: {hash: string, size: number, file: string}[],
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