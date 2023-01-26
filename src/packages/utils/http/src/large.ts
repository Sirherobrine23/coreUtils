import { createWriteStream } from "node:fs";
import { requestOptions, streamRequest } from "./main.js";

export default saveFile;
export async function saveFile(options?: requestOptions & { path?: string}) {
  if (!options.path) options.path = "";
  const data = await streamRequest(options);
  await new Promise<void>((done, reject) => data.pipe(createWriteStream(options.path)).on("error", reject).once("close", done));
  return {
    path: options.path,
    headers: data.headers
  };
}