import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { decompressStream, compressAvaible, compressStream } from "@sirherobrine23/decompress";
import { goArch, goSystem, parseImage } from "./image.js";
import { Auth, userAuth } from "./auth.js";
import { extendsCrypto } from "@sirherobrine23/extends";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import tarStream from "tar-stream";
import crypto from "node:crypto";
import path from "node:path";

export interface dockerPlatform {
  architecture: goArch;
  os: goSystem;
  "os.version"?: string;
  "os.features"?: string[];
  features?: string[];
  variant?: string;
}

/** Debian packages arch's */
export type debianArch = "all"|"armhf"|"armel"|"mipsn32"|"mipsn32el"|"mipsn32r6"|"mipsn32r6el"|"mips64"|"mips64el"|"mips64r6"|"mips64r6el"|"powerpcspe"|"x32"|"arm64ilp32"|"i386"|"ia64"|"alpha"|"amd64"|"arc"|"armeb"|"arm"|"arm64"|"avr32"|"hppa"|"m32r"|"m68k"|"mips"|"mipsel"|"mipsr6"|"mipsr6el"|"nios2"|"or1k"|"powerpc"|"powerpcel"|"ppc64"|"ppc64el"|"riscv64"|"s390"|"s390x"|"sh3"|"sh3eb"|"sh4"|"sh4eb"|"sparc"|"sparc64"|"tilegx";
export function debianArchToDockerPlatform(Architecture: debianArch, variant: "linux"|"android" = "linux"): dockerPlatform {
  const platform: dockerPlatform = {os: variant||"linux", architecture: Architecture as any};
  if (Architecture === "all") platform.architecture = "amd64";
  else if (Architecture === "amd64") platform.architecture = "amd64";
  else if (Architecture === "i386") platform.architecture = "386";
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
  else if (Architecture === "ppc64") platform.architecture = "ppc64";
  else if (Architecture === "ppc64el") platform.architecture = "ppc64le";
  else if (Architecture === "mipsel") platform.architecture = "mipsle";
  else if (Architecture === "mips") platform.architecture = "mips";
  return platform;
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

function validateRef(ref: string) {
  return (/^(sha256:[a-z0-9]+|[a-z0-9]+)$/).test(ref);
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

  /**
   * Get all tag registred in repository.
   *
   * @returns tags array.
   */
  async getTags() {
    return (await (new Auth(this.image, this.authUser)).requestJSON<{tags: string[]}>({reqPath: ["/v2", this.image.owner, this.image.repo, "tags/list"]})).body.tags;
  }

  /**
   * Get repository/image manifest.
   *
   * @param ref - Reference name or sha256 to get Manifest, if not set get from image parse or latest tag.
   */
  async getManifets<T = any>(ref: string = this.image.sha256||this.image.tag) {
    const token = new Auth(this.image, this.authUser);
    if (!ref) ref = (await this.getTags()).at(-1);
    if (!ref) throw new Error("Please set reference name or sha256:!");
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    const manifest = await token.requestJSON<T>({
      reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", ref],
      headers: {
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    });
    if (manifest.statusCode !== 200) throw new Error("This digest/ref not exists in registry", {cause: manifest});
    return manifest.body;
  }

  /**
   * Delete manifest from repository
   *
   * @param ref - Reference name or sha256 to get Manifest, if not set get from image parse or latest tag.
   */
  async deleteManifets(ref: string = this.image.sha256||this.image.tag) {
    if (!ref) throw new Error("Please set reference name or sha256:!");
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    const res = await (new Auth(this.image, this.authUser)).request({
      method: "DELETE",
      reqPath: ["/v2", this.image.owner, this.image.repo, "manifests", ref],
      headers: {accept: Array.from(this.manifestsAccepts).join(", ")}
    });
    if (res.statusCode !== 201) throw new Error("Cannot delete manifest!", {cause: res});
  }

  /**
   * Get layer stream
   *
   * @param ref - Layer digest
   * @returns Layer stream
   */
  async getBlob(ref: string) {
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    const req = await (new Auth(this.image, this.authUser)).request({reqPath: ["/v2", this.image.owner, this.image.repo, "blobs", ref]});
    if (req.statusCode !== 200) throw new TypeError("This digest/ref not exists in registry", {cause: req});
    return req.body;
  }

  /**
   * Get layer and extract tar
   *
   * @param ref - Layer digest
   */
  async extractLayer(ref: string) {
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    return (await this.getBlob(ref)).pipe(decompressStream()).pipe(tarStream.extract());
  }

  /**
   * Delete blob layer
   *
   * @param ref - Layer digest
   */
  async deleteBlob(ref: string) {
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    const req = await (new Auth(this.image, this.authUser)).setAction("push").request({
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
  async getBlobManifest<T = any>(ref: string) {
    if (!validateRef(ref)) throw new Error("Invalid reference name or sha256!");
    const req = await (new Auth(this.image, this.authUser)).requestJSON<T>({
      reqPath: ["/v2", this.image.owner, this.image.repo, "blobs", ref],
      headers: {
        accept: Array.from(this.manifestsAccepts).join(", "),
      }
    });
    if (req.statusCode !== 200) throw new TypeError("This digest/ref not exists in registry");
    return req.body;
  }

  /** Create multi arch schema to publish in Registry */
  createMultiArch() {
    const token = new Auth(this.image, this.authUser);
    const base: multiArchSchema = {
      schemaVersion: 2,
      manifests: [],
      annotations: {}
    }, annotations = new Map<string, string>();

    const newPlatform = async (platform: dockerPlatform, annotations?: (typeof base["annotations"])|Map<string, string>) => {
      const create = await this.createImage(platform);
      return {
        createBlob: create.createBlob,
        async done() {
          if (!annotations) annotations = {};
          else if (annotations instanceof Map) annotations = Array.from(annotations.keys()).reduce<typeof base["annotations"]>((acc, key) => {acc[key] = (annotations as Map<string, string>).get(key); return acc;}, {});
          const { digest, manifests: { manifest: { manifestString } } } = await create.finalize();
          const doc: typeof base.manifests[number] = {
            mediaType: "application/vnd.oci.image.config.v1+json",
            digest,
            size: manifestString.length,
            platform,
            annotations
          };
          base.manifests.push(doc);
          return {...doc};
        },
      }
    }

    return Object.freeze({
      newPlatform,
      async publish(tagName?: string) {
        if (base.manifests.length <= 0) throw new Error("Invalid manifests, must have more than one!");
        if (typeof tagName === "string" && tagName.startsWith("sha256:")) throw new Error("Set tag name not hash/digest!");
        base.annotations = Array.from(annotations.keys()).reduce<typeof base["annotations"]>((acc, key) => {
          acc[key] = annotations.get(key);
          return acc;
        }, {});

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
      },
    });
  }

  /**
   * Publish blobs and manifest to Registry
   *
   * Registry publish specs from:
   * - https://github.com/opencontainers/distribution-spec/blob/e79ab906f303fee1510f07f8273f5984689f5efe/conformance/02_push_test.go
   * - https://github.com/opencontainers/distribution-spec/blob/v1.1.0-rc1/spec.md#pushing-a-blob-monolithically
   * - https://github.com/distribution/distribution/blob/main/docs/spec/api.md
   * - https://docs.docker.com/registry/spec/api/
   */
  async createImage(platform: dockerPlatform) {
    const token = new Auth(this.image, this.authUser);
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

    const blobUpload = async (fileSize: number, src: (start?: number, end?: number) => Readable|Buffer|string, mediatype: string = "application/octet-stream") => {
      const digest = "sha256:"+(await extendsCrypto.createHashAsync(src(), "sha256", "hex")).hash.sha256;
      let initUpload = await token.setAction("push").request({
        reqPath: ["/v2", this.image.owner, this.image.repo, "blobs/uploads/"],
        disableHTTP2: true,
        method: "POST",
        query: {digest},
        headers: {
          Connection: "close",
          "Content-Type": mediatype,
          "Content-Length": fileSize.toString(),
        },
        body: src,
      });

      if (initUpload.statusCode === 404) initUpload = await token.request({
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

      if (initUpload.statusCode === 201) return String(initUpload.headers["docker-content-digest"]||digest);
      else if (initUpload.statusCode === 202) {
        if (typeof initUpload.headers.location !== "string") throw initUpload;
        const fistPut = await token.request({
          disableHTTP2: true,
          reqPath: initUpload.headers.location,
          method: "PUT",
          query: {digest},
          headers: {
            Connection: "close",
            "Content-Type": mediatype,
            "Content-Length": fileSize.toString(),
            // "Transfer-Encoding": "chunked",
          },
          body: src
        });

        // Success put
        if (fistPut.statusCode === 201) return String(fistPut.headers["docker-content-digest"]||digest);
        else if (fistPut.statusCode === 400 || fistPut.statusCode === 500) throw fistPut;
        if (typeof initUpload.headers?.location === "string") await token.request({disableHTTP2: true, method: "DELETE", reqPath: initUpload.headers.location});
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
        if (initUpload.statusCode === 201) return String(initUpload.headers["docker-content-digest"]||digest);
        else if (typeof initUpload.headers?.location !== "string") throw initUpload;
        const blobPatch = await token.request({
          disableHTTP2: true,
          method: "PATCH",
          reqPath: initUpload.headers.location,
          headers: {
            Connection: "close",
            "Transfer-Encoding": "chunked",
            // "Content-Length": fileSize.toString(),
            // "Content-Range": `0-${fileSize-1}`,
            "Content-Type": mediatype,
          },
          body: src,
        });

        if (!(blobPatch.statusCode === 202 || blobPatch.statusCode === 201)) throw blobPatch;
        if (blobPatch.statusCode === 201) return String(blobPatch.headers["docker-content-digest"]||digest);
        const putBlob = await token.request({
          disableHTTP2: true,
          method: "PUT",
          reqPath: String(blobPatch.headers.location),
          query: {digest},
          headers: {
            Connection: "close"
          }
        });

        if (putBlob.statusCode === 201) return String(putBlob.headers["docker-content-digest"]||digest);
        throw putBlob;
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
          tar.finalize();
          await finished(filePipe, {error: true});
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
          await fs.rm(filePath);
          return digest;
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
        manifest.config.digest = await blobUpload((manifest.config.size = blobString.length), () => blobString/*, "application/vnd.oci.image.config.v1+json"*/);

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