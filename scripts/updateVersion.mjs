#!/usr/bin/env ts-node
import { fileURLToPath } from "node:url";
import semver from "semver";
import path from "node:path";
import fs from "node:fs/promises";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../packages");

let version = process.argv.slice(2)[0];
if (version?.startsWith("refs/tags/")) version = version.slice(10);
version = semver.valid(semver.coerce(version));
if (!version) {
  console.log("No version provided");
  process.exit(1);
}

let packagesData = await Promise.all((await fs.readdir(root)).map(async packageName => ({path: path.join(root, packageName, "package.json"), data: JSON.parse(await fs.readFile(path.join(root, packageName, "package.json"), "utf8"))})));
packagesData = packagesData.map(conf => {
  console.log(`Updating ${conf.data.name} to ${version}`);
  conf.data.version = version;
  if (conf.data.dependencies) for (const dep in conf.data.dependencies) if (packagesData.find(p => p.data.name === dep)) {
    console.log(`\tUpdating dependency ${dep} to ${version}`);
    conf.data.dependencies[dep] = version;
  }
  return conf;
});

await Promise.all(packagesData.map(({path, data}) => fs.writeFile(path, JSON.stringify(data, null, 2))));