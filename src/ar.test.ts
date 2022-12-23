import { pipeFetch } from "./request/simples.js";
import { createUnpack, createPack } from "./ar.js";
import { extendFs } from "./index.js";
import { createReadStream, createWriteStream } from "fs";
import { list } from "tar";

describe("ar", function () {
  this.timeout(Infinity);
  it("Unpack", async () => {
    if (!await extendFs.exists("examples/gh.deb")) {
      await pipeFetch({
        url: "https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb",
        waitFinish: true,
        stream: createWriteStream("examples/gh.deb"),
      });
    }
    return new Promise(async (done, reject) => {
      createReadStream("examples/gh.deb").on("error", reject).on("end", done).pipe(createUnpack((info, st) => {
        if (process.env.DEBUG) console.log("Ar file info %o", info);
        if (!info.name.includes(".tar")) return st;
        return st.pipe(list({
          onentry: entry => {
            if (process.env.DEBUG) console.log("Ar tar extract, from %s, entry tar path: %s", info.name, entry.path);
          },
        }));
      }));
    });
  });

  it("Pack", async () => {
    return new Promise((done, reject) => {
      const write = createWriteStream("examples/test_ar.a");
      const pack = createPack();
      pack.pipe(write);
      pack.addFile({
        name: "test.txt",
        size: 5,
        group: 0,
        owner: 0,
        time: new Date(),
        mode: 0o644,
      }, Buffer.from("test\n", "utf8")).then(done).catch(reject);
    });
  });
});