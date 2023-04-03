import { dpkg, apt } from "../src/index.js";
import { http } from "@sirherobrine23/http";

describe("Debian package", function () {
  this.timeout(Infinity);
  it("Parse package file", async () => {
    const debianStream = await http.streamRequest("https://github.com/cli/cli/releases/download/v2.22.0/gh_2.22.0_linux_amd64.deb");
    const data = await dpkg.parsePackage(debianStream);
    // console.log(data);
    return data;
  });
});