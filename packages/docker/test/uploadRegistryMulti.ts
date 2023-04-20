import { randomBytesStream } from "@sirherobrine23/extends";
import { randomInt } from "crypto";
import { finished } from "stream/promises";
import { Readable } from "stream";
import registry from "../src/index.js";

const targets: ConstructorParameters<typeof registry.v2>[] = [
  ["localhost:5000/sirherobrine23/dummy:latest"],
  ["localhost:5000/sirherobrine23/dummy2:latest"],
];

for (const [img, auth] of targets) {
  try {
    const main = new registry.v2(img, auth);
    console.log("Creating layer");
    const create = main.createMultiArch();
    for (const arch of ["arm64", "amd64"]) {
      const platform = await create.newPlatform({os: "linux", architecture: arch as any,});
      const fileCount = randomInt(1, 8);
      console.log("Files to create: %f", fileCount);
      for (let i = 0; i < fileCount; i++) {
        const root = platform.createBlob("gzip");
        const size = Array(randomInt(1, 2)).fill(1024).reduce((acc, v) => acc*v, 1024);
        console.log("Creating /random%f, with size: %f", i, size);
        const entry = root.addEntry({name: "/random"+i, size});
        await finished((new randomBytesStream(size)).pipe(entry));
        console.log("Digest: %O", await root.finalize());
      }
      console.log(await platform.done())
    }

    console.log("uploading");
    console.dir(await create.publish("multi"), {
      colors: true,
      depth: null,
    });
    console.log("Eded upload.");
  } catch (err) {
    if (err?.body instanceof Readable) {
      err.body.pipe(process.stdout);
      await finished(err.body);
      err.body = null;
    }
    console.dir(err, {
      colors: true,
      depth: null
    });
    process.exit(1);
  }
}
