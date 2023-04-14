import { v2, Utils } from "../src/index.js";
process.on("unhandledRejection", err => console.error("Error:", err));
const registry = new v2("ghcr.io/homebrew/core/openssl/1.1:1.1.1t");
const tags = await registry.getTags();
const manifest = await registry.getManifets(tags.at(-1))
const manifestManeger = new Utils.Manifest(manifest, registry);
if (manifestManeger.multiArch) await manifestManeger.setPlatform({os: "linux", arch: "x64"});

console.dir({
  origin: manifest,
  target: manifestManeger.manifest
}, {
  color: true,
  depth: null,
});

console.dir(await registry.getBlobManifest(manifestManeger.manifest.config.digest), {
  color: true,
  depth: null,
});