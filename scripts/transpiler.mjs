#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, "../packages");
const exists = async (filePath) => fs.access(filePath).then(() => true).catch(() => false);
let packages = [];
for (const filePath of (await fs.readdir(packagesRoot)).map(packageName => path.join(packagesRoot, packageName, "package.json"))) {
  if (!await exists(filePath)) continue;
  packages.push({
    data: JSON.parse(await fs.readFile(filePath, "utf8")),
    filePath
  });
}
packages = packages.map(data => {
  if (data.data.workspaces) data.data.workspaces = data.data.workspaces.map(workspace => path.resolve(data.filePath, workspace));
  return data;
}).sort((a, b) => {
  if (a.data.workspaces) {
    if (b.data.workspaces) return 0;
    return -1;
  } else if (b.data.workspaces) return 1;
  return 0;
}).reverse();

for (const packageInfo of packages) {
  console.log("Transpiling %s, version: %s", packageInfo.data.name, packageInfo.data.version);
  try {
    execSync("npm run build --if-present", {
      cwd: path.dirname(packageInfo.filePath),
      stdio: "inherit",
    });
  } catch (err) {
    console.log(`Failed to build ${packageInfo.data.name}`);
    process.stderr.write(err.stderr);
    process.stdout.write(err.stdout);
  }
}