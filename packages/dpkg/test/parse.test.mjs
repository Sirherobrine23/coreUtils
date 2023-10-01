import { Readable } from "stream";
import { parsePackage, parsePackageStream } from "../src/dpkg.js";
import coreHTTP from "@sirherobrine23/http";
import { finished } from "stream/promises";

describe("Parse package", function() {
  this.timeout(Infinity);
  it("Parse async", async () => {
    const { controlFile, files } = await parsePackage(await coreHTTP.streamRequest("https://github.com/cli/cli/releases/download/v2.25.1/gh_2.25.1_linux_386.deb"));
    if (!(controlFile && files.length > 0)) throw new Error("Invalid parse");
  });
  it("Parse stream", async () => {
    const parse = parsePackageStream();
    (await coreHTTP.streamRequest("https://github.com/cli/cli/releases/download/v2.25.1/gh_2.25.1_linux_386.deb")).pipe(parse);
    let Control, files = [];
    parse.on("control", data => Control = data);
    parse.on("dataFile", (head) => files.push(head));
    await finished(parse, { error: true });
    if (!(Control && files.length > 0)) throw new Error("Invalid parse");
  });
});
