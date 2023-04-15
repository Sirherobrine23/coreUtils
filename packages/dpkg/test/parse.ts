import { parsePackage, createControl } from "../src/deb.js";
import coreHTTP from "@sirherobrine23/http";
console.log(await parsePackage(await coreHTTP.streamRequest("https://github.com/cli/cli/releases/download/v2.25.1/gh_2.25.1_linux_386.deb")));
console.log(await parsePackage(await coreHTTP.streamRequest("https://ftp.debian.org/debian/pool/main/g/git/git-all_2.40.0-1_all.deb")));
console.log(await parsePackage(await coreHTTP.streamRequest("https://ftp.debian.org/debian/pool/main/g/git/git_2.20.1-2+deb10u3_amd64.deb")));