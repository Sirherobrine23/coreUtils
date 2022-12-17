import { Readable } from "node:stream";
import * as httpRequest from "../request/simples.js";
import * as dockerUtils from "./utils.js";
import debug from "debug";
const manifestDebug = debug("coreutils:oci");

export const ARCH_GO_NODE: {[arch in NodeJS.Architecture]?: string} = Object.freeze({
  x64: "amd64",
  arm64: "arm64",
  arm: "arm",
  ppc: "ppc",
  ppc64: "ppc64",
  s390: "s390",
  s390x: "s390x",
  mips: "mips"
});

export const OS_GO_NODE: {[platform in NodeJS.Platform]?: string} = Object.freeze({
  win32: "windows",
  sunos: "solaris",
  linux: "linux",
  darwin: "darwin",
  android: "android",
  aix: "aix",
  freebsd: "freebsd",
  netbsd: "netbsd",
  openbsd: "openbsd"
});

export type manifestOptions = {
  authBase?: string,
  authService?: string,
  registryBase: string,
  // ------------------
  repository: string,
  owner: string,
  tagDigest?: string
};

export type tagList = {name: string, tags: string[]};

export type dockerManifestMultiArchPlatform = {
  mediaType: "application/vnd.docker.distribution.manifest.list.v2+json",
  schemaVersion: 2,
  manifests: {
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    digest: string,
    size: number,
    platform: {
      architecture: string,
      os: string,
      variants?: string,
      "os.version"?: string
    }
  }[]
};

export type dockerManifestLayer = {
  mediaType: "application/vnd.docker.distribution.manifest.v2+json",
  schemaVersion: 2,
  config: {
    mediaType: "application/vnd.docker.container.image.v1+json",
    digest: string,
    size: number
  },
  layers: {
    mediaType: "application/vnd.docker.image.rootfs.diff.tar.gzip",
    digest: string,
    size: number,
  }[]
};

export type ociManifestMultiArchPlatform = {
  schemaVersion: 2,
  manifests: {
    mediaType: "application/vnd.oci.image.manifest.v1+json",
    digest: string,
    size: number,
    platform: {
      architecture: string,
      os: string,
      variants?: string,
      "os.version"?: string
    },
    annotations?: {[label: string]: string}
  }[]
};

export type ociManifestLayer = {
  schemaVersion: 2,
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json",
    digest: string,
    size: number
  },
  layers: {
    mediaType: "application/vnd.oci.image.layer.v1.tar"|"application/vnd.oci.image.layer.v1.tar+gzip"|"application/vnd.oci.image.layer.v1.tar+zstd"|"application/vnd.oci.image.layer.nondistributable.v1.tar"|"application/vnd.oci.image.layer.nondistributable.v1.tar+gzip"|"application/vnd.oci.image.layer.nondistributable.v1.tar+zstd",
    digest: string,
    size: number,
    annotations?: {[key: string]: string}
  }[],
  annotations?: {[key: string]: string}
};

export type blobInfo = {
  architecture: string,
  os: string,
  created?: string,
  config?: {
    Env?: string[],
    Entrypoint?: string[],
    Cmd?: string[],
    Volumes?: {[mountPath: string]: {}},
    WorkingDir?: string,
    StopSignal?: NodeJS.Signals,
    ArgsEscaped?: boolean,
    OnBuild?: null
  },
  rootfs: {
    type: "layers",
    diff_ids: string[]
  }
};

export type platfomTarget = {platform?: NodeJS.Platform, arch?: NodeJS.Architecture};
export default Manifest;
export async function Manifest(repo: string|manifestOptions, platform_target: platfomTarget = {platform: process.platform, arch: process.arch}) {
  if (typeof repo === "string") {
    manifestDebug("Convert %s to repo object", repo);
    repo = dockerUtils.toManifestOptions(repo);
  }
  const repoConfig: manifestOptions = repo;
  const endpointsControl = await dockerUtils.mountEndpoints(repoConfig.registryBase, {owner: repoConfig.owner, repo: repoConfig.repository});
  const manifestHeaders = {
    accept: [
      "application/vnd.oci.image.manifest.v1+json",
      "application/vnd.docker.distribution.manifest.v2+json",
      "application/vnd.docker.distribution.manifest.list.v2+json",
      "application/vnd.oci.image.index.v1+json",
      "application/vnd.docker.distribution.manifest.v1+prettyjws",
      "application/json"
    ]
  };

  async function getTags(token?: string) {
    token = token ?? await dockerUtils.getToken(repoConfig);
    const response = await httpRequest.getJSON<tagList>({
      url: endpointsControl.tags.list(),
      headers: {
        ...manifestHeaders,
        Authorization: `Bearer ${token}`,
      }
    });
    return response.tags;
  }

  async function manifestMultiArch(reference?: string, token?: string) {
    if (!reference) reference = (await getTags()).at(-1);
    const requestEndpoint = endpointsControl.manifest(reference);
    token = token ?? await dockerUtils.getToken(repoConfig);
    const manifest = await httpRequest.getJSON({
      url: requestEndpoint,
      headers: {
        ...manifestHeaders,
        Authorization: `Bearer ${token}`
      }
    });
    if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.list.v2+json") {
      manifestDebug("Switch to Docker manifest with multi arch, Manifest: %O", manifest);
      const platformsManifest: dockerManifestMultiArchPlatform = manifest;
      return platformsManifest;
    } else if (manifest?.manifests?.some(layer => layer?.mediaType === "application/vnd.oci.image.manifest.v1+json")) {
      manifestDebug("Switch to OCI manifest Multi Arch, Manifest: %O", manifest);
      const ociManeifestPlatforms: ociManifestMultiArchPlatform = manifest;
      return ociManeifestPlatforms;
    }
    throw new Error("Manifest not found");
  }

  async function imageManifest(reference?: string, token?: string): Promise<(dockerManifestLayer|ociManifestLayer) & {token?: string}> {
    if (!reference) reference = (await getTags()).at(-1);
    const requestEndpoint = endpointsControl.manifest(reference);
    token = token ?? await dockerUtils.getToken(repoConfig);
    return manifestMultiArch(reference, token).then((manifest: any) => {
      if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.list.v2+json") {
        manifestDebug("Switch to Docker manifest with multi arch, Manifest: %O", manifest);
        const platformsManifest = manifest as dockerManifestMultiArchPlatform;
        const find = platformsManifest.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[platform_target?.arch||process.arch] && target.platform.os === OS_GO_NODE[platform_target?.platform||process.platform]);
        if (!find) throw new Error("Current platform not avaible")
        return imageManifest(find.digest, token);
      } else if (manifest?.manifests?.some(layer => layer?.mediaType === "application/vnd.oci.image.manifest.v1+json")) {
        manifestDebug("Switch to OCI manifest Multi Arch, Manifest: %O", manifest);
        const ociManeifestPlatforms = manifest as ociManifestMultiArchPlatform;
        const find = ociManeifestPlatforms.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[platform_target?.arch||process.arch] && target.platform.os === OS_GO_NODE[platform_target?.platform||process.platform]);
        if (!find) throw new Error("Current platform not avaible")
        return imageManifest(find.digest, token);
      }
      manifestDebug("Unknow manifest: %O", manifest);
      throw new Error("Manifest not found");
    }).catch(async () => {
      const manifest = await httpRequest.getJSON({
        url: requestEndpoint,
        headers: {
          ...manifestHeaders,
          Authorization: `Bearer ${token}`
        }
      });
      if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.v2+json") {
        manifestDebug("Docker layer manifest");
        const manifestLayers: dockerManifestLayer = manifest;
        return {...manifestLayers, token};
      } else if (manifest?.config?.mediaType === "application/vnd.oci.image.config.v1+json") {
        manifestDebug("OCI layer manifest");
        const manifestLayers: ociManifestLayer = manifest;
        return {...manifestLayers, token};
      }
      manifestDebug("Unknow manifest: %O", manifest);
      throw new Error("Invalid manifest");
    });
  }

  async function blobsManifest(reference?: string) {
    const manifest = await imageManifest(reference);
    const token = await dockerUtils.getToken(repoConfig);
    return httpRequest.getJSON<blobInfo>({
      url: endpointsControl.blob.get_delete(manifest.config.digest),
      headers: {
        ...manifestHeaders,
        Authorization: `Bearer ${token}`
      }
    });
  }

  async function blobLayerStream(digest: string, token?: string): Promise<Readable> {
    token = token ?? await dockerUtils.getToken(repoConfig);
    return httpRequest.pipeFetch({
      url: endpointsControl.blob.get_delete(digest),
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  async function layersStream(fn: (data: {layer: (dockerManifestLayer|ociManifestLayer)["layers"][number], skipNextLayer: () => void, breakloop: () => void, next: () => void, stream: Readable}) => void, reference?: string) {
    const manifest = await imageManifest(reference);
    const token = manifest.token ?? await dockerUtils.getToken(repoConfig);
    let breakLoop = false;
    let skipLayer = false;
    const breakloop = () => {breakLoop = true}, skipNextLayer = () => {skipLayer = true};
    for (const layerIndex in (manifest.layers ?? [])) {
      const layer = manifest.layers[layerIndex];
      if (breakLoop) break;
      if (skipLayer) {
        skipLayer = false;
        continue;
      }
      manifestDebug("Stream layer %s, media type %s", layer.digest, layer.mediaType);
      await new Promise<void>((resolve, reject) => {
        return blobLayerStream(layer.digest, token).then((stream) => {
          let areNext = false;
          const next = () => {
            manifestDebug("%s call to next layer %s", layer.digest, manifest.layers[layerIndex+1]?.digest||"No more layers");
            if (areNext) return;
            areNext = true;
            resolve();
          }
          stream.once("error", reject);
          stream.once("end", next);
          return fn({
            layer,
            breakloop,
            skipNextLayer,
            next,
            stream,
          });
        }).catch(reject);
      });
    }
  }

  return {
    repoConfig,
    endpointsControl,
    imageManifest,
    manifestMultiArch,
    blobsManifest,
    getTags,
    layersStream,
    blobLayerStream,
  };
}