import { debianControl, parseControl } from "./debian_package.js";
import { Readable, Writable } from "node:stream";
import { http } from "../../http/src/index.js";
import lzma from "lzma-native";
import path from "node:path";
import zlib from "node:zlib";

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

/**
 * Extract all Packages from binary file (/dists/${distribuition}/${suite}/binary-${arch}/Packages
 *
 * @param streamRead - Packages stream (raw text not gzip or xz)
 * @returns
 */
export async function parsePackages(streamRead: Readable) {
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

/**
 * Parse Release file from debian repository
 *
 * @param fileData - Buffer from Release file
 * @returns
 */
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

/**
 * Get debian packages control files from a debian repository
 * @param baseURL - The base URL of the repository example: http://deb.debian.org/debian
 * @param Release - The release file of the repository
 * @returns An object with the components as keys and the architectures as keys and the packages as values
 */
export async function getPackages(baseURL: string|URL, Release: releaseType) {
  const packagesObj: {[component: string]: {[arch: string]: debianControl[]}} = {};
  const {Components, Architectures} = Release;
  for (const component of Components) {
    for (const arch of Architectures) {
      const baseRequest = new URL(baseURL);
      baseRequest.pathname = path.posix.resolve(baseRequest.pathname, component, `binary-${arch}`, "Packages");
      const packagesURLString = baseRequest.toString();
      const stream = await http.streamRequest(packagesURLString).catch(() => http.streamRequest(packagesURLString+".gz").then(stream => stream.pipe(zlib.createGunzip()))).catch(() => http.streamRequest(packagesURLString+".xz").then(stream => stream.pipe(lzma.Decompressor())));
      packagesObj[component] ??= {};
      packagesObj[component][arch] ??= [];
      packagesObj[component][arch] = await parsePackages(stream);
    }
  }
  return packagesObj;
}