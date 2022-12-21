import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";
import tar from "tar";

console.clear();
pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb").then(st => {
  // st.on("end", () => console.log("[test ar]: End"));
  st.pipe(createUnpack((info, st) => {
    if (!info.name.endsWith(".tar.gz")) return null;
    console.log("[test ar]: File %s", info.name);
    return st.pipe(tar.t({
      onentry: entry => console.log("[test tar]: %s", entry.path),
    }));
  }));
});