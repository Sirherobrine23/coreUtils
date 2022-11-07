import * as httpRequest from "../src/request/simples";
import * as httpRequestLarge from "../src/request/large";
import * as httpRequestGithub from "../src/request/github";
import * as httpRequestClient from "../src/request/client";

const simplesRequest = "https://sirherobrine23.org", simplesJson = "https://httpbin.org/anything",
  largeRequestZip = "https://github.com/The-Bds-Maneger/coreUtils/archive/refs/heads/main.zip",
  largeRequestTar = "https://github.com/The-Bds-Maneger/coreUtils/archive/refs/heads/main.tar.gz";

describe("HTTP Simples Client", function() {
  this.timeout(Infinity);
  it("Get Buffer", async () => await httpRequest.bufferFetch(simplesRequest));
  it("Get JSON", async () => await httpRequest.getJSON(simplesJson));
  it("Get Page URLs", async () => await httpRequest.urls(simplesRequest));
});

describe("HTTP Large files/requests", function() {
  this.timeout(Infinity);
  it("GET Large file (pipeFetch)", async () => httpRequestLarge.saveFile(largeRequestZip));
  it("Zip and Zip extract", async () => httpRequestLarge.extractZip(largeRequestZip));
  it("Tar extract", async () => httpRequestLarge.tarExtract(largeRequestTar));
});

describe("HTTP Client info", function() {
  this.timeout(Infinity);
  it("Get External IPs", async () => httpRequestClient.getExternalIP());
});

describe("HTTP Github API", function() {
  this.timeout(Infinity);
  it("Releases", async () => httpRequestGithub.GithubRelease("The-Bds-Maneger", "Bds-Maneger-Core"));
  it("Tree", async () => httpRequestGithub.githubTree("The-Bds-Maneger", "Bds-Maneger-Core"));
});