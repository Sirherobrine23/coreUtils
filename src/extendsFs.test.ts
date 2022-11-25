import * as extendsFs from "./extendsFs";

describe("Extends FS module", function() {
  this.timeout(Infinity);
  it("Read dir recursive", async () => await extendsFs.readdirrecursive(__dirname));
  it("Exists", async () => {
    if (await extendsFs.exists(__dirname)) return;
    throw new Error("Invalid return current exists folder");
  });
  it("isDirectory", async () => {
    if (await extendsFs.isDirectory(__dirname)) return;
    throw new Error("Invalid return isDirectory");
  });
  it("isFile", async () => {
    if (await extendsFs.isFile(__filename)) return;
    throw new Error("Invalid return isFile");
  });
});
