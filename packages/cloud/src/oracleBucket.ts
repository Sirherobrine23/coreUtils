import * as ociBucket from "oci-objectstorage";
import * as ociAuth from "oci-common";
import { createReadStream, promises as fs } from "node:fs";
import { extendsFS } from "@sirherobrine23/extends";
import { finished } from "node:stream/promises";
import { http } from "@sirherobrine23/http";
import chokidar from "chokidar";
import stream from "node:stream";
import path from "node:path";

type RegionPretty<S extends string> = S extends `${infer T}_${infer U}` ? `${T}-${RegionPretty<U>}` : S
export type oracleRegions = RegionPretty<Lowercase<Exclude<Exclude<keyof typeof ociAuth.Region, typeof ociAuth.Region>, "values"|"enableInstanceMetadata"|"register"|"fromRegionId"|"getRegionIdFromShortCode"|"hasUsedConfigFile"|"prototype"|"REGION_STRING"|"REGION_ID_STRING"|"REGION_ID">>>;

export function getRegion(region: oracleRegions) {
  if (region === "uk-london-1") return ociAuth.Region.UK_LONDON_1;
  else if (region === "uk-cardiff-1") return ociAuth.Region.UK_CARDIFF_1;
  else if (region === "uk-gov-cardiff-1") return ociAuth.Region.UK_GOV_CARDIFF_1;
  else if (region === "uk-gov-london-1") return ociAuth.Region.UK_GOV_LONDON_1;
  else if (region === "sa-santiago-1") return ociAuth.Region.SA_SANTIAGO_1;
  else if (region === "sa-saopaulo-1") return ociAuth.Region.SA_SAOPAULO_1;
  else if (region === "sa-vinhedo-1") return ociAuth.Region.SA_VINHEDO_1;
  else if (region === "mx-queretaro-1") return ociAuth.Region.MX_QUERETARO_1;
  else if (region === "me-jeddah-1") return ociAuth.Region.ME_JEDDAH_1;
  else if (region === "me-abudhabi-1") return ociAuth.Region.ME_ABUDHABI_1;
  else if (region === "me-dubai-1") return ociAuth.Region.ME_DUBAI_1;
  else if (region === "me-dcc-muscat-1") return ociAuth.Region.ME_DCC_MUSCAT_1;
  else if (region === "il-jerusalem-1") return ociAuth.Region.IL_JERUSALEM_1;
  else if (region === "eu-zurich-1") return ociAuth.Region.EU_ZURICH_1;
  else if (region === "eu-stockholm-1") return ociAuth.Region.EU_STOCKHOLM_1;
  else if (region === "eu-paris-1") return ociAuth.Region.EU_PARIS_1;
  else if (region === "eu-milan-1") return ociAuth.Region.EU_MILAN_1;
  else if (region === "eu-marseille-1") return ociAuth.Region.EU_MARSEILLE_1;
  else if (region === "eu-madrid-1") return ociAuth.Region.EU_MADRID_1;
  else if (region === "eu-frankfurt-1") return ociAuth.Region.EU_FRANKFURT_1;
  else if (region === "eu-amsterdam-1") return ociAuth.Region.EU_AMSTERDAM_1;
  else if (region === "eu-jovanovac-1") return ociAuth.Region.EU_JOVANOVAC_1;
  else if (region === "eu-dcc-dublin-1") return ociAuth.Region.EU_DCC_DUBLIN_1;
  else if (region === "eu-dcc-dublin-2") return ociAuth.Region.EU_DCC_DUBLIN_2;
  else if (region === "eu-dcc-milan-1") return ociAuth.Region.EU_DCC_MILAN_1;
  else if (region === "eu-dcc-milan-2") return ociAuth.Region.EU_DCC_MILAN_2;
  else if (region === "eu-dcc-rating-1") return ociAuth.Region.EU_DCC_RATING_1;
  else if (region === "eu-dcc-rating-2") return ociAuth.Region.EU_DCC_RATING_2;
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
  else if (region === "ap-chiyoda-1") return ociAuth.Region.AP_CHIYODA_1;
  else if (region === "ap-dcc-canberra-1") return ociAuth.Region.AP_DCC_CANBERRA_1;
  else if (region === "ap-ibaraki-1") return ociAuth.Region.AP_IBARAKI_1;
  else if (region === "af-johannesburg-1") return ociAuth.Region.AF_JOHANNESBURG_1;
  else if (region === "us-sanjose-1") return ociAuth.Region.US_SANJOSE_1;
  else if (region === "us-phoenix-1") return ociAuth.Region.US_PHOENIX_1;
  else if (region === "us-chicago-1") return ociAuth.Region.US_CHICAGO_1;
  else if (region === "us-ashburn-1") return ociAuth.Region.US_ASHBURN_1;
  else if (region === "us-gov-chicago-1") return ociAuth.Region.US_GOV_CHICAGO_1;
  else if (region === "us-gov-ashburn-1") return ociAuth.Region.US_GOV_ASHBURN_1;
  else if (region === "us-gov-phoenix-1") return ociAuth.Region.US_GOV_PHOENIX_1;
  else if (region === "us-luke-1") return ociAuth.Region.US_LUKE_1;
  else if (region === "us-langley-1") return ociAuth.Region.US_LANGLEY_1;

  // Invalid region input
  throw new Error("Invalid Oracle Cloud region");
}

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

export type oracleOptions = {
  /** Bucket/Account region */
  region: oracleRegions;

  /**
   * Bucket namespaces
   *
   * from OCI Web interface url: `https://cloud.oracle.com/object-storage/buckets/<namespace>/<name>/objects`
  */
  namespace?: string;

  /**
   * Bucket name
   *
   * from OCI Web interface url: `https://cloud.oracle.com/object-storage/buckets/<namespace>/<name>/objects`
   */
  name: string;

  /**
   * Set user auth with Object or set array with file path in fist elementen and second set profile name necessary case.
   *
   * deprecated: pre-shared keys has been disabled, use `oracleBucketPreAuth` function.
   *
   * @example ["/home/user/.oci/config", "sirherobrine23"]
   * @example ["/home/user/.oci/config"]
   * @example ["c:\\.oci\\config"]
   * @example {tenancy: "oci", user: "example", fingerprint: "xx:xx:xx:xx:xx:xx:xx:xx:xx:xx", privateKey: "----OCI KEY----"}
   * @example {tenancy: "oci", user: "example", fingerprint: "xx:xx:xx:xx:xx:xx:xx:xx:xx:xx", privateKey: "----OCI KEY----", passphase: "mySuperPassword"}
   */
  auth?: {
    tenancy: string;
    user: string;
    fingerprint: string;
    privateKey: string;
    passphase?: string;
  }|string[];
}

/**
 * Create object with functions to manage files in Oracle cloud bucket
 */
export async function oracleBucket(config: oracleOptions) {
  const client = new ociBucket.ObjectStorageClient({authenticationDetailsProvider: (Array.isArray(config.auth ||= [])) ? new ociAuth.SessionAuthDetailProvider((config.auth||[])[0], (config.auth||[])[1]) : new ociAuth.SimpleAuthenticationDetailsProvider(config.auth.tenancy, config.auth.user, config.auth.fingerprint, config.auth.privateKey, config.auth.passphase||null, getRegion(config.region))});

  if (!(typeof config.namespace === "string" && !!(config.namespace = config.namespace.trim()))) config.namespace = (await client.getNamespace({})).value;
  await client.getBucket({bucketName: config.name, namespaceName: config.namespace});


  const partialFunctions = {
    /**
     * Upload file to Oracle cloud bucket.
     *
     * @param fileName - File location.
     * @param storageTier - Optional storage tier, default from seted in the Bucket.
     * @returns - Writable stream to Write file (is a PassThrough but for writing only).
     */
    uploadFile(fileName: string, storageTier?: "Archive"|"InfrequentAccess"|"Standard") {
      let uploadId: string, uploadPartNum: string[] = [];
      return new stream.Writable({
        autoDestroy: true,
        emitClose: true,
        async write(chunk: Buffer, encoding, callback) {
          try {
            if (!(Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);
            if (!uploadId) {
              const { multipartUpload } = await client.createMultipartUpload({
                namespaceName: config.namespace,
                bucketName: config.name,
                createMultipartUploadDetails: {
                  object: fileName,
                  storageTier: storageTier === "Archive" ? ociBucket.models.StorageTier.Archive : storageTier === "InfrequentAccess" ? ociBucket.models.StorageTier.InfrequentAccess : storageTier === "Standard" ? ociBucket.models.StorageTier.Standard : undefined,
                }
              });
              uploadId = multipartUpload.uploadId;
            }
            const res = await client.uploadPart({
              namespaceName: config.namespace,
              bucketName: config.name,
              objectName: fileName,
              uploadId,
              uploadPartBody: chunk,
              uploadPartNum: uploadPartNum.length + 1,
            });
            uploadPartNum.push(res.eTag);
            callback();
          } catch (e) {
            callback(e);
          }
        },
        async destroy(error, callback) {
          if (!uploadId) return callback(error);
          try {
            if (error) {
              await client.abortMultipartUpload({
                namespaceName: config.namespace,
                bucketName: config.name,
                objectName: fileName,
                uploadId
              });
              callback(error);
            } else {
              await client.commitMultipartUpload({
                namespaceName: config.namespace,
                bucketName: config.name,
                objectName: fileName,
                uploadId,
                commitMultipartUploadDetails: {
                  partsToCommit: uploadPartNum.map((etag, index) => ({etag, partNum: index + 1}))
                }
              });
              callback(null);
            }
          } catch (e) {
            e["originalError"] = error;
            callback(e);
          }
        },
      });
    },
    /**
     * Delete file in the Bucket
     * @param pathLocation - File location/name.
     */
    async deleteObject(pathLocation: string) {
      await client.deleteObject({
        namespaceName: config.namespace,
        bucketName: config.name,
        objectName: pathLocation
      });
    },
    /**
     * List files and folder in the Bucket
     * @param folder - Folder name
     * @returns
     */
    async listFiles(folder?: string) {
      const objects: oracleFileListObject[] = [];
      let start: any;
      while (true) {
        const { listObjects } = await client.listObjects({
          namespaceName: config.namespace,
          bucketName: config.name,
          fields: "name,size,etag,timeCreated,md5,timeModified,storageTier,archivalState" as any,
          prefix: folder,
          startAfter: start
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
    },
    /**
     * Get file from bucket.
     * @param pathLocation - File path
     * @returns return file stream
     */
    async getFileStream(pathLocation: string) {
      const { value } = await client.getObject({namespaceName: config.namespace, bucketName: config.name, objectName: pathLocation});
      if (!value) throw new Error("No file found");
      else if (value instanceof stream.Readable) return value;
      else return stream.Readable.fromWeb(value as any);
    }
  };
  return partialFunctions;
}

/**
 * Maneger bucket with pre auth keys
 *
 * @param region - Bucket region
 * @param namespace - Bucket namespace
 * @param name - Bucket name
 * @param preAuthKey - Auth key
 */
export function oracleBucketPreAuth(region: oracleRegions, namespace: string, name: string, preAuthKey: string) {
  getRegion(region); // Check valid region
  if (!preAuthKey) throw new Error("Pre auth key is required");
  const bucketPath = path.posix.join("/p", preAuthKey, "n", namespace, "b", name);
  const funs = {
    /**
     * Get file from Bucket
     *
     * @param filename - File name in Bucket
     * @returns
     */
    getFile(filename: string) {
      if (typeof filename !== "string") throw new Error("Requrie file name!");
      filename = filename.trim().slice(-1024).split(path.win32.sep).join(path.posix.sep);
      if (filename.startsWith(path.posix.sep)) filename = filename.slice(1);
      filename = encodeURIComponent(filename);
      return http.streamRoot(new URL(path.posix.join(bucketPath, "o", filename), `https://objectstorage.${region}.oraclecloud.com`), {disableHTTP2: true}, true);
    },
    /**
     * Upload file to bucket
     *
     * @param filename - File name to add in Bucket
     * @param storageTier - Another tier to storage file
     * @returns Stream to write file
     */
    uploadFile(filename: string, storageTier?: oracleFileListObject["storageTier"]) {
      if (typeof filename !== "string") throw new Error("Requrie file name!");
      filename = filename.trim().slice(-1024).split(path.win32.sep).join(path.posix.sep);
      if (filename.startsWith(path.posix.sep)) filename = filename.slice(1);
      filename = encodeURIComponent(filename);
      let uploaduuid: string,  uploadPartNum = 1;
      return new stream.Writable({
        autoDestroy: true,
        emitClose: true,
        async write(chunk: Buffer, encoding, callback) {
          try {
            if (!(Buffer.isBuffer(chunk))) chunk = Buffer.from(chunk, encoding);
            if (!uploaduuid) {
              const { body } = await http.jsonRequest(new URL(path.posix.join(bucketPath, "o", filename), `https://objectstorage.${region}.oraclecloud.com`), {
                disableHTTP2: true,
                method: "PUT",
                headers: {
                  "opc-multipart": "true",
                  ...(!!storageTier ? {"storage-tier": storageTier} : {}),
                },
                body: Buffer.from([])
              });
              uploaduuid = body.uploadId;
            }
            await http.bufferRequest(new URL(path.posix.join(bucketPath, "u", filename, "id", uploaduuid, uploadPartNum.toString()), `https://objectstorage.${region}.oraclecloud.com`), {
              disableHTTP2: true,
              method: "PUT",
              headers: {
                "Content-Lenght": chunk.byteLength.toString(),
              },
              body: chunk
            });
            uploadPartNum++;
            this.emit("progress", uploadPartNum, chunk.byteLength);
            callback();
          } catch (err) {
            callback(err);
          }
        },
        async destroy(error, callback) {
          try {
            if (uploaduuid) {
              if (error) {
                await http.bufferRequest(new URL(path.posix.join(bucketPath, "u", filename, "id", uploaduuid, "/"), `https://objectstorage.${region}.oraclecloud.com`), {
                  disableHTTP2: true,
                  method: "DELETE"
                });
              } else {
                await http.bufferRequest(new URL(path.posix.join(bucketPath, "u", filename, "id", uploaduuid, "/"), `https://objectstorage.${region}.oraclecloud.com`), {
                  disableHTTP2: true,
                  method: "POST",
                  body: Buffer.from([])
                });
              }
            }
            callback(error);
          } catch (err) {
            callback(err);
          }
        },
      });
    },
    /**
     * List files in Bucket
     * @returns Files array
     */
    async listFiles(folder: string = "") {
      const data: oracleFileListObject[] = [];
      let startAfter: string;
      while (true) {
        const response = await http.jsonRequest<{nextStartWith?: string, objects: ociBucket.models.ObjectSummary[]}>(new URL(path.posix.join(bucketPath, "o"), `https://objectstorage.${region}.oraclecloud.com`), {
          method: "GET",
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
          storageTier: item.storageTier as any,
          md5: item.md5,
          getFile: async () => funs.getFile(item.name),
          Dates: {
            Created: new Date(item.timeCreated),
            Modified: new Date(item.timeModified)
          }
        }));
        if (!(startAfter = response.body.nextStartWith)) break;
      }
      return data;
    }
  };
  return funs;
}

export interface watchConfig {
  skipSyncFiles?: boolean;
  remoteFolder?: string;
  listFiles(folderPath?: string): Promise<oracleFileListObject[]>;
  uploadFile(filename: string): stream.Writable;
  deleteObject?(path: string): Promise<void>;
}

/**
 * Sync files and folder from local to bucket
 * @param folderPath - Local folder path
 * @param config - Settings to sync files and more
 */
export async function watch(folderPath: string, config: watchConfig) {
  if (!folderPath) throw new TypeError("Folder path is required");
  if (!config) throw new Error("Require configs!");
  else if (!(await extendsFS.exists(folderPath))) throw new Error("Folder path is not exists");
  else if (!(await extendsFS.isDirectory(folderPath))) throw new Error("Folder path is not a directory");
  config.remoteFolder ||= "";
  config.deleteObject ||= () => Promise.resolve();
  if (config.skipSyncFiles !== true) {
    const remoteFiles = await config.listFiles(config.remoteFolder);
    await extendsFS.readdirV2(folderPath, true, () => true, async (relativePath, fullPath, stats) => {
      if (stats.isDirectory()) return;
      const find = remoteFiles.find(item => item.name === path.posix.resolve("/", config.remoteFolder||"", relativePath).slice(1));
      if (!find) return finished(createReadStream(fullPath).pipe(config.uploadFile(path.posix.resolve("/", config.remoteFolder||"", relativePath))), {error: true});
      else if (stats.size !== find.size) return finished(createReadStream(fullPath).pipe(config.uploadFile(path.posix.resolve("/", config.remoteFolder||"", relativePath))), {error: true});
    });
  }

  async function syncFile(local: string) {
    if ((await fs.lstat(local)).isDirectory()) return;
    return finished(createReadStream(local).pipe(config.uploadFile(path.posix.resolve("/", config.remoteFolder||"", path.relative(folderPath, local)))))
  }
  async function deleteFF(local: string) {
    return config.deleteObject(path.posix.resolve("/", config.remoteFolder||"", path.relative(folderPath, local)));
  }

  const watch = chokidar.watch(folderPath, {ignoreInitial: true, atomic: true});
  watch.on("add", async (filePath) => syncFile(filePath).catch(err => watch.emit("error", err)));
  watch.on("change", async (filePath) => syncFile(filePath).catch(err => watch.emit("error", err)));
  watch.on("unlink", async (filePath) => deleteFF(filePath).catch(err => watch.emit("error", err)));
  watch.on("unlinkDir", async (filePath) => deleteFF(filePath).catch(err => watch.emit("error", err)));
  return watch;
}