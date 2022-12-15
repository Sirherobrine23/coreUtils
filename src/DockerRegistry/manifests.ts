import * as httpRequest from "../request/simples.js";
import * as dockerUtils from "./utils.js";
import debug from "debug";
const manifestDebug = debug("coreutils:oci:manifest");

export const ARCH_GO_NODE: {[arch in NodeJS.Architecture]?: string} = {
  x64: "amd64",
  arm64: "arm64",
  arm: "arm",
  ppc: "ppc",
  ppc64: "ppc64",
  s390: "s390",
  s390x: "s390x",
  mips: "mips"
};

export const OS_GO_NODE: {[platform in NodeJS.Platform]?: string} = {
  win32: "windows",
  sunos: "solaris",
  linux: "linux",
  darwin: "darwin",
  android: "android",
  aix: "aix",
  freebsd: "freebsd",
  netbsd: "netbsd",
  openbsd: "openbsd"
};

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

export type optionsManifests = {platform?: NodeJS.Platform, arch?: NodeJS.Architecture};
export async function Manifest(repo: string|manifestOptions, options: optionsManifests = {platform: process.platform, arch: process.arch}) {
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

  async function getTags() {
    const token = await dockerUtils.getToken(repoConfig);
    const response = await httpRequest.getJSON<tagList>({
      url: endpointsControl.tags.list(),
      headers: {
        ...manifestHeaders,
        Authorization: `Bearer ${token}`,
      }
    });
    return response.tags;
  }

  async function imageManifest(reference?: string): Promise<dockerManifestLayer|ociManifestLayer> {
    if (!reference) reference = (await getTags()).at(-1);
    const requestEndpoint = endpointsControl.manifest(reference);
    const token = await dockerUtils.getToken(repoConfig);
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
      const find = platformsManifest.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[options?.arch||process.arch] && target.platform.os === OS_GO_NODE[options?.platform||process.platform]);
      if (!find) throw new Error("Current platform not avaible")
      return imageManifest(find.digest);
    } else if (manifest?.manifests?.some(layer => layer?.mediaType === "application/vnd.oci.image.manifest.v1+json")) {
      manifestDebug("Switch to OCI manifest Multi Arch, Manifest: %O", manifest);
      const ociManeifestPlatforms: ociManifestMultiArchPlatform = manifest;
      const find = ociManeifestPlatforms.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[options?.arch||process.arch] && target.platform.os === OS_GO_NODE[options?.platform||process.platform]);
      if (!find) throw new Error("Current platform not avaible")
      return imageManifest(find.digest);
    } else if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.v2+json") {
      manifestDebug("Docker layer manifest");
      const manifestLayers: dockerManifestLayer = manifest;
      return manifestLayers;
    } else if (manifest?.config?.mediaType === "application/vnd.oci.image.config.v1+json") {
      manifestDebug("OCI layer manifest");
      const manifestLayers: ociManifestLayer = manifest;
      return manifestLayers;
    }
    manifestDebug("Unknow manifest: %O", manifest);
    throw new Error("Invalid manifest");
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

  return {
    repoConfig, endpointsControl,
    imageManifest,
    blobsManifest,
    getTags,
  };
}