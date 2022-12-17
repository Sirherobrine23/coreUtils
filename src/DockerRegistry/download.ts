import * as httpRequestLarge from "../request/large.js";
import * as dockerUtils from "./utils.js";
import * as Manifests from "./manifests.js";
import * as extendFs from "../extendsFs.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import debug from "debug";
const blobsDebug = debug("coreutils:oci:blobs");

export async function downloadBlob(repo: string | Manifests.manifestOptions, options?: Manifests.platfomTarget & {storage?: string}) {
  const repoControl = await Manifests.Manifest(repo, options);
  const blob = await repoControl.imageManifest();
  const token = await dockerUtils.getToken(repoControl.repoConfig);
  const ids: string[] = [];
  for (const layer of blob.layers) {
    const saveFolder = path.join(options?.storage?path.resolve(options?.storage):path.join(os.tmpdir(), ".sircoreoci"), layer.digest.replace("sha256:", ""));
    if (await extendFs.exists(saveFolder)) {
      blobsDebug("Deleting %s in \"%s\"", layer.digest, saveFolder);
      await fs.rm(saveFolder, {recursive: true, force: true});
    }
    await httpRequestLarge.tarExtract({
      url: repoControl.endpointsControl.blob.get_delete(layer.digest),
      folderPath: saveFolder,
      headers: {
        Authorization: `Bearer ${token}`
      }
    }).then(folder => ids.push(folder)).catch(err => {blobsDebug("Blob %s error: %O", layer, err); return "";});
  }

  return Promise.all(ids.map(async folder => {
    const files = await extendFs.readdirrecursive(folder);
    return {
      path: folder,
      files
    };
  }));
}