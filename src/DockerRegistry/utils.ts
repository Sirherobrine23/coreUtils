import { manifestOptions } from "./manifests.js";
import * as httpRequest from "../request/simples.js";
import utils from "node:util";

export type registryInfo = {
  url: string,
  version: 1|2,
  protocol: "http"|"https"
  urlVersion: string,
};

export async function registryUrlInfo(registryURL: string, token?: string): Promise<registryInfo> {
  const rootUrlHTTPS = utils.format("https://%s", registryURL);
  const rootUrlHTTP = utils.format("http://%s", registryURL);

  const tests: {[T: string]: registryInfo} = {
    httpsv2: {
      version: 2,
      url: rootUrlHTTPS,
      protocol: "https",
      urlVersion: utils.format("%s/v2", rootUrlHTTPS)
    },
    httpv2: {
      version: 2,
      url: rootUrlHTTP,
      protocol: "http",
      urlVersion: utils.format("%s/v2", rootUrlHTTP)
    },
    httpsv1: {
      version: 1,
      url: rootUrlHTTPS,
      protocol: "https",
      urlVersion: utils.format("%s/v1", rootUrlHTTPS)
    },
    httpv1: {
      version: 1,
      url: rootUrlHTTP,
      protocol: "http",
      urlVersion: utils.format("%s/v1", rootUrlHTTP)
    }
  }

  for (const versionrequest of Object.keys(tests).map(T => tests[T])) {
    try {
      await httpRequest.bufferFetch({
        url: versionrequest.urlVersion+"/",
        headers: (token?{Authorization: `Bearer ${token}`}:{})
      });
      return versionrequest;
    } catch (err) {
      if (err?.data?.errors) return versionrequest;
    }
  }

  throw new Error("cannot get version and URL check configs");
}

export async function mountEndpoints(registryURL: string, options: {owner: string, repo: string, token?: string}) {
  const registryInfo = await registryUrlInfo(registryURL, options?.token);
  if (registryInfo.version === 2) {
    const repositoryRoot = utils.format("%s/%s/%s", registryInfo.urlVersion, options.owner, options.repo);
    return {
      registryInfo,
      manifest: (reference: string) => utils.format("%s/manifests/%s", repositoryRoot, reference),
      catalog: () => utils.format("%s/_catalog?n=1000", repositoryRoot),
      blob: {
        get_delete: (digest: string) => utils.format("%s/blobs/%s", repositoryRoot, digest),
        upload: {
          init: () => utils.format("%s/blobs/uploads/", repositoryRoot),
          get_patch_delete: (uuid: string) => utils.format("%s/blobs/uploads/%s", repositoryRoot, uuid),
          put: (uuid: string, digest: string) => utils.format("%s/blobs/uploads/%s?digest=%s", repositoryRoot, uuid, digest),
        }
      },
      tags: {
        list: () => utils.format("%s/tags/list", repositoryRoot),
      }
    };
  }
  throw new Error("version registry not compatible!");
}

const dockerImageRegex = /^(([a-z0-9\._\-]+(:([0-9]+))?)\/)?(([a-z0-9\._\-]+)\/)?([a-z0-9\._\-\/:]+)(@(sha256:\S+|\S+|))?$/;
const tagImage = /:([\w\S]+)$/;

export type ImageObject = {
  registry: string,
  owner: string,
  imageName: string,
  tag: string,
  sha256?: string
}
export function parseImageURI(image: string): ImageObject {
  if (!image) throw new TypeError("Required image argument!");
  if (!dockerImageRegex.test(image)) throw new TypeError("Invalid image format");
  let [,, registry,,,, owner, imageName,, sha256] = image.match(dockerImageRegex);
  let tag: string;
  if (tagImage.test(imageName)) {
    const [, newtag] = imageName.match(tagImage);
    tag = newtag;
    imageName = imageName.replace(tagImage, "");
  }

  // fix owner
  if (!owner && !!registry) {
    owner = registry;
    registry = undefined;
  }

  return {
    registry: registry||"registry-1.docker.io",
    owner: owner||"library",
    imageName,
    tag: tag||"latest",
    sha256
  };
}

const dockerRegistry = /^([a-z0-9\-\.]+\.)?docker.io$/;
export function toManifestOptions(image: string|ImageObject): manifestOptions & {image: ImageObject} {
  if (typeof image === "string") image = parseImageURI(image);
  let tagDigest = image.tag;
  if (image.sha256) {
    // image.imageName += ":"+image.tag;
    tagDigest = image.sha256;
  }
  return {
    image,
    registryBase: image.registry,
    owner: image.owner,
    repository: image.imageName,
    tagDigest,
    ...(dockerRegistry.test(image.registry)?{
      authBase: "https://auth.docker.io",
      authService: "registry.docker.io",
    }:{})
  };
}

export type requestToken = {
  token: string,
  access_token?: string,
  expires_in?: number,
  issued_at?: string
}

export async function getToken(options: manifestOptions) {
  const request: httpRequest.requestOptions = {url: (options.authBase||options.registryBase)+"/token", query: {}};
  if (!/http[s]:\/\//.test(request.url)) request.url = (await registryUrlInfo(options.registryBase)).url+"/token";
  if (typeof options.authService === "string") request.query.service = options.authService;
  request.query.scope = `repository:${options.owner}/${options.repository}:pull`;
  const data = await httpRequest.getJSON<requestToken>(request);
  return data.token;
}