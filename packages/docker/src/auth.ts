import { parseImage } from "./image.js";
import http from "@sirherobrine23/http";
import path from "node:path/posix";
export type userAuth = {username: string, password?: string, token?: string};
export type tokenAction = "pull"|"push";

function basicAuth(username: string, pass?: string) {
  return (Buffer.from(username+(pass ? ":"+pass : "")).toString("base64"));
}

export class Auth {
  #auth: userAuth;
  #image: parseImage;
  #action: tokenAction;

  token: string;
  access_token?: string;
  expires_in?: number;
  issued_at?: string;

  constructor(img: parseImage, tokenAction?: tokenAction, auth?: userAuth) {
    this.#image = img;
    this.#auth = auth;
    if (tokenAction === "push") this.#action = "push";
    else this.#action = "pull";
  }

  #closeAuth = false;
  async setup() {
    if (this.#closeAuth) return this;
    this.#closeAuth = true;
    const reqURL = new URL(`http://${this.#image.registry}`);
    reqURL.pathname = path.join("/v2", this.#image.owner, this.#image.repo, "tags/list");
    await http.jsonRequest(reqURL).then(d => console.log(d.headers)).catch(async (err: http.httpCoreError) => {
      if (err.httpCode === 401) {
        let auth: string = (err.headers["www-authenticate"] as any) ?? "";
        const scopes = auth.slice(auth.indexOf(" ")).trim().split(",").reduce((acc, data) => {const indexP = data.indexOf("="); if (indexP === -1) return acc; acc[data.slice(0, indexP)] = data.slice(indexP+1).replace(/"(.*)"/, "$1").trim(); return acc;}, {} as {[keyname: string]: string});
        this.#image.realm = scopes.realm;
        this.#image.service = scopes.service;
        const { owner, repo } = this.#image;
        const options: Omit<http.requestOptions, "url"> = {
          query: {
            service: scopes.service,
            scope: `repository:${owner}/${repo}:${this.#action}`,
          },
          headers: {}
        }

        if (this.#auth?.username) {
          if (this.#auth.password) options.headers.Authorization = `Basic ${basicAuth(this.#auth.username, this.#auth.password)}`;
          else if (this.#auth.token) options.headers.Authorization = `Basic ${basicAuth(this.#auth.username, this.#auth.token)}`;
        }

        const { body: { token, access_token, expires_in, issued_at } } = await http.jsonRequest(scopes.realm ?? `http://${this.#image.registry}/token`, options).catch((err: http.httpCoreError) => {
          let d: any;
          if (err.body?.details) throw new Error(err.body.details);
          else if (err.body?.errors) {
            if (d = err.body.errors.find(d => !!d.message)?.message) d = new Error(d);
          }
          throw d ?? err;
        });
        this.token = token;
        this.access_token = access_token;
        this.expires_in = expires_in;
        this.issued_at = issued_at;
        if (typeof expires_in === "number" && expires_in >= 1) {
          setTimeout(() => {
            Object.defineProperty(this, "token", {
              configurable: false,
              writable: false,
              value: new TypeError("Token exired"),
            });
          }, expires_in);
        }
        return;
      }
      let d: any;
      if (err.body?.details) throw new Error(err.body.details);
      else if (err.body?.errors) {
        if (d = err.body.errors.find(d => !!d.message)?.message) d = new Error(d);
      }
      throw d ?? err;
    });
    return this;
  }
}
