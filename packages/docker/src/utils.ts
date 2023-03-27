import EventEmitter from "events";
import stream from "stream";
import zlib from "zlib";
import tar from "tar";
import { v2 } from "./registry.js";
import { nodeToGO } from "./image.js";

export interface Dir {
  path: string;
  mtime?: Date;
  gid?: number;
  uid?: number;
}

export interface Link {
  isSymbolicLink: boolean;
  path: string;
  target: string;
}

export interface Dev {
  devicePath: string;
  mode?: number;
  uid?: number;
  gid?: number;
}

export class extractLayer extends EventEmitter {
  constructor(layerStream: stream.Readable, mediaType?: string) {
    super({captureRejections: true});
    if (mediaType && mediaType.includes("tar")) {
      if (mediaType.includes("gzip")) layerStream = layerStream.pipe(zlib.createGunzip());
      else if (mediaType.includes("zstd")) throw new Error("Cannot extract layer, not support to zstd");
    }
    layerStream.pipe(tar.list()).on("error" as any, err => this.emit("error", err)).on("end", () => this.emit("end")).on("close", () => this.emit("close")).on("entry", entry => {
      if (entry.type === "CharacterDevice") this.emit("CharacterDevice", {devicePath: entry.path as string, mode: entry.mode, uid: entry.uid, gid: entry.gid});
      else if (entry.type === "File") this.emit("File", entry);
      else if (entry.type === "SymbolicLink"||entry.type === "Link") this.emit("Link", {isSymbolicLink: entry.type === "SymbolicLink", path: entry.path, target: entry["linkpath"] as string});
      else if (entry.type === "Directory") {
        const dirObj: Dir = {
          path: entry.path,
          mtime: entry.mtime ? new Date(entry.mtime) : undefined,
          gid: entry.gid,
          uid: entry.uid
        }
        this.emit("Dir", dirObj);
      }
    });
  }

  emit(event: "end"): boolean;
  emit(event: "close"): boolean;
  emit(event: "error", err: any): boolean;
  emit(event: "File", src: tar.ReadEntry): boolean;
  emit(event: "Dir", data: Dir): boolean;
  emit(event: "Link", data: Link): boolean;
  emit(event: "CharacterDevice", data: Dev): boolean;
  emit(event: string, ...args: any[]) {
    return super.emit(event, ...args);
  }

  on(event: "error", fn: (err: any) => void): this;
  on(event: "end", fn: () => void): this;
  on(event: "close", fn: () => void): this;
  on(event: "File", fn: (src: tar.ReadEntry) => void): this;
  on(event: "Dir", fn: (data: Dir) => void): this;
  on(event: "Link", fn: (data: Link) => void): this;
  on(event: "CharacterDevice", fn: (data: Dev) => void): this;
  on(event: string, fn: (...args: any[]) => void) {
    super.on(event, fn);
    return this;
  }

  once(event: string, fn: (...args: any[]) => void) {
    super.on(event, fn);
    return this;
  }
}


export class Manifest<T = any> {
  manifest: T;
  readonly originalManifest: any;
  readonly multiArch: boolean;
  constructor(manifestObject: T, v2: v2) {
    if (!manifestObject) throw new TypeError("Required Manifest!");
    this.manifest = manifestObject;
    Object.defineProperty(this, "originalManifest", {writable: false, value: manifestObject});
    Object.defineProperty(this, "multiArch", {
      writable: false,
      value: !!((manifestObject as any).manifests)
    });
    if (this.multiArch) {
      this.platforms = this.originalManifest.manifests.map(({platform}) => platform);
      this.setPlatform = async function(options) {
        const target = this.originalManifest.manifests.find(({platform}) => (platform.architecture === nodeToGO("arch", options?.arch ?? process.arch)) && (platform.os === nodeToGO("platform", options?.os ?? process.platform)) && (!platform.variant || (!options.variant) || (platform.variant === options.variant)) && (!(platform["os.version"]) || !(options.version) || (options.version === platform["os.version"])));
        if (!target) throw new Error("Target not exists!");
        return this.manifest = await v2.getManifets(target.digest);
      }
    }
  }

  getLayers(): {digest: string, mediaType?: string}[] {
    const mani: any = this.manifest;
    if (Array.isArray(mani?.layers)) return mani.layers.map(({digest, mediaType}) => ({digest, mediaType}));
    else if (Array.isArray(mani?.fsLayers)) return mani.fsLayers.map(({blobSum}) => ({digest: blobSum}));
    throw new Error("Cannot get layer get manualy!");
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
