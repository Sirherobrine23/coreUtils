import { pipeFetch } from "./request/simples.js";
import { createUnpack } from "./ar.js";

console.clear();
pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb").then(st => {
  // st.on("end", () => console.log("[test ar]: End"));
  st.pipe(createUnpack((info, st) => {
    let totalSize = 0;
    st.on("data", (chunk) => totalSize += chunk.length);
    st.on("end", () => {
      if (0 !== (totalSize - info.size)) return console.log(`[test ar]: ${info.name}: End size ${totalSize}, correct size ${info.size}, diff ${totalSize - info.size}`);
      console.log(`[test ar]: ${info.name}: Correct`);
    });
  }));
});

setInterval(() => {}, 1000);