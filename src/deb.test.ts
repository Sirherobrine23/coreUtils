import { createWriteStream } from "node:fs";
import { extractControl, packDeb } from "./deb.js";
import { pipeFetch } from "./request/simples.js";
import path from "node:path";

describe("Debian package", function() {
  this.timeout(Infinity);
  it("extract Info", async () => {
    return extractControl(await pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb"));
  });
  it("Pack debian package", async () => {
    const writeDeb = createWriteStream(path.resolve("examples/pack.deb"));
    const pack_data = await packDeb(path.resolve("examples/debian_pack"));
    pack_data.pack.pipe(writeDeb);
    // return extractControl(pack_data.pack);
    return pack_data.wait();
  });
});