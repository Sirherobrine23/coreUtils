import { extractControl } from "./deb.js";
import { pipeFetch } from "./request/simples.js";

describe("Debian package", function() {
  this.timeout(Infinity);
  // it("Pack debian package", async () => {
  //   const writeDeb = createWriteStream(path.resolve(__dirname, "../examples/pack.deb"));
  //   const pack_data = await packDeb(path.resolve(__dirname, "../examples/debian_pack"));
  //   pack_data.pack.pipe(writeDeb);
  //   return pack_data.wait();
  // });
  it("extract Info", async () => {
    return extractControl(await pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb"));
  });
});