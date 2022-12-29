import { extractControl, packDeb } from "./deb.js";
import { pipeFetch } from "./request/simples.js";
import path from "node:path";

describe("Debian package", function() {
  this.timeout(Infinity);
  it("extract Info", async () => {
    return extractControl(await pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb"));
  });
  it("Pack debian package", async () => {
    const pack_data = await packDeb({
      cwd: path.resolve("examples/debian_pack"),
      outputFile: path.resolve("examples/pack.deb"),
      compress: "gzip",
      getStream: false,
    });
    console.log(pack_data);
  });
});