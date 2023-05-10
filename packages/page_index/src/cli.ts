#!/usr/bin/env node
import { createIndex, defaultIcons } from "./index.js";
import yargs from "yargs";
import path from "path";

const options = yargs(process.argv.slice(2)).help(true).alias("h", "help").strictOptions().option("rootPage", {
  default: "/",
  type: "string",
  string: true,
  description: "set Root page, use if run to Github pages"
}).option("source", {
  type: "string",
  string: true,
  alias: [
    "src", "s"
  ],
  default: process.cwd(),
  description: "Page source."
}).parseSync();

await createIndex(path.resolve(process.cwd(), options.source), {
  rootPage: options.rootPage,
  icons: defaultIcons,
}).catch(err => {
  console.error(err);
  process.exit(1);
});