import { http } from "@sirherobrine23/http";
import * as dockerUtils from "./utils.js";
import stream from "node:stream";
export {dockerUtils};

const ARCH_GO_NODE: {[arch: string]: string} = {
  x64: "amd64",
  amd64: "x64"
};
const OS_GO_NODE: {[platform: string]: string} = {
  win32: "windows",
  windows: "win32",
  sunos: "solaris",
  solaris: "sunos"
};

export function getGoArch(arch: string = process.arch): string {
  return ARCH_GO_NODE[arch] ?? process.arch;
}
export function getGoOS(platform: string = process.platform): string {
  return OS_GO_NODE[platform] ?? process.platform;
}

export type tagList = {
  name: string,
  tags: string[]
};

export type platformConfig = {
  arch?: string,
  platform?: string,
  manifestAccept?: string[],
};

export type blobManifest = {
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

export async function registry(image: string|dockerUtils.ImageObject, platformConfig: platformConfig = {arch: process.arch, platform: process.platform}) {
  const imageObject = typeof image === "string" ? dockerUtils.parseImageURI(image) : image;
  const repoConfig = dockerUtils.toManifestOptions(imageObject);
  const endpointsControl = await dockerUtils.mountEndpoints(repoConfig.registryBase, {owner: repoConfig.owner, repo: repoConfig.repository});
  const manifestAccept = platformConfig.manifestAccept?.length > 0 ? platformConfig.manifestAccept : [
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.manifest.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.v1+prettyjws",
    "application/json",
  ];

  async function getTags(token?: string) {
    token = token || await dockerUtils.getToken({...repoConfig, action: "pull"});
    if (!token) throw new Error("No token provided");
    const response = await http.jsonRequest<tagList>({
      url: endpointsControl.tags.list(),
      headers: {
        Authorization: `Bearer ${token}`,
        accept: manifestAccept?.length > 0 ? manifestAccept : "application/json, */*",
      }
    });
    return response.body.tags;
  }

  async function imageManifests(reference?: string, token?: string) {
    token = token || await dockerUtils.getToken({...repoConfig, action: "pull"});
    if (!token) throw new Error("No token provided");
    reference = reference || (await getTags(token)).at(-1);
    if (!reference) throw new Error("No reference provided");
    const response = await http.jsonRequest({
      url: endpointsControl.manifest(reference),
      headers: {
        Authorization: `Bearer ${token}`,
        accept: manifestAccept?.length > 0 ? manifestAccept : "application/json, */*",
      }
    });

    return {
      token,
      reference,
      manifest: response.body,
    };
  }

  async function blobManifest(reference?: string, token?: string) {
    const manifest = await imageManifests(reference, token);
    const { body } = await http.jsonRequest({
      url: endpointsControl.blob.get_delete(manifest.manifest.config.digest),
      headers: {
        Authorization: `Bearer ${manifest.token}`,
        accept: manifestAccept?.length > 0 ? manifestAccept : "application/json, */*",
      }
    });
    return {
      token: manifest.token,
      reference: manifest.reference,
      manifest: body,
    };
  }

  async function layerStream(digest: string, token?: string): Promise<stream.Readable> {
    token = token || await dockerUtils.getToken({...repoConfig, action: "pull"});
    return (await http.streamRequest({
      url: endpointsControl.blob.get_delete(digest),
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    }))
  }

  return {
    imageObject,
    repoConfig,
    endpointsControl,
    manifestAccept,
    getTags,
    imageManifests,
    blobManifest,
    layerStream,
  };
}