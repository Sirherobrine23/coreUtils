import { parseImage, nodeToGO } from "./image.js";
import { Auth, userAuth } from "./auth.js";
import http from "@sirherobrine23/http";
import path from "node:path/posix";

export class Manifest {
  manifet: any;
  readonly originalManifest: any;
  readonly multiArch: boolean;

  constructor(manifestObject: any, v2: v2) {
    this.manifet = manifestObject;
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
        return v2.getManifets(target.digest).then(data => (this.manifet = data.manifet));
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

  async getManifets(ref?: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const reqURL = new URL(`http://${this.image.registry}`);
    reqURL.pathname = path.join("/v2", this.image.owner, this.image.repo, "manifests", ref);
    return new Manifest((await http.jsonRequest(reqURL, {
      headers: {
        Authorization: "Bearer "+token.token,
        accept: Array.from(this.manifestsAccepts).join(", ")
      }
    })).body, this);
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