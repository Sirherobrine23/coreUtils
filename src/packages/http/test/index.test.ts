import { http, large } from "../src/index.js";
const zipUrl = "https://github.com/Sirherobrine23/coreUtils/archive/refs/heads/main.zip";
const tarUrl = "https://github.com/Sirherobrine23/coreUtils/archive/refs/heads/main.tar.gz";

describe("Simples HTTP Client", function () {
  this.timeout(Infinity);
  it("Stream request", async () => http.streamRequest("https://www.google.com"));
  it("Buffer request", async () => http.bufferRequest("https://www.google.com"));
  it("Json request", async () => http.jsonRequest("https://httpbin.org/json"));
});

describe("Large HTTP Client", function () {
  this.timeout(Infinity);
  it("Save file", async () => large.saveFile("https://www.google.com"));
  it("Adm Zip", async () => large.admZip(zipUrl));
  it("Adm Tar", async () => (large.Tar(tarUrl)).extract());
});