import * as httpRequest from "./simples.js";
import * as httpRequestLarge from "./large.js";
import * as httpRequestClient from "./client.js";

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
