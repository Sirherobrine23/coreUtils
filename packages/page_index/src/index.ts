import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import fs from "node:fs/promises";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDirectory = async (path: string) => (await fs.lstat(path)).isDirectory();
const defaultFooter = await fs.readFile(path.resolve(__dirname, "../files_default/footer.template.html"), "utf8");
const defaultIndex = await fs.readFile(path.resolve(__dirname, "../files_default/index.template.html"), "utf8");
const defaultIcons = JSON.parse(await fs.readFile(path.resolve(__dirname, "../files_default/icons.json"), "utf8"));

export type indexOpts = {
  folder: string,
  subPath?: string,
  footer?: string,
  index?: string,
  icons?: {
    [fileExt: string]: string
  }
};

function prettySize(fileSize: number) {
  const unit = ["Bytes", "kBytes", "mBytes", "gBytes", "tBytes"];
  let unitNumber = 0;
  while(fileSize > 1000) {
    fileSize /= 1000;
    unitNumber++;
  }
  return `${Math.floor(fileSize)} ${unit[unitNumber]}`;
}

async function getImg(fileName: string, optionsIco: indexOpts["icons"]) {
  const ico = optionsIco[path.extname(fileName)];
  if (!ico) return `<?xml version="1.0" encoding="utf-8"?><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 97.88 122.88" style="enable-background:new 0 0 97.88 122.88" xml:space="preserve"><g><path d="M66.69,0.69C66.23,0.28,65.58,0,64.94,0c-0.14,0-0.28,0-0.41,0.05H5.81c-1.57,0-3.04,0.64-4.1,1.7C0.65,2.81,0,4.24,0,5.85 v111.22c0,1.61,0.65,3.04,1.71,4.1c1.06,1.06,2.49,1.7,4.1,1.7c29.59,0,56.74,0,86.18,0c1.61,0,3.04-0.65,4.1-1.7 c1.06-1.06,1.7-2.49,1.7-4.1V33.86c0.05-0.23,0.09-0.41,0.09-0.64c0-0.78-0.37-1.47-0.87-1.98l-30-30.36 c-0.09-0.09-0.14-0.14-0.23-0.18H66.69L66.69,0.69z M55.24,86.2H40.26v-1.5c0-2.55,0.3-4.62,0.87-6.21 c0.58-1.6,1.42-3.05,2.57-4.37c1.14-1.32,3.71-3.63,7.7-6.95c2.12-1.73,3.18-3.33,3.18-4.77c0-1.45-0.43-2.58-1.29-3.37 c-0.85-0.81-2.15-1.21-3.88-1.21c-1.88,0-3.43,0.62-4.65,1.85c-1.22,1.22-2,3.39-2.35,6.45l-15.24-1.89 c0.52-5.6,2.57-10.12,6.13-13.53c3.56-3.43,9.02-5.13,16.36-5.13c5.72,0,10.34,1.2,13.87,3.59c4.78,3.22,7.17,7.54,7.17,12.93 c0,2.23-0.62,4.38-1.85,6.46c-1.22,2.07-3.75,4.61-7.55,7.6c-2.65,2.1-4.33,3.79-5.01,5.07C55.59,82.5,55.24,84.15,55.24,86.2 L55.24,86.2z M39.75,90.15h16.04v11.65H39.75V90.15L39.75,90.15z M60.67,7.64v20.92c0,2.17,0.88,4.74,2.3,6.17 c1.43,1.43,4.45,2.6,6.62,2.6h20.66v77.35c0,0.14-0.2,0.32-0.33,0.41c-0.09,0.09-0.08,0.18-0.27,0.18c-23.42,0-58.73,0-81.51,0 c-0.14,0-0.32-0.05-0.42-0.18c-0.09-0.09-0.18-0.28-0.18-0.41V8.24c0-0.18,0.05-0.32,0.18-0.42c0.09-0.09,0.23-0.18,0.42-0.18 H60.67L60.67,7.64L60.67,7.64z M67.52,27.97V8.94l21.43,21.7H70.19c-0.74,0-1.38-0.32-1.89-0.78C67.84,29.4,67.52,28.7,67.52,27.97 L67.52,27.97z"/></g></svg>`;
  return ico;
}

export default async function main(options: indexOpts) {
  options.subPath ??= "/";
  options.footer ??= defaultFooter;
  options.index ??= defaultIndex;
  options.icons = {...defaultIcons, ...options.icons};
  const folderInfo = async (folderPath: string) => Promise.all((await fs.readdir(folderPath)).map(async fpath => {
    const stat = await fs.lstat(path.resolve(folderPath, fpath));
    return {
      file: fpath,
      type: ((await isDirectory(path.resolve(folderPath, fpath))) ? "dir" : "file") as "dir"|"file",
      size: stat.size,
      createDate: stat.ctime,
      modificateDate: stat.atime
    };
  })).then(a => a.filter(b => !b.file.startsWith("index.")).sort(b => b.type === "dir" ? -1 : 1));
  const writeIndex = async (folder: string, subpath = options.subPath) => folderInfo(folder).then(async files => {
    console.log("Indexing %O, Local folder %O", subpath, folder);
    const docIndex = new JSDOM(options.index);
    const { window: { document } } = docIndex;
    const addElement = async (file: string, mDate: Date, fileSize: number) => {
      // File List
      const fileNameImage = document.createElement("img");
      fileNameImage.src = `data:image/png;base64, ${"a"}`;

      const ref = document.createElement("a");
      ref.href = file;
      if (await isDirectory(path.resolve(folder, file))) ref.href = path.posix.join(file, "index.html");
      ref.innerHTML = await getImg(path.resolve(folder, file), options.icons);
      ref.innerHTML += file;

      // Date
      const date = document.createElement("td")
      date.innerHTML = mDate.toUTCString();

      // Size
      const size = document.createElement("td");
      if (fileSize > 0) size.innerHTML = prettySize(fileSize);
      else {
        size.innerHTML = "Folder";
        ref.innerHTML += "/";
      }

      // Add to list
      const fileNameTD = document.createElement("td");
      fileNameTD.appendChild(document.createElement("p").appendChild(ref));
      const tr = document.createElement("tr");
      tr.appendChild(fileNameTD).appendChild(date).appendChild(size);
      document.querySelector("body > table > tbody").appendChild(tr);
    };

    if (options.subPath !== subpath) {
      if (path.posix.relative(subpath, options.subPath) !== "..") await addElement(path.posix.relative(subpath, options.subPath), new Date(), 0);
      await addElement("..", new Date(), 0);
    }
    for await (const fpath of files) {
      if (fpath.type === "dir") await writeIndex(path.resolve(folder, fpath.file), path.posix.join(subpath, fpath.file));
      await addElement(fpath.file, fpath.modificateDate, fpath.size);
    }

    const tar = [document.querySelector("title"), document.querySelector("#dir_title")];
    for (const i of tar.filter(a => !!a)) i.innerHTML = `Index of ${subpath}`;
    if (options.footer && !!document.querySelector("#footer_data")) document.querySelector("#footer_data").innerHTML = options.footer;
    return fs.writeFile(path.resolve(folder, "index.html"), docIndex.serialize());
  });
  await writeIndex(options.folder);
}