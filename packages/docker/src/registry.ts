import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { compressAvaible, compressStream } from "@sirherobrine23/decompress";
import { Auth, userAuth } from "./auth.js";
import { extendsCrypto } from "@sirherobrine23/extends";
import { extractLayer } from "./utils.js";
import { goArch, goSystem, parseImage } from "./image.js";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import tarStream from "tar-stream";
import crypto from "node:crypto";
import path from "node:path";
import { format } from "node:util";

export interface dockerPlatform {
  architecture: goArch;
  os: goSystem;
  "os.features"?: string[];
  "os.version"?: string;
  features?: string[];
  variant?: string;
}

/** Debian packages, get from `dpkg-architecture --list -L | grep 'musl-linux-' | sed 's|musl-linux-||g' | xargs`, version 1.21.1, Ubuntu */
export type debianArch = "all"|"armhf"|"armel"|"mipsn32"|"mipsn32el"|"mipsn32r6"|"mipsn32r6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"powerpcspe"|"x32"|"arm64ilp32"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";
export function debianControlToDockerPlatform(Architecture: debianArch): dockerPlatform {
  const platform: Partial<dockerPlatform> = {os: "linux"};
  if (Architecture === "all") platform.architecture = "amd64";
  else if (Architecture === "amd64") platform.architecture = "amd64";
  else if (Architecture === "i386") platform.architecture = "ia32";
  else if (Architecture === "arm64") {
    platform.architecture = "arm64";
    platform.variant = "v8";
  } else if (Architecture === "armhf") {
    platform.architecture = "arm";
    platform.variant = "v7";
  } else if (Architecture === "armeb"||Architecture === "arm") {
    platform.architecture = "arm";
    platform.variant = "v6"
  } else if (Architecture === "s390") platform.architecture = "s390";
  else if (Architecture === "s390x") platform.architecture = "s390x";
  else if (Architecture === "ppc64"||Architecture === "ppc64el") platform.architecture = "ppc64";
  else if (Architecture === "mipsel") platform.architecture = "mipsel";
  else if (Architecture === "mips") platform.architecture = "mips";
  else throw new Error(format("Cannot convert %O to docker/OCI platform specs!", Architecture));
  return platform as dockerPlatform;
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

  async getTags(token = new Auth(this.image)): Promise<string[]> {
    if (this.authUser) token.setAuth(this.authUser);
    return (await token.requestJSON({
      reqPath: ["/v2", this.image.owner, this.image.repo, "tags/list"],
    })).body.tags;
  }

  async getManifets<T = any>(ref?: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const manifest = await token.requestJSON<T>({
      reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", ref],
      headers: {
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    });
    if (manifest.statusCode !== 200) throw new Error("This digest/ref not exists in registry");
    return manifest.body;
  }

  async deleteManifets(ref?: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    if (!ref) ref = (await this.getTags(token)).at(-1);
    const res = await token.setAction("push").request({
      method: "DELETE",
      reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", ref],
      headers: {accept: Array.from(this.manifestsAccepts).join(", ")}
    });
    if (res.statusCode !== 201) throw new Error("Cannot delete manifest!");4
  }

  /**
   * Get layer stream
   *
   * @param ref - Layer digest
   * @param token - Token class to Auth
   * @returns Layer stream
   */
  async getBlob(ref: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    const req = await token.request({reqPath: ["/v2", this.image.owner, this.image.repo, "blobs", ref]});
    if (req.statusCode !== 200) throw new TypeError("This digest/ref not exists in registry");
    return Readable.from(req.body);
  }

  async extractLayer(ref: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    const blob = await this.getBlob(ref, token);
    return new extractLayer(blob);
  }

  /**
   * Delete blob layer
   *
   * @param ref - Layer digest
   * @param token - Token class to Auth
   */
  async deleteBlob(ref: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    const req = await token.setAction("push").request({
      method: "DELETE",
      reqPath: ["/v2", this.image.owner, this.image.repo, "blobs", ref]
    });
    if (req.statusCode !== 200) throw new TypeError("This digest/ref not exists in registry");
  }

  /**
   * Get blob manifest
   * @param ref - Manifest digest
   * @param token
   * @returns
   */
  async getBlobManifest<T = any>(ref: string, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    const req = await token.requestJSON<T>({
      reqPath: ["/v2", this.image.owner, this.image.repo, "blobs", ref],
      headers: {
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    });
    if (req.statusCode !== 200) throw new TypeError("This digest/ref not exists in registry");
    return req.body;
  }

  /** Create multi arch schema to publish in Registry */
  createMultiArch(token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    if (token.has("pull")) throw new Error("Require push action");
    let lock = false;
    const base: multiArchSchema = {
      schemaVersion: 2,
      manifests: []
    };

    const publish = async (tagName?: string) => {
      if (base.manifests.length <= 0) throw new Error("Invalid layer, must have more than one!");
      if (lock) throw new Error("Publish locked!");
      lock = true;
      const manifest = JSON.stringify(base, null, 2);
      const manifestSha256 = (await extendsCrypto.createHashAsync(manifest, "sha256")).hash.sha256;
      tagName ||= ("sha256:"+manifestSha256);
      const { headers, statusCode, body } = await token.setAction("push").request({
        disableHTTP2: true,
        method: "PUT",
        reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", tagName],
        headers: {
          "Content-Type": "application/vnd.oci.image.index.v1+json",
        },
        body: () => manifest,
      });
      if (statusCode !== 201) throw body;
      return {
        tagName,
        digest: String(headers["docker-content-digest"]),
        manifestJSON: base,
      };
    }

    const newPlatform = async (platform: dockerPlatform) => {
      if (lock) throw new Error("Publish locked!");
      const create = await this.createImage(platform, new Auth(this.image));
      return {
        createBlob: create.createBlob,
        async done() {
          const { digest, manifests: { manifest: { manifestString } } } = await create.finalize();
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

    return Object.freeze({
      publish,
      newPlatform,
    });
  }

  /**
   * Publish blobs and manifest to Registry
   *
   * Registry publish specs from:
   * - https://docs.docker.com/registry/spec/api/
   * - https://github.com/opencontainers/distribution-spec/blob/e79ab906f303fee1510f07f8273f5984689f5efe/conformance/02_push_test.go
   * - https://github.com/distribution/distribution/blob/main/docs/spec/api.md
   */
  async createImage(platform: dockerPlatform, token = new Auth(this.image)) {
    if (this.authUser) token.setAuth(this.authUser);
    const tmpLocation = await fs.mkdtemp(path.join(tmpdir(), "ghcr_tmp")),
    annotations = new Map<string, string>(),
    /** Plaform manifest */
    manifest: imageSchema = {
      schemaVersion: 2,
      config: {mediaType: "application/vnd.oci.image.config.v1+json", digest: "", size: -1},
      layers: []
    },
    /** Blob manifest */
    blob: blobImage = {
      ...platform,
      rootfs: {
        type: "layers",
        diff_ids: []
      }
    };

    const blobUpload = async (fileSize: number, src: (start?: number, end?: number) => any, mediatype: string = "application/octet-stream") => {
      const digest = "sha256:"+(await extendsCrypto.createHashAsync(src(), "sha256", "hex")).hash.sha256;
      let initUpload = await token.setAction("push").request({
        reqPath: ["/v2", this.image.owner, this.image.repo, "blobs/uploads/"],
        disableHTTP2: true,
        method: "POST",
        headers: {
          Connection: "close",
          "Content-Type": mediatype,
          "Content-Length": "0",
        },
        body: src,
      });

      if (initUpload.statusCode === 201) return digest;
      else if (initUpload.statusCode === 202) {
        if (typeof initUpload.headers.location !== "string") throw initUpload;
        const fistPut = await token.request({
          disableHTTP2: true,
          reqPath: initUpload.headers.location,
          method: "PUT",
          query: {digest},
          headers: {
            "Content-Type": mediatype,
            "Content-Length": fileSize.toString(),
            "Transfer-Encoding": "chunked",
            Connection: "close",
          },
          body: src
        });

        // Success put
        if (fistPut.statusCode === 201) return digest;
        initUpload = await token.request({
          disableHTTP2: true,
          method: "POST",
          reqPath: ["/v2", this.image.owner, this.image.repo, "blobs/uploads/"],
          headers: {
            Connection: "close",
            "Content-Type": mediatype,
            "Content-Length": "0",
          },
          body: src,
        });

        if (initUpload.statusCode === 201) return digest;
        else {
          if (typeof initUpload.headers?.location !== "string") throw initUpload;
          const blobPatch = await token.request({
            disableHTTP2: true,
            method: "PATCH",
            reqPath: initUpload.headers.location,
            headers: {
              "Content-Type": mediatype,
              "Transfer-Encoding": "chunked",
              Connection: "close",
              // "Content-Length": fileSize.toString(),
            },
            body: src,
          });

          if (!(blobPatch.statusCode === 202 || blobPatch.statusCode === 201)) throw blobPatch;
          if (blobPatch.statusCode === 201) return digest;

          let putBlob = await token.request({
            disableHTTP2: true,
            method: "PUT",
            reqPath: blobPatch.headers.location,
            // query: {digest},
            headers: {
              "Content-Length": "0",
              "Content-Type": mediatype,
              Connection: "close"
            },
            body: src
          });

          if (putBlob.statusCode === 201) return digest;
          throw putBlob;
        }
      }
      throw initUpload;
    }

    /**
     * Create new layer and publish
     *
     * @param compress - Compress layer. Recomends `gzip`.
     * @returns
     */
    const createBlob = (compress: Exclude<compressAvaible, "deflate"|"xz">) => {
      const tar = tarStream.pack();
      let filePath: string;
      const filePipe = tar.pipe(compressStream(compress)).pipe(createWriteStream((filePath = path.join(tmpLocation, crypto.randomBytes(8).toString("hex")))));
      const annotations = new Map<string, string>();
      return Object.freeze({
        annotations,
        addEntry(headers: tarStream.Headers) {
          return tar.entry(headers);
        },
        async finalize() {
          tar.finalize()
          return finished(filePipe, {error: true}).then(async () => {
            const size = (await fs.lstat(filePath)).size;
            const digest = await blobUpload(size, (start, end) => createReadStream(filePath, {start, end}));
            blob.rootfs.diff_ids.push(digest);
            manifest.layers.push({
              mediaType: compress === "gzip" ? "application/vnd.oci.image.layer.v1.tar+gzip" : "application/vnd.oci.image.layer.v1.tar",
              digest,
              size,
              annotations: Array.from(annotations.keys()).reduce<typeof manifest["annotations"]>((acc, key) => {
                acc[key] = annotations.get(key);
                return acc;
              }, {})
            });
          }).then(() => fs.rm(filePath));
        },
      });
    }

    return Object.freeze({
      annotations,
      createBlob,
      getManifests() {
        return {
          manifest: {...manifest},
          blob: {...blob},
        };
      },
      finalize: async (tagName?: string) => {
        // Upload blob manifest
        const blobString = JSON.stringify(blob, null, 2);
        manifest.config.digest = await blobUpload((manifest.config.size = blobString.length), (start, end) => {
          let data = blobString;
          if (start >= 0 && end <= data.length) data = data.slice(start, end);
          else if (start >= 0) data = data.slice(start);
          return data;
        }, "application/vnd.oci.image.config.v1+json");

        // Manifest
        manifest.annotations = Array.from(annotations.keys()).reduce<typeof manifest["annotations"]>((acc, key) => {acc[key] = annotations.get(key); return acc;}, {});
        const manifestString = JSON.stringify(manifest, null, 2), manifestSHA256 = "sha256:"+(await extendsCrypto.createHashAsync(manifestString)).hash.sha256;
        tagName ||= manifestSHA256;

        const manifestStatus = await token.request({
          disableHTTP2: true,
          reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", tagName],
          method: "PUT",
          headers: {
            "Content-Type": "application/vnd.oci.image.manifest.v1+json",
          },
          body: () => manifestString,
        });
        await fs.rm(tmpLocation, {recursive: true, force: true});
        if (manifestStatus.statusCode !== 201) throw manifestStatus;
        return {
          tagName,
          digest: String(manifestStatus.headers["docker-content-digest"]),
          manifests: {
            manifest: {
              manifets: {...manifest},
              manifestString,
            },
            blob: {
              blob: {...blob},
              blobString,
            },
          }
        };
      }
    });
  }

}