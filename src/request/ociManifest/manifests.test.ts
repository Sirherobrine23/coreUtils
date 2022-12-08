import * as DockerManifest from "./manifests";
const repoOptions: DockerManifest.fetchPackageOptions = {
  arch: "x64",
  platform: "linux"
};

describe("Docker/OCI manifest", function() {
  this.timeout(Infinity);
  it("Get Manifest", async () => await DockerManifest.getManifest("ghcr.io/sirherobrine23/initjs:full", repoOptions));
  it("Image parse", async () => {
    const imagesURi = [
      "ghcr.io/sirherobrine23/initjs:full@sha256:6d5a767501731f7b4e65d1e216d253fb47a3a4cb9404944460f4a0379774a2b6",
      "ghcr.io/sirherobrine23/initjs:full",
      "debian:buster",
      "ubuntu/ubuntu"
    ];
    return imagesURi.map(image => [DockerManifest.parseImageURI(image), DockerManifest.toManifestOptions(image)]);
  });
});