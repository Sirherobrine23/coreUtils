import { readdirV2 } from "../src/fs.js";

console.log(await readdirV2("./", true, (path) => {
  return !(path.startsWith("node_modules") || path.startsWith(".git"));
}));