import { createWriteStream } from "fs";
import { fileURLToPath } from "url";
import { finished } from "stream/promises";
import path from "path";
import dpkg from "../src/index.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Create package", function() {
  this.timeout(Infinity);
  it("Pack", async () => {
    const deb = dpkg.createPackage({
      dataFolder: path.join(__dirname, "debian_pack"),
      control: {
        Package: "test",
        Architecture: "all",
        Version: "1.1.1",
        Description: `Example to create fist line\n\nand Second`,
        Maintainer: {
          Name: "Matheus Sampaio Queiroga",
          Email: "srherobrine20@gmail.com"
        }
      },
      compress: {
        data: "gzip",
        control: "gzip",
      },
      scripts: {
        preinst: "#!/bin/bash\nset -ex\necho OK"
      }
    });

    await finished(deb.pipe(createWriteStream(path.join(__dirname, "example.deb"))));
  });
});
