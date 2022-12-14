import { packDeb, getControl, parseRelease } from "./deb.js";
import { pipeFetch, bufferFetch } from "./request/simples.js";
import path from "node:path";

describe("Debian package", function() {
  this.timeout(Infinity);
  it("APT Release", async () => parseRelease((await bufferFetch("http://ftp.debian.org/debian/dists/stable/Release")).data));
  it("Get control file", async () => getControl(await pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb")));
  it("Create debian package", async () => {
    const pack_data = await packDeb({
      cwd: path.resolve("examples/debian_pack"),
      outputFile: path.resolve("examples/pack.deb"),
      compress: "gzip",
      getStream: false,
    });
    console.log(pack_data);
  });
});