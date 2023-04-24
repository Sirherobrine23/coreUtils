import { drive, drive_v3 } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import stream from "node:stream";

/** Google Credential */
export type googleCredential = Parameters<OAuth2Client["setCredentials"]>[0];
export type googleFile = {
  id: string,
  name: string,
  size: number,
  isTrashedFile: boolean,
  type: "file"| "folder",
  parent?: string,
  Dates: {
    created: Date,
    modified: Date,
  }
};

export interface fileUpload extends stream.Writable {
  on(event: "close", listener: () => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: stream.Readable) => void): this;
  on(event: "unpipe", listener: (src: stream.Readable) => void): this;
  on(event: "gfile", listener: (fileInfo: googleFile) => void): this;
  on(event: string | symbol, listener: (...args: any[]) => void): this;

  once(event: "close", listener: () => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: stream.Readable) => void): this;
  once(event: "unpipe", listener: (src: stream.Readable) => void): this;
  once(event: "gfile", listener: (fileInfo: googleFile) => void): this;
  once(event: string | symbol, listener: (...args: any[]) => void): this;
}

// Options object
export type googleOptions = {
  clientID?: string,
  clientSecret?: string,
  token?: googleCredential,
  callback?: (err?: Error, data?: {authUrl?: string, token?: googleOptions["token"]}) => void,
  oauth?: Awaited<ReturnType<typeof createAuth>>
};

async function createAuth(options: googleOptions) {
  const clientID = options.clientID, clientSecret = options.clientSecret, token = options.token, authCallback = options.callback;
  if (!clientID) throw new Error("Required Google Client ID");
  else if (!clientSecret) throw new Error("Required Google Client Secret");

  // Oauth2
  let auth = new OAuth2Client(clientID, clientSecret);
  if (token) auth.setCredentials(token);
  else {
    await new Promise<void>((done, reject) => {
      const server = createServer(async (req, res) => {
        const search = (new URL(req.url, "http://localhost")).searchParams;
        const Searchs: {[key: string]: string} = {};
        search.forEach((value, key) => Searchs[key] = value);
        if (Searchs["code"]) {
          try {
            const authRes = await auth.getToken(Searchs["code"]);
            const authToken: googleCredential = authRes.tokens as any;
            auth.setCredentials(authToken);
            if (authCallback) await Promise.resolve(authCallback(undefined, {token: authToken}));
            server.close();
            done();
            res.writeHead(200, {"Content-Type": "application/json"}).write(JSON.stringify({
              Searchs,
              code: Searchs["code"],
              auth: authToken,
            }, null, 2));
          } catch (err) {
            if (authCallback) await Promise.resolve(authCallback(err));
            res.writeHead(400, {"Content-Type": "application/json"}).write(JSON.stringify({code: Searchs["code"], Searchs, err: String(err)}, null, 2));
          }
        } else res.writeHead(400, {"Content-Type": "application/json"}).write(JSON.stringify({Searchs}, null, 2));
        res.end();
        return;
      }).listen(0, async () => {
        const { port } = server.address() as any;
        auth = null;
        auth = new OAuth2Client(clientID, clientSecret, `http://localhost:${port}`);
        const url = auth.generateAuthUrl({
          access_type: "offline",
          scope: ["https://www.googleapis.com/auth/drive"],
        });
        if (authCallback) await Promise.resolve(authCallback(undefined, {authUrl: url}));
      }).on("error", reject);
    }).catch(async err => {
      if (authCallback) await Promise.resolve(authCallback(err));
      throw err;
    });
  }

  return auth;
}

/**
 * Create client to Google Driver
 * @returns
 */
export async function GoogleDriver(options: googleOptions) {
  const { oauth = await createAuth(options) } = options;
  // Google Driver API
  const { files } = drive({version: "v3", auth: oauth});

  /**
   * Get files and folder list array from folder
   *
   * @param folderID - ID of the folder
   * @returns
   */
  async function listFiles(folderID?: string, recursiveBreak = false): Promise<googleFile[]> {
    // const mainData: googleFile[] = [];
    const data: (drive_v3.Schema$File & {childreen?: drive_v3.Schema$File[]})[] = [];
    let nextPageToken: string;
    while (true) {
      const gResult = await files.list({
        ...(folderID ? {q: `'${folderID}' in parents`}:{}),
        ...(nextPageToken ? {pageToken: nextPageToken} : {}),
        fields: 'nextPageToken, files(id, name, size, trashed, createdTime, modifiedTime, originalFilename, parents, mimeType)',
        spaces: "drive",
        pageSize: 1000,
      });
      data.push(...gResult.data.files);
      if (recursiveBreak) break;
      if (!(nextPageToken = gResult.data.nextPageToken)) break;
    }

    return data.map(file => ({
      id: file.id,
      name: file.name ?? file.originalFilename,
      size: parseInt(file.size ?? "0"),
      isTrashedFile: file.trashed ?? false,
      type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
      parent: file.parents?.at(-1) || null,
      Dates: {
        created: new Date(file.createdTime),
        modified: new Date(file.modifiedTime),
      }
    }));
  }

  /**
   * Get file stream
   *
   * @param fileID - ID of the file
   * @returns
   */
  async function getFileStream(fileID: string): Promise<stream.Readable> {
    // not check to get file ID
    return (await files.get({alt: "media", fileId: fileID}, {responseType: "stream"})).data;
  }

  /**
   * Upload file to Google drive
   *
   * to get file info watch `gfile` event to get `googleFile` object
   *
   * @param fileName - File name
   * @param folderID - folder id if set to folder - optional
   */
  function uploadFile(fileName: string, folderID?: string): fileUpload {
    return new class fileUpload extends stream.PassThrough {
      constructor() {
        super({autoDestroy: true, emitClose: true});
        files.create({
          fields: "id, name, size, trashed, createdTime, modifiedTime, originalFilename, parents, mimeType",
          requestBody: {
            name: fileName,
            ...(folderID ? {parents: [folderID]} : {}),
          },
          media: {
            mimeType: "application/octet-stream",
            body: stream.Readable.from(this),
          },
        }).then(({data: info}) => {
          const data: googleFile = {
            id: info.id,
            name: info.originalFilename ?? info.name,
            size: Number(info.size ?? 0),
            isTrashedFile: info.trashed,
            type: info.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
            parent: info.parents.at(-1),
            Dates: {
              created: new Date(info.createdTime ?? 0),
              modified: new Date(info.modifiedTime ?? 0)
            }
          }
          this.emit("gfile", data);
        }, err => this.emit("error", err));
      }
    }
  }

  async function deleteFile(id: string): Promise<googleFile> {
    const info = await files.get({
      fileId: id,
      fields: "id, name, size, trashed, createdTime, modifiedTime, originalFilename, parents, mimeType",
    }).then(r => r.data);
    await files.delete({fileId: info.id});
    return {
      id: info.id,
      name: info.originalFilename ?? info.name,
      size: Number(info.size ?? 0),
      isTrashedFile: info.trashed,
      type: info.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
      parent: info.parents.at(-1),
      Dates: {
        created: new Date(info.createdTime ?? 0),
        modified: new Date(info.modifiedTime ?? 0)
      }
    };
  }

  return {
    listFiles,
    getFileStream,
    uploadFile,
    deleteFile,
  };
}