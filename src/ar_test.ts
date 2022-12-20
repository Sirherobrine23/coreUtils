import { createExtract } from "./ar.js";
import { pipeFetch } from "./request/simples.js";

console.clear();
pipeFetch("https://github.com/cli/cli/releases/download/v2.20.2/gh_2.20.2_linux_386.deb").then(st => {
  st.on("end", () => console.log("[test ar]: End"));
  st.pipe(createExtract((info) => {
    let length = 0;
    info.stream.on("data", (chunk) => length += chunk.length);
    return info.stream.on("end", () => {
      const diff = info.size - length;
      if (diff !== 0) console.log("[test ar]: File %s, size: %f, length: %f, diff: %f", info.name, info.size, length, diff);
      else console.log("[test ar]: File %s, size: %f, length: %f", info.name, info.size, length);
    });
  }));
});

setInterval(() => {}, 1000);