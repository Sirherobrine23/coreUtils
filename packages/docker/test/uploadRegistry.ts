import { createRandomFile } from "@sirherobrine23/extends";
import { finished } from "stream/promises";
import registry from "../src/index.js";
import { tmpdir } from "os";
import path from "path";
import { createReadStream } from "fs";
import { rm } from "fs/promises";
import { github_secret } from "@sirherobrine23/http/src/github.js";
const main = new registry.v2("ghcr.io/sirherobrine23/nodejs_example:latest", {
  username: "sirherobrine23",
  password: github_secret as string
});
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
try {
  console.log(await create.upload("latest"))
} catch (err) {
  console.dir(err, {
    colors: true,
    depth: null,
  });
} finally {
  await create.deleteTmp();
}