import * as httpRequest from "./simples.js";
import * as httpRequestLarge from "./large.js";

const simplesRequest = "https://github.com", simplesJson = "https://httpbin.org/anything",
  largeRequestZip = "https://github.com/The-Bds-Maneger/coreUtils/archive/refs/heads/main.zip",
  largeRequestTar = "https://github.com/The-Bds-Maneger/coreUtils/archive/refs/heads/main.tar.gz";

describe("HTTP Simples Client", function() {
  this.timeout(Infinity);
  it("Get Page URLs", async () => await httpRequest.urls(simplesRequest));
  it("Get Buffer", async () => await httpRequest.bufferFetch(simplesRequest));
  it("Get JSON", async () => await httpRequest.getJSON(simplesJson));
});

describe("HTTP Large files/requests", function() {
  this.timeout(Infinity);
  it("GET Large file (pipeFetch)", async () => httpRequestLarge.saveFile(largeRequestZip));
  it("Zip and Zip extract", async () => httpRequestLarge.extractZip(largeRequestZip));
  it("Tar extract", async () => httpRequestLarge.tarExtract(largeRequestTar));
});