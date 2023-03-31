import { debianPackage, apt } from "../src/index.js";
import { http } from "@sirherobrine23/http";

describe("Debian package", function () {
  this.timeout(Infinity);
  it("Parse package file", async () => {
    const debianStream = await http.streamRequest("https://github.com/cli/cli/releases/download/v2.22.0/gh_2.22.0_linux_amd64.deb");
    const data = await debianPackage.parsePackage(debianStream);
    // console.log(data);
    return data;
  });
});

describe("Debian repository", function() {
  this.timeout(Infinity);
  it("Parse release file", async () => {
    apt.parseRelease(await http.bufferRequest("https://ftp.debian.org/debian/dists/stable/Release").then(x => x.body));
  });
  it("Get packges from repository", async () => {
    const release = apt.parseRelease(await http.bufferRequest("http://ftp.debian.org/debian/dists/stable/Release").then(x => x.body));
    const data = await apt.getPackages("http://deb.debian.org/debian/dists/stable/", release);
    // console.log(data);
    return data;
  });
});