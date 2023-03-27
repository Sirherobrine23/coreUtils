import { v2 } from "../src/index.js";
process.on("unhandledRejection", err => console.error("Error:", err));
const img = new v2("ubuntu");
const tags = await img.getTags();
const manifestManeger = await img.getManifets(tags.at(-1));
if (manifestManeger.multiArch) {
  await manifestManeger.setPlatform({
    os: "linux",
    arch: "x64",
  });
}

console.dir({
  origin: manifestManeger.originalManifest,
  target: manifestManeger.manifest,
  layers: manifestManeger.getLayers(),
}, {
  color: true,
  depth: null,
});