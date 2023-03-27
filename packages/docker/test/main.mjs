import { v2, Utils } from "../src/index.js";
process.on("unhandledRejection", err => console.error("Error:", err));
const registry = new v2("ubuntu");
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

const layer = manifestManeger.getLayers().at(0);
const layerParse = await registry.extractLayer(layer.digest, layer.mediaType);
layerParse.on("File", file => file.on("data", data => console.log("%s Data %O", file.path, data)));