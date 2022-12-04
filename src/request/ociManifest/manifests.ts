import type { HTTPError } from "got";
import * as httpRequest from "../simples";

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

export type requestToken = {
  token: string,
  access_token?: string,
  expires_in?: number,
  issued_at?: string
}
export async function getToken(options: manifestOptions) {
  // /token?scope=repository:the-bds-maneger/android_musl:pull
  let url = (options.authBase||options.registryBase)+"/token?";
  if (!/http[s]:\/\//.test(url)) url = `http://${url}`;
  if (options.authService) url += `service=${options.authService}&`
  url += `scope=repository:${options.owner}/${options.repository}:pull`;
  const data = await httpRequest.getJSON<requestToken>(url);
  return data.token;
}

export type tagList = {name: string, tags: string[]};
export async function getTags(repositoryOptions: manifestOptions) {
  const token = await getToken(repositoryOptions);
  return httpRequest.getJSON<tagList>({
    url: `http://${repositoryOptions.registryBase}/v2/${repositoryOptions.owner}/${repositoryOptions.repository}/tags/list`,
    headers: {
      Authorization: `Bearer ${token}`,
      accept: [
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.v1+prettyjws",
        "application/json"
      ]
    }
  });
}

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
    mediaType: "application/vnd.oci.image.layer.v1.tar"|"application/vnd.oci.image.layer.v1.tar+gzip"|"application/vnd.oci.image.layer.v1.tar+zstd"|"application/vnd.oci.image.layer.nondistributable.v1.tar"|"application/vnd.oci.image.layer.nondistributable.v1.tar+gzip"|"and application/vnd.oci.image.layer.nondistributable.v1.tar+zstd",
    digest: string,
    size: number,
    annotations?: {[key: string]: string}
  }[],
  annotations?: {[key: string]: string}
};

export type fetchPackageOptions = {platform?: NodeJS.Platform, arch?: NodeJS.Architecture};
export async function fetchPackage(repositoryOptions: manifestOptions, options?: fetchPackageOptions): Promise<dockerManifestLayer|ociManifestLayer> {
  const token = await getToken(repositoryOptions);
  const manifest = await httpRequest.getJSON({
    url: `http://${repositoryOptions.registryBase}/v2/${repositoryOptions.owner}/${repositoryOptions.repository}/manifests/${repositoryOptions.tagDigest||(await getTags(repositoryOptions)).tags.at(-1)}`,
    headers: {
      Authorization: `Bearer ${token}`,
      accept: [
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.v1+prettyjws",
        "application/json"
      ]
    }
  }).catch((err: HTTPError) => {
    if (err?.response?.body) {
      if (typeof err.response.body === "string") throw new Error(err.response.body);
      else if (Buffer.isBuffer(err.response.body)) {
        const data = err.response.body.toString("utf8");
        if (err.response.headers["content-type"] === "application/json") throw JSON.parse(data);
        throw new Error(data);
      }
    }
    throw err;
  });
  if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.list.v2+json") {
    const platformsManifest: dockerManifestMultiArchPlatform = manifest;
    const find = platformsManifest.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[options?.arch||process.arch] && target.platform.os === OS_GO_NODE[options?.platform||process.platform]);
    if (!find) throw new Error("Current platform not avaible")
    return fetchPackage({...repositoryOptions, tagDigest: find.digest});
  } else if (manifest?.manifests?.some(layer => layer?.mediaType === "application/vnd.oci.image.manifest.v1+json")) {
    const ociManeifestPlatforms: ociManifestMultiArchPlatform = manifest;
    const find = ociManeifestPlatforms.manifests.find(target => target.platform.architecture === ARCH_GO_NODE[options?.arch||process.arch] && target.platform.os === OS_GO_NODE[options?.platform||process.platform]);
    if (!find) throw new Error("Current platform not avaible")
    return fetchPackage({...repositoryOptions, tagDigest: find.digest});
  } else if (manifest?.mediaType === "application/vnd.docker.distribution.manifest.v2+json") {
    const manifestLayers: dockerManifestLayer = manifest;
    return manifestLayers;
  } else if (manifest?.config?.mediaType === "application/vnd.oci.image.config.v1+json") {
    const manifestLayers: ociManifestLayer = manifest;
    return manifestLayers;
  }
  throw new Error("Invalid manifest");
}

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

export async function fetchBlobManifest(repositoryOptions: manifestOptions, options?: fetchPackageOptions) {
  const manifest = await fetchPackage(repositoryOptions, options);
  const token = await getToken(repositoryOptions);
  return httpRequest.getJSON<blobInfo>({
    url: `http://${repositoryOptions.registryBase}/v2/${repositoryOptions.owner}/${repositoryOptions.repository}/blobs/${manifest.config.digest}`,
    headers: {
      Authorization: `Bearer ${token}`,
      accept: [
        "application/vnd.oci.image.manifest.v1+json",
        "application/vnd.docker.distribution.manifest.v2+json",
        "application/vnd.docker.distribution.manifest.list.v2+json",
        "application/vnd.oci.image.index.v1+json",
        "application/vnd.docker.distribution.manifest.v1+prettyjws",
        "application/json"
      ]
    }
  });
}
