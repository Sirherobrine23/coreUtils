import * as ociBucket from "oci-objectstorage";
import * as ociAuth from "oci-common";
import * as coreHttp from "@sirherobrine23/http";
import * as Extends from "@sirherobrine23/extends";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import chokidar from "chokidar";
import stream from "node:stream";
import utils from "node:util";
import path from "node:path";

export type oracleRegions = "af-johannesburg-1"|"ap-chuncheon-1"|"ap-hyderabad-1"|"ap-melbourne-1"|"ap-mumbai-1"|"ap-osaka-1"|"ap-seoul-1"|"ap-singapore-1"|"ap-sydney-1"|"ap-tokyo-1"|"ca-montreal-1"|"ca-toronto-1"|"eu-amsterdam-1"|"eu-frankfurt-1"|"eu-madrid-1"|"eu-marseille-1"|"eu-milan-1"|"eu-paris-1"|"eu-stockholm-1"|"eu-zurich-1"|"il-jerusalem-1"|"me-abudhabi-1"|"me-jeddah-1"|"mx-queretaro-1"|"sa-santiago-1"|"sa-saopaulo-1"|"sa-vinhedo-1"|"uk-cardiff-1"|"uk-london-1"|"us-ashburn-1"|"us-chicago-1"|"us-phoenix-1"|"us-sanjose-1";
export type oracleOptions = {
  region: oracleRegions,
  namespace: string,
  name: string,
  auth: {
    type: "user"
    tenancy: string,
    user: string,
    fingerprint: string,
    privateKey: string,
    passphase?: string,
  }|{
    type: "preAuthentication",
    PreAuthenticatedKey: string,
  }
}

function getRegion(region: oracleRegions) {
  if (region === "uk-london-1") return ociAuth.Region.UK_LONDON_1;
  else if (region === "uk-cardiff-1") return ociAuth.Region.UK_CARDIFF_1;
  else if (region === "sa-santiago-1") return ociAuth.Region.SA_SANTIAGO_1;
  else if (region === "sa-saopaulo-1") return ociAuth.Region.SA_SAOPAULO_1;
  else if (region === "sa-vinhedo-1") return ociAuth.Region.SA_VINHEDO_1;
  else if (region === "mx-queretaro-1") return ociAuth.Region.MX_QUERETARO_1;
  else if (region === "me-jeddah-1") return ociAuth.Region.ME_JEDDAH_1;
  else if (region === "me-abudhabi-1") return ociAuth.Region.ME_ABUDHABI_1;
  else if (region === "il-jerusalem-1") return ociAuth.Region.IL_JERUSALEM_1;
  else if (region === "eu-zurich-1") return ociAuth.Region.EU_ZURICH_1;
  else if (region === "eu-stockholm-1") return ociAuth.Region.EU_STOCKHOLM_1;
  else if (region === "eu-paris-1") return ociAuth.Region.EU_PARIS_1;
  else if (region === "eu-milan-1") return ociAuth.Region.EU_MILAN_1;
  else if (region === "eu-marseille-1") return ociAuth.Region.EU_MARSEILLE_1;
  else if (region === "eu-madrid-1") return ociAuth.Region.EU_MADRID_1;
  else if (region === "eu-frankfurt-1") return ociAuth.Region.EU_FRANKFURT_1;
  else if (region === "eu-amsterdam-1") return ociAuth.Region.EU_AMSTERDAM_1;
  else if (region === "ca-toronto-1") return ociAuth.Region.CA_TORONTO_1;
  else if (region === "ca-montreal-1") return ociAuth.Region.CA_MONTREAL_1;
  else if (region === "ap-tokyo-1") return ociAuth.Region.AP_TOKYO_1;
  else if (region === "ap-sydney-1") return ociAuth.Region.AP_SYDNEY_1;
  else if (region === "ap-singapore-1") return ociAuth.Region.AP_SINGAPORE_1;
  else if (region === "ap-seoul-1") return ociAuth.Region.AP_SEOUL_1;
  else if (region === "ap-osaka-1") return ociAuth.Region.AP_OSAKA_1;
  else if (region === "ap-mumbai-1") return ociAuth.Region.AP_MUMBAI_1;
  else if (region === "ap-melbourne-1") return ociAuth.Region.AP_MELBOURNE_1;
  else if (region === "ap-hyderabad-1") return ociAuth.Region.AP_HYDERABAD_1;
  else if (region === "ap-chuncheon-1") return ociAuth.Region.AP_CHUNCHEON_1;
  else if (region === "af-johannesburg-1") return ociAuth.Region.AF_JOHANNESBURG_1;
  else if (region === "us-sanjose-1") return ociAuth.Region.US_SANJOSE_1;
  else if (region === "us-phoenix-1") return ociAuth.Region.US_PHOENIX_1;
  else if (region === "us-chicago-1") return ociAuth.Region.US_CHICAGO_1;
  else if (region === "us-ashburn-1") return ociAuth.Region.US_ASHBURN_1;
  else throw new Error("Invalid Oracle Cloud region");
}

function checkFileName(name: string) {
  if (!name) throw new Error("File name is required");
  else if (typeof name !== "string") throw new Error("File name must be a string");
  else if (name.length > 1024) throw new Error("File name must be less than 1024 characters");
  else if (name.length < 1) throw new Error("File name must be at least 1 character");
  return name;
}

type oracleFileListObjectinternal = {
  "name": string,
  "size"?: number,
  "timeCreated"?: string,
  "timeModified"?: string,
  "etag"?: string,
  "storageTier"?: "Standard"|"InfrequentAccess"|"Archive",
  "archivalState"?: "Archived"|"Restoring"|"Restored",
  "md5"?: string
};

export type oracleFileListObject = {
  name: string,
  size: number,
  etag: string,
  storageTier: "Standard"|"InfrequentAccess"|"Archive",
  md5: string,
  getFile: () => Promise<stream.Readable>,
  Dates: {
    Created: Date,
    Modified: Date
  },
};

export type oracleBucket = {
  listFiles(folderPath?: string): Promise<oracleFileListObject[]>,
  deleteFile(pathLocation: string): Promise<void>,
  uploadFile(fileName: string, fileStream: string|Buffer|stream.Readable): Promise<void>,
  getFileStream(pathLocation: string): Promise<stream.Readable>,
  updateTier?(filePath: string, storageTier: "Standard"|"InfrequentAccess"|"Archive"): Promise<void>,
  watch?(filePath: string, options?: {downloadFist?: boolean, remoteFolder?: string}): Promise<chokidar.FSWatcher>,
};

/**
 * Create object with functions to manage files in Oracle cloud bucket
 */
export async function oracleBucket(config: oracleOptions): Promise<oracleBucket> {
  const partialFunctions: Partial<oracleBucket> = {};
  if (config.auth.type === "preAuthentication") {
    if (!config.auth.PreAuthenticatedKey) throw new Error("PreAuthenticatedKey is required");
    getRegion(config.region);
    const baseURL = utils.format("https://objectstorage.%s.oraclecloud.com/p/%s/n/%s/b/%s", config.region, config.auth.PreAuthenticatedKey, config.namespace, config.name);

    function fixDir(filePath: string) {
      filePath = path.posix.normalize(path.posix.resolve("/", filePath));
      if (filePath.startsWith("/")) filePath = filePath.slice(1);
      return filePath;
    }

    partialFunctions.uploadFile = async function uploadFile(fileName: string, fileStream: string|Buffer|stream.Readable) {
      await coreHttp.bufferRequest({
        method: "PUT",
        url: utils.format("%s/o/%s", baseURL, fixDir(checkFileName(fileName))),
        body: fileStream,
        headers: {
          "Content-Type": "application/octet-stream",
        }
      })
    }

     partialFunctions.deleteFile = async function deleteFile(pathLocation: string) {
      await coreHttp.bufferRequest({
        method: "DELETE",
        url: utils.format("%s/o/%s", baseURL, fixDir(checkFileName(pathLocation))),
      })
    }

    partialFunctions.listFiles = async function listFiles(folder: string = "") {
      folder = fixDir(folder);
      const data: oracleFileListObject[] = [];
      let startAfter: string;
      while (true) {
        const response = await coreHttp.jsonRequest<{nextStartWith?: string, objects: oracleFileListObjectinternal[]}>({
          method: "GET",
          url: utils.format("%s/o", baseURL),
          query: {
            limit: 1000,
            fields: "name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState",
            prefix: folder ?? "",
            startAfter: startAfter ?? "",
          }
        });
        response.body.objects.forEach(item => data.push({
          name: item.name,
          size: item.size,
          etag: item.etag,
          storageTier: item.storageTier,
          md5: item.md5,
          getFile: () => partialFunctions!.getFileStream(item.name),
          Dates: {
            Created: new Date(item.timeCreated),
            Modified: new Date(item.timeModified)
          }
        }));
        if (!(startAfter = response.body.nextStartWith)) break;
      }
      return data;
    }

    partialFunctions.getFileStream = async function getFileStream(pathLocation: string): Promise<stream.Readable> {
      const response = await coreHttp.streamRequest({
        method: "GET",
        url: utils.format("%s/o/%s", baseURL, fixDir(checkFileName(pathLocation))),
      });
      return response;
    }

    // async function renameFile(currentName: string, newName: string) {
    //   await coreHttp.bufferRequest({
    //     method: "POST",
    //     url: utils.format("%s/actions/renameObject", baseURL),
    //     headers: {
    //       "Content-Type": "application/json",
    //     },
    //     body: JSON.stringify({
    //       sourceName: checkFileName(currentName),
    //       newName: checkFileName(newName),
    //       srcObjIfMatchETag: "*",
    //       newObjIfMatchETag: "*",
    //       newObjIfNoneMatchETag: "*"
    //     })
    //   });
    // }

    partialFunctions.updateTier = async function updateTier(filePath: string, storageTier: "Standard"|"InfrequentAccess"|"Archive") {
      if (!(["Standard", "InfrequentAccess", "Archive"]).includes(storageTier)) throw new TypeError("Invalid storage tier");
      await coreHttp.bufferRequest({
        method: "POST",
        url: utils.format("%s/actions/updateObjectStorageTier", baseURL),
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          objectName: fixDir(checkFileName(filePath)),
          storageTier,
        }
      });
    }
  } else {
    const client = new ociBucket.ObjectStorageClient({
      authenticationDetailsProvider: new ociAuth.SimpleAuthenticationDetailsProvider(
        config.auth.tenancy,
        config.auth.user,
        config.auth.fingerprint,
        config.auth.privateKey,
        config.auth.passphase||null,
        getRegion(config.region)
      )
    });

    partialFunctions.uploadFile = async function uploadFile(fileName: string, fileStream: string|Buffer|stream.Readable) {
      await client.putObject({
        namespaceName: config.namespace,
        bucketName: config.name,
        objectName: fileName,
        putObjectBody: fileStream,
      });
    }

    partialFunctions.deleteFile = async function deleteFile(pathLocation: string) {
      await client.deleteObject({
        namespaceName: config.namespace,
        bucketName: config.name,
        objectName: pathLocation
      });
    }

    partialFunctions.listFiles = async function listFiles(folder?: string) {
      const objects: oracleFileListObject[] = [];
      let start: any;
      while (true) {
        const { listObjects } = await client.listObjects({
          namespaceName: config.namespace,
          bucketName: config.name,
          fields: "name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState" as any,
          prefix: folder,
          startAfter: start,
        });
        listObjects.objects.forEach(item => objects.push({
          name: item.name,
          size: item.size,
          etag: item.etag,
          storageTier: item.storageTier as any,
          md5: item.md5,
          getFile: () => partialFunctions!.getFileStream(item.name),
          Dates: {
            Created: new Date(item.timeCreated),
            Modified: new Date(item.timeModified)
          }
        }))
        if (!(start = listObjects.nextStartWith)) break;
      }

      return objects;
    }

    partialFunctions.getFileStream = async function getFileStream(pathLocation: string) {
      const { value } = await client.getObject({
        namespaceName: config.namespace,
        bucketName: config.name,
        objectName: pathLocation,
      });
      if (!value) throw new Error("No file found");
      else if (value instanceof stream.Readable) return value;
      else return stream.Readable.fromWeb(value as any);
    }
  }

  partialFunctions.watch = async function(folderPath, options) {
    if (!options) options = {};
    if (!folderPath) throw new TypeError("Folder path is required");
    else if (!(await Extends.exists(folderPath))) throw new Error("Folder path is not exists");
    else if (!(await Extends.isDirectory(folderPath))) throw new Error("Folder path is not a directory");
    if (options.downloadFist) {
      let { remoteFolder = "" } = options;
      const filesList = (await partialFunctions!.listFiles(remoteFolder)).map(d => d.name);
      const localList = (await Extends.readdir(folderPath)).map(file => path.posix.resolve("/", path.relative(folderPath, file)));
      for (const local of localList) if (!filesList.includes(local)) await fs.unlink(path.posix.resolve(folderPath, local));
      for await (const remote of filesList) await new Promise(async (done, reject) => (await partialFunctions!.getFileStream(remote)).pipe(createWriteStream(path.posix.resolve(folderPath, remote))).on("error", reject).once("done", done));
    }

    return chokidar.watch(folderPath, {
      ignoreInitial: true,
      atomic: true,
    }).on("add", async (filePath) => {
      await partialFunctions!.uploadFile(path.posix.resolve("/", path.relative(folderPath, filePath)), createReadStream(filePath));
    }).on("change", async (filePath) => {
      await partialFunctions!.uploadFile(path.posix.resolve("/", path.relative(folderPath, filePath)), createReadStream(filePath));
    }).on("unlink", async (filePath) => {
      await partialFunctions!.deleteFile(path.posix.resolve("/", path.relative(folderPath, filePath)));
    }).on("unlinkDir", async (filePath) => {
      const filesList = (await partialFunctions!.listFiles(path.posix.resolve("/", path.relative(folderPath, filePath)))).map(d => d.name);
      for await (const remote of filesList) await partialFunctions!.deleteFile(remote);
    });
  }

  return partialFunctions as oracleBucket;
}