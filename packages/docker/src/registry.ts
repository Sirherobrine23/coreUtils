import { parseImage, nodeToGO } from "./image.js";
import { Auth, userAuth } from "./auth.js";
import http, { reqStream } from "@sirherobrine23/http";
import path from "node:path/posix";

type RecursivePartial<T> = {[P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object ? RecursivePartial<T[P]> : T[P];};
function merge<T>(source: T, merge: RecursivePartial<T>): T {
  return {...source, ...merge};
}

export class Manifest {
  manifest: any;
  readonly originalManifest: any;
  readonly multiArch: boolean;

  constructor(manifestObject: any, v2: v2) {
    this.manifest = manifestObject;
    Object.defineProperty(this, "originalManifest", {writable: false, value: manifestObject});
    Object.defineProperty(this, "multiArch", {
      writable: false,
      value: !!(manifestObject.manifests)
    });
    if (this.multiArch) {
      this.platforms = this.originalManifest.manifests.map(({platform}) => platform);
      this.setPlatform = async function(options) {
        const target = this.originalManifest.manifests.find(({platform}) => (platform.architecture === nodeToGO("arch", options?.arch ?? process.arch)) && (platform.os === nodeToGO("platform", options?.os ?? process.platform)) && (!platform.variant || (!options.variant) || (platform.variant === options.variant)) && (!(platform["os.version"]) || !(options.version) || (options.version === platform["os.version"])));
        if (!target) throw new Error("Target not exists!");
        return v2.getManifets(target.digest).then(data => (this.manifest = data.originalManifest));
      }
    }
  }

  public platforms?: {
    architecture: string,
    variant?: string,
    os: string,
  }[];

  async setPlatform(options?: {os?: NodeJS.Platform, arch?: NodeJS.Architecture, version?: string, variant?: string}): Promise<any> {
    throw new Error("This manifests is not multi platform!");
  }
}

export class v2 {
  readonly image: parseImage;
  readonly authUser?: userAuth;
  constructor(image: string, user?: userAuth) {
    Object.defineProperty(this, "image", {writable: false, value: new parseImage(image)});
    if (user) Object.defineProperty(this, "authUser", {writable: false, value: user});
  }

  async getTags(token = new Auth(this.image, "pull", this.authUser)): Promise<string[]> {
    await token.setup();
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner, this.image.repo, "tags/list");
    return (await http.jsonRequest(reqURL, {
      headers: {
        Authorization: "Bearer "+token.token,
      }
    })).body.tags;
  }

  async getManifets(ref?: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner, this.image.repo, "manifests", ref);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      headers: {
        Authorization: "Bearer "+token.token,
        accept: Array.from(this.manifestsAccepts).join(", ")
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return new Manifest((await http.jsonRequest(reqURL, reqOptions)).body, this);
  }

  async deleteManifets(ref?: string, token = new Auth(this.image, "push", this.authUser)) {
    await token.setup();
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner, this.image.repo, "manifests", ref);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      method: "delete",
      headers: {
        Authorization: "Bearer "+token.token,
        accept: Array.from(this.manifestsAccepts).join(", ")
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return new Manifest((await http.jsonRequest(reqURL, reqOptions)).body, this);
  }

  /**
   * Get layer stream
   *
   * @param ref - Layer digest
   * @param token - Token class to Auth
   * @returns Layer stream
   */
  async getBlob(ref: string, token = new Auth(this.image, "pull", this.authUser)): Promise<reqStream> {
    await token.setup();
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      headers: {
        Authorization: "Bearer "+token.token
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return http.streamRequest(reqURL, reqOptions);
  }

  /**
   * Delete blob layer
   *
   * @param ref - Layer digest
   * @param token - Token class to Auth
   */
  async deleteBlob(ref: string, token = new Auth(this.image, "push", this.authUser)) {
    await token.setup();
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      method: "HEAD",
      headers: {
        Authorization: "Bearer "+token.token
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    reqOptions.method = "DELETE";
    await http.bufferRequest(reqURL, reqOptions);
  }

  /**
   * Get blob manifest
   * @param ref - Manifest digest
   * @param token
   * @returns
   */
  async getBlobManifest(ref: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      headers: {
        Authorization: "Bearer "+token.token,
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return http.jsonRequest(reqURL, reqOptions).then(({body}) => body);
  }

  manifestsAccepts = new Set<string>([
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.manifest.v2+json",
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.v1+prettyjws",
    "application/json"
  ]);
}
