import { parseImage } from "../image/index.js";
import { Auth } from "../auth/index.js";
import { jsonRequest, requestOptions, streamRequest } from "@sirherobrine23/http";
import path from "node:path/posix";

function getGoArch(arch: string): string {
  const ARCH_GO_NODE: {[arch: string]: string} = {
    x64: "amd64"
  };
  return ARCH_GO_NODE[arch] ?? arch;
}

function getGoOS(platform: string): string {
  const OS_GO_NODE: {[platform: string]: string} = {
    win32: "windows",
    windows: "win32",
    sunos: "solaris",
    solaris: "sunos"
  };
  return OS_GO_NODE[platform] ?? platform;
}

export class Manifest {
  readonly isMultiArch: boolean = false;
  constructor(private Manifets: any, private Maneger: registryFunctions) {
    if (this.Manifets?.manifests instanceof Array) Object.defineProperty(this, "isMultiArch", {value: true, writable: false});
  }

  getManifest() {return this.Manifets;}

  async getTarget(arch: NodeJS.Architecture, os: NodeJS.Platform, variant?: string) {
    if (!(this.isMultiArch)) throw new Error("Get manifest directly!");
    os ??= process.platform;
    arch ??= process.arch;
    if (this.Manifets?.manifests instanceof Array) {
      const { manifests } = this.Manifets;
      const t = manifests.find(({platform}) => {
        if (!((getGoArch(arch) === platform.architecture) && (getGoOS(os) === platform.os))) return false;
        if (platform.variant) if (variant !== platform.variant) return false;
        return true
      });
      if (t) return (await this.Maneger.getManifest(t.digest)).getManifest();
    }
    throw new Error("Invalid target!");
  }
}

class Base {
  constructor(public repository: parseImage) {}
  /** Authencation to get Tokens */
  public Auth: Auth = new Auth();
}

export declare interface registryFunctions {
  getManifest(reference?: string): Promise<Manifest>;
  getTags(): Promise<string[]>;
}

export class v1 extends Base implements registryFunctions {
  async getTags(): Promise<string[]> {
    const { repository } = this;
    const token = await this.Auth.getToken(repository, "pull");
    const options: requestOptions = {query: {}, headers: {Authorization: `Bearer ${token.token}`, accept: (["application/vnd.oci.image.manifest.v1+json", "application/vnd.oci.image.manifest.v2+json", "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.docker.distribution.manifest.v2+json", "application/vnd.docker.distribution.manifest.v1+prettyjws", "application/json",]).join(", ")}};
    const reqURL = new URL("https://"+repository.registry);
    reqURL.pathname = path.join("/v1/repositories", repository.owner ?? "", repository.repo, "tags");
    const { body } = await jsonRequest(reqURL, options).catch(async () => {reqURL.protocol = "http:"; return jsonRequest(reqURL, options);});
    return body;
  }
  getManifest(reference?: string) {
    return null;
  }
}

export class v2 extends Base implements registryFunctions {
  async getTags() {
    const { repository } = this;
    const token = await this.Auth.getToken(repository, "pull");
    const options: requestOptions = {query: {}, headers: {Authorization: `Bearer ${token.token}`, accept: (["application/vnd.oci.image.manifest.v1+json", "application/vnd.oci.image.manifest.v2+json", "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.docker.distribution.manifest.v2+json", "application/vnd.docker.distribution.manifest.v1+prettyjws", "application/json",]).join(", ")}};
    const reqURL = new URL("https://"+repository.registry);
    reqURL.pathname = path.join("/v2", repository.owner ?? "", repository.repo, "tags/list");
    const tags: string[] = [];
    while(true) {
      const { body, headers } = await jsonRequest(reqURL, options).then(async () => {reqURL.protocol = "http:"; return jsonRequest(reqURL, options);})
      tags.push(...(body.tags));
      if (headers.Link || headers.link) {
        const link = String(headers.Link || headers.link);
        if (link.includes('rel="next"')) {
          if (options.query.n === undefined) options.query.n = 1;
          else (options.query.n as number)++;
          continue;
        }
      }
      break;
    }
    return tags;
  }

  async getManifest(reference = "latest") {
    const { repository } = this;
    const token = await this.Auth.getToken(repository, "pull");
    const options: requestOptions = {query: {}, headers: {Authorization: `Bearer ${token.token}`, accept: (["application/vnd.oci.image.manifest.v1+json", "application/vnd.oci.image.manifest.v2+json", "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.docker.distribution.manifest.v2+json", "application/vnd.docker.distribution.manifest.v1+prettyjws", "application/json",]).join(", ")}};
    const reqURL = new URL("https://"+repository.registry);
    reqURL.pathname = path.join("/v2", repository.owner ?? "", repository.repo, "manifests", reference || "latest");
    const { body } = await jsonRequest(reqURL, options).then(async () => {reqURL.protocol = "http:"; return jsonRequest(reqURL, options);})
    return new Manifest(body, this);
  }

  async getBlob(digest: string) {
    const { repository } = this;
    const token = await this.Auth.getToken(repository, "pull");
    const options: requestOptions = {query: {}, headers: {Authorization: `Bearer ${token.token}`, accept: (["application/vnd.oci.image.manifest.v1+json", "application/vnd.oci.image.manifest.v2+json", "application/vnd.oci.image.index.v1+json", "application/vnd.docker.distribution.manifest.list.v2+json", "application/vnd.docker.distribution.manifest.v2+json", "application/vnd.docker.distribution.manifest.v1+prettyjws", "application/json",]).join(", ")}};
    const reqURL = new URL("https://"+repository.registry);
    reqURL.pathname = path.join("/v2", repository.owner ?? "", repository.repo, "blobs", digest);
    return streamRequest(reqURL, options).then(async () => {reqURL.protocol = "http:"; return streamRequest(reqURL, options);})
  }
}