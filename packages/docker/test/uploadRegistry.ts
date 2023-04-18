import { createReadStream } from "fs";
import { createRandomFile } from "@sirherobrine23/extends";
import { finished } from "stream/promises";
import { tmpdir } from "os";
import { rm } from "fs/promises";
import registry from "../src/index.js";
import path from "path";

try {
  const main = new registry.v2("localhost:5000/nodejs_example:latest");
  console.log("Creating root");
  const create = await main.createImage({
    os: "linux",
    architecture: "amd64"
  });

  for (let i = 0; i < 1; i++) {
    console.log("Creating /random"+i);
    const root = create.createBlob("gzip");
    const randomInfo = await createRandomFile(path.join(tmpdir(), "tmpGhcrFile"), 1024*123);
    const entry = root.addEntry({name: "/random"+i, size: randomInfo.size});
    createReadStream(path.join(tmpdir(), "tmpGhcrFile")).pipe(entry)
    await finished(entry);
    await rm(path.join(tmpdir(), "tmpGhcrFile"));
    await root.finalize();
  }

  console.log("uploading");
  console.dir(await create.finalize("linux_amd64"), {
    colors: true,
    depth: null,
  });
} catch (err) {
  console.dir(err, {
    colors: true,
    depth: null
  });
}