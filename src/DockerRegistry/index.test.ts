import * as OCI from "./index.js";
const repoOptions: OCI.Manifest.optionsManifests = {
  arch: "x64",
  platform: "linux"
};

describe("Docker/OCI registry", function() {
  this.timeout(Infinity);
  it("Get Manifest", async () => await OCI.Manifest.Manifest("ghcr.io/sirherobrine23/initjs:full", repoOptions));
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