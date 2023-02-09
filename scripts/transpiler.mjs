#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesRoot = path.resolve(__dirname, "../packages");
const packages = [
  "ar",
  "utils",
  "extends",
  "http",
  "cloud",
  "debian",
  "docker",
  "core"
];

for (const packageInfo of packages) {
  try {
    execSync("npm run build --if-present", {
      cwd: path.join(packagesRoot, packageInfo),
      stdio: "inherit",
    });
  } catch (err) {
    process.exit(1);
  }
}