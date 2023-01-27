import { requestOptions, streamRequest, validURL } from "./main.js";
import { createWriteStream, promises as fs } from "node:fs";
import { extendsCrypto, extendsFS } from "../../extends/src/index.js";
import { tmpdir } from "node:os";
import adm_zip from "adm-zip";
import path from "node:path";
import tar from "tar";

export default saveFile;
export async function saveFile(options: validURL|requestOptions & { path?: string}) {
  if (typeof options === "string"||options instanceof URL) options = {url: options};
  const onSave = options?.path || path.join(tmpdir(), (await extendsCrypto.createHashAsync(JSON.stringify(options))).hash.sha1+".tmp_request");
  const data = await streamRequest(options);
  await new Promise<void>((done, reject) => data.pipe(createWriteStream(onSave)).on("error", reject).once("close", done));
  return {
    path: onSave,
    headers: data.headers
  };
}

export async function admZip(...args: Parameters<typeof saveFile>) {
  const { path: filePath, headers } = await saveFile(...args);
  const zip = new adm_zip(filePath);
  return {
    headers,
    filePath,
    deleteFile: () => fs.rm(filePath, {force: true}),
    zip,
  };
}

export function Tar(request: requestOptions["url"]|requestOptions) {
  async function extract(): Promise<tar.Parse>;
  async function extract(folderPath: string): Promise<string>;
  async function extract(folderPath?: string) {
    if (typeof folderPath === "string") {
      if (typeof folderPath === "string") {
        if (!await extendsFS.exists(folderPath)) await fs.mkdir(folderPath, {recursive: true});
      }
      const stream = await streamRequest(request);
      const piped = stream.pipe(tar.extract({cwd: folderPath}));
      await new Promise<void>(done => piped.once("close", done));
      return folderPath;
    }
    return streamRequest(request).then(res => res.pipe(tar.list()));
  }

  async function listFiles(): Promise<{path: string, size: number}[]>;
  async function listFiles(callback: (data: tar.ReadEntry) => void): Promise<void>;
  async function listFiles(callback?: (data: tar.ReadEntry) => void): Promise<{path: string, size: number}[]|void> {
    const piped = (await streamRequest(request)).pipe(tar.list());
    let files: void|{path: string, size: number}[];
    if (typeof callback === "function") piped.on("entry", entry => callback(entry));
    else {
      files = [];
      piped.on("entry", entry => typeof files === "undefined" ? null : files.push({
        path: entry.path,
        size: entry.size
      }));
    }
    await new Promise<void>(done => piped.on("end", done));
    return files;
  }

  const method = ((typeof request === "string"||request instanceof URL) ? "GET" : request?.method)||"GET";
  async function compress(folderPath: string, options: tar.CreateOptions) {
    if ((["get", "GET"]).includes(method)) throw new TypeError("Compress no avaible to GET method!");
    if (!folderPath) throw new TypeError("Required folder!");
    if (!await extendsFS.exists(folderPath)) throw new Error("Folder not exists to compress");
    await streamRequest({
      ...(request as requestOptions),
      body: tar.create(options, [])
    });
  }

  return {
    extract,
    listFiles,
    compress
  };
}
