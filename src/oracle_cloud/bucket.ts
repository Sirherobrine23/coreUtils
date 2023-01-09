import endpoint, {authKey, regionLocation} from "./endpoint.js";
import { bufferFetch, getJSON, pipeFetch } from "../request/simples.js";
import { Readable } from "node:stream";
import { ReadStream } from "node:fs";

export type fileObject = {
  objects: {
    name: string,
    size?: number,
    timeCreated: Date,
    timeModified: Date,
    md5?: string,
    etag?: string,
    storageTier?: "Standard"|"Archive",
  }[]
};

/**
 *
 * @param region - Oracle Cloud Region
 * @param bucketName - Bucket Name
 * @param bucketNameSpace - Bucket Namespace
 * @param auth - Authentication Key or preauthenticated key
 * @returns
 */
export default async function main(region: regionLocation, bucketName: string, bucketNameSpace: string, auth: authKey|string) {
  if (auth instanceof authKey) throw new Error("Not implemented authKey");
  const {object_storage} = endpoint(region);
  let baseURL = `${object_storage}/n/${bucketNameSpace}/b/${bucketName}`;
  if (typeof auth === "string") baseURL = `${object_storage}/p/${auth}/n/${bucketNameSpace}/b/${bucketName}`;

  async function fileList() {
    let request: Promise<fileObject>;
    if (typeof auth === "string") request = getJSON(`${baseURL}/o?fields=name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState`);
    else request = getJSON({
      url: `${baseURL}/o?fields=name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState`,
      headers: {}
    });

    return (await request).objects.map(file => {
      if (!file.name.startsWith("/")) file.name = `/${file.name}`;
      if (file.timeCreated) file.timeCreated = new Date(file.timeCreated);
      if (file.timeModified) file.timeModified = new Date(file.timeModified);
      return file;
    });
  }

  async function getFileStream(path: string) {
    if (!path.startsWith("/")) path = `/${path}`;
    if (!(await fileList()).find(file => file.name === path)) throw new Error("File not found");
    if (typeof auth === "string") return pipeFetch(`${baseURL}/o${path}`);
    return pipeFetch({
      url: `${baseURL}/o${path}`,
      headers: {}
    });
  }

  async function uploadFile(name: string, file: Readable|ReadStream|Buffer) {
    if (!name.startsWith("/")) name = `/${name}`;
    return bufferFetch({
      url: `${baseURL}/o${name}`,
      method: "PUT",
      body: file,
      headers: {}
    });
  }

  return {
    fileList,
    getFileStream,
    uploadFile,
  };
}