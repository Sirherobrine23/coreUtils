import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";
import { extendFs } from "./index.js";
import { createReadStream, createWriteStream } from "fs";
import { list } from "tar";

describe("ar", function () {
  this.timeout(Infinity);
  it("Unpack", async () => {
    if (!await extendFs.exists("test.deb")) {
      await pipeFetch({
        url: "https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb",
        waitFinish: true,
        stream: createWriteStream("test.deb"),
      });
    }
    return new Promise(async (done, reject) => {
      createReadStream("test.deb").on("error", reject).on("end", done).pipe(createUnpack((info, st) => {
        if (!info.name.includes(".tar")) return st;
        return st.pipe(list({
          onentry: entry => {
            if (process.env.DEBUG) console.log("Ar tar extract, from %s, entry tar path: %s", info.name, entry.path);
          },
        }));
      }));
    });
  });
});