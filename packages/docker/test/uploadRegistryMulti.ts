import { createReadStream } from "fs";
import { createRandomFile } from "@sirherobrine23/extends";
import { finished } from "stream/promises";
import { tmpdir } from "os";
import { rm } from "fs/promises";
import registry, { dockerPlatform } from "../src/index.js";
import path from "path";

const main = new registry.v2("localhost:5000/nodejs_example:latest");
const multi = main.createMultiArch();

const targets: dockerPlatform[] = [
  {
    os: "linux",
    architecture: "amd64"
  },
  {
    os: "linux",
    architecture: "arm64"
  },
  {
    os: "android",
    architecture: "arm64"
  },
  {
    os: "windows",
    architecture: "amd64"
  },
  {
    os: "windows",
    architecture: "arm64"
  },
];

for (const platform of targets) {
  const amd64 = await multi.newPlatform(platform);
  console.log("Creating /random in %s to %s", platform.os, platform.architecture);
  const root = amd64.createBlob("gzip");
  const randomInfo = await createRandomFile(path.join(tmpdir(), "tmpGhcrFile"), 1024*123);
  const random = root.addEntry({name: "/random", size: randomInfo.size});
  createReadStream(path.join(tmpdir(), "tmpGhcrFile")).pipe(random);
  await finished(random);
  await rm(path.join(tmpdir(), "tmpGhcrFile"));
  await root.finalize();
  await amd64.done();
}

try {
  console.dir(await multi.publish("multi"), {
    colors: true,
    depth: null
  });
} catch (err) {
  console.dir(err, {
    colors: true,
    depth: null,
  })
}