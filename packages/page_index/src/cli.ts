#!/usr/bin/env node
import path from "node:path";
import yargs from "yargs";
import pageIndex from "./index.js";

const options = yargs(process.argv.slice(2)).strictOptions().help(false).option("subPath", {
  alias: "s",
  default: "/"
}).parseSync();

// Create index
await pageIndex({
  subPath: options.subPath||"/",
  folder: path.resolve(process.cwd(), String(options._.at(-1) ?? "")),
});