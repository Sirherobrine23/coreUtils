import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { Auth, userAuth } from "./auth.js";
import { extractLayer } from "./utils.js";
import { goArch, goSystem, parseImage } from "./image.js";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import http, { reqStream } from "@sirherobrine23/http";
import path from "node:path";
import tarStream from "tar-stream";
import { exists, extendsCrypto } from "@sirherobrine23/extends";
import { compressAvaible, compressStream } from "@sirherobrine23/decompress";
import { finished } from "node:stream/promises";

type RecursivePartial<T> = {[P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object ? RecursivePartial<T[P]> : T[P];};
function merge<T>(source: T, merge: RecursivePartial<T>): T {
  return {...source, ...merge};
}

export interface multiArchSchema {
  schemaVersion: 2;
  manifests: {
    mediaType: string;
    digest: string;
    size: number;
    platform: {
      "os.features"?: string[];
      "os.version"?: string;
      architecture: goArch;
      features?: string[];
      variant?: string;
      os: goSystem;
    };
    annotations?: multiArchSchema["annotations"];
  }[];
  annotations?: {[noteName: string]: string};
}

export interface imageSchema {
  schemaVersion: 2;
  mediaType: "application/vnd.oci.image.manifest.v1+json";
  config?: {
    mediaType: "application/vnd.oci.image.config.v1+json";
    digest: string;
    size: number;
  },
  layers: {
    mediaType: "application/vnd.oci.image.layer.v1.tar"|"application/vnd.oci.image.layer.v1.tar+gzip"|"application/vnd.oci.image.layer.v1.tar+zstd",
    digest: string,
    size: number;
    annotations?: multiArchSchema["annotations"];
  }[];
  annotations?: multiArchSchema["annotations"];
}

export class v2 {
  readonly image: parseImage;
  readonly authUser?: userAuth;
  constructor(image: string, user?: userAuth) {
    Object.defineProperty(this, "image", {writable: false, value: new parseImage(image)});
    if (user) Object.defineProperty(this, "authUser", {writable: false, value: user});
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

  async getTags(token = new Auth(this.image, "pull", this.authUser)): Promise<string[]> {
    await token.setup();
    const reqURL = new URL(path.posix.join("/v2", this.image.owner, this.image.repo, "tags/list"), `http://${this.image.registry}`);
    return (await http.jsonRequest(reqURL, {
      headers: {
        Authorization: "Bearer "+token.token,
      }
    })).body.tags;
  }

  async getManifets<T = any>(ref?: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const reqURL = new URL(path.posix.join("/v2", this.image.owner, this.image.repo, "manifests", ref), `http://${this.image.registry}`);
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
    const reqURL = new URL(path.posix.join("/v2", this.image.owner, this.image.repo, "manifests", ref), `http://${this.image.registry}`);
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
    const reqURL = new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref), `http://${this.image.registry}`);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      headers: {
        Authorization: "Bearer "+token.token
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return http.streamRequest(reqURL, reqOptions);
  }

  async extractLayer(ref: string, token = new Auth(this.image, "pull", this.authUser)) {
    await token.setup();
    const blob = await this.getBlob(ref, token);
    return new extractLayer(blob);
  }

  /**
   * Delete blob layer
   *
   * @param ref - Layer digest
   * @param token - Token class to Auth
   */
  async deleteBlob(ref: string, token = new Auth(this.image, "push", this.authUser)) {
    await token.setup();
    const reqURL = new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref), `http://${this.image.registry}`);
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
    const reqURL = new URL(path.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", ref), `http://${this.image.registry}`);
    const reqOptions: Omit<http.requestOptions, "url"> = {
      headers: {
        Authorization: "Bearer "+token.token,
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    };
    if (await http.bufferRequest(reqURL, merge(reqOptions, {method: "HEAD"})).then(() => false).catch(() => true)) throw new TypeError("This digest/ref not exists in registry");
    return http.jsonRequest<T>(reqURL, reqOptions).then(({body}) => body);
  }

  async createImage(token = new Auth(this.image, "push", this.authUser)) {
    if (!(token.actionHas("push"))) throw new Error("Invalid publish Auth, required Push action!");
    const tmpLocation = await fs.mkdtemp(path.join(tmpdir(), "ghcr_tmp"));
    const sha256Locations = new Map<string, string>();
    let lock = false;

    function createNewBlob(compress: Exclude<compressAvaible, "deflate"|"xz"> = "gzip") {
      if (lock) throw new Error("Cannnot set more blob images!");
      const tmpFile = path.join(tmpLocation, (crypto.randomBytes(6).toString("hex"))+".tar"+(compress === "passThrough" ? "" : ".gz"));
      const tarr = tarStream.pack();
      const com = tarr.pipe(compressStream(compress));
      const hash = extendsCrypto.createHashAsync(com, "sha256", "hex")
      finished(com.pipe(createWriteStream(tmpFile))).then(async () => {
        const { hash: { sha256 } } = await hash;
        sha256Locations.set(sha256, tmpFile);
      }).catch(err => tarr.emit("error", err));
      return tarr;
    }

    const base: imageSchema = {
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      layers: [],
      annotations: {},
    }

    const upload = async (tagName: string = "latest") => {
      lock = true;
      if (!token.token) await token.setup();
      for (const sha256 of Array.from(sha256Locations.keys())) {
        const filePath = sha256Locations.get(sha256);
        const stat = await fs.lstat(filePath);
        base.layers.push({
          mediaType: filePath.endsWith(".gz") ? "application/vnd.oci.image.layer.v1.tar+gzip" : "application/vnd.oci.image.layer.v1.tar",
          digest: "sha256:"+sha256,
          size: stat.size,
        });
      }

      for (const { digest, size } of base.layers) {
        if (await http.bufferRequest(new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "blobs/uploads", digest), `http://${this.image.registry}`), {method: "HEAD", headers: {Authorization: "Bearer "+token.token,}}).then(() => true).catch(() => false)) continue;
        console.log(digest, sha256Locations.get(digest.slice(7)))
        const blobUpload = new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "blobs/uploads/"), `http://${this.image.registry}`);
        blobUpload.searchParams.set("digest", digest);
        await http.bufferRequest(blobUpload, {
          disableHTTP2: true,
          method: "POST",
          headers: {
            Authorization: "Bearer "+token.token,
            "Content-Type": "application/octet-stream",
            "Content-Length": String(size)
          },
          body: createReadStream(sha256Locations.get(digest.slice(7))),
        }).then(({headers, statusCode, statusMessage}) => {console.log(statusCode, statusMessage, headers); return headers.location as string;});
        console.log("\n");
      }

      // Upload manifest
      const uploadManifest = new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "manifests", tagName), `http://${this.image.registry}`);
      const { headers: { "docker-content-digest": dockerDigest, location } } = await http.bufferRequest(uploadManifest, {
        disableHTTP2: true,
        method: "PUT",
        headers: {
          Authorization: "Bearer "+token.token,
          "Content-Type": base.mediaType || base.config?.mediaType,
        },
        body: base,
      });

      return {
        digest: String(dockerDigest),
        url: Array.isArray(location) ? location.at(0) : location,
      };
    }

    return {
      createNewBlob,
      upload,
      async deleteTmp() {
        if (await exists(tmpLocation)) return fs.rm(tmpLocation, {recursive: true, force: true});
      }
    };
  }
}