import { oracleBucketPreAuth, watch } from "../src/oracleBucket.js";
import { randomBytesStream } from "@sirherobrine23/extends/src/crypto.js";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import { finished } from "node:stream/promises";
import path from "node:path";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const { region, namespace, name, preauth } = JSON.parse(await readFile(path.join(__dirname, String((await readdir(__dirname)).find(r => r.startsWith("oci_secret")))), "utf8"));
const preOCI = oracleBucketPreAuth(region, namespace, name, preauth);

const files = await preOCI.listFiles();
console.log(files);

const size = Math.round(randomInt(1024, 1024 * 256));
let size2 = size;

console.log("Creating random file of size", size, "bytes");
await finished((new randomBytesStream(size)).pipe(preOCI.uploadFile(path.join("test"+files.length+".txt")).on("progress", (_, size) => console.log("Progress: ", size, size2 -= size)))).catch(err => {
  console.error(err);
  process.exit(1);
});
// console.log("Upload complete\nInit delete");
// await preOCI.deleteObject(path.join("test"+files.length+".txt"));

console.log("Init watch");
const re = await watch(__dirname, {
  skipSyncFiles: false,
  remoteFolder: "test",
  listFiles: preOCI.listFiles,
  uploadFile: preOCI.uploadFile,
});

re.once("change", () => re.once("unlink", () => re.close()));