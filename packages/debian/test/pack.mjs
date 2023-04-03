import path from "path";
import dpkg from "../src/index.js";
import { fileURLToPath } from "url";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const deb = dpkg.createPackage({
  dataFolder: path.join(__dirname, "debian_pack"),
  control: {
    Package: "test",
    Architecture: "all",
    Version: "1.1.1"
  },
  compress: {
    control: "gzip",
    data: "gzip",
  }
});
await pipeline(deb, createWriteStream(path.join(__dirname, "example.deb")));