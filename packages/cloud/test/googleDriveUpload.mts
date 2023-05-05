import { createAuth, GoogleDriver } from "../src/googleDrive.js";
import { readFile, writeFile, readdir, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { decompressStream } from "../../descompress/src/index.js";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { finished } from "node:stream/promises";
import { exists } from "../../extends/src/fs.js";
import { format } from "node:util";
import path from "node:path";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

let filePath: string = process.argv.slice(2).at(0) ? String(process.argv.slice(2).at(0)) : "";
if (!filePath) {
  console.error("No file specified");
  process.exit(1);
}
filePath = path.resolve(process.cwd(), filePath);
if (!(await exists(filePath))) {
  console.log("File exists");
  process.exit(1);
}

const cbb = JSON.parse(await readFile(path.join(__dirname, String((await readdir(__dirname)).find(r => r.startsWith("client_secret")))), "utf8"));
const { client_id, client_secret } = cbb.installed||cbb.CBe;
const server = createServer();
server.listen(0, async () => {
  const port = (() => {const addr = server.address(); return Number(typeof addr === "string" ? addr : addr?.port);})();
  const oauth = await createAuth({
    redirectURL: "https://localhost:"+port,
    clientID: client_id,
    clientSecret: client_secret,
    token: await exists(path.join(__dirname, "token.json")) ? JSON.parse(await readFile(path.join(__dirname, "token.json"), "utf8")) : undefined,
    tokenCallback: async (token) => {
      await writeFile(path.join(__dirname, "token.json"), JSON.stringify(token, null, 2));
      console.log(token);
    },
    authUrlCallback(authUrl, callback) {
      console.log("Open %O", authUrl);
      server.once("request", function call(req, res) {
        const { searchParams } = new URL(String(req.url), "http://localhost:"+port);
        if (!searchParams.has("code")) {
          res.statusCode = 400;
          res.end("No code");
          server.once("request", call);
          return;
        }
        res.statusCode = 200;
        res.end(searchParams.get("code"));
        callback(searchParams.get("code"))
      });
    },
  });

  server.close();
  try {
    const gdrive = await GoogleDriver({oauth});
    function bb(size: number) {
      let i = 0;
      while (size > 1024) {size /= 1024; i++;}
      return format("%s %s", size.toFixed(2), ["B", "KB", "MB", "GB", "TB"][i]);
    }
    let size = 0;
    process.stdout.write("\n");
    await finished(createReadStream(filePath).pipe(decompressStream({xz: {threads: 8}})).on("data", c => {
      size += Buffer.byteLength(c);
      process.stdout.moveCursor(0, -1);
      console.log("Uploading %s", bb(size));
    }).pipe(gdrive.uploadFile(path.basename(filePath.slice(0, filePath.length - path.extname(filePath).length)))));
    if (process.argv.includes("--rm")) await rm(filePath);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});