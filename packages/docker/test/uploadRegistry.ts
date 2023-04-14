import { createReadStream } from "fs";
import { createRandomFile } from "@sirherobrine23/extends";
import { finished } from "stream/promises";
import { tmpdir } from "os";
import { rm } from "fs/promises";
import registry from "../src/index.js";
import path from "path";

const main = new registry.v2("localhost:5000/sirherobrine23/nodejs_example:latest");
console.log("Creating root");
const create = await main.createImage();

for (let i = 0; i < 1; i++) {
  console.log("Creating /random"+i);
  const root = create.createNewBlob("gzip");
  const randomInfo = await createRandomFile(path.join(tmpdir(), "tmpGhcrFile"), 1024*123);
  const random = root.entry({name: "/random"+i, size: randomInfo.size});
  createReadStream(path.join(tmpdir(), "tmpGhcrFile")).pipe(random);
  await finished(random);
  await rm(path.join(tmpdir(), "tmpGhcrFile"));
  root.finalize();
  await finished(root);
}

console.log("uploading");
console.log(await create.publish({
  os: "linux",
  architecture: "amd64"
}, "linux_amd64"))