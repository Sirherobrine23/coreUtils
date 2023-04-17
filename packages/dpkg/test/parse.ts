import { parsePackage } from "../src/dpkg.js";
import coreHTTP from "@sirherobrine23/http";
console.log(await parsePackage(await coreHTTP.streamRequest("https://github.com/cli/cli/releases/download/v2.25.1/gh_2.25.1_linux_386.deb")));