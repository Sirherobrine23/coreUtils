import { http } from "@sirherobrine23/http";
import utils from "node:util";

export interface manifestOptions {
  authBase?: string,
  authService?: string,
  registryBase: string,
  // ------------------
  repository: string,
  owner: string,
  tagDigest?: string
};

export interface registryInfo {
  url: string,
  version: 1|2,
  protocol: "http"|"https"
  urlVersion: string,
};

export async function registryUrlInfo(registryURL: string, token?: string): Promise<registryInfo> {
  const arrayTest: URL[] = [];
  const pathnames = ["/v2/", "/v1/", "/"];
  const protocols = ["https:", "http:"];
  for (const pathname of pathnames) {
    for (const protocol of protocols) {
      const urlData = new URL(`${protocol}//${registryURL}`);
      urlData.pathname = pathname;
      arrayTest.push(urlData);
    }
  }

  for (const urlData of arrayTest) {
    try {
      await http.streamRequest(urlData, {
        headers: token ? {"Authorization": `Bearer ${token}`} : undefined,
      });
      return {
        version: urlData.pathname === "/v2/" ? 2 : 1,
        protocol: urlData.protocol === "https:" ? "https" : "http",
        url: urlData.origin,
        urlVersion: urlData.toString()
      }
    } catch (err) {
      if (err?.response) {
        if (err.code === "ERR_GOT_REQUEST_ERROR") continue;
        let statusCode = err.response?.statusCode;
        if (statusCode === 404) continue;
        else if (statusCode === 401) return {
          version: urlData.pathname === "/v2/" ? 2 : 1,
          protocol: urlData.protocol === "https:" ? "https" : "http",
          url: urlData.origin,
          urlVersion: urlData.toString().replace(/\/$/, "")
        };
      }
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

export async function getToken(options: manifestOptions & {action?: "pull"|"push"}) {
  if (!(["pull", "push"]).includes(options.action)) options.action = "pull";
  const request: http.requestOptions = {
    url: (options.authBase||options.registryBase)+"/token",
    query: {}
  };
  let urlString = request.url instanceof URL ? request.url.toString() : request.url;
  if (!/http[s]:\/\//.test(urlString)) request.url = (await registryUrlInfo(options.registryBase)).url+"/token";
  if (typeof options.authService === "string") request.query.service = options.authService;
  request.query.scope = `repository:${options.owner}/${options.repository}:${options.action}`;
  const { body } = await http.jsonRequest<requestToken>(request);
  return body.token;
}