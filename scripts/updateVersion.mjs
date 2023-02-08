#!/usr/bin/env ts-node
import { appendFile, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import semver from "semver";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../packages");

let version = process.argv.slice(2)[0];
if (version?.startsWith("refs/tags/")) version = version.slice(10);
version = semver.valid(semver.coerce(version));
if (!version) {
  console.log("No version provided");
  process.exit(1);
}

for (const pkg of await readdir(root)) {
  const packageJSON = JSON.parse((await readFile(path.resolve(root, pkg, "package.json"))).toString());
  console.log(`Updating ${packageJSON.name}/${packageJSON.version} to ${version}`);
  packageJSON.version = version;
  await writeFile(path.resolve(root, pkg, "package.json"), JSON.stringify(packageJSON, null, 2));
}

const envFile = (process.argv.find((arg) => arg.startsWith("--env_file="))?.replace("--env_file=", "") || "").trim();
if (envFile) {
  appendFile(envFile, `\nVERSION=${version}`);
}