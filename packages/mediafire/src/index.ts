import { launch } from "puppeteer";
import { JSDOM } from "jsdom";
import httpRequest from "@sirherobrine23/http";
import path from "path";

export async function getFileDownload(fileUrl: string|URL): Promise<{url: string, fileName: string}>;
export async function getFileDownload(fileUrl: string|URL, streamFile?: false): Promise<{url: string, fileName: string}>;
export async function getFileDownload(fileUrl: string|URL, streamFile: true): ReturnType<typeof httpRequest.streamRequest>;
export async function getFileDownload(fileUrl: string|URL, streamFile = false) {
  if (typeof fileUrl === "string") fileUrl = new URL(fileUrl);
  const { document } = await httpRequest.getURLs(fileUrl);
  if (!(document.querySelector("#downloadButton")["href"])) throw new Error("Cannot get file url");
  const downloadHref = new URL(document.querySelector("#downloadButton")["href"]);
  let fileName = document.querySelector("body > main > div.content > div.center > div > div.dl-btn-cont > div.dl-btn-labelWrap > div.promoDownloadName.notranslate > div")?.["title"]?.trim();
  if (!fileName) fileName = path.basename(decodeURIComponent(downloadHref.pathname));
  if (streamFile) return httpRequest.streamRequest(downloadHref);
  return {
    url: downloadHref.toString(),
    fileName
  };
}

export async function listFolder(folderURL: string|URL) {
  if (folderURL instanceof URL) folderURL = folderURL.toString();
  // Launches Puppeteer browser for Windows and MacOS
  const browser = await Promise.resolve().then(() => import("chromium").then(({path}) => launch({ executablePath: path, args: ["--disable-gpu"] })))
  .catch(() => launch({ args: ["--disable-gpu"]}))
  // Launches the Puppeteer browser for Linux systems based on ARM processors
  .catch(() => launch({ executablePath: "/usr/bin/chromium-browser", args: ["--disable-gpu"] }))
  // Launches the Puppeteer browser using a user-specified path
  .catch(() =>launch({ executablePath: process.env.chromiumexec, args: ["--disable-gpu"]}))
  const page = await browser.newPage();
  if (!/^(http|https):\/\/(?:www\.)?(mediafire)\.com\/[0-9a-z]+(\/.*)/gm.test(folderURL)) folderURL = `https://www.mediafire.com/folder/${folderURL}`;
  await page.goto(folderURL);

  // Wait load files
  await page.waitForSelector("#main_list > li", {timeout: 1000*60*2});

  // Get Html
  const HTML: string = await page.evaluate(() => document.querySelector("#main_list").outerHTML);
  await browser.close();

  const { document } = (new JSDOM(HTML).window);
  return Promise.all(([...document.querySelectorAll("#main_list > li")]).map(li => getFileDownload((li.querySelector("a.thumbnailClickArea"))?.["href"]).catch(err => ({Error: String(err).replace("Error: ", "")}))));
}

console.log(await listFolder("https://www.mediafire.com/folder/09ry97x4889ez/bounen-no-xamdou"));