import * as OCI from "./index.js";
const repoOptions: OCI.Manifest.platfomTarget = {
  arch: "x64",
  platform: "linux"
};

describe("Docker/OCI registry", function() {
  this.timeout(Infinity);
  it("Get Manifest", async () => {
    const data = await Promise.all([
      OCI.Manifest.Manifest("ghcr.io/sirherobrine23/nodeaptexample:latest", repoOptions).then(res => res.imageManifest()),
      OCI.Manifest.Manifest("ghcr.io/sirherobrine23/initjs:full", repoOptions).then(res => res.imageManifest()),
      OCI.Manifest.Manifest("debian:latest", repoOptions).then(res => res.imageManifest()),
      OCI.Manifest.Manifest("ubuntu", repoOptions).then(res => res.imageManifest()),
    ]);
    return data;
  });
  it("Stream layer", async () => {
    const registry = await OCI.Manifest.Manifest("ghcr.io/sirherobrine23/nodeaptexample:latest", repoOptions);
    return registry.layersStream((data) => {
      data.stream.on("data", (chunk) => chunk.length);
      data.next();
    });
  });
  it("Image parse", () => {
    const imagesURi = [
      "ghcr.io/sirherobrine23/initjs:full@sha256:6d5a767501731f7b4e65d1e216d253fb47a3a4cb9404944460f4a0379774a2b6",
      "ghcr.io/sirherobrine23/initjs:full",
      "ubuntu/ubuntu",
      "debian:buster",
    ];
    return imagesURi.map(imageString => OCI.Utils.toManifestOptions(imageString));
  });
});