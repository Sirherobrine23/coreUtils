import * as DockerManifest from "./manifests";
const repoConfig: DockerManifest.manifestOptions = {
  owner: "sirherobrine23",
  repository: "initjs",
  registryBase: "ghcr.io"
};

const repoOptions: DockerManifest.fetchPackageOptions = {
  arch: "x64",
  platform: "linux"
};

describe("Docker/OCI manifest", function() {
  this.timeout(Infinity);
  it("Get Manifest", async () => await DockerManifest.getManifest(repoConfig, repoOptions));
});