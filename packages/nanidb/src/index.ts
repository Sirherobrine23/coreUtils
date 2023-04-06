import { extendsFS } from "@sirherobrine23/extends";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

async function createID() {
  return new Promise<string>((done, rej) => crypto.pseudoRandomBytes(8, (err, buf) => err ? rej(err) : done(buf.toString("hex"))));
}

export class Nani<T = any> {
  #setFolder: string;
  constructor(dbFolder: string) {
    this.#setFolder = dbFolder;
  }

  /**
   * Add new document file to db folder and return file ID
   *
   * @param doc - Doc JSON
   * @returns
   */
  async insert(doc: T) {
    const fileID = await createID();
    const fpath = path.join(this.#setFolder, fileID+".dtcc");
    const stringCotent = JSON.stringify(doc, (_, value) => {
      if (typeof value === "bigint") return {
        type: "bigint",
        data: value.toString(),
      }; else if (value === global) return {type: "globalThis"};
      return value;
    });
    await fs.writeFile(fpath, Buffer.from(stringCotent, "utf8").toString("base64"));
    return fileID;
  }

  /**
   * Add various Docs to local db
   * @param docs - JSON Doc array
   * @returns Docs IDs
   */
  async insertMany(docs: T[]) {
    return Promise.all((Array.from(docs)).map(async doc => this.insert(doc)));
  }

  /**
   * Return all docs, this function can cause stack overflow in Nodejs
   */
  async listAllDocs(): Promise<T[]> {
    const files = (await fs.readdir(this.#setFolder)).filter(path => path.endsWith(".dtcc"));
    const docs = [];
    for (const nameFile of files) {
      try {
        const cont = Buffer.from((await fs.readFile(path.join(this.#setFolder, nameFile), "utf8")), "base64").toString("utf8");
        docs.push(JSON.parse(cont, (_, value) => {
          if (typeof value === "object") {
            if (value?.type === "Buffer") return Buffer.from(value.data);
            else if (value?.type === "bigint") return BigInt(value.data);
            else if (value?.type === "globalThis") return global;
          }
          return value;
        }));
      } catch {}
    }

    return docs;
  }

  async getIDs() {
    return (await fs.readdir(this.#setFolder)).filter(path => path.endsWith(".dtcc")).map(path => path.slice(0, path.length - 5));
  }
}

export async function createDb<T>(dbFolder: string) {
  if (!(await extendsFS.exists(dbFolder))) await fs.mkdir(dbFolder, {recursive: true});
  else if (!(await extendsFS.isDirectory(dbFolder))) throw new Error("Cannot init db folder, dbPath is file not folder");
  return new Nani<T>(dbFolder);
}