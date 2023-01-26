import { createServer } from "node:http";
import { ReadStream } from "node:fs"
import { Readable } from "node:stream";
import { google } from "googleapis";

export type googleOptions = {
  clientID: string,
  clientSecret: string,
  token?: string,
  authUrl?: (err?: Error, data?: {authUrl?: string, token?: string}) => void,
};

export default GoogleDriver;

/**
 * Create client to Google Driver
 * @returns
 */
export async function GoogleDriver(options: string|googleOptions, clientOldSecret?: string, optionsOld?: {token?: string, authCallback?: googleOptions["authUrl"]}) {
  let clientID: string;
  let clientSecret: string;
  let token = optionsOld?.token;
  let authCallback: googleOptions["authUrl"] = (...args) => console.log("Err: %s, Data: %o", ...args);
  if (typeof options !== "string") {
    clientID = options!.clientID;
    clientSecret = options!.clientSecret;
    if (options?.token) token = options.token;
    if (options?.authUrl) authCallback = options.authUrl;
  } else {
    clientID = options;
    clientSecret = clientOldSecret;
    if (optionsOld?.token) token = optionsOld.token;
    if (optionsOld?.authCallback) authCallback = optionsOld.authCallback;
  }

  // Oauth2
  let auth = new google.auth.OAuth2(clientID, clientSecret);
  if (token) auth.setCredentials({access_token: token});
  else {
    await new Promise<void>((done, reject) => {
      const server = createServer(async (req, res) => {
        const search = (new URL(req.url, "http://localhost")).searchParams;
        const Searchs: {[key: string]: string} = {};
        search.forEach((value, key) => Searchs[key] = value);
        if (Searchs["code"]) {
          try {
            const authRes = await auth.getToken(Searchs["code"]);
            const token = authRes.tokens.access_token;
            await Promise.resolve(authCallback(undefined, {token}));
            server.close();
            done();
            res.writeHead(200, {"Content-Type": "application/json"}).write(JSON.stringify({
              Searchs,
              code: Searchs["code"],
              auth: {
                ...authRes.tokens,
                expiry_date: new Date(authRes.tokens.expiry_date),
              },
            }, null, 2));
          } catch (err) {
            await Promise.resolve(authCallback(err));
            res.writeHead(400, {"Content-Type": "application/json"}).write(JSON.stringify({code: Searchs["code"], Searchs, err: String(err)}, null, 2));
          }
        } else res.writeHead(400, {"Content-Type": "application/json"}).write(JSON.stringify({Searchs}, null, 2));
        res.end();
        return;
      }).listen(0, async () => {
        const { port } = server.address() as any;
        auth = null;
        auth = new google.auth.OAuth2(clientID, clientSecret, `http://localhost:${port}`);
        const url = auth.generateAuthUrl({
          access_type: "offline",
          scope: ["https://www.googleapis.com/auth/drive"],
        });
        await Promise.resolve(authCallback(undefined, {authUrl: url}));
      }).on("error", reject);
    }).catch(async err => {
      await Promise.resolve(authCallback(err));
      throw err;
    });
  }

  // Google Driver API
  const { files } = google.drive({version: "v3", auth});

  /**
   * Get files and folder list array from folder
   *
   * @param folderID - ID of the folder
   * @returns
   */
  async function listFiles(folderID?: string) {
    const res = await files.list({
      fields: 'files(id, name, size, trashed, createdTime, modifiedTime, originalFilename)',
      q: folderID ? `'${folderID}' in parents`:undefined,
    });
    return res.data.files.map(file => ({
      id: file.id,
      name: String(file.name || file.originalFilename),
      size: Number(file.size),
      isTrashedFile: file.trashed,
      date: {
        create: file.createdTime ? new Date(file.createdTime) : null,
        modified: file.modifiedTime ? new Date(file.modifiedTime) : null,
      }
    }));
  }

  /**
   * Get file stream
   *
   * @param fileID_or_name - Name or ID of the file
   * @returns
   */
  async function getFileStream(fileID_or_name: string) {
    const fileData = (await listFiles()).find(data => ([data.id, data.name]).includes(fileID_or_name));
    if (!fileData) throw new Error("File not found");
    return (await files.get({alt: "media", fileId: fileData.id}, {responseType: "stream"})).data;
  }

  async function uploadFile(fileName: string, fileStream: ReadStream|Readable, folderID?: string) {
    const res = await files.create({
      fields: "id, name, size",
      requestBody: {
        name: fileName,
        ...(folderID ? {parents: [folderID]} : {}),
      },
      media: {
        mimeType: "application/octet-stream",
        body: fileStream,
      },
    });
    return {
      id: res.data.id,
      name: res.data.name ?? res.data.originalFilename,
      size: parseInt(res.data.size),
      isTrashedFile: res.data.trashed,
      cDate: res.data.createdTime ? new Date(res.data.createdTime) : null,
    };
  }

  async function deleteFile(folderID: string) {
    await files.delete({fileId: folderID});
  }

  return {
    listFiles,
    getFileStream,
    uploadFile,
    deleteFile,
  };
}