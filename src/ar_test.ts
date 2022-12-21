import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";
import { format } from "util";

console.clear();
pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb").then(st => {
  // st.on("end", () => console.log("[test ar]: End"));
  st.pipe(createUnpack((info, st) => {
    let checkCorrectSize = 0;
    st.on("data", chunk => checkCorrectSize += chunk.length);
    st.on("end", () => {
      if (checkCorrectSize !== info.size) throw new Error(format("[test ar]: Error size to %s, diff", info.name, info.size - checkCorrectSize));
      console.log("[test ar]: Correct size to %s", info.name);
    });
  }));
});

// setInterval(() => {}, 1000);