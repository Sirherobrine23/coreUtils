import { fileURLToPath } from "url";
import { decompress } from "../src/index.js";
import path from "path";
import fs from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

fs.createReadStream(path.join(__dirname, "hello.gz")).pipe(decompress()).on("data", data => console.log(data.toString()));
fs.createReadStream(path.join(__dirname, "hello.xz")).pipe(decompress()).on("data", data => console.log(data.toString()));