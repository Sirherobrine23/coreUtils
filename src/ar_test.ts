import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";
import tar from "tar";
import { extendFs } from "./index.js";
import { createReadStream, createWriteStream } from "fs";
console.clear();

if (!await extendFs.exists("test.deb")) {
  await pipeFetch({
    url: "https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb",
    waitFinish: true,
    stream: createWriteStream("test.deb"),
  });
}

createReadStream("test.deb").pipe(createUnpack((info, st) => {
  if (!info.name.endsWith(".tar.gz")) return st.on("data", chunk => console.log("[test ar]: %s", chunk.toString()));
  console.log("[test ar]: File %s", info.name);
  st.pipe(tar.list({
    onentry: entry => console.log("[test tar]: %s", entry.path),
  }));
  // st.on("data", chunk => console.log("[test ar]: %s", chunk.length));
  return st;
}));