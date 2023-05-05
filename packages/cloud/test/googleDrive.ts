import { createAuth, GoogleDriver } from "../src/googleDrive.js";
import { readFile, writeFile, readdir } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { exists } from "../../extends/src/fs.js";
const __dirname = fileURLToPath(new URL(".", import.meta.url));

const cbb = JSON.parse(await readFile(pathJoin(__dirname, String((await readdir(__dirname)).find(r => r.startsWith("client_secret")))), "utf8"));
const { client_id, client_secret } = cbb.installed||cbb.CBe;

const server = createServer();
server.listen(0, async () => {
  const port = (() => {const addr = server.address(); return Number(typeof addr === "string" ? addr : addr?.port);})();
  const oauth = await createAuth({
    redirectURL: "https://localhost:"+port,
    clientID: client_id,
    clientSecret: client_secret,
    token: await exists(pathJoin(__dirname, "token.json")) ? JSON.parse(await readFile(pathJoin(__dirname, "token.json"), "utf8")) : undefined,
    tokenCallback: async (token) => {
      await writeFile(pathJoin(__dirname, "token.json"), JSON.stringify(token, null, 2));
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
    writeFile(pathJoin(__dirname, "tree.json"), JSON.stringify(await gdrive.folderTree(), null, 2));
    // writeFile(pathJoin(__dirname, "list.json"), JSON.stringify(await gdrive.listFiles(), null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
});