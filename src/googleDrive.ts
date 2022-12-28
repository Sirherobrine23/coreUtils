import { createServer } from "node:http";
import { google } from "googleapis";
import { Readable } from "node:stream";

export async function GoogleDriver(clientID: string, clientSecret: string, options?: {token?: string, authCallback?: (url?: string, token?: string) => Promise<void>}) {
  // Oauth2
  const auth = new google.auth.OAuth2(clientID, clientSecret);
  if (options?.token) auth.setCredentials({access_token: options.token});
  else {
    await new Promise<void>((done, reject) => {
      const server = createServer(async (req, res) => {
        const code = (new URL(req.url, `http://${req.headers.host ?? "localhost"}`)).searchParams.get("code");
        if (!!code) {
          const authRes = await auth.getToken(code);
          const token = authRes.tokens.access_token;
          if (options?.authCallback) await options.authCallback(undefined, token);
          server.close();
        }
      }).listen(0, () => {
        const url = auth.generateAuthUrl({
          access_type: "offline",
          scope: ["https://www.googleapis.com/auth/drive"],
          prompt: "consent",
        });
        if (options?.authCallback) options.authCallback(url, undefined);
        console.log(`Visit this URL: ${url}`);
      });
    });
  }

  // Google Driver API
  const { files } = google.drive({version: "v3", auth: auth});

  /**
   * Get files and folder list array from folder
   *
   * @param folderID - ID of the folder
   * @returns
   */
  async function listFiles(folderID?: string) {
    const res = await files.list({
      fields: 'files(id, name, size)',
      q: folderID ? `'${folderID}' in parents`:undefined,
    });
    return res.data.files.map(file => ({
      id: file.id,
      name: file.name ?? file.originalFilename,
      size: parseInt(file.size),
      isTrashedFile: file.trashed,
      cDate: file.createdTime ? new Date(file.createdTime) : null,
    }));
  }

  /**
   * Get file stream
   *
   * @param fileID_or_name - Name or ID of the file
   * @returns
   */
  async function getFileStream(fileID_or_name: string) {
    const file = (await listFiles()).find(({id, name}) => id === fileID_or_name || name === fileID_or_name);
    if (!file) throw new Error("File not found");
    return (await files.get({alt: "media", fileId: file.id}, {responseType: "stream"})).data;
  }

  async function uploadFile(fileName: string, fileStream: ReadableStream|Readable, folderID?: string) {
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