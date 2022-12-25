import * as extendsFs from "./extendsFs.js";
import * as url from 'url';
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = url.fileURLToPath(new URL('.', import.meta.url));

describe("Extends FS module", function() {
  this.timeout(Infinity);
  it("Read dir recursive", async () => extendsFs.readdir({folderPath: __dirname}));
  it("Read dir recursive with file info", async () => extendsFs.readdir({folderPath: __dirname, withInfo: true}));
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
