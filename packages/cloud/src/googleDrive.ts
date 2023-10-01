import { auth, drive, drive_v3 } from "@googleapis/drive";
import { extendStream } from "@sirherobrine23/extends";
import path from "path";

export type OAuth2Client = typeof auth["OAuth2"]["prototype"];
export type googleCredential = Parameters<typeof auth.OAuth2["prototype"]["setCredentials"]>[0];
export interface GoogleAuth {
  clientID: string;
  clientSecret: string;
  token?: googleCredential;
  authUrlCallback?(redirect: (redirectUrl: string, callback: (authUrl: string, callback: (err: any, code?: string) => void) => void) => void): void;
  tokenCallback?(token: googleCredential): void|Promise<void>;
}

export async function createAuth(config: GoogleAuth) {
  const {
    clientID,
    clientSecret,
    token,
    authUrlCallback,
    tokenCallback
  } = config;
  if (!clientID) throw new Error("Required Google Client ID");
  else if (!clientSecret) throw new Error("Required Google Client Secret");

  // Oauth2
  let oauth2 = new auth.OAuth2(clientID, clientSecret);
  if (token && token?.access_token || token?.refresh_token) oauth2.setCredentials(token);
  else {
    await new Promise<void>((resolve, reject) => {
      if (typeof authUrlCallback !== "function") return reject(new Error("Set valid authUrlCallback"));
      authUrlCallback((redirectUrl, callback) => {
        oauth2 = new auth.OAuth2(clientID, clientSecret, redirectUrl);
        const url = oauth2.generateAuthUrl({access_type: "offline", scope: ["https://www.googleapis.com/auth/drive"]});
        callback(url, (err, code) => {
          if (err) return reject(err);
          return oauth2.getToken(code).then(token => {
            tokenCallback(token.tokens);
            oauth2.setCredentials(token.tokens);
            return resolve();
          }, reject);
        });
      })
    });
  }

  return oauth2;
}

export interface GoogleOptions {
  oauth?: OAuth2Client;
  authConfig?: GoogleAuth;
};

export type FileTree = {
  name: string;
  id: string;
  ownedByMe: boolean;
  date: {
    create: Date;
    modify: Date;
  };
  oweners: {
    emailAddress: string;
    name: string;
  }[];
  tree?: FileTree[];
};

export type FilePosix = {
  name: string;
  path: string;
  id: string;
  ownedByMe: boolean;
  date: {
    create: Date;
    modify: Date;
  };
  oweners: {
    emailAddress: string;
    name: string;
  }[];
};

export async function GoogleDriver(config: GoogleOptions) {
  const { oauth = await createAuth(config.authConfig) } = config;
  const driverAPI = drive({version: "v3", auth: oauth });

  /**
   * Get file stream
   *
   * @param fileID - ID of the file
   * @returns
   */
  async function getFile(fileID: string): Promise<extendStream.nodeStream.Readable> {
    // not check to get file ID
    return (await driverAPI.files.get({alt: "media", fileId: fileID}, {responseType: "stream"})).data;
  }

  /**
   * Upload file to Google drive
   *
   * to get file info watch `fileInfo` event to get `googleFile` object
   *
   * @param fileName - File name
   * @param folderID - folder id if set to folder - optional
   */
  function uploadFile(fileName: string, folderID?: string) {
    return extendStream.WriteToRead<{ fileInfo(file: drive_v3.Schema$File): void }>((read, write) => {
      driverAPI.files.create({
        fields: "id, name, size, trashed, createdTime, modifiedTime, originalFilename, parents, mimeType",
        requestBody: {
          name: fileName,
          ...(folderID ? {parents: [folderID]} : {}),
        },
        media: {
          mimeType: "application/octet-stream",
          body: read,
        },
      }).then(({data}) => {
        write.emit("fileID", data);
      }, err => write.emit("error", err));
    });
  }

  /**
   * Delete file
   * @param fileID - File ID
   * @returns
   */
  async function deleteFile(fileID: string): Promise<FilePosix> {
    const info = await driverAPI.files.get({
      fileId: fileID,
      fields: "id, name, createdTime, modifiedTime, oweners, ownedByMe",
    }).then(r => r.data);
    await driverAPI.files.delete({fileId: info.id});
    return {
      id: info.id,
      name: info.name,
      path: null,
      ownedByMe: info.ownedByMe,
      date: {
        create: new Date(info.createdTime ?? 0),
        modify: new Date(info.modifiedTime ?? 0)
      },
      oweners: info.owners.map(({emailAddress, displayName}) => ({ emailAddress, name: displayName })),
    };
  }

  /**
   * Get root dir files and return posix style
   */
  function getDirs(): Promise<FilePosix[]>;
  /**
   * List files and return posix style
   * @param folderID - Folder ID
   */
  function getDirs(folderID: string): Promise<FilePosix[]>;
  /**
   * List files and return posix style
   * @param folderID - Folder ID
   */
  async function getDirs(folderID?: string): Promise<FilePosix[]> {
    let folders: drive_v3.Schema$File[] = [];
    let searchs: drive_v3.Schema$FileList;
    while (!searchs || searchs.nextPageToken) {
      searchs = (await driverAPI.files.list({
        fields: "nextPageToken, files(name, id, parents, createdTime, modifiedTime, owners, ownedByMe)",
        q: "mimeType = 'application/vnd.google-apps.folder'",
        ...(!folderID?{}: {
          q: ("").concat("mimeType = 'application/vnd.google-apps.folder' and '", folderID,"' in parents")
        }),
        supportsAllDrives: true,
        pageToken: searchs?.nextPageToken
      })).data;
      folders = folders.concat(searchs.files);
    }

    const folderTree = async (id: string): Promise<FileTree[]> => {
      const ff = folders.filter(s => (s.parents||[]).includes(id));
      folders = folders.filter(s => !((s.parents||[]).includes(id)));
      return Promise.all(ff.map(s => folderTree(s.id).then((d): FileTree => ({
        id: s.id,
        name: s.name,
        ownedByMe: s.ownedByMe,
        date: {
          create: new Date(s.createdTime),
          modify: new Date(s.modifiedTime)
        },
        oweners: (s.owners||[]).map(({ emailAddress, displayName }) => ({ emailAddress, name: displayName })),
        tree: d
      }))));
    }

    const fileTree = async (folderTree: FileTree): Promise<FileTree> => {
      if ((folderTree.tree||[]).length > 0) folderTree.tree = await Promise.all(folderTree.tree.map(async s => fileTree(s)));
      let searchs: drive_v3.Schema$FileList, folders: drive_v3.Schema$File[] = [];
      while (!searchs || searchs.nextPageToken) {
        searchs = (await driverAPI.files.list({ fields: "nextPageToken, files(*)", q: ("").concat("mimeType != 'application/vnd.google-apps.folder' and '", folderTree.id,"' in parents"), supportsAllDrives: true, pageToken: searchs?.nextPageToken })).data;
        folders = folders.concat(searchs.files);
      }
      folderTree.tree = folderTree.tree.concat(folders.map(({id, name, owners, createdTime, modifiedTime, fullFileExtension, fileExtension, ownedByMe}) => ({
        id,
        name: name.endsWith(fullFileExtension||fileExtension) ? name : name.concat(fullFileExtension||fileExtension),
        ownedByMe,
        date: {
          create: new Date(createdTime),
          modify: new Date(modifiedTime)
        },
        oweners: (owners||[]).map(({ emailAddress, displayName }) => ({ emailAddress, name: displayName }))
      })));
      return folderTree;
    }

    const toPosix = async (folder: FileTree): Promise<FilePosix[]> => {
      const a = await Promise.all((folder.tree||[]).map(async s => toPosix(s)));
      const { id, name, oweners, date, ownedByMe } = folder;
      return a.map(s => s.map(s => {
        const d = "/"+s.name;
        s.path = path.posix.resolve("/", folder.name, (s.path||d).slice(1));
        return s;
      })).flat(2).concat({
        id,
        name,
        path: path.posix.resolve("/", name),
        ownedByMe,
        date,
        oweners,
      });
    }

    return Promise.all(folders.filter(s => !!folderID || !s.parents).map(async (s): Promise<FileTree> => ({
      id: s.id,
      name: s.name,
      ownedByMe: s.ownedByMe,
      date: {
        create: new Date(s.createdTime),
        modify: new Date(s.modifiedTime)
      },
      oweners: (s.owners||[]).map(s => ({ emailAddress: s.emailAddress, name: s.displayName })),
      tree: await folderTree(s.id)
    }))).then(s => Promise.all(s.map(async s => toPosix(await fileTree(s))))).then(d => d.flat(2));
  }

  return {
    about: async () => { const { storageQuota: { limit, usage, usageInDrive, usageInDriveTrash } } = (await driverAPI.about.get({ fields: "storageQuota" })).data; return { limit: Number(limit), usage: Number(usage), usageInDrive: Number(usageInDrive), usageInDriveTrash: Number(usageInDriveTrash) }; },
    getDirs,
    getFile,
    uploadFile,
    deleteFile,
  };
}