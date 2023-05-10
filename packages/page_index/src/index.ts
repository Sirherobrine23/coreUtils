import { fileURLToPath } from "node:url";
import { extendsFS } from "@sirherobrine23/extends";
import { JSDOM } from "jsdom";
import { http } from "@sirherobrine23/http";
import fs from "node:fs/promises";
import path from "node:path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type iconSchema = {
  [ext: string]: {
    /**
     * Alternatives ext files
     */
    alt?: string[];
    /**
     * HTTP file
     */
    url?: string;
    /**
     * Relative or full file path
     */
    file?: string;
    /**
     * Encoded in base64, example: `data:image/png;base64, AAAA`
     */
    base64?: string;
    /**
     * File format
     */
    type: "png"|"svg";
  }
};

export type pageOptions = {
  rootPage?: string;
  css?: string;
  icons?: iconSchema;
}

/** Default page template */
export const defaultPage = await fs.readFile(path.join(__dirname, "../default/index.template.html"), "utf8");
export const defaultCss = await fs.readFile(path.join(__dirname, "../default/index.template.css"), "utf8");
export const defaultIcons: iconSchema = JSON.parse(await fs.readFile(path.join(__dirname, "../default/icons.json"), "utf8"));
for (const i in defaultIcons) {
  if (defaultIcons[i].file) defaultIcons[i].file = path.resolve(__dirname, "../default", defaultIcons[i].file);
  else if (defaultIcons[i].url) {
    const img = (await http.bufferRequestBody(defaultIcons[i].url)).toString("base64");
    delete defaultIcons[i].url;
    defaultIcons[i].base64 = "data:image/png;base64, "+img;
  }
}

export default createIndex;
export async function createIndex(folderPath: string, options?: pageOptions) {
  options ||= {};
  const folders = await extendsFS.readdirV2(folderPath, (_1, _2, stats) => stats.isDirectory());
  async function index(folder: string, relative: string) {
    const icons = options?.icons || defaultIcons;
    const page = new JSDOM(defaultPage);
    const { window: { document } } = page;
    if (document.querySelector("style")) document.querySelector("style").textContent = options?.css||defaultCss;
    if (document.querySelector("title")) document.querySelector("title").textContent = "Index of "+relative;
    if (document.querySelector("dir_title")) document.querySelector("dir_title").textContent = "Index of "+relative;

    const files = await fs.readdir(folder);
    const tbody = document.getElementById("table_index").querySelector("tbody");

    for (const file of (relative === "/" ? [] : [".."]).concat(...files)) {
      if ((file.startsWith(".") && !(file === ".."))||file === "index.html" || file === "index.htm") continue;
      const stats = await fs.lstat(path.join(folder, file));

      const ref = document.createElement("a");
      ref.href = file;
      if (await extendsFS.isDirectory(path.resolve(folder, file))) ref.href = path.posix.join(file, "index.html");
      let selectedIcon: iconSchema[string];
      if ((selectedIcon = (icons[path.extname(file)]||icons[file]||icons["*"]))) {
        if (selectedIcon.type === "png") {
          const img = document.createElement("img");
          if (selectedIcon.url) img.src = selectedIcon.url;
          else if (selectedIcon.file) img.src = "data:image/png;base64, " + (await fs.readFile(selectedIcon.file, "base64"));
          else img.src = selectedIcon.base64;
          if (img.src) ref.appendChild(img);
        } else if (selectedIcon.type === "svg") {
          ref.innerHTML = await fs.readFile(selectedIcon.file, "utf8");
        } else ref.innerHTML = "";
      } else ref.innerHTML = "";
      ref.innerHTML += file;

      // Date
      const date = document.createElement("td")
      date.innerHTML = stats.mtime.toUTCString();

      // Size
      const size = document.createElement("td");
      if (stats.isDirectory()) {size.innerHTML = "Folder"; ref.innerHTML += "/";} else {
        let sizeT = stats.size, i = 0;
        while (sizeT > 1024) {sizeT /= 1024; i++;}
        size.innerHTML = sizeT.toFixed(2) + " " + ((["b", "kb", "mb", "gb", "tb", "yb"]).at(i)||"Unknown size unit.");
      }

      const fileNameTD = document.createElement("td");
      fileNameTD.appendChild(document.createElement("p").appendChild(ref));
      const tr = document.createElement("tr");
      tr.appendChild(fileNameTD).appendChild(date).appendChild(size);
      tbody.appendChild(tr);
    }

    // Write page file
    console.log("Writing %O", path.join(folder, "index.html"));
    return fs.writeFile(path.join(folder, "index.html"), page.serialize());
  }
  for (const fold of folders) await index(fold, path.relative(folderPath, fold).split("\\").join("/")||"/");
}