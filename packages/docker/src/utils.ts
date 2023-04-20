import { v2 } from "./registry.js";
import { nodeToGO } from "./image.js";

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