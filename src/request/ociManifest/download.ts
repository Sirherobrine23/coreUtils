import * as httpRequestLarge from "../large";
import * as Manifests from "./manifests";

export async function downloadBlob(repositoryOptions: Manifests.manifestOptions, options?: Manifests.fetchPackageOptions) {
  const blob = await Manifests.fetchPackage(repositoryOptions, options);
  const token = await Manifests.getToken(repositoryOptions);
  return Promise.all(blob.layers.map(async layer => {
    return httpRequestLarge.tarExtract({
      url: `http://${repositoryOptions.registryBase}/v2/${repositoryOptions.owner}/${repositoryOptions.repository}/blobs/${layer.digest}`,
      headers: {
        Authorization: `Bearer ${token}`
      }
    }).catch(() => {});
  }));
}