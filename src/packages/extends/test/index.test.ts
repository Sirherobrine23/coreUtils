import { extendsFS, extendsCrypto } from "../src/index.js";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import crypto from "node:crypto";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Extends FS", function() {
  it("Exists", async () => await extendsFS.exists(__filename) && await extendsFS.exists(__dirname));
  it("Read dir recursive", async () => extendsFS.readdir(path.resolve(__dirname, "..")));
  it("Is file", async () => await extendsFS.isFile(__filename) ? Promise.resolve() : Promise.reject(new Error("Not a file")));
  it("Is directory", async () => await extendsFS.isDirectory(__dirname) ? Promise.resolve() : Promise.reject(new Error("Not a directory")));
});

describe("Extends Crypto", function() {
  this.timeout(Infinity);
  function createRandomBytes() {
    return crypto.randomBytes(Math.floor(Math.random() * (1024 ** 2)));
  }
  it("Promise", async () => {
    const data = createRandomBytes();
    const hash = await extendsCrypto.createHashAsync(data);
    if (data.byteLength !== hash.byteLength) throw new Error("Data not received");
    // console.log(hash);
  });
  it("Callback", (done) => {
    const data = createRandomBytes();
    return Readable.from(data).pipe(extendsCrypto.createHash("all").once("hashObject", (hash) => {
      if (data.byteLength !== hash.byteLength) throw new Error("Data not received");
      // console.log(hash);
      return done();
    }).on("error", done));
  });
});