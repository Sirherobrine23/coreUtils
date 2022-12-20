import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";
import tar from "tar";

console.clear();
pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb").then(st => {
  st.on("end", () => console.log("[test ar]: End"));
  st.pipe(createUnpack((info, st) => {
    console.log(info.name);
    st.pipe(tar.list({onentry: ({path}) => console.log(path)}));
  }));
});