import { createServer } from "node:http";
import { ReadStream } from "node:fs"
import { Readable } from "node:stream";
import { drive_v3, google } from "googleapis";

// Google Credential
export type googleCredential = {
  /**
   * This field is only present if the access_type parameter was set to offline in the authentication request. For details, see Refresh tokens.
   */
  refresh_token?: string | null;
  /**
   * The time in ms at which this token is thought to expire.
   */
  expiry_date?: number | null;
  /**
   * A token that can be sent to a Google API.
   */
  access_token?: string | null;
  /**
   * Identifies the type of token returned. At this time, this field always has the value Bearer.
   */
  token_type?: string | null;
  /**
   * A JWT that contains identity information about the user that is digitally signed by Google.
   */
  id_token?: string | null;
  /**
   * The scopes of access granted by the access_token expressed as a list of space-delimited, case-sensitive strings.
   */
  scope?: string;
};

export type googleFileList = {
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

// Options object
export type googleOptions = {
  clientID: string,
  clientSecret: string,
  token?: googleCredential,
  callback?: (err?: Error, data?: {authUrl?: string, token?: googleOptions["token"]}) => void,
};

/**
 * Create client to Google Driver
 * @returns
 */
export async function GoogleDriver(options: googleOptions) {
  const clientID = options.clientID;
  const clientSecret = options.clientSecret;
  const token = options.token;
  const authCallback = options.callback;

  // Oauth2
  let auth = new google.auth.OAuth2(clientID, clientSecret);
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
        auth = new google.auth.OAuth2(clientID, clientSecret, `http://localhost:${port}`);
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

  // Google Driver API
  const { files } = google.drive({version: "v3", auth});

  /**
   * Get files and folder list array from folder
   *
   * @param folderID - ID of the folder
   * @returns
   */
  async function listFiles(folderID?: string, recursiveBreak = false): Promise<googleFileList[]> {
    // const mainData: googleFileList[] = [];
    const data: (drive_v3.Schema$File & {childreen?: drive_v3.Schema$File[]})[] = [];
    let nextPageToken: string;
    while (true) {
      const gResult = await files.list({
        q: folderID ? `'${folderID}' in parents`:undefined,
        fields: 'nextPageToken, files(id, name, size, trashed, createdTime, modifiedTime, originalFilename, parents, mimeType)',
        spaces: "drive",
        pageToken: nextPageToken,
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
  async function getFileStream(fileID: string) {
    // not check to get file ID
    return (await files.get({alt: "media", fileId: fileID}, {responseType: "stream"})).data;
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