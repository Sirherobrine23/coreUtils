import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { Auth, userAuth } from "./auth.js";
import { extractLayer } from "./utils.js";
import { goArch, goSystem, parseImage } from "./image.js";
import { tmpdir } from "node:os";
import crypto from "node:crypto";
import http, { reqStream } from "@sirherobrine23/http";
import path from "node:path";
import tarStream from "tar-stream";
import { extendsCrypto } from "@sirherobrine23/extends";
import { compressAvaible, compressStream } from "@sirherobrine23/decompress";
import { finished } from "node:stream/promises";

type RecursivePartial<T> = {[P in keyof T]?: T[P] extends (infer U)[] ? RecursivePartial<U>[] : T[P] extends object ? RecursivePartial<T[P]> : T[P];};
function merge<T>(source: T, merge: RecursivePartial<T>): T {
  return {...source, ...merge};
}

export interface dockerPlatform {
  architecture: goArch;
  os: goSystem;
  "os.features"?: string[];
  "os.version"?: string;
  features?: string[];
  variant?: string;
}

export interface multiArchSchema {
  schemaVersion: 2;
  manifests: {
    mediaType: string;
    digest: string;
    size: number;
    platform: dockerPlatform;
    annotations?: multiArchSchema["annotations"];
  }[];
  annotations?: {[noteName: string]: string};
}

export type blobImage = dockerPlatform & {
  created?: string,
  container?: string;
  docker_version?: string,
  config?: {
    Hostname?: string;
    Domainname?: string;
    User?: string;
    AttachStdin?: boolean;
    AttachStdout?: boolean;
    AttachStderr?: boolean;
    Tty?: boolean;
    OpenStdin?: boolean;
    StdinOnce?: boolean;
    Env?: string[];
    Cmd?: string[];
    ArgsEscaped?: boolean;
    Image?: string;
    Volumes?: any;
    WorkingDir?: string;
    Entrypoint?: string[];
    OnBuild?: any;
    Labels?: any;
  },
  container_config?: {
    Hostname?: string;
    Domainname?: string;
    User?: string;
    AttachStdin?: boolean;
    AttachStdout?: boolean;
    AttachStderr?: boolean;
    Tty?: boolean;
    OpenStdin?: boolean;
    StdinOnce?: boolean;
    Env?: string[],
    Cmd?: string[],
    ArgsEscaped?: boolean;
    Image?: string;
    Volumes?: any;
    WorkingDir?: string;
    Entrypoint?: any;
    OnBuild?: any;
    Labels?: any;
  },
  history?: {
    created: string,
    created_by: string,
    empty_layer?: boolean;
  }[],
  rootfs: {
    type: "layers",
    diff_ids: string[]
  }
}

export interface imageSchema {
  schemaVersion: 2;
  config: {
    mediaType: "application/vnd.oci.image.config.v1+json";
    digest?: string;
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

  /**
   * Publish blobs and manifest to Registry
   */
  async createImage(token = new Auth(this.image, "push", this.authUser)) {
    if (!(token.actionHas("push"))) throw new Error("Invalid publish Auth, required Push action!");
    const { owner, repo } = this.image;
    const tmpLocation = await fs.mkdtemp(path.join(tmpdir(), "ghcr_tmp"));
    const sha256Locations = new Map<string, string>();
    let lock = false;

    /** Create tar blob to upload to registry un future */
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

    const annotations = new Map<string, string>();
    const base: imageSchema = {
      schemaVersion: 2,
      config: undefined,
      layers: [],
      annotations: {},
    }

    const publish = async (platform: dockerPlatform, tagName?: string) => {
      lock = true;
      if (!token.token) await token.setup();
      base.annotations = Array.from(annotations.keys()).reduce<typeof base["annotations"]>((acc, key) => {acc[key] = annotations.get(key); return acc;}, {});
      if (!(Object.keys(base.annotations)).length) delete base.annotations;

      for (const sha256 of Array.from(sha256Locations.keys())) {
        const filePath = sha256Locations.get(sha256), { size: fileSize } = await fs.lstat(filePath);
        let digest = "sha256:"+sha256;
        const { statusCode, headers } = await http.bufferRequest(new URL(path.posix.join("/v2", owner, repo, "blobs/uploads/"), `http://${this.image.registry}`), {
          disableHTTP2: true,
          method: "POST",
          headers: {
            ...(token.token ? {Authorization: "Bearer "+token.token} : {}),
            "Content-Type": "application/octet-stream",
            "Content-Length": fileSize.toString(),
          },
          body: createReadStream(filePath)
        });

        if (statusCode === 202) {
          const uploadUuid = new URL(headers.location as string, `http://${this.image.registry}`);
          const uuidExist = await http.bufferRequest(uploadUuid, {disableHTTP2: true, headers: {...(token.token ? {Authorization: "Bearer "+token.token} : {})}}).then(({headers, statusCode}) => ({headers, statusCode}), (err: http.httpCoreError) => ({headers: err.headers, statusCode: err.httpCode}));
          if (!(uuidExist.statusCode === 204 || uuidExist.statusCode === 200)) throw new Error("Invalid uuid to Upload!");
          else {
            await http.bufferRequest(new URL((uuidExist.headers.location||headers.location) as string, `http://${this.image.registry}`), {
              disableHTTP2: true,
              method: "PUT",
              query: {digest},
              headers: {
                ...(token.token ? {Authorization: "Bearer "+token.token} : {}),
                "Content-Type": "application/octet-stream",
                "Content-Length": fileSize.toString(),
              },
              body: createReadStream(filePath),
            }).then(({statusCode}) => {if (statusCode !== 201) throw new Error("Cannot upload blob file!");});
          }
        } else if (statusCode === 201) {} else throw new Error("Invalid registry response!");

        await new Promise<void>((done, reject) => {
          const req = http.streamRoot(new URL(path.posix.join("/v2", this.image.owner ?? "", this.image.repo, "blobs", digest), `http://${this.image.registry}`), {
            disableHTTP2: true,
            headers: token.token ? {Authorization: "Bearer "+token.token}:{}
          }).on("error", (err: http.HTTPError) => {
            if (err.response?.statusCode === 404) return reject(new Error("Invalid blob upload"));
            const errorC = new http.httpCoreError();
            errorC.httpCode = err.response?.statusCode;
            errorC.url = err.response?.url;
            errorC.message = err.message;
            errorC.headers = err.response?.headers;
            errorC.rawBody = err.response?.body as any;
            try {
              errorC.body = JSON.parse(String(errorC.rawBody));
              delete errorC.rawBody;
            } catch {}
            reject(errorC);
          }).on("response", () => {
            req.end();
            done();
          });
        });

        base.layers.push({
          mediaType: filePath.endsWith(".gz") ? "application/vnd.oci.image.layer.v1.tar+gzip" : "application/vnd.oci.image.layer.v1.tar",
          digest,
          size: fileSize,
        });
        await fs.rm(filePath, {force: true});
      }

      // Check layers
      if (base.layers.length <= 0) {
        lock = false;
        throw new Error("Invalid layer, must have more than one!");
      }

      // Blob manifest
      const config: blobImage = {
        ...platform,
        rootfs: {
          type: "layers",
          diff_ids: base.layers.map(key => key.digest),
        }
      };
      const configString = JSON.stringify(config, null, 2);
      const configSha256 = "sha256:"+(await extendsCrypto.createHashAsync(configString, "sha256")).hash.sha256;

      const { statusCode, headers: blobManifestHead } = await http.bufferRequest(new URL(path.posix.join("/v2", owner, repo, "blobs/uploads/"), `http://${this.image.registry}`), {
        disableHTTP2: true,
        method: "POST",
        headers: {
          ...(token.token ? {Authorization: "Bearer "+token.token} : {}),
          "Content-Type": "application/vnd.oci.image.config.v1+json",
          "Content-Length": configString.length.toString(),
        },
        body: configString,
      });

      if (statusCode === 202) {
        const uploadUuid = new URL(blobManifestHead.location as string, `http://${this.image.registry}`);
        const uuidExist = await http.bufferRequest(uploadUuid, {disableHTTP2: true, headers: {...(token.token ? {Authorization: "Bearer "+token.token} : {})}}).then(({headers, statusCode}) => ({headers, statusCode}), (err: http.httpCoreError) => ({headers: err.headers, statusCode: err.httpCode}));
        if (!(uuidExist.statusCode === 204 || uuidExist.statusCode === 200)) throw new Error("Invalid uuid to Upload!");
        else {
          await http.bufferRequest(new URL((uuidExist.headers.location||blobManifestHead.location) as string, `http://${this.image.registry}`), {
            disableHTTP2: true,
            method: "PUT",
            query: {digest: configSha256},
            headers: {
              ...(token.token ? {Authorization: "Bearer "+token.token} : {}),
              "Content-Type": "application/vnd.oci.image.config.v1+json",
              "Content-Length": configString.length.toString(),
            },
            body: configString
          }).then(({statusCode}) => {if (statusCode !== 201) throw new Error("Cannot upload blob file!");});
        }
      } else if (statusCode === 201) {} else throw new Error("Invalid registry response!");
      base.config = {
        mediaType: "application/vnd.oci.image.config.v1+json",
        digest: configSha256,
        size: configString.length,
      };

      // Upload manifest
      const manifest = JSON.stringify(base, null, 2);
      const manifestSha256 = (await extendsCrypto.createHashAsync(manifest, "sha256")).hash.sha256;
      tagName ||= ("sha256:"+manifestSha256);
      const uploadManifest = new URL(path.posix.join("/v2", this.image.owner, this.image.repo, "manifests", tagName), `http://${this.image.registry}`);
      const { headers } = await http.bufferRequest(uploadManifest, {
        disableHTTP2: true,
        method: "PUT",
        headers: {
          ...(token.token ? {Authorization: "Bearer "+token.token}:{}),
          "Content-Type": "application/vnd.oci.image.manifest.v1+json",
        },
        body: manifest,
      });
      await fs.rm(tmpLocation, {recursive: true, force: true});
      return {
        tagName,
        digest: String(headers["docker-content-digest"]),
        blobImage: config,
        manifestJSON: base,
        manifestString: manifest
      };
    }

    return {
      createNewBlob,
      publish,
      annotations,
    };
  }

  /** Create multi arch schema to publish in Registry */
  createMultiArch(token = new Auth(this.image, "push", this.authUser)) {
    if (token.actionHas("pull")) throw new Error("Require push action");
    let lock = false;
    const base: multiArchSchema = {
      schemaVersion: 2,
      manifests: []
    };

    const publish = async (tagName?: string) => {
      if (base.manifests.length <= 0) throw new Error("Invalid layer, must have more than one!");
      if (!token.token) await token.setup();
      if (lock) throw new Error("Publish locked!");
      lock = true;
      const manifest = JSON.stringify(base, null, 2);
      const manifestSha256 = (await extendsCrypto.createHashAsync(manifest, "sha256")).hash.sha256;
      tagName ||= ("sha256:"+manifestSha256);
      const uploadManifest = new URL(path.posix.join("/v2", this.image.owner, this.image.repo, "manifests", tagName), `http://${this.image.registry}`);
      const { headers } = await http.bufferRequest(uploadManifest, {
        disableHTTP2: true,
        method: "PUT",
        headers: {
          ...(token.token ? {Authorization: "Bearer "+token.token}:{}),
          "Content-Type": "application/vnd.oci.image.index.v1+json",
        },
        body: manifest,
      });
      return {
        tagName,
        digest: String(headers["docker-content-digest"]),
        manifestJSON: base,
      };
    }

    const newPlatform = async (platform: dockerPlatform) => {
      if (lock) throw new Error("Publish locked!");
      const create = await this.createImage(token);
      return {
        createNewBlob: create.createNewBlob,
        async done() {
          const { digest, manifestString } = await create.publish(platform);
          const loc = base.manifests.push({
            mediaType: "application/vnd.oci.image.config.v1+json",
            digest,
            size: manifestString.length,
            platform,
          });
          return base.manifests.at(loc);
        },
      }
    }

    return {
      publish,
      newPlatform,
    };
  }
}