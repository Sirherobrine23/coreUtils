import { finished } from "stream/promises";
import { localFile } from "../src/index.js";
import { randomBytes, randomInt } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sucess: any[] = [], fail: any[] = [];
for (let testCount = 0; testCount < 100; testCount++) {
  const file = await localFile.createFile(path.resolve(__dirname, "example.ar"));
  const r = randomInt(3, 100);
  for (let i = 0; i < r; i++) {
    const random = randomBytes(randomInt(100, 2000));
    await finished((await file.entry("random"+i, {size: random.byteLength})).end(random));
  }

  try {execFileSync("ar", ["t", path.resolve(__dirname, "example.ar")], {stdio: "ignore"}); sucess.push(file.getEntrys())} catch {fail.push(file.getEntrys())};
}

console.log("Success: %O, Fail: %O", sucess, fail.length);