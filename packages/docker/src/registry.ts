import { parseImage } from "./image.js";
import { Auth, userAuth } from "./auth.js";
import { extractLayer } from "./utils.js";
import http, { reqStream } from "@sirherobrine23/http";
import path from "node:path/posix";

type RecursivePartial<T> = {[P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object ? RecursivePartial<T[P]> : T[P];};
function merge<T>(source: T, merge: RecursivePartial<T>): T {
  return {...source, ...merge};
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

  async getManifets<T = any>(ref?: string, token = new Auth(this.image, "pull", this.authUser)) {
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
    return http.jsonRequestBody<T>(reqURL, reqOptions);
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
    await http.bufferRequest(reqURL, reqOptions);
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

  async extractLayer(ref: string, mediaType?: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    const blob = await this.getBlob(ref, token);
    return new extractLayer(blob, mediaType);
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
  async getBlobManifest<T = any>(ref: string, token = new Auth(this.image, "pull", this.authUser)) {
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
    return http.jsonRequest<T>(reqURL, reqOptions).then(({body}) => body);
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
