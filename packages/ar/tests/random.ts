import { finished } from "stream/promises";
import { createArStream } from "../src/index.js";
import { randomBytes, randomInt } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createWriteStream } from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

let sucess: any[] = [], fail: any[] = [];
for (let testCount = 0; testCount < 100; testCount++) {
  const ar = createArStream();
  const wr = ar.pipe(createWriteStream(path.resolve(__dirname, "example.ar")));
  const r = randomInt(3, 100);
  for (let i = 0; i < r; i++) {
    const random = randomBytes(randomInt(100, 2000));
    await finished((ar.addEntry("random"+i, {size: random.byteLength})).end(random));
  }
  ar.finalize();
  await finished(wr);
  try {execFileSync("ar", ["t", path.resolve(__dirname, "example.ar")], {stdio: "ignore"}); sucess.push(ar.getFiles())} catch {fail.push(ar.getFiles())};
}

console.log("Success: %O, Fail: %O", sucess.length, fail.length);