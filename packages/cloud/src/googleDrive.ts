import { drive, drive_v3 } from "@googleapis/drive";
import { OAuth2Client } from "google-auth-library";
import path from "node:path";
import stream from "node:stream";

/** Google Credential */
export type googleCredential = Parameters<OAuth2Client["setCredentials"]>[0];
export type googleFile = {
  id: string,
  name: string,
  size: number,
  isTrashedFile: boolean,
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

export interface googleAuth {
  clientID: string;
  clientSecret: string;
  redirectURL: string;
  token?: googleCredential;
  authUrlCallback(authUrl: string, callback: (code) => void): void|Promise<void>;
  tokenCallback(token: googleCredential): void|Promise<void>;
}

export async function createAuth(config: googleAuth) {
  const { clientID, clientSecret, token, redirectURL, authUrlCallback, tokenCallback } = config;
  if (!clientID) throw new Error("Required Google Client ID");
  else if (!clientSecret) throw new Error("Required Google Client Secret");

  // Oauth2
  let auth = new OAuth2Client(clientID, clientSecret);
  if (token?.access_token || token?.refresh_token) auth.setCredentials(token);
  else {
    auth = new OAuth2Client(clientID, clientSecret, redirectURL);
    const url = auth.generateAuthUrl({access_type: "offline", scope: ["https://www.googleapis.com/auth/drive"]});
    await new Promise<void>((resolve, reject) => {
      return Promise.resolve().then(async () => authUrlCallback(url, (code) => {
        auth.getToken(code).then(async ({tokens}) => {
          auth.setCredentials(tokens);
          return Promise.resolve().then(() => tokenCallback(tokens));
        }).then(resolve, reject);
      })).then(() => {}, reject);
    });
  }

  return auth;
}

export type treeTmp = {
  id: string;
  name: string;
  info: drive_v3.Schema$File;
  parents: treeTmp[]
};

export interface googleOptions {
  oauth?: OAuth2Client;
  authConfig?: googleAuth;
};

/**
 * Create client to Google Driver
 * @returns
 */
export async function GoogleDriver(config: googleOptions) {
  if (!config) throw new Error("Require config to sign up Google Driver");
  const { oauth = await createAuth(config.authConfig) } = config;
  const { files } = drive({version: "v3", auth: oauth});

  /**
   *
   * @returns Array with folder tree
   */
  async function folderTree() {
    const folderList: drive_v3.Schema$FileList["files"] = [];
    let nextPageToken: string;
    while (true) {
      const { data } = await files.list({
        q: "mimeType='application/vnd.google-apps.folder'",
        spaces: "drive",
        fields: "*, nextPageToken",
        pageSize: 1000,
        pageToken: nextPageToken,
      });
      folderList.push(...(data.files.filter(file => file.ownedByMe)));
      if (!(nextPageToken = data.nextPageToken)) break;
    }
    console.dir(folderList, {color: true, depth: null});
    async function cc(id?: string, info?: drive_v3.Schema$File): Promise<treeTmp> {
      const ff = folderList.filter(file => (file.parents||[]).at(0) === id);
      return {
        id,
        name: info?.name,
        info,
        parents: await Promise.all(ff.map(f => cc(f.id, f))),
      }
    }
    const root = (await cc()).parents;

    async function dd(tree: treeTmp, array: string[]): Promise<string[]> {
      array.push(tree.id);
      return Promise.all(tree.parents.map(p => dd(p, array))).then(() => array);
    }

    return {
      array: await Promise.all(root.map(p => dd(p, []))).then(a => a.sort((b, a) => a.length - b.length)),
      tree: root
    };
  }

  /**
   * Get files and folder list array from folder
   *
   * @param folderID - ID of the folder
   * @returns
   */
  async function listFiles(folderID?: string): Promise<googleFile[]> {
    let f: string[][];
    const filesArray = (await folderTree()).array;
    if (folderID) {
      const fist = filesArray.find(rel => rel.find(r => r === folderID));
      if (!fist) throw new Error("Folder not found");
      f = filesArray.filter(r => r.slice(fist.length-1).at(0) === folderID).map(r => r.slice(fist.length-1));
    } else f = filesArray;

    let googleFile: googleFile[] = [];
    const storage: {[key: string]: drive_v3.Schema$File} = {};
    await Promise.all(f.map(async ids => {
      let internalFiles: googleFile[] = [];
      for (let id of ids.reverse()) {
        let nextPageToken: string = null;
        while (nextPageToken !== undefined) {
          const { data } = await files.list({
            q: `'${id}' in parents`,
            pageToken: nextPageToken ? nextPageToken : undefined,
            fields: 'nextPageToken, files(id, name, size, trashed, createdTime, modifiedTime, parents, mimeType)',
            spaces: "drive",
            pageSize: 1000,
          });
          internalFiles.push(...(data.files.filter(file => file.mimeType !== "application/vnd.google-apps.folder").map(file => ({
            name: file.name,
            size: Number(file.size ?? 0),
            id: file.id,
            ...(file.parents.at(0) ? {parent: file.parents.at(0)} : {}),
            isTrashedFile: file.trashed,
            Dates: {
              created: new Date(file.createdTime ?? 0),
              modified: new Date(file.modifiedTime ?? 0)
            }
          }))));
          if (!(nextPageToken = data.nextPageToken)) nextPageToken = undefined;
        }
        const folderInfo = storage[id] || (storage[id] = await files.get({fileId: id}).then(e => e.data));
        internalFiles = internalFiles.map(e => {e.name = path.posix.join(folderInfo.name, e.name); return e;});
      }
      googleFile.push(...internalFiles);
    }));

    return googleFile.sort((a, b) => a.name.split(path.posix.sep).length - b.name.split(path.posix.sep).length);
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
      parent: info.parents.at(-1),
      Dates: {
        created: new Date(info.createdTime ?? 0),
        modified: new Date(info.modifiedTime ?? 0)
      }
    };
  }

  return {
    listFiles,
    folderTree,
    getFileStream,
    uploadFile,
    deleteFile,
  };
}